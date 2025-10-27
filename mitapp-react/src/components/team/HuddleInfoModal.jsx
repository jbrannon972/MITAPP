import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import firebaseService from '../../services/firebaseService';

const HuddleInfoModal = ({ isOpen, onClose, selectedDate = new Date() }) => {
  const { currentUser } = useAuth();
  const { staffingData } = useData();

  const [huddleContent, setHuddleContent] = useState(null);
  const [attendance, setAttendance] = useState({
    present: [],
    manuallyAdded: []
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAttendance, setShowAttendance] = useState(false);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const dateStr = format(selectedDate, 'yyyy-MM-dd');

  // Get current user's zone - check both members and lead
  const currentUserZone = staffingData?.zones?.find(zone => {
    // Check if user is a member
    const isMember = zone.members?.some(member => member.id === currentUser?.userId);
    // Check if user is the zone lead
    const isLead = zone.lead?.id === currentUser?.userId;
    return isMember || isLead;
  });

  // Get team members in current zone (excluding the lead from members list)
  const zoneMembers = currentUserZone?.members || [];

  // Get all team members from other zones (both members and leads)
  const otherZoneMembers = staffingData?.zones
    ?.filter(zone => zone.id !== currentUserZone?.id)
    ?.flatMap(zone => {
      const members = zone.members?.map(member => ({
        ...member,
        zoneName: zone.name
      })) || [];

      // Add the zone lead if exists
      if (zone.lead) {
        members.push({
          ...zone.lead,
          zoneName: zone.name
        });
      }

      return members;
    }) || [];

  // Load huddle content and attendance
  useEffect(() => {
    if (isOpen) {
      loadHuddleData();
      setShowAttendance(false); // Reset attendance view when modal opens
    }
  }, [isOpen, dateStr]);

  const loadHuddleData = async () => {
    setLoading(true);
    try {
      // Load huddle content
      const content = await firebaseService.getDocument('hou_huddle_content', dateStr);
      setHuddleContent(content);

      // Load existing attendance for this zone
      if (currentUserZone) {
        const attendanceId = `${dateStr}_${currentUserZone.id}`;
        const existingAttendance = await firebaseService.getDocument('hou_huddle_attendance', attendanceId);

        if (existingAttendance) {
          setAttendance({
            present: existingAttendance.present || [],
            manuallyAdded: existingAttendance.manuallyAdded || []
          });
          // If attendance already exists, show the attendance section
          setShowAttendance(true);
        } else {
          // Reset attendance for new huddle
          setAttendance({
            present: [],
            manuallyAdded: []
          });
        }
      }
    } catch (error) {
      console.error('Error loading huddle data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleAttendance = (memberId) => {
    setAttendance(prev => ({
      ...prev,
      present: prev.present.includes(memberId)
        ? prev.present.filter(id => id !== memberId)
        : [...prev.present, memberId]
    }));
  };

  const addManualMember = (member) => {
    // Check if already added
    if (attendance.manuallyAdded.some(m => m.userId === member.id)) {
      return;
    }

    setAttendance(prev => ({
      ...prev,
      manuallyAdded: [
        ...prev.manuallyAdded,
        {
          userId: member.id,
          name: member.name,
          originalZone: member.zoneName
        }
      ],
      // Also mark them as present
      present: [...prev.present, member.id]
    }));
    setShowManualAdd(false);
    setSearchTerm('');
  };

  const removeManualMember = (userId) => {
    setAttendance(prev => ({
      ...prev,
      manuallyAdded: prev.manuallyAdded.filter(m => m.userId !== userId),
      // Also remove from present
      present: prev.present.filter(id => id !== userId)
    }));
  };

  const handleHuddleComplete = () => {
    if (!currentUserZone) {
      alert('Error: Could not determine your zone. Please contact support.');
      return;
    }
    setShowAttendance(true);
  };

  const saveAttendance = async () => {
    if (!currentUserZone) {
      alert('Error: Could not determine your zone');
      return;
    }

    setSaving(true);
    try {
      const attendanceId = `${dateStr}_${currentUserZone.id}`;
      const attendanceData = {
        date: dateStr,
        zoneId: currentUserZone.id,
        zoneName: currentUserZone.name,
        present: attendance.present,
        manuallyAdded: attendance.manuallyAdded,
        recordedBy: currentUser.userId,
        recordedByName: currentUser.username,
        recordedAt: new Date().toISOString()
      };

      await firebaseService.saveDocument('hou_huddle_attendance', attendanceId, attendanceData);
      alert('Huddle attendance saved successfully!');
      onClose();
    } catch (error) {
      console.error('Error saving attendance:', error);
      alert('Error saving attendance. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Filter categories that have content and are visible
  const visibleCategories = huddleContent?.categories
    ? Object.entries(huddleContent.categories)
        .filter(([key, cat]) => cat.visible && cat.content && cat.content.trim())
    : [];

  // Filter other zone members based on search
  const filteredOtherMembers = otherZoneMembers.filter(member =>
    member.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className={`modal-overlay ${isOpen ? 'active' : ''}`} onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Today's Huddle Info - {format(selectedDate, 'MMMM d, yyyy')}</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div className="loading">Loading huddle information...</div>
          ) : (
            <>
              {/* Huddle Content Section */}
              <div className="huddle-content-section">
                {visibleCategories.length === 0 && (!huddleContent?.referenceLinks || huddleContent.referenceLinks.length === 0) ? (
                  <div className="no-content">
                    <p>No huddle information available for this date.</p>
                    <p style={{ fontSize: '0.9em', color: '#666' }}>
                      Managers can pre-fill huddle information in the Huddle Info tab.
                    </p>
                  </div>
                ) : (
                  <>
                    {visibleCategories.map(([key, category]) => (
                      <div key={key} className="huddle-category">
                        <h3>{getCategoryTitle(key)}</h3>
                        <div className="category-content markdown-content">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {category.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    ))}

                    {/* Reference Links */}
                    {huddleContent?.referenceLinks && huddleContent.referenceLinks.length > 0 && (
                      <div className="huddle-reference-links">
                        <h3>
                          <i className="fas fa-link"></i> Reference Links
                        </h3>
                        <div className="reference-links-display">
                          {huddleContent.referenceLinks.map((link, index) => (
                            <a
                              key={index}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="reference-link-card"
                            >
                              <i className="fas fa-external-link-alt"></i>
                              <span>{link.title || link.url}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Attendance Section - Only shown after Huddle Complete */}
              {showAttendance && currentUserZone && (
                <>
                  <div className="section-divider"></div>

                  <div className="attendance-section">
                    <h3>Attendance - {currentUserZone.name}</h3>

                    {/* Zone Members */}
                    <div className="attendance-list">
                      <h4>Team Members</h4>
                      {zoneMembers.length === 0 ? (
                        <p>No team members in your zone.</p>
                      ) : (
                        <div className="member-checkboxes">
                          {zoneMembers.map(member => (
                            <label key={member.id} className="member-checkbox">
                              <input
                                type="checkbox"
                                checked={attendance.present.includes(member.id)}
                                onChange={() => toggleAttendance(member.id)}
                              />
                              <span>{member.name}</span>
                              {member.role && (
                                <span className="member-role">({member.role})</span>
                              )}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Manually Added Members */}
                    {attendance.manuallyAdded.length > 0 && (
                      <div className="manually-added-section">
                        <h4>Members from Other Zones</h4>
                        <div className="manual-members-list">
                          {attendance.manuallyAdded.map(member => (
                            <div key={member.userId} className="manual-member-item">
                              <span className="manual-member-name">{member.name}</span>
                              <span className="manual-member-zone">
                                (from {member.originalZone})
                              </span>
                              <button
                                className="remove-manual-btn"
                                onClick={() => removeManualMember(member.userId)}
                                title="Remove"
                              >
                                &times;
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Add Manual Member */}
                    <div className="manual-add-section">
                      {!showManualAdd ? (
                        <button
                          className="btn btn-secondary"
                          onClick={() => setShowManualAdd(true)}
                        >
                          <i className="fas fa-plus"></i> Add Member from Another Zone
                        </button>
                      ) : (
                        <div className="other-zones-list">
                          <h4>Select Member from Other Zones</h4>
                          {staffingData?.zones
                            ?.filter(zone => zone.id !== currentUserZone?.id)
                            ?.map(zone => {
                              // Filter out members already added
                              const availableLead = zone.lead && !attendance.manuallyAdded.some(m => m.userId === zone.lead.id)
                                ? zone.lead
                                : null;
                              const availableMembers = zone.members?.filter(member =>
                                !attendance.manuallyAdded.some(m => m.userId === member.id)
                              ) || [];

                              // Skip zone if no available members
                              if (!availableLead && availableMembers.length === 0) {
                                return null;
                              }

                              return (
                                <div key={zone.id} className="other-zone-section">
                                  <div className="other-zone-header">
                                    <i className="fas fa-map-marker-alt"></i> {zone.name}
                                  </div>
                                  <div className="other-zone-members">
                                    {/* Zone Lead */}
                                    {availableLead && (
                                      <div
                                        className="other-zone-member-item"
                                        onClick={() => addManualMember({ ...availableLead, zoneName: zone.name })}
                                      >
                                        <span className="member-name">{availableLead.name}</span>
                                        <span className="member-role-badge">Lead</span>
                                      </div>
                                    )}
                                    {/* Zone Members */}
                                    {availableMembers.map(member => (
                                      <div
                                        key={member.id}
                                        className="other-zone-member-item"
                                        onClick={() => addManualMember({ ...member, zoneName: zone.name })}
                                      >
                                        <span className="member-name">{member.name}</span>
                                        {member.role && (
                                          <span className="member-role-badge">{member.role}</span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          <button
                            className="btn btn-secondary"
                            onClick={() => setShowManualAdd(false)}
                            style={{ marginTop: '12px' }}
                          >
                            Close
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          {!showAttendance ? (
            <>
              <button className="btn btn-secondary" onClick={onClose}>
                Close
              </button>
              {currentUserZone && (
                <button
                  className="btn btn-primary"
                  onClick={handleHuddleComplete}
                  disabled={loading}
                >
                  <i className="fas fa-check-circle"></i> Huddle Complete
                </button>
              )}
            </>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={saveAttendance}
                disabled={saving || loading}
              >
                {saving ? 'Saving...' : 'Save Attendance'}
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
