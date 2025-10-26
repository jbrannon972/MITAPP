import { useState, useEffect } from 'react';
import Layout from '../components/common/Layout';
import firebaseService from '../services/firebaseService';

const Analyzer = () => {
  const [activeView, setActiveView] = useState('analyze');
  const [csvFile, setCsvFile] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResults, setAnalysisResults] = useState(null);
  const [historicalData, setHistoricalData] = useState([]);
  const [currentData, setCurrentData] = useState(null);

  useEffect(() => {
    if (activeView === 'history') {
      loadHistoricalData();
    }
  }, [activeView]);

  const loadHistoricalData = async () => {
    try {
      // Load all daily stats from collection
      const stats = await firebaseService.getCollection('analyzer_daily_stats');
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

  // Helper function to extract customer name from route_title
  const extractCustomerName = (title) => {
    const parts = (title || '').split('|');
    return parts[0] ? parts[0].trim() : 'Unknown';
  };

  // Helper function to extract full job ID
  const extractFullJobId = (title) => {
    const match = (title || '').match(/\d{2}-\d{5,}-\w+-\w+-\w+/);
    return match ? match[0] : 'N/A';
  };

  // Helper function to extract job number
  const extractJobNumber = (text) => {
    const match = (text || '').match(/(\d{2}-\d{5,})/);
    return match ? match[0] : null;
  };

  // Helper function to extract time frame from route data
  const extractTimeFrame = (row) => {
    const title = row.route_title || '';
    const description = row.route_description || '';

    // Check title first
    const titleMatch = title.match(/TF:\s*(\d{1,2}-\d{1,2})/i);
    if (titleMatch) return titleMatch[1];

    // Check description for "TF: 9-12" format
    const descTFMatch = description.match(/TF:\s*(\d{1,2}-\d{1,2})(?:pm|am)?/i);
    if (descTFMatch) return descTFMatch[1];

    // Check description for "TF(...)" format
    const descMatch = description.match(/TF\(([^)]+)\)/i);
    if (descMatch) {
      const tfContent = descMatch[1];
      const timeMatch = tfContent.match(/(\d{1,2})(?::?\d{0,2})?[-\s]*(?:to|-|–)?\s*(\d{1,2})(?::?\d{0,2})?/);
      if (timeMatch) {
        return `${timeMatch[1]}-${timeMatch[2]}`;
      }
    }

    return null;
  };

  // Proper CSV parser that handles quoted fields
  const parseCSV = (text) => {
    const data = [];
    let current = '';
    let inQuotes = false;
    let headers = null;
    let currentRow = [];

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      if (char === '"') {
        inQuotes = !inQuotes;
        current += char;
      } else if (char === ',' && !inQuotes) {
        currentRow.push(current.trim());
        current = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (current.trim() || currentRow.length > 0) {
          currentRow.push(current.trim());

          if (!headers) {
            headers = currentRow.map(h => h.replace(/"/g, '').trim());
          } else if (currentRow.length === headers.length) {
            const row = {};
            headers.forEach((header, index) => {
              let value = currentRow[index] || '';
              value = value.replace(/^"/, '').replace(/"$/, '');
              // Convert to number if it's a valid number
              if (!isNaN(value) && value !== '' && !isNaN(parseFloat(value))) {
                row[header] = parseFloat(value);
              } else {
                row[header] = value;
              }
            });
            data.push(row);
          }
          currentRow = [];
          current = '';
        }
      } else if (char !== '\r') {
        current += char;
      }
    }

    // Handle last row
    if (current.trim() || currentRow.length > 0) {
      currentRow.push(current.trim());
      if (headers && currentRow.length === headers.length) {
        const row = {};
        headers.forEach((header, index) => {
          let value = currentRow[index] || '';
          value = value.replace(/^"/, '').replace(/"$/, '');
          if (!isNaN(value) && value !== '' && !isNaN(parseFloat(value))) {
            row[header] = parseFloat(value);
          } else {
            row[header] = value;
          }
        });
        data.push(row);
      }
    }

    return { data, meta: { fields: headers } };
  };

  // Comprehensive job analysis function matching vanilla version
  const performAnalysis = (data) => {
    const jobTypePatterns = {
      install: /install/i,
      demo: /demo/i,
      cs: /check service|cs/i,
      pull: /pull/i
    };

    let jobTypeCounts = { install: 0, demo: 0, cs: 0, pull: 0, other: 0 };
    let jobTypeTechHours = { install: 0, demo: 0, cs: 0, pull: 0, other: 0 };
    let zoneCounts = {};
    let timeFrameCounts = { '9-12': 0, '9-4': 0, '12-4': 0, 'other': 0 };
    let otherTFDetails = [];
    const jobNumbers = new Set();
    let demoJobs = [];
    let dtTrueCount = 0;
    let dtLaborHours = 0;
    let totalLaborHours = 0;
    let jobIdToTypeMap = {};
    let jobsData = [];

    data.forEach(row => {
      const title = row.route_title || '';
      const duration = row.duration || 0;
      const description = row.route_description || '';
      const zone = `Z${row.Zone || 'N/A'}`;
      const isDT = /DT\((true)\)/i.test(description);
      const techHours = isDT ? duration * 2 : duration;
      const fullJobId = extractFullJobId(title);

      jobsData.push({
        id: fullJobId,
        name: extractCustomerName(title),
        address: row.customer_address
      });

      // Extract and count time frames
      const timeFrame = extractTimeFrame(row);
      if (timeFrame === '9-12') {
        timeFrameCounts['9-12']++;
      } else if (timeFrame === '9-4' || timeFrame === '9-16') {
        timeFrameCounts['9-4']++;
      } else if (timeFrame === '12-4' || timeFrame === '12-16') {
        timeFrameCounts['12-4']++;
      } else if (timeFrame) {
        timeFrameCounts['other']++;
        otherTFDetails.push({
          customer: extractCustomerName(title),
          timeFrame: timeFrame,
          jobNumber: fullJobId
        });
      }

      totalLaborHours += duration;

      // Count jobs and hours by zone
      if (zone.replace('Z', '').trim() !== 'N/A') {
        zoneCounts[zone] = zoneCounts[zone] || { jobs: 0, hours: 0 };
        zoneCounts[zone].jobs++;
        zoneCounts[zone].hours += techHours;
      }

      // Detect job type from title
      let foundType = 'other';
      for (const [type, pattern] of Object.entries(jobTypePatterns)) {
        if (pattern.test(title)) {
          foundType = type;
          break;
        }
      }

      if (fullJobId !== 'N/A') {
        jobNumbers.add(fullJobId);
        jobIdToTypeMap[fullJobId] = foundType;
      }

      jobTypeCounts[foundType]++;
      jobTypeTechHours[foundType] += techHours;

      // Track demo jobs separately
      if (foundType === 'demo') {
        demoJobs.push({
          id: fullJobId,
          name: extractCustomerName(title),
          address: row.customer_address,
          jobType: foundType,
          duration: duration,
          isDT: isDT
        });
      }

      if (isDT) {
        dtTrueCount++;
        dtLaborHours += duration;
      }
    });

    const totalJobs = data.length;
    const totalTechHours = totalLaborHours + dtLaborHours;
    const averageTechHoursPerJob = totalJobs > 0 ? (totalTechHours / totalJobs).toFixed(2) : 0;

    return {
      totalJobs,
      sameDayInstallCount: 0,
      jobTypeCounts,
      jobTypeTechHours,
      zoneCounts,
      timeFrameCounts,
      otherTFDetails,
      demoJobs,
      dtTrueCount,
      dtLaborHours,
      totalLaborHours,
      totalTechHours,
      averageTechHoursPerJob,
      jobNumbers: Array.from(jobNumbers),
      jobIdToTypeMap,
      jobsData,
      timestamp: new Date().toISOString()
    };
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
      // Read and parse CSV file with proper quote handling
      const text = await csvFile.text();
      const parsedData = parseCSV(text);

      if (!parsedData.data || parsedData.data.length === 0) {
        throw new Error('No data found in CSV file');
      }

      // Store the raw data
      setCurrentData(parsedData.data);

      // Perform comprehensive analysis
      const results = performAnalysis(parsedData.data);

      // Add metadata
      results.fileName = csvFile.name;
      results.analyzedAt = new Date().toLocaleString();

      setAnalysisResults(results);
    } catch (error) {
      console.error('Error analyzing CSV:', error);
      alert(`Error analyzing CSV file: ${error.message}\nPlease check the file format.`);
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

      // Save to analyzer_daily_stats collection with date as document ID
      await firebaseService.saveDocument('analyzer_daily_stats', dateString, {
        ...analysisResults,
        date: dateString,
        savedAt: new Date().toISOString()
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
          {/* Main Metrics */}
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
                  <div className="metric-label">Jobs analyzed</div>
                </div>

                <div className="metric-card">
                  <div className="metric-header">
                    <h3><i className="fas fa-clock"></i> Total Labor Hours</h3>
                  </div>
                  <div className="metric-value">{analysisResults.totalLaborHours.toFixed(1)}</div>
                  <div className="metric-label">Regular hours</div>
                </div>

                <div className="metric-card">
                  <div className="metric-header">
                    <h3><i className="fas fa-user-clock"></i> Total Tech Hours</h3>
                  </div>
                  <div className="metric-value">{analysisResults.totalTechHours.toFixed(1)}</div>
                  <div className="metric-label">Including DT</div>
                </div>

                <div className="metric-card">
                  <div className="metric-header">
                    <h3><i className="fas fa-chart-line"></i> Avg Hours/Job</h3>
                  </div>
                  <div className="metric-value">{analysisResults.averageTechHoursPerJob}</div>
                  <div className="metric-label">Per job average</div>
                </div>

                <div className="metric-card">
                  <div className="metric-header">
                    <h3><i className="fas fa-clock"></i> DT Jobs</h3>
                  </div>
                  <div className="metric-value">{analysisResults.dtTrueCount}</div>
                  <div className="metric-label">{analysisResults.dtLaborHours.toFixed(1)} DT hours</div>
                </div>

                <div className="metric-card">
                  <div className="metric-header">
                    <h3><i className="fas fa-hammer"></i> Demo Jobs</h3>
                  </div>
                  <div className="metric-value">{analysisResults.demoJobs.length}</div>
                  <div className="metric-label">Demo jobs found</div>
                </div>
              </div>
            </div>
          </div>

          {/* Job Types Breakdown */}
          <div className="card" style={{ marginTop: '24px' }}>
            <div className="card-header">
              <h3><i className="fas fa-briefcase"></i> Jobs by Type</h3>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Job Type</th>
                    <th>Count</th>
                    <th>Tech Hours</th>
                    <th>% of Jobs</th>
                    <th>% of Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(analysisResults.jobTypeCounts).map(([type, count]) => (
                    <tr key={type}>
                      <td><strong style={{ textTransform: 'capitalize' }}>{type}</strong></td>
                      <td>{count}</td>
                      <td>{analysisResults.jobTypeTechHours[type].toFixed(1)}</td>
                      <td>{((count / analysisResults.totalJobs) * 100).toFixed(1)}%</td>
                      <td>{((analysisResults.jobTypeTechHours[type] / analysisResults.totalTechHours) * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Time Frames */}
          <div className="card" style={{ marginTop: '24px' }}>
            <div className="card-header">
              <h3><i className="fas fa-calendar-alt"></i> Time Frame Analysis</h3>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Time Frame</th>
                    <th>Count</th>
                    <th>Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(analysisResults.timeFrameCounts).map(([frame, count]) => (
                    <tr key={frame}>
                      <td><strong>{frame}</strong></td>
                      <td>{count}</td>
                      <td>{((count / analysisResults.totalJobs) * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Zone Distribution */}
          {Object.keys(analysisResults.zoneCounts).length > 0 && (
            <div className="card" style={{ marginTop: '24px' }}>
              <div className="card-header">
                <h3><i className="fas fa-map-marked-alt"></i> Zone Distribution</h3>
              </div>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Zone</th>
                      <th>Jobs</th>
                      <th>Tech Hours</th>
                      <th>% of Jobs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(analysisResults.zoneCounts)
                      .sort((a, b) => a[0].localeCompare(b[0]))
                      .map(([zone, data]) => (
                        <tr key={zone}>
                          <td><strong>{zone}</strong></td>
                          <td>{data.jobs}</td>
                          <td>{data.hours.toFixed(1)}</td>
                          <td>{((data.jobs / analysisResults.totalJobs) * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Demo Jobs List */}
          {analysisResults.demoJobs.length > 0 && (
            <div className="card" style={{ marginTop: '24px' }}>
              <div className="card-header">
                <h3><i className="fas fa-hammer"></i> Demo Jobs</h3>
              </div>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Job ID</th>
                      <th>Customer</th>
                      <th>Address</th>
                      <th>Duration</th>
                      <th>Double Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysisResults.demoJobs.map((job, idx) => (
                      <tr key={idx}>
                        <td>{job.id}</td>
                        <td>{job.name}</td>
                        <td>{job.address}</td>
                        <td>{job.duration}h</td>
                        <td>{job.isDT ? '✓' : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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
