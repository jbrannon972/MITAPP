import { useState, useEffect } from 'react';

const TwoTechAssignmentModal = ({
  isOpen,
  onClose,
  routeJobs,
  targetTech,
  availableDemoTechs,
  onAssignDTToRoute,
  onAssignPerJob,
  onComplete
}) => {
  const [step, setStep] = useState('initial'); // initial, per-job, select-dt, select-hours
  const [selectedDT, setSelectedDT] = useState(null);
  const [currentJobIndex, setCurrentJobIndex] = useState(0);
  const [jobAssignments, setJobAssignments] = useState({});
  const [customHours, setCustomHours] = useState('');
  const [isPerJobMode, setIsPerJobMode] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('initial');
      setSelectedDT(null);
      setCurrentJobIndex(0);
      setJobAssignments({});
      setCustomHours('');
      setIsPerJobMode(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const twoTechJobs = routeJobs.filter(j => j.requiresTwoTechs);
  // Current job is available in per-job mode for all sub-steps
  const currentJob = isPerJobMode && currentJobIndex < twoTechJobs.length ? twoTechJobs[currentJobIndex] : null;

  const handleRouteLevelDT = () => {
    setStep('select-dt');
  };

  const handlePerJobAssignment = () => {
    setStep('per-job');
    setCurrentJobIndex(0);
    setIsPerJobMode(true);
  };

  const handleNoDTNeeded = () => {
    // Mark all two-tech jobs as no longer needing DT
    const updates = {};
    twoTechJobs.forEach(job => {
      updates[job.id] = { type: 'no-dt' };
    });
    onComplete(updates);
    onClose();
  };

  const handleSelectDT = (dt) => {
    setSelectedDT(dt);

    if (step === 'select-dt') {
      // Route-level assignment
      const updates = {};
      twoTechJobs.forEach(job => {
        updates[job.id] = {
          type: 'demo-tech',
          demoTech: dt,
          wholeDuration: true
        };
      });
      onComplete(updates);
      onClose();
    } else if (step === 'per-job') {
      // Per-job assignment
      const updates = { ...jobAssignments };
      updates[currentJob.id] = {
        type: 'demo-tech',
        demoTech: dt,
        wholeDuration: true
      };
      setJobAssignments(updates);
      moveToNextJob();
    }
  };

  const handleAssignAnotherTech = () => {
    setStep('select-hours');
  };

  const handleConfirmHours = () => {
    const hours = customHours === 'whole' ? currentJob.duration : parseFloat(customHours);

    const updates = { ...jobAssignments };
    updates[currentJob.id] = {
      type: 'second-tech',
      hours: hours,
      isWholeDuration: customHours === 'whole'
    };
    setJobAssignments(updates);
    setCustomHours('');
    moveToNextJob();
  };

  const handleJobNoDT = () => {
    const updates = { ...jobAssignments };
    updates[currentJob.id] = { type: 'no-dt' };
    setJobAssignments(updates);
    moveToNextJob();
  };

  const moveToNextJob = () => {
    if (currentJobIndex < twoTechJobs.length - 1) {
      setCurrentJobIndex(currentJobIndex + 1);
      setStep('per-job');
    } else {
      // All jobs processed
      onComplete(jobAssignments);
      onClose();
    }
  };

  const handleBackToJobOptions = () => {
    setStep('per-job');
  };

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <i className="fas fa-users"></i> Two-Tech Job Assignment
          </h3>
          <button className="modal-close" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="modal-body">
          {step === 'initial' && (
            <>
              <p style={{ marginBottom: '20px' }}>
                This route has <strong>{twoTechJobs.length}</strong> job(s) requiring two technicians (DT flag).
              </p>

              <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: 'var(--surface-secondary)', borderRadius: '6px' }}>
                <h4 style={{ marginTop: 0 }}>Jobs Requiring Two Techs:</h4>
                {twoTechJobs.map((job, i) => (
                  <div key={job.id} style={{ marginBottom: '8px' }}>
                    {i + 1}. {job.customerName} ({job.duration}h) - {job.jobType}
                  </div>
                ))}
              </div>

              <p style={{ fontWeight: '600', marginBottom: '12px' }}>How would you like to handle these jobs?</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button
                  className="btn btn-primary"
                  onClick={handleRouteLevelDT}
                  style={{ width: '100%', justifyContent: 'flex-start' }}
                >
                  <i className="fas fa-user-plus"></i>
                  Assign One Demo Tech to Entire Route
                </button>

                <button
                  className="btn btn-secondary"
                  onClick={handlePerJobAssignment}
                  style={{ width: '100%', justifyContent: 'flex-start' }}
                >
                  <i className="fas fa-list"></i>
                  Assign Techs Per Job
                </button>

                <button
                  className="btn btn-danger"
                  onClick={handleNoDTNeeded}
                  style={{ width: '100%', justifyContent: 'flex-start' }}
                >
                  <i className="fas fa-times-circle"></i>
                  Demo Techs No Longer Needed (Remove Flag)
                </button>
              </div>
            </>
          )}

          {step === 'select-dt' && (
            <>
              <h4>Select Demo Tech {isPerJobMode && currentJob ? 'for Job' : 'for Route'}</h4>
              {isPerJobMode && currentJob ? (
                <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: 'var(--info-bg)', borderLeft: '4px solid var(--info-color)', borderRadius: '4px' }}>
                  <div style={{ fontWeight: '600' }}>{currentJob.customerName}</div>
                  <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                    {currentJob.jobType} • {currentJob.duration} hours
                  </div>
                </div>
              ) : (
                <p>This demo tech will be assigned to all {twoTechJobs.length} two-tech jobs on {targetTech.name}'s route.</p>
              )}

              {availableDemoTechs.length === 0 ? (
                <div className="alert alert-warning">
                  <i className="fas fa-exclamation-triangle"></i> No available demo techs found for {targetTech.office === 'office_1' ? 'Conroe' : 'Katy'} office.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
                  {availableDemoTechs.map(dt => (
                    <button
                      key={dt.id}
                      className="btn btn-secondary"
                      onClick={() => handleSelectDT(dt)}
                      style={{ width: '100%', justifyContent: 'flex-start' }}
                    >
                      <i className="fas fa-user"></i>
                      {dt.name}
                    </button>
                  ))}
                </div>
              )}

              <button
                className="btn btn-ghost"
                onClick={() => {
                  setStep('initial');
                  setIsPerJobMode(false);
                }}
                style={{ marginTop: '16px' }}
              >
                <i className="fas fa-arrow-left"></i> Back
              </button>
            </>
          )}

          {step === 'per-job' && currentJob && (
            <>
              <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: 'var(--info-bg)', borderLeft: '4px solid var(--info-color)', borderRadius: '4px' }}>
                <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                  Job {currentJobIndex + 1} of {twoTechJobs.length}
                </div>
                <div>{currentJob.customerName}</div>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  {currentJob.jobType} • {currentJob.duration} hours
                </div>
              </div>

              <p style={{ fontWeight: '600', marginBottom: '12px' }}>How do you want to handle this job?</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button
                  className="btn btn-primary"
                  onClick={() => setStep('select-dt')}
                  style={{ width: '100%', justifyContent: 'flex-start' }}
                >
                  <i className="fas fa-user-plus"></i>
                  Assign Demo Tech
                </button>

                <button
                  className="btn btn-secondary"
                  onClick={handleAssignAnotherTech}
                  style={{ width: '100%', justifyContent: 'flex-start' }}
                >
                  <i className="fas fa-user-clock"></i>
                  Will Assign Another Tech (Custom Hours)
                </button>

                <button
                  className="btn btn-danger"
                  onClick={handleJobNoDT}
                  style={{ width: '100%', justifyContent: 'flex-start' }}
                >
                  <i className="fas fa-times-circle"></i>
                  Demo Tech No Longer Needed
                </button>
              </div>
            </>
          )}

          {step === 'select-hours' && currentJob && (
            <>
              <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: 'var(--info-bg)', borderLeft: '4px solid var(--info-color)', borderRadius: '4px' }}>
                <div style={{ fontWeight: '600' }}>{currentJob.customerName}</div>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  Total Duration: {currentJob.duration} hours
                </div>
              </div>

              <p style={{ fontWeight: '600', marginBottom: '12px' }}>How long will the second tech be needed?</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                <button
                  className={`btn ${customHours === 'whole' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setCustomHours('whole')}
                  style={{ width: '100%', justifyContent: 'flex-start' }}
                >
                  <i className="fas fa-clock"></i>
                  Whole Duration ({currentJob.duration} hours)
                </button>

                <div className="form-group" style={{ margin: 0 }}>
                  <label>Custom Hours</label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="Enter hours (e.g., 2)"
                    value={customHours === 'whole' ? '' : customHours}
                    onChange={(e) => setCustomHours(e.target.value)}
                    min="0.5"
                    max={currentJob.duration}
                    step="0.5"
                  />
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    A second map marker will be created for {customHours || '?'} hours that you can assign to another tech
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn btn-ghost"
                  onClick={handleBackToJobOptions}
                >
                  <i className="fas fa-arrow-left"></i> Back
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleConfirmHours}
                  disabled={!customHours}
                >
                  <i className="fas fa-check"></i> Confirm
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TwoTechAssignmentModal;
