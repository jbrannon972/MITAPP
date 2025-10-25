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

    // Extract data for the chart
    const requestedBaseHours = dailyHoursData.totalLaborHours || 0;
    const requestedDtHours = dailyHoursData.dtHours || 0;
    const availableBaseHours = dailyHoursData.hoursAvailable || 0;
    const availableDtHours = dailyHoursData.dtHoursAvailable || 0;
    const subHours = dailyHoursData.subHours || 0;
    const availableHoursGoal = dailyHoursData.availableHoursGoal || 0;

    // Create datasets
    const datasets = [
      {
        label: 'Base Hours',
        data: [requestedBaseHours, availableBaseHours],
        backgroundColor: ['rgba(59, 130, 246, 0.6)', 'rgba(59, 130, 246, 1)'],
        borderColor: ['rgba(59, 130, 246, 0.8)', 'rgba(59, 130, 246, 1)'],
        borderWidth: 1,
        stack: 'stack0',
        order: 3
      },
      {
        label: 'DT Hours',
        data: [requestedDtHours, availableDtHours],
        backgroundColor: ['rgba(239, 68, 68, 0.6)', 'rgba(239, 68, 68, 1)'],
        borderColor: ['rgba(239, 68, 68, 0.8)', 'rgba(239, 68, 68, 1)'],
        borderWidth: 1,
        stack: 'stack0',
        order: 2
      },
      {
        label: 'Sub Hours',
        data: [0, subHours],
        backgroundColor: ['rgba(16, 185, 129, 0)', 'rgba(16, 185, 129, 0.8)'],
        borderColor: ['rgba(16, 185, 129, 0)', 'rgba(16, 185, 129, 1)'],
        borderWidth: 1,
        stack: 'stack0',
        order: 3
      }
    ];

    // Add goal line if available
    if (availableHoursGoal > 0) {
      datasets.push({
        label: 'Available Hours Goal',
        data: [availableHoursGoal, availableHoursGoal],
        type: 'line',
        borderColor: '#f87b4d',
        borderWidth: 2,
        borderDash: [5, 5],
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 5,
        order: 1
      });
    }

    // Create new chart
    chartInstanceRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Requested', 'Available'],
        datasets: datasets
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
            position: 'bottom',
            labels: {
              usePointStyle: true,
              padding: 10,
              font: {
                size: 11
              }
            }
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
            stacked: true,
            ticks: {
              callback: function(value) {
                return value + 'h';
              },
              font: {
                size: 11
              }
            },
            grid: {
              color: 'rgba(0, 0, 0, 0.05)'
            }
          },
          x: {
            stacked: true,
            grid: {
              display: false
            },
            ticks: {
              font: {
                size: 12,
                weight: 'bold'
              }
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
    <div className="chart-wrapper" style={{ position: 'relative', height: '300px', width: '100%' }}>
      <canvas ref={chartRef}></canvas>
    </div>
  );
};

export default DailyHoursChart;
