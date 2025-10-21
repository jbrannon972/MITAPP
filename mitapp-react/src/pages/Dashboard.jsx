import { useState, useEffect } from 'react';
import Layout from '../components/common/Layout';
import { useAuth } from '../contexts/AuthContext';
import firebaseService from '../services/firebaseService';

const Dashboard = () => {
  const { currentUser } = useAuth();
  const [activeView, setActiveView] = useState('supervisor-dashboard');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);

  useEffect(() => {
    loadDashboardData();
  }, [selectedDate]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      // Load necessary data from Firebase
      const [staffingData, calendarEvents] = await Promise.all([
        firebaseService.loadStaffingData(),
        firebaseService.getCalendarEvents(selectedDate, selectedDate)
      ]);

      setDashboardData({
        staffingData,
        calendarEvents
      });
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const switchView = (view) => {
    setActiveView(view);
  };

  return (
    <Layout>
      <div id="dashboard-tab" className="tab-content active">
        <div className="tab-header">
          <div className="sub-nav">
            <button
              className={`sub-nav-btn ${activeView === 'supervisor-dashboard' ? 'active' : ''}`}
              onClick={() => switchView('supervisor-dashboard')}
            >
              <i className="fas fa-user-shield"></i> Supervisor
            </button>
            <button
              className={`sub-nav-btn ${activeView === 'warehouse-dashboard' ? 'active' : ''}`}
              onClick={() => switchView('warehouse-dashboard')}
            >
              <i className="fas fa-warehouse"></i> Warehouse
            </button>
          </div>
          <div className="tab-controls">
            <div className="date-picker-container">
              <label htmlFor="dashboardDate">Select Date:</label>
              <input
                type="date"
                id="dashboardDate"
                className="date-input"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Supervisor Dashboard View */}
        <div
          id="supervisor-dashboard-view"
          className="dashboard-view"
          style={{ display: activeView === 'supervisor-dashboard' ? 'block' : 'none' }}
        >
          <div className="dashboard-main-grid">
            <div className="dashboard-main-content">
              <div className="dashboard-top-grid">
                <div className="card" id="todays-stats-card">
                  <div className="card-header">
                    <h3><i className="fas fa-calendar-day"></i> Job Stats</h3>
                  </div>
                  <div id="todays-stats-content">
                    {loading ? (
                      <p>Loading stats...</p>
                    ) : (
                      <div className="stats-grid">
                        <div className="stat-item">
                          <span className="stat-label">Jobs Scheduled</span>
                          <span className="stat-value">0</span>
                        </div>
                        <div className="stat-item">
                          <span className="stat-label">Completed</span>
                          <span className="stat-value">0</span>
                        </div>
                        <div className="stat-item">
                          <span className="stat-label">In Progress</span>
                          <span className="stat-value">0</span>
                        </div>
                        <div className="stat-item">
                          <span className="stat-label">Pending</span>
                          <span className="stat-value">0</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="card" id="staffing-info-card">
                  <div className="card-header">
                    <h3><i className="fas fa-info-circle"></i> Staffing Info & Notes</h3>
                  </div>
                  <div id="staffing-info-list" className="staffing-info-list">
                    {loading ? (
                      <p>Loading schedule...</p>
                    ) : dashboardData?.calendarEvents?.length > 0 ? (
                      dashboardData.calendarEvents.map((event, index) => (
                        <div key={index} className="staff-off-item">
                          <span className="staff-name">{event.techName || event.title}</span>
                          <span className={`staff-status-badge status-${event.status || 'off'}`}>
                            {event.status || 'Off'}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="no-entries">No staffing changes for this date.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="dashboard-sidebar">
              <div className="card" id="at-a-glance-card">
                <div className="card-header">
                  <h3><i className="fas fa-clipboard-check"></i> At a Glance</h3>
                </div>
                <div className="glance-grid-two-col">
                  <div className="glance-item">
                    <span className="glance-value" id="techsOnRoute">0</span>
                    <span className="glance-label">Technicians On Route</span>
                  </div>
                  <div className="glance-item">
                    <span className="glance-value" id="subTeams">0</span>
                    <span className="glance-label">Sub Teams</span>
                  </div>
                  <div className="glance-item">
                    <span className="glance-value" id="newJobsCapacity">0</span>
                    <span className="glance-label">Install Windows Predicted</span>
                  </div>
                  <div className="glance-item">
                    <span className="glance-value" id="inefficientDemoHours">0</span>
                    <span className="glance-label">Inefficient Demo Hours</span>
                  </div>
                </div>
              </div>

              <div className="card" id="daily-hours-card">
                <div className="card-header">
                  <h3><i className="fas fa-chart-bar"></i> Daily Hours</h3>
                </div>
                <div className="chart-container">
                  <p style={{ textAlign: 'center', padding: '40px' }}>Chart will appear here</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Warehouse Dashboard View */}
        <div
          id="warehouse-dashboard-view"
          className="dashboard-view"
          style={{ display: activeView === 'warehouse-dashboard' ? 'block' : 'none' }}
        >
          <div className="dashboard-main-grid" style={{ gridTemplateColumns: '1fr', gap: '24px' }}>
            <div className="dashboard-top-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
              <div className="card list-card">
                <div className="card-header">
                  <h3><i className="fas fa-tools"></i> Vehicles in Repair</h3>
                </div>
                <div id="vehicles-in-repair-list" className="vehicle-list">
                  <p className="no-entries">No vehicles in repair</p>
                </div>
              </div>

              <div className="card list-card">
                <div className="card-header">
                  <h3><i className="fas fa-user-slash"></i> Unassigned Vehicles</h3>
                </div>
                <div id="unassigned-vehicles-list" className="vehicle-list">
                  <p className="no-entries">No unassigned vehicles</p>
                </div>
              </div>

              <div className="card list-card">
                <div className="card-header">
                  <h3><i className="fas fa-calendar-times"></i> Available (Tech Off Today)</h3>
                </div>
                <div id="available-tech-off-list" className="vehicle-list">
                  <p className="no-entries">All techs working today</p>
                </div>
              </div>
            </div>

            <div className="dashboard-main-grid" style={{ gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
              <div className="card full-width-card">
                <div className="card-header">
                  <h3><i className="fas fa-clipboard-check"></i> At a Glance</h3>
                </div>
                <div className="glance-grid">
                  <div className="glance-item">
                    <span id="warehouse-pending-fleet-wos" className="glance-value">0</span>
                    <span className="glance-label">Pending Fleet WOs</span>
                  </div>
                  <div className="glance-item">
                    <span id="warehouse-recent-fleet-wos" className="glance-value">0</span>
                    <span className="glance-label">Fleet WOs (Last 24h)</span>
                  </div>
                  <div className="glance-item">
                    <span id="warehouse-pending-equipment-wos" className="glance-value">0</span>
                    <span className="glance-label">Pending Equipment WOs</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
