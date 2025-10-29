import { useState, useEffect } from 'react';

const InputsView = ({ monthlyData, wageSettings, currentYear, onSaveMonthlyData, onSaveWageSettings }) => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [formData, setFormData] = useState({});
  const [wageFormData, setWageFormData] = useState({});
  const [saving, setSaving] = useState(false);
  const [showWageSettings, setShowWageSettings] = useState(false);

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];

  useEffect(() => {
    if (monthlyData[selectedMonth]) {
      setFormData(monthlyData[selectedMonth]);
    }
  }, [selectedMonth, monthlyData]);

  useEffect(() => {
    if (wageSettings) {
      setWageFormData(wageSettings);
    }
  }, [wageSettings]);

  const handleMonthlyInputChange = (field, value) => {
    setFormData({
      ...formData,
      [field]: parseFloat(value) || 0
    });
  };

  const handleWageInputChange = (field, value) => {
    setWageFormData({
      ...wageFormData,
      [field]: parseFloat(value) || 0
    });
  };

  const handleSaveMonthlyData = async () => {
    setSaving(true);
    try {
      await onSaveMonthlyData(selectedMonth, formData);
      alert('Monthly data saved successfully!');
    } catch (error) {
      alert('Error saving monthly data: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWageSettings = async () => {
    setSaving(true);
    try {
      await onSaveWageSettings(wageFormData);
      alert('Wage settings saved successfully!');
    } catch (error) {
      alert('Error saving wage settings: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* Month Selector */}
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ margin: 0 }}>Monthly Data Input</h4>
        <select
          className="form-control"
          style={{ width: '200px' }}
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
        >
          {monthNames.map((name, idx) => (
            <option key={idx} value={idx}>{name}</option>
          ))}
        </select>
      </div>

      {/* Toggle Between Monthly and Wage Settings */}
      <div style={{ marginBottom: '20px', display: 'flex', gap: '8px' }}>
        <button
          className={`btn ${!showWageSettings ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setShowWageSettings(false)}
        >
          Monthly Inputs
        </button>
        <button
          className={`btn ${showWageSettings ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setShowWageSettings(true)}
        >
          Wage Settings
        </button>
      </div>

      {/* Monthly Inputs Form */}
      {!showWageSettings && (
        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-keyboard"></i> {monthNames[selectedMonth]} {currentYear} Inputs</h3>
          </div>
          <div className="card-body" style={{ padding: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
              {/* Column 1 - Sales Funnel */}
              <div>
                <h4 style={{ fontSize: '16px', marginBottom: '12px', color: 'var(--primary-color)' }}>
                  <i className="fas fa-funnel-dollar"></i> Sales Funnel
                </h4>

                <div className="form-group">
                  <label>Days in Month</label>
                  <input
                    type="number"
                    className="form-input"
                    value={formData.daysInMonth || ''}
                    onChange={(e) => handleMonthlyInputChange('daysInMonth', e.target.value)}
                    min="0"
                  />
                </div>

                <div className="form-group">
                  <label>Leads Target</label>
                  <input
                    type="number"
                    className="form-input"
                    value={formData.leadsTarget || ''}
                    onChange={(e) => handleMonthlyInputChange('leadsTarget', e.target.value)}
                    min="0"
                  />
                </div>

                <div className="form-group">
                  <label>Leads % Goal (0-1)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={formData.leadsPercentGoal || ''}
                    onChange={(e) => handleMonthlyInputChange('leadsPercentGoal', e.target.value)}
                    min="0"
                    max="1"
                    step="0.01"
                  />
                </div>

                <div className="form-group">
                  <label>Booking Rate (0-1)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={formData.bookingRate || ''}
                    onChange={(e) => handleMonthlyInputChange('bookingRate', e.target.value)}
                    min="0"
                    max="1"
                    step="0.01"
                  />
                </div>

                <div className="form-group">
                  <label>WTR Insurance Closing Rate (0-1)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={formData.wtrInsClosingRate || ''}
                    onChange={(e) => handleMonthlyInputChange('wtrInsClosingRate', e.target.value)}
                    min="0"
                    max="1"
                    step="0.01"
                  />
                </div>

                <div className="form-group">
                  <label>WTR Cash Closing Rate (0-1)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={formData.wtrCashClosingRate || ''}
                    onChange={(e) => handleMonthlyInputChange('wtrCashClosingRate', e.target.value)}
                    min="0"
                    max="1"
                    step="0.01"
                  />
                </div>
              </div>

              {/* Column 2 - Operations */}
              <div>
                <h4 style={{ fontSize: '16px', marginBottom: '12px', color: 'var(--primary-color)' }}>
                  <i className="fas fa-cogs"></i> Operations
                </h4>

                <div className="form-group">
                  <label>MIT Avg Days Onsite</label>
                  <input
                    type="number"
                    className="form-input"
                    value={formData.mitAvgDaysOnsite || ''}
                    onChange={(e) => handleMonthlyInputChange('mitAvgDaysOnsite', e.target.value)}
                    min="0"
                    step="0.1"
                  />
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Average number of days a job stays active
                  </p>
                </div>

                <div className="form-group">
                  <label>Hours Per Appointment</label>
                  <input
                    type="number"
                    className="form-input"
                    value={formData.hoursPerAppointment || ''}
                    onChange={(e) => handleMonthlyInputChange('hoursPerAppointment', e.target.value)}
                    min="0"
                    step="0.5"
                  />
                </div>

                <div className="form-group">
                  <label>OT Hours Per Tech Per Day</label>
                  <input
                    type="number"
                    className="form-input"
                    value={formData.otHoursPerTechPerDay || ''}
                    onChange={(e) => handleMonthlyInputChange('otHoursPerTechPerDay', e.target.value)}
                    min="0"
                    step="0.5"
                  />
                </div>

                <div className="form-group">
                  <label>Team Members Off Per Day</label>
                  <input
                    type="number"
                    className="form-input"
                    value={formData.teamMembersOffPerDay || ''}
                    onChange={(e) => handleMonthlyInputChange('teamMembersOffPerDay', e.target.value)}
                    min="0"
                  />
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Average techs off/unavailable per day
                  </p>
                </div>

                <div className="form-group">
                  <label>Average Drive Time (hours)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={formData.averageDriveTime || ''}
                    onChange={(e) => handleMonthlyInputChange('averageDriveTime', e.target.value)}
                    min="0"
                    step="0.1"
                  />
                </div>
              </div>
            </div>

            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <button
                className="btn btn-primary"
                onClick={handleSaveMonthlyData}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Monthly Data'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wage Settings Form */}
      {showWageSettings && (
        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-dollar-sign"></i> Wage Settings</h3>
          </div>
          <div className="card-body" style={{ padding: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
              {/* Column 1 - Hourly Wages */}
              <div>
                <h4 style={{ fontSize: '16px', marginBottom: '12px', color: 'var(--primary-color)' }}>
                  <i className="fas fa-clock"></i> Hourly Wages
                </h4>

                <div className="form-group">
                  <label>Average Hourly Base Wage</label>
                  <input
                    type="number"
                    className="form-input"
                    value={wageFormData.avgHourlyBaseWage || ''}
                    onChange={(e) => handleWageInputChange('avgHourlyBaseWage', e.target.value)}
                    min="0"
                    step="0.01"
                  />
                </div>

                <div className="form-group">
                  <label>Average OT Wage</label>
                  <input
                    type="number"
                    className="form-input"
                    value={wageFormData.avgOTWage || ''}
                    onChange={(e) => handleWageInputChange('avgOTWage', e.target.value)}
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>

              {/* Column 2 - Salaries */}
              <div>
                <h4 style={{ fontSize: '16px', marginBottom: '12px', color: 'var(--primary-color)' }}>
                  <i className="fas fa-user-tie"></i> Annual Salaries
                </h4>

                <div className="form-group">
                  <label>Field Supervisor Wage</label>
                  <input
                    type="number"
                    className="form-input"
                    value={wageFormData.fieldSupervisorWage || ''}
                    onChange={(e) => handleWageInputChange('fieldSupervisorWage', e.target.value)}
                    min="0"
                  />
                </div>

                <div className="form-group">
                  <label>Field Supervisor Bonus (Monthly)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={wageFormData.fieldSupervisorBonus || ''}
                    onChange={(e) => handleWageInputChange('fieldSupervisorBonus', e.target.value)}
                    min="0"
                  />
                </div>

                <div className="form-group">
                  <label>Foreman Wage</label>
                  <input
                    type="number"
                    className="form-input"
                    value={wageFormData.foremanWage || ''}
                    onChange={(e) => handleWageInputChange('foremanWage', e.target.value)}
                    min="0"
                  />
                </div>

                <div className="form-group">
                  <label>Assistant MIT Manager Wage</label>
                  <input
                    type="number"
                    className="form-input"
                    value={wageFormData.assistantMitManagerWage || ''}
                    onChange={(e) => handleWageInputChange('assistantMitManagerWage', e.target.value)}
                    min="0"
                  />
                </div>

                <div className="form-group">
                  <label>MIT Manager Wage</label>
                  <input
                    type="number"
                    className="form-input"
                    value={wageFormData.mitManagerWage || ''}
                    onChange={(e) => handleWageInputChange('mitManagerWage', e.target.value)}
                    min="0"
                  />
                </div>
              </div>
            </div>

            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <button
                className="btn btn-primary"
                onClick={handleSaveWageSettings}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Wage Settings'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InputsView;
