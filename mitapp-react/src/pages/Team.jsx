import { useState, useEffect } from 'react';
import Layout from '../components/common/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import ZoneCard from '../components/team/ZoneCard';
import { getTotalStaff, getMITTechCount, getDemoTechCount } from '../utils/calculations';

const Team = () => {
  const { currentUser } = useAuth();
  const { staffingData, saveStaffingData, loading } = useData();
  const [activeView, setActiveView] = useState('team-view');
  const [isAdmin, setIsAdmin] = useState(false);

  const canManage = currentUser && ['Manager', 'Supervisor', 'MIT Lead'].includes(currentUser.role);

  const handleAddZone = () => {
    if (!canManage) return;

    const zoneName = prompt('Enter zone name:');
    if (!zoneName) return;

    const newZone = {
      name: zoneName,
      lead: null,
      members: []
    };

    const updatedData = {
      ...staffingData,
      zones: [...(staffingData.zones || []), newZone]
    };

    saveStaffingData(updatedData);
  };

  const handleMovePersonToZone = async (personId, newZoneIndex) => {
    if (!canManage || !staffingData) return;

    // Find person and original zone
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

    // Move logic
    if (person.role === 'MIT Lead') {
      // Swap leads
      const targetLead = newZone.lead;
      newZone.lead = person;
      originalZone.lead = targetLead;
    } else {
      // Move member
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

  const handleAddMember = async (zoneIndex, memberData) => {
    if (!canManage) return;

    const newMember = {
      id: `person_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: memberData.name,
      role: memberData.role
    };

    const updatedZones = [...staffingData.zones];
    updatedZones[zoneIndex].members.push(newMember);

    const updatedData = {
      ...staffingData,
      zones: updatedZones
    };

    await saveStaffingData(updatedData);
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
                className={`sub-nav-btn ${activeView === 'team-view' ? 'active' : ''}`}
                onClick={() => setActiveView('team-view')}
              >
                <i className="fas fa-users"></i> Team View
              </button>
              <button
                className={`sub-nav-btn ${activeView === 'leaderboard' ? 'active' : ''}`}
                onClick={() => setActiveView('leaderboard')}
              >
                <i className="fas fa-trophy"></i> Driver Leaderboard
              </button>
              <button
                className={`sub-nav-btn ${activeView === 'evaluation' ? 'active' : ''}`}
                onClick={() => setActiveView('evaluation')}
              >
                <i className="fas fa-clipboard-check"></i> 20/70/10
              </button>
            </div>
          </div>
        </div>

        {/* Team View */}
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
                  <h3>MIT Leads</h3>
                  <span className="stat-number">{staffingData.zones?.length || 0}</span>
                </div>
              </div>

              {canManage && (
                <div className="team-actions">
                  <button className="btn btn-primary" onClick={handleAddZone}>
                    <i className="fas fa-plus"></i> Add New Zone
                  </button>
                </div>
              )}

              <div className="zones-container">
                {/* Management Zone */}
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

                {/* Regular Zones */}
                {staffingData.zones && staffingData.zones.map((zone, zoneIndex) => (
                  <ZoneCard
                    key={zoneIndex}
                    zone={zone}
                    zoneIndex={zoneIndex}
                    canManage={canManage}
                    currentUserRole={currentUser?.role}
                    onMovePersonToZone={handleMovePersonToZone}
                    onRemoveMember={handleRemoveMember}
                    onAddMember={handleAddMember}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Leaderboard View */}
        {activeView === 'leaderboard' && (
          <div className="team-view active">
            <div className="card">
              <div className="card-header">
                <h3><i className="fas fa-trophy"></i> Driver Leaderboard</h3>
              </div>
              <p style={{ padding: '20px' }}>Leaderboard functionality will be implemented next.</p>
            </div>
          </div>
        )}

        {/* Evaluation View */}
        {activeView === 'evaluation' && (
          <div className="team-view active">
            <div className="card">
              <div className="card-header">
                <h3><i className="fas fa-clipboard-check"></i> 20/70/10 Evaluations</h3>
              </div>
              <p style={{ padding: '20px' }}>Evaluation functionality will be implemented next.</p>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Team;
