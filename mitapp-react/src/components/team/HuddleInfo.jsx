import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import firebaseService from '../../services/firebaseService';
import HuddleInfoModal from './HuddleInfoModal';

const HuddleInfo = ({ teamMembers, allZones }) => {
  const { currentUser } = useAuth();
  const isManager = currentUser?.role === 'Manager';

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [huddleEntries, setHuddleEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [currentHuddleData, setCurrentHuddleData] = useState(null);

  useEffect(() => {
    loadHuddleEntries();
  }, []);

  const loadHuddleEntries = async () => {
    try {
      setLoading(true);
      // Load huddle entries for the current month
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();

      // Get entries for 30 days back and 90 days forward
      const entries = await firebaseService.getHuddleEntriesRange(
        new Date(year, month - 1, 1).toISOString().split('T')[0],
        new Date(year, month + 3, 0).toISOString().split('T')[0]
      );

      setHuddleEntries(entries);
    } catch (error) {
      console.error('Error loading huddle entries:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDateClick = async (date) => {
    setSelectedDate(date);

    // Load huddle data for this date
    try {
      const data = await firebaseService.getHuddleInfo(date);
      setCurrentHuddleData(data);
    } catch (error) {
      console.error('Error loading huddle data:', error);
      setCurrentHuddleData(null);
    }

    setShowModal(true);
  };

  const handleSaveHuddle = async (date, huddleData) => {
    try {
      await firebaseService.saveHuddleInfo(date, {
        ...huddleData,
        lastModified: new Date().toISOString(),
        modifiedBy: currentUser?.email || currentUser?.displayName
      });

      // Reload entries
      await loadHuddleEntries();

      alert('Huddle info saved successfully!');
    } catch (error) {
      console.error('Error saving huddle info:', error);
      throw error;
    }
  };

  const handleDeleteHuddle = async (date) => {
    if (!window.confirm('Are you sure you want to delete this huddle entry?')) {
      return;
    }

    try {
      await firebaseService.deleteHuddleInfo(date);
      await loadHuddleEntries();
      alert('Huddle entry deleted successfully!');
    } catch (error) {
      console.error('Error deleting huddle entry:', error);
      alert('Error deleting huddle entry. Please try again.');
    }
  };

  const getEntryForDate = (date) => {
    return huddleEntries.find(e => e.date === date);
  };

  // Generate dates for the next 30 days
  const generateUpcomingDates = () => {
    const dates = [];
    const today = new Date();

    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date.toISOString().split('T')[0]);
    }

    return dates;
  };

  const upcomingDates = generateUpcomingDates();

  if (!isManager) {
    return (
      <div className="huddle-info-container">
        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-lock"></i> Access Restricted</h3>
          </div>
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <i className="fas fa-user-shield" style={{ fontSize: '64px', opacity: 0.3, marginBottom: '16px' }}></i>
            <p>Only managers have access to huddle information management.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="huddle-info-container">
      <div className="card">
        <div className="card-header">
          <h3><i className="fas fa-clipboard-list"></i> Huddle Information Management</h3>
          <button
            className="btn btn-primary"
            onClick={() => handleDateClick(new Date().toISOString().split('T')[0])}
          >
            <i className="fas fa-plus"></i> Create Today's Huddle
          </button>
        </div>

        <div style={{ padding: '24px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <i className="fas fa-spinner fa-spin" style={{ fontSize: '32px', opacity: 0.5 }}></i>
              <p style={{ marginTop: '16px', opacity: 0.7 }}>Loading huddle entries...</p>
            </div>
          ) : (
            <>
              <div className="huddle-info-help" style={{
                background: 'var(--surface-hover)',
                padding: '16px',
                borderRadius: 'var(--radius-lg)',
                marginBottom: '24px',
                borderLeft: '4px solid var(--primary-color)'
              }}>
                <h4 style={{ fontSize: '14px', marginBottom: '8px' }}>
                  <i className="fas fa-info-circle"></i> How to Use
                </h4>
                <ul style={{ fontSize: '13px', paddingLeft: '20px', margin: '8px 0', lineHeight: '1.6' }}>
                  <li>Click on any date to create or edit huddle information</li>
                  <li>Fill out the categories you want to include</li>
                  <li>Toggle visibility for supervisors per category</li>
                  <li>Mark attendees from your team and add covering members from other zones</li>
                  <li>Huddle info can be prepared in advance for future dates</li>
                </ul>
              </div>

              <div className="huddle-entries-list">
                <h4 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: '600' }}>
                  <i className="fas fa-calendar-alt"></i> Upcoming Dates (Next 30 Days)
                </h4>

                <div className="huddle-dates-grid">
                  {upcomingDates.map(date => {
                    const entry = getEntryForDate(date);
                    const dateObj = new Date(date + 'T12:00:00');
                    const isToday = date === new Date().toISOString().split('T')[0];
                    const isPast = new Date(date) < new Date(new Date().toISOString().split('T')[0]);

                    return (
                      <div
                        key={date}
                        className={`huddle-date-card ${entry ? 'has-entry' : ''} ${isToday ? 'is-today' : ''} ${isPast ? 'is-past' : ''}`}
                        onClick={() => handleDateClick(date)}
                      >
                        <div className="huddle-date-header">
                          <div className="huddle-date-label">
                            <div className="day-name">{dateObj.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                            <div className="day-number">{dateObj.getDate()}</div>
                            <div className="month-name">{dateObj.toLocaleDateString('en-US', { month: 'short' })}</div>
                          </div>
                          {isToday && <span className="today-badge">Today</span>}
                        </div>

                        <div className="huddle-date-content">
                          {entry ? (
                            <>
                              <div className="huddle-entry-indicator">
                                <i className="fas fa-check-circle"></i>
                                <span>Huddle Prepared</span>
                              </div>
                              {entry.attendees && entry.attendees.length > 0 && (
                                <div className="huddle-attendee-count">
                                  <i className="fas fa-users"></i> {entry.attendees.length + (entry.manualAttendees?.length || 0)} attendees
                                </div>
                              )}
                              {isManager && (
                                <button
                                  className="btn-icon btn-danger btn-small"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteHuddle(date);
                                  }}
                                  title="Delete"
                                  style={{ marginTop: '8px' }}
                                >
                                  <i className="fas fa-trash"></i>
                                </button>
                              )}
                            </>
                          ) : (
                            <div className="huddle-entry-placeholder">
                              <i className="fas fa-plus-circle"></i>
                              <span>Create Huddle</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {showModal && (
        <HuddleInfoModal
          isOpen={showModal}
          onClose={() => {
            setShowModal(false);
            setCurrentHuddleData(null);
          }}
          selectedDate={selectedDate}
          huddleData={currentHuddleData}
          onSave={handleSaveHuddle}
          teamMembers={teamMembers}
          allZones={allZones}
        />
      )}
    </div>
  );
};

export default HuddleInfo;
