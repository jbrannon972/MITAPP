import { useState, useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import { useData } from '../../contexts/DataContext';
import firebaseService from '../../services/firebaseService';

Chart.register(...registerables);

const TrendsView = () => {
  const { staffingData } = useData();
  const [completedRequests, setCompletedRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('all'); // all, 30days, 90days, year

  // Chart refs
  const mostLostChartRef = useRef(null);
  const mostLostChartInstance = useRef(null);
  const techLossChartRef = useRef(null);
  const techLossChartInstance = useRef(null);
  const monthlyTrendChartRef = useRef(null);
  const monthlyTrendChartInstance = useRef(null);
  const reasonPieChartRef = useRef(null);
  const reasonPieChartInstance = useRef(null);

  useEffect(() => {
    loadCompletedRequests();
  }, []);

  useEffect(() => {
    if (completedRequests.length > 0) {
      renderCharts();
    }

    return () => {
      // Cleanup charts on unmount
      if (mostLostChartInstance.current) mostLostChartInstance.current.destroy();
      if (techLossChartInstance.current) techLossChartInstance.current.destroy();
      if (monthlyTrendChartInstance.current) monthlyTrendChartInstance.current.destroy();
      if (reasonPieChartInstance.current) reasonPieChartInstance.current.destroy();
    };
  }, [completedRequests, dateRange]);

  const loadCompletedRequests = async () => {
    try {
      setLoading(true);
      const data = await firebaseService.getToolRequests('Completed');
      setCompletedRequests(data);
    } catch (error) {
      console.error('Error loading completed requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterByDateRange = (requests) => {
    if (dateRange === 'all') return requests;

    const now = new Date();
    const cutoffDate = new Date();

    if (dateRange === '30days') {
      cutoffDate.setDate(now.getDate() - 30);
    } else if (dateRange === '90days') {
      cutoffDate.setDate(now.getDate() - 90);
    } else if (dateRange === 'year') {
      cutoffDate.setFullYear(now.getFullYear() - 1);
    }

    return requests.filter(req => {
      const date = req.completedAt?.toDate ? req.completedAt.toDate() : new Date(req.completedAt);
      return date >= cutoffDate;
    });
  };

  const renderCharts = () => {
    const filteredRequests = filterByDateRange(completedRequests);
    if (filteredRequests.length === 0) return;

    renderMostLostToolsChart(filteredRequests);
    renderTechLossChart(filteredRequests);
    renderMonthlyTrendChart(filteredRequests);
    renderReasonPieChart(filteredRequests);
  };

  const renderMostLostToolsChart = (requests) => {
    if (!mostLostChartRef.current) return;

    // Count tool occurrences
    const toolCounts = {};
    requests.forEach(req => {
      const toolName = req.toolName || 'Unknown';
      toolCounts[toolName] = (toolCounts[toolName] || 0) + 1;
    });

    // Get top 10 most lost tools
    const sortedTools = Object.entries(toolCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    const labels = sortedTools.map(([name]) => name);
    const data = sortedTools.map(([, count]) => count);

    if (mostLostChartInstance.current) {
      mostLostChartInstance.current.destroy();
    }

    const ctx = mostLostChartRef.current.getContext('2d');
    mostLostChartInstance.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Number of Requests',
          data: data,
          backgroundColor: 'rgba(239, 68, 68, 0.7)',
          borderColor: 'rgba(239, 68, 68, 1)',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1
            }
          }
        }
      }
    });
  };

  const renderTechLossChart = (requests) => {
    if (!techLossChartRef.current) return;

    // Count requests by technician
    const techCounts = {};
    requests.forEach(req => {
      const techName = req.technicianName || 'Unknown';
      techCounts[techName] = (techCounts[techName] || 0) + 1;
    });

    // Get top 10 technicians with most requests
    const sortedTechs = Object.entries(techCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    const labels = sortedTechs.map(([name]) => name);
    const data = sortedTechs.map(([, count]) => count);

    if (techLossChartInstance.current) {
      techLossChartInstance.current.destroy();
    }

    const ctx = techLossChartRef.current.getContext('2d');
    techLossChartInstance.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Number of Requests',
          data: data,
          backgroundColor: 'rgba(59, 130, 246, 0.7)',
          borderColor: 'rgba(59, 130, 246, 1)',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: false
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              stepSize: 1
            }
          }
        }
      }
    });
  };

  const renderMonthlyTrendChart = (requests) => {
    if (!monthlyTrendChartRef.current) return;

    // Group by month
    const monthlyData = {};
    const monthlyCosts = {};

    requests.forEach(req => {
      const date = req.completedAt?.toDate ? req.completedAt.toDate() : new Date(req.completedAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      monthlyData[monthKey] = (monthlyData[monthKey] || 0) + 1;
      monthlyCosts[monthKey] = (monthlyCosts[monthKey] || 0) + (req.toolCost || 0);
    });

    // Sort by month and get last 12 months
    const sortedMonths = Object.keys(monthlyData).sort();
    const last12Months = sortedMonths.slice(-12);

    const labels = last12Months.map(month => {
      const [year, monthNum] = month.split('-');
      const date = new Date(year, monthNum - 1);
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    });

    const countData = last12Months.map(month => monthlyData[month] || 0);
    const costData = last12Months.map(month => monthlyCosts[month] || 0);

    if (monthlyTrendChartInstance.current) {
      monthlyTrendChartInstance.current.destroy();
    }

    const ctx = monthlyTrendChartRef.current.getContext('2d');
    monthlyTrendChartInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Requests Count',
            data: countData,
            borderColor: 'rgba(99, 102, 241, 1)',
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            tension: 0.4,
            yAxisID: 'y'
          },
          {
            label: 'Total Cost ($)',
            data: costData,
            borderColor: 'rgba(16, 185, 129, 1)',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            tension: 0.4,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: true,
            position: 'top'
          }
        },
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            beginAtZero: true,
            ticks: {
              stepSize: 1
            }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            beginAtZero: true,
            grid: {
              drawOnChartArea: false
            }
          }
        }
      }
    });
  };

  const renderReasonPieChart = (requests) => {
    if (!reasonPieChartRef.current) return;

    // Count reasons
    const reasonCounts = {};
    requests.forEach(req => {
      const reason = req.reason || 'Not specified';
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    });

    const labels = Object.keys(reasonCounts);
    const data = Object.values(reasonCounts);

    const colors = [
      'rgba(239, 68, 68, 0.8)',
      'rgba(59, 130, 246, 0.8)',
      'rgba(16, 185, 129, 0.8)',
      'rgba(245, 158, 11, 0.8)',
      'rgba(139, 92, 246, 0.8)',
      'rgba(236, 72, 153, 0.8)'
    ];

    if (reasonPieChartInstance.current) {
      reasonPieChartInstance.current.destroy();
    }

    const ctx = reasonPieChartRef.current.getContext('2d');
    reasonPieChartInstance.current = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'right'
          },
          title: {
            display: false
          }
        }
      }
    });
  };

  const calculateStats = () => {
    const filteredRequests = filterByDateRange(completedRequests);

    const totalRequests = filteredRequests.length;
    const totalCost = filteredRequests.reduce((sum, req) => sum + (req.toolCost || 0), 0);
    const avgCost = totalRequests > 0 ? totalCost / totalRequests : 0;

    // Most lost tool
    const toolCounts = {};
    filteredRequests.forEach(req => {
      const toolName = req.toolName || 'Unknown';
      toolCounts[toolName] = (toolCounts[toolName] || 0) + 1;
    });
    const mostLostTool = Object.entries(toolCounts)
      .sort(([, a], [, b]) => b - a)[0];

    // Tech with most losses
    const techCounts = {};
    filteredRequests.forEach(req => {
      const techName = req.technicianName || 'Unknown';
      techCounts[techName] = (techCounts[techName] || 0) + 1;
    });
    const techMostLosses = Object.entries(techCounts)
      .sort(([, a], [, b]) => b - a)[0];

    return {
      totalRequests,
      totalCost,
      avgCost,
      mostLostTool: mostLostTool ? mostLostTool[0] : 'N/A',
      mostLostToolCount: mostLostTool ? mostLostTool[1] : 0,
      techMostLosses: techMostLosses ? techMostLosses[0] : 'N/A',
      techMostLossesCount: techMostLosses ? techMostLosses[1] : 0
    };
  };

  if (loading) {
    return (
      <div className="card">
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: '48px', color: 'var(--primary-color)' }}></i>
          <p style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>Loading trends data...</p>
        </div>
      </div>
    );
  }

  if (completedRequests.length === 0) {
    return (
      <div className="card">
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <i className="fas fa-chart-line" style={{ fontSize: '48px', color: 'var(--text-secondary)', opacity: 0.5 }}></i>
          <h3 style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>No Data Available</h3>
          <p style={{ color: 'var(--text-secondary)' }}>Tool request data will appear here once requests are completed.</p>
        </div>
      </div>
    );
  }

  const stats = calculateStats();

  return (
    <div>
      {/* Date Range Filter */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>
            <i className="fas fa-chart-line"></i> Tool Request Trends & Analytics
          </h3>
          <select
            className="form-control"
            style={{ width: '200px' }}
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
          >
            <option value="all">All Time</option>
            <option value="30days">Last 30 Days</option>
            <option value="90days">Last 90 Days</option>
            <option value="year">Last Year</option>
          </select>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '20px' }}>
        <div className="card" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', border: 'none' }}>
          <div style={{ padding: '24px' }}>
            <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>Total Requests</div>
            <div style={{ fontSize: '36px', fontWeight: 'bold' }}>{stats.totalRequests}</div>
            <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '8px' }}>
              <i className="fas fa-box-open"></i> Completed tool requests
            </div>
          </div>
        </div>

        <div className="card" style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', color: 'white', border: 'none' }}>
          <div style={{ padding: '24px' }}>
            <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>Total Cost</div>
            <div style={{ fontSize: '36px', fontWeight: 'bold' }}>${stats.totalCost.toFixed(2)}</div>
            <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '8px' }}>
              <i className="fas fa-dollar-sign"></i> Avg: ${stats.avgCost.toFixed(2)} per request
            </div>
          </div>
        </div>

        <div className="card" style={{ background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', color: 'white', border: 'none' }}>
          <div style={{ padding: '24px' }}>
            <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>Most Lost Tool</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '4px' }}>{stats.mostLostTool}</div>
            <div style={{ fontSize: '12px', opacity: 0.8 }}>
              <i className="fas fa-exclamation-triangle"></i> {stats.mostLostToolCount} times
            </div>
          </div>
        </div>

        <div className="card" style={{ background: 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)', color: 'white', border: 'none' }}>
          <div style={{ padding: '24px' }}>
            <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>Top Requester</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '4px' }}>{stats.techMostLosses}</div>
            <div style={{ fontSize: '12px', opacity: '0.8' }}>
              <i className="fas fa-user"></i> {stats.techMostLossesCount} requests
            </div>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '20px' }}>
        {/* Most Lost Tools Chart */}
        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-wrench"></i> Top 10 Most Requested Tools</h3>
          </div>
          <div style={{ padding: '20px', height: '400px' }}>
            <canvas ref={mostLostChartRef}></canvas>
          </div>
        </div>

        {/* Tech Loss Chart */}
        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-users"></i> Top 10 Technicians by Requests</h3>
          </div>
          <div style={{ padding: '20px', height: '400px' }}>
            <canvas ref={techLossChartRef}></canvas>
          </div>
        </div>

        {/* Monthly Trend Chart */}
        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-chart-area"></i> Monthly Trends</h3>
          </div>
          <div style={{ padding: '20px', height: '400px' }}>
            <canvas ref={monthlyTrendChartRef}></canvas>
          </div>
        </div>

        {/* Reason Pie Chart */}
        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-pie-chart"></i> Request Reasons</h3>
          </div>
          <div style={{ padding: '20px', height: '400px' }}>
            <canvas ref={reasonPieChartRef}></canvas>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrendsView;
