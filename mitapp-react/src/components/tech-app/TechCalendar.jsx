import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';

const TechCalendar = () => {
  const [selectedView, setSelectedView] = useState('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [scheduleData, setScheduleData] = useState({});
  const [recurringRules, setRecurringRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const { currentUser } = useAuth();

  useEffect(() => {
    loadScheduleData();
  }, [currentDate, selectedView, currentUser]);

  const loadScheduleData = async () => {
    if (!currentUser?.userId) return;

    setLoading(true);
    try {
      // Load recurring rules for this tech
      const rulesDoc = await getDoc(doc(db, 'hou_recurring_rules', currentUser.userId));
      if (rulesDoc.exists()) {
        setRecurringRules(rulesDoc.data().rules || []);
      }

      // Load specific schedule overrides
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
        schedules[doc.id] = doc.data();
      });

      setScheduleData(schedules);
    } catch (error) {
      console.error('Error loading schedule:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStartOfPeriod = (date, view) => {
    const d = new Date(date);
    if (view === 'week') {
      const day = d.getDay();
      d.setDate(d.getDate() - day);
    } else if (view === 'month') {
      d.setDate(1);
    }
    return d;
  };

  const getEndOfPeriod = (date, view) => {
    const d = new Date(date);
    if (view === 'week') {
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

  const getStatusForDate = (date) => {
    const dateStr = formatDateForFirestore(date);
    const schedule = scheduleData[dateStr];

    if (schedule?.staffList) {
      const techSchedule = schedule.staffList.find(s => s.technicianId === currentUser.userId);
      if (techSchedule) {
        return {
          status: techSchedule.status || 'Scheduled',
          hours: techSchedule.hours || '8',
          source: 'Specific'
        };
      }
    }

    // Check recurring rules
    const dayOfWeek = date.getDay();
    const weekNumber = getWeekNumber(date);

    for (const rule of recurringRules) {
      if (rule.day !== dayOfWeek) continue;
      if (rule.startDate && new Date(rule.startDate) > date) continue;
      if (rule.endDate && new Date(rule.endDate) < date) continue;

      if (rule.frequency === 'every-week') {
        return {
          status: rule.status || 'Scheduled',
          hours: rule.hours || '8',
          source: 'Recurring'
        };
      } else if (rule.frequency === 'every-other-week') {
        if (weekNumber % 2 === (rule.weekAnchor || 0) % 2) {
          return {
            status: rule.status || 'Scheduled',
            hours: rule.hours || '8',
            source: 'Recurring'
          };
        }
      }
    }

    // Default based on day of week
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    return {
      status: isWeekend ? 'Off' : 'Scheduled',
      hours: isWeekend ? '0' : '8',
      source: 'Default'
    };
  };

  const getWeekNumber = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  };

  const renderWeekView = () => {
    const startOfWeek = getStartOfPeriod(currentDate, 'week');
    const days = [];

    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      const scheduleInfo = getStatusForDate(date);
      const isToday = formatDateForFirestore(date) === formatDateForFirestore(new Date());

      days.push(
        <div key={i} className={`tech-calendar-day ${isToday ? 'today' : ''}`}>
          <div className="tech-day-header">
            <div className="tech-day-name">
              {date.toLocaleDateString('en-US', { weekday: 'short' })}
            </div>
            <div className="tech-day-date">{date.getDate()}</div>
          </div>
          <div className={`tech-day-status status-${scheduleInfo.status.toLowerCase()}`}>
            {scheduleInfo.status}
          </div>
          {scheduleInfo.status !== 'Off' && scheduleInfo.status !== 'Vacation' && (
            <div className="tech-day-hours">{scheduleInfo.hours} hrs</div>
          )}
          <div className="tech-day-source">{scheduleInfo.source}</div>
        </div>
      );
    }

    return <div className="tech-calendar-week">{days}</div>;
  };

  const renderMonthView = () => {
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const startDay = startOfMonth.getDay();
    const daysInMonth = endOfMonth.getDate();

    const days = [];

    // Empty cells for days before month starts
    for (let i = 0; i < startDay; i++) {
      days.push(<div key={`empty-${i}`} className="tech-calendar-day empty"></div>);
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
      const scheduleInfo = getStatusForDate(date);
      const isToday = formatDateForFirestore(date) === formatDateForFirestore(new Date());

      days.push(
        <div key={day} className={`tech-calendar-day compact ${isToday ? 'today' : ''}`}>
          <div className="tech-day-date-compact">{day}</div>
          <div className={`tech-status-badge status-${scheduleInfo.status.toLowerCase()}`}>
            {scheduleInfo.status.charAt(0)}
          </div>
          {scheduleInfo.hours && scheduleInfo.hours !== '0' && (
            <div className="tech-hours-compact">{scheduleInfo.hours}h</div>
          )}
        </div>
      );
    }

    return (
      <div className="tech-calendar-month">
        <div className="tech-month-header">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="tech-month-header-day">{day}</div>
          ))}
        </div>
        <div className="tech-month-grid">{days}</div>
      </div>
    );
  };

  const navigatePeriod = (direction) => {
    const newDate = new Date(currentDate);
    if (selectedView === 'week') {
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
    if (selectedView === 'week') {
      const start = getStartOfPeriod(currentDate, 'week');
      const end = getEndOfPeriod(currentDate, 'week');
      return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    } else if (selectedView === 'month') {
      return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else {
      return currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
  };

  if (loading) {
    return <div className="tech-loading">Loading schedule...</div>;
  }

  return (
    <div className="tech-calendar-container">
      <div className="tech-calendar-controls">
        <div className="tech-view-selector">
          <button
            className={`tech-view-btn ${selectedView === 'week' ? 'active' : ''}`}
            onClick={() => setSelectedView('week')}
          >
            Week
          </button>
          <button
            className={`tech-view-btn ${selectedView === 'month' ? 'active' : ''}`}
            onClick={() => setSelectedView('month')}
          >
            Month
          </button>
        </div>

        <div className="tech-calendar-nav">
          <button className="tech-nav-btn" onClick={() => navigatePeriod(-1)}>
            <i className="fas fa-chevron-left"></i>
          </button>
          <button className="tech-today-btn" onClick={goToToday}>
            Today
          </button>
          <button className="tech-nav-btn" onClick={() => navigatePeriod(1)}>
            <i className="fas fa-chevron-right"></i>
          </button>
        </div>
      </div>

      <div className="tech-calendar-period">
        <h3>{getPeriodLabel()}</h3>
      </div>

      {selectedView === 'week' && renderWeekView()}
      {selectedView === 'month' && renderMonthView()}

      <div className="tech-legend">
        <div className="tech-legend-item">
          <span className="tech-legend-badge status-scheduled"></span>
          <span>Scheduled</span>
        </div>
        <div className="tech-legend-item">
          <span className="tech-legend-badge status-off"></span>
          <span>Off</span>
        </div>
        <div className="tech-legend-item">
          <span className="tech-legend-badge status-vacation"></span>
          <span>Vacation</span>
        </div>
        <div className="tech-legend-item">
          <span className="tech-legend-badge status-sick"></span>
          <span>Sick</span>
        </div>
      </div>
    </div>
  );
};

export default TechCalendar;
