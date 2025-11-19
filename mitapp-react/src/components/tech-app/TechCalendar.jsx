import { useState, useEffect } from 'react';
import { collection, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';

/**
 * TechCalendar Component
 *
 * IMPORTANT: This component is synced with Tech App/JS/calendar-manager.js
 * Any changes here should be reflected in the vanilla JS version and vice versa
 *
 * Data Format (matches vanilla JS):
 * - Status values: 'on', 'off', 'sick', 'vacation', 'no-call-no-show' (lowercase)
 * - Recurring frequency: 'weekly', 'every-other'
 * - Schedule structure: { specific: { [dayNumber]: { staff: [], notes: '' } } }
 */

const TechCalendar = () => {
  const [selectedView, setSelectedView] = useState('my-schedule');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [recurringRulesCache, setRecurringRulesCache] = useState([]);
  const [allTechs, setAllTechs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewModalData, setViewModalData] = useState(null);
  const { currentUser } = useAuth();
  const { staffingData } = useData();

  useEffect(() => {
    loadAllData();
  }, [currentDate, selectedView, currentUser, staffingData]);

  const loadAllData = async () => {
    setLoading(true);
    await loadAllTechnicians();
    await loadRecurringRules();
    setLoading(false);
  };

  const loadAllTechnicians = () => {
    if (!staffingData) return;

    const allStaff = [];
    if (staffingData.zones) {
      staffingData.zones.forEach(zone => {
        if (zone.lead) allStaff.push({ ...zone.lead, zone: zone.name });
        if (zone.members) {
          zone.members.forEach(member => {
            allStaff.push({ ...member, zone: zone.name });
          });
        }
      });
    }
    if (staffingData.management) {
      allStaff.push(...staffingData.management.map(m => ({ ...m, zone: 'Management' })));
    }
    setAllTechs(allStaff.filter(Boolean));
  };

  const loadRecurringRules = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'hou_recurring_rules'));
      const rules = [];
      snapshot.forEach(doc => {
        rules.push({ id: doc.id, ...doc.data() });
      });
      setRecurringRulesCache(rules);
    } catch (error) {
      console.error('Error loading recurring rules:', error);
      setRecurringRulesCache([]);
    }
  };

  /**
   * Get week number (matches vanilla JS implementation)
   */
  const getWeekNumber = (dateObj) => {
    const d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  };

  /**
   * Get default status for a person based on recurring rules (matches vanilla JS)
   */
  const getDefaultStatusForPerson = (person, dateObject) => {
    const dayKey = dateObject.getDay();
    const isWeekend = dayKey === 0 || dayKey === 6;
    const weekNumber = getWeekNumber(dateObject);
    let status = isWeekend ? 'off' : 'on'; // LOWERCASE to match vanilla JS
    let hours = '';

    const personRules = recurringRulesCache.filter(r => r.technicianId === person.id);

    if (personRules.length > 0) {
      for (const rule of personRules) {
        const ruleStartDate = rule.startDate ? new Date(rule.startDate) : null;
        const ruleEndDate = rule.endDate ? new Date(rule.endDate) : null;
        if ((!ruleStartDate || dateObject >= ruleStartDate) && (!ruleEndDate || dateObject <= ruleEndDate)) {
          if (rule.days && rule.days.includes(dayKey)) {
            let appliesThisWeek = true;
            if (rule.frequency === 'every-other') { // Match vanilla JS frequency value
              appliesThisWeek = (weekNumber % 2) === ((rule.weekAnchor || 0) % 2);
            }
            if (appliesThisWeek) {
              status = rule.status || 'on';
              hours = rule.hours || '';
              break;
            }
          }
        }
      }
    }
    return { status, hours };
  };

  /**
   * Load schedule data for a month (matches vanilla JS implementation)
   */
  const getScheduleDataForMonth = async (year, month) => {
    const schedulesMap = { specific: {} };
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);
    const startTimestamp = Timestamp.fromDate(firstDayOfMonth);
    const endTimestamp = Timestamp.fromDate(lastDayOfMonth);

    try {
      const snapshot = await getDocs(collection(db, 'hou_schedules'));

      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.date) {
          const dateObj = data.date.toDate();
          // Only include dates in the requested month range
          if (dateObj >= firstDayOfMonth && dateObj <= lastDayOfMonth) {
            schedulesMap.specific[dateObj.getDate()] = data;
          }
        }
      });
    } catch (error) {
      console.error('Error fetching schedule data for month:', error);
    }
    return schedulesMap;
  };

  /**
   * Get calculated schedule for a specific day (matches vanilla JS)
   */
  const getCalculatedScheduleForDay = async (dateObject, monthlySchedules) => {
    const specificDaySchedule = monthlySchedules.specific[dateObject.getDate()];
    const calculatedSchedule = {
      notes: specificDaySchedule?.notes || '',
      staff: []
    };

    for (const staffMember of allTechs) {
      if (!staffMember) continue;
      const { status: defaultStatus, hours: defaultHours } = getDefaultStatusForPerson(staffMember, dateObject);
      let personSchedule = { ...staffMember, status: defaultStatus, hours: defaultHours };

      const specificEntry = specificDaySchedule?.staff?.find(s => s.id === staffMember.id);
      if (specificEntry) {
        personSchedule.status = specificEntry.status;
        personSchedule.hours = specificEntry.hours || '';
      }
      calculatedSchedule.staff.push(personSchedule);
    }

    calculatedSchedule.staff.sort((a, b) => a.name.localeCompare(b.name));
    return calculatedSchedule;
  };

  /**
   * Format name compact (matches vanilla JS)
   */
  const formatNameCompact = (fullName) => {
    if (!fullName) return '';
    const parts = fullName.split(' ');
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1].charAt(0)}.` : parts[0];
  };

  /**
   * Format status (matches vanilla JS)
   */
  const formatStatus = (s) => {
    let statusText = s.status.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    if (s.hours) statusText += ` (${s.hours})`;
    return statusText;
  };

  /**
   * Get day view lists (matches vanilla JS)
   */
  const getDayViewLists = (dateObject, schedule) => {
    const isWeekend = [0, 6].includes(dateObject.getDay());
    const offStatuses = ['off', 'sick', 'vacation', 'no-call-no-show'];
    const primaryHeaderText = isWeekend ? "Working Today" : "Scheduled Off / Custom";
    const secondaryHeaderText = isWeekend ? "Scheduled Off" : "Working Today";
    const primaryList = schedule.staff.filter(s => isWeekend ? (s.status === 'on' || s.hours) : (offStatuses.includes(s.status) || s.hours));
    const secondaryList = schedule.staff.filter(s => isWeekend ? (offStatuses.includes(s.status) && !s.hours) : (s.status === 'on' && !s.hours));
    return { primaryList, secondaryList, primaryHeaderText, secondaryHeaderText };
  };

  const navigatePeriod = (direction) => {
    const newDate = new Date(currentDate);
    if (selectedView === 'month') {
      newDate.setMonth(newDate.getMonth() + direction);
    } else if (selectedView === 'week' || selectedView === 'my-schedule') {
      newDate.setDate(newDate.getDate() + (direction * 7));
    } else {
      newDate.setDate(newDate.getDate() + direction);
    }
    setCurrentDate(newDate);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const getPeriodLabel = () => {
    if (selectedView === 'week' || selectedView === 'my-schedule') {
      const startOfWeek = new Date(currentDate);
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 6);
      return `${startOfWeek.toLocaleDateString()} - ${endOfWeek.toLocaleDateString()}`;
    } else if (selectedView === 'month') {
      return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else {
      return currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
  };

  const getStatusIcon = (status) => {
    const statusLower = (status || '').toLowerCase();
    if (statusLower === 'off') return 'fa-moon';
    if (statusLower === 'vacation') return 'fa-umbrella-beach';
    if (statusLower === 'sick') return 'fa-heartbeat';
    if (statusLower === 'on') return 'fa-briefcase';
    return 'fa-calendar-check';
  };

  /**
   * Render My Schedule View (matches vanilla JS)
   */
  const renderMyScheduleView = async () => {
    const startDate = new Date(currentDate);
    startDate.setDate(startDate.getDate() - startDate.getDay());
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);

    const loggedInUser = currentUser;
    if (!loggedInUser || !loggedInUser.userId) {
      return <p>Could not identify user. Please try logging in again.</p>;
    }

    const techId = loggedInUser.userId;
    const schedulesForStartMonth = await getScheduleDataForMonth(startDate.getFullYear(), startDate.getMonth());
    const schedulesForEndMonth = startDate.getMonth() !== endDate.getMonth()
      ? await getScheduleDataForMonth(endDate.getFullYear(), endDate.getMonth())
      : schedulesForStartMonth;

    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(startDate);
      day.setDate(day.getDate() + i);
      const relevantSchedules = day.getMonth() === startDate.getMonth() ? schedulesForStartMonth : schedulesForEndMonth;
      const schedule = await getCalculatedScheduleForDay(day, relevantSchedules);
      const mySchedule = schedule.staff.find(s => s.id === techId);
      const isToday = day.toDateString() === new Date().toDateString();

      days.push(
        <div key={i} className={`tech-schedule-card ${isToday ? 'today' : ''}`}>
          <div className="tech-schedule-card-header">
            <div className="tech-day-label">
              {day.toLocaleDateString('en-US', { weekday: 'long' })}
            </div>
            <div className="tech-date-label">
              {day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          </div>
          <div className="tech-schedule-card-body">
            {mySchedule ? (
              <div className={`tech-status-badge large status-${mySchedule.status.replace(' ', '-')}`}>
                <i className={`fas ${getStatusIcon(mySchedule.status)}`}></i>
                <span>{formatStatus(mySchedule)}</span>
              </div>
            ) : (
              <div className="tech-status-badge large status-unknown">
                <i className="fas fa-question"></i>
                <span>Not Scheduled</span>
              </div>
            )}
          </div>
        </div>
      );
    }

    return <div className="tech-schedule-grid">{days}</div>;
  };

  /**
   * Render Day View (matches vanilla JS)
   */
  const renderDayView = async (dateToRender = null) => {
    const dateForView = dateToRender || currentDate;
    const monthlySchedules = await getScheduleDataForMonth(dateForView.getFullYear(), dateForView.getMonth());
    const schedule = await getCalculatedScheduleForDay(dateForView, monthlySchedules);
    const { primaryList, secondaryList, primaryHeaderText, secondaryHeaderText } = getDayViewLists(dateForView, schedule);

    return (
      <div className="tech-day-view">
        {schedule.notes && (
          <div className="tech-notes-card">
            <h4><i className="fas fa-sticky-note"></i> Notes</h4>
            <p>{schedule.notes}</p>
          </div>
        )}

        <div className="tech-staff-section">
          <h4>{primaryHeaderText}</h4>
          <div className="tech-staff-list">
            {primaryList.length > 0 ? (
              primaryList.map((s, idx) => (
                <div key={idx} className={`tech-staff-item status-${s.status.replace(' ', '-')}`}>
                  <div className="tech-staff-info">
                    <span className="tech-staff-name">{s.name}</span>
                    <span className="tech-staff-zone">{s.zone}</span>
                  </div>
                  <span className="tech-staff-status">{formatStatus(s)}</span>
                </div>
              ))
            ) : (
              <p className="tech-no-data">None</p>
            )}
          </div>
        </div>

        <div className="tech-staff-section">
          <h4>{secondaryHeaderText}</h4>
          <div className="tech-staff-list">
            {secondaryList.length > 0 ? (
              secondaryList.map((s, idx) => (
                <div key={idx} className={`tech-staff-item status-${s.status.replace(' ', '-')}`}>
                  <div className="tech-staff-info">
                    <span className="tech-staff-name">{s.name}</span>
                    <span className="tech-staff-zone">{s.zone}</span>
                  </div>
                  <span className="tech-staff-status">{formatStatus(s)}</span>
                </div>
              ))
            ) : (
              <p className="tech-no-data">None</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  /**
   * Render Week View (matches vanilla JS)
   */
  const renderWeekView = async () => {
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const monthlySchedules = await getScheduleDataForMonth(currentDate.getFullYear(), currentDate.getMonth());

    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(startOfWeek);
      day.setDate(day.getDate() + i);
      const schedule = await getCalculatedScheduleForDay(day, monthlySchedules);
      const { primaryList, primaryHeaderText } = getDayViewLists(day, schedule);
      const isToday = day.toDateString() === new Date().toDateString();

      const staffListHtml = primaryList.length > 0
        ? primaryList.map((s, idx) => (
            <div key={idx} className={`tech-compact-item staff-${s.status.replace(' ', '-')}`}>
              <span className="tech-compact-name">{formatNameCompact(s.name)}</span>
              <span className="tech-compact-status">{formatStatus(s)}</span>
            </div>
          ))
        : <p className="tech-no-special">No special schedule</p>;

      days.push(
        <div key={i} className={`tech-week-day ${isToday ? 'today' : ''}`}>
          <div className="tech-week-day-header">
            <div className="tech-week-day-name">{day.toLocaleDateString('en-US', { weekday: 'long' })}</div>
            <div className="tech-week-day-date">{day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
          </div>
          <div className="tech-week-day-body">
            <h4>{primaryHeaderText}</h4>
            {staffListHtml}
            {schedule.notes && (
              <div className="tech-week-notes">
                <strong>Notes:</strong> {schedule.notes}
              </div>
            )}
          </div>
        </div>
      );
    }

    return <div className="tech-week-grid">{days}</div>;
  };

  /**
   * Render Month View (matches vanilla JS)
   */
  const renderMonthView = async () => {
    const monthlySchedules = await getScheduleDataForMonth(currentDate.getFullYear(), currentDate.getMonth());
    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const days = [];

    // Empty cells for days before the 1st
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="tech-month-day empty"></div>);
    }

    // Days of month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
      const schedule = await getCalculatedScheduleForDay(date, monthlySchedules);
      const isToday = date.toDateString() === new Date().toDateString();
      const offStatuses = ['off', 'sick', 'vacation', 'no-call-no-show'];
      const isWeekend = [0, 6].includes(date.getDay());

      const staffToDisplay = isWeekend
        ? schedule.staff.filter(s => s.status === 'on' || s.hours)
        : schedule.staff.filter(s => offStatuses.includes(s.status) || s.hours);

      days.push(
        <div
          key={day}
          className={`tech-month-day ${isToday ? 'today' : ''}`}
          onClick={() => setViewModalData({ date, schedule })}
        >
          <div className="tech-month-day-number">{day}</div>
          <div className="tech-month-day-content">
            {staffToDisplay.slice(0, 3).map((s, idx) => (
              <div key={idx} className={`tech-mini-badge staff-${s.status.replace(' ', '-')}`}>
                {formatNameCompact(s.name)}
              </div>
            ))}
            {staffToDisplay.length > 3 && (
              <div className="tech-more-indicator">+{staffToDisplay.length - 3} more</div>
            )}
            {schedule.notes && (
              <div className="tech-month-notes" title={schedule.notes}>
                {schedule.notes}
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="tech-month-view">
        <div className="tech-month-header">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(dayName => (
            <div key={dayName} className="tech-month-header-day">{dayName}</div>
          ))}
        </div>
        <div className="tech-month-grid">{days}</div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="tech-calendar-container">
        <div className="tech-loading">Loading schedule...</div>
      </div>
    );
  }

  return (
    <div className="tech-calendar-container">
      <div className="tech-calendar-header">
        <div className="tech-view-tabs">
          <button
            className={`tech-view-tab ${selectedView === 'my-schedule' ? 'active' : ''}`}
            onClick={() => setSelectedView('my-schedule')}
          >
            My Schedule
          </button>
          <button
            className={`tech-view-tab ${selectedView === 'day' ? 'active' : ''}`}
            onClick={() => setSelectedView('day')}
          >
            Day
          </button>
          <button
            className={`tech-view-tab ${selectedView === 'week' ? 'active' : ''}`}
            onClick={() => setSelectedView('week')}
          >
            Week
          </button>
          <button
            className={`tech-view-tab ${selectedView === 'month' ? 'active' : ''}`}
            onClick={() => setSelectedView('month')}
          >
            Month
          </button>
        </div>

        <div className="tech-calendar-nav">
          <button className="tech-nav-arrow" onClick={() => navigatePeriod(-1)}>
            <i className="fas fa-chevron-left"></i>
          </button>
          <button className="tech-today-btn" onClick={goToToday}>
            Today
          </button>
          <button className="tech-nav-arrow" onClick={() => navigatePeriod(1)}>
            <i className="fas fa-chevron-right"></i>
          </button>
        </div>

        <div className="tech-period-label">
          <h3>{getPeriodLabel()}</h3>
        </div>
      </div>

      <div className="tech-calendar-content">
        {selectedView === 'my-schedule' && renderMyScheduleView()}
        {selectedView === 'day' && renderDayView()}
        {selectedView === 'week' && renderWeekView()}
        {selectedView === 'month' && renderMonthView()}
      </div>

      {viewModalData && (
        <div className="tech-modal-overlay" onClick={() => setViewModalData(null)}>
          <div className="tech-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="tech-modal-close" onClick={() => setViewModalData(null)}>
              <i className="fas fa-times"></i>
            </button>
            <h3>{viewModalData.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</h3>
            {renderDayView(viewModalData.date)}
          </div>
        </div>
      )}
    </div>
  );
};

export default TechCalendar;
