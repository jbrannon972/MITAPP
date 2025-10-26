import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import firebaseService from '../../services/firebaseService';
import SecondShiftReportForm from './SecondShiftReportForm';

const SupervisorReportForm = ({ onClose, onSubmitSuccess }) => {
  const { currentUser } = useAuth();

  // Determine if user is Second Shift Lead
  const isSecondShiftLead = currentUser?.role === 'Second Shift Lead' ||
                            currentUser?.username?.toLowerCase().includes('second shift');

  // Check if user has permission to submit supervisor report
  const canSubmitSupervisorReport = currentUser?.role === 'Manager' ||
                                     currentUser?.role === 'Supervisor' ||
                                     currentUser?.role === 'MIT Lead';

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    equipmentDeployed: true,
    equipmentDeployedReason: '',
    mitLeadFormsSubmitted: true,
    mitLeadFormsReason: '',
    dptNotesUpdated: true,
    dptNotesReason: '',
    talkedToTechs: true,
    talkedToTechsReason: '',
    winToday: '',
    supportNeeded: ''
  });

  const [submitting, setSubmitting] = useState(false);

  // If Second Shift Lead, show the existing SecondShiftReportForm
  if (isSecondShiftLead) {
    return <SecondShiftReportForm onClose={onClose} onSubmitSuccess={onSubmitSuccess} />;
  }

  // If not authorized for supervisor report, show error
  if (!canSubmitSupervisorReport) {
    return (
      <div className="modal-overlay active" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>
              <i className="fas fa-exclamation-triangle"></i> Access Denied
            </h3>
            <button className="modal-close" onClick={onClose}>
              <i className="fas fa-times"></i>
            </button>
          </div>
          <div className="modal-body">
            <p>Only Managers, Supervisors, and MIT Leads can submit supervisor reports.</p>
            <p>Your current role: <strong>{currentUser?.role || 'Unknown'}</strong></p>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleToggleChange = (field) => {
    setFormData(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    // Validation
    if (!formData.equipmentDeployed && !formData.equipmentDeployedReason.trim()) {
      alert('Please explain why equipment was not properly deployed.');
      return;
    }
    if (!formData.mitLeadFormsSubmitted && !formData.mitLeadFormsReason.trim()) {
      alert('Please explain why MIT Lead forms were not submitted.');
      return;
    }
    if (!formData.dptNotesUpdated && !formData.dptNotesReason.trim()) {
      alert('Please explain why DPT notes and WOs were not updated.');
      return;
    }
    if (!formData.talkedToTechs && !formData.talkedToTechsReason.trim()) {
      alert('Please explain why you did not talk to all techs.');
      return;
    }
    if (!formData.winToday.trim()) {
      alert('Please share at least one win from today.');
      return;
    }

    try {
      setSubmitting(true);

      const reportData = {
        date: formData.date,
        equipmentDeployed: formData.equipmentDeployed,
        equipmentDeployedReason: formData.equipmentDeployed ? null : formData.equipmentDeployedReason,
        mitLeadFormsSubmitted: formData.mitLeadFormsSubmitted,
        mitLeadFormsReason: formData.mitLeadFormsSubmitted ? null : formData.mitLeadFormsReason,
        dptNotesUpdated: formData.dptNotesUpdated,
        dptNotesReason: formData.dptNotesUpdated ? null : formData.dptNotesReason,
        talkedToTechs: formData.talkedToTechs,
        talkedToTechsReason: formData.talkedToTechs ? null : formData.talkedToTechsReason,
        winToday: formData.winToday.trim(),
        supportNeeded: formData.supportNeeded.trim() || null,
        submittedBy: currentUser?.username || currentUser?.email || 'Unknown',
        submittedByRole: currentUser?.role || 'Unknown',
        submittedAt: new Date().toISOString()
      };

      await firebaseService.saveSupervisorReport(formData.date, reportData);

      if (onSubmitSuccess) {
        onSubmitSuccess();
      }

      alert('Supervisor Report submitted successfully!');

      if (onClose) {
        onClose();
      }
    } catch (error) {
      console.error('Error submitting supervisor report:', error);
      alert('Error submitting report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <i className="fas fa-clipboard-check"></i> Supervisor Report - {new Date(formData.date).toLocaleDateString()}
          </h3>
          <button className="modal-close" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="modal-body">
          <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
            {/* Date Selection */}
            <div className="form-group">
              <label htmlFor="reportDate">Report Date</label>
              <input
                type="date"
                id="reportDate"
                className="form-input"
                value={formData.date}
                onChange={(e) => handleInputChange('date', e.target.value)}
                max={new Date().toISOString().split('T')[0]}
              />
            </div>

            {/* Equipment Deployed */}
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                <div className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={formData.equipmentDeployed}
                    onChange={() => handleToggleChange('equipmentDeployed')}
                  />
                  <span className="slider round"></span>
                </div>
                <span>Did I ensure all equipment is properly deployed at day 2 visits?</span>
              </label>
              {!formData.equipmentDeployed && (
                <textarea
                  className="form-input"
                  placeholder="Please explain why..."
                  value={formData.equipmentDeployedReason}
                  onChange={(e) => handleInputChange('equipmentDeployedReason', e.target.value)}
                  rows={3}
                  style={{ marginTop: '12px' }}
                />
              )}
            </div>

            {/* MIT Lead Forms */}
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                <div className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={formData.mitLeadFormsSubmitted}
                    onChange={() => handleToggleChange('mitLeadFormsSubmitted')}
                  />
                  <span className="slider round"></span>
                </div>
                <span>Did I submit all MIT Lead visit forms?</span>
              </label>
              {!formData.mitLeadFormsSubmitted && (
                <textarea
                  className="form-input"
                  placeholder="Please explain why..."
                  value={formData.mitLeadFormsReason}
                  onChange={(e) => handleInputChange('mitLeadFormsReason', e.target.value)}
                  rows={3}
                  style={{ marginTop: '12px' }}
                />
              )}
            </div>

            {/* DPT Notes Updated */}
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                <div className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={formData.dptNotesUpdated}
                    onChange={() => handleToggleChange('dptNotesUpdated')}
                  />
                  <span className="slider round"></span>
                </div>
                <span>Did I fully update all DPT notes and WOs?</span>
              </label>
              {!formData.dptNotesUpdated && (
                <textarea
                  className="form-input"
                  placeholder="Please explain why..."
                  value={formData.dptNotesReason}
                  onChange={(e) => handleInputChange('dptNotesReason', e.target.value)}
                  rows={3}
                  style={{ marginTop: '12px' }}
                />
              )}
            </div>

            {/* Talked to Techs */}
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                <div className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={formData.talkedToTechs}
                    onChange={() => handleToggleChange('talkedToTechs')}
                  />
                  <span className="slider round"></span>
                </div>
                <span>Did I talk to all my techs that are working near the end of the day?</span>
              </label>
              {!formData.talkedToTechs && (
                <textarea
                  className="form-input"
                  placeholder="Please explain why..."
                  value={formData.talkedToTechsReason}
                  onChange={(e) => handleInputChange('talkedToTechsReason', e.target.value)}
                  rows={3}
                  style={{ marginTop: '12px' }}
                />
              )}
            </div>

            {/* Win Today */}
            <div className="form-group">
              <label htmlFor="winToday">What was one win I had today? <span style={{ color: 'var(--danger-color)' }}>*</span></label>
              <textarea
                id="winToday"
                className="form-input"
                placeholder="Share your win..."
                value={formData.winToday}
                onChange={(e) => handleInputChange('winToday', e.target.value)}
                rows={3}
                required
              />
            </div>

            {/* Support Needed */}
            <div className="form-group">
              <label htmlFor="supportNeeded">What is something you could use support on?</label>
              <textarea
                id="supportNeeded"
                className="form-input"
                placeholder="Let us know how we can help..."
                value={formData.supportNeeded}
                onChange={(e) => handleInputChange('supportNeeded', e.target.value)}
                rows={3}
              />
            </div>
          </form>
        </div>

        <div className="modal-footer">
          <button
            className="btn btn-secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={submitting}
          >
            <i className="fas fa-paper-plane"></i> {submitting ? 'Submitting...' : 'Submit Report'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SupervisorReportForm;
