import React, { useState } from 'react';
import googleCalendarService from '../../services/googleCalendarService';

/**
 * StormModeCalendarPush - Batch push routes to Google Calendar for all Storm Mode staff
 *
 * @param {boolean} show - Whether to show the modal
 * @param {Object} routes - All route data
 * @param {Object} stormModeData - Storm Mode staff data
 * @param {Array} regularTechs - Regular technician array
 * @param {string} selectedDate - Current routing date
 * @param {Function} onClose - Callback when modal closes
 * @param {Function} onComplete - Callback when push completes
 */
const StormModeCalendarPush = ({
  show,
  routes,
  stormModeData,
  regularTechs,
  selectedDate,
  onClose,
  onComplete
}) => {
  const [selectedGroups, setSelectedGroups] = useState({
    regularTechs: true,
    projectManagers: true,
    ehqLeaders: true,
    ehqCSStaff: true,
    subContractors: false // Don't push to subs by default
  });

  const [pushing, setPushing] = useState(false);
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    currentStaff: '',
    completed: [],
    failed: []
  });

  if (!show) return null;

  // Count staff in each category
  const counts = {
    regularTechs: regularTechs?.length || 0,
    projectManagers: stormModeData?.projectManagers?.length || 0,
    ehqLeaders: stormModeData?.ehqLeaders?.length || 0,
    ehqCSStaff: stormModeData?.ehqCSStaff?.length || 0,
    subContractors: stormModeData?.subContractors?.length || 0
  };

  const totalSelected = Object.keys(selectedGroups).reduce((sum, key) => {
    return sum + (selectedGroups[key] ? counts[key] : 0);
  }, 0);

  const toggleGroup = (group) => {
    setSelectedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  const toggleAll = (group) => {
    const newValue = !selectedGroups[group];
    setSelectedGroups(prev => ({ ...prev, [group]: newValue }));
  };

  const handlePush = async () => {
    setPushing(true);
    const allStaff = [];

    // Collect all selected staff
    if (selectedGroups.regularTechs && regularTechs) {
      regularTechs.forEach(tech => {
        if (routes[tech.id]) {
          allStaff.push({ ...tech, route: routes[tech.id], type: 'tech' });
        }
      });
    }

    if (selectedGroups.projectManagers && stormModeData?.projectManagers) {
      stormModeData.projectManagers.forEach(pm => {
        if (routes[pm.id]) {
          allStaff.push({ ...pm, route: routes[pm.id], type: 'projectManager' });
        }
      });
    }

    if (selectedGroups.ehqLeaders && stormModeData?.ehqLeaders) {
      stormModeData.ehqLeaders.forEach(leader => {
        if (routes[leader.id]) {
          allStaff.push({ ...leader, route: routes[leader.id], type: 'ehqLeader' });
        }
      });
    }

    if (selectedGroups.ehqCSStaff && stormModeData?.ehqCSStaff) {
      stormModeData.ehqCSStaff.forEach(staff => {
        if (routes[staff.id]) {
          allStaff.push({ ...staff, route: routes[staff.id], type: 'ehqCSStaff' });
        }
      });
    }

    if (selectedGroups.subContractors && stormModeData?.subContractors) {
      stormModeData.subContractors.forEach(sub => {
        if (routes[sub.id]) {
          allStaff.push({ ...sub, route: routes[sub.id], type: 'subContractor' });
        }
      });
    }

    setProgress({
      current: 0,
      total: allStaff.length,
      currentStaff: '',
      completed: [],
      failed: []
    });

    // Push in batches of 10 with 2-second delay
    const BATCH_SIZE = 10;
    const DELAY_MS = 2000;

    for (let i = 0; i < allStaff.length; i += BATCH_SIZE) {
      const batch = allStaff.slice(i, i + BATCH_SIZE);

      // Process batch in parallel
      const batchPromises = batch.map(async (staff) => {
        setProgress(prev => ({
          ...prev,
          current: prev.current + 1,
          currentStaff: staff.name
        }));

        try {
          await googleCalendarService.pushRouteToCalendar(
            staff.route,
            selectedDate,
            staff
          );

          setProgress(prev => ({
            ...prev,
            completed: [...prev.completed, staff.name]
          }));
        } catch (error) {
          console.error(`Error pushing calendar for ${staff.name}:`, error);
          setProgress(prev => ({
            ...prev,
            failed: [...prev.failed, staff.name]
          }));
        }
      });

      await Promise.all(batchPromises);

      // Wait before next batch (except for last batch)
      if (i + BATCH_SIZE < allStaff.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }
    }

    setPushing(false);

    // Call completion handler
    if (onComplete) {
      onComplete({
        total: allStaff.length,
        completed: progress.completed.length,
        failed: progress.failed.length
      });
    }
  };

  return (
    <div className="modal-overlay active" onClick={!pushing ? onClose : undefined}>
      <div
        className="modal modal-lg"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '600px' }}
      >
        <div className="modal-header">
          <h3>
            <i className="fas fa-calendar-alt"></i>
            {' '}Push Routes to Calendars
          </h3>
          {!pushing && (
            <button className="modal-close" onClick={onClose}>
              <i className="fas fa-times"></i>
            </button>
          )}
        </div>

        <div className="modal-body">
          {!pushing ? (
            <>
              <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
                Select which staff groups to push routes to Google Calendar:
              </p>

              {/* Staff Group Selection */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px',
                  backgroundColor: 'var(--surface-secondary)',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input
                      type="checkbox"
                      checked={selectedGroups.regularTechs}
                      onChange={() => toggleGroup('regularTechs')}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <div>
                      <div style={{ fontWeight: '600' }}>Regular Techs</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        Standard technician staff
                      </div>
                    </div>
                  </div>
                  <div style={{ fontWeight: '600', color: 'var(--primary-color)' }}>
                    {counts.regularTechs}
                  </div>
                </label>

                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px',
                  backgroundColor: 'var(--surface-secondary)',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input
                      type="checkbox"
                      checked={selectedGroups.projectManagers}
                      onChange={() => toggleGroup('projectManagers')}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <div>
                      <div style={{ fontWeight: '600' }}>Project Managers</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        Storm Mode PM staff
                      </div>
                    </div>
                  </div>
                  <div style={{ fontWeight: '600', color: 'var(--primary-color)' }}>
                    {counts.projectManagers}
                  </div>
                </label>

                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px',
                  backgroundColor: 'var(--surface-secondary)',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input
                      type="checkbox"
                      checked={selectedGroups.ehqLeaders}
                      onChange={() => toggleGroup('ehqLeaders')}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <div>
                      <div style={{ fontWeight: '600' }}>EHQ Leaders</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        Emergency HQ leadership
                      </div>
                    </div>
                  </div>
                  <div style={{ fontWeight: '600', color: 'var(--primary-color)' }}>
                    {counts.ehqLeaders}
                  </div>
                </label>

                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px',
                  backgroundColor: 'var(--surface-secondary)',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input
                      type="checkbox"
                      checked={selectedGroups.ehqCSStaff}
                      onChange={() => toggleGroup('ehqCSStaff')}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <div>
                      <div style={{ fontWeight: '600' }}>EHQ CS Staff</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        Customer service field staff
                      </div>
                    </div>
                  </div>
                  <div style={{ fontWeight: '600', color: 'var(--primary-color)' }}>
                    {counts.ehqCSStaff}
                  </div>
                </label>

                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px',
                  backgroundColor: 'var(--surface-secondary)',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input
                      type="checkbox"
                      checked={selectedGroups.subContractors}
                      onChange={() => toggleGroup('subContractors')}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <div>
                      <div style={{ fontWeight: '600' }}>Sub Contractors</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        External contractor crews
                      </div>
                    </div>
                  </div>
                  <div style={{ fontWeight: '600', color: 'var(--primary-color)' }}>
                    {counts.subContractors}
                  </div>
                </label>
              </div>

              <div style={{
                marginTop: '20px',
                padding: '12px',
                backgroundColor: 'var(--info-bg)',
                borderRadius: '6px',
                fontSize: '14px'
              }}>
                <strong>Total: {totalSelected} calendars selected</strong>
                <div style={{ fontSize: '13px', marginTop: '4px', color: 'var(--text-secondary)' }}>
                  Calendars will be pushed in batches of 10 with 2-second delays to prevent API rate limiting.
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Progress Display */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontWeight: '600' }}>
                    Pushing calendars... ({progress.current}/{progress.total})
                  </span>
                  <span style={{ color: 'var(--primary-color)', fontWeight: '600' }}>
                    {Math.round((progress.current / progress.total) * 100)}%
                  </span>
                </div>

                <div style={{
                  width: '100%',
                  height: '8px',
                  backgroundColor: 'var(--surface-secondary)',
                  borderRadius: '4px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${(progress.current / progress.total) * 100}%`,
                    height: '100%',
                    backgroundColor: 'var(--primary-color)',
                    transition: 'width 0.3s ease'
                  }}></div>
                </div>

                {progress.currentStaff && (
                  <div style={{ marginTop: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                    Currently pushing: <strong>{progress.currentStaff}</strong>
                  </div>
                )}
              </div>

              {/* Results Summary */}
              {progress.current > 0 && (
                <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                  <div style={{
                    flex: 1,
                    padding: '12px',
                    backgroundColor: 'var(--success-bg)',
                    borderRadius: '6px',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '24px', fontWeight: '600', color: 'var(--success-color)' }}>
                      {progress.completed.length}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      Completed
                    </div>
                  </div>

                  <div style={{
                    flex: 1,
                    padding: '12px',
                    backgroundColor: 'var(--danger-bg)',
                    borderRadius: '6px',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '24px', fontWeight: '600', color: 'var(--danger-color)' }}>
                      {progress.failed.length}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      Failed
                    </div>
                  </div>
                </div>
              )}

              {/* Failed List */}
              {progress.failed.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <div style={{ fontWeight: '600', marginBottom: '8px', color: 'var(--danger-color)' }}>
                    Failed to push:
                  </div>
                  <div style={{
                    maxHeight: '150px',
                    overflow: 'auto',
                    padding: '8px',
                    backgroundColor: 'var(--surface-secondary)',
                    borderRadius: '4px'
                  }}>
                    {progress.failed.map((name, idx) => (
                      <div key={idx} style={{ fontSize: '13px', padding: '4px 0' }}>
                        • {name}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          {!pushing ? (
            <>
              <button className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handlePush}
                disabled={totalSelected === 0}
              >
                <i className="fas fa-calendar-check"></i> Push {totalSelected} Calendars
              </button>
            </>
          ) : (
            <button
              className="btn btn-primary"
              onClick={onClose}
              disabled={progress.current < progress.total}
            >
              {progress.current < progress.total ? 'Pushing...' : 'Done'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default StormModeCalendarPush;
