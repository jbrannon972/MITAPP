import { useState, useEffect } from 'react';
import { useData } from '../../contexts/DataContext';
import firebaseService from '../../services/firebaseService';

const CompletedRequestsView = () => {
  const { staffingData } = useData();
  const [requests, setRequests] = useState([]);
  const [filteredRequests, setFilteredRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTechId, setSelectedTechId] = useState('all');
  const [technicians, setTechnicians] = useState([]);

  useEffect(() => {
    loadTechnicians();
    loadCompletedRequests();
  }, []);

  useEffect(() => {
    filterRequests();
  }, [requests, selectedTechId]);

  const loadTechnicians = () => {
    if (staffingData && staffingData.zones) {
      const allTechs = staffingData.zones
        .flatMap(zone => [zone.lead, ...zone.members])
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name));
      setTechnicians(allTechs);
    }
  };

  const loadCompletedRequests = async () => {
    try {
      setLoading(true);
      const data = await firebaseService.getToolRequests('Completed');
      setRequests(data);
    } catch (error) {
      console.error('Error loading completed requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterRequests = () => {
    if (selectedTechId === 'all') {
      setFilteredRequests(requests);
    } else {
      setFilteredRequests(requests.filter(req => req.technicianId === selectedTechId));
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString();
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value || 0);
  };

  const totalCost = filteredRequests.reduce((sum, req) => sum + (req.toolCost || 0), 0);

  if (loading) {
    return (
      <div className="card">
        <div className="card-header">
          <h3><i className="fas fa-check-circle"></i> Completed Tool Requests</h3>
        </div>
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: '24px', color: 'var(--primary-color)' }}></i>
          <p style={{ marginTop: '12px', color: 'var(--text-secondary)' }}>Loading completed requests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3><i className="fas fa-check-circle"></i> Completed Tool Requests</h3>
        <div className="filter-controls">
          <label htmlFor="tech-filter" style={{ marginRight: '8px', fontWeight: '500' }}>
            Filter by Technician:
          </label>
          <select
            id="tech-filter"
            className="form-control"
            style={{ width: '200px' }}
            value={selectedTechId}
            onChange={(e) => setSelectedTechId(e.target.value)}
          >
            <option value="all">All Technicians</option>
            {technicians.map((tech) => (
              <option key={tech.id} value={tech.id}>
                {tech.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filteredRequests.length > 0 && (
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: 'var(--surface-secondary)',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            Showing <strong>{filteredRequests.length}</strong> completed {filteredRequests.length === 1 ? 'request' : 'requests'}
          </span>
          <span style={{ fontSize: '16px', fontWeight: '600', color: 'var(--success-color)' }}>
            Total Cost: {formatCurrency(totalCost)}
          </span>
        </div>
      )}

      <div className="table-container">
        {filteredRequests.length === 0 ? (
          <p style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            {requests.length === 0
              ? 'No completed requests found.'
              : 'No completed requests found for this filter.'}
          </p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Technician</th>
                <th>Tool</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map((request) => (
                <tr key={request.id}>
                  <td data-label="Date">{formatDate(request.completedAt || request.createdAt)}</td>
                  <td data-label="Technician">{request.technicianName || 'N/A'}</td>
                  <td data-label="Tool">{request.toolName || 'N/A'}</td>
                  <td data-label="Cost">{formatCurrency(request.toolCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default CompletedRequestsView;
