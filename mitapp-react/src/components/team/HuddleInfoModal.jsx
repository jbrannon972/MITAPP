import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';

const HuddleInfoModal = ({
  isOpen,
  onClose,
  selectedDate,
  huddleData,
  onSave,
  teamMembers,
  allZones
}) => {
  const { currentUser } = useAuth();
  const isManager = currentUser?.role === 'Manager';

  const [formData, setFormData] = useState({
    announcements: '',
    reminders: '',
    trainingTopic: '',
    safetyTopic: '',
    huddleTopic: '',
    weekendStaffing: '',
    visibleToSupervisors: {
      announcements: true,
      reminders: true,
      trainingTopic: true,
      safetyTopic: true,
      huddleTopic: true,
      weekendStaffing: true
    },
    attendees: [],
    manualAttendees: []
  });

  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAttendeeSelect, setShowAttendeeSelect] = useState(false);
  const [manualAttendeeName, setManualAttendeeName] = useState('');
  const [manualAttendeeZone, setManualAttendeeZone] = useState('');

  useEffect(() => {
    if (huddleData) {
      setFormData({
        announcements: huddleData.announcements || '',
        reminders: huddleData.reminders || '',
        trainingTopic: huddleData.trainingTopic || '',
        safetyTopic: huddleData.safetyTopic || '',
        huddleTopic: huddleData.huddleTopic || '',
        weekendStaffing: huddleData.weekendStaffing || '',
        visibleToSupervisors: huddleData.visibleToSupervisors || {
          announcements: true,
          reminders: true,
          trainingTopic: true,
          safetyTopic: true,
          huddleTopic: true,
          weekendStaffing: true
        },
        attendees: huddleData.attendees || [],
        manualAttendees: huddleData.manualAttendees || []
      });
    } else {
      // Reset to empty if no data
      setFormData({
        announcements: '',
        reminders: '',
        trainingTopic: '',
        safetyTopic: '',
        huddleTopic: '',
        weekendStaffing: '',
        visibleToSupervisors: {
          announcements: true,
          reminders: true,
          trainingTopic: true,
          safetyTopic: true,
          huddleTopic: true,
          weekendStaffing: true
        },
        attendees: [],
        manualAttendees: []
      });
    }
    setEditMode(false);
  }, [huddleData, selectedDate]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleVisibilityChange = (field) => {
    setFormData(prev => ({
      ...prev,
      visibleToSupervisors: {
        ...prev.visibleToSupervisors,
        [field]: !prev.visibleToSupervisors[field]
      }
    }));
  };

  const handleAttendeeToggle = (memberId) => {
    setFormData(prev => ({
      ...prev,
      attendees: prev.attendees.includes(memberId)
        ? prev.attendees.filter(id => id !== memberId)
        : [...prev.attendees, memberId]
    }));
  };

  const handleAddManualAttendee = () => {
    if (manualAttendeeName.trim() && manualAttendeeZone.trim()) {
      setFormData(prev => ({
        ...prev,
        manualAttendees: [
          ...prev.manualAttendees,
          { name: manualAttendeeName, zone: manualAttendeeZone, id: Date.now() }
        ]
      }));
      setManualAttendeeName('');
      setManualAttendeeZone('');
      setShowAttendeeSelect(false);
    }
  };

  const handleRemoveManualAttendee = (attendeeId) => {
    setFormData(prev => ({
      ...prev,
      manualAttendees: prev.manualAttendees.filter(a => a.id !== attendeeId)
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(selectedDate, formData);
      setEditMode(false);
    } catch (error) {
      console.error('Error saving huddle info:', error);
      alert('Error saving huddle info. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const categories = [
    { key: 'announcements', label: 'Announcements', icon: 'fa-bullhorn' },
    { key: 'reminders', label: 'Reminders', icon: 'fa-bell' },
    { key: 'trainingTopic', label: 'Training Topic', icon: 'fa-graduation-cap' },
    { key: 'safetyTopic', label: 'Safety Topic', icon: 'fa-shield-alt' },
    { key: 'huddleTopic', label: 'Huddle Topic', icon: 'fa-users' },
    { key: 'weekendStaffing', label: 'Weekend Staffing', icon: 'fa-calendar-week' }
  ];

  const hasContent = categories.some(cat => formData[cat.key]?.trim());

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal modal-lg huddle-info-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <i className="fas fa-clipboard-list"></i> Huddle Info - {new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </h3>
          <button className="modal-close" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="modal-body">
          {isManager && (
            <div className="huddle-actions">
              {!editMode ? (
                <button className="btn btn-primary" onClick={() => setEditMode(true)}>
                  <i className="fas fa-edit"></i> {hasContent ? 'Edit Huddle Info' : 'Create Huddle Info'}
                </button>
              ) : (
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                    <i className="fas fa-save"></i> {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button className="btn btn-secondary" onClick={() => setEditMode(false)} disabled={saving}>
                    <i className="fas fa-times"></i> Cancel
                  </button>
                </div>
              )}
            </div>
          )}

          {!hasContent && !editMode ? (
            <div className="no-entries">
              <i className="fas fa-info-circle" style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.3 }}></i>
              <p>No huddle information has been created for this date yet.</p>
              {isManager && <p style={{ marginTop: '8px', fontSize: '14px', opacity: 0.7 }}>Click "Create Huddle Info" to get started.</p>}
            </div>
          ) : (
            <>
              {/* Huddle Content Sections */}
              <div className="huddle-sections">
                {categories.map(category => {
                  const hasValue = formData[category.key]?.trim();
                  const isVisible = formData.visibleToSupervisors[category.key];

                  // If not editing and no value, skip this category
                  if (!editMode && !hasValue) return null;

                  // If viewing as supervisor and not visible, skip
                  if (!isManager && !isVisible && !hasValue) return null;

                  return (
                    <div key={category.key} className="huddle-section">
                      <div className="huddle-section-header">
                        <h4>
                          <i className={`fas ${category.icon}`}></i> {category.label}
                        </h4>
                        {isManager && editMode && (
                          <label className="checkbox-label" style={{ fontSize: '13px', fontWeight: 'normal' }}>
                            <input
                              type="checkbox"
                              checked={isVisible}
                              onChange={() => handleVisibilityChange(category.key)}
                            />
                            <span style={{ marginLeft: '6px' }}>Visible to Supervisors</span>
                          </label>
                        )}
                      </div>
                      {editMode && isManager ? (
                        <textarea
                          className="form-input"
                          value={formData[category.key]}
                          onChange={(e) => handleInputChange(category.key, e.target.value)}
                          placeholder={`Enter ${category.label.toLowerCase()}...`}
                          rows={4}
                        />
                      ) : (
                        <div className="huddle-section-content">
                          {hasValue ? (
                            <p style={{ whiteSpace: 'pre-wrap' }}>{formData[category.key]}</p>
                          ) : (
                            <p style={{ opacity: 0.5, fontStyle: 'italic' }}>No {category.label.toLowerCase()} provided</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Attendees Section */}
              {isManager && (
                <div className="huddle-section">
                  <div className="huddle-section-header">
                    <h4>
                      <i className="fas fa-user-check"></i> Huddle Attendees
                    </h4>
                  </div>

                  {editMode ? (
                    <>
                      {/* Team Members Selection */}
                      <div className="attendees-grid">
                        {teamMembers.map(member => (
                          <label key={member.id} className="attendee-checkbox">
                            <input
                              type="checkbox"
                              checked={formData.attendees.includes(member.id)}
                              onChange={() => handleAttendeeToggle(member.id)}
                            />
                            <span>{member.name}</span>
                            <small style={{ opacity: 0.7 }}>({member.role})</small>
                          </label>
                        ))}
                      </div>

                      {/* Manual Attendees */}
                      {formData.manualAttendees.length > 0 && (
                        <div className="manual-attendees">
                          <h5 style={{ fontSize: '14px', marginTop: '16px', marginBottom: '8px' }}>
                            <i className="fas fa-user-plus"></i> Covering from Other Zones
                          </h5>
                          <div className="manual-attendees-list">
                            {formData.manualAttendees.map(attendee => (
                              <div key={attendee.id} className="manual-attendee-item">
                                <span>{attendee.name} <small>({attendee.zone})</small></span>
                                <button
                                  className="btn-icon btn-danger"
                                  onClick={() => handleRemoveManualAttendee(attendee.id)}
                                  title="Remove"
                                >
                                  <i className="fas fa-times"></i>
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Add Manual Attendee */}
                      {!showAttendeeSelect ? (
                        <button
                          className="btn btn-outline"
                          onClick={() => setShowAttendeeSelect(true)}
                          style={{ marginTop: '12px' }}
                        >
                          <i className="fas fa-user-plus"></i> Add Covering Member
                        </button>
                      ) : (
                        <div className="add-manual-attendee" style={{ marginTop: '12px' }}>
                          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr auto' }}>
                            <input
                              type="text"
                              className="form-input"
                              placeholder="Name"
                              value={manualAttendeeName}
                              onChange={(e) => setManualAttendeeName(e.target.value)}
                            />
                            <input
                              type="text"
                              className="form-input"
                              placeholder="Zone"
                              value={manualAttendeeZone}
                              onChange={(e) => setManualAttendeeZone(e.target.value)}
                            />
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button className="btn btn-primary" onClick={handleAddManualAttendee}>
                                <i className="fas fa-check"></i>
                              </button>
                              <button className="btn btn-secondary" onClick={() => setShowAttendeeSelect(false)}>
                                <i className="fas fa-times"></i>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="attendees-display">
                      {formData.attendees.length === 0 && formData.manualAttendees.length === 0 ? (
                        <p style={{ opacity: 0.5, fontStyle: 'italic' }}>No attendees marked yet</p>
                      ) : (
                        <>
                          <div className="attendee-list">
                            {formData.attendees.map(attendeeId => {
                              const member = teamMembers.find(m => m.id === attendeeId);
                              return member ? (
                                <div key={attendeeId} className="attendee-badge">
                                  <i className="fas fa-user"></i> {member.name}
                                </div>
                              ) : null;
                            })}
                            {formData.manualAttendees.map(attendee => (
                              <div key={attendee.id} className="attendee-badge attendee-badge-covering">
                                <i className="fas fa-user-plus"></i> {attendee.name} <small>({attendee.zone})</small>
                              </div>
                            ))}
                          </div>
                          <p style={{ marginTop: '12px', fontSize: '14px', opacity: 0.7 }}>
                            Total Attendees: {formData.attendees.length + formData.manualAttendees.length}
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default HuddleInfoModal;
