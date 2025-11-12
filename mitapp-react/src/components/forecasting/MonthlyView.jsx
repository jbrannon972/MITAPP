import { useState, useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import { calculateMonthlyForecast, formatNumber } from '../../utils/forecastingCalculations';

Chart.register(...registerables);

const MonthlyView = ({ calculatedData, monthlyData, currentYear }) => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [forecast, setForecast] = useState(null);
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];

  useEffect(() => {
    if (monthlyData[selectedMonth]) {
      loadMonthlyForecast();
    }
  }, [selectedMonth, monthlyData, currentYear]);

  useEffect(() => {
    if (forecast && chartRef.current) {
      renderChart();
    }

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [forecast]);

  const loadMonthlyForecast = async () => {
    const data = await calculateMonthlyForecast(
      monthlyData[selectedMonth],
      selectedMonth,
      currentYear,
      null // We don't have actual staffing integration yet
    );
    setForecast(data);
  };

  const renderChart = () => {
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = chartRef.current.getContext('2d');
    const daysInMonth = new Date(currentYear, selectedMonth + 1, 0).getDate();
    const labels = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    // Check for staffing alerts
    let understaffedDays = 0;
    let overstaffedDays = 0;
    forecast.dailyRoutesNeeded.forEach((needed, i) => {
      const actual = forecast.actualStaffing[i] || 0;
      if (actual < needed) understaffedDays++;
      if (actual > needed + 2) overstaffedDays++;
    });

    chartInstance.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Routes Needed',
            data: forecast.dailyRoutesNeeded,
            backgroundColor: 'rgba(239, 68, 68, 0.6)',
            borderColor: '#ef4444',
            borderWidth: 1
          },
          {
            label: 'Actual Staffing',
            data: forecast.actualStaffing,
            backgroundColor: 'rgba(59, 130, 246, 0.6)',
            borderColor: '#3b82f6',
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: `Daily Routes vs. Staffing - ${monthNames[selectedMonth]} ${currentYear}`
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
              text: 'Number of Technicians'
            }
          },
          x: {
            title: {
              display: true,
              text: 'Day of Month'
            }
          }
        }
      }
    });
  };

  const monthData = calculatedData[selectedMonth] || {};

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '20px' }}>
      {/* Chart Section */}
      <div>
        <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0 }}>Monthly Analysis</h4>
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

        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-chart-bar"></i> Daily Routes vs. Staffing</h3>
          </div>
          <div className="card-body" style={{ height: '450px', padding: '20px' }}>
            <canvas ref={chartRef}></canvas>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div>
        {/* Monthly Inputs Summary */}
        <div className="card" style={{ marginBottom: '16px' }}>
          <div className="card-header">
            <h3 style={{ fontSize: '14px' }}><i className="fas fa-cogs"></i> Monthly Inputs Summary</h3>
          </div>
          <div className="card-body" style={{ padding: '12px', fontSize: '12px' }}>
            <div style={{ marginBottom: '8px' }}>
              <strong>Days in Month:</strong> {monthData.daysInMonth || 0}
            </div>
            <div style={{ marginBottom: '8px' }}>
              <strong>Leads Target:</strong> {formatNumber(monthData.leadsTarget || 0)}
            </div>
            <div style={{ marginBottom: '8px' }}>
              <strong>Leads % Goal:</strong> {formatNumber((monthData.leadsPercentGoal || 0) * 100, 1)}%
            </div>
            <div style={{ marginBottom: '8px' }}>
              <strong>Booking Rate:</strong> {formatNumber((monthData.bookingRate || 0) * 100, 1)}%
            </div>
            <div style={{ marginBottom: '8px' }}>
              <strong>WTR Ins Closing:</strong> {formatNumber((monthData.wtrInsClosingRate || 0) * 100, 1)}%
            </div>
            <div style={{ marginBottom: '8px' }}>
              <strong>WTR Cash Closing:</strong> {formatNumber((monthData.wtrCashClosingRate || 0) * 100, 1)}%
            </div>
            <div style={{ marginBottom: '8px' }}>
              <strong>Avg Days Onsite:</strong> {monthData.mitAvgDaysOnsite || 0}
            </div>
            <div style={{ marginBottom: '8px' }}>
              <strong>Hours/Appointment:</strong> {monthData.hoursPerAppointment || 0}h
            </div>
            <div style={{ marginBottom: '8px' }}>
              <strong>OT Hours/Tech/Day:</strong> {monthData.otHoursPerTechPerDay || 0}h
            </div>
            <div style={{ marginBottom: '8px' }}>
              <strong>Team Off/Day:</strong> {monthData.teamMembersOffPerDay || 0}
            </div>
            <div>
              <strong>Avg Drive Time:</strong> {monthData.averageDriveTime || 0}h
            </div>
          </div>
        </div>

        {/* New Jobs Per Day */}
        <div className="card">
          <div className="card-header">
            <h3 style={{ fontSize: '14px' }}><i className="fas fa-calendar-plus"></i> New Jobs Per Day</h3>
          </div>
          <div className="card-body" style={{ padding: '12px' }}>
            {forecast && (
              <>
                <div style={{ marginBottom: '12px', padding: '10px', backgroundColor: 'var(--surface-secondary)', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Weekday</div>
                  <div style={{ fontSize: '20px', fontWeight: '600', color: 'var(--primary-color)' }}>
                    {formatNumber(forecast.newJobs.weekday, 1)}
                  </div>
                </div>
                <div style={{ marginBottom: '12px', padding: '10px', backgroundColor: 'var(--surface-secondary)', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Saturday</div>
                  <div style={{ fontSize: '20px', fontWeight: '600', color: 'var(--info-color)' }}>
                    {formatNumber(forecast.newJobs.saturday, 1)}
                  </div>
                </div>
                <div style={{ padding: '10px', backgroundColor: 'var(--surface-secondary)', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Sunday</div>
                  <div style={{ fontSize: '20px', fontWeight: '600', color: 'var(--success-color)' }}>
                    {formatNumber(forecast.newJobs.sunday, 1)}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MonthlyView;
