const TechnicianCard = ({
  member,
  memberIndex,
  zoneIndex,
  canManage,
  canClickProfile,
  onRemove,
  onEdit,
  onViewProfile
}) => {
  const formatName = (fullName) => {
    if (!fullName || typeof fullName !== 'string') return '';
    const cleanedName = fullName.replace(/\s*\(.*\)\s*/, '').trim();
    const parts = cleanedName.split(' ');
    if (parts.length === 1) return parts[0];
    const firstName = parts[0];
    const lastName = parts[parts.length - 1];
    if (lastName.length === 1 && lastName.match(/[A-Z]/)) {
      return `${firstName} ${lastName}.`;
    }
    const lastInitial = lastName.charAt(0).toUpperCase();
    return `${firstName} ${lastInitial}.`;
  };

  const roleClass = (member.role || '').toLowerCase().replace(' ', '-');

  const handleDragStart = (e) => {
    if (canManage) {
      e.dataTransfer.setData('text/plain', member.id);
      setTimeout(() => {
        e.target.classList.add('dragging');
      }, 0);
    }
  };

  const handleDragEnd = (e) => {
    e.target.classList.remove('dragging');
  };

  return (
    <div
      className={`member-card ${roleClass} ${!canClickProfile ? 'no-click' : ''}`}
      data-person-id={member.id}
      draggable={canManage}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={(e) => {
        if (canClickProfile && onViewProfile && !e.target.closest('button')) {
          onViewProfile();
        }
      }}
      style={{ cursor: canClickProfile ? 'pointer' : 'default' }}
    >
      {canManage && zoneIndex !== 'management' && (
        <>
          <button
            className="btn btn-edit"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            title="Edit Member"
            style={{ position: 'absolute', top: '4px', right: '28px', padding: '2px 6px', fontSize: '10px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
          >
            <i className="fas fa-edit"></i>
          </button>
          <button
            className="btn btn-remove"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            title="Remove Member"
          >
            <i className="fas fa-times"></i>
          </button>
        </>
      )}
      <div className={`member-details ${!canManage ? 'no-controls' : ''}`}>
        <span className="member-name">{formatName(member.name)}</span>
        <span className="member-role">{member.role}</span>
      </div>
    </div>
  );
};

export default TechnicianCard;
