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
      style={{ cursor: canClickProfile ? 'pointer' : 'default', position: 'relative' }}
    >
      <div className={`member-details ${!canManage ? 'no-controls' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
        {canManage && zoneIndex !== 'management' && (
          <button
            className="btn btn-delete-tech"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            title="Remove Member"
            style={{
              backgroundColor: 'var(--surface-secondary)',
              border: '1px solid var(--danger-color)',
              color: 'var(--danger-color)',
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
              minWidth: '24px',
              minHeight: '24px',
              flexShrink: 0
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--danger-color)';
              e.currentTarget.style.color = 'white';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--surface-secondary)';
              e.currentTarget.style.color = 'var(--danger-color)';
            }}
          >
            <i className="fas fa-trash-alt"></i>
          </button>
        )}
        <span className="member-name" style={{ flex: 1 }}>{formatName(member.name)}</span>
        <span className="member-role">{member.role}</span>
      </div>
    </div>
  );
};

export default TechnicianCard;
