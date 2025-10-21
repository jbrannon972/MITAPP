class ChartRenderer {
    constructor(app) {
        this.app = app;
    }

    renderAnnualStaffingChart() {
        const ctx = document.getElementById('annualStaffingChart');
        if (!ctx) return;
        
        if (this.app.charts.annualStaffing) {
            this.app.charts.annualStaffing.destroy();
        }

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const staffingNeed = [];
        const currentStaffing = [];

        for (let i = 0; i < 12; i++) {
            const data = this.app.monthlyData[i] || {};
            staffingNeed.push(data.staffingNeed || 0);
            currentStaffing.push(data.currentStaffingLevel || 0);
        }

        this.app.charts.annualStaffing = new Chart(ctx, {
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
                        text: `${this.app.currentYear} Staffing Requirements vs Current MIT Techs`
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
    }
    
    renderDailyHoursChart(data, canvasId = 'dailyHoursChart') {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
    
        if (this.app.charts[canvasId]) {
            this.app.charts[canvasId].destroy();
        }
    
        const requestedBaseHours = data.totalLaborHours || 0;
        const requestedDtHours = data.dtHours || 0;
        const availableBaseHours = data.hoursAvailable || 0;
        const availableDtHours = data.dtHoursAvailable || 0;
        const subHours = data.subHours || 0;
        
        // --- MODIFICATION START: Get the available hours goal from the data. ---
        const availableHoursGoal = data.availableHoursGoal || 0;
        // --- MODIFICATION END ---
    
        const datasets = [
            {
                label: 'Base Hours',
                data: [requestedBaseHours, availableBaseHours],
                backgroundColor: [
                    'rgba(59, 130, 246, 0.6)', // Requested Base (Opaque)
                    'rgba(59, 130, 246, 1)'   // Available Base (Solid)
                ],
                stack: 'stack0',
                order: 2 // Ensure bars are rendered behind the line
            },
            {
                label: 'DT Hours',
                data: [requestedDtHours, availableDtHours],
                backgroundColor: [
                    'rgba(239, 68, 68, 0.6)', // Requested DT (Opaque)
                    'rgba(239, 68, 68, 1)'    // Available DT (Solid)
                ],
                stack: 'stack0',
                order: 2
            }
        ];
        
        if (canvasId === 'dailyHoursChart' && subHours > 0) {
            datasets.push({
                label: 'Sub Hours',
                data: [0, subHours],
                backgroundColor: 'rgba(22, 163, 74, 0.8)', 
                stack: 'stack0',
                order: 2
            });
        }
        
        // --- MODIFICATION START: Add the new dataset for the goal line. ---
        if (canvasId === 'dailyHoursChart' && availableHoursGoal > 0) {
            datasets.push({
                label: 'Available Hours Goal',
                data: [availableHoursGoal, availableHoursGoal], // The line spans across the chart at the goal value.
                type: 'line', // Specify this dataset as a line chart.
                borderColor: '#f87b4d', // Orange color for the line.
                borderWidth: 2,
                borderDash: [5, 5], // This creates the dotted line effect.
                fill: false,
                pointRadius: 0, // No points on the line.
                order: 1 // Ensure the line is rendered on top of the bars.
            });
        }
        // --- MODIFICATION END ---

        this.app.charts[canvasId] = new Chart(ctx, {
            // --- MODIFICATION: The chart type is now defined at the dataset level for a mixed chart. ---
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
                    intersect: false,
                },
                plugins: {
                    title: { 
                        display: false 
                    },
                    legend: {
                        display: canvasId.includes('analyzer'), 
                        position: 'bottom',
                        labels: {
                            boxWidth: 12,
                            font: { size: 10 }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                // --- MODIFICATION: Do not show tooltip for the goal line. ---
                                if (context.dataset.type === 'line') {
                                    return `${context.dataset.label}: ${context.raw.toFixed(2)}`;
                                }
                                return ` ${context.dataset.label}: ${context.raw.toFixed(2)}`;
                            },
                            footer: function(tooltipItems) {
                                let total = tooltipItems
                                    .filter(item => item.dataset.type !== 'line') // --- MODIFICATION: Exclude goal line from total calculation. ---
                                    .reduce((sum, item) => sum + item.raw, 0);
                                return `Total Hrs: ${total.toFixed(2)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        stacked: true,
                        title: { display: false }
                    },
                    x: {
                        stacked: true,
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
    }


    renderMonthlyForecastChart(forecastData) {
        const ctx = document.getElementById('monthlyForecastChart');
        if (!ctx) return;

        const { dailyRoutesNeeded, actualStaffing } = forecastData;

        if (this.app.charts.monthlyForecast) {
            this.app.charts.monthlyForecast.destroy();
        }

        const daysInMonth = new Date(this.app.currentYear, this.app.currentMonth + 1, 0).getDate();
        const labels = Array.from({ length: daysInMonth }, (_, i) => i + 1);

        this.app.charts.monthlyForecast = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Routes Needed',
                        data: dailyRoutesNeeded,
                        backgroundColor: 'rgba(239, 68, 68, 0.8)'
                    },
                    {
                        label: 'Actual Staffing',
                        data: actualStaffing,
                        backgroundColor: 'rgba(59, 130, 246, 0.8)'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index',
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Daily Routes Needed vs. Actual Staffing'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += context.parsed.y.toFixed(2);
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Number of Routes / Staff'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Day of the Month'
                        }
                    }
                }
            }
        });
    }

    async renderTeamPerformanceChart() {
        const ctx = document.getElementById('teamPerformanceChart');
        if (!ctx) return;

        const { labels, avgDriverScores, avgEvalScores } = await this.app.calculator.getMonthlyAverages();

        if (this.app.charts.teamPerformance) {
            this.app.charts.teamPerformance.destroy();
        }

        this.app.charts.teamPerformance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Avg. Driver Score Rate',
                        data: avgDriverScores,
                        borderColor: '#ef4444',
                        yAxisID: 'yDriver',
                        tension: 0.1
                    },
                    {
                        label: 'Avg. Evaluation Score',
                        data: avgEvalScores,
                        borderColor: '#3b82f6',
                        yAxisID: 'yEval',
                        tension: 0.1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    yDriver: {
                        type: 'linear',
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Driver Score Rate'
                        }
                    },
                    yEval: {
                        type: 'linear',
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Evaluation Score (1-5)'
                        },
                        min: 1,
                        max: 5
                    }
                }
            }
        });
    }
}