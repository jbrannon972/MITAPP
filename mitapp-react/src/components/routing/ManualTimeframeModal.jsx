import React, { useState } from 'react';

/**
 * Modal for manually entering timeframes when CSV parsing fails
 * Shows the original unparsable timeframe and allows user to specify start/end times
 */
const ManualTimeframeModal = ({ show, job, onSubmit, onSkip, onClose }) => {
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [error, setError] = useState('');

  if (!show || !job) return null;

  const handleSubmit = () => {
    // Validate times
    const timePattern = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

    if (!startTime || !endTime) {
      setError('Both start and end times are required');
      return;
    }

    if (!timePattern.test(startTime)) {
      setError('Start time must be in HH:MM format (e.g., 09:00)');
      return;
    }

    if (!timePattern.test(endTime)) {
      setError('End time must be in HH:MM format (e.g., 17:00)');
      return;
    }

    // Check if start is before end
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    if (startMinutes >= endMinutes) {
      setError('Start time must be before end time');
      return;
    }

    // Submit the corrected times
    onSubmit(startTime, endTime);

    // Reset form
    setStartTime('');
    setEndTime('');
    setError('');
  };

  const handleSkip = () => {
    onSkip();
    setStartTime('');
    setEndTime('');
    setError('');
  };

  const handleClose = () => {
    onClose();
    setStartTime('');
    setEndTime('');
    setError('');
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
      onClick={handleClose}
    >
      <div
        className="card"
        style={{
          maxWidth: '550px',
          width: '100%',
          padding: '24px',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)',
          animation: 'slideIn 0.2s ease-out'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <span style={{ fontSize: '32px', lineHeight: 1 }}>⏰</span>
          <h3 style={{ margin: 0, color: 'var(--warning-color)', flex: 1 }}>
            Unable to Parse Timeframe
          </h3>
        </div>

        {/* Job Info */}
        <div style={{
          backgroundColor: 'var(--card-bg-secondary)',
          padding: '12px',
          borderRadius: '6px',
          marginBottom: '16px',
          fontSize: '14px'
        }}>
          <div style={{ marginBottom: '8px' }}>
            <strong>Job ID:</strong> {job.id}
          </div>
          {job.address && (
            <div style={{ marginBottom: '8px' }}>
              <strong>Address:</strong> {job.address}
            </div>
          )}
          <div style={{
            backgroundColor: 'var(--danger-bg)',
            color: 'var(--danger-color)',
            padding: '8px',
            borderRadius: '4px',
            marginTop: '8px'
          }}>
            <strong>Original Timeframe:</strong> "{job.originalTimeframe}"
          </div>
        </div>

        {/* Instructions */}
        <div style={{
          fontSize: '14px',
          lineHeight: '1.6',
          color: 'var(--text-secondary)',
          marginBottom: '16px'
        }}>
          The timeframe format couldn't be automatically parsed. Please enter the correct start and end times in 24-hour format (HH:MM).
        </div>

        {/* Time Inputs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: 'bold',
              marginBottom: '6px',
              color: 'var(--text-primary)'
            }}>
              Start Time
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => {
                setStartTime(e.target.value);
                setError('');
              }}
              className="form-control"
              style={{ width: '100%' }}
              placeholder="09:00"
              autoFocus
            />
          </div>
          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: 'bold',
              marginBottom: '6px',
              color: 'var(--text-primary)'
            }}>
              End Time
            </label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => {
                setEndTime(e.target.value);
                setError('');
              }}
              className="form-control"
              style={{ width: '100%' }}
              placeholder="17:00"
            />
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div style={{
            backgroundColor: 'var(--danger-bg)',
            color: 'var(--danger-color)',
            padding: '10px',
            borderRadius: '6px',
            fontSize: '13px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Helper Text */}
        <div style={{
          fontSize: '12px',
          color: 'var(--text-secondary)',
          marginBottom: '20px',
          fontStyle: 'italic'
        }}>
          Examples: 08:00 (8 AM), 13:30 (1:30 PM), 17:00 (5 PM)
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={handleSkip}
            className="btn btn-secondary"
            style={{ minWidth: '100px' }}
          >
            Skip This Job
          </button>
          <button
            onClick={handleSubmit}
            className="btn btn-primary"
            style={{ minWidth: '100px' }}
          >
            Apply & Continue
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

export default ManualTimeframeModal;
