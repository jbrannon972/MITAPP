import { useState, useEffect } from 'react';
import firebaseService from '../../services/firebaseService';

const PendingRequestsView = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPendingRequests();
  }, []);

  const loadPendingRequests = async () => {
    try {
      setLoading(true);
      const data = await firebaseService.getToolRequests('Pending');
      setRequests(data);
    } catch (error) {
      console.error('Error loading pending requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteRequest = async (requestId) => {
    if (!window.confirm('Mark this request as completed?')) {
      return;
    }

    try {
      await firebaseService.updateToolRequestStatus(requestId, 'Completed');
      alert('Request marked as completed!');
      loadPendingRequests();
    } catch (error) {
      console.error('Error completing request:', error);
      alert('Error completing request. Please try again.');
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="card">
        <div className="card-header">
          <h3><i className="fas fa-clock"></i> Pending Tool Requests</h3>
        </div>
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: '24px', color: 'var(--primary-color)' }}></i>
          <p style={{ marginTop: '12px', color: 'var(--text-secondary)' }}>Loading pending requests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3><i className="fas fa-clock"></i> Pending Tool Requests</h3>
      </div>
      <div className="table-container">
        {requests.length === 0 ? (
          <p style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No pending tool requests found.
          </p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Technician</th>
                <th>Tool</th>
                <th>Reason</th>
                <th>Urgency</th>
                <th>Notes</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id}>
                  <td data-label="Date">{formatDate(request.createdAt)}</td>
                  <td data-label="Technician">{request.technicianName || 'N/A'}</td>
                  <td data-label="Tool">{request.toolName || 'N/A'}</td>
                  <td data-label="Reason">{request.reason || 'N/A'}</td>
                  <td data-label="Urgency">
                    <span className={`status-badge ${
                      request.urgency?.includes('High') ? 'status-danger' :
                      request.urgency?.includes('Medium') ? 'status-warning' :
                      'status-info'
                    }`}>
                      {request.urgency || 'N/A'}
                    </span>
                  </td>
                  <td data-label="Notes">{request.notes || 'N/A'}</td>
                  <td data-label="Actions" style={{ textAlign: 'right' }}>
                    <button
                      className="btn btn-primary btn-small"
                      onClick={() => handleCompleteRequest(request.id)}
                    >
                      <i className="fas fa-check"></i> Complete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default PendingRequestsView;
