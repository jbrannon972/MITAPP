import React from 'react';

/**
 * Clean confirmation/alert modal for routing page
 * Replaces browser alert() and confirm() with better UI
 */
const ConfirmModal = ({ show, onClose, onConfirm, title, message, type = 'info', confirmText = 'OK', cancelText = 'Cancel' }) => {
  if (!show) return null;

  const isConfirm = !!onConfirm;

  const getIcon = () => {
    switch (type) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'question': return '❓';
      default: return 'ℹ️';
    }
  };

  const getColor = () => {
    switch (type) {
      case 'success': return 'var(--success-color)';
      case 'error': return 'var(--danger-color)';
      case 'warning': return 'var(--warning-color)';
      default: return 'var(--info-color)';
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          maxWidth: '500px',
          width: '100%',
          padding: '24px',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)',
          animation: 'slideIn 0.2s ease-out'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon and Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <span style={{ fontSize: '32px', lineHeight: 1 }}>{getIcon()}</span>
          <h3 style={{ margin: 0, color: getColor(), flex: 1 }}>{title}</h3>
        </div>

        {/* Message */}
        <div style={{
          fontSize: '14px',
          lineHeight: '1.6',
          color: 'var(--text-primary)',
          marginBottom: '24px',
          whiteSpace: 'pre-wrap'
        }}>
          {message}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          {isConfirm && (
            <button
              onClick={onClose}
              className="btn btn-secondary"
              style={{ minWidth: '80px' }}
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={() => {
              if (isConfirm && onConfirm) {
                onConfirm();
              }
              onClose();
            }}
            className={`btn ${type === 'error' ? 'btn-danger' : type === 'warning' ? 'btn-warning' : 'btn-primary'}`}
            style={{ minWidth: '80px' }}
            autoFocus
          >
            {confirmText}
          </button>
        </div>
      </div>

      {/* Animation */}
      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
};

export default ConfirmModal;
