import { useData } from '../../contexts/DataContext';

const WarehouseTeam = () => {
  const { staffingData } = useData();

  if (!staffingData) {
    return <div className="warehouse-loading">Loading team information...</div>;
  }

  const { zones = [], management = [], warehouseStaff = [] } = staffingData;

  return (
    <div className="warehouse-team-container">
      <h2>Team Directory</h2>

      {management && management.length > 0 && (
        <div className="team-section">
          <h3><i className="fas fa-user-tie"></i> Management</h3>
          <div className="team-grid">
            {management.map((member, idx) => (
              <div key={idx} className="team-card">
                <div className="team-icon">
                  <i className="fas fa-user-circle"></i>
                </div>
                <div className="team-info">
                  <div className="team-name">{member.name}</div>
                  <div className="team-role">{member.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {warehouseStaff && warehouseStaff.length > 0 && (
        <div className="team-section">
          <h3><i className="fas fa-warehouse"></i> Warehouse</h3>
          <div className="team-grid">
            {warehouseStaff.map((member, idx) => (
              <div key={idx} className="team-card">
                <div className="team-icon">
                  <i className="fas fa-user"></i>
                </div>
                <div className="team-info">
                  <div className="team-name">{member.name}</div>
                  <div className="team-role">{member.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {zones && zones.map((zone, zoneIdx) => (
        <div key={zoneIdx} className="team-section">
          <h3><i className="fas fa-users"></i> {zone.name}</h3>

          {zone.lead && (
            <div className="team-lead">
              <div className="team-card lead">
                <div className="team-icon">
                  <i className="fas fa-star"></i>
                </div>
                <div className="team-info">
                  <div className="team-name">{zone.lead.name}</div>
                  <div className="team-role">{zone.lead.role} (Lead)</div>
                </div>
              </div>
            </div>
          )}

          {zone.members && zone.members.length > 0 && (
            <div className="team-grid">
              {zone.members.map((member, idx) => (
                <div key={idx} className="team-card">
                  <div className="team-icon">
                    <i className="fas fa-user"></i>
                  </div>
                  <div className="team-info">
                    <div className="team-name">{member.name}</div>
                    <div className="team-role">{member.role}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default WarehouseTeam;
