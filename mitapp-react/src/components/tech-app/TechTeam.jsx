import { useData } from '../../contexts/DataContext';

const TechTeam = () => {
  const { staffingData } = useData();

  if (!staffingData) {
    return <div className="tech-loading">Loading team information...</div>;
  }

  const { zones = [], management = [], warehouseStaff = [] } = staffingData;

  return (
    <div className="tech-team-container">
      <h2>Team</h2>

      {management && management.length > 0 && (
        <div className="tech-team-section">
          <h3><i className="fas fa-user-tie"></i> Management</h3>
          <div className="tech-team-grid">
            {management.map((member, idx) => (
              <div key={idx} className="tech-team-card">
                <div className="tech-team-member-icon">
                  <i className="fas fa-user-circle"></i>
                </div>
                <div className="tech-team-member-info">
                  <div className="tech-team-member-name">{member.name}</div>
                  <div className="tech-team-member-role">{member.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {zones && zones.map((zone, zoneIdx) => (
        <div key={zoneIdx} className="tech-team-section">
          <h3><i className="fas fa-users"></i> {zone.name}</h3>

          {zone.lead && (
            <div className="tech-team-lead">
              <div className="tech-team-card lead">
                <div className="tech-team-member-icon">
                  <i className="fas fa-star"></i>
                </div>
                <div className="tech-team-member-info">
                  <div className="tech-team-member-name">{zone.lead.name}</div>
                  <div className="tech-team-member-role">{zone.lead.role} (Lead)</div>
                </div>
              </div>
            </div>
          )}

          {zone.members && zone.members.length > 0 && (
            <div className="tech-team-grid">
              {zone.members.map((member, idx) => (
                <div key={idx} className="tech-team-card">
                  <div className="tech-team-member-icon">
                    <i className="fas fa-user"></i>
                  </div>
                  <div className="tech-team-member-info">
                    <div className="tech-team-member-name">{member.name}</div>
                    <div className="tech-team-member-role">{member.role}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {warehouseStaff && warehouseStaff.length > 0 && (
        <div className="tech-team-section">
          <h3><i className="fas fa-warehouse"></i> Warehouse</h3>
          <div className="tech-team-grid">
            {warehouseStaff.map((member, idx) => (
              <div key={idx} className="tech-team-card">
                <div className="tech-team-member-icon">
                  <i className="fas fa-user"></i>
                </div>
                <div className="tech-team-member-info">
                  <div className="tech-team-member-name">{member.name}</div>
                  <div className="tech-team-member-role">{member.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TechTeam;
