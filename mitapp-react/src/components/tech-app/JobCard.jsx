import { useState } from 'react';
import { formatTimeAMPM } from '../../utils/routingHelpers';

const JobCard = ({ job, index, isCurrent, isNext, onStatusChange, onNavigate, onCall }) => {
  const [expanded, setExpanded] = useState(false);

  const status = job.status || 'not_started';

  // Status display
  const getStatusDisplay = () => {
    switch (status) {
      case 'complete':
        return { icon: 'fa-check-circle', label: 'Complete', color: 'complete' };
      case 'in_progress':
        return { icon: 'fa-play-circle', label: 'In Progress', color: 'in-progress' };
      default:
        return { icon: 'fa-circle', label: 'Not Started', color: 'not-started' };
    }
  };

  const statusDisplay = getStatusDisplay();

  // Next status button
  const getNextStatusAction = () => {
    switch (status) {
      case 'complete':
        return null; // No action if complete
      case 'in_progress':
        return {
          label: 'Complete Job',
          icon: 'fa-check',
          nextStatus: 'complete',
          color: 'complete'
        };
      default:
        return {
          label: 'Start Job',
          icon: 'fa-play',
          nextStatus: 'in_progress',
          color: 'in-progress'
        };
    }
  };

  const nextAction = getNextStatusAction();

  // Format timeframe
  const timeframe = job.timeframeStart && job.timeframeEnd
    ? `${formatTimeAMPM(job.timeframeStart)} - ${formatTimeAMPM(job.timeframeEnd)}`
    : 'Time TBD';

  // Format drive time
  const driveTime = job.travelTime
    ? `${job.travelTime} min`
    : job.driveTimeToNext
    ? `${job.driveTimeToNext} min`
    : null;

  return (
    <div
      className={`tech-job-card ${statusDisplay.color} ${isCurrent ? 'current' : ''} ${isNext ? 'next' : ''} ${expanded ? 'expanded' : ''}`}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Job Header */}
      <div className="tech-job-header">
        <div className="tech-job-status-icon">
          <i className={`fas ${statusDisplay.icon}`}></i>
        </div>

        <div className="tech-job-main-info">
          <div className="tech-job-number">Job {index + 1}</div>
          <div className="tech-job-customer">{job.customer || 'Customer Name'}</div>
          <div className="tech-job-type">{job.jobType || 'Service'} • {job.duration}h</div>
        </div>

        <div className="tech-job-indicators">
          {isCurrent && <span className="tech-current-badge">Current</span>}
          {isNext && !isCurrent && <span className="tech-next-badge">Next</span>}
          {driveTime && !isCurrent && (
            <span className="tech-drive-badge">
              <i className="fas fa-car"></i> {driveTime}
            </span>
          )}
        </div>
      </div>

      {/* Job Quick Info */}
      <div className="tech-job-quick-info">
        <div className="tech-job-time">
          <i className="fas fa-clock"></i>
          {timeframe}
        </div>
        <div className="tech-job-address-short">
          <i className="fas fa-map-marker-alt"></i>
          {job.address?.split(',')[0] || 'Address'}
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="tech-job-details">
          <div className="tech-job-detail-section">
            <div className="tech-job-detail-label">Full Address</div>
            <div className="tech-job-detail-value">{job.address || 'N/A'}</div>
          </div>

          {job.phone && (
            <div className="tech-job-detail-section">
              <div className="tech-job-detail-label">Phone</div>
              <div className="tech-job-detail-value">{job.phone}</div>
            </div>
          )}

          {job.instructions && (
            <div className="tech-job-detail-section">
              <div className="tech-job-detail-label">Special Instructions</div>
              <div className="tech-job-detail-value">{job.instructions}</div>
            </div>
          )}

          {job.notes && (
            <div className="tech-job-detail-section">
              <div className="tech-job-detail-label">Notes</div>
              <div className="tech-job-detail-value">{job.notes}</div>
            </div>
          )}

          {job.demoTech && (
            <div className="tech-job-detail-section">
              <div className="tech-job-detail-label">Second Tech</div>
              <div className="tech-job-detail-value">
                <i className="fas fa-user"></i> {job.demoTech}
              </div>
            </div>
          )}

          {/* Status timestamps */}
          {job.actualStartTime && (
            <div className="tech-job-detail-section">
              <div className="tech-job-detail-label">Started At</div>
              <div className="tech-job-detail-value">
                {new Date(job.actualStartTime).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                })}
              </div>
            </div>
          )}

          {job.actualEndTime && (
            <div className="tech-job-detail-section">
              <div className="tech-job-detail-label">Completed At</div>
              <div className="tech-job-detail-value">
                {new Date(job.actualEndTime).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="tech-job-actions" onClick={(e) => e.stopPropagation()}>
        {nextAction && (
          <button
            className={`tech-job-action-btn primary ${nextAction.color}`}
            onClick={() => onStatusChange(job.id, nextAction.nextStatus)}
          >
            <i className={`fas ${nextAction.icon}`}></i>
            {nextAction.label}
          </button>
        )}

        {status === 'complete' && (
          <div className="tech-job-complete-indicator">
            <i className="fas fa-check-circle"></i>
            Completed
          </div>
        )}

        <div className="tech-job-secondary-actions">
          {job.address && (
            <button
              className="tech-job-action-btn secondary"
              onClick={() => onNavigate(job.address)}
            >
              <i className="fas fa-directions"></i>
              Navigate
            </button>
          )}

          {job.phone && (
            <button
              className="tech-job-action-btn secondary"
              onClick={() => onCall(job.phone)}
            >
              <i className="fas fa-phone"></i>
              Call
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default JobCard;
