import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { format, getDay, nextSaturday, nextSunday } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import firebaseService from '../../services/firebaseService';
import { getMissedHuddlesForZone } from '../../services/huddleTrackingService';
import { getCalculatedScheduleForDay } from '../../utils/calendarManager';

const HuddleInfoModal = ({ isOpen, onClose, selectedDate = new Date() }) => {
  const { currentUser } = useAuth();
  const { staffingData, unifiedTechnicianData } = useData();

  // Workflow states: 'content', 'attendance', 'coverage'
  const [workflowStep, setWorkflowStep] = useState('content');
  const [huddleContent, setHuddleContent] = useState(null);
  const [attendance, setAttendance] = useState({});
  const [missedTopicsForPresent, setMissedTopicsForPresent] = useState({});
  const [coverageConfirmed, setCoverageConfirmed] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [effectiveZoneId, setEffectiveZoneId] = useState(null); // For zone leads with zones that have no ID

  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const isManager = currentUser?.role === 'Manager';

  // Helper function to generate consistent zone IDs from zone names
  const generateZoneId = (zoneName) => {
    if (!zoneName) return null;
    // Convert "Zone 3" → "zone_3", "2nd Shift" → "2nd_shift", etc.
    return zoneName.toLowerCase().replace(/\s+/g, '_');
  };

  // Get all zones with their techs AND ensure they all have IDs
  const allZonesWithTechs = (staffingData?.zones || []).map(zone => {
    const zoneId = zone.id || generateZoneId(zone.name);
    return {
      ...zone,
      id: zoneId, // Override with generated ID if missing
      allTechs: [...(zone.members || []), ...(zone.lead ? [zone.lead] : [])]
    };
  });

  // Get current user's zone with techs included (single lookup to avoid mismatches)
  const currentUserZoneWithTechs = allZonesWithTechs.find(zone => {
    const isMember = zone.members?.some(member => member.id === currentUser?.userId);
    const isLead = zone.lead?.id === currentUser?.userId;
    return isMember || isLead;
  });


  // Load huddle content when modal opens
  useEffect(() => {
    if (isOpen) {
      loadHuddleData();
      resetWorkflow();
    }
  }, [isOpen, dateStr]);

  const resetWorkflow = () => {
    setWorkflowStep('content');
    setAttendance({});
    setMissedTopicsForPresent({});
    setCoverageConfirmed({});
    setShowManualAdd(false);
    setEffectiveZoneId(null);
  };

  const loadHuddleData = async () => {
    setLoading(true);
    try {
      let content = await firebaseService.getDocument('hou_huddle_content', dateStr);

      // Auto-populate weekend schedule for Thursdays
      if (getDay(selectedDate) === 4) { // Thursday
        console.log('📅 Detected Thursday:', dateStr);
        const weekend = {
          saturday: nextSaturday(selectedDate),
          sunday: nextSunday(selectedDate)
        };

        try {
          // Load weekend schedule from calendar data
          console.log('🔍 Loading weekend schedule from calendar...');

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
            if (!content) {
              console.log('Creating new huddle with weekend schedule');
              content = {
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
            } else if (!content.categories?.weekendStaffing?.content || content.categories.weekendStaffing.content.trim() === '') {
              // If huddle exists but weekend staffing is empty, populate it
              console.log('Populating existing huddle with weekend schedule');
              content = {
                ...content,
                categories: {
                  ...content.categories,
                  weekendStaffing: {
                    ...content.categories?.weekendStaffing,
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

      // Auto-populate recurring reminders
      try {
        const remindersDoc = await firebaseService.getDocument('hou_recurring_reminders', 'config');
        const recurringReminders = remindersDoc?.reminders || [];

        // Check which reminders apply to this date
        const applicableReminders = recurringReminders
          .filter(reminder => {
            if (!reminder.active) return false;
            const dayOfWeek = getDay(selectedDate);
            if (reminder.frequency === 'weekly') {
              return dayOfWeek === reminder.dayOfWeek;
            } else if (reminder.frequency === 'monthly') {
              const dayOfMonth = selectedDate.getDate();
              return dayOfMonth === reminder.dayOfMonth;
            }
            return false;
          })
          .map(reminder => reminder.text)
          .join('\n\n');

        // If we have applicable reminders and no existing reminder content, add them
        if (applicableReminders) {
          if (!content) {
            console.log('Creating new huddle with recurring reminders');
            content = {
              date: dateStr,
              categories: {
                announcements: { content: '', visible: true },
                reminders: { content: applicableReminders, visible: true },
                trainingTopic: { content: '', visible: true },
                safetyTopic: { content: '', visible: true },
                huddleTopic: { content: '', visible: true },
                weekendStaffing: { content: '', visible: true }
              }
            };
          } else if (!content.categories?.reminders?.content || content.categories.reminders.content.trim() === '') {
            // If huddle exists but reminders are empty, populate them
            console.log('Populating existing huddle with recurring reminders');
            content = {
              ...content,
              categories: {
                ...content.categories,
                reminders: {
                  ...content.categories?.reminders,
                  content: applicableReminders,
                  visible: true
                }
              }
            };
          }
        }
      } catch (error) {
        console.error('Error loading recurring reminders:', error);
      }

      setHuddleContent(content);
    } catch (error) {
      console.error('Error loading huddle data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Format weekend schedule as markdown
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

  const handleHuddleComplete = () => {
    // Initialize attendance for all zones (all zones now have consistent IDs)
    const initialAttendance = {};
    allZonesWithTechs.forEach(zone => {
      initialAttendance[zone.id] = {
        zoneName: zone.name,
        present: [],
        manuallyAdded: []
      };
    });

    // Set effective zone ID for zone leads
    if (!isManager && currentUserZoneWithTechs) {
      setEffectiveZoneId(currentUserZoneWithTechs.id);
    }

    setAttendance(initialAttendance);
    setWorkflowStep('attendance');
  };

  const toggleAttendance = (zoneId, techId) => {
    setAttendance(prev => ({
      ...prev,
      [zoneId]: {
        ...prev[zoneId],
        present: prev[zoneId].present.includes(techId)
          ? prev[zoneId].present.filter(id => id !== techId)
          : [...prev[zoneId].present, techId]
      }
    }));
  };

  const addManualMember = (tech, originalZoneId) => {
    // Find a zone to add them to (prefer their original zone if it exists in attendance)
    const targetZoneId = attendance[originalZoneId] ? originalZoneId : Object.keys(attendance)[0];

    setAttendance(prev => ({
      ...prev,
      [targetZoneId]: {
        ...prev[targetZoneId],
        manuallyAdded: [
          ...prev[targetZoneId].manuallyAdded,
          {
            userId: tech.id,
            name: tech.name,
            originalZone: tech.zoneName || 'Unknown'
          }
        ],
        present: [...prev[targetZoneId].present, tech.id]
      }
    }));
    setShowManualAdd(false);
  };

  const removeManualMember = (zoneId, userId) => {
    setAttendance(prev => ({
      ...prev,
      [zoneId]: {
        ...prev[zoneId],
        manuallyAdded: prev[zoneId].manuallyAdded.filter(m => m.userId !== userId),
        present: prev[zoneId].present.filter(id => id !== userId)
      }
    }));
  };

  const handleConfirmAttendance = async () => {
    setSaving(true);
    try {
      // Get all present tech IDs across all zones
      const allPresentTechIds = Object.values(attendance).flatMap(zone => zone.present);

      // Load missed huddles for present techs only
      const missedData = {};
      for (const zone of allZonesWithTechs) {
        const zonePresentTechs = attendance[zone.id]?.present || [];
        if (zonePresentTechs.length > 0) {
          const missed = await getMissedHuddlesForZone(zone.id, zone.name, zonePresentTechs, 30);
          // Only include techs who actually missed huddles
          Object.entries(missed).forEach(([techId, huddles]) => {
            if (huddles.length > 0 && zonePresentTechs.includes(techId)) {
              const tech = zone.allTechs.find(t => t.id === techId);
              if (tech) {
                missedData[techId] = {
                  techName: tech.name,
                  zoneName: zone.name,
                  missedHuddles: huddles
                };
              }
            }
          });
        }
      }

      setMissedTopicsForPresent(missedData);

      // If no one has missed topics, save directly
      if (Object.keys(missedData).length === 0) {
        await saveAttendance();
      } else {
        // Show coverage confirmation screen
        setWorkflowStep('coverage');
      }
    } catch (error) {
      console.error('Error checking missed huddles:', error);
      alert('Error loading missed huddles. Saving attendance anyway...');
      await saveAttendance();
    } finally {
      setSaving(false);
    }
  };

  const toggleCoverageConfirmation = (techId) => {
    setCoverageConfirmed(prev => ({
      ...prev,
      [techId]: !prev[techId]
    }));
  };

  const saveAttendance = async () => {
    setSaving(true);
    try {
      // Save attendance for each zone that has attendees
      const savePromises = Object.entries(attendance)
        .filter(([zoneId, zoneData]) => zoneData.present.length > 0)
        .map(async ([zoneId, zoneData]) => {
          const attendanceId = `${dateStr}_${zoneId}`;
          const attendanceDoc = {
            date: dateStr,
            zoneId,
            zoneName: zoneData.zoneName,
            present: zoneData.present,
            manuallyAdded: zoneData.manuallyAdded || [],
            recordedBy: currentUser.userId,
            recordedByName: currentUser.username,
            recordedAt: new Date().toISOString()
          };
          await firebaseService.saveDocument('hou_huddle_attendance', attendanceId, attendanceDoc);
        });

      await Promise.all(savePromises);
      alert('Huddle attendance saved successfully!');
      onClose();
      resetWorkflow();
    } catch (error) {
      console.error('Error saving attendance:', error);
      alert('Error saving attendance. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleFinalSubmit = async () => {
    // Check if all missed topics have been confirmed
    const unconfirmedTechs = Object.keys(missedTopicsForPresent).filter(techId => !coverageConfirmed[techId]);

    if (unconfirmedTechs.length > 0) {
      const techNames = unconfirmedTechs.map(id => missedTopicsForPresent[id].techName).join(', ');
      if (!confirm(`You haven't confirmed coverage for: ${techNames}\n\nAre you sure you want to continue?`)) {
        return;
      }
    }

    await saveAttendance();
  };

  // Filter visible categories
  const visibleCategories = huddleContent?.categories
    ? Object.entries(huddleContent.categories)
        .filter(([key, cat]) => cat.visible && cat.content && cat.content.trim())
    : [];

  if (!isOpen) return null;

  return (
    <div className={`modal-overlay ${isOpen ? 'active' : ''}`} onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            {workflowStep === 'content' && `Today's Huddle - ${format(selectedDate, 'MMM d, yyyy')}`}
            {workflowStep === 'attendance' && 'Mark Attendance'}
            {workflowStep === 'coverage' && 'Confirm Coverage for Missed Topics'}
          </h2>
          <button className="modal-close" onClick={onClose}><i className="fas fa-times"></i></button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div className="loading">Loading huddle information...</div>
          ) : (
            <>
              {/* STEP 1: Huddle Content */}
              {workflowStep === 'content' && (
                <div className="huddle-content-section">
                  {visibleCategories.length === 0 ? (
                    <div className="no-content" style={{ padding: '40px 20px', textAlign: 'center' }}>
                      <i className="fas fa-info-circle" style={{ fontSize: '48px', color: 'var(--text-secondary)', marginBottom: '16px' }}></i>
                      <p>No huddle information available for this date.</p>
                    </div>
                  ) : (
                    <>
                      {visibleCategories.map(([key, category]) => (
                        <div key={key} style={{ marginBottom: '20px' }}>
                          <h3 style={{ fontSize: '16px', color: 'var(--info-color)', marginBottom: '8px', borderBottom: '2px solid var(--info-color)', paddingBottom: '4px' }}>
                            {getCategoryTitle(key)}
                          </h3>
                          <div className="markdown-content" style={{ fontSize: '14px' }}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {category.content}
                            </ReactMarkdown>
                          </div>
                        </div>
                      ))}

                      {/* Reference Links */}
                      {huddleContent?.referenceLinks && huddleContent.referenceLinks.length > 0 && (
                        <div style={{ marginTop: '20px', padding: '12px', background: 'var(--surface-secondary)', borderRadius: '6px' }}>
                          <h3 style={{ fontSize: '14px', marginBottom: '8px' }}>
                            <i className="fas fa-link"></i> Reference Links
                          </h3>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {huddleContent.referenceLinks.map((link, index) => (
                              <a
                                key={index}
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: 'var(--info-color)', fontSize: '14px' }}
                              >
                                <i className="fas fa-external-link-alt"></i> {link.title || link.url}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* STEP 2: Attendance Marking */}
              {workflowStep === 'attendance' && (
                <div className="attendance-section">
                  {isManager ? (
                    /* Manager view - all techs organized by zone */
                    <div>
                      <p style={{ marginBottom: '16px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                        Select all team members who attended today's huddle:
                      </p>
                      {allZonesWithTechs.map(zone => (
                        <div key={zone.id} style={{ marginBottom: '20px', background: 'var(--surface-secondary)', padding: '12px', borderRadius: '8px' }}>
                          <h4 style={{ margin: '0 0 12px 0', color: 'var(--info-color)' }}>{zone.name}</h4>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
                            {zone.allTechs.map(tech => (
                              <label key={tech.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={attendance[zone.id]?.present.includes(tech.id) || false}
                                  onChange={() => toggleAttendance(zone.id, tech.id)}
                                />
                                <span>{tech.name}</span>
                                {tech.role && <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>({tech.role})</span>}
                              </label>
                            ))}
                          </div>
                          {/* Show manually added members for this zone */}
                          {attendance[zone.id]?.manuallyAdded?.length > 0 && (
                            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}>
                              <h5 style={{ fontSize: '13px', marginBottom: '8px' }}>From Other Zones:</h5>
                              {attendance[zone.id].manuallyAdded.map(member => (
                                <div key={member.userId} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                  <span>{member.name}</span>
                                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>({member.originalZone})</span>
                                  <button
                                    onClick={() => removeManualMember(zone.id, member.userId)}
                                    style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--error-color)', cursor: 'pointer' }}
                                  >
                                    <i className="fas fa-times"></i>
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : currentUserZoneWithTechs && effectiveZoneId ? (
                    /* Zone lead view - only their zone */
                    <div>
                      <h4 style={{ margin: '0 0 12px 0' }}>{currentUserZoneWithTechs.name}</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
                        {currentUserZoneWithTechs.allTechs?.map(tech => (
                          <label key={tech.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={attendance[effectiveZoneId]?.present.includes(tech.id) || false}
                              onChange={() => toggleAttendance(effectiveZoneId, tech.id)}
                            />
                            <span>{tech.name}</span>
                          </label>
                        ))}
                      </div>
                      {/* Manually added members */}
                      {attendance[effectiveZoneId]?.manuallyAdded?.length > 0 && (
                        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}>
                          <h5 style={{ fontSize: '13px', marginBottom: '8px' }}>From Other Zones:</h5>
                          {attendance[effectiveZoneId].manuallyAdded.map(member => (
                            <div key={member.userId} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span>{member.name}</span>
                              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>({member.originalZone})</span>
                              <button
                                onClick={() => removeManualMember(effectiveZoneId, member.userId)}
                                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--error-color)', cursor: 'pointer' }}
                              >
                                <i className="fas fa-times"></i>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p>Unable to determine your zone. Please contact support.</p>
                  )}

                  {/* Add Member from Other Zone */}
                  <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '2px solid #e5e7eb' }}>
                    {!showManualAdd ? (
                      <button className="btn btn-secondary" onClick={() => setShowManualAdd(true)}>
                        <i className="fas fa-plus"></i> Add Member from Another Zone
                      </button>
                    ) : (
                      <div style={{ background: 'var(--surface-secondary)', padding: '12px', borderRadius: '8px' }}>
                        <h4 style={{ fontSize: '14px', marginBottom: '12px' }}>Select Member from Other Zones</h4>
                        {allZonesWithTechs.map(zone => (
                          <div key={zone.id} style={{ marginBottom: '12px' }}>
                            <h5 style={{ fontSize: '13px', marginBottom: '6px', color: 'var(--info-color)' }}>{zone.name}</h5>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                              {zone.allTechs.map(tech => (
                                <button
                                  key={tech.id}
                                  className="btn btn-sm btn-secondary"
                                  onClick={() => addManualMember(tech, zone.id)}
                                  style={{ fontSize: '12px' }}
                                >
                                  {tech.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowManualAdd(false)} style={{ marginTop: '8px' }}>
                          Close
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 3: Coverage Confirmation */}
              {workflowStep === 'coverage' && (
                <div className="coverage-section">
                  <div style={{ background: 'var(--status-pending-bg)', padding: '12px', borderRadius: '8px', marginBottom: '20px' }}>
                    <p style={{ margin: 0, fontSize: '14px', color: 'var(--warning-color)' }}>
                      <i className="fas fa-exclamation-triangle"></i> The following team members were present today but missed previous huddles. Review the topics they missed and confirm you've covered this information with them:
                    </p>
                  </div>

                  {Object.entries(missedTopicsForPresent).map(([techId, data]) => (
                    <div key={techId} style={{ marginBottom: '16px', background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div>
                          <strong style={{ fontSize: '16px' }}>{data.techName}</strong>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginLeft: '8px' }}>({data.zoneName})</span>
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--warning-color)', fontWeight: '600' }}>
                          {data.missedHuddles.length} missed huddle{data.missedHuddles.length > 1 ? 's' : ''}
                        </span>
                      </div>

                      <div style={{ marginBottom: '12px', maxHeight: '200px', overflowY: 'auto' }}>
                        {data.missedHuddles.slice(0, 5).map((huddle, idx) => (
                          <div key={idx} style={{ background: 'var(--surface-secondary)', padding: '8px', borderRadius: '4px', marginBottom: '6px', fontSize: '12px' }}>
                            <div style={{ fontWeight: '600', marginBottom: '4px', color: 'var(--info-color)' }}>
                              {huddle.dateFormatted}
                            </div>
                            <ul style={{ margin: 0, paddingLeft: '16px' }}>
                              {huddle.topicsSummary.map((topic, topicIdx) => (
                                <li key={topicIdx}>
                                  <strong>{topic.category}:</strong> {topic.preview}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                        {data.missedHuddles.length > 5 && (
                          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                            ... and {data.missedHuddles.length - 5} more
                          </p>
                        )}
                      </div>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: coverageConfirmed[techId] ? 'var(--status-completed-bg)' : 'var(--surface-secondary)', padding: '8px', borderRadius: '4px' }}>
                        <input
                          type="checkbox"
                          checked={coverageConfirmed[techId] || false}
                          onChange={() => toggleCoverageConfirmation(techId)}
                        />
                        <span style={{ fontWeight: '600', color: coverageConfirmed[techId] ? 'var(--success-color)' : 'var(--text-primary)' }}>
                          I have covered these topics with {data.techName}
                        </span>
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          {workflowStep === 'content' && (
            <>
              <button className="btn btn-secondary" onClick={onClose}>
                <i className="fas fa-times"></i> Exit
              </button>
              <button
                className="btn btn-primary"
                onClick={handleHuddleComplete}
                disabled={loading}
              >
                <i className="fas fa-check-circle"></i> Huddle Completed
              </button>
            </>
          )}

          {workflowStep === 'attendance' && (
            <>
              <button className="btn btn-secondary" onClick={() => setWorkflowStep('content')}>
                <i className="fas fa-arrow-left"></i> Back
              </button>
              <button
                className="btn btn-primary"
                onClick={handleConfirmAttendance}
                disabled={saving}
              >
                {saving ? 'Checking...' : (
                  <>
                    <i className="fas fa-arrow-right"></i> Confirm Attendance
                  </>
                )}
              </button>
            </>
          )}

          {workflowStep === 'coverage' && (
            <>
              <button className="btn btn-secondary" onClick={() => setWorkflowStep('attendance')}>
                <i className="fas fa-arrow-left"></i> Back to Attendance
              </button>
              <button
                className="btn btn-primary"
                onClick={handleFinalSubmit}
                disabled={saving}
              >
                {saving ? 'Saving...' : (
                  <>
                    <i className="fas fa-save"></i> Confirm & Save
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
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

export default HuddleInfoModal;
