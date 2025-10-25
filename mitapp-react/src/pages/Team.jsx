import { useState } from 'react';
import Layout from '../components/common/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import ZoneCard from '../components/team/ZoneCard';
import { getTotalStaff, getMITTechCount, getDemoTechCount } from '../utils/calculations';
import { exportToCSV, prepareTeamDataForExport } from '../utils/exportUtils';
import firebaseService from '../services/firebaseService';

const Team = () => {
  const { currentUser } = useAuth();
  const { staffingData, saveStaffingData, loading } = useData();
  const [activeView, setActiveView] = useState('team-view');
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [editingZone, setEditingZone] = useState(null);
  const [zoneFormData, setZoneFormData] = useState({ name: '', leadName: '' });
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [memberFormData, setMemberFormData] = useState({ name: '', role: 'MIT Tech', email: '' });
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileData, setProfileData] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const canManage = currentUser && ['Manager', 'Supervisor', 'MIT Lead'].includes(currentUser.role);

  const openAddZoneModal = () => {
    setEditingZone(null);
    setZoneFormData({ name: '', leadName: '' });
    setShowZoneModal(true);
  };

  const openEditZoneModal = (zone, zoneIndex) => {
    setEditingZone({ zone, zoneIndex });
    setZoneFormData({
      name: zone.name || '',
      leadName: zone.lead?.name || ''
    });
    setShowZoneModal(true);
  };

  const closeZoneModal = () => {
    setShowZoneModal(false);
    setEditingZone(null);
  };

  const handleZoneFormChange = (e) => {
    const { name, value } = e.target;
    setZoneFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveZone = async () => {
    if (!canManage || !zoneFormData.name.trim()) {
      alert('Zone name is required');
      return;
    }

    const updatedZones = [...(staffingData.zones || [])];

    if (editingZone) {
      const zone = updatedZones[editingZone.zoneIndex];
      zone.name = zoneFormData.name;
      if (zoneFormData.leadName && !zone.lead) {
        zone.lead = {
          id: 'lead_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
          name: zoneFormData.leadName,
          role: 'MIT Lead'
        };
      } else if (zoneFormData.leadName && zone.lead) {
        zone.lead.name = zoneFormData.leadName;
      }
    } else {
      const newZone = {
        name: zoneFormData.name,
        lead: zoneFormData.leadName ? {
          id: 'lead_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
          name: zoneFormData.leadName,
          role: 'MIT Lead'
        } : null,
        members: []
      };
      updatedZones.push(newZone);
    }

    const updatedData = {
      ...staffingData,
      zones: updatedZones
    };

    await saveStaffingData(updatedData);
    closeZoneModal();
  };

  const handleDeleteZone = async (zoneIndex) => {
    if (!canManage) return;

    const zone = staffingData.zones[zoneIndex];
    const memberCount = zone.members.length + (zone.lead ? 1 : 0);

    if (memberCount > 0) {
      if (!window.confirm('Zone "' + zone.name + '" has ' + memberCount + ' member(s). Are you sure you want to delete it? Members will be removed.')) {
        return;
      }
    } else {
      if (!window.confirm('Delete zone "' + zone.name + '"?')) {
        return;
      }
    }

    const updatedZones = staffingData.zones.filter((_, idx) => idx !== zoneIndex);

    const updatedData = {
      ...staffingData,
      zones: updatedZones
    };

    await saveStaffingData(updatedData);
  };

  const handleMovePersonToZone = async (personId, newZoneIndex) => {
    if (!canManage || !staffingData) return;

    let person = null;
    let originalZoneIndex = -1;
    let originalMemberIndex = -1;

    for (let i = 0; i < staffingData.zones.length; i++) {
      const zone = staffingData.zones[i];
      if (zone.lead && zone.lead.id === personId) {
        person = zone.lead;
        originalZoneIndex = i;
        break;
      }
      const memberIndex = zone.members.findIndex(m => m.id === personId);
      if (memberIndex > -1) {
        person = zone.members[memberIndex];
        originalZoneIndex = i;
        originalMemberIndex = memberIndex;
        break;
      }
    }

    if (!person || originalZoneIndex === -1 || originalZoneIndex === newZoneIndex) {
      return;
    }

    const updatedZones = [...staffingData.zones];
    const originalZone = updatedZones[originalZoneIndex];
    const newZone = updatedZones[newZoneIndex];

    if (person.role === 'MIT Lead') {
      const targetLead = newZone.lead;
      newZone.lead = person;
      originalZone.lead = targetLead;
    } else {
      originalZone.members.splice(originalMemberIndex, 1);
      newZone.members.push(person);
    }

    const updatedData = {
      ...staffingData,
      zones: updatedZones
    };

    await saveStaffingData(updatedData);
  };

  const handleRemoveMember = async (zoneIndex, memberIndex) => {
    if (!canManage || !window.confirm('Remove this member from the zone?')) return;

    const updatedZones = [...staffingData.zones];
    updatedZones[zoneIndex].members.splice(memberIndex, 1);

    const updatedData = {
      ...staffingData,
      zones: updatedZones
    };

    await saveStaffingData(updatedData);
  };

  const openAddMemberModal = (zoneIndex) => {
    setEditingMember({ zoneIndex, memberIndex: null });
    setMemberFormData({ name: '', role: 'MIT Tech', email: '' });
    setShowMemberModal(true);
  };

  const openEditMemberModal = (zoneIndex, memberIndex, member) => {
    setEditingMember({ zoneIndex, memberIndex });
    setMemberFormData({ name: member.name, role: member.role, email: member.email || '' });
    setShowMemberModal(true);
  };

  const closeMemberModal = () => {
    setShowMemberModal(false);
    setEditingMember(null);
  };

  const viewMemberProfile = async (member) => {
    setProfileLoading(true);
    setShowProfileModal(true);
    setProfileData({ member, evaluation: null, driverScore: null });

    try {
      // Load evaluation data
      if (member.id) {
        const evaluation = await firebaseService.getLatestEvaluation(member.id);

        // Calculate evaluation score and category
        let evalScore = null;
        let evalCategory = null;
        if (evaluation && evaluation.ratings) {
          const ratings = Object.values(evaluation.ratings);
          if (ratings.length === 8) {
            const total = ratings.reduce((sum, val) => sum + parseInt(val || 0), 0);
            evalScore = (total / 8).toFixed(2);
            if (evalScore >= 3.2) {
              evalCategory = { value: '20', label: 'Top Performer', class: 'success' };
            } else if (evalScore >= 2.0) {
              evalCategory = { value: '70', label: 'Meets Expectations', class: 'warning' };
            } else {
              evalCategory = { value: '10', label: 'Needs Improvement', class: 'danger' };
            }
          }
        }

        // Get driver score from member data
        let driverRating = null;
        if (member.driverScore && member.driverScore.miles > 0) {
          const rate = ((member.driverScore.alerts || 0) + (member.driverScore.eventScore || 0)) / member.driverScore.miles * 1000;
          if (rate < 0.5) {
            driverRating = { rate: rate.toFixed(2), label: 'Safe Driver', class: 'success' };
          } else if (rate < 1.0) {
            driverRating = { rate: rate.toFixed(2), label: 'Driving Well', class: 'warning' };
          } else if (rate < 2.0) {
            driverRating = { rate: rate.toFixed(2), label: 'Risky Driver', class: 'danger' };
          } else {
            driverRating = { rate: rate.toFixed(2), label: 'High Risk', class: 'danger' };
          }
        }

        setProfileData({
          member,
          evaluation: evaluation ? { score: evalScore, category: evalCategory, date: evaluation.createdAt } : null,
          driverScore: driverRating
        });
      }
    } catch (error) {
      console.error('Error loading profile data:', error);
    } finally {
      setProfileLoading(false);
    }
  };

  const closeProfileModal = () => {
    setShowProfileModal(false);
    setProfileData(null);
  };

  const handleMemberFormChange = (e) => {
    const { name, value } = e.target;
    setMemberFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveMember = async () => {
    if (!canManage || !memberFormData.name.trim()) {
      alert('Member name is required');
      return;
    }

    const updatedZones = [...staffingData.zones];

    if (editingMember.memberIndex !== null) {
      // Edit existing member
      const member = updatedZones[editingMember.zoneIndex].members[editingMember.memberIndex];
      member.name = memberFormData.name;
      member.role = memberFormData.role;
      member.email = memberFormData.email;
    } else {
      // Add new member
      const newMember = {
        id: 'person_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        name: memberFormData.name,
        role: memberFormData.role,
        email: memberFormData.email
      };
      updatedZones[editingMember.zoneIndex].members.push(newMember);
    }

    const updatedData = {
      ...staffingData,
      zones: updatedZones
    };

    await saveStaffingData(updatedData);
    closeMemberModal();
  };

  const handleAddMember = async (zoneIndex, memberData) => {
    // This is now handled by the modal
    openAddMemberModal(zoneIndex);
  };

  const handleExport = () => {
    const dataToExport = prepareTeamDataForExport(staffingData);
    exportToCSV(dataToExport, 'team_roster');
  };

  if (loading || !staffingData) {
    return (
      <Layout>
        <div className="tab-content active">
          <p>Loading team data...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div id="team-tab" className="tab-content active">
        <div className="tab-header">
          <div className="tab-controls">
            <div className="sub-nav">
              <button
                className={'sub-nav-btn ' + (activeView === 'team-view' ? 'active' : '')}
                onClick={() => setActiveView('team-view')}
              >
                <i className="fas fa-users"></i> Team View
              </button>
              <button
                className={'sub-nav-btn ' + (activeView === 'roster' ? 'active' : '')}
                onClick={() => setActiveView('roster')}
              >
                <i className="fas fa-list"></i> Full Roster
              </button>
            </div>
          </div>
        </div>

        {activeView === 'team-view' && (
          <div className="team-view active">
            <div className="team-overview">
              <div className="team-stats">
                <div className="stat-card">
                  <h3>Total Staff</h3>
                  <span className="stat-number">{getTotalStaff(staffingData)}</span>
                </div>
                <div className="stat-card">
                  <h3>MIT Techs</h3>
                  <span className="stat-number">{getMITTechCount(staffingData)}</span>
                </div>
                <div className="stat-card">
                  <h3>Demo Techs</h3>
                  <span className="stat-number">{getDemoTechCount(staffingData)}</span>
                </div>
                <div className="stat-card">
                  <h3>Total Zones</h3>
                  <span className="stat-number">{staffingData.zones?.length || 0}</span>
                </div>
              </div>

              {canManage && (
                <div className="team-actions">
                  <button className="btn btn-primary" onClick={openAddZoneModal}>
                    <i className="fas fa-plus"></i> Add New Zone
                  </button>
                </div>
              )}

              <div className="zones-container">
                {staffingData.management && staffingData.management.length > 0 && (
                  <div className="zone-card">
                    <div className="zone-header">
                      <h3>Management</h3>
                    </div>
                    <div className="zone-members">
                      {staffingData.management.map((member, idx) => (
                        <div key={idx} className="member-card">
                          <div className="member-details">
                            <span className="member-name">{member.name}</span>
                            <span className="member-role">{member.role}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {staffingData.zones && staffingData.zones.map((zone, zoneIndex) => (
                  <div key={zoneIndex} className="zone-wrapper">
                    <ZoneCard
                      zone={zone}
                      zoneIndex={zoneIndex}
                      canManage={canManage}
                      currentUserRole={currentUser?.role}
                      onMovePersonToZone={handleMovePersonToZone}
                      onRemoveMember={handleRemoveMember}
                      onAddMember={handleAddMember}
                      onEditMember={openEditMemberModal}
                      onViewProfile={viewMemberProfile}
                    />
                    {canManage && (
                      <div className="zone-actions" style={{ marginTop: '12px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                          className="btn btn-secondary btn-small"
                          onClick={() => openEditZoneModal(zone, zoneIndex)}
                        >
                          <i className="fas fa-edit"></i> Edit Zone
                        </button>
                        <button
                          className="btn btn-danger btn-small"
                          onClick={() => handleDeleteZone(zoneIndex)}
                        >
                          <i className="fas fa-trash"></i> Delete Zone
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {(!staffingData.zones || staffingData.zones.length === 0) && (
                  <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
                    <p style={{ color: '#6b7280', marginBottom: '16px' }}>No zones created yet.</p>
                    {canManage && (
                      <button className="btn btn-primary" onClick={openAddZoneModal}>
                        <i className="fas fa-plus"></i> Create First Zone
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeView === 'roster' && (
          <div className="team-view active">
            <div className="card">
              <div className="card-header">
                <h3><i className="fas fa-list"></i> Complete Team Roster</h3>
                <button className="btn btn-secondary" onClick={handleExport}>
                  <i className="fas fa-download"></i> Export CSV
                </button>
              </div>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Zone</th>
                      <th>Position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffingData.management && staffingData.management.map((member, idx) => (
                      <tr key={'mgmt-' + idx}>
                        <td><strong>{member.name}</strong></td>
                        <td>{member.role}</td>
                        <td>Management</td>
                        <td>
                          <span className="status-badge status-available">Leadership</span>
                        </td>
                      </tr>
                    ))}

                    {staffingData.zones && staffingData.zones.flatMap((zone, zoneIdx) => {
                      const rows = [];

                      if (zone.lead) {
                        rows.push(
                          <tr key={'zone-' + zoneIdx + '-lead'}>
                            <td><strong>{zone.lead.name}</strong></td>
                            <td>{zone.lead.role}</td>
                            <td>{zone.name}</td>
                            <td>
                              <span className="status-badge status-in-use">Lead</span>
                            </td>
                          </tr>
                        );
                      }

                      zone.members.forEach((member, memberIdx) => {
                        rows.push(
                          <tr key={'zone-' + zoneIdx + '-member-' + memberIdx}>
                            <td>{member.name}</td>
                            <td>{member.role}</td>
                            <td>{zone.name}</td>
                            <td>Member</td>
                          </tr>
                        );
                      });

                      return rows;
                    })}

                    {getTotalStaff(staffingData) === 0 && (
                      <tr>
                        <td colSpan="4" style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
                          No team members found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="dashboard-grid" style={{ marginTop: '24px' }}>
              <div className="metric-card">
                <div className="metric-header">
                  <h3><i className="fas fa-building"></i> Management</h3>
                </div>
                <div className="metric-value">
                  {staffingData.management?.length || 0}
                </div>
                <div className="metric-label">Leadership Team</div>
              </div>

              <div className="metric-card">
                <div className="metric-header">
                  <h3><i className="fas fa-star"></i> Zone Leads</h3>
                </div>
                <div className="metric-value">
                  {staffingData.zones?.filter(z => z.lead).length || 0}
                </div>
                <div className="metric-label">MIT Leads</div>
              </div>

              <div className="metric-card">
                <div className="metric-header">
                  <h3><i className="fas fa-users"></i> Technicians</h3>
                </div>
                <div className="metric-value">
                  {staffingData.zones?.reduce((acc, z) => acc + z.members.length, 0) || 0}
                </div>
                <div className="metric-label">Field Team</div>
              </div>

              <div className="metric-card">
                <div className="metric-header">
                  <h3><i className="fas fa-map-marked-alt"></i> Active Zones</h3>
                </div>
                <div className="metric-value">
                  {staffingData.zones?.length || 0}
                </div>
                <div className="metric-label">Service Areas</div>
              </div>
            </div>
          </div>
        )}

        {showZoneModal && (
          <div className="modal-overlay active" onClick={closeZoneModal}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>
                  <i className="fas fa-map-marked-alt"></i> {editingZone ? 'Edit Zone' : 'Add New Zone'}
                </h3>
                <button className="modal-close" onClick={closeZoneModal}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="zoneName">Zone Name <span style={{ color: 'red' }}>*</span></label>
                  <input
                    type="text"
                    id="zoneName"
                    name="name"
                    className="form-control"
                    value={zoneFormData.name}
                    onChange={handleZoneFormChange}
                    placeholder="e.g., North Houston, West Side, etc."
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="leadName">Zone Lead Name (Optional)</label>
                  <input
                    type="text"
                    id="leadName"
                    name="leadName"
                    className="form-control"
                    value={zoneFormData.leadName}
                    onChange={handleZoneFormChange}
                    placeholder="MIT Lead name"
                  />
                  <small style={{ color: '#6b7280', fontSize: '12px' }}>
                    You can add or change the lead later
                  </small>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={closeZoneModal}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleSaveZone}>
                  <i className="fas fa-save"></i> {editingZone ? 'Update' : 'Create'} Zone
                </button>
              </div>
            </div>
          </div>
        )}

        {showMemberModal && (
          <div className="modal-overlay active" onClick={closeMemberModal}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>
                  <i className="fas fa-user"></i> {editingMember?.memberIndex !== null ? 'Edit Member' : 'Add Member'}
                </h3>
                <button className="modal-close" onClick={closeMemberModal}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="memberName">Name <span style={{ color: 'red' }}>*</span></label>
                  <input
                    type="text"
                    id="memberName"
                    name="name"
                    className="form-control"
                    value={memberFormData.name}
                    onChange={handleMemberFormChange}
                    placeholder="e.g., John Smith"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="memberRole">Role <span style={{ color: 'red' }}>*</span></label>
                  <select
                    id="memberRole"
                    name="role"
                    className="form-control"
                    value={memberFormData.role}
                    onChange={handleMemberFormChange}
                  >
                    <option value="MIT Tech">MIT Tech</option>
                    <option value="Demo Tech">Demo Tech</option>
                    <option value="MIT Lead">MIT Lead</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="memberEmail">
                    Email (Gmail for Calendar)
                    <span style={{ marginLeft: '8px', fontSize: '12px', color: '#6b7280' }}>
                      (Required for route calendar integration)
                    </span>
                  </label>
                  <input
                    type="email"
                    id="memberEmail"
                    name="email"
                    className="form-control"
                    value={memberFormData.email}
                    onChange={handleMemberFormChange}
                    placeholder="e.g., tech@gmail.com"
                  />
                  <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                    This email is used to push route assignments to the technician's Google Calendar
                  </p>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={closeMemberModal}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleSaveMember}>
                  <i className="fas fa-save"></i> {editingMember?.memberIndex !== null ? 'Update' : 'Add'} Member
                </button>
              </div>
            </div>
          </div>
        )}

        {showProfileModal && (
          <div className="modal-overlay active" onClick={closeProfileModal}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
              <div className="modal-header">
                <h3>
                  <i className="fas fa-user-circle"></i> {profileData?.member?.name}
                </h3>
                <button className="modal-close" onClick={closeProfileModal}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="modal-body">
                {profileLoading ? (
                  <p style={{ textAlign: 'center', padding: '40px' }}>
                    <i className="fas fa-spinner fa-spin"></i> Loading profile data...
                  </p>
                ) : profileData ? (
                  <>
                    <div style={{ marginBottom: '20px' }}>
                      <p><strong>Role:</strong> {profileData.member.role}</p>
                      {profileData.member.email && <p><strong>Email:</strong> {profileData.member.email}</p>}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                      <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: profileData.evaluation?.category ? (profileData.evaluation.category.class === 'success' ? '#f0fdf4' : profileData.evaluation.category.class === 'warning' ? '#fffbeb' : '#fef2f2') : '#f8fafc' }}>
                        <h4 style={{ marginBottom: '8px', fontSize: '14px', color: '#6b7280' }}>
                          <i className="fas fa-chart-bar"></i> 70/20/10 Score
                        </h4>
                        {profileData.evaluation ? (
                          <>
                            <div style={{ fontSize: '2em', fontWeight: '700', color: profileData.evaluation.category.class === 'success' ? '#15803d' : profileData.evaluation.category.class === 'warning' ? '#b45309' : '#b91c1c' }}>
                              {profileData.evaluation.score}
                            </div>
                            <div style={{ fontWeight: '600', marginTop: '4px' }}>
                              Category: <strong>{profileData.evaluation.category.value}</strong>
                            </div>
                            <div style={{ fontSize: '0.9em', color: '#6b7280', marginTop: '4px' }}>
                              {profileData.evaluation.category.label}
                            </div>
                            {profileData.evaluation.date && (
                              <div style={{ fontSize: '0.85em', color: '#6b7280', marginTop: '8px' }}>
                                Last eval: {new Date(profileData.evaluation.date.seconds * 1000).toLocaleDateString()}
                              </div>
                            )}
                          </>
                        ) : (
                          <p style={{ color: '#6b7280' }}>No evaluation found</p>
                        )}
                      </div>

                      <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: profileData.driverScore ? (profileData.driverScore.class === 'success' ? '#f0fdf4' : profileData.driverScore.class === 'warning' ? '#fffbeb' : '#fef2f2') : '#f8fafc' }}>
                        <h4 style={{ marginBottom: '8px', fontSize: '14px', color: '#6b7280' }}>
                          <i className="fas fa-tachometer-alt"></i> Driver Score
                        </h4>
                        {profileData.driverScore ? (
                          <>
                            <div style={{ fontSize: '2em', fontWeight: '700', color: profileData.driverScore.class === 'success' ? '#15803d' : profileData.driverScore.class === 'warning' ? '#b45309' : '#b91c1c' }}>
                              {profileData.driverScore.rate}
                            </div>
                            <div style={{ fontWeight: '600', marginTop: '4px' }}>
                              Rating: <strong>{profileData.driverScore.label}</strong>
                            </div>
                            <div style={{ fontSize: '0.85em', color: '#6b7280', marginTop: '4px' }}>
                              Rate per 1k miles
                            </div>
                          </>
                        ) : (
                          <p style={{ color: '#6b7280' }}>No driver data available</p>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <p>No data available</p>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={closeProfileModal}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Team;
