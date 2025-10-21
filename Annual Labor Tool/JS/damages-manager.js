class DamagesManager {
    constructor(app) {
        this.app = app;
        this.db = app.firebaseService.db;
        this.damageReports = [];
        this.allTechnicians = [];
        this.damageCharts = {};
    }

    async initialize() {
        if (document.getElementById('damages-tab')) {
            await this.loadInitialData();
            this.setDefaultDates();
            this.renderDashboard();
            this.populateFilters();
            this.setupEventListeners();
            this.applyFilters();
        }
    }

    async loadInitialData() {
        [this.damageReports, this.allTechnicians] = await Promise.all([
            this.app.firebaseService.loadDamageReports(),
            this.app.firebaseService.getAllTechnicians()
        ]);
    }

    setDefaultDates() {
        const startDateInput = document.getElementById('stats-start-date');
        const endDateInput = document.getElementById('stats-end-date');
        if (!startDateInput || !endDateInput) return;

        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);

        startDateInput.value = firstDay.toISOString().split('T')[0];
        endDateInput.value = now.toISOString().split('T')[0];
    }

    setupEventListeners() {
        const container = document.getElementById('damages-tab');
        if (!container) return;

        container.addEventListener('click', (event) => {
            const button = event.target.closest('button');
            if (!button) return;

            if (button.classList.contains('view-damage-btn')) {
                const reportId = button.closest('.damage-report-card').dataset.reportId;
                this.openDamageReportModal(reportId);
            } else if (button.dataset.view) { // For main Damages/Stats tabs
                this.switchMainView(button.dataset.view);
            }
        });

        const filters = ['damage-search', 'damage-zone-filter', 'damage-tech-filter', 'damage-start-date', 'damage-end-date', 'damage-status-filter'];
        filters.forEach(id => {
            const el = document.getElementById(id);
            el?.addEventListener('input', () => this.applyFilters());
        });

        const statsDateFilters = ['stats-start-date', 'stats-end-date'];
        statsDateFilters.forEach(id => {
            const el = document.getElementById(id);
            el?.addEventListener('input', () => this.renderDashboard());
        });
    }
    
    switchMainView(viewId) {
        document.querySelectorAll('.damages-view').forEach(view => view.style.display = 'none');
        document.querySelectorAll('.tab-header .sub-nav-btn').forEach(btn => btn.classList.remove('active'));
        
        document.getElementById(viewId).style.display = 'block';
        document.querySelector(`.tab-header .sub-nav-btn[data-view="${viewId}"]`).classList.add('active');
    }

    populateFilters() {
        const zoneFilter = document.getElementById('damage-zone-filter');
        const techFilter = document.getElementById('damage-tech-filter');
        if (!zoneFilter || !techFilter) return;

        const zones = [...new Set(this.allTechnicians.map(t => t.zoneName).filter(Boolean))];
        zoneFilter.innerHTML = '<option value="all">All Zones</option>' + zones.map(z => `<option value="${z}">${z}</option>`).join('');

        techFilter.innerHTML = '<option value="all">All Technicians</option>' + this.allTechnicians.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    }

    renderDashboard() {
        const startDate = new Date(document.getElementById('stats-start-date').value + 'T00:00:00');
        const endDate = new Date(document.getElementById('stats-end-date').value + 'T23:59:59');

        const filteredReports = this.damageReports.filter(r => {
            const reportDate = new Date(r.date_of_occurrence);
            return reportDate >= startDate && reportDate <= endDate;
        });

        const resolvedReports = filteredReports.filter(r => r.resolved);

        const totalCostInRange = filteredReports.reduce((sum, r) => sum + (r.estimated_cost || 0), 0);
        const avgCost = filteredReports.length > 0 ? totalCostInRange / filteredReports.length : 0;
        
        let totalResolutionTime = 0;
        let resolvedCount = 0;
        resolvedReports.forEach(r => {
            if(r.createdAt && r.resolvedAt) {
                totalResolutionTime += r.resolvedAt.toMillis() - r.createdAt.toMillis();
                resolvedCount++;
            }
        });
        const avgResolutionDays = resolvedCount > 0 ? (totalResolutionTime / resolvedCount / (1000 * 60 * 60 * 24)).toFixed(1) : 'N/A';

        document.getElementById('total-incidents-month').textContent = filteredReports.length;
        document.getElementById('total-cost-month').textContent = `$${totalCostInRange.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        document.getElementById('avg-cost-incident').textContent = `$${avgCost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        document.getElementById('avg-resolution-time').textContent = `${avgResolutionDays} days`;

        this.renderDamagesOverTimeChart(filteredReports);
        this.renderDamagesByCauseChart(filteredReports);
        this.renderPatternRecognitionAlerts(); // This still checks last 30 days regardless of filter
    }

    renderDamagesOverTimeChart(reports) {
        const ctx = document.getElementById('damages-over-time-chart');
        if (!ctx) return;
        if (this.damageCharts.overTime) this.damageCharts.overTime.destroy();

        const monthlyData = {};
        reports.forEach(r => {
            const month = new Date(r.date_of_occurrence).toLocaleString('default', { month: 'short', year: '2-digit' });
            if (!monthlyData[month]) monthlyData[month] = { incidents: 0, cost: 0 };
            monthlyData[month].incidents++;
            monthlyData[month].cost += r.estimated_cost || 0;
        });

        const labels = Object.keys(monthlyData).sort((a,b) => new Date(a) - new Date(b));
        const incidents = labels.map(l => monthlyData[l].incidents);
        const costs = labels.map(l => monthlyData[l].cost);

        this.damageCharts.overTime = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: '# of Incidents', data: incidents, yAxisID: 'yIncidents', backgroundColor: 'rgba(248, 123, 77, 0.7)' },
                    { label: 'Total Cost', data: costs, yAxisID: 'yCost', type: 'line', borderColor: '#10b981', tension: 0.2 }
                ]
            },
            options: { scales: { yIncidents: { position: 'left', title: {display: true, text: 'Incidents'} }, yCost: { position: 'right', title: {display: true, text: 'Cost ($)'} } } }
        });
    }

    renderDamagesByCauseChart(reports) {
        const ctx = document.getElementById('damages-by-cause-chart');
        if (!ctx) return;
        if (this.damageCharts.byCause) this.damageCharts.byCause.destroy();

        const causeCounts = {};
        reports.forEach(r => {
            const cause = r.cause_of_damage || 'Uncategorized';
            causeCounts[cause] = (causeCounts[cause] || 0) + 1;
        });

        const labels = Object.keys(causeCounts);
        const data = Object.values(causeCounts);

        this.damageCharts.byCause = new Chart(ctx, {
            type: 'pie',
            data: { labels, datasets: [{ data, backgroundColor: ['#f87b4d', '#a4a4a5', '#10b981', '#3b82f6', '#f59e0b', '#ef4444'] }] },
            options: { plugins: { legend: { position: 'bottom' } } }
        });
    }

    renderPatternRecognitionAlerts() {
        const container = document.getElementById('pattern-recognition-alerts');
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const techIncidents = {};
        this.damageReports.forEach(r => {
            if (new Date(r.date_of_occurrence) >= thirtyDaysAgo) {
                const techId = r.submittedById;
                if (techId) {
                    techIncidents[techId] = (techIncidents[techId] || 0) + 1;
                }
            }
        });
        
        const flaggedTechs = Object.entries(techIncidents).filter(([_, count]) => count >= 3);

        if (flaggedTechs.length > 0) {
            container.innerHTML = flaggedTechs.map(([techId, count]) => {
                const tech = this.allTechnicians.find(t => t.id === techId);
                return `<div class="staffing-alert text-warning"><i class="fas fa-exclamation-triangle"></i><strong>${tech.name}</strong> has had ${count} incidents in the last 30 days.</div>`
            }).join('');
        } else {
            container.innerHTML = `<div class="staffing-alert text-success"><i class="fas fa-check-circle"></i> No recurring patterns found recently.</div>`;
        }
    }

    applyFilters() {
        const searchTerm = document.getElementById('damage-search').value.toLowerCase();
        const zone = document.getElementById('damage-zone-filter').value;
        const techId = document.getElementById('damage-tech-filter').value;
        const startDate = document.getElementById('damage-start-date').value;
        const endDate = document.getElementById('damage-end-date').value;
        const statusFilter = document.getElementById('damage-status-filter').value;

        const filteredReports = this.damageReports.filter(report => {
            const tech = this.allTechnicians.find(t => t.id === report.submittedById);
            const reportZone = tech ? tech.zoneName : 'N/A';

            const matchesSearch = !searchTerm || report.job_number.toLowerCase().includes(searchTerm);
            const matchesZone = zone === 'all' || reportZone === zone;
            const matchesTech = techId === 'all' || report.submittedById === techId;
            const matchesStartDate = !startDate || report.date_of_occurrence >= startDate;
            const matchesEndDate = !endDate || report.date_of_occurrence <= endDate;
            const matchesStatus = statusFilter === 'resolved' ? report.resolved : !report.resolved;

            return matchesSearch && matchesZone && matchesTech && matchesStartDate && matchesEndDate && matchesStatus;
        });

        this.renderDamageReports(filteredReports);
    }

    renderDamageReports(reports) {
        const container = document.getElementById('damages-container');
        if (!container) return;

        if (reports.length === 0) {
            container.innerHTML = '<p>No damage reports match the current filters.</p>';
            return;
        }

        container.innerHTML = reports.map(report => `
            <div class="damage-report-card ${!report.reviewed ? 'unreviewed' : ''}" data-report-id="${report.id}">
                <div class="damage-card-header">
                    <h3>Job: ${report.job_number}</h3>
                    <span>${new Date(report.date_of_occurrence).toLocaleDateString()}</span>
                </div>
                <div class="damage-card-body">
                    <p><strong>Zone:</strong> ${report.zone_location}</p>
                    <p><strong>Status:</strong> <span class="status-badge status-${(report.status || 'new').replace(/ /g, '-').toLowerCase()}">${report.status || 'New'}</span></p>
                </div>
                <div class="damage-card-footer">
                    <button class="btn btn-primary btn-small view-damage-btn">View Details</button>
                </div>
            </div>
        `).join('');
    }

    openDamageReportModal(reportId) {
        const report = this.damageReports.find(r => r.id === reportId);
        if (!report) return;

        const statusOptions = ['New', 'Under Review', 'Action Plan Approved', 'Repairs in Progress', 'Resolved']
            .map(s => `<option value="${s}" ${report.status === s ? 'selected' : ''}>${s}</option>`).join('');

        const activityLogHtml = (report.activityLog || []).map(log => 
            `<div class="activity-log-item"><small>${log.timestamp.toDate().toLocaleString()}</small> - ${log.entry}</div>`
        ).join('');

        const modalBody = `
            <div class="damage-modal-grid">
                <div class="damage-modal-section">
                    <h4>Report Details</h4>
                    <p><strong>Job Number:</strong> ${report.job_number}</p>
                    <p><strong>Submitted By:</strong> ${report.submittedBy || 'N/A'}</p>
                    <p><strong>Date of Occurrence:</strong> ${new Date(report.date_of_occurrence).toLocaleDateString()}</p>
                    <p><strong>Zone:</strong> ${report.zone_location}</p>
                    <p><strong>Cause of Damage:</strong> ${report.cause_of_damage || 'N/A'}</p>
                    <p><strong>Description:</strong> ${report.description}</p>
                    <p><strong>How it Occurred:</strong> ${report.how_it_occurred}</p>
                    ${report.photo_url ? `<img src="${report.photo_url}" alt="Damage Photo" class="damage-photo">` : ''}
                </div>
                <div class="damage-modal-section">
                    <h4>Supervisor Section</h4>
                    <div class="form-group"><label>Status</label><select id="status" class="form-input">${statusOptions}</select></div>
                    <div class="form-group"><label>Comments/Notes</label><textarea id="supervisor_comments" class="form-input" rows="3" placeholder="Add a new note..."></textarea></div>
                    <div class="form-group"><label>Estimated Timeline</label><input type="text" id="estimated_timeline" class="form-input" value="${report.estimated_timeline || ''}"></div>
                    <div class="form-group"><label>Action Plan</label><textarea id="action_plan" class="form-input" rows="3">${report.action_plan || ''}</textarea></div>
                    <div class="form-group"><label>Estimated Cost</label><input type="number" id="estimated_cost" class="form-input" value="${report.estimated_cost || ''}"></div>
                    <div class="form-group"><label>Final Resolution Notes</label><textarea id="resolution_notes" class="form-input" rows="3">${report.resolution_notes || ''}</textarea></div>
                    <h4>Activity Log</h4>
                    <div class="activity-log">${activityLogHtml || 'No activity yet.'}</div>
                </div>
            </div>
        `;

        this.app.modalManager.showModal('Damage Report', modalBody, [
            { text: 'Cancel', class: 'btn-secondary', onclick: 'laborTool.modalManager.closeModal()' },
            { text: 'Save', class: 'btn-primary', onclick: `laborTool.damagesManager.saveDamageReport('${report.id}')` }
        ]);

        if (!report.reviewed) {
            const updateData = { 
                reviewed: true,
                activityLog: firebase.firestore.FieldValue.arrayUnion({
                    entry: `Report reviewed by ${this.app.user.username}.`,
                    timestamp: new Date()
                })
            };
            this.app.firebaseService.updateDamageReport(report.id, updateData);
        }
    }

    async saveDamageReport(reportId) {
        const report = this.damageReports.find(r => r.id === reportId);
        const cost = document.getElementById('estimated_cost').value;
        const newStatus = document.getElementById('status').value;
        const newComment = document.getElementById('supervisor_comments').value.trim();

        if (newStatus === 'Resolved' && !cost) {
            alert('Estimated cost is required to mark a report as resolved.');
            return;
        }

        const data = {
            status: newStatus,
            resolved: newStatus === 'Resolved',
            estimated_timeline: document.getElementById('estimated_timeline').value,
            action_plan: document.getElementById('action_plan').value,
            estimated_cost: parseFloat(cost) || 0,
            resolution_notes: document.getElementById('resolution_notes').value
        };

        const activityLog = [];
        if(report.status !== newStatus) {
            activityLog.push({ entry: `Status changed to ${newStatus} by ${this.app.user.username}.`, timestamp: new Date() });
        }
        if(newComment) {
            activityLog.push({ entry: `Comment added by ${this.app.user.username}: "${newComment}"`, timestamp: new Date() });
        }
        if(newStatus === 'Resolved' && report.status !== 'Resolved') {
            data.resolvedAt = firebase.firestore.FieldValue.serverTimestamp();
        }

        if (activityLog.length > 0) {
            data.activityLog = firebase.firestore.FieldValue.arrayUnion(...activityLog);
        }

        await this.app.firebaseService.updateDamageReport(reportId, data);
        this.app.modalManager.closeModal();
        await this.loadInitialData();
        this.renderDashboard();
        this.applyFilters();
    }
}