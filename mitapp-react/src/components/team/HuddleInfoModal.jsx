import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { format } from 'date-fns';
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
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const dateStr = format(selectedDate, 'yyyy-MM-dd');

  // Get current user's zone
  const currentUserZone = staffingData?.zones?.find(zone =>
    zone.members?.some(member => member.id === currentUser?.userId)
  );

  // Get team members in current zone
  const zoneMembers = currentUserZone?.members || [];

  // Get all team members from other zones
  const otherZoneMembers = staffingData?.zones
    ?.filter(zone => zone.id !== currentUserZone?.id)
    ?.flatMap(zone =>
      zone.members?.map(member => ({
        ...member,
        zoneName: zone.name
      })) || []
    ) || [];

  // Load huddle content and attendance
  useEffect(() => {
    if (isOpen) {
      loadHuddleData();
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
      ]
    }));
    setShowManualAdd(false);
    setSearchTerm('');
  };

  const removeManualMember = (userId) => {
    setAttendance(prev => ({
      ...prev,
      manuallyAdded: prev.manuallyAdded.filter(m => m.userId !== userId)
    }));
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
      alert('Attendance saved successfully!');
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
                {visibleCategories.length === 0 ? (
                  <div className="no-content">
                    <p>No huddle information available for this date.</p>
                    <p style={{ fontSize: '0.9em', color: '#666' }}>
                      Managers can pre-fill huddle information in the Huddle Info tab.
                    </p>
                  </div>
                ) : (
                  visibleCategories.map(([key, category]) => (
                    <div key={key} className="huddle-category">
                      <h3>{getCategoryTitle(key)}</h3>
                      <div className="category-content">
                        {category.content}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Attendance Section */}
              {currentUserZone && (
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
                          + Add Member from Another Zone
                        </button>
                      ) : (
                        <div className="manual-add-form">
                          <input
                            type="text"
                            placeholder="Search by name..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="search-input"
                            autoFocus
                          />
                          <div className="search-results">
                            {filteredOtherMembers.length === 0 ? (
                              <p>No members found</p>
                            ) : (
                              filteredOtherMembers.map(member => (
                                <div
                                  key={member.id}
                                  className="search-result-item"
                                  onClick={() => addManualMember(member)}
                                >
                                  <span>{member.name}</span>
                                  <span className="zone-badge">{member.zoneName}</span>
                                </div>
                              ))
                            )}
                          </div>
                          <button
                            className="btn btn-text"
                            onClick={() => {
                              setShowManualAdd(false);
                              setSearchTerm('');
                            }}
                          >
                            Cancel
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
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
          {currentUserZone && (
            <button
              className="btn btn-primary"
              onClick={saveAttendance}
              disabled={saving || loading}
            >
              {saving ? 'Saving...' : 'Save Attendance'}
            </button>
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
