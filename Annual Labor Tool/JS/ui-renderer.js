class UIRenderer {
    constructor(app) {
        this.app = app;
        this.warehouseDashboardRendered = false; // Flag to prevent re-rendering
    }

    async buildNavigation(user) {
        const navContent = document.querySelector('.nav-content');
        if (!navContent || !user) return;

        // UPDATED: Renamed and reordered the navigation buttons
        const allNavButtons = [
            { tab: 'dashboard', icon: 'fa-dashboard', text: 'Dashboard' },
            { tab: 'slack_mentions', icon: 'fa-brands fa-slack', text: 'Slack' },
            { tab: 'forecasting', icon: 'fa-chart-line', text: 'Labor' },
            { tab: 'team', icon: 'fa-users', text: 'Team' },
            { tab: 'warehouse', icon: 'fa-warehouse', text: 'Warehouse' },
            { tab: 'calendar', icon: 'fa-calendar-alt', text: 'Schedule' },
            { tab: 'analyzer', icon: 'fa-search-dollar', text: 'Jobs' },
            { tab: 'install-dpt', icon: 'fa-wrench', text: '2nd Shift' },
            { tab: 'damages', icon: 'fa-house-damage', text: 'Damages' }
        ];

        const permissions = {
            'Manager': ['dashboard', 'forecasting', 'team', 'warehouse', 'calendar', 'analyzer', 'install-dpt', 'damages', 'slack_mentions'],
            'Supervisor': ['dashboard', 'team', 'warehouse', 'calendar', 'analyzer', 'damages', 'slack_mentions'],
            'MIT Lead': ['dashboard', 'team', 'warehouse', 'calendar', 'analyzer', 'damages', 'slack_mentions'],
            'Fleet': ['team', 'warehouse', 'calendar'],
            'Fleet Safety': ['team'],
            'Auditor': ['dashboard', 'forecasting', 'team', 'warehouse', 'calendar', 'analyzer']
        };

        let userPermissions = permissions[user.role] || [];
        
        const secondShiftLeadName = await this.app.firebaseService.getSecondShiftLeadName();
        const secondShiftLeadUsername = secondShiftLeadName ? `${secondShiftLeadName.toLowerCase().replace(' ', '.')}@entrusted.com` : '';
        if (user.email === secondShiftLeadUsername) {
            if (!userPermissions.includes('install-dpt')) {
                userPermissions.push('install-dpt');
            }
        }

        const authorizedButtons = allNavButtons.filter(button => userPermissions.includes(button.tab));

        navContent.innerHTML = authorizedButtons.map(btn => `
            <button class="nav-btn" data-tab="${btn.tab}">
                <i class="fas ${btn.icon}"></i><span>${btn.text}</span>
            </button>
        `).join('');

        this.applyRoleRestrictions();
    }

    applyRoleRestrictions() {
        if (!this.app.user) return;
        const userRole = this.app.user.role;
        const navContainer = document.querySelector('.nav-content');
        if (!navContainer) return;
        
        const currentPath = window.location.pathname;
        let activeTab = 'dashboard';
        if (currentPath.includes('labor-forecasting.html')) activeTab = 'forecasting';
        else if (currentPath.includes('team.html')) activeTab = 'team';
        else if (currentPath.includes('warehouse.html')) activeTab = 'warehouse';
        else if (currentPath.includes('calendar.html')) activeTab = 'calendar';
        else if (currentPath.includes('analyzer.html')) activeTab = 'analyzer';
        else if (currentPath.includes('install-dpt.html')) activeTab = 'install-dpt';
        else if (currentPath.includes('damages.html')) activeTab = 'damages';
        else if (currentPath.includes('slack_mentions.html')) activeTab = 'slack_mentions';
        
        const activeNavButton = navContainer.querySelector(`.nav-btn[data-tab="${activeTab}"]`);
        if (activeNavButton) {
            activeNavButton.classList.add('active');
        }
        
        if (userRole === 'Manager') {
            const adminBtn = document.getElementById('admin-panel-btn');
            if(adminBtn) adminBtn.style.display = 'inline-flex';
        }
    }

    showLoadingState(isLoading) {
        const appContainer = document.querySelector('.app-container');
        if (appContainer) {
            appContainer.classList.toggle('loading', isLoading);
        }
    }

    async renderDashboard() {
        this.startClock();
        const datePicker = document.getElementById('dashboardDate');
        if (!datePicker) return;
        datePicker.value = new Date().toISOString().split('T')[0];

        const renderDataForSelectedDate = async () => {
            const selectedDate = new Date(datePicker.value + 'T00:00:00');
            await this.renderDashboardMetrics(selectedDate);
            if (this.warehouseDashboardRendered) {
                await this.renderWarehouseDashboard(selectedDate);
            }
        };

        datePicker.addEventListener('change', renderDataForSelectedDate);
        await renderDataForSelectedDate();
    }

    async switchDashboardView(viewName) {
        document.querySelectorAll('.dashboard-view').forEach(v => v.style.display = 'none');
        document.querySelectorAll('#dashboard-tab .sub-nav-btn').forEach(b => b.classList.remove('active'));
        
        document.getElementById(`${viewName}-view`).style.display = 'block';
        document.querySelector(`.sub-nav-btn[data-view="${viewName}"]`).classList.add('active');
        
        if (viewName === 'warehouse-dashboard' && !this.warehouseDashboardRendered) {
            const selectedDate = new Date(document.getElementById('dashboardDate').value + 'T00:00:00');
            await this.renderWarehouseDashboard(selectedDate);
        }
    }
    
    async renderDashboardMetrics(date) {
        const user = this.app.user;
        if(user && user.email) {
            const welcomeUser = document.getElementById('welcome-user');
            if(welcomeUser) {
                 const displayName = user.email.split('@')[0].replace('.', ' ').replace(/\b\w/g, l => l.toUpperCase());
                welcomeUser.textContent = `Welcome, ${displayName}!`;
            }
        }

        this.displayYesterdaysSecondShiftReport(date);
        
        const techsOnRoute = await this.app.calculator.getTechsOnRouteToday(date);
        document.getElementById('techsOnRoute').textContent = techsOnRoute;
        const subTeams = await this.app.calculator.getSubTeamsToday(date);
        document.getElementById('subTeams').textContent = subTeams;

        this.displayTodaysJobStats(date);
        this.displayStaffingInfoToday(date);
        
        const dailyHoursData = await this.app.calculator.getDailyHoursData(date);
        this.app.chartRenderer.renderDailyHoursChart(dailyHoursData);
        document.getElementById('newJobsCapacity').textContent = dailyHoursData.potentialNewJobs;
        document.getElementById('inefficientDemoHours').textContent = dailyHoursData.inefficientDemoHours.toFixed(1);
    }

    async renderWarehouseDashboard(date) {
        // At a Glance WO Counts
        document.getElementById('warehouse-pending-fleet-wos').textContent = await this.app.fleetManager.getOutstandingWOCount();
        document.getElementById('warehouse-pending-equipment-wos').textContent = await this.app.equipmentManager.getOutstandingWOCount();

        const recentFleetWOs = await this.app.fleetManager.getRecentWorkOrders();
        document.getElementById('warehouse-recent-fleet-wos').textContent = recentFleetWOs.length;

        // Render Vehicle Lists
        const techIdToNameMap = new Map(this.app.teamManager.getAllTechnicians().map(tech => [tech.id, tech.name]));
        this.renderVehicleList('vehicles-in-repair-list', this.app.fleetManager.getVehiclesInRepair(), false, techIdToNameMap);
        this.renderVehicleList('unassigned-vehicles-list', this.app.fleetManager.getUnassignedVehicles(), false, techIdToNameMap);
        const availableVans = await this.app.fleetManager.getAvailableVehiclesFromOffTechnicians(date);
        this.renderVehicleList('available-tech-off-list', availableVans, true, techIdToNameMap);

        // Display yesterday's report
        const reportContainer = document.getElementById('warehouse-daily-report-summary');
        const yesterday = new Date(date);
        yesterday.setDate(yesterday.getDate() - 1);
        const dateString = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
        
        const report = await this.app.firebaseService.getSecondShiftReportByDate(dateString);
        const reportTitle = `Warehouse Report for ${yesterday.toLocaleDateString()}`;

        if (report) {
             const nuancesHtml = Array.isArray(report.nuances) ? report.nuances.map(j => `<li><strong>${j.jobName}:</strong> ${j.notes}</li>`).join('') : '';
            const cancelledHtml = Array.isArray(report.cancelledJobs) ? report.cancelledJobs.map(j => `<li><strong>${j.jobName}:</strong> ${j.notes}</li>`).join('') : '';
            const afterHoursHtml = Array.isArray(report.afterHoursJobs) ? report.afterHoursJobs.map(j => `<li><strong>${j.jobName}:</strong> ${j.reason} <em>(Who: ${j.who})</em></li>`).join('') : '';

            reportContainer.innerHTML = `
                <div class="card second-shift-summary">
                    <div class="card-header">
                        <h3><i class="fas fa-clipboard-list"></i> ${reportTitle}</h3>
                        <span>By: ${report.submittedBy}</span>
                    </div>
                    <div class="summary-grid">
                        <div><h4>Jobs to Know About</h4><ul>${nuancesHtml || '<li>None</li>'}</ul></div>
                        <div><h4>Cancelled/Rescheduled</h4><ul>${cancelledHtml || '<li>None</li>'}</ul></div>
                        <div><h4>After Hours Jobs</h4><ul>${afterHoursHtml || '<li>None</li>'}</ul></div>
                        <div><h4>Tech Shoutouts</h4><p>${report.techShoutouts || 'None'}</p></div>
                        <div><h4>Tech Concerns</h4><p>${report.techConcerns || 'None'}</p></div>
                        <div><h4>Dept. Shoutouts</h4><p>${report.deptShoutouts || 'None'}</p></div>
                        <div><h4>Dept. Concerns</h4><p>${report.deptConcerns || 'None'}</p></div>
                    </div>
                </div>`;
        } else {
             reportContainer.innerHTML = `
                <div class="card second-shift-summary">
                    <div class="card-header">
                        <h3><i class="fas fa-clipboard-list"></i> ${reportTitle}</h3>
                    </div>
                    <p class="no-entries">No report was submitted for this day.</p>
                </div>
            `;
        }
        this.warehouseDashboardRendered = true;
    }

    renderVehicleList(containerId, vehicleArray, showAssignedTech = false, techIdToNameMap) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (!vehicleArray || vehicleArray.length === 0) {
            container.innerHTML = '<p class="no-entries">No vehicles to display.</p>';
            return;
        }

        container.innerHTML = vehicleArray.map(vehicle => {
            let detail = vehicle.status || 'N/A';
            if (showAssignedTech) {
                const techName = techIdToNameMap.get(vehicle.assignedTo) || vehicle.assignedTo;
                detail = `Tech Off: ${techName}`;
            }

            return `
                <div class="vehicle-list-item">
                    <span class="name">${vehicle.truckNumber || 'N/A'}</span>
                    <span class="detail">${detail}</span>
                </div>
            `;
        }).join('');
    }
    
    async displayTodaysJobStats(date) {
        const container = document.getElementById('todays-stats-content');
        if (!container) return;
    
        const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const stats = await this.app.firebaseService.getDailyStats(dateString);
    
        if (!stats) {
            container.innerHTML = `<p class="no-entries">No job data has been saved for this day.</p>`;
            return;
        }
    
        const totalJobsCombined = (stats.totalJobs || 0) + (stats.sameDayInstallCount || 0);
    
        container.innerHTML = `
            <div class="stats-grid">
                <div class="stat-item">
                    <span class="stat-label">Total Tech Hours</span>
                    <span class="stat-value">${stats.totalTechHours || 0} <small>(B: ${stats.totalLaborHours || 0} + DT: ${stats.dtLaborHours || 0})</small></span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Total Jobs</span>
                    <span class="stat-value">${totalJobsCombined} <small>(P: ${stats.totalJobs || 0} + SD: ${stats.sameDayInstallCount || 0})</small></span>
                </div>
            </div>
            <div class="breakdown-grid">
                <div class="breakdown-section">
                    <h4>Job Types</h4>
                    <ul class="breakdown-list">
                        ${Object.entries(stats.jobTypeCounts || {}).map(([type, count]) => `
                        <li class="breakdown-item">
                            <span class="breakdown-label">${type.charAt(0).toUpperCase() + type.slice(1)}</span>
                            <span class="breakdown-value">${count}</span>
                        </li>`).join('')}
                    </ul>
                </div>
                <div class="breakdown-section">
                    <h4>Time Frames</h4>
                    <ul class="breakdown-list">
                         <li class="breakdown-item"><span class="breakdown-label">9-12</span><span class="breakdown-value">${(stats.timeFrameCounts && stats.timeFrameCounts['9-12']) ? stats.timeFrameCounts['9-12'] : 0}</span></li>
                         <li class="breakdown-item"><span class="breakdown-label">9-4</span><span class="breakdown-value">${(stats.timeFrameCounts && stats.timeFrameCounts['9-4']) ? stats.timeFrameCounts['9-4'] : 0}</span></li>
                         <li class="breakdown-item"><span class="breakdown-label">12-4</span><span class="breakdown-value">${(stats.timeFrameCounts && stats.timeFrameCounts['12-4']) ? stats.timeFrameCounts['12-4'] : 0}</span></li>
                         <li class="breakdown-item"><span class="breakdown-label">Other</span><span class="breakdown-value">${(stats.timeFrameCounts && stats.timeFrameCounts.other) ? stats.timeFrameCounts.other : 0}</span></li>
                    </ul>
                </div>
            </div>
        `;
    }

    async displayStaffingInfoToday(date) {
        const card = document.getElementById('staffing-info-card');
        const container = document.getElementById('staffing-info-list');
        const notesContainer = document.getElementById('daily-notes-container');
        if (!card || !container || !notesContainer) return;
    
        const dayOfWeek = date.getDay();
        const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    
        const monthlySchedules = await this.app.firebaseService.getScheduleDataForMonth(date.getFullYear(), date.getMonth());
        const schedule = await this.app.calendarManager.getCalculatedScheduleForDay(date, monthlySchedules);
    
        const syncButtonHtml = this.app.user.role === 'Manager'
            ? `<button id="dashboardSyncBtn" class="btn btn-secondary btn-small"><i class="fas fa-sync"></i> Sync Rippling</button>`
            : '';

        card.querySelector('.card-header').innerHTML = `
            <h3><i class="fas fa-info-circle"></i> Staffing Info & Notes</h3>
            ${syncButtonHtml}
        `;

        if (schedule.notes) {
            notesContainer.innerHTML = `<div class="dashboard-notes"><strong>Notes for this day:</strong> ${schedule.notes}</div>`;
        } else {
            notesContainer.innerHTML = '';
        }
    
        const offStatuses = ['off', 'sick', 'vacation', 'no-call-no-show'];
        let staffToShow;
        let message;
    
        if (isWeekend) {
            staffToShow = schedule.staff.filter(s => s.status === 'on' || s.hours);
            message = '<p class="no-entries">No staff scheduled to work.</p>';
        } else {
            staffToShow = schedule.staff.filter(s => offStatuses.includes(s.status) || s.hours);
            message = '<p class="no-entries">Everyone is scheduled for a normal workday.</p>';
        }
    
        if (staffToShow.length === 0) {
            container.innerHTML = message;
        } else {
            container.innerHTML = staffToShow.map(staff => {
                const statusText = staff.hours ? staff.hours : staff.status.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                return `
                    <div class="staff-off-item status-${staff.status}">
                        <span class="staff-name">${staff.name}</span>
                        <span class="staff-status-badge">${statusText}</span>
                    </div>
                `;
            }).join('');
        }

        const syncButton = document.getElementById('dashboardSyncBtn');
        if (syncButton) {
            syncButton.addEventListener('click', async () => {
                const selectedDate = new Date(document.getElementById('dashboardDate').value + 'T00:00:00');
                syncButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                syncButton.disabled = true;
                await this.app.calendarManager.syncRipplingForDay(selectedDate);
                syncButton.innerHTML = '<i class="fas fa-sync"></i> Sync Rippling';
                syncButton.disabled = false;
                await this.displayStaffingInfoToday(selectedDate);
            });
        }
    }

    async displayYesterdaysSecondShiftReport(date) {
        const container = document.getElementById('second-shift-summary-container');
        if (!container) return;

        const yesterday = new Date(date);
        yesterday.setDate(yesterday.getDate() - 1);
        const dateString = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

        const report = await this.app.firebaseService.getSecondShiftReportByDate(dateString);
        const reportTitle = `Second Shift Summary for ${yesterday.toLocaleDateString()}`;

        if (report) {
            const nuancesHtml = Array.isArray(report.nuances) ? report.nuances.map(j => `<li><strong>${j.jobName}:</strong> ${j.notes}</li>`).join('') : '';
            const cancelledHtml = Array.isArray(report.cancelledJobs) ? report.cancelledJobs.map(j => `<li><strong>${j.jobName}:</strong> ${j.notes}</li>`).join('') : '';
            const afterHoursHtml = Array.isArray(report.afterHoursJobs) ? report.afterHoursJobs.map(j => `<li><strong>${j.jobName}:</strong> ${j.reason} <em>(Who: ${j.who})</em></li>`).join('') : '';

            container.innerHTML = `
                <div class="card second-shift-summary">
                    <div class="card-header">
                        <h3><i class="fas fa-moon"></i> ${reportTitle}</h3>
                        <span>By: ${report.submittedBy}</span>
                    </div>
                    <div class="summary-grid">
                        <div><h4>Jobs to Know About</h4><ul>${nuancesHtml || '<li>None</li>'}</ul></div>
                        <div><h4>Cancelled/Rescheduled</h4><ul>${cancelledHtml || '<li>None</li>'}</ul></div>
                        <div><h4>After Hours Jobs</h4><ul>${afterHoursHtml || '<li>None</li>'}</ul></div>
                        <div><h4>Tech Shoutouts</h4><p>${report.techShoutouts || 'None'}</p></div>
                        <div><h4>Tech Concerns</h4><p>${report.techConcerns || 'None'}</p></div>
                        <div><h4>Dept. Shoutouts</h4><p>${report.deptShoutouts || 'None'}</p></div>
                        <div><h4>Dept. Concerns</h4><p>${report.deptConcerns || 'None'}</p></div>
                    </div>
                </div>`;
        } else {
             container.innerHTML = `
                <div class="card second-shift-summary">
                    <div class="card-header">
                        <h3><i class="fas fa-moon"></i> ${reportTitle}</h3>
                    </div>
                    <p class="no-entries">No report was submitted.</p>
                </div>
            `;
        }
    }

    startClock() {
        const dateTimeEl = document.getElementById('current-datetime');
        if (!dateTimeEl) return;
        const updateTime = () => {
            const now = new Date();
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
            dateTimeEl.textContent = now.toLocaleDateString('en-US', options);
        };
        updateTime();
        setInterval(updateTime, 1000 * 60);
    }

    initializeForecastingPage() {
        this.populateYearSelector();
        this.populateMonthSelectors();
        this.setupForecastingEventListeners();
        this.renderAnnualView();
    }
    
    setupForecastingEventListeners() {
        document.querySelectorAll('.sub-nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchForecastingView(e.currentTarget.dataset.view);
            });
        });

        document.getElementById('yearSelector').addEventListener('change', async (e) => {
            this.app.currentYear = parseInt(e.target.value);
            await this.app.dataManager.loadAllData();
            this.renderActiveForecastingView();
        });

        document.getElementById('monthSelector').addEventListener('change', (e) => {
            this.app.currentMonth = parseInt(e.target.value);
            this.renderMonthlyView();
        });
        
         document.getElementById('inputsMonthSelector').addEventListener('change', (e) => {
            this.app.currentMonth = parseInt(e.target.value);
            this.renderInputsView();
        });
    }
    
    switchForecastingView(viewName) {
        document.querySelectorAll('.forecasting-view').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.sub-nav-btn').forEach(b => b.classList.remove('active'));
        
        document.getElementById(`${viewName}-view`).classList.add('active');
        document.querySelector(`.sub-nav-btn[data-view="${viewName}"]`).classList.add('active');
        
        this.renderActiveForecastingView();
    }

    async renderActiveForecastingView() {
        const activeView = document.querySelector('.forecasting-view.active');
        if (!activeView) return;

        const viewId = activeView.id;
        if (viewId === 'annual-view') this.renderAnnualView();
        else if (viewId === 'monthly-view') await this.renderMonthlyView();
        else if (viewId === 'inputs-view') this.renderInputsView();
    }

    renderAnnualView() {
        this.app.chartRenderer.renderAnnualStaffingChart();
        this.renderAnnualSummaryTable();
    }

    renderAnnualSummaryTable() {
        const table = document.getElementById('annualSummaryTable');
        if (!table) return;
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Month</th><th>WTR Jobs</th><th>Staff Need</th><th>Delta</th>
                    <th>MIT Tech Cost</th><th>Fixed Cost</th><th>Total Labor</th><th>Cost/Job</th>
                </tr>
            </thead>
            <tbody>
            ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month, i) => {
                const data = this.app.monthlyData[i] || {};
                return `
                    <tr>
                        <td><strong>${month}</strong></td>
                        <td>${Math.round(data.projectedWTRJobs || 0)}</td>
                        <td>${data.staffingNeed || 0}</td>
                        <td class="${(data.staffingDelta || 0) < 0 ? 'text-danger' : 'text-success'}">${data.staffingDelta || 0}</td>
                        <td>$${Math.round(data.mitTechLaborCost || 0).toLocaleString()}</td>
                        <td>$${Math.round(data.fixedLaborCost || 0).toLocaleString()}</td>
                        <td>$${Math.round(data.totalLaborSpend || 0).toLocaleString()}</td>
                        <td>$${Math.round(data.costPerWTRJob || 0).toLocaleString()}</td>
                    </tr>
                `;
            }).join('')}
            </tbody>
        `;
    }

    async renderMonthlyView() {
        const forecastData = await this.app.calculator.calculateMonthlyForecast(this.app.currentMonth, this.app.currentYear);
        this.app.chartRenderer.renderMonthlyForecastChart(forecastData);
        this.renderStaffingAlerts();
        this.renderMonthlyInputsSummary();
        
        const { newJobs } = forecastData;
        const container = document.getElementById('newJobsContainer');
        if (container) {
            container.innerHTML = `
                <div class="stat"><span class="stat-value">${(newJobs.weekday || 0).toFixed(1)}</span><span class="stat-label">Weekday</span></div>
                <div class="stat"><span class="stat-value">${(newJobs.saturday || 0).toFixed(1)}</span><span class="stat-label">Saturday</span></div>
                <div class="stat"><span class="stat-value">${(newJobs.sunday || 0).toFixed(1)}</span><span class="stat-label">Sunday</span></div>
            `;
        }
    }

    async handleSummaryInputChange(field, isPercentage = false) {
        const input = document.getElementById(`summary-${field}`);
        if (!input) return;
    
        let value = parseFloat(input.value);
        if (isNaN(value)) value = 0;
        if (isPercentage) value = value / 100;
    
        this.app.monthlyData[this.app.currentMonth][field] = value;
    
        this.app.calculator.calculateAllMonths();
    
        await this.app.firebaseService.saveMonthlyData(this.app.currentYear, this.app.currentMonth + 1, this.app.monthlyData[this.app.currentMonth]);
    
        this.renderMonthlyView();
        this.renderAnnualView();
    }
    
    renderMonthlyInputsSummary() {
        const container = document.getElementById('monthlyInputsSummaryContainer');
        if (!container) return;
    
        const data = this.app.monthlyData[this.app.currentMonth] || {};
        const salesPercentage = ((data.wtrInsClosingRate || 0) + (data.wtrCashClosingRate || 0)) * 100;
    
        container.innerHTML = `
            <div class="summary-grid">
                <div class="form-group summary-group">
                    <label for="summary-leadsTarget">Lead Goal</label>
                    <input type="number" id="summary-leadsTarget" class="form-input summary-input" value="${data.leadsTarget || 0}" onchange="laborTool.uiRenderer.handleSummaryInputChange('leadsTarget')">
                </div>
                <div class="form-group summary-group">
                    <label for="summary-leadsPercentGoal">Lead % of Goal</label>
                    <input type="number" id="summary-leadsPercentGoal" class="form-input summary-input" value="${((data.leadsPercentGoal || 0) * 100).toFixed(1)}" onchange="laborTool.uiRenderer.handleSummaryInputChange('leadsPercentGoal', true)">
                </div>
                <div class="form-group summary-group">
                    <label for="summary-wtrInsClosingRate">WTR Ins Closing %</label>
                    <input type="number" id="summary-wtrInsClosingRate" class="form-input summary-input" value="${((data.wtrInsClosingRate || 0) * 100).toFixed(1)}" onchange="laborTool.uiRenderer.handleSummaryInputChange('wtrInsClosingRate', true)">
                </div>
                 <div class="form-group summary-group">
                    <label for="summary-wtrCashClosingRate">WTR Cash Closing %</label>
                    <input type="number" id="summary-wtrCashClosingRate" class="form-input summary-input" value="${((data.wtrCashClosingRate || 0) * 100).toFixed(1)}" onchange="laborTool.uiRenderer.handleSummaryInputChange('wtrCashClosingRate', true)">
                </div>
                <div class="form-group summary-group calculated">
                    <label>Total Sales Closing %</label>
                    <div class="calculated-value summary-calculated">${salesPercentage.toFixed(1)}%</div>
                </div>
                <div class="form-group summary-group">
                    <label for="summary-otHoursPerTechPerDay">OT Hrs / Day / Tech</label>
                    <input type="number" step="0.5" id="summary-otHoursPerTechPerDay" class="form-input summary-input" value="${data.otHoursPerTechPerDay || 0}" onchange="laborTool.uiRenderer.handleSummaryInputChange('otHoursPerTechPerDay')">
                </div>
                <div class="form-group summary-group calculated">
                    <label>Projected WTR Jobs</label>
                    <div class="calculated-value summary-calculated">${Math.round(data.projectedWTRJobs || 0)}</div>
                </div>
                <div class="form-group summary-group calculated">
                    <label>Active Jobs / Day</label>
                    <div class="calculated-value summary-calculated">${(data.activeJobsPerDay || 0).toFixed(1)}</div>
                </div>
            </div>
        `;
    }
    
    renderInputsView() {
        const data = this.app.monthlyData[this.app.currentMonth] || this.app.dataManager.getDefaultMonthlyData(this.app.currentMonth);
        const container = document.getElementById('inputs-container');
        if (!container) return;
        
        container.innerHTML = `
            <div class="card control-panel-card">
                <div class="control-panel-grid">
                    <div class="control-panel-section">
                        <h4><i class="fas fa-bullhorn"></i> Marketing</h4>
                        <div class="form-group"><label>Days in Month</label><input type="number" id="daysInMonth" class="form-input" value="${data.daysInMonth || 0}"></div>
                        <div class="form-group"><label>Leads % of Goal</label><input type="number" id="leadsPercentGoal" class="form-input" step="0.01" value="${data.leadsPercentGoal || 0}"></div>
                        <div class="form-group"><label>2025 Leads (Target)</label><input type="number" id="leadsTarget" class="form-input" value="${data.leadsTarget || 0}"></div>
                        <div class="form-group calculated"><label>Actual Leads</label><div class="calculated-value" id="actualLeads">${Math.round(data.actualLeads) || 0}</div></div>
                    </div>
                    <div class="control-panel-section">
                        <h4><i class="fas fa-handshake"></i> Sales</h4>
                        <div class="form-group"><label>Booking Rate</label><input type="number" id="bookingRate" class="form-input" step="0.01" value="${data.bookingRate || 0}"></div>
                        <div class="form-group calculated"><label>Sales Ops</label><div class="calculated-value" id="salesOps">${Math.round(data.salesOps) || 0}</div></div>
                        <div class="form-group"><label>WTR Ins Closing Rate</label><input type="number" id="wtrInsClosingRate" class="form-input" step="0.01" value="${data.wtrInsClosingRate || 0}"></div>
                        <div class="form-group"><label>WTR Cash Closing Rate</label><input type="number" id="wtrCashClosingRate" class="form-input" step="0.01" value="${data.wtrCashClosingRate || 0}"></div>
                        <div class="form-group calculated"><label>Projected WTR Jobs</label><div class="calculated-value" id="projectedWTRJobs">${Math.round(data.projectedWTRJobs) || 0}</div></div>
                    </div>
                    <div class="control-panel-section">
                        <h4><i class="fas fa-cogs"></i> Operations</h4>
                        <div class="form-group"><label>Mit Avg Days Onsite</label><input type="number" id="mitAvgDaysOnsite" class="form-input" step="0.1" value="${data.mitAvgDaysOnsite || 0}"></div>
                        <div class="form-group"><label>Hours per Appointment</label><input type="number" id="hoursPerAppointment" class="form-input" value="${data.hoursPerAppointment || 0}"></div>
                        <div class="form-group calculated"><label>Active Jobs per Day</label><div class="calculated-value" id="activeJobsPerDay">${(data.activeJobsPerDay || 0).toFixed(1)}</div></div>
                        <div class="form-group calculated"><label>Hours Needed per Day</label><div class="calculated-value" id="hoursNeededPerDay">${(data.hoursNeededPerDay || 0).toFixed(1)}</div></div>
                    </div>
                    <div class="control-panel-section">
                        <h4><i class="fas fa-users"></i> Staffing</h4>
                        <div class="form-group"><label>Average Drive Time (Hours)</label><input type="number" id="averageDriveTime" class="form-input" step="0.25" value="${data.averageDriveTime || 0}"></div>
                        <div class="form-group"><label>OT Hours per Tech per Day</label><input type="number" id="otHoursPerTechPerDay" class="form-input" step="0.5" value="${data.otHoursPerTechPerDay || 0}"></div>
                        <div class="form-group"><label>Team Members Off per Day</label><input type="number" id="teamMembersOffPerDay" class="form-input" value="${data.teamMembersOffPerDay || 0}"></div>
                        <div class="form-group calculated"><label>Techs + Foreman Needed</label><div class="calculated-value" id="techsForemenNeeded">${data.techsForemenNeeded || 0}</div></div>
                        <div class="form-group calculated"><label>Staffing Need</label><div class="calculated-value" id="staffingNeed">${data.staffingNeed || 0}</div></div>
                        <div class="form-group calculated highlight"><label>Delta</label><div class="calculated-value" id="staffingDelta">${data.staffingDelta || 0}</div></div>
                    </div>
                </div>
            </div>
        `;
        
        container.querySelectorAll('.form-input').forEach(input => {
            input.addEventListener('change', () => this.app.dataManager.updateMonthlyDataFromInputs());
        });
    }

    populateYearSelector() {
        const selector = document.getElementById('yearSelector');
        if (!selector) return;
        const currentYr = new Date().getFullYear();
        let options = '';
        for (let i = currentYr - 2; i <= currentYr + 3; i++) {
            options += `<option value="${i}" ${i === this.app.currentYear ? 'selected' : ''}>${i}</option>`;
        }
        selector.innerHTML = options;
    }

    populateMonthSelectors() {
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        let options = '';
        months.forEach((month, i) => {
            options += `<option value="${i}" ${i === this.app.currentMonth ? 'selected' : ''}>${month}</option>`;
        });
        const monthSelector = document.getElementById('monthSelector');
        const inputsMonthSelector = document.getElementById('inputsMonthSelector');
        if (monthSelector) monthSelector.innerHTML = options;
        if (inputsMonthSelector) inputsMonthSelector.innerHTML = options;
    }
    
    renderStaffingAlerts() {
        const container = document.getElementById('chartStaffingAlerts');
        if (!container) return;
        const alerts = [];
        const data = this.app.monthlyData[this.app.currentMonth] || {};
        const delta = data.staffingDelta || 0;
        if (delta < -2) alerts.push({ type: 'danger', icon: 'fas fa-exclamation-triangle', message: `Understaffed by ${Math.abs(delta)}` });
        else if (delta < 0) alerts.push({ type: 'warning', icon: 'fas fa-exclamation-circle', message: `Understaffed by ${Math.abs(delta)}` });
        
        if (alerts.length === 0) {
            container.innerHTML = `<div class="staffing-alert text-success"><i class="fas fa-check-circle"></i> Adequately Staffed</div>`;
        } else {
            container.innerHTML = alerts.map(alert => `<div class="staffing-alert text-${alert.type}"><i class="${alert.icon}"></i> ${alert.message}</div>`).join('');
        }
    }
}