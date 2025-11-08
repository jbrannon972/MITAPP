import { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isPast, isFuture, isToday, getDay, nextSaturday, nextSunday } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import firebaseService from '../../services/firebaseService';
import { getCalculatedScheduleForDay } from '../../utils/calendarManager';
import { useData } from '../../contexts/DataContext';

const HuddleCalendar = () => {
  const { staffingData, unifiedTechnicianData } = useData();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [huddleData, setHuddleData] = useState({});
  const [attendanceData, setAttendanceData] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedHuddle, setSelectedHuddle] = useState(null);
  const [showModal, setShowModal] = useState(false);

  // Helper function to generate consistent zone IDs from zone names (same as HuddleInfoModal)
  const generateZoneId = (zoneName) => {
    if (!zoneName) return null;
    // Convert "Zone 3" → "zone_3", "2nd Shift" → "2nd_shift", etc.
    return zoneName.toLowerCase().replace(/\s+/g, '_');
  };

  // Load huddle data for current month
  useEffect(() => {
    loadMonthData();
  }, [currentMonth, staffingData]);

  const loadMonthData = async () => {
    setLoading(true);
    try {
      const start = startOfMonth(currentMonth);
      const end = endOfMonth(currentMonth);
      const days = eachDayOfInterval({ start, end });

      const huddlePromises = days.map(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        return firebaseService.getDocument('hou_huddle_content', dateStr);
      });

      const attendancePromises = days.flatMap(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        return (staffingData?.zones || []).map(zone => {
          // Generate zone ID same way as HuddleInfoModal does
          const zoneId = zone.id || generateZoneId(zone.name);
          const attendanceId = `${dateStr}_${zoneId}`;
          return firebaseService.getDocument('hou_huddle_attendance', attendanceId);
        });
      });

      const [huddleResults, attendanceResults] = await Promise.all([
        Promise.all(huddlePromises),
        Promise.all(attendancePromises)
      ]);

      // Build huddle data map
      const huddleMap = {};
      days.forEach((day, idx) => {
        const dateStr = format(day, 'yyyy-MM-dd');
        if (huddleResults[idx]) {
          huddleMap[dateStr] = huddleResults[idx];
        }
      });

      // Build attendance data map
      const attendanceMap = {};
      attendanceResults.forEach(attendance => {
        if (attendance && attendance.date) {
          if (!attendanceMap[attendance.date]) {
            attendanceMap[attendance.date] = [];
          }
          attendanceMap[attendance.date].push(attendance);
        }
      });

      setHuddleData(huddleMap);
      setAttendanceData(attendanceMap);
    } catch (error) {
      console.error('Error loading month data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDayClick = async (day) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    let huddle = huddleData[dateStr];
    const attendance = attendanceData[dateStr] || [];

    // Auto-populate weekend schedule for Thursdays
    if (getDay(day) === 4) { // Thursday
      console.log('📅 Detected Thursday:', dateStr);
      const weekend = {
        saturday: nextSaturday(day),
        sunday: nextSunday(day)
      };

      // Load weekend schedule from calendar data
      console.log('🔍 Loading weekend schedule from calendar...');

      try {
        // Get month/year for Saturday
        const saturdayMonth = weekend.saturday.getMonth();
        const saturdayYear = weekend.saturday.getFullYear();

        // Get month/year for Sunday (might be different month)
        const sundayMonth = weekend.sunday.getMonth();
        const sundayYear = weekend.sunday.getFullYear();

        // Load schedule data for both months
        const saturdayMonthSchedules = await firebaseService.getScheduleDataForMonth(saturdayYear, saturdayMonth);
        const sundayMonthSchedules = saturdayMonth === sundayMonth
          ? saturdayMonthSchedules
          : await firebaseService.getScheduleDataForMonth(sundayYear, sundayMonth);

        console.log('📅 Loaded schedule data for months');

        // Get calculated schedule for Saturday
        const saturdaySchedule = getCalculatedScheduleForDay(weekend.saturday, saturdayMonthSchedules, unifiedTechnicianData);
        const saturdayWorking = saturdaySchedule.staff.filter(s =>
          s.status === 'on' || (s.hours && s.hours.trim() !== '')
        ).map(s => ({
          name: s.name,
          hours: s.hours || '',
          zone: s.zone || '',
          office: s.office || ''
        }));

        console.log('🗓️ Saturday working:', saturdayWorking);

        // Get calculated schedule for Sunday
        const sundaySchedule = getCalculatedScheduleForDay(weekend.sunday, sundayMonthSchedules, unifiedTechnicianData);
        const sundayWorking = sundaySchedule.staff.filter(s =>
          s.status === 'on' || (s.hours && s.hours.trim() !== '')
        ).map(s => ({
          name: s.name,
          hours: s.hours || '',
          zone: s.zone || '',
          office: s.office || ''
        }));

        console.log('🗓️ Sunday working:', sundayWorking);

        const schedule = {
          saturday: {
            staff: saturdayWorking,
            notes: saturdaySchedule.notes || ''
          },
          sunday: {
            staff: sundayWorking,
            notes: sundaySchedule.notes || ''
          }
        };

        console.log('📦 Weekend schedule data:', schedule);

      // If we have staff scheduled, populate it
      if (schedule.saturday.staff.length > 0 || schedule.sunday.staff.length > 0) {
        console.log('✅ Found weekend schedule, formatting...');
        const formattedContent = formatWeekendSchedule(schedule, weekend);
        console.log('📝 Formatted content:', formattedContent);

        // If there's no huddle content yet, create it with the weekend schedule
        if (!huddle) {
          console.log('Creating new huddle with weekend schedule');
          huddle = {
            date: dateStr,
            categories: {
              announcements: { content: '', visible: true },
              reminders: { content: '', visible: true },
              trainingTopic: { content: '', visible: true },
              safetyTopic: { content: '', visible: true },
              huddleTopic: { content: '', visible: true },
              weekendStaffing: { content: formattedContent, visible: true }
            }
          };
        } else if (!huddle.categories?.weekendStaffing?.content || huddle.categories.weekendStaffing.content.trim() === '') {
          // If huddle exists but weekend staffing is empty, populate it
          console.log('Populating existing huddle with weekend schedule');
          huddle = {
            ...huddle,
            categories: {
              ...huddle.categories,
              weekendStaffing: {
                ...huddle.categories?.weekendStaffing,
                content: formattedContent,
                visible: true
              }
            }
          };
        } else {
          console.log('Huddle already has weekend staffing content, skipping');
        }
      } else {
        console.log('⚠️ No staff scheduled for weekend');
      }
      } catch (error) {
        console.error('Error loading weekend schedule from calendar:', error);
      }
    }

    setSelectedHuddle({
      date: day,
      dateStr,
      huddle,
      attendance,
      isPast: isPast(day) && !isToday(day),
      isFuture: isFuture(day) || isToday(day)
    });
    setShowModal(true);
  };

  // Format weekend schedule as markdown (same as HuddleManager)
  const formatWeekendSchedule = (schedule, weekend) => {
    let content = `## Weekend Schedule\n\n`;
    content += `📅 ${format(weekend.saturday, 'EEEE, MMMM d, yyyy')}\n\n`;

    if (schedule.saturday.staff && schedule.saturday.staff.length > 0) {
      content += `**Staff on duty:**\n`;
      schedule.saturday.staff.forEach(person => {
        // Build the staff line with name, zone tag, and hours
        let line = `- ${person.name}`;

        // Add zone tag in parentheses
        if (person.zone) {
          line += ` (${person.zone})`;
        }

        // Add hours if available
        if (person.hours) {
          line += ` - ${person.hours}`;
        }

        content += `${line}\n`;
      });
    } else {
      content += `*No staff scheduled*\n`;
    }

    if (schedule.saturday.notes) {
      content += `\n**Notes:** ${schedule.saturday.notes}\n`;
    }

    content += `\n---\n\n`;
    content += `📅 ${format(weekend.sunday, 'EEEE, MMMM d, yyyy')}\n\n`;

    if (schedule.sunday.staff && schedule.sunday.staff.length > 0) {
      content += `**Staff on duty:**\n`;
      schedule.sunday.staff.forEach(person => {
        // Build the staff line with name, zone tag, and hours
        let line = `- ${person.name}`;

        // Add zone tag in parentheses
        if (person.zone) {
          line += ` (${person.zone})`;
        }

        // Add hours if available
        if (person.hours) {
          line += ` - ${person.hours}`;
        }

        content += `${line}\n`;
      });
    } else {
      content += `*No staff scheduled*\n`;
    }

    if (schedule.sunday.notes) {
      content += `\n**Notes:** ${schedule.sunday.notes}\n`;
    }

    return content;
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedHuddle(null);
  };

  const navigateMonth = (direction) => {
    setCurrentMonth(prev => direction === 'next' ? addMonths(prev, 1) : subMonths(prev, 1));
  };

  const renderCalendarDays = () => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });

    // Add empty cells for days before month starts
    const startDayOfWeek = start.getDay();
    const emptyDays = Array(startDayOfWeek).fill(null);

    return [...emptyDays, ...days].map((day, idx) => {
      if (!day) {
        return <div key={`empty-${idx}`} className="calendar-day empty"></div>;
      }

      const dateStr = format(day, 'yyyy-MM-dd');
      const hasHuddle = !!huddleData[dateStr];
      const hasAttendance = (attendanceData[dateStr] || []).length > 0;
      const dayIsPast = isPast(day) && !isToday(day);
      const dayIsToday = isToday(day);

      return (
        <div
          key={dateStr}
          className={`calendar-day ${dayIsToday ? 'today' : ''} ${hasHuddle ? 'has-huddle' : ''} ${hasAttendance ? 'has-attendance' : ''}`}
          onClick={() => handleDayClick(day)}
        >
          <div className="day-number">{format(day, 'd')}</div>
          {hasHuddle && (
            <div className="day-indicator">
              <i className="fas fa-comments"></i>
            </div>
          )}
          {hasAttendance && (
            <div className="attendance-badge">
              {attendanceData[dateStr].length}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="huddle-calendar-container">
      <div className="calendar-header">
        <button className="btn btn-secondary" onClick={() => navigateMonth('prev')}>
          <i className="fas fa-chevron-left"></i>
        </button>
        <h2>{format(currentMonth, 'MMMM yyyy')}</h2>
        <button className="btn btn-secondary" onClick={() => navigateMonth('next')}>
          <i className="fas fa-chevron-right"></i>
        </button>
      </div>

      <div className="calendar-legend">
        <span><i className="fas fa-comments"></i> Has Huddle Content</span>
        <span><i className="fas fa-check-circle"></i> Attendance Recorded</span>
      </div>

      {loading ? (
        <div className="loading">Loading huddles...</div>
      ) : (
        <div className="calendar-grid">
          <div className="calendar-weekdays">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="weekday-label">{day}</div>
            ))}
          </div>
          <div className="calendar-days">
            {renderCalendarDays()}
          </div>
        </div>
      )}

      {showModal && selectedHuddle && (
        <HuddleDetailModal
          huddle={selectedHuddle}
          onClose={closeModal}
          onRefresh={loadMonthData}
          staffingData={staffingData}
          generateZoneId={generateZoneId}
        />
      )}
    </div>
  );
};

