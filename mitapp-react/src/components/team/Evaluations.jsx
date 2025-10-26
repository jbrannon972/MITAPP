import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import firebaseService from '../../services/firebaseService';
import { Timestamp } from 'firebase/firestore';

const Evaluations = () => {
  const { currentUser } = useAuth();
  const { staffingData } = useData();
  const [viewMode, setViewMode] = useState('table');
  const [allEvaluations, setAllEvaluations] = useState({});
  const [techsWithEvals, setTechsWithEvals] = useState([]);
  const [filters, setFilters] = useState({ zone: 'all', category: 'all' });
  const [showEvalModal, setShowEvalModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [selectedTech, setSelectedTech] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [printSelection, setPrintSelection] = useState({});
  const [evalFormData, setEvalFormData] = useState({
    technicianId: '',
    evaluationDate: new Date().toISOString().split('T')[0],
    ratings: {
      leadership: '',
      culture: '',
      jobfit: '',
      integrity: '',
      people: '',
      workethic: '',
      excellence: '',
      longevity: ''
    },
    trainingOpportunities: '',
    observations: '',
    developmentPlan: '',
    planDocumentLink: '',
    planStart: '',
    planEnd: ''
  });

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
    const userId = currentUser?.id || currentUser?.uid;
    let allStaff = getAllTechnicians();

    // Filter based on user role
    if (userRole === 'Supervisor' || userRole === 'MIT Lead') {
      // Can see all techs AND themselves, but NOT other Supervisors/MIT Leads
      allStaff = allStaff.filter(tech =>
        (tech.role !== 'Supervisor' && tech.role !== 'MIT Lead') || tech.id === userId
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

  const openEvalModal = (tech = null) => {
    if (tech) {
      // Pre-select the employee but start with blank form for new evaluation
      setSelectedTech(tech);
      setEvalFormData({
        technicianId: tech.id,
        evaluationDate: new Date().toISOString().split('T')[0],
        ratings: {
          leadership: '', culture: '', jobfit: '', integrity: '',
          people: '', workethic: '', excellence: '', longevity: ''
        },
        trainingOpportunities: '',
        observations: '',
        developmentPlan: '',
        planDocumentLink: '',
        planStart: '',
        planEnd: ''
      });
    } else {
      setSelectedTech(null);
      setEvalFormData({
        technicianId: '',
        evaluationDate: new Date().toISOString().split('T')[0],
        ratings: {
          leadership: '', culture: '', jobfit: '', integrity: '',
          people: '', workethic: '', excellence: '', longevity: ''
        },
        trainingOpportunities: '',
        observations: '',
        developmentPlan: '',
        planDocumentLink: '',
        planStart: '',
        planEnd: ''
      });
    }
    setShowEvalModal(true);
  };

  const saveEvaluation = async () => {
    try {
      // Validate required fields
      if (!evalFormData.technicianId) {
        alert('Please select a technician');
        return;
      }

      const ratingFields = ['leadership', 'culture', 'jobfit', 'integrity', 'people', 'workethic', 'excellence', 'longevity'];
      for (const field of ratingFields) {
        if (!evalFormData.ratings[field]) {
          alert(`Please provide a rating for "${field}"`);
          return;
        }
      }

      const tech = getAllTechnicians().find(t => t.id === evalFormData.technicianId);

      const evaluationData = {
        technicianId: evalFormData.technicianId,
        employeeName: tech?.name || '',
        evaluatorName: currentUser?.username || currentUser?.email || 'Unknown',
        createdAt: Timestamp.fromDate(new Date(evalFormData.evaluationDate)),
        ratings: evalFormData.ratings,
        trainingOpportunities: evalFormData.trainingOpportunities.trim(),
        observations: evalFormData.observations.trim(),
        developmentPlan: evalFormData.developmentPlan,
        planDocumentLink: evalFormData.planDocumentLink.trim(),
        planStart: evalFormData.planStart ? Timestamp.fromDate(new Date(evalFormData.planStart)) : null,
        planEnd: evalFormData.planEnd ? Timestamp.fromDate(new Date(evalFormData.planEnd)) : null
      };

      await firebaseService.addDocument('technician-evaluations', evaluationData);
      alert('Evaluation saved successfully!');
      setShowEvalModal(false);
      await loadEvaluations(); // Reload
    } catch (error) {
      console.error('Error saving evaluation:', error);
      alert('Error saving evaluation. Please try again.');
    }
  };

  const viewHistory = async (tech) => {
    setSelectedTech(tech);
    setShowHistoryModal(true);

    try {
      const allEvals = await firebaseService.getCollection('technician-evaluations');
      const techEvals = allEvals
        .filter(e => e.technicianId === tech.id)
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setHistoryData(techEvals);
    } catch (error) {
      console.error('Error loading history:', error);
      setHistoryData([]);
    }
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

  const openPrintModal = () => {
    const allStaff = getAllTechnicians();
    const supervisors = allStaff.filter(tech => tech.role === 'Supervisor' || tech.role === 'MIT Lead');
    const technicians = allStaff.filter(tech => tech.role !== 'Supervisor' && tech.role !== 'MIT Lead' && tech.role !== 'Manager');

    // Initialize all as selected
    const initialSelection = {};
    [...supervisors, ...technicians].forEach(emp => {
      initialSelection[emp.id] = true;
    });

    setPrintSelection(initialSelection);
    setShowPrintModal(true);
  };

  const togglePrintSelection = (empId) => {
    setPrintSelection(prev => ({
      ...prev,
      [empId]: !prev[empId]
    }));
  };

  const toggleAllInCategory = (employees, value) => {
    const updates = {};
    employees.forEach(emp => {
      updates[emp.id] = value;
    });
    setPrintSelection(prev => ({ ...prev, ...updates }));
  };

  const printEvaluationReport = () => {
    const selectedIds = Object.keys(printSelection).filter(id => printSelection[id]);
    const allStaff = getAllTechnicians();
    const selectedStaff = allStaff.filter(s => selectedIds.includes(s.id));

    const supervisors = selectedStaff.filter(tech => tech.role === 'Supervisor' || tech.role === 'MIT Lead');
    const technicians = selectedStaff.filter(tech => tech.role !== 'Supervisor' && tech.role !== 'MIT Lead' && tech.role !== 'Manager');

    const generateReportTable = (employeeList, groupName) => {
      if (employeeList.length === 0) return '<p>No employees selected in this category.</p>';

      let employeesWithEvals = employeeList
        .map(tech => {
          const latestEval = allEvaluations[tech.id] || null;
          const averageScore = latestEval ? calculateScore(latestEval.ratings) : null;
          return { ...tech, latestEval, averageScore };
        })
        .filter(t => t.averageScore !== null);

      employeesWithEvals.sort((a, b) => b.averageScore - a.averageScore);

      const totalEmployees = employeesWithEvals.length;
      const top20Count = Math.ceil(totalEmployees * 0.2);
      let bottom10Count = Math.ceil(totalEmployees * 0.1);

      if (totalEmployees > 0 && bottom10Count === 0) {
        bottom10Count = 1;
      }

      const rankedEmployees = employeesWithEvals.map((tech, index) => {
        let category;
        if (index < top20Count) category = '20';
        else if (index >= totalEmployees - bottom10Count) category = '10';
        else category = '70';
        return { ...tech, category };
      });

      return `
        <table class="data-table" style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
          <thead>
            <tr>
              <th style="border: 1px solid var(--border-color); padding: 8px; background-color: var(--surface-tertiary);">Employee</th>
              <th style="border: 1px solid var(--border-color); padding: 8px; background-color: var(--surface-tertiary);">Category</th>
              <th style="border: 1px solid var(--border-color); padding: 8px; background-color: var(--surface-tertiary);">Avg. Score</th>
              <th style="border: 1px solid var(--border-color); padding: 8px; background-color: var(--surface-tertiary);">Leadership</th>
              <th style="border: 1px solid var(--border-color); padding: 8px; background-color: var(--surface-tertiary);">Culture</th>
              <th style="border: 1px solid var(--border-color); padding: 8px; background-color: var(--surface-tertiary);">Jobfit</th>
              <th style="border: 1px solid var(--border-color); padding: 8px; background-color: var(--surface-tertiary);">Integrity</th>
              <th style="border: 1px solid var(--border-color); padding: 8px; background-color: var(--surface-tertiary);">People</th>
              <th style="border: 1px solid var(--border-color); padding: 8px; background-color: var(--surface-tertiary);">Workethic</th>
              <th style="border: 1px solid var(--border-color); padding: 8px; background-color: var(--surface-tertiary);">Excellence</th>
              <th style="border: 1px solid var(--border-color); padding: 8px; background-color: var(--surface-tertiary);">Longevity</th>
              <th style="border: 1px solid var(--border-color); padding: 8px; background-color: var(--surface-tertiary);">Last Evaluated</th>
            </tr>
          </thead>
          <tbody>
            ${rankedEmployees.map(tech => `
              <tr>
                <td style="border: 1px solid var(--border-color); padding: 8px;">${tech.name}</td>
                <td style="border: 1px solid var(--border-color); padding: 8px; text-align: center; font-weight: bold;">${tech.category}</td>
                <td style="border: 1px solid var(--border-color); padding: 8px; text-align: center;">${tech.averageScore.toFixed(2)}</td>
                <td style="border: 1px solid var(--border-color); padding: 8px; text-align: center;">${tech.latestEval.ratings.leadership || 'N/A'}</td>
                <td style="border: 1px solid var(--border-color); padding: 8px; text-align: center;">${tech.latestEval.ratings.culture || 'N/A'}</td>
                <td style="border: 1px solid var(--border-color); padding: 8px; text-align: center;">${tech.latestEval.ratings.jobfit || 'N/A'}</td>
                <td style="border: 1px solid var(--border-color); padding: 8px; text-align: center;">${tech.latestEval.ratings.integrity || 'N/A'}</td>
                <td style="border: 1px solid var(--border-color); padding: 8px; text-align: center;">${tech.latestEval.ratings.people || 'N/A'}</td>
                <td style="border: 1px solid var(--border-color); padding: 8px; text-align: center;">${tech.latestEval.ratings.workethic || 'N/A'}</td>
                <td style="border: 1px solid var(--border-color); padding: 8px; text-align: center;">${tech.latestEval.ratings.excellence || 'N/A'}</td>
                <td style="border: 1px solid var(--border-color); padding: 8px; text-align: center;">${tech.latestEval.ratings.longevity || 'N/A'}</td>
                <td style="border: 1px solid var(--border-color); padding: 8px;">${formatDate(tech.latestEval?.createdAt)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    };

    const printWindow = window.open('', '_blank');
    const reportDate = new Date().toLocaleDateString();

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>20/70/10 Report - ${reportDate}</title>
          <style>
            body {
              background-color: var(--surface-color);
              font-family: Arial, sans-serif;
              padding: 20px;
              color: var(--text-primary);
            }
            .print-page {
              page-break-after: always;
              padding: 20px 0;
            }
            .print-page:last-child {
              page-break-after: avoid;
            }
            h1 {
              font-size: 24px;
              margin-bottom: 10px;
              color: var(--text-primary);
            }
            h2 {
              font-size: 20px;
              margin-bottom: 20px;
              color: var(--text-primary);
              border-bottom: 2px solid var(--text-primary);
              padding-bottom: 10px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 30px;
            }
            th, td {
              border: 1px solid var(--border-color);
              padding: 8px;
              text-align: left;
            }
            th {
              background-color: var(--surface-tertiary);
              font-weight: bold;
            }
            .report-header {
              text-align: center;
              margin-bottom: 30px;
            }
            @media print {
              body { margin: 0; padding: 10px; }
              .print-page { page-break-after: always; }
            }
          </style>
        </head>
        <body>
          <div class="report-header">
            <h1>20/70/10 Evaluation Report</h1>
            <p>Generated: ${reportDate}</p>
          </div>

          <div class="print-page">
            <h2>Supervisors & Leads</h2>
            ${generateReportTable(supervisors, 'Supervisors')}
          </div>

          <div class="print-page">
            <h2>Technicians</h2>
            ${generateReportTable(technicians, 'Technicians')}
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 250);

    setShowPrintModal(false);
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
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button className="btn btn-secondary btn-small" onClick={() => viewHistory(tech)}>
                    History
                  </button>
                  <button className="btn btn-primary btn-small" onClick={() => openEvalModal(tech)}>
                    New Eval
                  </button>
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
              <th style={{ textAlign: 'right' }}>Actions</th>
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
                    <td data-label="Actions" style={{ textAlign: 'right' }}>
                      <button className="btn btn-secondary btn-small" onClick={() => viewHistory(tech)} style={{ marginRight: '8px' }}>
                        History
                      </button>
                      <button className="btn btn-primary btn-small" onClick={() => openEvalModal(tech)}>
                        New Eval
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '40px' }}>
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
          <button className="btn btn-secondary" onClick={openPrintModal}>
            <i className="fas fa-print"></i> Print Report
          </button>
          <button className="btn btn-primary" onClick={() => openEvalModal()}>
            <i className="fas fa-plus"></i> Add Eval
          </button>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'card' ? renderCardView() : renderTableView()}

      {/* Evaluation Form Modal */}
      {showEvalModal && (
        <div className="modal-overlay active" onClick={() => setShowEvalModal(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <i className="fas fa-clipboard-check"></i> {selectedTech ? `Edit Evaluation: ${selectedTech.name}` : 'New Evaluation'}
              </h3>
              <button className="modal-close" onClick={() => setShowEvalModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              {/* Employee Selection */}
              <div className="form-group">
                <label htmlFor="technicianId">Employee *</label>
                <select
                  id="technicianId"
                  className="form-input"
                  value={evalFormData.technicianId}
                  onChange={(e) => setEvalFormData({ ...evalFormData, technicianId: e.target.value })}
                  disabled={selectedTech !== null}
                >
                  <option value="">Select Employee...</option>
                  {getAllTechnicians().map(tech => (
                    <option key={tech.id} value={tech.id}>{tech.name} - {tech.role}</option>
                  ))}
                </select>
              </div>

              {/* Evaluation Date */}
              <div className="form-group">
                <label htmlFor="evaluationDate">Evaluation Date *</label>
                <input
                  type="date"
                  id="evaluationDate"
                  className="form-input"
                  value={evalFormData.evaluationDate}
                  onChange={(e) => setEvalFormData({ ...evalFormData, evaluationDate: e.target.value })}
                />
              </div>

              {/* Ratings Section */}
              <h4 style={{ fontSize: '16px', marginTop: '20px', marginBottom: '12px', color: 'var(--primary-color)', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                <i className="fas fa-star"></i> Ratings (1-4 scale) *
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label htmlFor="leadership">Leadership</label>
                  <select
                    id="leadership"
                    className="form-input"
                    value={evalFormData.ratings.leadership}
                    onChange={(e) => setEvalFormData({
                      ...evalFormData,
                      ratings: { ...evalFormData.ratings, leadership: e.target.value }
                    })}
                  >
                    <option value="">Select...</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="culture">Culture</label>
                  <select
                    id="culture"
                    className="form-input"
                    value={evalFormData.ratings.culture}
                    onChange={(e) => setEvalFormData({
                      ...evalFormData,
                      ratings: { ...evalFormData.ratings, culture: e.target.value }
                    })}
                  >
                    <option value="">Select...</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="jobfit">Job Fit</label>
                  <select
                    id="jobfit"
                    className="form-input"
                    value={evalFormData.ratings.jobfit}
                    onChange={(e) => setEvalFormData({
                      ...evalFormData,
                      ratings: { ...evalFormData.ratings, jobfit: e.target.value }
                    })}
                  >
                    <option value="">Select...</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="integrity">Integrity</label>
                  <select
                    id="integrity"
                    className="form-input"
                    value={evalFormData.ratings.integrity}
                    onChange={(e) => setEvalFormData({
                      ...evalFormData,
                      ratings: { ...evalFormData.ratings, integrity: e.target.value }
                    })}
                  >
                    <option value="">Select...</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="people">People</label>
                  <select
                    id="people"
                    className="form-input"
                    value={evalFormData.ratings.people}
                    onChange={(e) => setEvalFormData({
                      ...evalFormData,
                      ratings: { ...evalFormData.ratings, people: e.target.value }
                    })}
                  >
                    <option value="">Select...</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="workethic">Work Ethic</label>
                  <select
                    id="workethic"
                    className="form-input"
                    value={evalFormData.ratings.workethic}
                    onChange={(e) => setEvalFormData({
                      ...evalFormData,
                      ratings: { ...evalFormData.ratings, workethic: e.target.value }
                    })}
                  >
                    <option value="">Select...</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="excellence">Excellence</label>
                  <select
                    id="excellence"
                    className="form-input"
                    value={evalFormData.ratings.excellence}
                    onChange={(e) => setEvalFormData({
                      ...evalFormData,
                      ratings: { ...evalFormData.ratings, excellence: e.target.value }
                    })}
                  >
                    <option value="">Select...</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="longevity">Longevity</label>
                  <select
                    id="longevity"
                    className="form-input"
                    value={evalFormData.ratings.longevity}
                    onChange={(e) => setEvalFormData({
                      ...evalFormData,
                      ratings: { ...evalFormData.ratings, longevity: e.target.value }
                    })}
                  >
                    <option value="">Select...</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                  </select>
                </div>
              </div>

              {/* Additional Details */}
              <h4 style={{ fontSize: '16px', marginTop: '20px', marginBottom: '12px', color: 'var(--primary-color)', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                <i className="fas fa-clipboard-list"></i> Additional Details
              </h4>
              <div className="form-group">
                <label htmlFor="trainingOpportunities">Training Opportunities</label>
                <textarea
                  id="trainingOpportunities"
                  className="form-input"
                  rows="3"
                  value={evalFormData.trainingOpportunities}
                  onChange={(e) => setEvalFormData({ ...evalFormData, trainingOpportunities: e.target.value })}
                  placeholder="List any training opportunities or areas for improvement..."
                />
              </div>
              <div className="form-group">
                <label htmlFor="observations">Observations</label>
                <textarea
                  id="observations"
                  className="form-input"
                  rows="3"
                  value={evalFormData.observations}
                  onChange={(e) => setEvalFormData({ ...evalFormData, observations: e.target.value })}
                  placeholder="General observations about performance..."
                />
              </div>

              {/* Development Plan */}
              <h4 style={{ fontSize: '16px', marginTop: '20px', marginBottom: '12px', color: 'var(--primary-color)', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                <i className="fas fa-road"></i> Development Plan
              </h4>
              <div className="form-group">
                <label htmlFor="developmentPlan">Plan Type</label>
                <select
                  id="developmentPlan"
                  className="form-input"
                  value={evalFormData.developmentPlan}
                  onChange={(e) => setEvalFormData({ ...evalFormData, developmentPlan: e.target.value })}
                >
                  <option value="">None</option>
                  <option value="Training Plan">Training Plan</option>
                  <option value="IDP">Individual Development Plan (IDP)</option>
                  <option value="PIP">Performance Improvement Plan (PIP)</option>
                </select>
              </div>
              {evalFormData.developmentPlan && (
                <>
                  <div className="form-group">
                    <label htmlFor="planDocumentLink">Plan Document Link</label>
                    <input
                      type="text"
                      id="planDocumentLink"
                      className="form-input"
                      value={evalFormData.planDocumentLink}
                      onChange={(e) => setEvalFormData({ ...evalFormData, planDocumentLink: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div className="form-group">
                      <label htmlFor="planStart">Plan Start Date</label>
                      <input
                        type="date"
                        id="planStart"
                        className="form-input"
                        value={evalFormData.planStart}
                        onChange={(e) => setEvalFormData({ ...evalFormData, planStart: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="planEnd">Plan End Date</label>
                      <input
                        type="date"
                        id="planEnd"
                        className="form-input"
                        value={evalFormData.planEnd}
                        onChange={(e) => setEvalFormData({ ...evalFormData, planEnd: e.target.value })}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowEvalModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={saveEvaluation}>
                <i className="fas fa-save"></i> Save Evaluation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <div className="modal-overlay active" onClick={() => setShowHistoryModal(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <i className="fas fa-history"></i> Evaluation History: {selectedTech?.name}
              </h3>
              <button className="modal-close" onClick={() => setShowHistoryModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              {historyData.length > 0 ? (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Avg Score</th>
                        <th>Evaluator</th>
                        <th>Development Plan</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyData.map((evalRecord, index) => {
                        const avgScore = calculateScore(evalRecord.ratings);
                        return (
                          <tr key={index}>
                            <td data-label="Date">{formatDate(evalRecord.createdAt)}</td>
                            <td data-label="Avg Score">
                              <strong style={{ fontSize: '16px', color: 'var(--primary-color)' }}>
                                {avgScore ? avgScore.toFixed(2) : 'N/A'}
                              </strong>
                            </td>
                            <td data-label="Evaluator">{evalRecord.evaluatorName || 'Unknown'}</td>
                            <td data-label="Development Plan">
                              {evalRecord.developmentPlan || 'None'}
                            </td>
                            <td data-label="Actions">
                              <button
                                className="btn btn-secondary btn-small"
                                onClick={() => {
                                  setEvalFormData({
                                    technicianId: selectedTech.id,
                                    evaluationDate: evalRecord.createdAt ?
                                      new Date(evalRecord.createdAt.seconds * 1000).toISOString().split('T')[0] :
                                      new Date().toISOString().split('T')[0],
                                    ratings: evalRecord.ratings || {
                                      leadership: '', culture: '', jobfit: '', integrity: '',
                                      people: '', workethic: '', excellence: '', longevity: ''
                                    },
                                    trainingOpportunities: evalRecord.trainingOpportunities || '',
                                    observations: evalRecord.observations || '',
                                    developmentPlan: evalRecord.developmentPlan || '',
                                    planDocumentLink: evalRecord.planDocumentLink || '',
                                    planStart: evalRecord.planStart ?
                                      new Date(evalRecord.planStart.seconds * 1000).toISOString().split('T')[0] : '',
                                    planEnd: evalRecord.planEnd ?
                                      new Date(evalRecord.planEnd.seconds * 1000).toISOString().split('T')[0] : ''
                                  });
                                  setShowHistoryModal(false);
                                  setShowEvalModal(true);
                                }}
                              >
                                <i className="fas fa-eye"></i> View
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                  No evaluation history found for this employee.
                </p>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowHistoryModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Selection Modal */}
      {showPrintModal && (
        <div className="modal-overlay active" onClick={() => setShowPrintModal(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <i className="fas fa-print"></i> Print 20/70/10 Report
              </h3>
              <button className="modal-close" onClick={() => setShowPrintModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '20px', color: 'var(--text-secondary)' }}>
                Select the employees to include in the report. The report will separate Supervisors/Leads and Technicians into different sections, each with their own 20/70/10 rankings.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
                {/* Supervisors Column */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '8px', borderBottom: '2px solid var(--primary-color)' }}>
                    <h4 style={{ margin: 0, fontSize: '16px', color: 'var(--primary-color)' }}>
                      <i className="fas fa-user-tie"></i> Supervisors & Leads
                    </h4>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="btn btn-secondary btn-small"
                        onClick={() => {
                          const supervisors = getAllTechnicians().filter(tech => tech.role === 'Supervisor' || tech.role === 'MIT Lead');
                          toggleAllInCategory(supervisors, true);
                        }}
                      >
                        All
                      </button>
                      <button
                        className="btn btn-secondary btn-small"
                        onClick={() => {
                          const supervisors = getAllTechnicians().filter(tech => tech.role === 'Supervisor' || tech.role === 'MIT Lead');
                          toggleAllInCategory(supervisors, false);
                        }}
                      >
                        None
                      </button>
                    </div>
                  </div>
                  <div style={{ maxHeight: '400px', overflowY: 'auto', padding: '8px' }}>
                    {getAllTechnicians()
                      .filter(tech => tech.role === 'Supervisor' || tech.role === 'MIT Lead')
                      .map(emp => (
                        <div key={emp.id} style={{ marginBottom: '8px', display: 'flex', alignItems: 'center' }}>
                          <input
                            type="checkbox"
                            id={`print-check-${emp.id}`}
                            checked={printSelection[emp.id] || false}
                            onChange={() => togglePrintSelection(emp.id)}
                            style={{ marginRight: '8px', width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                          <label
                            htmlFor={`print-check-${emp.id}`}
                            style={{ cursor: 'pointer', fontSize: '14px', userSelect: 'none' }}
                          >
                            {emp.name}
                          </label>
                        </div>
                      ))
                    }
                  </div>
                </div>

                {/* Technicians Column */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '8px', borderBottom: '2px solid var(--primary-color)' }}>
                    <h4 style={{ margin: 0, fontSize: '16px', color: 'var(--primary-color)' }}>
                      <i className="fas fa-users"></i> Technicians
                    </h4>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="btn btn-secondary btn-small"
                        onClick={() => {
                          const technicians = getAllTechnicians().filter(tech => tech.role !== 'Supervisor' && tech.role !== 'MIT Lead' && tech.role !== 'Manager');
                          toggleAllInCategory(technicians, true);
                        }}
                      >
                        All
                      </button>
                      <button
                        className="btn btn-secondary btn-small"
                        onClick={() => {
                          const technicians = getAllTechnicians().filter(tech => tech.role !== 'Supervisor' && tech.role !== 'MIT Lead' && tech.role !== 'Manager');
                          toggleAllInCategory(technicians, false);
                        }}
                      >
                        None
                      </button>
                    </div>
                  </div>
                  <div style={{ maxHeight: '400px', overflowY: 'auto', padding: '8px' }}>
                    {getAllTechnicians()
                      .filter(tech => tech.role !== 'Supervisor' && tech.role !== 'MIT Lead' && tech.role !== 'Manager')
                      .map(emp => (
                        <div key={emp.id} style={{ marginBottom: '8px', display: 'flex', alignItems: 'center' }}>
                          <input
                            type="checkbox"
                            id={`print-check-${emp.id}`}
                            checked={printSelection[emp.id] || false}
                            onChange={() => togglePrintSelection(emp.id)}
                            style={{ marginRight: '8px', width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                          <label
                            htmlFor={`print-check-${emp.id}`}
                            style={{ cursor: 'pointer', fontSize: '14px', userSelect: 'none' }}
                          >
                            {emp.name}
                          </label>
                        </div>
                      ))
                    }
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowPrintModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={printEvaluationReport}>
                <i className="fas fa-print"></i> Print
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Evaluations;
