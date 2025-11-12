import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';

const TechCalendar = () => {
  const [selectedView, setSelectedView] = useState('my-schedule');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [scheduleData, setScheduleData] = useState({});
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
    await loadScheduleData();
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
        const data = doc.data();
        if (data.rules && Array.isArray(data.rules)) {
          rules.push(...data.rules.map(rule => ({ ...rule, technicianId: doc.id })));
        }
      });
      setRecurringRulesCache(rules);
    } catch (error) {
      console.error('Error loading recurring rules:', error);
      setRecurringRulesCache([]);
    }
  };

  const loadScheduleData = async () => {
    try {
      const startDate = getStartOfPeriod(currentDate, selectedView);
      const endDate = getEndOfPeriod(currentDate, selectedView);

      const scheduleQuery = query(
        collection(db, 'hou_schedules'),
        where('date', '>=', formatDateForFirestore(startDate)),
        where('date', '<=', formatDateForFirestore(endDate))
      );

      const snapshot = await getDocs(scheduleQuery);
      const schedules = {};
      snapshot.forEach(doc => {
        const data = doc.data();
        // Use the date field as the key for easy lookup
        if (data.date) {
          schedules[data.date] = data;
        }
      });

      console.log('Loaded schedule data:', schedules);
      setScheduleData(schedules);
    } catch (error) {
      console.error('Error loading schedule:', error);
    }
  };

  const getStartOfPeriod = (date, view) => {
    const d = new Date(date);
    if (view === 'week' || view === 'my-schedule') {
      const day = d.getDay();
      d.setDate(d.getDate() - day);
    } else if (view === 'month') {
      d.setDate(1);
    }
    return d;
  };

  const getEndOfPeriod = (date, view) => {
    const d = new Date(date);
    if (view === 'week' || view === 'my-schedule') {
      const day = d.getDay();
      d.setDate(d.getDate() + (6 - day));
    } else if (view === 'month') {
      d.setMonth(d.getMonth() + 1);
      d.setDate(0);
    }
    return d;
  };

  const formatDateForFirestore = (date) => {
    return date.toISOString().split('T')[0];
  };

  const getWeekNumber = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  };

  const getDefaultStatusForPerson = (person, dateObject) => {
    const dayKey = dateObject.getDay();
    const isWeekend = dayKey === 0 || dayKey === 6;
    const weekNumber = getWeekNumber(dateObject);
    let status = isWeekend ? 'Off' : 'Scheduled';
    let hours = '';

    const personRules = recurringRulesCache.filter(r => r.technicianId === person.id);

    if (personRules.length > 0) {
      for (const rule of personRules) {
        const ruleStartDate = rule.startDate ? new Date(rule.startDate) : null;
        const ruleEndDate = rule.endDate ? new Date(rule.endDate) : null;
        if ((!ruleStartDate || dateObject >= ruleStartDate) && (!ruleEndDate || dateObject <= ruleEndDate)) {
          if (rule.days && rule.days.includes(dayKey)) {
            let appliesThisWeek = true;
            if (rule.frequency === 'every-other-week') {
              appliesThisWeek = (weekNumber % 2) === ((rule.weekAnchor || 0) % 2);
            }
            if (appliesThisWeek) {
              status = rule.status || 'Scheduled';
              hours = rule.hours || '';
              break;
            }
          }
        }
      }
    }
    return { status, hours };
  };

  const getCalculatedScheduleForDay = (dateObject) => {
    const dateStr = formatDateForFirestore(dateObject);
    const specificDaySchedule = scheduleData[dateStr];

    console.log('Getting schedule for date:', dateStr, 'Found:', specificDaySchedule);

    const calculatedSchedule = {
      notes: specificDaySchedule?.notes || '',
      staff: []
    };

    for (const staffMember of allTechs) {
      if (!staffMember) continue;
      const { status: defaultStatus, hours: defaultHours } = getDefaultStatusForPerson(staffMember, dateObject);
      let personSchedule = { ...staffMember, status: defaultStatus, hours: defaultHours };

      // Check both staffList and staff for compatibility
      const staffArray = specificDaySchedule?.staffList || specificDaySchedule?.staff || [];
      const specificEntry = staffArray.find(s =>
        s.technicianId === staffMember.id || s.id === staffMember.id
      );

      if (specificEntry) {
        personSchedule.status = specificEntry.status || defaultStatus;
        personSchedule.hours = specificEntry.hours || defaultHours;
      }
      calculatedSchedule.staff.push(personSchedule);
    }

    calculatedSchedule.staff.sort((a, b) => a.name.localeCompare(b.name));
    return calculatedSchedule;
  };

  const formatNameCompact = (fullName) => {
    if (!fullName) return '';
    const parts = fullName.split(' ');
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1].charAt(0)}.` : parts[0];
  };

  const formatStatus = (s) => {
    let statusText = (s.status || '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    if (s.hours) statusText += ` (${s.hours}h)`;
    return statusText;
  };

  const navigatePeriod = (direction) => {
    const newDate = new Date(currentDate);
    if (selectedView === 'week' || selectedView === 'my-schedule') {
      newDate.setDate(newDate.getDate() + (direction * 7));
    } else if (selectedView === 'month') {
      newDate.setMonth(newDate.getMonth() + direction);
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
      const start = getStartOfPeriod(currentDate, selectedView);
      const end = getEndOfPeriod(currentDate, selectedView);
      return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    } else if (selectedView === 'month') {
      return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else {
      return currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
  };

  const renderMyScheduleView = () => {
    const startOfWeek = getStartOfPeriod(currentDate, 'my-schedule');
    const days = [];

    for (let i = 0; i < 7; i++) {
      const day = new Date(startOfWeek);
      day.setDate(startOfWeek.getDate() + i);
      const schedule = getCalculatedScheduleForDay(day);
      const mySchedule = schedule.staff.find(s => s.id === currentUser?.userId);
      const isToday = formatDateForFirestore(day) === formatDateForFirestore(new Date());

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
              <div className={`tech-status-badge large status-${mySchedule.status.toLowerCase().replace(' ', '-')}`}>
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

  const getStatusIcon = (status) => {
    const statusLower = (status || '').toLowerCase();
    if (statusLower.includes('off')) return 'fa-moon';
    if (statusLower.includes('vacation')) return 'fa-umbrella-beach';
    if (statusLower.includes('sick')) return 'fa-heartbeat';
    if (statusLower.includes('scheduled')) return 'fa-briefcase';
    return 'fa-calendar-check';
  };

  const renderDayView = (dateToRender = null) => {
    const dateForView = dateToRender || currentDate;
    const schedule = getCalculatedScheduleForDay(dateForView);
    const isWeekend = [0, 6].includes(dateForView.getDay());
    const offStatuses = ['off', 'sick', 'vacation', 'no-call-no-show'];

    const primaryList = isWeekend
      ? schedule.staff.filter(s => s.status?.toLowerCase() === 'scheduled' || s.hours)
      : schedule.staff.filter(s => offStatuses.includes(s.status?.toLowerCase()) || s.hours);

    const secondaryList = isWeekend
      ? schedule.staff.filter(s => offStatuses.includes(s.status?.toLowerCase()) && !s.hours)
      : schedule.staff.filter(s => s.status?.toLowerCase() === 'scheduled' && !s.hours);

    const primaryHeaderText = isWeekend ? "Working Today" : "Scheduled Off / Custom";
    const secondaryHeaderText = isWeekend ? "Scheduled Off" : "Working Today";

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
                <div key={idx} className={`tech-staff-item status-${s.status?.toLowerCase().replace(' ', '-')}`}>
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
                <div key={idx} className={`tech-staff-item status-${s.status?.toLowerCase().replace(' ', '-')}`}>
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

  const renderWeekView = () => {
    const startOfWeek = getStartOfPeriod(currentDate, 'week');
    const days = [];

    for (let i = 0; i < 7; i++) {
      const day = new Date(startOfWeek);
      day.setDate(startOfWeek.getDate() + i);
      const schedule = getCalculatedScheduleForDay(day);
      const isToday = formatDateForFirestore(day) === formatDateForFirestore(new Date());
      const isWeekend = [0, 6].includes(day.getDay());
      const offStatuses = ['off', 'sick', 'vacation', 'no-call-no-show'];

      const staffToShow = isWeekend
        ? schedule.staff.filter(s => s.status?.toLowerCase() === 'scheduled' || s.hours)
        : schedule.staff.filter(s => offStatuses.includes(s.status?.toLowerCase()) || s.hours);

      days.push(
        <div key={i} className={`tech-week-day ${isToday ? 'today' : ''}`}>
          <div className="tech-week-day-header">
            <div className="tech-week-day-name">{day.toLocaleDateString('en-US', { weekday: 'long' })}</div>
            <div className="tech-week-day-date">{day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
          </div>
          <div className="tech-week-day-body">
            {staffToShow.length > 0 ? (
              staffToShow.map((s, idx) => (
                <div key={idx} className={`tech-compact-item status-${s.status?.toLowerCase().replace(' ', '-')}`}>
                  <span className="tech-compact-name">{formatNameCompact(s.name)}</span>
                  <span className="tech-compact-status">{formatStatus(s)}</span>
                </div>
              ))
            ) : (
              <p className="tech-no-special">No special schedule</p>
            )}
            {schedule.notes && (
              <div className="tech-week-notes">
                <i className="fas fa-sticky-note"></i> {schedule.notes}
              </div>
            )}
          </div>
        </div>
      );
    }

    return <div className="tech-week-grid">{days}</div>;
  };

  const renderMonthView = () => {
    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const days = [];

    // Empty cells
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="tech-month-day empty"></div>);
    }

    // Days of month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
      const schedule = getCalculatedScheduleForDay(date);
      const isToday = formatDateForFirestore(date) === formatDateForFirestore(new Date());
      const isWeekend = [0, 6].includes(date.getDay());
      const offStatuses = ['off', 'sick', 'vacation', 'no-call-no-show'];

      const staffToShow = isWeekend
        ? schedule.staff.filter(s => s.status?.toLowerCase() === 'scheduled' || s.hours)
        : schedule.staff.filter(s => offStatuses.includes(s.status?.toLowerCase()) || s.hours);

      days.push(
        <div
          key={day}
          className={`tech-month-day ${isToday ? 'today' : ''}`}
          onClick={() => setViewModalData({ date, schedule })}
        >
          <div className="tech-month-day-number">{day}</div>
          <div className="tech-month-day-content">
            {staffToShow.slice(0, 3).map((s, idx) => (
              <div key={idx} className={`tech-mini-badge status-${s.status?.toLowerCase().replace(' ', '-')}`}>
                {formatNameCompact(s.name)}
              </div>
            ))}
            {staffToShow.length > 3 && (
              <div className="tech-more-indicator">+{staffToShow.length - 3}</div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="tech-month-view">
        <div className="tech-month-header">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="tech-month-header-day">{day}</div>
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
