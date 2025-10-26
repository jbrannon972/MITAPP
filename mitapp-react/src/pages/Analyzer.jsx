import { useState, useEffect } from 'react';
import Layout from '../components/common/Layout';
import firebaseService from '../services/firebaseService';

const Analyzer = () => {
  const [activeView, setActiveView] = useState('analyze');
  const [csvFile, setCsvFile] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResults, setAnalysisResults] = useState(null);
  const [historicalData, setHistoricalData] = useState([]);

  useEffect(() => {
    if (activeView === 'history') {
      loadHistoricalData();
    }
  }, [activeView]);

  const loadHistoricalData = async () => {
    try {
      // Load all daily stats from collection
      const stats = await firebaseService.getCollection('hou_daily_stats');
      // Sort by date descending
      const sortedStats = stats.sort((a, b) => {
        const dateA = a.id || '';
        const dateB = b.id || '';
        return dateB.localeCompare(dateA);
      });
      setHistoricalData(sortedStats);
    } catch (error) {
      console.error('Error loading historical data:', error);
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file && file.type === 'text/csv') {
      setCsvFile(file);
    } else {
      alert('Please select a valid CSV file');
    }
  };

  const analyzeCSV = async () => {
    if (!csvFile) {
      alert('Please select a CSV file first');
      return;
    }

    setAnalyzing(true);

    try {
      // Read and parse CSV file
      const text = await csvFile.text();
      const lines = text.split('\n');
      const headers = lines[0].split(',');

      // Parse CSV data
      const jobs = [];
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
          const values = lines[i].split(',');
          const job = {};
          headers.forEach((header, index) => {
            job[header.trim()] = values[index]?.trim() || '';
          });
          jobs.push(job);
        }
      }

      // Calculate statistics
      const totalJobs = jobs.length;
      const jobsByType = {};
      const jobsByCity = {};

      jobs.forEach(job => {
        const type = job.jobType || job.type || 'Unknown';
        const city = job.city || 'Unknown';

        jobsByType[type] = (jobsByType[type] || 0) + 1;
        jobsByCity[city] = (jobsByCity[city] || 0) + 1;
      });

      setAnalysisResults({
        totalJobs,
        jobs,
        jobsByType,
        jobsByCity,
        fileName: csvFile.name,
        analyzedAt: new Date().toLocaleString()
      });
    } catch (error) {
      console.error('Error analyzing CSV:', error);
      alert('Error analyzing CSV file. Please check the file format.');
    } finally {
      setAnalyzing(false);
    }
  };

  const saveDailyStats = async () => {
    if (!analysisResults) {
      alert('No analysis results to save');
      return;
    }

    try {
      const dateString = new Date().toISOString().split('T')[0];
      await firebaseService.updateDocument('hou_analyzer', 'daily_stats', {
        stats: [
          ...(historicalData || []),
          {
            date: dateString,
            ...analysisResults
          }
        ]
      });
      alert('Daily stats saved successfully!');
      loadHistoricalData();
    } catch (error) {
      console.error('Error saving stats:', error);
      alert('Error saving stats. Please try again.');
    }
  };

  const renderAnalyzeView = () => (
    <div>
      <div className="card">
        <div className="card-header">
          <h3><i className="fas fa-upload"></i> Upload CSV File for Analysis</h3>
        </div>
        <div style={{ padding: '20px' }}>
          <p style={{ marginBottom: '16px', color: '#6b7280' }}>
            Select the exported job schedule CSV file to analyze job distribution and requirements
          </p>

          <div style={{ marginBottom: '20px' }}>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              style={{
                padding: '10px',
                border: '2px dashed #d1d5db',
                borderRadius: '8px',
                width: '100%',
                cursor: 'pointer'
              }}
            />
          </div>

          {csvFile && (
            <div style={{ marginBottom: '20px', padding: '12px', backgroundColor: '#f3f4f6', borderRadius: '8px' }}>
              <i className="fas fa-file-csv"></i> Selected: <strong>{csvFile.name}</strong>
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              className="btn btn-primary"
              onClick={analyzeCSV}
              disabled={!csvFile || analyzing}
            >
              {analyzing ? (
                <><i className="fas fa-spinner fa-spin"></i> Analyzing...</>
              ) : (
                <><i className="fas fa-chart-line"></i> Analyze Jobs</>
              )}
            </button>

            {analysisResults && (
              <button className="btn btn-secondary" onClick={saveDailyStats}>
                <i className="fas fa-save"></i> Save Daily Stats
              </button>
            )}
          </div>
        </div>
      </div>

      {analysisResults && (
        <>
          <div className="card" style={{ marginTop: '24px' }}>
            <div className="card-header">
              <h3><i className="fas fa-chart-bar"></i> Analysis Results</h3>
              <span style={{ fontSize: '14px', color: '#6b7280' }}>
                {analysisResults.analyzedAt}
              </span>
            </div>
            <div style={{ padding: '20px' }}>
              <div className="dashboard-grid">
                <div className="metric-card">
                  <div className="metric-header">
                    <h3><i className="fas fa-clipboard-list"></i> Total Jobs</h3>
                  </div>
                  <div className="metric-value">{analysisResults.totalJobs}</div>
                  <div className="metric-label">From {analysisResults.fileName}</div>
                </div>

                <div className="metric-card">
                  <div className="metric-header">
                    <h3><i className="fas fa-briefcase"></i> Job Types</h3>
                  </div>
                  <div className="metric-value">{Object.keys(analysisResults.jobsByType).length}</div>
                  <div className="metric-label">Different types found</div>
                </div>

                <div className="metric-card">
                  <div className="metric-header">
                    <h3><i className="fas fa-map-marker-alt"></i> Cities</h3>
                  </div>
                  <div className="metric-value">{Object.keys(analysisResults.jobsByCity).length}</div>
                  <div className="metric-label">Locations covered</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: '24px' }}>
            <div className="card-header">
              <h3><i className="fas fa-list"></i> Jobs by Type</h3>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Job Type</th>
                    <th>Count</th>
                    <th>Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(analysisResults.jobsByType).map(([type, count]) => (
                    <tr key={type}>
                      <td><strong>{type}</strong></td>
                      <td>{count}</td>
                      <td>{((count / analysisResults.totalJobs) * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );

  const renderDashboardView = () => {
    // Calculate aggregated statistics
    const totalDays = historicalData.length;
    const totalJobsAllTime = historicalData.reduce((sum, stat) => sum + (stat.totalJobs || 0), 0);
    const totalTechHoursAllTime = historicalData.reduce((sum, stat) => sum + (stat.totalTechHours || 0), 0);
    const avgJobsPerDay = totalDays > 0 ? (totalJobsAllTime / totalDays).toFixed(1) : 0;
    const avgTechHoursPerDay = totalDays > 0 ? (totalTechHoursAllTime / totalDays).toFixed(1) : 0;

    // Get recent 7 days stats
    const recent7Days = historicalData.slice(0, 7);

    return (
      <div>
        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-tachometer-alt"></i> Global Dashboard</h3>
          </div>
          <div style={{ padding: '20px' }}>
            <div className="dashboard-grid">
              <div className="metric-card">
                <div className="metric-header">
                  <h3><i className="fas fa-calendar-check"></i> Total Days Tracked</h3>
                </div>
                <div className="metric-value">{totalDays}</div>
                <div className="metric-label">Days with saved stats</div>
              </div>

              <div className="metric-card">
                <div className="metric-header">
                  <h3><i className="fas fa-clipboard-list"></i> Total Jobs</h3>
                </div>
                <div className="metric-value">{totalJobsAllTime}</div>
                <div className="metric-label">Across all tracked days</div>
              </div>

              <div className="metric-card">
                <div className="metric-header">
                  <h3><i className="fas fa-clock"></i> Total Tech Hours</h3>
                </div>
                <div className="metric-value">{totalTechHoursAllTime.toFixed(0)}</div>
                <div className="metric-label">Across all tracked days</div>
              </div>

              <div className="metric-card">
                <div className="metric-header">
                  <h3><i className="fas fa-chart-line"></i> Avg Jobs/Day</h3>
                </div>
                <div className="metric-value">{avgJobsPerDay}</div>
                <div className="metric-label">Average per day</div>
              </div>

              <div className="metric-card">
                <div className="metric-header">
                  <h3><i className="fas fa-user-clock"></i> Avg Hours/Day</h3>
                </div>
                <div className="metric-value">{avgTechHoursPerDay}</div>
                <div className="metric-label">Tech hours per day</div>
              </div>
            </div>
          </div>
        </div>

        {recent7Days.length > 0 && (
          <div className="card" style={{ marginTop: '24px' }}>
            <div className="card-header">
              <h3><i className="fas fa-calendar-week"></i> Last 7 Days</h3>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Total Jobs</th>
                    <th>Tech Hours</th>
                    <th>Labor Hours</th>
                    <th>DT Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {recent7Days.map((stat, index) => (
                    <tr key={index}>
                      <td><strong>{stat.id || stat.date || 'N/A'}</strong></td>
                      <td>{(stat.totalJobs || 0) + (stat.sameDayInstallCount || 0)}</td>
                      <td>{stat.totalTechHours || 0}</td>
                      <td>{stat.totalLaborHours || 0}</td>
                      <td>{stat.dtLaborHours || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderHistoryView = () => (
    <div className="card">
      <div className="card-header">
        <h3><i className="fas fa-history"></i> Historical Data</h3>
        <span style={{ fontSize: '14px', color: '#6b7280' }}>
          {historicalData.length} days of data
        </span>
      </div>
      <div className="table-container">
        {historicalData.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Total Jobs</th>
                <th>Tech Hours</th>
                <th>Labor Hours</th>
                <th>DT Hours</th>
                <th>Job Types</th>
                <th>Time Frames</th>
              </tr>
            </thead>
            <tbody>
              {historicalData.map((stat, index) => (
                <tr key={index}>
                  <td><strong>{stat.id || stat.date || 'N/A'}</strong></td>
                  <td>{(stat.totalJobs || 0) + (stat.sameDayInstallCount || 0)}</td>
                  <td>{stat.totalTechHours || 0}</td>
                  <td>{stat.totalLaborHours || 0}</td>
                  <td>{stat.dtLaborHours || 0}</td>
                  <td>
                    {stat.jobTypeCounts ? (
                      <div style={{ fontSize: '12px' }}>
                        {Object.entries(stat.jobTypeCounts).map(([type, count]) => (
                          <div key={type}>{type}: {count}</div>
                        ))}
                      </div>
                    ) : 'N/A'}
                  </td>
                  <td>
                    {stat.timeFrameCounts ? (
                      <div style={{ fontSize: '12px' }}>
                        {Object.entries(stat.timeFrameCounts).map(([frame, count]) => (
                          <div key={frame}>{frame}: {count}</div>
                        ))}
                      </div>
                    ) : 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ padding: '20px', textAlign: 'center' }}>
            No historical data available. Job stats are automatically saved when you use the job analyzer on the Dashboard.
          </p>
        )}
      </div>
    </div>
  );

  const renderReportsView = () => (
    <div className="card">
      <div className="card-header">
        <h3><i className="fas fa-file-alt"></i> Reports</h3>
      </div>
      <div style={{ padding: '20px' }}>
        <p>Custom reports and exports coming soon.</p>
        <p style={{ marginTop: '12px', color: '#6b7280' }}>
          This will allow you to generate custom reports based on your analysis data.
        </p>
      </div>
    </div>
  );

  return (
    <Layout>
      <div className="tab-content active">
        <div className="tab-header">
          <h2>Job Analyzer</h2>
        </div>

        <div className="tab-header">
          <div className="sub-nav">
            <button
              className={`sub-nav-btn ${activeView === 'analyze' ? 'active' : ''}`}
              onClick={() => setActiveView('analyze')}
            >
              <i className="fas fa-chart-line"></i> Analyze Day
            </button>
            <button
              className={`sub-nav-btn ${activeView === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveView('dashboard')}
            >
              <i className="fas fa-tachometer-alt"></i> Global Dashboard
            </button>
            <button
              className={`sub-nav-btn ${activeView === 'history' ? 'active' : ''}`}
              onClick={() => setActiveView('history')}
            >
              <i className="fas fa-history"></i> Historical Data
            </button>
            <button
              className={`sub-nav-btn ${activeView === 'reports' ? 'active' : ''}`}
              onClick={() => setActiveView('reports')}
            >
              <i className="fas fa-file-alt"></i> Reports
            </button>
          </div>
        </div>

        {activeView === 'analyze' && renderAnalyzeView()}
        {activeView === 'dashboard' && renderDashboardView()}
        {activeView === 'history' && renderHistoryView()}
        {activeView === 'reports' && renderReportsView()}
      </div>
    </Layout>
  );
};

export default Analyzer;
