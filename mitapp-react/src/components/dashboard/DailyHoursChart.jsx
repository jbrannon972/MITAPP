import { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';

// Register Chart.js components
Chart.register(...registerables);

const DailyHoursChart = ({ dailyHoursData }) => {
  const chartRef = useRef(null);
  const chartInstanceRef = useRef(null);

  useEffect(() => {
    if (!dailyHoursData || !chartRef.current) return;

    const ctx = chartRef.current.getContext('2d');

    // Destroy existing chart instance
    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    // Create new chart
    chartInstanceRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['MIT Hours', 'Demo Hours'],
        datasets: [{
          label: 'Hours Available',
          data: [
            dailyHoursData.totalMitHours || 0,
            dailyHoursData.totalDemoHours || 0
          ],
          backgroundColor: [
            'rgba(248, 123, 77, 0.8)',  // Entrusted Orange for MIT
            'rgba(52, 152, 219, 0.8)'   // Blue for Demo
          ],
          borderColor: [
            'rgba(248, 123, 77, 1)',
            'rgba(52, 152, 219, 1)'
          ],
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
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.dataset.label || '';
                const value = context.parsed.y || 0;
                return `${label}: ${value.toFixed(1)} hours`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return value + 'h';
              }
            },
            grid: {
              color: 'rgba(0, 0, 0, 0.05)'
            }
          },
          x: {
            grid: {
              display: false
            }
          }
        }
      }
    });

    // Cleanup
    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
    };
  }, [dailyHoursData]);

  if (!dailyHoursData) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
        <p>No data available</p>
      </div>
    );
  }

  return (
    <div className="chart-wrapper" style={{ position: 'relative', height: '250px', width: '100%' }}>
      <canvas ref={chartRef}></canvas>
      <div style={{ marginTop: '12px', fontSize: '14px', color: '#666', textAlign: 'center' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '8px' }}>
          <div>
            <strong>{dailyHoursData.mitTechsWorking || 0}</strong> MIT Techs Working
          </div>
          <div>
            <strong>{dailyHoursData.demoTechsWorking || 0}</strong> Demo Techs Working
          </div>
        </div>
      </div>
    </div>
  );
};

export default DailyHoursChart;
