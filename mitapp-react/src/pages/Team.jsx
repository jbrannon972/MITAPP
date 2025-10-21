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
                <h3><i className="fas fa-trophy"></i> Driver Safety Leaderboard</h3>
                <span style={{ fontSize: '14px', color: '#6b7280' }}>
                  Lower scores are better. Monitored events include: speeding, hard braking, following too close, etc.
                </span>
              </div>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Driver Name</th>
                      <th>Zone</th>
                      <th>Safety Score</th>
                      <th>Events This Month</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffingData.zones?.flatMap((zone, zoneIdx) =>
                      [
                        zone.lead ? { ...zone.lead, zoneName: zone.name } : null,
                        ...zone.members.map(member => ({ ...member, zoneName: zone.name }))
                      ].filter(Boolean)
                    ).map((person, index) => (
                      <tr key={person.id}>
                        <td>
                          <strong>
                            {index + 1}
                            {index === 0 && <i className="fas fa-trophy" style={{ marginLeft: '8px', color: '#fbbf24' }}></i>}
                            {index === 1 && <i className="fas fa-medal" style={{ marginLeft: '8px', color: '#9ca3af' }}></i>}
                            {index === 2 && <i className="fas fa-medal" style={{ marginLeft: '8px', color: '#c2410c' }}></i>}
                          </strong>
                        </td>
                        <td>{person.name}</td>
                        <td>{person.zoneName}</td>
                        <td>
                          <span className={`status-badge ${
                            (index % 3 === 0) ? 'status-available' :
                            (index % 3 === 1) ? 'status-in-use' :
                            'status-in-repairs'
                          }`}>
                            {index % 3 === 0 ? 'Excellent' : index % 3 === 1 ? 'Good' : 'Needs Improvement'}
                          </span>
                        </td>
                        <td>{Math.floor(Math.random() * 10)}</td>
                        <td>
                          <button className="btn btn-secondary btn-small" disabled title="Coming soon">
                            <i className="fas fa-chart-line"></i> Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card" style={{ marginTop: '24px' }}>
              <div className="card-header">
                <h3><i className="fas fa-exclamation-circle"></i> Event Key</h3>
              </div>
              <div style={{ padding: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '12px' }}>
                  <div><strong>Rolling Stop:</strong> 3 pts</div>
                  <div><strong>Following Too Close:</strong> 3 pts</div>
                  <div><strong>Hard Brake:</strong> 3 pts</div>
                  <div><strong>Speeding Above 15mph:</strong> 5 pts</div>
                  <div><strong>No Seatbelt:</strong> 10 pts</div>
                  <div><strong>Critical Distance:</strong> 10 pts</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Evaluation View */}
        {activeView === 'evaluation' && (
          <div className="team-view active">
            <div className="card" style={{ marginBottom: '24px', backgroundColor: '#eff6ff', border: '1px solid #3b82f6' }}>
              <div className="card-header" style={{ backgroundColor: '#dbeafe' }}>
                <h3><i className="fas fa-info-circle"></i> About the 20/70/10 System</h3>
              </div>
              <div style={{ padding: '20px' }}>
                <p style={{ marginBottom: '12px' }}>
                  The 20/70/10 performance management system categorizes employees based on their performance:
                </p>
                <ul style={{ marginLeft: '20px', lineHeight: '1.8' }}>
                  <li><strong>Top 20%:</strong> High performers who exceed expectations consistently</li>
                  <li><strong>Middle 70%:</strong> Solid performers who meet expectations</li>
                  <li><strong>Bottom 10%:</strong> Underperformers who need improvement plans</li>
                </ul>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h3><i className="fas fa-clipboard-check"></i> Employee Evaluations</h3>
                <div className="tab-controls">
                  <button className="btn btn-primary" disabled title="Coming soon">
                    <i className="fas fa-plus"></i> Add Evaluation
                  </button>
                </div>
              </div>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Zone</th>
                      <th>Category</th>
                      <th>Avg. Score</th>
                      <th>Performance Plan</th>
                      <th>Last Evaluated</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffingData.zones?.flatMap((zone, zoneIdx) =>
                      [
                        zone.lead ? { ...zone.lead, zoneName: zone.name } : null,
                        ...zone.members.map(member => ({ ...member, zoneName: zone.name }))
                      ].filter(Boolean)
                    ).map((person, index) => {
                      const category = index % 10 < 2 ? '20' : index % 10 < 9 ? '70' : '10';
                      const avgScore = category === '20' ? 92 + Math.floor(Math.random() * 8) :
                                     category === '70' ? 75 + Math.floor(Math.random() * 15) :
                                     55 + Math.floor(Math.random() * 15);
                      const daysAgo = Math.floor(Math.random() * 90);

                      return (
                        <tr key={person.id}>
                          <td><strong>{person.name}</strong></td>
                          <td>{person.zoneName}</td>
                          <td>
                            <span className={`status-badge ${
                              category === '20' ? 'status-available' :
                              category === '70' ? 'status-in-use' :
                              'status-in-repairs'
                            }`}>
                              Top {category}%
                            </span>
                          </td>
                          <td>
                            <strong style={{
                              color: avgScore >= 90 ? '#10b981' : avgScore >= 75 ? '#3b82f6' : '#ef4444'
                            }}>
                              {avgScore}%
                            </strong>
                          </td>
                          <td>{category === '10' ? 'Performance Improvement Plan' : category === '20' ? 'Growth & Leadership' : 'Standard Development'}</td>
                          <td>{daysAgo === 0 ? 'Today' : `${daysAgo} days ago`}</td>
                          <td style={{ textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary btn-small" disabled title="Coming soon">
                              <i className="fas fa-eye"></i> View
                            </button>
                            {canManage && (
                              <button className="btn btn-primary btn-small" disabled title="Coming soon">
                                <i className="fas fa-edit"></i> Edit
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="dashboard-grid" style={{ marginTop: '24px' }}>
              <div className="metric-card">
                <div className="metric-header">
                  <h3><i className="fas fa-star"></i> Top 20%</h3>
                </div>
                <div className="metric-value">
                  {Math.floor((staffingData.zones?.flatMap(z => [z.lead, ...z.members]).filter(Boolean).length || 0) * 0.2)}
                </div>
                <div className="metric-label">High Performers</div>
              </div>

              <div className="metric-card">
                <div className="metric-header">
                  <h3><i className="fas fa-users"></i> Middle 70%</h3>
                </div>
                <div className="metric-value">
                  {Math.floor((staffingData.zones?.flatMap(z => [z.lead, ...z.members]).filter(Boolean).length || 0) * 0.7)}
                </div>
                <div className="metric-label">Solid Performers</div>
              </div>

              <div className="metric-card">
                <div className="metric-header">
                  <h3><i className="fas fa-exclamation-triangle"></i> Bottom 10%</h3>
                </div>
                <div className="metric-value">
                  {Math.floor((staffingData.zones?.flatMap(z => [z.lead, ...z.members]).filter(Boolean).length || 0) * 0.1)}
                </div>
                <div className="metric-label">Need Improvement</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Team;
