import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useData } from '../../contexts/DataContext';

const WarehouseCalendar = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [scheduleData, setScheduleData] = useState({});
  const { staffingData } = useData();

  useEffect(() => {
    loadScheduleData();
  }, [currentDate]);

  const loadScheduleData = async () => {
    try {
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

      const scheduleQuery = query(
        collection(db, 'hou_schedules'),
        where('date', '>=', formatDateForFirestore(startOfMonth)),
        where('date', '<=', formatDateForFirestore(endOfMonth))
      );

      const snapshot = await getDocs(scheduleQuery);
      const schedules = {};
      snapshot.forEach(doc => {
        schedules[doc.id] = doc.data();
      });

      setScheduleData(schedules);
    } catch (error) {
      console.error('Error loading schedule:', error);
    }
  };

  const formatDateForFirestore = (date) => {
    return date.toISOString().split('T')[0];
  };

  const renderCalendar = () => {
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const startDay = startOfMonth.getDay();
    const daysInMonth = endOfMonth.getDate();

    const days = [];

    // Empty cells
    for (let i = 0; i < startDay; i++) {
      days.push(<div key={`empty-${i}`} className="calendar-day empty"></div>);
    }

    // Days of month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
      const dateStr = formatDateForFirestore(date);
      const schedule = scheduleData[dateStr];
      const isToday = formatDateForFirestore(date) === formatDateForFirestore(new Date());

      const onStaff = schedule?.staffList?.filter(s => s.status !== 'Off' && s.status !== 'Vacation').length || 0;
      const offStaff = schedule?.staffList?.filter(s => s.status === 'Off' || s.status === 'Vacation').length || 0;

      days.push(
        <div key={day} className={`calendar-day ${isToday ? 'today' : ''}`}>
          <div className="calendar-day-number">{day}</div>
          <div className="calendar-day-content">
            <div className="calendar-stat">
              <i className="fas fa-user-check"></i> {onStaff}
            </div>
            <div className="calendar-stat">
              <i className="fas fa-user-times"></i> {offStaff}
            </div>
          </div>
        </div>
      );
    }

    return days;
  };

  const navigateMonth = (direction) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + direction);
    setCurrentDate(newDate);
  };

  return (
    <div className="warehouse-calendar-container">
      <div className="calendar-header">
        <button className="btn btn-secondary" onClick={() => navigateMonth(-1)}>
          <i className="fas fa-chevron-left"></i>
        </button>
        <h2>
          {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </h2>
        <button className="btn btn-secondary" onClick={() => navigateMonth(1)}>
          <i className="fas fa-chevron-right"></i>
        </button>
      </div>

      <div className="calendar-weekdays">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="calendar-weekday">{day}</div>
        ))}
      </div>

      <div className="calendar-grid">
        {renderCalendar()}
      </div>
    </div>
  );
};

export default WarehouseCalendar;
