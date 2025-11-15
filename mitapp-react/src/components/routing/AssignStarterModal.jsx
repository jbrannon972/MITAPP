import React, { useState, useEffect } from 'react';
import firebaseService from '../../services/firebaseService';

/**
 * AssignStarterModal - Assign a PM or EHQ Leader to start/supervise a sub contractor
 *
 * @param {boolean} show - Whether to show the modal
 * @param {Object} subContractor - Sub contractor being assigned
 * @param {Object} job - Job being assigned to sub
 * @param {string} selectedDate - Current routing date
 * @param {Function} onConfirm - Callback when starter is assigned
 * @param {Function} onCancel - Callback when modal is cancelled
 */
const AssignStarterModal = ({
  show,
  subContractor,
  job,
  selectedDate,
  onConfirm,
  onCancel
}) => {
  const [availableStarters, setAvailableStarters] = useState([]);
  const [selectedStarter, setSelectedStarter] = useState(null);
  const [starterBehavior, setStarterBehavior] = useState('start'); // 'start' or 'supervise'
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (show && selectedDate) {
      loadAvailableStarters();
    }
  }, [show, selectedDate]);

  const loadAvailableStarters = async () => {
    setLoading(true);
    try {
      const starters = await firebaseService.getAvailableStarters(selectedDate);
      setAvailableStarters(starters);

      // Auto-select first available starter
      if (starters.length > 0) {
        setSelectedStarter(starters[0]);
      }
    } catch (error) {
      console.error('Error loading available starters:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!selectedStarter) {
      alert('Please select a starter');
      return;
    }

    try {
      // Assign starter to sub contractor
      await firebaseService.assignStarter(
        selectedDate,
        subContractor.id,
        selectedStarter.id,
        selectedStarter.type
      );

      // Call parent confirm handler
      if (onConfirm) {
        onConfirm({
          starter: selectedStarter,
          behavior: starterBehavior,
          subContractor: subContractor,
          job: job
        });
      }
    } catch (error) {
      console.error('Error assigning starter:', error);
      alert('Error assigning starter. Please try again.');
    }
  };

  if (!show) return null;

  return (
    <div className="modal-overlay active" onClick={onCancel}>
      <div
        className="modal modal-lg"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '600px' }}
      >
        <div className="modal-header">
          <h3>
            <i className="fas fa-people-group" style={{ color: 'var(--warning-color)' }}></i>
            {' '}Assign Starter for Sub Contractor
          </h3>
          <button className="modal-close" onClick={onCancel}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="modal-body">
          {/* Sub Contractor Info */}
          <div style={{
            padding: '16px',
            backgroundColor: 'var(--surface-secondary)',
            borderRadius: '6px',
            marginBottom: '20px'
          }}>
            <div style={{ fontWeight: '600', marginBottom: '8px', fontSize: '15px' }}>
              Sub Contractor: {subContractor?.name} ({subContractor?.quantity} workers)
            </div>
            {job && (
              <>
                <div style={{ fontSize: '14px', marginBottom: '4px' }}>
                  <strong>Job:</strong> {job.jobType} - {job.address}
                </div>
                <div style={{ fontSize: '14px' }}>
                  <strong>Time:</strong> {job.timeframeStart} - {job.timeframeEnd}
                </div>
              </>
            )}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              Loading available starters...
            </div>
          ) : availableStarters.length === 0 ? (
            <div style={{
              padding: '20px',
              textAlign: 'center',
              backgroundColor: 'var(--warning-bg)',
              borderRadius: '6px',
              color: 'var(--text-primary)'
            }}>
              <i className="fas fa-exclamation-triangle" style={{ fontSize: '24px', marginBottom: '8px', color: 'var(--warning-color)' }}></i>
              <div style={{ fontWeight: '600' }}>No available starters</div>
              <div style={{ fontSize: '14px', marginTop: '4px' }}>
                All Project Managers and EHQ Leaders are already assigned to sub contractors.
              </div>
            </div>
          ) : (
            <>
              {/* Starter Selection */}
              <div className="form-group">
                <label style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>
                  Select who will start this crew:
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {availableStarters.map((starter) => (
                    <label
                      key={starter.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '12px',
                        backgroundColor: selectedStarter?.id === starter.id ? 'var(--active-bg)' : 'var(--surface-secondary)',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        border: selectedStarter?.id === starter.id ? '2px solid var(--primary-color)' : '2px solid transparent',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (selectedStarter?.id !== starter.id) {
                          e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedStarter?.id !== starter.id) {
                          e.currentTarget.style.backgroundColor = 'var(--surface-secondary)';
                        }
                      }}
                    >
                      <input
                        type="radio"
                        name="starter"
                        checked={selectedStarter?.id === starter.id}
                        onChange={() => setSelectedStarter(starter)}
                        style={{ marginRight: '10px', width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '600' }}>{starter.name}</div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                          {starter.label}
                          {starter.assignedToSub && ' - Already supervising another crew'}
                        </div>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {starter.startingLocation === 'office_1' ? 'Conroe' : 'Katy'}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Starter Behavior */}
              <div className="form-group" style={{ marginTop: '20px' }}>
                <label style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>
                  Starter Behavior:
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    padding: '12px',
                    backgroundColor: starterBehavior === 'start' ? 'var(--active-bg)' : 'var(--surface-secondary)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    border: starterBehavior === 'start' ? '2px solid var(--primary-color)' : '2px solid transparent'
                  }}>
                    <input
                      type="radio"
                      name="behavior"
                      value="start"
                      checked={starterBehavior === 'start'}
                      onChange={(e) => setStarterBehavior(e.target.value)}
                      style={{ marginRight: '10px', marginTop: '3px', width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <div>
                      <div style={{ fontWeight: '600' }}>Start Only (30 minutes)</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Starter meets the crew, gets them started, then leaves to handle other tasks
                      </div>
                    </div>
                  </label>

                  <label style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    padding: '12px',
                    backgroundColor: starterBehavior === 'supervise' ? 'var(--active-bg)' : 'var(--surface-secondary)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    border: starterBehavior === 'supervise' ? '2px solid var(--primary-color)' : '2px solid transparent'
                  }}>
                    <input
                      type="radio"
                      name="behavior"
                      value="supervise"
                      checked={starterBehavior === 'supervise'}
                      onChange={(e) => setStarterBehavior(e.target.value)}
                      style={{ marginRight: '10px', marginTop: '3px', width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <div>
                      <div style={{ fontWeight: '600' }}>Supervise All Day</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Starter stays with the crew for the entire job to provide supervision and support
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>
            <i className="fas fa-times"></i> Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={!selectedStarter || availableStarters.length === 0}
          >
            <i className="fas fa-check"></i> Assign Starter
          </button>
        </div>
      </div>
    </div>
  );
};

export default AssignStarterModal;
