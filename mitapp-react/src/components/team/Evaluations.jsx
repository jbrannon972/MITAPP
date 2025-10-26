import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import firebaseService from '../../services/firebaseService';

const Evaluations = () => {
  const { currentUser } = useAuth();
  const { staffingData } = useData();
  const [viewMode, setViewMode] = useState('table');
  const [allEvaluations, setAllEvaluations] = useState({});
  const [techsWithEvals, setTechsWithEvals] = useState([]);
  const [filters, setFilters] = useState({ zone: 'all', category: 'all' });

  useEffect(() => {
    loadEvaluations();
  }, []);

  useEffect(() => {
    if (Object.keys(allEvaluations).length > 0 && staffingData?.zones) {
      processAndDisplayTechnicians();
    }
  }, [allEvaluations, staffingData, filters]);

  const loadEvaluations = async () => {
    try {
      const evaluations = await firebaseService.getCollection('technician-evaluations');

      // Group by technicianId and keep only the latest
      const latestEvals = {};
      evaluations.forEach(evaluation => {
        const techId = evaluation.technicianId;
        if (techId) {
          if (!latestEvals[techId] ||
              (evaluation.createdAt?.seconds > latestEvals[techId].createdAt?.seconds)) {
            latestEvals[techId] = evaluation;
          }
        }
      });

      setAllEvaluations(latestEvals);
    } catch (error) {
      console.error('Error loading evaluations:', error);
    }
  };

  const getAllTechnicians = () => {
    if (!staffingData?.zones) return [];
    const techs = [];
    staffingData.zones.forEach(zone => {
      if (zone.lead && zone.lead.role !== 'Manager') techs.push({ ...zone.lead, zoneName: zone.name });
      if (zone.members) {
        zone.members.forEach(member => {
          if (member.role !== 'Manager') {
            techs.push({ ...member, zoneName: zone.name });
          }
        });
      }
    });
    return techs;
  };

  const calculateScore = (ratings) => {
    if (!ratings || Object.keys(ratings).length < 8) return null;
    const values = Object.values(ratings).map(v => parseInt(v || 0));
    const total = values.reduce((sum, val) => sum + val, 0);
    return total / values.length;
  };

  const processAndDisplayTechnicians = () => {
    const userRole = currentUser?.role;
    let allStaff = getAllTechnicians();

    // Filter based on user role
    if (userRole === 'Supervisor' || userRole === 'MIT Lead') {
      allStaff = allStaff.filter(tech =>
        tech.role !== 'Supervisor' && tech.role !== 'MIT Lead'
      );
    }

    // Map technicians with their evaluation data
    let employeesWithEvals = allStaff
      .map(tech => {
        const latestEval = allEvaluations[tech.id] || null;
        const averageScore = latestEval ? calculateScore(latestEval.ratings) : null;
        return {
          ...tech,
          latestEvaluation: latestEval,
          averageScore,
          zoneName: tech.zoneName || 'N/A'
        };
      })
      .filter(t => t.averageScore !== null);

    // Sort by score descending
    employeesWithEvals.sort((a, b) => b.averageScore - a.averageScore);

    // Assign categories based on ranking
    const totalEmployees = employeesWithEvals.length;
    const top20Count = Math.ceil(totalEmployees * 0.2);
    let bottom10Count = Math.ceil(totalEmployees * 0.1);

    if (totalEmployees > 0 && bottom10Count === 0) {
      bottom10Count = 1;
    }

    const categorized = employeesWithEvals.map((tech, index) => {
      let category;
      if (index < top20Count) {
        category = '20';
      } else if (index >= totalEmployees - bottom10Count) {
        category = '10';
      } else {
        category = '70';
      }
      return { ...tech, category };
    });

    // Add technicians without evaluations
    const techsWithEvalsIds = new Set(categorized.map(t => t.id));
    const techsWithoutEvals = allStaff
      .filter(t => !techsWithEvalsIds.has(t.id))
      .map(tech => ({
        ...tech,
        latestEvaluation: null,
        category: null,
        averageScore: null,
        zoneName: tech.zoneName || 'N/A'
      }));

    let finalList = [...categorized, ...techsWithoutEvals];

    // Apply filters
    if (filters.zone !== 'all') {
      finalList = finalList.filter(t => t.zoneName === filters.zone);
    }
    if (filters.category !== 'all') {
      finalList = finalList.filter(t => t.category === filters.category);
    }

    setTechsWithEvals(finalList);
  };

  const getZones = () => {
    if (!staffingData?.zones) return [];
    return [...new Set(staffingData.zones.map(z => z.name))];
  };

  const getCategoryBadge = (category) => {
    if (!category) return { text: 'No Eval', class: 'badge-secondary' };
    if (category === '20') return { text: '20', class: 'badge-success' };
    if (category === '70') return { text: '70', class: 'badge-warning' };
    if (category === '10') return { text: '10', class: 'badge-danger' };
    return { text: 'N/A', class: 'badge-secondary' };
  };

  const formatDate = (timestamp) => {
    if (!timestamp || !timestamp.seconds) return 'N/A';
    return new Date(timestamp.seconds * 1000).toLocaleDateString();
  };

  const renderCardView = () => {
    return (
      <div className="cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
        {techsWithEvals.length > 0 ? (
          techsWithEvals.map(tech => {
            const badge = getCategoryBadge(tech.category);
            return (
              <div key={tech.id} className="card" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                  <h4 style={{ margin: 0, fontSize: '16px' }}>{tech.name}</h4>
                  <span className={`badge ${badge.class}`} style={{ padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>
                    {badge.text}
                  </span>
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  <p style={{ margin: '4px 0' }}><strong>Role:</strong> {tech.role}</p>
                  <p style={{ margin: '4px 0' }}><strong>Zone:</strong> {tech.zoneName}</p>
                  {tech.averageScore !== null ? (
                    <>
                      <p style={{ margin: '4px 0' }}>
                        <strong>Avg Score:</strong>
                        <span style={{ fontSize: '18px', fontWeight: '700', marginLeft: '8px', color: 'var(--primary-color)' }}>
                          {tech.averageScore.toFixed(2)}
                        </span>
                      </p>
                      <p style={{ margin: '4px 0' }}><strong>Last Evaluated:</strong> {formatDate(tech.latestEvaluation?.createdAt)}</p>
                    </>
                  ) : (
                    <p style={{ margin: '4px 0', fontStyle: 'italic' }}>No evaluation on record</p>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <p style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
            No technicians match the selected filters.
          </p>
        )}
      </div>
    );
  };

  const renderTableView = () => {
    return (
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Category</th>
              <th>Avg. Score</th>
              <th>Zone</th>
              <th>Role</th>
              <th>Last Evaluated</th>
            </tr>
          </thead>
          <tbody>
            {techsWithEvals.length > 0 ? (
              techsWithEvals.map(tech => {
                const badge = getCategoryBadge(tech.category);
                return (
                  <tr key={tech.id}>
                    <td data-label="Employee"><strong>{tech.name}</strong></td>
                    <td data-label="Category">
                      <span className={`badge ${badge.class}`} style={{ padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>
                        {badge.text}
                      </span>
                    </td>
                    <td data-label="Avg. Score">
                      {tech.averageScore !== null ? (
                        <strong style={{ fontSize: '16px', color: 'var(--primary-color)' }}>
                          {tech.averageScore.toFixed(2)}
                        </strong>
                      ) : (
                        <span style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>N/A</span>
                      )}
                    </td>
                    <td data-label="Zone">{tech.zoneName}</td>
                    <td data-label="Role">{tech.role}</td>
                    <td data-label="Last Evaluated">{formatDate(tech.latestEvaluation?.createdAt)}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '40px' }}>
                  No technicians match the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div>
      {/* Controls Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: '500' }}>Zone:</span>
            <select
              className="form-input"
              style={{ width: 'auto', minWidth: '150px' }}
              value={filters.zone}
              onChange={(e) => setFilters({ ...filters, zone: e.target.value })}
            >
              <option value="all">All Zones</option>
              {getZones().map(zone => (
                <option key={zone} value={zone}>{zone}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: '500' }}>Category:</span>
            <select
              className="form-input"
              style={{ width: 'auto', minWidth: '120px' }}
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
            >
              <option value="all">All</option>
              <option value="20">20</option>
              <option value="70">70</option>
              <option value="10">10</option>
            </select>
          </div>

          <button
            className="btn btn-secondary btn-small"
            onClick={() => setFilters({ zone: 'all', category: 'all' })}
          >
            Clear
          </button>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <div className="sub-nav">
            <button
              className={`sub-nav-btn ${viewMode === 'card' ? 'active' : ''}`}
              onClick={() => setViewMode('card')}
            >
              <i className="fas fa-grip-horizontal"></i> Cards
            </button>
            <button
              className={`sub-nav-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
            >
              <i className="fas fa-bars"></i> Table
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'card' ? renderCardView() : renderTableView()}
    </div>
  );
};

export default Evaluations;
