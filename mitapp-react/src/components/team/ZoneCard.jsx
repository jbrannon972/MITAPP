import { useState } from 'react';
import TechnicianCard from './TechnicianCard';

const ZoneCard = ({
  zone,
  zoneIndex,
  canManage,
  currentUserRole,
  onMovePersonToZone,
  onRemoveMember,
  onAddMember
}) => {
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    if (canManage) {
      setDragOver(true);
    }
  };

  const handleDragLeave = (e) => {
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget)) {
      setDragOver(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);

    if (!canManage) return;

    const personId = e.dataTransfer.getData('text/plain');
    if (personId) {
      onMovePersonToZone(personId, zoneIndex);
    }
  };

  const handleAddMember = () => {
    if (!canManage) return;

    const memberName = prompt('Enter member name:');
    if (!memberName) return;

    const memberRole = prompt('Enter role (MIT Tech or Demo Tech):');
    if (!memberRole) return;

    if (onAddMember) {
      onAddMember(zoneIndex, { name: memberName, role: memberRole });
    }
  };

  const countTechsByRole = (role) => {
    return zone.members.filter(m => m.role === role).length;
  };

  const canClickProfile = (person) => {
    if (!person) return false;
    if (currentUserRole === 'Manager') return true;
    if (['Supervisor', 'MIT Lead'].includes(currentUserRole) &&
        person.role !== 'Supervisor' && person.role !== 'MIT Lead') {
      return true;
    }
    return false;
  };

  return (
    <div
      className={`zone-card zone-${zoneIndex + 1} ${dragOver ? 'drag-over' : ''}`}
      data-zone-index={zoneIndex}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="zone-header">
        <h3 className={`zone-title ${currentUserRole !== 'Manager' ? 'no-click' : ''}`}>
          {zone.name}
          {currentUserRole === 'Manager' && <i className="fas fa-info-circle"></i>}
        </h3>
        <div
          className={`zone-lead ${!canClickProfile(zone.lead) ? 'no-click' : ''}`}
          data-person-id={zone.lead?.id}
          draggable={canManage}
          onDragStart={(e) => {
            if (canManage && zone.lead) {
              e.dataTransfer.setData('text/plain', zone.lead.id);
            }
          }}
        >
          <i className="fas fa-star"></i>
          <span>{zone.lead ? zone.lead.name : 'N/A'}</span>
        </div>
      </div>

      <div className="zone-members">
        {zone.members.map((member, memberIndex) => (
          <TechnicianCard
            key={member.id || memberIndex}
            member={member}
            memberIndex={memberIndex}
            zoneIndex={zoneIndex}
            canManage={canManage}
            canClickProfile={canClickProfile(member)}
            onRemove={() => onRemoveMember(zoneIndex, memberIndex)}
          />
        ))}

        {canManage && (
          <div className="add-member-section">
            <button
              className="btn btn-outline"
              onClick={handleAddMember}
            >
              <i className="fas fa-plus"></i> Add Member
            </button>
          </div>
        )}
      </div>

      <div className="zone-stats">
        <span>MIT Techs: {countTechsByRole('MIT Tech')}</span>
        <span>Demo Techs: {countTechsByRole('Demo Tech')}</span>
      </div>
    </div>
  );
};

export default ZoneCard;
