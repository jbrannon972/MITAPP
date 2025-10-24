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
    if (!monthlyData) return <p>Loading annual data...</p>;

    const months = monthNames.map((name, index) => {
      const data = monthlyData[index];
      if (!data) return null;
      const calculated = calculateMonth(data, staffingData, wageSettings, currentYear);
      return { month: name, ...calculated };
    }).filter(Boolean);

    const totals = months.reduce((acc, month) => ({
      actualLeads: acc.actualLeads + (month.actualLeads || 0),
      projectedWTRJobs: acc.projectedWTRJobs + (month.projectedWTRJobs || 0),
      totalLaborSpend: acc.totalLaborSpend + (month.totalLaborSpend || 0)
    }), { actualLeads: 0, projectedWTRJobs: 0, totalLaborSpend: 0 });

    return (
      <div className="annual-view">
        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-chart-line"></i> Annual Labor Forecast Summary</h3>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Days</th>
                  <th>Leads Target</th>
                  <th>Actual Leads</th>
                  <th>Projected WTR Jobs</th>
                  <th>Current Staffing</th>
                  <th>Needed Staffing</th>
                  <th>Delta</th>
                  <th>Total Labor Cost</th>
                </tr>
              </thead>
              <tbody>
                {months.map((month, index) => (
                  <tr key={index}>
                    <td><strong>{month.month}</strong></td>
                    <td>{month.daysInMonth}</td>
                    <td>{formatNumber(month.leadsTarget)}</td>
                    <td>{formatNumber(month.actualLeads)}</td>
                    <td>{formatNumber(month.projectedWTRJobs)}</td>
                    <td>{month.currentStaffingLevel}</td>
                    <td>{month.staffingNeed}</td>
                    <td>
                      <span className={'result-value ' + (month.staffingDelta >= 0 ? 'positive' : 'negative')}>
                        {month.staffingDelta >= 0 ? '+' : ''}{month.staffingDelta}
                      </span>
                    </td>
                    <td>{formatCurrency(month.totalLaborSpend)}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 'bold', backgroundColor: '#f3f4f6' }}>
                  <td>TOTALS</td>
                  <td>-</td>
                  <td>-</td>
                  <td>{formatNumber(totals.actualLeads)}</td>
                  <td>{formatNumber(totals.projectedWTRJobs)}</td>
                  <td>-</td>
                  <td>-</td>
                  <td>-</td>
                  <td>{formatCurrency(totals.totalLaborSpend)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="dashboard-grid" style={{ marginTop: '24px' }}>
          <div className="metric-card">
            <div className="metric-header">
              <h3><i className="fas fa-bullseye"></i> Annual Leads</h3>
            </div>
            <div className="metric-value">{formatNumber(totals.actualLeads)}</div>
            <div className="metric-label">Total Leads Year</div>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <h3><i className="fas fa-hammer"></i> Projected Jobs</h3>
            </div>
            <div className="metric-value">{formatNumber(totals.projectedWTRJobs)}</div>
            <div className="metric-label">WTR Jobs Year</div>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <h3><i className="fas fa-dollar-sign"></i> Labor Budget</h3>
            </div>
            <div className="metric-value">{formatCurrency(totals.totalLaborSpend)}</div>
            <div className="metric-label">Annual Labor Cost</div>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <h3><i className="fas fa-calculator"></i> Avg Cost/Job</h3>
            </div>
            <div className="metric-value">
              {formatCurrency(totals.projectedWTRJobs > 0 ? totals.totalLaborSpend / totals.projectedWTRJobs : 0)}
            </div>
            <div className="metric-label">Average per WTR Job</div>
          </div>
        </div>
      </div>
    );
  };

  const renderMonthlyView = () => {
    if (!localMonthData) return <p>Loading monthly data...</p>;

    const daysInMonth = localMonthData.daysInMonth || 30;
    const dailyData = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const isWeekend = new Date(currentYear, selectedMonth, day).getDay() % 6 === 0;
      const activeJobs = isWeekend ? Math.floor(localMonthData.activeJobsPerDay * 0.3) : localMonthData.activeJobsPerDay;
      const hoursNeeded = isWeekend ? Math.floor(localMonthData.hoursNeededPerDay * 0.3) : localMonthData.hoursNeededPerDay;
      const techsNeeded = Math.ceil(hoursNeeded / 8);
      const staffAvailable = isWeekend ? Math.floor(localMonthData.currentStaffingLevel * 0.4) : localMonthData.currentStaffingLevel - localMonthData.teamMembersOffPerDay;

      dailyData.push({
        day,
        isWeekend,
        activeJobs: activeJobs?.toFixed(1),
        hoursNeeded: hoursNeeded?.toFixed(1),
        techsNeeded,
        staffAvailable,
        delta: staffAvailable - techsNeeded
      });
    }

    return (
      <div className="monthly-view">
        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-chart-bar"></i> {monthNames[selectedMonth]} Daily Staffing Analysis</h3>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Day of Week</th>
                  <th>Active Jobs</th>
                  <th>Hours Needed</th>
                  <th>Techs Needed</th>
                  <th>Staff Available</th>
                  <th>Delta</th>
                </tr>
              </thead>
              <tbody>
                {dailyData.map(({ day, isWeekend, activeJobs, hoursNeeded, techsNeeded, staffAvailable, delta }) => {
                  const date = new Date(currentYear, selectedMonth, day);
                  const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });

                  return (
                    <tr key={day} style={{ backgroundColor: isWeekend ? '#f9fafb' : 'white' }}>
                      <td><strong>{day}</strong></td>
                      <td>{dayName}</td>
                      <td>{activeJobs}</td>
                      <td>{hoursNeeded}</td>
                      <td>{techsNeeded}</td>
                      <td>{staffAvailable}</td>
                      <td>
                        <span className={'result-value ' + (delta >= 0 ? 'positive' : 'negative')}>
                          {delta >= 0 ? '+' : ''}{delta}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="dashboard-grid" style={{ marginTop: '24px' }}>
          <div className="metric-card">
            <div className="metric-header">
              <h3><i className="fas fa-calendar-day"></i> Work Days</h3>
            </div>
            <div className="metric-value">{dailyData.filter(d => !d.isWeekend).length}</div>
            <div className="metric-label">Weekdays in Month</div>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <h3><i className="fas fa-users"></i> Avg Techs Needed</h3>
            </div>
            <div className="metric-value">
              {Math.round(dailyData.reduce((acc, d) => acc + d.techsNeeded, 0) / dailyData.length)}
            </div>
            <div className="metric-label">Daily Average</div>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <h3><i className="fas fa-exclamation-triangle"></i> Understaffed Days</h3>
            </div>
            <div className="metric-value" style={{ color: '#ef4444' }}>
              {dailyData.filter(d => d.delta < 0).length}
            </div>
            <div className="metric-label">Days Below Need</div>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <h3><i className="fas fa-check-circle"></i> Overstaffed Days</h3>
            </div>
            <div className="metric-value" style={{ color: '#10b981' }}>
              {dailyData.filter(d => d.delta > 2).length}
            </div>
            <div className="metric-label">Days Above Need</div>
          </div>
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
