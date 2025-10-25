import { useState, useEffect } from 'react';
import Layout from '../components/common/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import firebaseService from '../services/firebaseService';
import { getTechsOnRouteToday, getSubTeamsToday, getDailyHoursData } from '../utils/dashboardCalculations';
import { getCalculatedScheduleForDay } from '../utils/calendarManager';
import DailyHoursChart from '../components/dashboard/DailyHoursChart';

const Dashboard = () => {
  const { currentUser } = useAuth();
  const { staffingData, monthlyData, unifiedTechnicianData } = useData();
  const [activeView, setActiveView] = useState('supervisor-dashboard');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState({
    jobStats: { scheduled: 0, completed: 0, inProgress: 0, pending: 0 },
    staffingInfo: [],
    atAGlance: { techsOnRoute: 0, subTeams: 0, newJobsCapacity: 0, inefficientDemoHours: 0 },
    dailyHoursData: null,
    warehouseData: { vehiclesInRepair: [], unassignedVehicles: [], techsOffToday: [] },
    secondShiftReport: null
  });

  useEffect(() => {
    if (staffingData && monthlyData && unifiedTechnicianData) {
      loadDashboardData();
    }
  }, [selectedDate, staffingData, monthlyData, unifiedTechnicianData]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const date = new Date(selectedDate);
      const month = date.getMonth();
      const year = date.getFullYear();

      // Get monthly schedule data
      const monthlySchedules = await firebaseService.getScheduleDataForMonth(year, month);

      // Get calculated schedule for selected day
      const schedule = getCalculatedScheduleForDay(date, monthlySchedules, unifiedTechnicianData);

      // Calculate job stats (from Firebase calendar events)
      const jobStats = await getDailyStats(selectedDate);

      // Calculate "at a glance" metrics
      const techsOnRoute = await getTechsOnRouteToday(date, staffingData, firebaseService, { getCalculatedScheduleForDay }, unifiedTechnicianData);
      const subTeams = await getSubTeamsToday(date, staffingData, firebaseService, { getCalculatedScheduleForDay }, unifiedTechnicianData);
      const dailyHours = await getDailyHoursData(date, monthlyData, staffingData, firebaseService, { getCalculatedScheduleForDay }, unifiedTechnicianData);

      // Get staffing info (people off today or with custom schedules)
      const offStatuses = ['off', 'sick', 'vacation', 'no-call-no-show'];
      const isWeekend = [0, 6].includes(date.getDay());
      const staffingInfo = schedule.staff.filter(s => {
        if (isWeekend) {
          return s.status === 'on' || s.hours;
        } else {
          return offStatuses.includes(s.status) || s.hours;
        }
      });

      // Get warehouse data (if fleet data available)
      const warehouseData = await getWarehouseData(schedule);

      // Get yesterday's second shift report
      const yesterday = new Date(date);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayString = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
      const secondShiftReport = await firebaseService.getSecondShiftReportByDate(yesterdayString);

      setDashboardData({
        jobStats,
        staffingInfo,
        scheduleNotes: schedule.notes,
        atAGlance: {
          techsOnRoute,
          subTeams,
          newJobsCapacity: dailyHours.potentialNewJobs || 0,
          inefficientDemoHours: dailyHours.inefficientDemoHours || 0
        },
        dailyHoursData: dailyHours,
        warehouseData,
        secondShiftReport: { report: secondShiftReport, date: yesterday }
      });
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDailyStats = async (dateString) => {
    try {
      const events = await firebaseService.getCalendarEvents(dateString, dateString);

      const stats = {
        scheduled: events.length,
        completed: events.filter(e => e.status === 'completed').length,
        inProgress: events.filter(e => e.status === 'in-progress').length,
        pending: events.filter(e => e.status === 'pending' || !e.status).length
      };

      return stats;
    } catch (error) {
      console.error('Error getting daily stats:', error);
      return { scheduled: 0, completed: 0, inProgress: 0, pending: 0 };
    }
  };

  const getWarehouseData = async (schedule) => {
    try {
      // Get fleet data
      const fleet = await firebaseService.loadFleetData();

      // Vehicles in repair
      const vehiclesInRepair = fleet.filter(v => v.status === 'in-repair' || v.hasActiveWorkOrder);

      // Unassigned vehicles
      const unassignedVehicles = fleet.filter(v => !v.assignedTo && v.status === 'active');

      // Techs off today (vehicles available)
      const techsOffToday = schedule.staff.filter(s => s.status === 'off' || s.status === 'vacation' || s.status === 'sick');

      return { vehiclesInRepair, unassignedVehicles, techsOffToday };
    } catch (error) {
      console.error('Error getting warehouse data:', error);
      return { vehiclesInRepair: [], unassignedVehicles: [], techsOffToday: [] };
    }
  };

  const switchView = (view) => {
    setActiveView(view);
  };

  const formatStatus = (status) => {
    return status.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
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
                          <span className="stat-value">{dashboardData.jobStats.scheduled}</span>
                        </div>
                        <div className="stat-item">
                          <span className="stat-label">Completed</span>
                          <span className="stat-value">{dashboardData.jobStats.completed}</span>
                        </div>
                        <div className="stat-item">
                          <span className="stat-label">In Progress</span>
                          <span className="stat-value">{dashboardData.jobStats.inProgress}</span>
                        </div>
                        <div className="stat-item">
                          <span className="stat-label">Pending</span>
                          <span className="stat-value">{dashboardData.jobStats.pending}</span>
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
                    ) : (
                      <>
                        {dashboardData.scheduleNotes && (
                          <div className="schedule-notes">
                            <strong>Notes:</strong> {dashboardData.scheduleNotes}
                          </div>
                        )}
                        {dashboardData.staffingInfo.length > 0 ? (
                          dashboardData.staffingInfo.map((staff, index) => (
                            <div key={index} className="staff-off-item">
                              <span className="staff-name">{staff.name}</span>
                              <span className={`staff-status-badge status-${staff.status.replace(' ', '-')}`}>
                                {formatStatus(staff.status)}
                                {staff.hours && ` (${staff.hours})`}
                              </span>
                            </div>
                          ))
                        ) : (
                          <p className="no-entries">No staffing changes for this date.</p>
                        )}
                      </>
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
                    <span className="glance-value" id="techsOnRoute">{dashboardData.atAGlance.techsOnRoute}</span>
                    <span className="glance-label">Technicians On Route</span>
                  </div>
                  <div className="glance-item">
                    <span className="glance-value" id="subTeams">{dashboardData.atAGlance.subTeams}</span>
                    <span className="glance-label">Sub Teams</span>
                  </div>
                  <div className="glance-item">
                    <span className="glance-value" id="newJobsCapacity">{dashboardData.atAGlance.newJobsCapacity}</span>
                    <span className="glance-label">Install Windows Predicted</span>
                  </div>
                  <div className="glance-item">
                    <span className="glance-value" id="inefficientDemoHours">{dashboardData.atAGlance.inefficientDemoHours}</span>
                    <span className="glance-label">Inefficient Demo Hours</span>
                  </div>
                </div>
              </div>

              <div className="card" id="daily-hours-card">
                <div className="card-header">
                  <h3><i className="fas fa-chart-bar"></i> Daily Hours</h3>
                </div>
                <div className="chart-container">
                  {loading ? (
                    <p style={{ textAlign: 'center', padding: '40px' }}>Loading chart...</p>
                  ) : (
                    <DailyHoursChart dailyHoursData={dashboardData.dailyHoursData} />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Second Shift Report - Full Width */}
          {dashboardData.secondShiftReport && (
            <div className="card second-shift-summary" style={{ marginTop: '16px' }}>
              <div className="card-header">
                <h3><i className="fas fa-moon"></i> Second Shift Summary for {dashboardData.secondShiftReport.date?.toLocaleDateString()}</h3>
                {dashboardData.secondShiftReport.report && <span>By: {dashboardData.secondShiftReport.report.submittedBy}</span>}
              </div>
              {dashboardData.secondShiftReport.report ? (
                <div className="summary-grid">
                  <div>
                    <h4>Jobs to Know About</h4>
                    <ul>
                      {dashboardData.secondShiftReport.report.nuances && dashboardData.secondShiftReport.report.nuances.length > 0 ? (
                        dashboardData.secondShiftReport.report.nuances.map((job, idx) => (
                          <li key={idx}><strong>{job.jobName}:</strong> {job.notes}</li>
                        ))
                      ) : (
                        <li>None</li>
                      )}
                    </ul>
                  </div>
                  <div>
                    <h4>Cancelled/Rescheduled</h4>
                    <ul>
                      {dashboardData.secondShiftReport.report.cancelledJobs && dashboardData.secondShiftReport.report.cancelledJobs.length > 0 ? (
                        dashboardData.secondShiftReport.report.cancelledJobs.map((job, idx) => (
                          <li key={idx}><strong>{job.jobName}:</strong> {job.notes}</li>
                        ))
                      ) : (
                        <li>None</li>
                      )}
                    </ul>
                  </div>
                  <div>
                    <h4>After Hours Jobs</h4>
                    <ul>
                      {dashboardData.secondShiftReport.report.afterHoursJobs && dashboardData.secondShiftReport.report.afterHoursJobs.length > 0 ? (
                        dashboardData.secondShiftReport.report.afterHoursJobs.map((job, idx) => (
                          <li key={idx}><strong>{job.jobName}:</strong> {job.reason} <em>(Who: {job.who})</em></li>
                        ))
                      ) : (
                        <li>None</li>
                      )}
                    </ul>
                  </div>
                  <div>
                    <h4>Tech Shoutouts</h4>
                    <p>{dashboardData.secondShiftReport.report.techShoutouts || 'None'}</p>
                  </div>
                  <div>
                    <h4>Tech Concerns</h4>
                    <p>{dashboardData.secondShiftReport.report.techConcerns || 'None'}</p>
                  </div>
                  <div>
                    <h4>Dept. Shoutouts</h4>
                    <p>{dashboardData.secondShiftReport.report.deptShoutouts || 'None'}</p>
                  </div>
                  <div>
                    <h4>Dept. Concerns</h4>
                    <p>{dashboardData.secondShiftReport.report.deptConcerns || 'None'}</p>
                  </div>
                </div>
              ) : (
                <p className="no-entries">No report was submitted.</p>
              )}
            </div>
          )}
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
                  {loading ? (
                    <p>Loading...</p>
                  ) : dashboardData.warehouseData.vehiclesInRepair.length > 0 ? (
                    dashboardData.warehouseData.vehiclesInRepair.map((vehicle, index) => (
                      <div key={index} className="vehicle-item">
                        <strong>{vehicle.name || vehicle.vehicleNumber}</strong>
                        {vehicle.assignedTo && <span> - {vehicle.assignedTo}</span>}
                      </div>
                    ))
                  ) : (
                    <p className="no-entries">No vehicles in repair</p>
                  )}
                </div>
              </div>

              <div className="card list-card">
                <div className="card-header">
                  <h3><i className="fas fa-user-slash"></i> Unassigned Vehicles</h3>
                </div>
                <div id="unassigned-vehicles-list" className="vehicle-list">
                  {loading ? (
                    <p>Loading...</p>
                  ) : dashboardData.warehouseData.unassignedVehicles.length > 0 ? (
                    dashboardData.warehouseData.unassignedVehicles.map((vehicle, index) => (
                      <div key={index} className="vehicle-item">
                        <strong>{vehicle.name || vehicle.vehicleNumber}</strong>
                      </div>
                    ))
                  ) : (
                    <p className="no-entries">No unassigned vehicles</p>
                  )}
                </div>
              </div>

              <div className="card list-card">
                <div className="card-header">
                  <h3><i className="fas fa-calendar-times"></i> Available (Tech Off Today)</h3>
                </div>
                <div id="available-tech-off-list" className="vehicle-list">
                  {loading ? (
                    <p>Loading...</p>
                  ) : dashboardData.warehouseData.techsOffToday.length > 0 ? (
                    dashboardData.warehouseData.techsOffToday.map((tech, index) => (
                      <div key={index} className="vehicle-item">
                        <strong>{tech.name}</strong>
                        <span> - {formatStatus(tech.status)}</span>
                      </div>
                    ))
                  ) : (
                    <p className="no-entries">All techs working today</p>
                  )}
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
