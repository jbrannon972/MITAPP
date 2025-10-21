import { useState, useEffect } from 'react';
import Layout from '../components/common/Layout';
import firebaseService from '../services/firebaseService';

const InstallDpt = () => {
  const [jobsWithoutInstalls, setJobsWithoutInstalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeReport, setActiveReport] = useState(null);

  useEffect(() => {
    loadJobsData();
  }, []);

  const loadJobsData = async () => {
    try {
      setLoading(true);
      // Load jobs that are missing install records
      const data = await firebaseService.getDocument('hou_install_tracking', 'jobs_without_installs');

      if (data && data.jobs) {
        setJobsWithoutInstalls(data.jobs || []);
      }
    } catch (error) {
      console.error('Error loading install tracking data:', error);
    } finally {
      setLoading(false);
    }
  };

  const showSecondShiftReport = () => {
    setActiveReport('second-shift');
  };

  const showInstallWindowReport = () => {
    setActiveReport('install-window');
  };

  if (loading) {
    return (
      <Layout>
        <div className="tab-content active">
          <p>Loading install department data...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="tab-content active">
        <div className="tab-header">
          <h2>Install Department</h2>
          <div className="tab-controls">
            <button className="btn btn-info" onClick={showSecondShiftReport}>
              <i className="fas fa-moon"></i> Second Shift Report
            </button>
            <button className="btn btn-secondary" onClick={showInstallWindowReport}>
              <i className="fas fa-calendar-alt"></i> Install Window Report
            </button>
          </div>
        </div>

        {activeReport === 'second-shift' && (
          <div className="card" style={{ marginTop: '24px', backgroundColor: '#eff6ff', border: '1px solid #3b82f6' }}>
            <div className="card-header" style={{ backgroundColor: '#dbeafe' }}>
              <h3><i className="fas fa-moon"></i> Second Shift Report</h3>
            </div>
            <div style={{ padding: '20px' }}>
              <p>
                The Second Shift Report has been moved to the Dashboard page.
                Please visit the Dashboard to view and submit second shift reports.
              </p>
              <p style={{ marginTop: '12px' }}>
                <a href="/dashboard" className="btn btn-primary">
                  <i className="fas fa-arrow-right"></i> Go to Dashboard
                </a>
              </p>
            </div>
          </div>
        )}

        {activeReport === 'install-window' && (
          <div className="card" style={{ marginTop: '24px' }}>
            <div className="card-header">
              <h3><i className="fas fa-calendar-alt"></i> Install Window Report</h3>
            </div>
            <div style={{ padding: '20px' }}>
              <p>Install Window Report functionality coming soon.</p>
              <p style={{ marginTop: '12px', color: '#6b7280' }}>
                This will show scheduled install windows and help track installation timing.
              </p>
            </div>
          </div>
        )}

        <div className="card" style={{ marginTop: activeReport ? '24px' : '0' }}>
          <div className="card-header">
            <h3><i className="fas fa-exclamation-triangle"></i> Jobs Missing Install Records</h3>
            <span style={{ fontSize: '14px', color: '#6b7280' }}>
              {jobsWithoutInstalls.length} jobs need attention
            </span>
          </div>
          <div className="table-container">
            {jobsWithoutInstalls.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Job Number</th>
                    <th>Customer Name</th>
                    <th>Address</th>
                    <th>City</th>
                    <th>Job Type</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobsWithoutInstalls.map((job, index) => (
                    <tr key={job.id || index}>
                      <td><strong>{job.jobNumber || 'N/A'}</strong></td>
                      <td>{job.customerName || 'N/A'}</td>
                      <td>{job.address || 'N/A'}</td>
                      <td>{job.city || 'N/A'}</td>
                      <td>{job.jobType || 'N/A'}</td>
                      <td>
                        <span className={`status-badge status-${(job.status || 'unknown').toLowerCase().replace(' ', '-')}`}>
                          {job.status || 'Unknown'}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-primary btn-small" disabled title="Coming soon">
                          <i className="fas fa-plus"></i> Add Install
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ padding: '20px', textAlign: 'center' }}>
                All jobs have install records. Great work! 🎉
              </p>
            )}
          </div>
        </div>

        <div className="card" style={{ marginTop: '24px' }}>
          <div className="card-header">
            <h3><i className="fas fa-info-circle"></i> Install Department Overview</h3>
          </div>
          <div style={{ padding: '20px' }}>
            <div className="dashboard-grid">
              <div className="metric-card">
                <div className="metric-header">
                  <h3><i className="fas fa-clipboard-list"></i> Total Jobs</h3>
                </div>
                <div className="metric-value">{jobsWithoutInstalls.length}</div>
                <div className="metric-label">Jobs Missing Install Records</div>
              </div>

              <div className="metric-card">
                <div className="metric-header">
                  <h3><i className="fas fa-calendar-check"></i> This Week</h3>
                </div>
                <div className="metric-value">-</div>
                <div className="metric-label">Scheduled Installs</div>
              </div>

              <div className="metric-card">
                <div className="metric-header">
                  <h3><i className="fas fa-check-circle"></i> Completed</h3>
                </div>
                <div className="metric-value">-</div>
                <div className="metric-label">This Month</div>
              </div>
            </div>

            <div style={{ marginTop: '20px', padding: '16px', backgroundColor: '#f3f4f6', borderRadius: '8px' }}>
              <h4 style={{ marginBottom: '8px' }}><i className="fas fa-lightbulb"></i> Quick Actions</h4>
              <ul style={{ marginLeft: '20px', lineHeight: '1.8' }}>
                <li>Review jobs missing install records in the table above</li>
                <li>Generate install window reports to track upcoming installations</li>
                <li>Check second shift reports on the Dashboard for daily updates</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default InstallDpt;
