import { useState } from 'react';
import '../../styles/conflict-panel.css';

const ConflictPanel = ({ conflicts, onAutoFix, onDismiss }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isFixing, setIsFixing] = useState(false);

  if (!conflicts || conflicts.length === 0) {
    return null; // Don't show panel if no conflicts
  }

  const handleAutoFix = async () => {
    setIsFixing(true);
    try {
      await onAutoFix(conflicts);
    } finally {
      setIsFixing(false);
    }
  };

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'critical':
        return '🚨';
      case 'high':
        return '⚠️';
      case 'medium':
        return '⚡';
      case 'low':
        return 'ℹ️';
      default:
        return '❓';
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical':
        return 'var(--danger-color)';
      case 'high':
        return '#ff6b35';
      case 'medium':
        return 'var(--warning-color)';
      case 'low':
        return 'var(--info-color)';
      default:
        return 'var(--text-secondary)';
    }
  };

  const criticalCount = conflicts.filter(c => c.severity === 'critical').length;
  const highCount = conflicts.filter(c => c.severity === 'high').length;
  const mediumCount = conflicts.filter(c => c.severity === 'medium').length;

  return (
    <div className={`conflict-panel ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <div className="conflict-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="conflict-title">
          <span className="conflict-icon">⚠️</span>
          <span className="conflict-count">CONFLICTS ({conflicts.length})</span>
          {criticalCount > 0 && (
            <span className="badge badge-critical">{criticalCount} critical</span>
          )}
          {highCount > 0 && (
            <span className="badge badge-high">{highCount} high</span>
          )}
          {mediumCount > 0 && (
            <span className="badge badge-medium">{mediumCount} medium</span>
          )}
        </div>
        <div className="conflict-actions">
          {isExpanded && (
            <button
              className="btn btn-primary btn-small auto-fix-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleAutoFix();
              }}
              disabled={isFixing}
            >
              {isFixing ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i> Fixing...
                </>
              ) : (
                <>
                  <i className="fas fa-magic"></i> Auto-Fix All
                </>
              )}
            </button>
          )}
          <button
            className="btn-icon"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'}`}></i>
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="conflict-body">
          {conflicts.map((conflict, index) => (
            <div
              key={conflict.id || index}
              className="conflict-item"
              style={{ borderLeftColor: getSeverityColor(conflict.severity) }}
            >
              <div className="conflict-item-header">
                <span className="conflict-severity-icon">
                  {getSeverityIcon(conflict.severity)}
                </span>
                <span className="conflict-message">{conflict.message}</span>
              </div>

              {/* Show additional details based on conflict type */}
              {conflict.type === 'overtime' && conflict.data && (
                <div className="conflict-details">
                  <small>
                    Scheduled hours: {conflict.data.hours.toFixed(1)} / 8.0
                  </small>
                </div>
              )}

              {conflict.type === 'missing-demo-tech' && conflict.data && (
                <div className="conflict-details">
                  <small>
                    Jobs needing demo tech:{' '}
                    {conflict.data.jobs.map(j => j.customerName).join(', ')}
                  </small>
                </div>
              )}

              {conflict.type === 'overlap' && conflict.data && (
                <div className="conflict-details">
                  <small>
                    Job 1: {conflict.data.job1.customerName} ({conflict.data.job1.startTime}-
                    {conflict.data.job1.endTime})
                    <br />
                    Job 2: {conflict.data.job2.customerName} ({conflict.data.job2.startTime}-
                    {conflict.data.job2.endTime})
                  </small>
                </div>
              )}
            </div>
          ))}

          <div className="conflict-footer">
            <small style={{ color: 'var(--text-secondary)' }}>
              <i className="fas fa-info-circle"></i> Auto-fix will attempt to resolve conflicts
              by rebalancing workloads and reordering jobs
            </small>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConflictPanel;
