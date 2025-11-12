import { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import { formatCurrency, formatNumber } from '../../utils/forecastingCalculations';

Chart.register(...registerables);

const AnnualView = ({ calculatedData, currentYear }) => {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (calculatedData.length > 0 && chartRef.current) {
      renderChart();
    }

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [calculatedData]);

  const renderChart = () => {
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = chartRef.current.getContext('2d');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const staffingNeed = calculatedData.map(d => d?.staffingNeed || 0);
    const currentStaffing = calculatedData.map(d => d?.currentStaffingLevel || 0);

    chartInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: months,
        datasets: [
          {
            label: 'Staffing Need',
            data: staffingNeed,
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            tension: 0.1,
            fill: true
          },
          {
            label: 'Current MIT Techs',
            data: currentStaffing,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            tension: 0.1,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: `${currentYear} Staffing Requirements vs Current MIT Techs`
          },
          legend: {
            display: true,
            position: 'top'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Number of MIT Techs'
            }
          }
        }
      }
    });
  };

  const getTotalStaffingDelta = () => {
    return calculatedData.reduce((sum, d) => sum + (d?.staffingDelta || 0), 0) / 12;
  };

  return (
    <div>
      {/* Chart Section */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header">
          <h3><i className="fas fa-chart-line"></i> Annual Staffing vs. Need</h3>
        </div>
        <div className="card-body" style={{ height: '400px', padding: '20px' }}>
          <canvas ref={chartRef}></canvas>
        </div>
      </div>

      {/* Summary Table */}
      <div className="card">
        <div className="card-header">
          <h3><i className="fas fa-table"></i> Annual Financial & Labor Summary</h3>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', minWidth: '1200px' }}>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Projected WTR Jobs</th>
                  <th>Avg Jobs/Day</th>
                  <th>Hours Needed/Day</th>
                  <th>Techs/Foremen Needed</th>
                  <th>Current Staffing</th>
                  <th>Staffing Delta</th>
                  <th>MIT Tech Labor</th>
                  <th>Fixed Labor</th>
                  <th>Total Labor</th>
                  <th>Cost/WTR Job</th>
                </tr>
              </thead>
              <tbody>
                {calculatedData.map((data, month) => {
                  if (!data) return null;
                  return (
                    <tr key={month}>
                      <td style={{ fontWeight: '600' }}>
                        {new Date(currentYear, month, 1).toLocaleString('default', { month: 'short' })}
                      </td>
                      <td>{formatNumber(data.projectedWTRJobs || 0)}</td>
                      <td>{formatNumber(data.activeJobsPerDay || 0, 1)}</td>
                      <td>{formatNumber(data.hoursNeededPerDay || 0, 1)}</td>
                      <td>{data.techsForemenNeeded || 0}</td>
                      <td>{data.currentStaffingLevel || 0}</td>
                      <td style={{
                        color: (data.staffingDelta || 0) >= 0 ? 'var(--success-color)' : 'var(--danger-color)',
                        fontWeight: '600'
                      }}>
                        {(data.staffingDelta || 0) >= 0 ? '+' : ''}{data.staffingDelta || 0}
                      </td>
                      <td>{formatCurrency(data.mitTechLaborCost || 0)}</td>
                      <td>{formatCurrency(data.fixedLaborCost || 0)}</td>
                      <td style={{ fontWeight: '600' }}>{formatCurrency(data.totalLaborSpend || 0)}</td>
                      <td>{formatCurrency(data.costPerWTRJob || 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: '600', backgroundColor: 'var(--surface-secondary)' }}>
                  <td>Totals</td>
                  <td>{formatNumber(calculatedData.reduce((sum, d) => sum + (d?.projectedWTRJobs || 0), 0))}</td>
                  <td colSpan="4"></td>
                  <td style={{
                    color: getTotalStaffingDelta() >= 0 ? 'var(--success-color)' : 'var(--danger-color)'
                  }}>
                    Avg: {getTotalStaffingDelta() >= 0 ? '+' : ''}{formatNumber(getTotalStaffingDelta(), 1)}
                  </td>
                  <td>{formatCurrency(calculatedData.reduce((sum, d) => sum + (d?.mitTechLaborCost || 0), 0))}</td>
                  <td>{formatCurrency(calculatedData.reduce((sum, d) => sum + (d?.fixedLaborCost || 0), 0))}</td>
                  <td>{formatCurrency(calculatedData.reduce((sum, d) => sum + (d?.totalLaborSpend || 0), 0))}</td>
                  <td>{formatCurrency(
                    calculatedData.reduce((sum, d) => sum + (d?.totalLaborSpend || 0), 0) /
                    calculatedData.reduce((sum, d) => sum + (d?.projectedWTRJobs || 0), 0)
                  )}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnnualView;
