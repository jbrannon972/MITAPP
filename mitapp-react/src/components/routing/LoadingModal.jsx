/**
 * Loading Modal Component
 * Shows a loading screen with progress percentage for long-running operations
 */
import { useEffect, useState } from 'react';
import '../../styles/LoadingModal.css';

const LoadingModal = ({
  isOpen,
  title = 'Processing...',
  message = 'Please wait while we complete this operation',
  progress = 0, // 0-100
  currentStep = '',
  totalSteps = 0,
  currentStepNumber = 0,
  showSteps = false,
  canCancel = false,
  onCancel = null
}) => {
  const [dots, setDots] = useState('');

  // Animated dots effect
  useEffect(() => {
    if (!isOpen) return;

    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 500);

    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="loading-modal-overlay">
      <div className="loading-modal">
        <div className="loading-spinner-container">
          <div className="loading-spinner"></div>
          <div className="loading-pulse"></div>
        </div>

        <h3 className="loading-title">{title}</h3>

        <p className="loading-message">{message}{dots}</p>

        {showSteps && totalSteps > 0 && (
          <div className="loading-steps">
            <span className="loading-step-counter">
              Step {currentStepNumber} of {totalSteps}
            </span>
            {currentStep && (
              <span className="loading-step-text">{currentStep}</span>
            )}
          </div>
        )}

        <div className="loading-progress-container">
          <div className="loading-progress-bar">
            <div
              className="loading-progress-fill"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            >
              <span className="loading-progress-shimmer"></span>
            </div>
          </div>
          <span className="loading-progress-text">
            {Math.round(progress)}%
          </span>
        </div>

        {canCancel && onCancel && (
          <button
            className="loading-cancel-button"
            onClick={onCancel}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
};

export default LoadingModal;
