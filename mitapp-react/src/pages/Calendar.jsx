import { useState, useEffect } from 'react';
import Layout from '../components/common/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import firebaseService from '../services/firebaseService';
import { getCalculatedScheduleForDay, getHolidayName, formatNameCompact } from '../utils/calendarManager';

const Calendar = () => {
  const { currentUser } = useAuth();
  const { unifiedTechnicianData, loading: dataLoading } = useData();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState('month');
  const [monthlySchedules, setMonthlySchedules] = useState({ specific: {} });
  const [loading, setLoading] = useState(true);
  const [selectedDaySchedule, setSelectedDaySchedule] = useState(null);
  const [isCalendarAdmin, setIsCalendarAdmin] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [editingDate, setEditingDate] = useState(null);

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  useEffect(() => {
    // Check if user has calendar admin access
    const calAdminStatus = localStorage.getItem('calendarAdmin') === 'true';
    setIsCalendarAdmin(calAdminStatus);
  }, []);

  useEffect(() => {
    if (unifiedTechnicianData && unifiedTechnicianData.length > 0) {
      loadMonthSchedules();
    }
  }, [currentDate, unifiedTechnicianData]);

  const loadMonthSchedules = async () => {
    try {
      setLoading(true);
      const schedules = await firebaseService.getScheduleDataForMonth(
        currentDate.getFullYear(),
        currentDate.getMonth()
      );
      setMonthlySchedules(schedules);
    } catch (error) {
      console.error('Error loading schedules:', error);
    } finally {
      setLoading(false);
    }
  };

  const navigate = (direction) => {
    const newDate = new Date(currentDate);
    if (currentView === 'month') {
      newDate.setMonth(newDate.getMonth() + direction);
    } else if (currentView === 'week') {
      newDate.setDate(newDate.getDate() + (7 * direction));
    } else {
      newDate.setDate(newDate.getDate() + direction);
    }
    setCurrentDate(newDate);
  };

  const switchView = (view) => {
    setCurrentView(view);
  };

  const handleAdminLogin = () => {
    if (adminPassword === 'Safety1') {
      setIsCalendarAdmin(true);
      localStorage.setItem('calendarAdmin', 'true');
      setShowAdminModal(false);
      setAdminPassword('');
      alert('Calendar admin access granted!');
    } else {
      alert('Incorrect password');
    }
  };

  const handleAdminLogout = () => {
    setIsCalendarAdmin(false);
    localStorage.removeItem('calendarAdmin');
    alert('Logged out from calendar admin');
  };

  const handleSyncWithRippling = async () => {
    if (!isCalendarAdmin) {
      alert('Admin access required');
      return;
    }
    alert('Sync with Rippling functionality will sync schedule data from Rippling API. Coming soon!');
  };

  const handleManageRecurring = () => {
    if (!isCalendarAdmin) {
      alert('Admin access required');
      return;
    }
    alert('Manage recurring schedules (weekly patterns, regular days off, etc.). Coming soon!');
  };

  const handleWeekendReport = () => {
    alert('Weekend Report: Generate a report of all weekend work assignments. Coming soon!');
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDayClick = (dateObject) => {
    const schedule = getCalculatedScheduleForDay(dateObject, monthlySchedules, unifiedTechnicianData);

    if (isCalendarAdmin) {
      setEditingDate(dateObject);
      setSelectedDaySchedule({ date: dateObject, schedule });
    } else {
      setSelectedDaySchedule({ date: dateObject, schedule });
    }
  };

  const handleSaveSchedule = async () => {
    if (!editingDate) return;

    try {
      const scheduleData = {
        date: editingDate,
        staff: selectedDaySchedule.schedule.staff,
        notes: selectedDaySchedule.schedule.notes
      };

      await firebaseService.saveSchedule(scheduleData);
      alert('Schedule saved successfully!');
      loadMonthSchedules();
      closeModal();
    } catch (error) {
      console.error('Error saving schedule:', error);
      alert('Error saving schedule. Please try again.');
    }
  };

  const closeModal = () => {
    setSelectedDaySchedule(null);
    setEditingDate(null);
  };

  const renderMonthView = () => {
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
    const daysInCurrentMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const totalWeeks = Math.ceil((firstDayOfMonth + daysInCurrentMonth) / 7);

    const weeks = [];
    let dayCounter = 1;

    for (let week = 0; week < totalWeeks; week++) {
      const days = [];
      for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
        if ((week === 0 && dayOfWeek < firstDayOfMonth) || dayCounter > daysInCurrentMonth) {
          days.push(<td key={dayOfWeek} className="other-month"></td>);
        } else {
          const cellDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), dayCounter);
          days.push(renderDayCell(cellDate, dayCounter));
          dayCounter++;
        }
      }
      weeks.push(<tr key={week}>{days}</tr>);
    }

    return (
      <table className="calendar-table">
        <thead>
          <tr>
            <th>Sun</th>
            <th>Mon</th>
            <th>Tue</th>
            <th>Wed</th>
            <th>Thu</th>
            <th>Fri</th>
            <th>Sat</th>
          </tr>
        </thead>
        <tbody>{weeks}</tbody>
      </table>
    );
  };

  const renderDayCell = (dateObject, dayOfMonth) => {
    const dayKey = dateObject.getDay();
    const isWeekend = dayKey === 0 || dayKey === 6;
    const isToday = dateObject.toDateString() === new Date().toDateString();
    const holidayName = getHolidayName(dateObject);

    const schedule = getCalculatedScheduleForDay(dateObject, monthlySchedules, unifiedTechnicianData);

    const offStatuses = ['off', 'sick', 'vacation', 'no-call-no-show'];
    const staffToDisplay = schedule.staff.filter(s => {
      if (isWeekend) {
        return s.status === 'on' || s.hours;
      } else {
        return offStatuses.includes(s.status) || s.hours;
      }
    });

    let cellClasses = '';
    if (isToday) cellClasses += ' today';
    if (isWeekend) cellClasses += ' weekend';
    if (holidayName) cellClasses += ' holiday';

    return (
      <td
        key={dayOfMonth}
        className={cellClasses}
        onClick={() => handleDayClick(dateObject)}
        style={{ cursor: 'pointer' }}
      >
        <div className="date-header">
          <div className="date-number">{dayOfMonth}</div>
          {holidayName && <div className="holiday-label">{holidayName}</div>}
        </div>

        {staffToDisplay.length > 0 && (
          <div className="staff-grid">
            {staffToDisplay.slice(0, 4).map((staffEntry, idx) => (
              <div
                key={idx}
                className={`staff-compact staff-${staffEntry.status.replace(' ', '-')} ${staffEntry.hours ? 'staff-custom-hours' : ''}`}
              >
                <div className="staff-name">{formatNameCompact(staffEntry.name)}</div>
                {staffEntry.hours && <div className="staff-shift-info staff-shift-custom">{staffEntry.hours}</div>}
                {!staffEntry.hours && staffEntry.status !== 'on' && staffEntry.status !== 'off' && (
                  <div className="staff-shift-info">{staffEntry.status.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}</div>
                )}
              </div>
            ))}
            {staffToDisplay.length > 4 && (
              <div className="more-indicator">+{staffToDisplay.length - 4} more</div>
            )}
          </div>
        )}

        {schedule.notes && (
          <div className="direct-note-display" title={schedule.notes}>
            {schedule.notes}
          </div>
        )}
      </td>
    );
  };

  const renderScheduleModal = () => {
    if (!selectedDaySchedule) return null;

    const { date, schedule } = selectedDaySchedule;
    const dateString = `${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    const isWeekend = [0, 6].includes(date.getDay());
    const offStatuses = ['off', 'sick', 'vacation', 'no-call-no-show'];

    const primaryHeaderText = isWeekend ? "Working Today" : "Scheduled Off / Custom";
    const secondaryHeaderText = isWeekend ? "Scheduled Off" : "Working Today";

    const primaryList = schedule.staff.filter(s =>
      isWeekend ? (s.status === 'on' || s.hours) : (offStatuses.includes(s.status) || s.hours)
    );
    const secondaryList = schedule.staff.filter(s =>
      isWeekend ? (offStatuses.includes(s.status) && !s.hours) : (s.status === 'on' && !s.hours)
    );

    const formatStatus = (s) => {
      let statusText = s.status.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      if (s.hours) statusText += ` (${s.hours})`;
      return statusText;
    };

    return (
      <div className="modal-overlay" onClick={closeModal} style={{ display: 'flex' }}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', maxHeight: '80vh', overflow: 'auto' }}>
          <span className="close" onClick={closeModal}>&times;</span>
          <h2>{dateString}</h2>

          {isCalendarAdmin && (
            <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#dbeafe', borderRadius: '8px' }}>
              <p style={{ margin: 0, fontSize: '14px' }}>
                <i className="fas fa-edit"></i> Admin Mode: Click on staff members to edit their status, or modify notes below.
              </p>
            </div>
          )}

          <div className="view-content">
            <h3><i className="fas fa-sticky-note"></i> Notes:</h3>
            <div className="view-notes" style={{
              padding: '12px',
              backgroundColor: '#f3f4f6',
              borderRadius: '8px',
              marginBottom: '20px',
              minHeight: '60px'
            }}>
              {schedule.notes || 'No notes for this day.'}
            </div>

            <h3><i className="fas fa-users"></i> {primaryHeaderText}</h3>
            <div className="view-staff-list">
              {primaryList.length > 0 ? (
                primaryList.map((s, idx) => (
                  <div key={idx} className={`view-staff-item status-${s.status}`} style={{
                    padding: '8px 12px',
                    marginBottom: '8px',
                    borderRadius: '6px',
                    backgroundColor: '#f9fafb',
                    borderLeft: '4px solid #3b82f6'
                  }}>
                    <strong>{s.name}:</strong> {formatStatus(s)}
                  </div>
                ))
              ) : (
                <p style={{ color: '#6b7280', fontStyle: 'italic' }}>None</p>
              )}
            </div>

            <h3 style={{ marginTop: '24px' }}><i className="fas fa-user-check"></i> {secondaryHeaderText}</h3>
            <div className="view-staff-list">
              {secondaryList.length > 0 ? (
                secondaryList.map((s, idx) => (
                  <div key={idx} className={`view-staff-item status-${s.status}`} style={{
                    padding: '8px 12px',
                    marginBottom: '8px',
                    borderRadius: '6px',
                    backgroundColor: '#f9fafb',
                    borderLeft: '4px solid #10b981'
                  }}>
                    <strong>{s.name}:</strong> {formatStatus(s)}
                  </div>
                ))
              ) : (
                <p style={{ color: '#6b7280', fontStyle: 'italic' }}>None</p>
              )}
            </div>

            {isCalendarAdmin && editingDate && (
              <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
                <button className="btn btn-primary" onClick={handleSaveSchedule}>
                  <i className="fas fa-save"></i> Save Changes
                </button>
                <button className="btn btn-secondary" onClick={closeModal}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (dataLoading || loading) {
    return (
      <Layout>
        <div className="tab-content active">
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <i className="fas fa-spinner fa-spin" style={{ fontSize: '48px', color: '#3b82f6', marginBottom: '16px' }}></i>
            <p>Loading calendar...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="tab-content active">
        {/* Top Action Buttons */}
        <div className="tab-header" style={{ marginBottom: '16px' }}>
          <div className="tab-controls">
            <div className="calendar-actions" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button
                className="btn btn-success"
                onClick={handleSyncWithRippling}
                disabled={!isCalendarAdmin}
                title={!isCalendarAdmin ? 'Admin access required' : 'Sync schedule with Rippling'}
              >
                <i className="fas fa-sync"></i> Sync with Rippling
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleManageRecurring}
                disabled={!isCalendarAdmin}
                title={!isCalendarAdmin ? 'Admin access required' : 'Manage recurring schedules'}
              >
                <i className="fas fa-sync-alt"></i> Manage Recurring
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleWeekendReport}
              >
                <i className="fas fa-file-alt"></i> Weekend Report
              </button>
              <button
                className="btn btn-primary"
                onClick={handlePrint}
              >
                <i className="fas fa-print"></i> Print
              </button>
            </div>
            <div className="calendar-auth-container" style={{ display: 'flex', gap: '12px' }}>
              {!isCalendarAdmin ? (
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowAdminModal(true)}
                >
                  <i className="fas fa-lock"></i> Admin Login
                </button>
              ) : (
                <button
                  className="btn btn-secondary"
                  onClick={handleAdminLogout}
                >
                  <i className="fas fa-sign-out-alt"></i> Logout
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Calendar Controls */}
        <div className="tab-header">
          <div className="calendar-controls">
            <button className="btn btn-secondary" onClick={() => navigate(-1)}>
              <i className="fas fa-chevron-left"></i> Prev
            </button>
            <h2 id="calCurrentDate">
              {currentView === 'month' && `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`}
              {currentView === 'week' && currentDate.toLocaleDateString()}
              {currentView === 'day' && currentDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </h2>
            <button className="btn btn-secondary" onClick={() => navigate(1)}>
              Next <i className="fas fa-chevron-right"></i>
            </button>
          </div>
          <div className="calendar-view-switcher">
            <button
              className={`btn btn-small ${currentView === 'day' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => switchView('day')}
            >
              Day
            </button>
            <button
              className={`btn btn-small ${currentView === 'week' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => switchView('week')}
            >
              Week
            </button>
            <button
              className={`btn btn-small ${currentView === 'month' ? 'btn-primary active' : 'btn-secondary'}`}
              onClick={() => switchView('month')}
            >
              Month
            </button>
          </div>
        </div>

        {/* Admin Status Indicator */}
        {isCalendarAdmin && (
          <div style={{
            padding: '12px 16px',
            backgroundColor: '#dcfce7',
            borderLeft: '4px solid #10b981',
            marginBottom: '16px',
            borderRadius: '8px'
          }}>
            <i className="fas fa-user-shield" style={{ color: '#10b981', marginRight: '8px' }}></i>
            <strong>Calendar Admin Mode Active</strong> - Click on any day to edit schedules
          </div>
        )}

        {/* Calendar Display */}
        <div id="calendarContainer" className="calendar-container">
          {currentView === 'month' && renderMonthView()}
          {currentView === 'week' && (
            <div className="card">
              <div className="card-header">
                <h3><i className="fas fa-calendar-week"></i> Week View</h3>
              </div>
              <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                <i className="fas fa-calendar-week" style={{ fontSize: '64px', marginBottom: '16px', opacity: 0.3 }}></i>
                <p>Week view coming soon - will show detailed daily schedules for the selected week.</p>
              </div>
            </div>
          )}
          {currentView === 'day' && (
            <div className="card">
              <div className="card-header">
                <h3><i className="fas fa-calendar-day"></i> Day View</h3>
              </div>
              <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                <i className="fas fa-calendar-day" style={{ fontSize: '64px', marginBottom: '16px', opacity: 0.3 }}></i>
                <p>Day view coming soon - will show hourly breakdown and detailed staff assignments.</p>
              </div>
            </div>
          )}
        </div>

        {/* Schedule Modal */}
        {renderScheduleModal()}

        {/* Admin Login Modal */}
        {showAdminModal && (
          <div className="modal-overlay" onClick={() => setShowAdminModal(false)} style={{ display: 'flex' }}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
              <span className="close" onClick={() => setShowAdminModal(false)}>&times;</span>
              <h2><i className="fas fa-lock"></i> Calendar Admin Login</h2>
              <div className="form-group" style={{ marginTop: '20px' }}>
                <label htmlFor="calPassword" style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                  Password:
                </label>
                <input
                  type="password"
                  id="calPassword"
                  className="form-input"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAdminLogin()}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }}
                  placeholder="Enter admin password"
                />
              </div>
              <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
                <button className="btn btn-primary" onClick={handleAdminLogin}>
                  <i className="fas fa-sign-in-alt"></i> Login
                </button>
                <button className="btn btn-secondary" onClick={() => setShowAdminModal(false)}>
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

export default Calendar;