// Modal component to show huddle details
const HuddleDetailModal = ({ huddle, onClose, onRefresh, staffingData, generateZoneId }) => {
  const [editingLateCoverage, setEditingLateCoverage] = useState(null); // { recordIdx, personId, personName }
  const [coverageDate, setCoverageDate] = useState('');
  const [saving, setSaving] = useState(false);

  if (!huddle) return null;

  const { date, dateStr, huddle: huddleContent, attendance, isPast, isFuture } = huddle;

  const handleMarkCoveredLater = (recordIdx, person) => {
    setEditingLateCoverage({ recordIdx, personId: person.id, personName: person.name });
    // Default to today's date
    setCoverageDate(format(new Date(), 'yyyy-MM-dd'));
  };

  const saveCoverLater = async () => {
    if (!editingLateCoverage || !coverageDate) return;

    setSaving(true);
    try {
      const record = attendance[editingLateCoverage.recordIdx];
      const attendanceId = `${dateStr}_${record.zoneId}`;

      // Get existing attendance document
      const existingDoc = await firebaseService.getDocument('hou_huddle_attendance', attendanceId);

      // Add to coveredLater array
      const coveredLater = existingDoc.coveredLater || [];
      const existingIndex = coveredLater.findIndex(c => c.techId === editingLateCoverage.personId);

      if (existingIndex >= 0) {
        // Update existing entry
        coveredLater[existingIndex].coverageDate = coverageDate;
      } else {
        // Add new entry
        coveredLater.push({
          techId: editingLateCoverage.personId,
          techName: editingLateCoverage.personName,
          coverageDate
        });
      }

      // Save back
      await firebaseService.saveDocument('hou_huddle_attendance', attendanceId, {
        ...existingDoc,
        coveredLater
      });

      setEditingLateCoverage(null);
      setCoverageDate('');
      // Refresh the view
      onRefresh();
    } catch (error) {
      console.error('Error saving late coverage:', error);
      alert('Error saving late coverage. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const renderContent = () => {
    if (isFuture) {
      // Future huddle - show preview of content
      return (
        <div className="huddle-detail-content">
          <div style={{ marginBottom: '20px', padding: '12px', backgroundColor: 'var(--background-secondary)', borderRadius: '8px' }}>
            <p style={{ margin: 0, fontSize: '14px' }}>
              <i className="fas fa-info-circle"></i> Preview of huddle content. Go to "Huddle Info" tab to edit.
            </p>
          </div>

          {huddleContent && huddleContent.categories ? (
            <div className="huddle-content-preview">
              {Object.entries(huddleContent.categories).map(([key, category]) => {
                if (category.visible && category.content && category.content.trim()) {
                  return (
                    <div key={key} style={{ marginBottom: '24px', padding: '16px', border: '1px solid var(--border-color)', borderRadius: '8px', maxWidth: '100%', overflowWrap: 'break-word' }}>
                      <h4 style={{ marginTop: 0, marginBottom: '12px', color: 'var(--primary-color)', overflowWrap: 'break-word' }}>
                        {getCategoryIcon(key)} {getCategoryTitle(key)}
                      </h4>
                      <div className="markdown-content" style={{ fontSize: '14px', lineHeight: '1.6', maxWidth: '100%' }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {category.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  );
                }
                return null;
              })}

              {huddleContent.referenceLinks && huddleContent.referenceLinks.length > 0 && (
                <div style={{ marginBottom: '16px', padding: '16px', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                  <h4 style={{ marginTop: 0, marginBottom: '12px', color: 'var(--primary-color)' }}>
                    <i className="fas fa-link"></i> Reference Links
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: '20px' }}>
                    {huddleContent.referenceLinks.map((link, idx) => (
                      <li key={idx}>
                        <a href={link.url} target="_blank" rel="noopener noreferrer">
                          {link.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="content-summary">
              <p><strong>Status:</strong> <span className="status-badge warning">No Content</span></p>
              <p className="hint">
                <i className="fas fa-info-circle"></i> Go to "Huddle Info" tab to add content for this date
              </p>
            </div>
          )}
        </div>
      );
    }

    if (isPast) {
      // Past huddle - show attendance by zone
      return (
        <div className="huddle-attendance-summary">
          <h3>Attendance by Zone</h3>
          {attendance.length === 0 ? (
            <p className="no-attendance">No attendance recorded for this huddle.</p>
          ) : (
            <div className="zones-attendance">
              {attendance.map((record, idx) => {
                // Find zone by matching generated ID or zone name
                const zone = staffingData?.zones?.find(z => {
                  const zId = z.id || generateZoneId(z.name);
                  return zId === record.zoneId;
                });
                const zoneMembers = zone?.members || [];
                const zoneLead = zone?.lead;
                const allZonePersonnel = [...zoneMembers];
                if (zoneLead) allZonePersonnel.push(zoneLead);

                const presentNames = [];
                // Add zone members who were present
                allZonePersonnel.forEach(person => {
                  if (record.present.includes(person.id)) {
                    presentNames.push({ name: person.name, fromOtherZone: false });
                  }
                });

                // Add manually added members from other zones
                record.manuallyAdded?.forEach(person => {
                  presentNames.push({ name: person.name, fromOtherZone: true, originalZone: person.originalZone });
                });

                const absentMembers = allZonePersonnel.filter(person => !record.present.includes(person.id));

                return (
                  <div key={idx} className="zone-attendance-card">
                    <div className="zone-attendance-header">
                      <h4>{record.zoneName}</h4>
                      <span className="attendance-count">
                        {presentNames.length}/{allZonePersonnel.length + (record.manuallyAdded?.length || 0)} present
                      </span>
                    </div>

                    <div className="attendance-lists">
                      <div className="present-list">
                        <h5><i className="fas fa-check-circle" style={{ color: 'var(--success-color)' }}></i> Present</h5>
                        {presentNames.length === 0 ? (
                          <p className="empty-list">No one marked present</p>
                        ) : (
                          <ul>
                            {presentNames.map((person, personIdx) => (
                              <li key={personIdx}>
                                {person.name}
                                {person.fromOtherZone && (
                                  <span className="zone-tag"> (from {person.originalZone})</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="absent-list">
                        <h5><i className="fas fa-times-circle" style={{ color: 'var(--error-color)' }}></i> Absent</h5>
                        {absentMembers.length === 0 ? (
                          <p className="empty-list">Everyone present</p>
                        ) : (
                          <ul>
                            {absentMembers.map((person, personIdx) => {
                              // Check if this person was covered later
                              const coveredInfo = (record.coveredLater || []).find(c => c.techId === person.id);

                              return (
                                <li key={personIdx} className="absent-member" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                  <div>
                                    <span>{person.name}</span>
                                    {coveredInfo && (
                                      <span style={{
                                        marginLeft: '8px',
                                        fontSize: '12px',
                                        color: 'var(--success-color)',
                                        fontStyle: 'italic'
                                      }}>
                                        ✓ Covered on {format(new Date(coveredInfo.coverageDate), 'MMM d, yyyy')}
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    className="btn btn-sm btn-secondary"
                                    onClick={() => handleMarkCoveredLater(idx, person)}
                                    style={{ fontSize: '11px', padding: '4px 8px' }}
                                    title={coveredInfo ? 'Update coverage date' : 'Mark as covered later'}
                                  >
                                    <i className="fas fa-calendar-check"></i> {coveredInfo ? 'Update' : 'Covered Later'}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </div>

                    <div className="record-info">
                      <small>
                        Recorded by {record.recordedByName} on {format(new Date(record.recordedAt), 'MMM d, yyyy h:mm a')}
                      </small>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Show huddle content if available */}
          {huddleContent && huddleContent.categories && (
            <div className="huddle-content-reference" style={{ marginTop: '32px' }}>
              <h3 style={{ marginBottom: '16px' }}>Huddle Topics Covered</h3>
              {Object.entries(huddleContent.categories).map(([key, category]) => {
                if (category.visible && category.content && category.content.trim()) {
                  return (
                    <div key={key} style={{ marginBottom: '24px', padding: '16px', border: '1px solid var(--border-color)', borderRadius: '8px', maxWidth: '100%', overflowWrap: 'break-word' }}>
                      <h4 style={{ marginTop: 0, marginBottom: '12px', color: 'var(--primary-color)', overflowWrap: 'break-word' }}>
                        {getCategoryIcon(key)} {getCategoryTitle(key)}
                      </h4>
                      <div className="markdown-content" style={{ fontSize: '14px', lineHeight: '1.6', maxWidth: '100%' }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {category.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Huddle - {format(date, 'MMMM d, yyyy')}</h2>
          <button className="modal-close" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="modal-body">
          {renderContent()}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {/* Late Coverage Date Picker Modal */}
      {editingLateCoverage && (
        <div className="modal-overlay active" onClick={() => setEditingLateCoverage(null)} style={{ zIndex: 1001 }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3>
                <i className="fas fa-calendar-check"></i> Mark as Covered Later
              </h3>
              <button className="modal-close" onClick={() => setEditingLateCoverage(null)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '16px', fontSize: '14px' }}>
                When were the huddle topics covered with <strong>{editingLateCoverage.personName}</strong>?
              </p>
              <div className="form-group">
                <label htmlFor="coverage-date">Coverage Date:</label>
                <input
                  id="coverage-date"
                  type="date"
                  className="form-control"
                  value={coverageDate}
                  onChange={(e) => setCoverageDate(e.target.value)}
                  max={format(new Date(), 'yyyy-MM-dd')}
                  min={dateStr}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setEditingLateCoverage(null)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={saveCoverLater}
                disabled={saving || !coverageDate}
              >
                <i className="fas fa-save"></i> {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper function to get category icons
const getCategoryIcon = (key) => {
  const icons = {
    announcements: '📢',
    reminders: '🔔',
    trainingTopic: '📚',
    safetyTopic: '⚠️',
    huddleTopic: '💬',
    weekendStaffing: '📅'
  };
  return icons[key] || '📋';
};

// Helper function to get readable category titles
const getCategoryTitle = (key) => {
  const titles = {
    announcements: 'Announcements',
    reminders: 'Reminders',
    trainingTopic: 'Training Topic',
    safetyTopic: 'Safety Topic',
    huddleTopic: 'Huddle Topic',
    weekendStaffing: 'Weekend Staffing'
  };
  return titles[key] || key;
};

export default HuddleCalendar;
