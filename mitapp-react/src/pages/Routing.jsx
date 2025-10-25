import { useState, useEffect } from 'react';
import Layout from '../components/common/Layout';
import { useData } from '../contexts/DataContext';
import firebaseService from '../services/firebaseService';

const Routing = () => {
  const { staffingData } = useData();
  const [activeView, setActiveView] = useState('jobs');
  const [jobs, setJobs] = useState([]);
  const [routes, setRoutes] = useState({});
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedTech, setSelectedTech] = useState(null);

  // Office locations
  const offices = {
    office_1: { name: 'West Palm Beach Office', address: 'West Palm Beach, FL' },
    office_2: { name: 'Fort Lauderdale Office', address: 'Fort Lauderdale, FL' }
  };

  useEffect(() => {
    loadJobs();
    loadRoutes();
  }, [selectedDate]);

  const loadJobs = async () => {
    try {
      setLoading(true);
      const data = await firebaseService.getDocument('hou_routing', `jobs_${selectedDate}`);
      setJobs(data?.jobs || []);
    } catch (error) {
      console.error('Error loading jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRoutes = async () => {
    try {
      const data = await firebaseService.getDocument('hou_routing', `routes_${selectedDate}`);
      setRoutes(data?.routes || {});
    } catch (error) {
      console.error('Error loading routes:', error);
    }
  };

  const handleCSVImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const parsedJobs = parseCSV(text);
      setJobs(parsedJobs);
      saveJobs(parsedJobs);
      setShowImportModal(false);
    };
    reader.readAsText(file);
  };

  const parseCSV = (csvText) => {
    const lines = csvText.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());

    const jobs = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;

      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const job = {};

      headers.forEach((header, index) => {
        job[header] = values[index] || '';
      });

      // Parse job into structured format
      const tfMatch = job.route_description?.match(/TF\((\d+:\d+)-(\d+:\d+)\)/);
      const customerName = job.route_title?.split('|')[0]?.trim() || '';
      const jobType = extractJobType(job.route_title || '');

      jobs.push({
        id: job.text || `job_${Date.now()}_${i}`,
        customerName: customerName,
        address: job.customer_address || '',
        zone: job.Zone || '',
        duration: parseFloat(job.duration) || 1,
        timeframeStart: tfMatch ? tfMatch[1] : '09:00',
        timeframeEnd: tfMatch ? tfMatch[2] : '17:00',
        assignedWorkers: job.workers ? parseWorkers(job.workers) : [],
        jobType: jobType,
        requiresTwoTechs: checkTwoTechsNeeded(job),
        description: job.route_description || '',
        status: 'unassigned',
        originalData: job
      });
    }

    return jobs;
  };

  const extractJobType = (title) => {
    if (title.includes('Install')) return 'Install';
    if (title.includes('Pull')) return 'Pull';
    if (title.includes('Check Service')) return 'Check Service';
    if (title.includes('Moisture Check')) return 'Moisture Check';
    return 'Other';
  };

  const parseWorkers = (workersStr) => {
    try {
      return JSON.parse(workersStr.replace(/'/g, '"'));
    } catch {
      return [];
    }
  };

  const checkTwoTechsNeeded = (job) => {
    const workers = job.workers ? parseWorkers(job.workers) : [];
    return workers.length > 1 || job.route_title?.includes('Install');
  };

  const saveJobs = async (jobsData) => {
    try {
      await firebaseService.saveDocument('hou_routing', `jobs_${selectedDate}`, {
        jobs: jobsData,
        date: selectedDate,
        lastUpdated: new Date().toISOString()
      });
      alert('Jobs imported successfully!');
    } catch (error) {
      console.error('Error saving jobs:', error);
      alert('Error saving jobs. Please try again.');
    }
  };

  const getTechList = () => {
    if (!staffingData?.zones) return [];

    const techs = [];

    // Add management as techs if they do field work
    if (staffingData.management) {
      staffingData.management.forEach(member => {
        techs.push({
          id: member.id || member.name,
          name: member.name,
          role: member.role,
          zone: 'Management',
          office: 'office_1',
          isDemoTech: false
        });
      });
    }

    // Add zone members
    staffingData.zones.forEach(zone => {
      if (zone.lead) {
        techs.push({
          id: zone.lead.id,
          name: zone.lead.name,
          role: zone.lead.role,
          zone: zone.name,
          office: 'office_1',
          isDemoTech: false
        });
      }

      zone.members.forEach(member => {
        techs.push({
          id: member.id,
          name: member.name,
          role: member.role,
          zone: zone.name,
          office: member.office || 'office_1',
          isDemoTech: member.role === 'Demo Tech'
        });
      });
    });

    return techs;
  };

  const assignJobToTech = async (jobId, techId) => {
    const updatedJobs = jobs.map(job => {
      if (job.id === jobId) {
        return { ...job, assignedTech: techId, status: 'assigned' };
      }
      return job;
    });

    setJobs(updatedJobs);
    await saveJobs(updatedJobs);

    // Update routes
    const tech = getTechList().find(t => t.id === techId);
    const job = updatedJobs.find(j => j.id === jobId);

    const updatedRoutes = { ...routes };
    if (!updatedRoutes[techId]) {
      updatedRoutes[techId] = {
        tech: tech,
        jobs: []
      };
    }
    updatedRoutes[techId].jobs.push(job);

    setRoutes(updatedRoutes);
    await saveRoutes(updatedRoutes);
  };

  const saveRoutes = async (routesData) => {
    try {
      await firebaseService.saveDocument('hou_routing', `routes_${selectedDate}`, {
        routes: routesData,
        date: selectedDate,
        lastUpdated: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error saving routes:', error);
    }
  };

  const unassignJob = async (jobId) => {
    const updatedJobs = jobs.map(job => {
      if (job.id === jobId) {
        return { ...job, assignedTech: null, status: 'unassigned' };
      }
      return job;
    });

    setJobs(updatedJobs);
    await saveJobs(updatedJobs);

    // Remove from routes
    const updatedRoutes = { ...routes };
    Object.keys(updatedRoutes).forEach(techId => {
      updatedRoutes[techId].jobs = updatedRoutes[techId].jobs.filter(j => j.id !== jobId);
    });

    setRoutes(updatedRoutes);
    await saveRoutes(updatedRoutes);
  };

  const calculateRouteSummary = (techRoute) => {
    if (!techRoute || !techRoute.jobs || techRoute.jobs.length === 0) {
      return { totalJobs: 0, totalHours: 0, zones: [] };
    }

    const totalJobs = techRoute.jobs.length;
    const totalHours = techRoute.jobs.reduce((sum, job) => sum + job.duration, 0);
    const zones = [...new Set(techRoute.jobs.map(j => j.zone))];

    return { totalJobs, totalHours, zones };
  };

  const renderJobsView = () => {
    const unassignedJobs = jobs.filter(j => !j.assignedTech);
    const assignedJobs = jobs.filter(j => j.assignedTech);

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h3 style={{ margin: 0, marginBottom: '8px' }}>Daily Jobs - {selectedDate}</h3>
            <p style={{ margin: 0, color: '#6b7280' }}>
              {jobs.length} total jobs | {unassignedJobs.length} unassigned | {assignedJobs.length} assigned
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <input
              type="date"
              className="form-control"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{ width: 'auto' }}
            />
            <button className="btn btn-primary" onClick={() => setShowImportModal(true)}>
              <i className="fas fa-upload"></i> Import CSV
            </button>
          </div>
        </div>

        <div className="dashboard-grid" style={{ marginBottom: '24px' }}>
          <div className="metric-card">
            <div className="metric-header">
              <h3>Total Jobs</h3>
            </div>
            <div className="metric-value">{jobs.length}</div>
          </div>
          <div className="metric-card">
            <div className="metric-header">
              <h3>Unassigned</h3>
            </div>
            <div className="metric-value" style={{ color: '#f59e0b' }}>{unassignedJobs.length}</div>
          </div>
          <div className="metric-card">
            <div className="metric-header">
              <h3>Assigned</h3>
            </div>
            <div className="metric-value" style={{ color: '#10b981' }}>{assignedJobs.length}</div>
          </div>
          <div className="metric-card">
            <div className="metric-header">
              <h3>Total Hours</h3>
            </div>
            <div className="metric-value">{jobs.reduce((sum, j) => sum + j.duration, 0).toFixed(1)}</div>
          </div>
        </div>

        {/* Unassigned Jobs */}
        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="card-header">
            <h3><i className="fas fa-clipboard-list"></i> Unassigned Jobs ({unassignedJobs.length})</h3>
          </div>
          <div className="table-container">
            {unassignedJobs.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Address</th>
                    <th>Zone</th>
                    <th>Type</th>
                    <th>Timeframe</th>
                    <th>Duration</th>
                    <th>2 Techs?</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {unassignedJobs.map((job) => (
                    <tr key={job.id}>
                      <td><strong>{job.customerName}</strong></td>
                      <td>{job.address}</td>
                      <td>
                        <span className="status-badge status-available">{job.zone}</span>
                      </td>
                      <td>{job.jobType}</td>
                      <td>{job.timeframeStart} - {job.timeframeEnd}</td>
                      <td>{job.duration}h</td>
                      <td>
                        {job.requiresTwoTechs ? (
                          <span style={{ color: '#f59e0b' }}>
                            <i className="fas fa-users"></i> Yes
                          </span>
                        ) : (
                          <span style={{ color: '#6b7280' }}>No</span>
                        )}
                      </td>
                      <td>
                        <select
                          className="form-control"
                          style={{ width: 'auto', padding: '4px 8px', fontSize: '14px' }}
                          onChange={(e) => {
                            if (e.target.value) {
                              assignJobToTech(job.id, e.target.value);
                              e.target.value = '';
                            }
                          }}
                          defaultValue=""
                        >
                          <option value="">Assign to...</option>
                          {getTechList().filter(t => !t.isDemoTech).map(tech => (
                            <option key={tech.id} value={tech.id}>
                              {tech.name} ({tech.zone})
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
                All jobs have been assigned!
              </p>
            )}
          </div>
        </div>

        {/* Assigned Jobs */}
        {assignedJobs.length > 0 && (
          <div className="card">
            <div className="card-header">
              <h3><i className="fas fa-check-circle"></i> Assigned Jobs ({assignedJobs.length})</h3>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Zone</th>
                    <th>Type</th>
                    <th>Duration</th>
                    <th>Assigned To</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assignedJobs.map((job) => {
                    const tech = getTechList().find(t => t.id === job.assignedTech);
                    return (
                      <tr key={job.id}>
                        <td><strong>{job.customerName}</strong></td>
                        <td>{job.zone}</td>
                        <td>{job.jobType}</td>
                        <td>{job.duration}h</td>
                        <td>
                          <span style={{ color: '#3b82f6', fontWeight: '500' }}>
                            <i className="fas fa-user"></i> {tech?.name || 'Unknown'}
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn btn-secondary btn-small"
                            onClick={() => unassignJob(job.id)}
                          >
                            <i className="fas fa-times"></i> Unassign
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderRoutesView = () => {
    const techs = getTechList().filter(t => !t.isDemoTech);

    return (
      <div>
        <h3 style={{ marginBottom: '24px' }}>Route Assignments - {selectedDate}</h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '20px' }}>
          {techs.map(tech => {
            const techRoute = routes[tech.id];
            const summary = calculateRouteSummary(techRoute);

            return (
              <div key={tech.id} className="card">
                <div className="card-header" style={{ backgroundColor: summary.totalJobs > 0 ? '#eff6ff' : '#f9fafb' }}>
                  <div>
                    <h3 style={{ margin: 0, marginBottom: '4px' }}>
                      <i className="fas fa-user"></i> {tech.name}
                    </h3>
                    <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>
                      {tech.role} | {tech.zone} | {offices[tech.office]?.name}
                    </p>
                  </div>
                </div>
                <div style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div>
                      <span style={{ fontSize: '14px', color: '#6b7280' }}>Jobs:</span>
                      <strong style={{ marginLeft: '8px', color: '#3b82f6' }}>{summary.totalJobs}</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '14px', color: '#6b7280' }}>Hours:</span>
                      <strong style={{ marginLeft: '8px', color: '#10b981' }}>{summary.totalHours.toFixed(1)}h</strong>
                    </div>
                  </div>

                  {techRoute && techRoute.jobs && techRoute.jobs.length > 0 ? (
                    <div>
                      {techRoute.jobs.map((job, idx) => (
                        <div
                          key={job.id}
                          style={{
                            padding: '12px',
                            backgroundColor: '#f9fafb',
                            borderRadius: '6px',
                            marginBottom: '8px',
                            borderLeft: '3px solid #3b82f6'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                            <div style={{ flex: 1 }}>
                              <strong style={{ fontSize: '14px' }}>
                                {idx + 1}. {job.customerName}
                              </strong>
                              <p style={{ margin: '4px 0', fontSize: '12px', color: '#6b7280' }}>
                                <i className="fas fa-map-marker-alt"></i> {job.address}
                              </p>
                              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                                <span style={{ fontSize: '12px' }}>
                                  <i className="fas fa-clock"></i> {job.timeframeStart}-{job.timeframeEnd}
                                </span>
                                <span style={{ fontSize: '12px' }}>
                                  <i className="fas fa-hourglass-half"></i> {job.duration}h
                                </span>
                                <span style={{ fontSize: '12px' }}>
                                  {job.jobType}
                                </span>
                              </div>
                            </div>
                            <button
                              className="btn btn-secondary btn-small"
                              onClick={() => unassignJob(job.id)}
                              style={{ padding: '4px 8px', fontSize: '12px' }}
                            >
                              <i className="fas fa-times"></i>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ textAlign: 'center', color: '#6b7280', fontSize: '14px', padding: '20px' }}>
                      No jobs assigned
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderTechsView = () => {
    const techs = getTechList();

    return (
      <div>
        <h3 style={{ marginBottom: '24px' }}>Technician Directory</h3>

        <div className="card">
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Zone</th>
                  <th>Office</th>
                  <th>Type</th>
                  <th>Assigned Jobs</th>
                </tr>
              </thead>
              <tbody>
                {techs.map(tech => {
                  const techRoute = routes[tech.id];
                  const jobCount = techRoute?.jobs?.length || 0;

                  return (
                    <tr key={tech.id}>
                      <td><strong>{tech.name}</strong></td>
                      <td>{tech.role}</td>
                      <td>{tech.zone}</td>
                      <td>{offices[tech.office]?.name || 'N/A'}</td>
                      <td>
                        {tech.isDemoTech ? (
                          <span className="status-badge status-in-use">Demo Tech</span>
                        ) : (
                          <span className="status-badge status-available">Lead Tech</span>
                        )}
                      </td>
                      <td>
                        {jobCount > 0 ? (
                          <span style={{ color: '#3b82f6', fontWeight: '500' }}>
                            {jobCount} job{jobCount !== 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span style={{ color: '#6b7280' }}>None</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Layout>
      <div className="tab-content active">
        <div className="tab-header">
          <h2>Route Planning & Management</h2>
        </div>

        <div className="tab-controls" style={{ marginBottom: '24px' }}>
          <div className="sub-nav">
            <button
              className={`sub-nav-btn ${activeView === 'jobs' ? 'active' : ''}`}
              onClick={() => setActiveView('jobs')}
            >
              <i className="fas fa-clipboard-list"></i> Jobs
            </button>
            <button
              className={`sub-nav-btn ${activeView === 'routes' ? 'active' : ''}`}
              onClick={() => setActiveView('routes')}
            >
              <i className="fas fa-route"></i> Routes
            </button>
            <button
              className={`sub-nav-btn ${activeView === 'techs' ? 'active' : ''}`}
              onClick={() => setActiveView('techs')}
            >
              <i className="fas fa-users"></i> Technicians
            </button>
          </div>
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <>
            {activeView === 'jobs' && renderJobsView()}
            {activeView === 'routes' && renderRoutesView()}
            {activeView === 'techs' && renderTechsView()}
          </>
        )}

        {/* CSV Import Modal */}
        {showImportModal && (
          <div className="modal-overlay active" onClick={() => setShowImportModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3><i className="fas fa-upload"></i> Import Daily Jobs</h3>
                <button className="modal-close" onClick={() => setShowImportModal(false)}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="modal-body">
                <p style={{ marginBottom: '16px', color: '#6b7280' }}>
                  Select your daily export CSV file. The file should include customer info, addresses, timeframes, durations, and zone assignments.
                </p>
                <div style={{ marginBottom: '20px' }}>
                  <label htmlFor="csvFile" className="btn btn-secondary" style={{ cursor: 'pointer', display: 'inline-block' }}>
                    <i className="fas fa-file-csv"></i> Choose CSV File
                  </label>
                  <input
                    type="file"
                    id="csvFile"
                    accept=".csv"
                    onChange={handleCSVImport}
                    style={{ display: 'none' }}
                  />
                </div>
                <div style={{ padding: '12px', backgroundColor: '#eff6ff', borderRadius: '6px', fontSize: '14px' }}>
                  <strong>Expected CSV Format:</strong>
                  <ul style={{ marginTop: '8px', marginBottom: 0, paddingLeft: '20px' }}>
                    <li>text (Job ID)</li>
                    <li>route_title (Customer Name | Job Type)</li>
                    <li>customer_address</li>
                    <li>Zone</li>
                    <li>duration (hours)</li>
                    <li>workers (assigned workers array)</li>
                    <li>route_description (includes TF(HH:MM-HH:MM))</li>
                  </ul>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowImportModal(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Routing;
