import { useState } from 'react';
import Layout from '../components/common/Layout';

const Reports = () => {
  const [selectedReport, setSelectedReport] = useState(null);

  const reportTypes = [
    { id: 'subContractorFinancialSummary', name: 'Sub-Contractor Financial Summary', icon: 'fa-dollar-sign' },
    { id: 'specialServicesSpending', name: 'Special Services Spending', icon: 'fa-money-bill-wave' },
    { id: 'subContractorEfficiency', name: 'Sub-Contractor Efficiency', icon: 'fa-chart-line' },
    { id: 'zoneWorkloadDistribution', name: 'Zone Workload Distribution', icon: 'fa-map-marked-alt' },
    { id: 'dailyJobLoad', name: 'Daily Job Load & Trend', icon: 'fa-calendar-day' },
    { id: 'subContractorJobDetails', name: 'Sub-Contractor Job Details', icon: 'fa-clipboard-list' },
    { id: 'techHourDistribution', name: 'Tech Hour Distribution', icon: 'fa-clock' },
    { id: 'monthlyPerformance', name: 'Monthly Performance Dashboard', icon: 'fa-tachometer-alt' },
    { id: 'weekdayVsWeekend', name: 'Weekday vs. Weekend Analysis', icon: 'fa-calendar-alt' },
    { id: 'subContractorUsageTrend', name: 'Sub-Contractor Usage Trend', icon: 'fa-chart-area' },
    { id: 'jobHotspot', name: 'Job Hotspot Report', icon: 'fa-fire' },
    { id: 'secondShiftReport', name: 'Second Shift EOD Report', icon: 'fa-moon' },
    { id: 'secondShiftInstallReport', name: 'Second Shift Install Report', icon: 'fa-hard-hat' },
    { id: 'sickDayReport', name: 'Sick Day Report', icon: 'fa-notes-medical' },
    { id: 'jobReturnFrequency', name: 'Job Return Frequency', icon: 'fa-redo' },
    { id: 'officeLocationAnalysis', name: 'Office Location Analysis', icon: 'fa-building' }
  ];

  const renderReportContent = () => {
    if (!selectedReport) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '400px',
          color: '#9ca3af'
        }}>
          <i className="fas fa-file-alt" style={{ fontSize: '64px', marginBottom: '20px' }}></i>
          <p style={{ fontSize: '18px' }}>Select a report from the left to get started.</p>
        </div>
      );
    }

    const report = reportTypes.find(r => r.id === selectedReport);

    return (
      <div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '24px',
          paddingBottom: '16px',
          borderBottom: '2px solid #e5e7eb'
        }}>
          <i className={`fas ${report.icon}`} style={{ fontSize: '24px', color: '#3b82f6' }}></i>
          <h2 style={{ margin: 0 }}>{report.name}</h2>
        </div>

        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-filter"></i> Report Filters</h3>
          </div>
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Start Date</label>
                <input
                  type="date"
                  className="form-input"
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>End Date</label>
                <input
                  type="date"
                  className="form-input"
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Zone</label>
                <select
                  className="form-input"
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }}
                >
                  <option value="all">All Zones</option>
                  <option value="north">North</option>
                  <option value="south">South</option>
                  <option value="east">East</option>
                  <option value="west">West</option>
                </select>
              </div>
            </div>
            <div style={{ marginTop: '16px', display: 'flex', gap: '12px' }}>
              <button className="btn btn-primary">
                <i className="fas fa-play"></i> Generate Report
              </button>
              <button className="btn btn-secondary">
                <i className="fas fa-download"></i> Export
              </button>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: '24px' }}>
          <div className="card-header">
            <h3><i className="fas fa-chart-bar"></i> Report Results</h3>
          </div>
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
            <i className="fas fa-info-circle" style={{ fontSize: '48px', marginBottom: '16px', color: '#3b82f6' }}></i>
            <p style={{ fontSize: '16px' }}>Report generation and detailed analytics coming soon.</p>
            <p style={{ marginTop: '8px' }}>This feature will provide comprehensive insights and data visualization for {report.name.toLowerCase()}.</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Layout>
      <div className="tab-content active">
        <div className="tab-header">
          <h2>Reports & Analytics</h2>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '280px 1fr',
          gap: '24px',
          minHeight: '600px'
        }}>
          {/* Reports Sidebar */}
          <div className="card" style={{ height: 'fit-content' }}>
            <div className="card-header">
              <h3><i className="fas fa-list"></i> Select a Report</h3>
            </div>
            <div style={{ padding: '0' }}>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {reportTypes.map((report) => (
                  <li
                    key={report.id}
                    onClick={() => setSelectedReport(report.id)}
                    style={{
                      padding: '12px 16px',
                      cursor: 'pointer',
                      borderBottom: '1px solid #e5e7eb',
                      backgroundColor: selectedReport === report.id ? '#eff6ff' : 'transparent',
                      color: selectedReport === report.id ? '#3b82f6' : '#374151',
                      fontWeight: selectedReport === report.id ? '600' : '400',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (selectedReport !== report.id) {
                        e.target.style.backgroundColor = '#f9fafb';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedReport !== report.id) {
                        e.target.style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    <i className={`fas ${report.icon}`} style={{ marginRight: '8px', width: '20px' }}></i>
                    {report.name}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Report Content */}
          <div>
            {renderReportContent()}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Reports;
