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

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

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

  const handleDayClick = (dateObject) => {
    const schedule = getCalculatedScheduleForDay(dateObject, monthlySchedules, unifiedTechnicianData);
    setSelectedDaySchedule({ date: dateObject, schedule });
  };

  const closeModal = () => {
    setSelectedDaySchedule(null);
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
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <span className="close" onClick={closeModal}>&times;</span>
          <h2>{dateString}</h2>
          <div className="view-content">
            <h3>Notes:</h3>
            <div className="view-notes">{schedule.notes || 'No notes for this day.'}</div>

            <h3>{primaryHeaderText}</h3>
            <div className="view-staff-list">
              {primaryList.length > 0 ? (
                primaryList.map((s, idx) => (
                  <div key={idx} className={`view-staff-item status-${s.status}`}>
                    {s.name}: {formatStatus(s)}
                  </div>
                ))
              ) : (
                <p>None</p>
              )}
            </div>

            <h3>{secondaryHeaderText}</h3>
            <div className="view-staff-list">
              {secondaryList.length > 0 ? (
                secondaryList.map((s, idx) => (
                  <div key={idx} className={`view-staff-item status-${s.status}`}>
                    {s.name}: {formatStatus(s)}
                  </div>
                ))
              ) : (
                <p>None</p>
              )}
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
          <p>Loading calendar...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="tab-content active">
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
              className={`btn ${currentView === 'day' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => switchView('day')}
            >
              Day
            </button>
            <button
              className={`btn ${currentView === 'week' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => switchView('week')}
            >
              Week
            </button>
            <button
              className={`btn ${currentView === 'month' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => switchView('month')}
            >
              Month
            </button>
          </div>
        </div>

        <div id="calendarContainer">
          {currentView === 'month' && renderMonthView()}
          {currentView === 'week' && <div style={{ padding: '40px', textAlign: 'center' }}>Week view coming soon</div>}
          {currentView === 'day' && <div style={{ padding: '40px', textAlign: 'center' }}>Day view coming soon</div>}
        </div>

        {renderScheduleModal()}
      </div>
    </Layout>
  );
};

export default Calendar;
