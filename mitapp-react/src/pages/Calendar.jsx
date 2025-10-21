import { useState, useEffect } from 'react';
import Layout from '../components/common/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import firebaseService from '../services/firebaseService';
import { getCalculatedScheduleForDay, getHolidayName, formatNameCompact } from '../utils/calendarManager';
import '../styles/calendar-styles.css';

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
    if (adminPassword === 'Entrusted1') {
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
      // Get notes from textarea
      const notes = document.getElementById('calNotes')?.value?.trim() || '';

      // Get staff data from the form - only save overrides
      const staffData = [];
      document.querySelectorAll('.staff-item-edit').forEach(item => {
        const staffId = item.dataset.staffId;
        const status = item.querySelector('.status-select')?.value;
        const hours = item.querySelector('.hours-input')?.value?.trim() || '';

        // Find the original staff member to check if this is different from default
        const originalStaff = selectedDaySchedule.schedule.staff.find(s => s.id === staffId);

        if (originalStaff) {
          // Only save if it's different from the default (weekend default is 'off', weekday default is 'on')
          const isWeekend = [0, 6].includes(editingDate.getDay());
          const defaultStatus = isWeekend ? 'off' : 'on';

          // Save if status is not default OR if there are custom hours
          if (status !== defaultStatus || hours) {
            staffData.push({
              id: staffId,
              status: status,
              hours: hours
            });
          }
        }
      });

      const scheduleData = {
        date: editingDate,
        staff: staffData,
        notes: notes
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

    const formatStatus = (s) => {
      let statusText = s.status.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      if (s.hours) statusText += ` (${s.hours})`;
      return statusText;
    };

    // If admin and editing, show edit modal
    if (isCalendarAdmin && editingDate) {
      // Sort staff: priority to those with special statuses or custom hours
      const sortedStaff = [...schedule.staff].sort((a, b) => {
        const aIsPriority = offStatuses.includes(a.status) || a.source === 'Recurring Rule' || a.hours;
        const bIsPriority = offStatuses.includes(b.status) || b.source === 'Recurring Rule' || b.hours;

        if (aIsPriority && !bIsPriority) return -1;
        if (!aIsPriority && bIsPriority) return 1;
        return a.name.localeCompare(b.name);
      });

      return (
        <div className="modal-overlay active" onClick={closeModal}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Schedule for {dateString}</h3>
              <button className="modal-close" onClick={closeModal}>
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="modal-body">
              <div className="edit-modal-layout-stacked">
                <div className="form-group">
                  <label htmlFor="staffSearchInput">Search Staff (Overrides for this day)</label>
                  <input
                    type="text"
                    id="staffSearchInput"
                    className="form-control"
                    placeholder="Start typing a name..."
                    onChange={(e) => {
                      const searchTerm = e.target.value.toLowerCase();
                      document.querySelectorAll('.staff-item-edit').forEach(item => {
                        const staffName = item.querySelector('.staff-name-container').textContent.toLowerCase();
                        item.style.display = staffName.includes(searchTerm) ? 'flex' : 'none';
                      });
                    }}
                  />
                </div>

                <div className="staff-list-section">
                  {sortedStaff.map((staff, idx) => (
                    <div key={staff.id || idx} className="staff-item-edit" data-staff-id={staff.id}>
                      <span className="staff-name-container">
                        {staff.name}
                        {staff.source && (
                          <span className={`status-source-badge source-${(staff.source || '').toLowerCase().replace(/ /g, '-')}`}>
                            {staff.source}
                          </span>
                        )}
                      </span>
                      <div className="staff-controls">
                        <input
                          type="text"
                          className="hours-input"
                          placeholder="Notes..."
                          defaultValue={staff.hours || ''}
                          autoComplete="off"
                        />
                        <select className="status-select" defaultValue={staff.status}>
                          <option value="on">On</option>
                          <option value="off">Off</option>
                          <option value="sick">Sick</option>
                          <option value="vacation">Vacation</option>
                          <option value="no-call-no-show">No Call No Show</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="form-group notes-section-stacked">
                  <label htmlFor="calNotes">Notes for this day:</label>
                  <textarea
                    id="calNotes"
                    className="form-control"
                    defaultValue={schedule.notes || ''}
                    rows="4"
                  />
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeModal}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSaveSchedule}>
                <i className="fas fa-save"></i> Save Schedule
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Otherwise show view-only modal
    const primaryHeaderText = isWeekend ? "Working Today" : "Scheduled Off / Custom";
    const secondaryHeaderText = isWeekend ? "Scheduled Off" : "Working Today";

    const primaryList = schedule.staff.filter(s =>
      isWeekend ? (s.status === 'on' || s.hours) : (offStatuses.includes(s.status) || s.hours)
    );
    const secondaryList = schedule.staff.filter(s =>
      isWeekend ? (offStatuses.includes(s.status) && !s.hours) : (s.status === 'on' && !s.hours)
    );

    return (
      <div className="modal-overlay active" onClick={closeModal}>
        <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>{dateString}</h3>
            <button className="modal-close" onClick={closeModal}>
              <i className="fas fa-times"></i>
            </button>
          </div>

          <div className="modal-body">
            <div className="view-content">
              <h3>Notes:</h3>
              <div className="view-notes">
                {schedule.notes || 'No notes for this day.'}
              </div>

              <h3>{primaryHeaderText}</h3>
              <div className="view-staff-list">
                {primaryList.length > 0 ? (
                  primaryList.map((s, idx) => (
                    <div key={idx} className={`view-staff-item status-${s.status}`}>
                      <strong>{s.name}:</strong> {formatStatus(s)}
                    </div>
                  ))
                ) : (
                  <p className="no-entries">None</p>
                )}
              </div>

              <h3>{secondaryHeaderText}</h3>
              <div className="view-staff-list">
                {secondaryList.length > 0 ? (
                  secondaryList.map((s, idx) => (
                    <div key={idx} className={`view-staff-item status-${s.status}`}>
                      <strong>{s.name}:</strong> {formatStatus(s)}
                    </div>
                  ))
                ) : (
                  <p className="no-entries">None</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (dataLoading || loading) {
    return (
      <Layout>
        <div className="tab-content active">
          <div className="loading">
            <i className="fas fa-spinner fa-spin"></i> Loading calendar...
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="tab-content active">
        {/* Top Action Buttons */}
        <div className="tab-header">
          <div className="tab-controls">
            <div className="calendar-actions">
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
            <div className="calendar-auth-container">
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
          <div className="card" style={{ marginBottom: '16px', backgroundColor: '#dcfce7', borderLeft: '4px solid #10b981' }}>
            <div style={{ padding: '12px 16px' }}>
              <i className="fas fa-user-shield" style={{ color: '#10b981', marginRight: '8px' }}></i>
              <strong>Calendar Admin Mode Active</strong> - Click on any day to edit schedules
            </div>
          </div>
        )}

        {/* Calendar Display */}
        <div id="calendarContainer" className="calendar-container">
          {currentView === 'month' && renderMonthView()}
          {currentView === 'week' && (
            <div className="week-view-container">
              <p className="no-entries">Week view coming soon - will show detailed daily schedules for the selected week.</p>
            </div>
          )}
          {currentView === 'day' && (
            <div className="day-view-container">
              <p className="no-entries">Day view coming soon - will show hourly breakdown and detailed staff assignments.</p>
            </div>
          )}
        </div>

        {/* Schedule Modal */}
        {renderScheduleModal()}

        {/* Admin Login Modal */}
        {showAdminModal && (
          <div className="modal-overlay active" onClick={() => setShowAdminModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Calendar Admin Login</h3>
                <button className="modal-close" onClick={() => setShowAdminModal(false)}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="calPassword">Password:</label>
                  <input
                    type="password"
                    id="calPassword"
                    className="form-control"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAdminLogin()}
                    placeholder="Enter admin password"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowAdminModal(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleAdminLogin}>
                  <i className="fas fa-sign-in-alt"></i> Login
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
