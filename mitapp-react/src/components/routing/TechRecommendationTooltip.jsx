import { useState, useEffect, useRef } from 'react';
import { getTechRecommendations } from '../../utils/techScoring';
import '../../styles/tech-recommendation.css';

const TechRecommendationTooltip = ({
  job,
  techs,
  routes,
  scheduleForDay,
  position,
  onAssignTech,
  onClose
}) => {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const tooltipRef = useRef(null);

  useEffect(() => {
    const fetchRecommendations = async () => {
      setLoading(true);
      try {
        const recs = await getTechRecommendations(job, techs, routes, scheduleForDay, {
          includeDistance: true,
          limit: 5
        });
        setRecommendations(recs);
      } catch (error) {
        console.error('Error fetching recommendations:', error);
        setRecommendations([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRecommendations();
  }, [job, techs, routes, scheduleForDay]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleAssign = (tech) => {
    onAssignTech(job.id, tech.id);
    onClose();
  };

  const getScoreColor = (score) => {
    if (score >= 80) return '#10b981'; // Green
    if (score >= 60) return '#3b82f6'; // Blue
    if (score >= 40) return '#f59e0b'; // Orange
    return '#ef4444'; // Red
  };

  const getScoreLabel = (score) => {
    if (score >= 80) return 'Excellent match';
    if (score >= 60) return 'Good match';
    if (score >= 40) return 'Fair match';
    return 'Poor match';
  };

  return (
    <div
      ref={tooltipRef}
      className="tech-recommendation-tooltip"
      style={{
        left: position.x,
        top: position.y
      }}
    >
      <div className="tooltip-header">
        <div className="tooltip-title">
          <i className="fas fa-lightbulb"></i>
          Best matches for {job.jobType}
        </div>
        <button className="tooltip-close" onClick={onClose}>
          <i className="fas fa-times"></i>
        </button>
      </div>

      <div className="tooltip-job-info">
        <div className="job-info-row">
          <i className="fas fa-user"></i>
          <span>{job.customerName}</span>
        </div>
        <div className="job-info-row">
          <i className="fas fa-map-marker-alt"></i>
          <span>{job.zone || 'No zone'}</span>
        </div>
        <div className="job-info-row">
          <i className="fas fa-clock"></i>
          <span>{job.duration}h • {job.timeframeStart}-{job.timeframeEnd}</span>
        </div>
      </div>

      <div className="tooltip-body">
        {loading ? (
          <div className="loading-state">
            <i className="fas fa-spinner fa-spin"></i>
            <span>Analyzing best matches...</span>
          </div>
        ) : recommendations.length === 0 ? (
          <div className="empty-state">
            <i className="fas fa-exclamation-circle"></i>
            <span>No available technicians</span>
          </div>
        ) : (
          <div className="recommendations-list">
            {recommendations.map((rec, index) => (
              <div
                key={rec.tech.id}
                className="recommendation-item"
                onClick={() => handleAssign(rec.tech)}
              >
                <div className="rec-rank">#{index + 1}</div>
                <div className="rec-content">
                  <div className="rec-header">
                    <div className="rec-name">{rec.tech.name}</div>
                    <div
                      className="rec-score"
                      style={{ backgroundColor: getScoreColor(rec.score) }}
                    >
                      {rec.score}%
                    </div>
                  </div>
                  <div className="rec-meta">
                    <span className="rec-role">{rec.tech.role || 'Technician'}</span>
                    {rec.driveTime && (
                      <span className="rec-drive">
                        <i className="fas fa-car"></i> {rec.driveTime} min
                      </span>
                    )}
                    {rec.currentHours !== undefined && (
                      <span className="rec-hours">
                        <i className="fas fa-clock"></i> {rec.currentHours.toFixed(1)}/8 hrs
                      </span>
                    )}
                  </div>
                  {rec.reasons && rec.reasons.length > 0 && (
                    <div className="rec-reasons">
                      {rec.reasons.slice(0, 2).map((reason, i) => (
                        <div key={i} className="rec-reason">
                          <i className="fas fa-check-circle"></i>
                          <span>{reason}</span>
                        </div>
                      ))}
                      {rec.reasons.length > 2 && (
                        <div className="rec-reason-more">
                          +{rec.reasons.length - 2} more reasons
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="tooltip-footer">
        <small>
          <i className="fas fa-info-circle"></i>
          Click a technician to assign instantly
        </small>
      </div>
    </div>
  );
};

export default TechRecommendationTooltip;
