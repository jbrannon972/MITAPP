import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import firebaseService from '../../services/firebaseService';

const SecondShiftReportForm = ({ onClose, onSubmitSuccess }) => {
  const { currentUser } = useAuth();
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    installWindowsLeft: false,
    windows: { '2-5': 0, '5-8': 0, '6-9': 0 },
    demoRequested: false,
    demoJobs: [],
    jobsPushed: false,
    pushedJobsCount: 0,
    nuances: [],
    cancelledJobs: [],
    afterHoursJobs: [],
    techShoutouts: '',
    techConcerns: '',
    deptShoutouts: '',
    deptConcerns: ''
  });

  const [submitting, setSubmitting] = useState(false);

  const handleRadioChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value === 'yes' }));
  };

  const handleWindowChange = (slot, value) => {
    setFormData(prev => ({
      ...prev,
      windows: { ...prev.windows, [slot]: parseInt(value) || 0 }
    }));
  };

  const addJobEntry = (type) => {
    const newEntry = { jobName: '', notes: '', reason: '', who: '', damageReported: false };
    setFormData(prev => ({
      ...prev,
      [type]: [...prev[type], newEntry]
    }));
  };

  const updateJobEntry = (type, index, field, value) => {
    setFormData(prev => ({
      ...prev,
      [type]: prev[type].map((entry, i) =>
        i === index ? { ...entry, [field]: value } : entry
      )
    }));
  };

  const removeJobEntry = (type, index) => {
    setFormData(prev => ({
      ...prev,
      [type]: prev[type].filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);

      const reportData = {
        date: formData.date,
        installWindowsLeft: formData.installWindowsLeft,
        installWindows: formData.installWindowsLeft ? formData.windows : null,
        demoRequested: formData.demoRequested,
        demoJobs: formData.demoRequested ? formData.demoJobs.filter(j => j.jobName.trim()) : [],
        jobsPushed: formData.jobsPushed,
        pushedJobsCount: formData.jobsPushed ? formData.pushedJobsCount : 0,
        nuances: formData.nuances.filter(j => j.jobName.trim()),
        cancelledJobs: formData.cancelledJobs.filter(j => j.jobName.trim()),
        afterHoursJobs: formData.afterHoursJobs.filter(j => j.jobName.trim()),
        afterHours: formData.afterHoursJobs.filter(j => j.jobName.trim()).length > 0,
        techShoutouts: formData.techShoutouts.trim(),
        techConcerns: formData.techConcerns.trim(),
        deptShoutouts: formData.deptShoutouts.trim(),
        deptConcerns: formData.deptConcerns.trim(),
        submittedBy: currentUser?.username || currentUser?.email || 'Unknown',
        submittedAt: new Date().toISOString()
      };

      await firebaseService.saveSecondShiftReport(formData.date, reportData);

      if (onSubmitSuccess) {
        onSubmitSuccess();
      }

      alert('Second Shift Report submitted successfully!');

      if (onClose) {
        onClose();
      }
    } catch (error) {
      console.error('Error submitting second shift report:', error);
      alert('Error submitting report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3><i className="fas fa-moon"></i> Second Shift Report</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          <div className="form-group">
            <label htmlFor="reportDate">Report Date</label>
            <input
              type="date"
              id="reportDate"
              className="form-input"
              value={formData.date}
              onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
            />
          </div>

          {/* Install Windows Left */}
          <div className="question-section" style={{ marginTop: '24px', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
            <div className="form-group">
              <label>Any Install windows left?</label>
              <div className="radio-group" style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="installWindowsLeft"
                    value="yes"
                    checked={formData.installWindowsLeft}
                    onChange={(e) => handleRadioChange('installWindowsLeft', 'yes')}
                    style={{ marginRight: '8px' }}
                  />
                  Yes
                </label>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="installWindowsLeft"
                    value="no"
                    checked={!formData.installWindowsLeft}
                    onChange={(e) => handleRadioChange('installWindowsLeft', 'no')}
                    style={{ marginRight: '8px' }}
                  />
                  No
                </label>
              </div>
            </div>
            {formData.installWindowsLeft && (
              <div style={{ marginTop: '16px', padding: '16px', backgroundColor: 'white', borderRadius: '8px' }}>
                <p style={{ marginBottom: '12px' }}>Enter the number of windows available for each time slot:</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                  <div className="form-group">
                    <label htmlFor="windows2to5">2-5 PM</label>
                    <input
                      type="number"
                      id="windows2to5"
                      className="form-input"
                      min="0"
                      value={formData.windows['2-5']}
                      onChange={(e) => handleWindowChange('2-5', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="windows5to8">5-8 PM</label>
                    <input
                      type="number"
                      id="windows5to8"
                      className="form-input"
                      min="0"
                      value={formData.windows['5-8']}
                      onChange={(e) => handleWindowChange('5-8', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="windows6to9">6-9 PM</label>
                    <input
                      type="number"
                      id="windows6to9"
                      className="form-input"
                      min="0"
                      value={formData.windows['6-9']}
                      onChange={(e) => handleWindowChange('6-9', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Demo Requested */}
          <div className="question-section" style={{ marginTop: '16px', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
            <div className="form-group">
              <label>Was demo requested on any installs?</label>
              <div className="radio-group" style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="demoRequested"
                    value="yes"
                    checked={formData.demoRequested}
                    onChange={(e) => handleRadioChange('demoRequested', 'yes')}
                    style={{ marginRight: '8px' }}
                  />
                  Yes
                </label>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="demoRequested"
                    value="no"
                    checked={!formData.demoRequested}
                    onChange={(e) => handleRadioChange('demoRequested', 'no')}
                    style={{ marginRight: '8px' }}
                  />
                  No
                </label>
              </div>
            </div>
            {formData.demoRequested && (
              <div style={{ marginTop: '16px', padding: '16px', backgroundColor: 'white', borderRadius: '8px' }}>
                {formData.demoJobs.map((job, idx) => (
                  <div key={idx} style={{ marginBottom: '12px', padding: '12px', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: '8px', marginBottom: '8px' }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Job Name"
                        value={job.jobName}
                        onChange={(e) => updateJobEntry('demoJobs', idx, 'jobName', e.target.value)}
                      />
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Notes"
                        value={job.notes}
                        onChange={(e) => updateJobEntry('demoJobs', idx, 'notes', e.target.value)}
                      />
                      <button className="btn btn-danger btn-small" onClick={() => removeJobEntry('demoJobs', idx)}>
                        <i className="fas fa-times"></i>
                      </button>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={job.damageReported}
                        onChange={(e) => updateJobEntry('demoJobs', idx, 'damageReported', e.target.checked)}
                        style={{ marginRight: '8px' }}
                      />
                      Damage Reported
                    </label>
                  </div>
                ))}
                <button className="btn btn-secondary btn-small" onClick={() => addJobEntry('demoJobs')}>
                  <i className="fas fa-plus"></i> Add Demo Job
                </button>
              </div>
            )}
          </div>

          {/* Jobs Pushed */}
          <div className="question-section" style={{ marginTop: '16px', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
            <div className="form-group">
              <label>Were any jobs pushed to the next day?</label>
              <div className="radio-group" style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="jobsPushed"
                    value="yes"
                    checked={formData.jobsPushed}
                    onChange={(e) => handleRadioChange('jobsPushed', 'yes')}
                    style={{ marginRight: '8px' }}
                  />
                  Yes
                </label>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="jobsPushed"
                    value="no"
                    checked={!formData.jobsPushed}
                    onChange={(e) => handleRadioChange('jobsPushed', 'no')}
                    style={{ marginRight: '8px' }}
                  />
                  No
                </label>
              </div>
            </div>
            {formData.jobsPushed && (
              <div className="form-group" style={{ marginTop: '16px' }}>
                <label htmlFor="pushedJobsCount">How many jobs were pushed?</label>
                <input
                  type="number"
                  id="pushedJobsCount"
                  className="form-input"
                  min="0"
                  value={formData.pushedJobsCount}
                  onChange={(e) => setFormData(prev => ({ ...prev, pushedJobsCount: parseInt(e.target.value) || 0 }))}
                />
              </div>
            )}
          </div>

          {/* Jobs to Know About (Nuances) */}
          <div className="question-section" style={{ marginTop: '16px', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
            <h4>Jobs to Know About</h4>
            {formData.nuances.map((job, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: '8px', marginTop: '8px' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Job Name"
                  value={job.jobName}
                  onChange={(e) => updateJobEntry('nuances', idx, 'jobName', e.target.value)}
                />
                <input
                  type="text"
                  className="form-input"
                  placeholder="Notes"
                  value={job.notes}
                  onChange={(e) => updateJobEntry('nuances', idx, 'notes', e.target.value)}
                />
                <button className="btn btn-danger btn-small" onClick={() => removeJobEntry('nuances', idx)}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
            ))}
            <button className="btn btn-secondary btn-small" style={{ marginTop: '8px' }} onClick={() => addJobEntry('nuances')}>
              <i className="fas fa-plus"></i> Add Job
            </button>
          </div>

          {/* Cancelled/Rescheduled Jobs */}
          <div className="question-section" style={{ marginTop: '16px', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
            <h4>Cancelled/Rescheduled Jobs</h4>
            {formData.cancelledJobs.map((job, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: '8px', marginTop: '8px' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Job Name"
                  value={job.jobName}
                  onChange={(e) => updateJobEntry('cancelledJobs', idx, 'jobName', e.target.value)}
                />
                <input
                  type="text"
                  className="form-input"
                  placeholder="Notes"
                  value={job.notes}
                  onChange={(e) => updateJobEntry('cancelledJobs', idx, 'notes', e.target.value)}
                />
                <button className="btn btn-danger btn-small" onClick={() => removeJobEntry('cancelledJobs', idx)}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
            ))}
            <button className="btn btn-secondary btn-small" style={{ marginTop: '8px' }} onClick={() => addJobEntry('cancelledJobs')}>
              <i className="fas fa-plus"></i> Add Job
            </button>
          </div>

          {/* After Hours Jobs */}
          <div className="question-section" style={{ marginTop: '16px', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
            <h4>After Hours Jobs</h4>
            {formData.afterHoursJobs.map((job, idx) => (
              <div key={idx} style={{ marginTop: '8px', padding: '12px', backgroundColor: 'white', borderRadius: '6px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Job Name"
                    value={job.jobName}
                    onChange={(e) => updateJobEntry('afterHoursJobs', idx, 'jobName', e.target.value)}
                  />
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Who worked?"
                    value={job.who}
                    onChange={(e) => updateJobEntry('afterHoursJobs', idx, 'who', e.target.value)}
                  />
                  <button className="btn btn-danger btn-small" onClick={() => removeJobEntry('afterHoursJobs', idx)}>
                    <i className="fas fa-times"></i>
                  </button>
                </div>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Reason for after hours"
                  value={job.reason}
                  onChange={(e) => updateJobEntry('afterHoursJobs', idx, 'reason', e.target.value)}
                />
              </div>
            ))}
            <button className="btn btn-secondary btn-small" style={{ marginTop: '8px' }} onClick={() => addJobEntry('afterHoursJobs')}>
              <i className="fas fa-plus"></i> Add After Hours Job
            </button>
          </div>

          {/* Shoutouts and Concerns */}
          <div className="question-section" style={{ marginTop: '16px', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
            <div className="form-group">
              <label htmlFor="techShoutouts">Tech Shoutouts</label>
              <textarea
                id="techShoutouts"
                className="form-input"
                rows="3"
                placeholder="Recognition for technicians..."
                value={formData.techShoutouts}
                onChange={(e) => setFormData(prev => ({ ...prev, techShoutouts: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label htmlFor="techConcerns">Tech Concerns</label>
              <textarea
                id="techConcerns"
                className="form-input"
                rows="3"
                placeholder="Any concerns about technicians..."
                value={formData.techConcerns}
                onChange={(e) => setFormData(prev => ({ ...prev, techConcerns: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label htmlFor="deptShoutouts">Department Shoutouts</label>
              <textarea
                id="deptShoutouts"
                className="form-input"
                rows="3"
                placeholder="Recognition for other departments..."
                value={formData.deptShoutouts}
                onChange={(e) => setFormData(prev => ({ ...prev, deptShoutouts: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label htmlFor="deptConcerns">Department Concerns</label>
              <textarea
                id="deptConcerns"
                className="form-input"
                rows="3"
                placeholder="Any concerns about other departments..."
                value={formData.deptConcerns}
                onChange={(e) => setFormData(prev => ({ ...prev, deptConcerns: e.target.value }))}
              />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit Report'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SecondShiftReportForm;
