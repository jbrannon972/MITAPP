import { useData } from '../../contexts/DataContext';

const TechTeam = () => {
  const { staffingData } = useData();

  if (!staffingData || !staffingData.zones) {
    return (
      <div className="tech-team-container">
        <div className="tech-no-members">
          No team data available
        </div>
      </div>
    );
  }

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name[0].toUpperCase();
  };

  return (
    <div className="tech-team-container">
      <div className="tech-zones-container">
        {staffingData.zones.map((zone, idx) => (
          <div key={idx} className="tech-zone-card">
            <div className="tech-zone-header">
              <h3>
                <i className="fas fa-map-marked-alt"></i>
                {zone.name}
              </h3>
              {zone.lead && (
                <div className="tech-zone-lead">
                  <i className="fas fa-star"></i>
                  {zone.lead.name}
                </div>
              )}
            </div>
            <div className="tech-zone-members">
              {zone.members && zone.members.length > 0 ? (
                zone.members.map((member, memberIdx) => (
                  <div key={memberIdx} className="tech-member-card">
                    <div className="tech-member-avatar">
                      {getInitials(member.name)}
                    </div>
                    <div className="tech-member-details">
                      <div className="tech-member-name">{member.name}</div>
                      <div className="tech-member-role">
                        <i className="fas fa-user"></i>
                        {member.role || 'Technician'}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="tech-no-members">
                  No members in this zone
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TechTeam;
