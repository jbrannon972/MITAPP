import React from 'react';

/**
 * CapabilityWarningModal - Warns when assigning a job beyond staff capabilities
 *
 * @param {boolean} show - Whether to show the modal
 * @param {Object} staff - Staff member being assigned
 * @param {string} jobType - Type of job being assigned
 * @param {Function} onConfirm - Callback when user confirms assignment anyway
 * @param {Function} onCancel - Callback when user cancels assignment
 */
const CapabilityWarningModal = ({
  show,
  staff,
  jobType,
  onConfirm,
  onCancel
}) => {
  if (!show || !staff) return null;

  const capabilities = staff.capabilities || {};

  // Map job types to capability names
  const jobTypeToCapability = {
    'install': 'install',
    'demo': 'install', // Demo jobs usually require install capability
    'demo prep': 'install',
    'demo-prep': 'install',
    'check': 'cs',
    'service': 'cs',
    'pull': 'pull',
    'fs visit': 'cs',
    'fs-visit': 'cs'
  };

  const requiredCapability = jobTypeToCapability[jobType?.toLowerCase()] || jobType?.toLowerCase();
  const hasCapability = capabilities[requiredCapability];

  // Don't show warning if they have the capability
  if (hasCapability) return null;

  // Format capability name for display
  const capabilityNames = {
    'install': 'Install',
    'cs': 'Check / Service',
    'pull': 'Pull',
    'sub': 'Sub Support'
  };

  const formattedJobType = jobType?.charAt(0).toUpperCase() + jobType?.slice(1).toLowerCase();
  const formattedCapability = capabilityNames[requiredCapability] || requiredCapability;

  return (
    <div className="modal-overlay active" onClick={onCancel}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '500px' }}
      >
        <div className="modal-header">
          <h3>
            <i className="fas fa-exclamation-triangle" style={{ color: 'var(--warning-color)' }}></i>
            {' '}Capability Warning
          </h3>
          <button className="modal-close" onClick={onCancel}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="modal-body">
          <div style={{ marginBottom: '16px' }}>
            <strong style={{ fontSize: '16px' }}>
              {staff.name} {staff.type && `(${staff.type === 'projectManager' ? 'PM' :
                                                   staff.type === 'ehqLeader' ? 'EHQ Leader' :
                                                   'EHQ CS Staff'})`}
            </strong>
            {' '}is not authorized for {formattedJobType} jobs.
          </div>

          <div style={{
            padding: '16px',
            backgroundColor: 'var(--surface-secondary)',
            borderRadius: '6px',
            marginBottom: '16px'
          }}>
            <div style={{ fontWeight: '600', marginBottom: '8px' }}>Their capabilities:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {capabilities.install !== undefined && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className={`fas ${capabilities.install ? 'fa-check-circle' : 'fa-times-circle'}`}
                     style={{ color: capabilities.install ? 'var(--success-color)' : 'var(--danger-color)' }}></i>
                  <span>Install / Demo</span>
                </div>
              )}
              {capabilities.cs !== undefined && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className={`fas ${capabilities.cs ? 'fa-check-circle' : 'fa-times-circle'}`}
                     style={{ color: capabilities.cs ? 'var(--success-color)' : 'var(--danger-color)' }}></i>
                  <span>Check / Service</span>
                </div>
              )}
              {capabilities.pull !== undefined && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className={`fas ${capabilities.pull ? 'fa-check-circle' : 'fa-times-circle'}`}
                     style={{ color: capabilities.pull ? 'var(--success-color)' : 'var(--danger-color)' }}></i>
                  <span>Pull</span>
                </div>
              )}
              {capabilities.sub !== undefined && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className={`fas ${capabilities.sub ? 'fa-check-circle' : 'fa-times-circle'}`}
                     style={{ color: capabilities.sub ? 'var(--success-color)' : 'var(--danger-color)' }}></i>
                  <span>Sub Support</span>
                </div>
              )}
            </div>
          </div>

          <div style={{
            padding: '12px',
            backgroundColor: 'var(--warning-bg)',
            borderLeft: '4px solid var(--warning-color)',
            borderRadius: '4px',
            fontSize: '14px',
            color: 'var(--text-primary)'
          }}>
            <strong>Do you want to assign this job anyway?</strong>
            <div style={{ marginTop: '4px', fontSize: '13px', opacity: 0.8 }}>
              This assignment will be logged for review.
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>
            <i className="fas fa-times"></i> Cancel
          </button>
          <button className="btn btn-warning" onClick={onConfirm}>
            <i className="fas fa-exclamation-triangle"></i> Assign Anyway
          </button>
        </div>
      </div>
    </div>
  );
};

export default CapabilityWarningModal;
