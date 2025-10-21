import { useState, useEffect } from 'react';
import Layout from '../components/common/Layout';
import { useData } from '../contexts/DataContext';
import { calculateMonth, formatCurrency, formatNumber } from '../utils/calculations';

const LaborForecasting = () => {
  const { monthlyData, staffingData, wageSettings, currentYear, saveMonthlyData, loading } = useData();
  const [activeView, setActiveView] = useState('inputs');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [localMonthData, setLocalMonthData] = useState(null);

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  useEffect(() => {
    if (monthlyData && monthlyData[selectedMonth]) {
      // Calculate the month data
      const calculated = calculateMonth(monthlyData[selectedMonth], staffingData, wageSettings, currentYear);
      setLocalMonthData(calculated);
    }
  }, [selectedMonth, monthlyData, staffingData, wageSettings, currentYear]);

  const handleInputChange = (field, value) => {
    if (!localMonthData) return;

    const updatedData = {
      ...localMonthData,
      [field]: parseFloat(value) || 0
    };

    // Recalculate with new data
    const calculated = calculateMonth(updatedData, staffingData, wageSettings, currentYear);
    setLocalMonthData(calculated);
  };

  const handleSave = async () => {
    if (!localMonthData) return;

    try {
      await saveMonthlyData(selectedMonth, localMonthData);
      alert('Monthly data saved successfully!');
    } catch (error) {
      console.error('Error saving monthly data:', error);
      alert('Error saving data. Please try again.');
    }
  };

  const renderInputsView = () => {
    if (!localMonthData) return <p>Loading...</p>;

    const inputFields = [
      { label: 'Leads Target', field: 'leadsTarget', type: 'number' },
      { label: 'Leads % Goal', field: 'leadsPercentGoal', type: 'number', step: '0.01' },
      { label: 'Booking Rate', field: 'bookingRate', type: 'number', step: '0.01' },
      { label: 'WTR Ins Closing Rate', field: 'wtrInsClosingRate', type: 'number', step: '0.01' },
      { label: 'WTR Cash Closing Rate', field: 'wtrCashClosingRate', type: 'number', step: '0.01' },
      { label: 'MIT Avg Days Onsite', field: 'mitAvgDaysOnsite', type: 'number' },
      { label: 'Hours Per Appointment', field: 'hoursPerAppointment', type: 'number' },
      { label: 'Average Drive Time (hrs)', field: 'averageDriveTime', type: 'number', step: '0.5' },
      { label: 'OT Hours Per Tech Per Day', field: 'otHoursPerTechPerDay', type: 'number', step: '0.5' },
      { label: 'Team Members Off Per Day', field: 'teamMembersOffPerDay', type: 'number' },
      { label: 'Days in Month', field: 'daysInMonth', type: 'number' }
    ];

    return (
      <div className="inputs-view">
        <div className="input-grid">
          {inputFields.map(({ label, field, type, step }) => (
            <div key={field} className="form-group">
              <label htmlFor={field}>{label}</label>
              <input
                type={type}
                id={field}
                className="form-input"
                value={localMonthData[field] || ''}
                onChange={(e) => handleInputChange(field, e.target.value)}
                step={step}
              />
            </div>
          ))}
        </div>

        <div className="calculated-results">
          <h3>Calculated Results</h3>
          <div className="results-grid">
            <div className="result-item">
              <span className="result-label">Current Staffing Level:</span>
              <span className="result-value">{localMonthData.currentStaffingLevel}</span>
            </div>
            <div className="result-item">
              <span className="result-label">Actual Leads:</span>
              <span className="result-value">{localMonthData.actualLeads}</span>
            </div>
            <div className="result-item">
              <span className="result-label">Sales Ops:</span>
              <span className="result-value">{localMonthData.salesOps}</span>
            </div>
            <div className="result-item">
              <span className="result-label">Projected WTR Jobs:</span>
              <span className="result-value">{localMonthData.projectedWTRJobs}</span>
            </div>
            <div className="result-item">
              <span className="result-label">Active Jobs Per Day:</span>
              <span className="result-value">{localMonthData.activeJobsPerDay?.toFixed(2)}</span>
            </div>
            <div className="result-item">
              <span className="result-label">Hours Needed Per Day:</span>
              <span className="result-value">{localMonthData.hoursNeededPerDay?.toFixed(2)}</span>
            </div>
            <div className="result-item">
              <span className="result-label">Techs/Foremen Needed:</span>
              <span className="result-value">{localMonthData.techsForemenNeeded}</span>
            </div>
            <div className="result-item">
              <span className="result-label">Staffing Need:</span>
              <span className="result-value">{localMonthData.staffingNeed}</span>
            </div>
            <div className="result-item">
              <span className="result-label">Staffing Delta:</span>
              <span className={`result-value ${localMonthData.staffingDelta >= 0 ? 'positive' : 'negative'}`}>
                {localMonthData.staffingDelta >= 0 ? '+' : ''}{localMonthData.staffingDelta}
              </span>
            </div>
            <div className="result-item">
              <span className="result-label">MIT Tech Labor Cost:</span>
              <span className="result-value">{formatCurrency(localMonthData.mitTechLaborCost)}</span>
            </div>
            <div className="result-item">
              <span className="result-label">Fixed Labor Cost:</span>
              <span className="result-value">{formatCurrency(localMonthData.fixedLaborCost)}</span>
            </div>
            <div className="result-item">
              <span className="result-label">Total Labor Spend:</span>
              <span className="result-value">{formatCurrency(localMonthData.totalLaborSpend)}</span>
            </div>
            <div className="result-item">
              <span className="result-label">Cost Per WTR Job:</span>
              <span className="result-value">{formatCurrency(localMonthData.costPerWTRJob)}</span>
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button className="btn btn-primary" onClick={handleSave}>
            <i className="fas fa-save"></i> Save Monthly Data
          </button>
        </div>
      </div>
    );
  };

  const renderAnnualView = () => {
    return (
      <div className="annual-view">
        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-chart-line"></i> Annual Staffing vs. Need</h3>
          </div>
          <p style={{ padding: '20px' }}>Annual chart view coming soon</p>
        </div>
      </div>
    );
  };

  const renderMonthlyView = () => {
    return (
      <div className="monthly-view">
        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-chart-bar"></i> Daily Routes vs. Staffing</h3>
          </div>
          <p style={{ padding: '20px' }}>Monthly analysis chart coming soon</p>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <Layout>
        <div className="tab-content active">
          <p>Loading labor forecasting data...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div id="forecasting-tab-content" className="tab-content active">
        <div className="tab-header">
          <div className="tab-controls">
            <div className="sub-nav">
              <button
                className={`sub-nav-btn ${activeView === 'annual' ? 'active' : ''}`}
                onClick={() => setActiveView('annual')}
              >
                <i className="fas fa-calendar-check"></i> Annual
              </button>
              <button
                className={`sub-nav-btn ${activeView === 'monthly' ? 'active' : ''}`}
                onClick={() => setActiveView('monthly')}
              >
                <i className="fas fa-calendar-day"></i> Monthly
              </button>
              <button
                className={`sub-nav-btn ${activeView === 'inputs' ? 'active' : ''}`}
                onClick={() => setActiveView('inputs')}
              >
                <i className="fas fa-keyboard"></i> Inputs
              </button>
            </div>
            <select
              className="year-selector"
              value={currentYear}
              disabled
              style={{ marginLeft: '20px' }}
            >
              <option value={currentYear}>{currentYear}</option>
            </select>
          </div>
        </div>

        {activeView === 'inputs' && (
          <div className="tab-header">
            <h4>Monthly Data Input</h4>
            <select
              className="month-selector"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            >
              {monthNames.map((name, index) => (
                <option key={index} value={index}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}

        {activeView === 'annual' && renderAnnualView()}
        {activeView === 'monthly' && renderMonthlyView()}
        {activeView === 'inputs' && renderInputsView()}
      </div>
    </Layout>
  );
};

export default LaborForecasting;
