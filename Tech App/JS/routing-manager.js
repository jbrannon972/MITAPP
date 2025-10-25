class RoutingManager {
    constructor(app) {
        this.app = app;
        this.jobs = [];
        this.techs = [];
        this.currentDate = null;

        // Make this instance globally accessible for onclick handlers
        window.routingManager = this;
    }

    async initialize() {
        const container = document.getElementById('routing-tab');

        container.innerHTML = `
            <div class="routing-container">
                <div class="routing-header">
                    <h2>Daily Route Planner</h2>
                    <div class="upload-section">
                        <label for="csv-upload" class="btn btn-primary">
                            <i class="fas fa-upload"></i> Upload Daily Jobs CSV
                        </label>
                        <input type="file" id="csv-upload" accept=".csv" style="display: none;">
                        <span id="file-name" class="file-name"></span>
                    </div>
                </div>

                <div id="routing-content" class="routing-content">
                    <div class="empty-state">
                        <i class="fas fa-route"></i>
                        <p>Upload a CSV file to start planning routes</p>
                        <small>Expected format: export_YYYY-MM-DDTHHMM.csv</small>
                    </div>
                </div>
            </div>
        `;

        this.setupEventListeners();
    }

    setupEventListeners() {
        const uploadInput = document.getElementById('csv-upload');
        uploadInput.addEventListener('change', (e) => this.handleFileUpload(e));
    }

    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        document.getElementById('file-name').textContent = file.name;

        const text = await file.text();
        this.parseCSV(text);
        this.renderRoutes();
    }

    parseCSV(csvText) {
        const lines = csvText.split('\n');
        const headers = lines[0].split(',');

        this.jobs = [];

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;

            const values = this.parseCSVLine(lines[i]);
            if (values.length < headers.length) continue;

            const job = {};
            headers.forEach((header, index) => {
                job[header.trim()] = values[index] ? values[index].trim() : '';
            });

            // Only add valid jobs
            if (job.route_title && job.customer_address) {
                this.jobs.push(this.enrichJob(job));
            }
        }

        // Extract unique techs from jobs
        this.extractTechs();
    }

    parseCSVLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current);

        return values;
    }

    enrichJob(job) {
        // Extract timeframe from description
        const tfMatch = job.route_description.match(/TF\((\d+):(\d+)-(\d+):(\d+)\)/);

        // Extract customer name and job details from route_title
        const titleParts = job.route_title.split('|').map(p => p.trim());

        // Parse workers array
        let workers = [];
        try {
            if (job.workers && job.workers !== '') {
                workers = JSON.parse(job.workers.replace(/'/g, '"'));
            }
        } catch (e) {
            workers = [];
        }

        return {
            ...job,
            customerName: titleParts[0] || 'Unknown',
            jobId: titleParts[1] || '',
            serviceType: titleParts[2] || '',
            zone: job.Zone || 'Unassigned',
            timeframeStart: tfMatch ? `${tfMatch[1]}:${tfMatch[2]}` : '09:00',
            timeframeEnd: tfMatch ? `${tfMatch[3]}:${tfMatch[4]}` : '17:00',
            durationHours: parseFloat(job.duration) || 1.0,
            workers: workers,
            phone: this.extractPhone(job.route_description),
            priority: this.calculatePriority(job)
        };
    }

    extractPhone(description) {
        const phoneMatch = description.match(/^[\s\+]?[\d\(\)\-\s]+(?=\s?\|)/);
        return phoneMatch ? phoneMatch[0].trim() : '';
    }

    calculatePriority(job) {
        const desc = job.route_description.toLowerCase();
        if (desc.includes('urgent') || desc.includes('emergency')) return 'high';
        if (desc.includes('vip') || desc.includes('important')) return 'medium';
        return 'normal';
    }

    extractTechs() {
        const techSet = new Set();
        this.jobs.forEach(job => {
            job.workers.forEach(worker => {
                if (worker) techSet.add(worker);
            });
        });
        this.techs = Array.from(techSet).sort();
    }

    renderRoutes() {
        const content = document.getElementById('routing-content');

        if (this.jobs.length === 0) {
            content.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>No valid jobs found in the uploaded file</p>
                </div>
            `;
            return;
        }

        const jobsByTech = this.groupJobsByTech();
        const jobsByZone = this.groupJobsByZone();

        content.innerHTML = `
            <div class="routing-tabs">
                <button class="routing-view-btn active" data-view="by-tech">By Technician</button>
                <button class="routing-view-btn" data-view="by-zone">By Zone</button>
                <button class="routing-view-btn" data-view="optimize">Optimize Routes</button>
            </div>

            <div class="routing-stats">
                <div class="stat-card">
                    <i class="fas fa-briefcase"></i>
                    <div>
                        <div class="stat-number">${this.jobs.length}</div>
                        <div class="stat-label">Total Jobs</div>
                    </div>
                </div>
                <div class="stat-card">
                    <i class="fas fa-users"></i>
                    <div>
                        <div class="stat-number">${this.techs.length}</div>
                        <div class="stat-label">Technicians</div>
                    </div>
                </div>
                <div class="stat-card">
                    <i class="fas fa-map-marked-alt"></i>
                    <div>
                        <div class="stat-number">${Object.keys(jobsByZone).length}</div>
                        <div class="stat-label">Zones</div>
                    </div>
                </div>
                <div class="stat-card">
                    <i class="fas fa-clock"></i>
                    <div>
                        <div class="stat-number">${this.calculateTotalHours()}</div>
                        <div class="stat-label">Total Hours</div>
                    </div>
                </div>
            </div>

            <div id="routing-view-content">
                ${this.renderByTechView(jobsByTech)}
            </div>
        `;

        this.setupViewSwitching(jobsByTech, jobsByZone);
    }

    setupViewSwitching(jobsByTech, jobsByZone) {
        const buttons = document.querySelectorAll('.routing-view-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const view = btn.dataset.view;
                const viewContent = document.getElementById('routing-view-content');

                if (view === 'by-tech') {
                    viewContent.innerHTML = this.renderByTechView(jobsByTech);
                } else if (view === 'by-zone') {
                    viewContent.innerHTML = this.renderByZoneView(jobsByZone);
                } else if (view === 'optimize') {
                    viewContent.innerHTML = this.renderOptimizeView(jobsByTech);
                }
            });
        });
    }

    groupJobsByTech() {
        const grouped = {};

        this.jobs.forEach(job => {
            if (job.workers.length === 0) {
                if (!grouped['Unassigned']) grouped['Unassigned'] = [];
                grouped['Unassigned'].push(job);
            } else {
                job.workers.forEach(tech => {
                    if (!grouped[tech]) grouped[tech] = [];
                    grouped[tech].push(job);
                });
            }
        });

        // Sort jobs within each tech by timeframe
        Object.keys(grouped).forEach(tech => {
            grouped[tech].sort((a, b) => {
                return a.timeframeStart.localeCompare(b.timeframeStart);
            });
        });

        return grouped;
    }

    groupJobsByZone() {
        const grouped = {};

        this.jobs.forEach(job => {
            const zone = job.zone || 'Unassigned';
            if (!grouped[zone]) grouped[zone] = [];
            grouped[zone].push(job);
        });

        // Sort jobs within each zone by timeframe
        Object.keys(grouped).forEach(zone => {
            grouped[zone].sort((a, b) => {
                return a.timeframeStart.localeCompare(b.timeframeStart);
            });
        });

        return grouped;
    }

    renderByTechView(jobsByTech) {
        let html = '<div class="tech-routes">';

        Object.keys(jobsByTech).sort().forEach(tech => {
            const jobs = jobsByTech[tech];
            const totalHours = jobs.reduce((sum, job) => sum + job.durationHours, 0);

            html += `
                <div class="tech-route-card">
                    <div class="tech-route-header">
                        <div class="tech-name">
                            <i class="fas fa-user"></i>
                            ${tech}
                        </div>
                        <div class="tech-stats">
                            <span class="badge">${jobs.length} jobs</span>
                            <span class="badge">${totalHours.toFixed(1)} hrs</span>
                        </div>
                    </div>
                    <div class="tech-route-jobs">
                        ${jobs.map((job, idx) => this.renderJobCard(job, idx + 1)).join('')}
                    </div>
                </div>
            `;
        });

        html += '</div>';
        return html;
    }

    renderByZoneView(jobsByZone) {
        let html = '<div class="zone-routes">';

        Object.keys(jobsByZone).sort().forEach(zone => {
            const jobs = jobsByZone[zone];
            const totalHours = jobs.reduce((sum, job) => sum + job.durationHours, 0);

            html += `
                <div class="zone-route-card">
                    <div class="zone-route-header">
                        <div class="zone-name">
                            <i class="fas fa-map-marker-alt"></i>
                            Zone ${zone}
                        </div>
                        <div class="zone-stats">
                            <span class="badge">${jobs.length} jobs</span>
                            <span class="badge">${totalHours.toFixed(1)} hrs</span>
                        </div>
                    </div>
                    <div class="zone-route-jobs">
                        ${jobs.map((job, idx) => this.renderJobCard(job, idx + 1)).join('')}
                    </div>
                </div>
            `;
        });

        html += '</div>';
        return html;
    }

    renderOptimizeView(jobsByTech) {
        let html = `
            <div class="optimize-container">
                <div class="optimize-header">
                    <h3>Route Optimization</h3>
                    <p>Routes are automatically ordered by timeframe and zone proximity</p>
                </div>
                <div class="optimize-actions">
                    <button class="btn btn-primary" onclick="routingManager.exportRoutes()">
                        <i class="fas fa-download"></i> Export Optimized Routes
                    </button>
                    <button class="btn btn-secondary" onclick="routingManager.openAllInMaps()">
                        <i class="fas fa-map"></i> Open in Google Maps
                    </button>
                </div>
                <div class="tech-routes">
        `;

        Object.keys(jobsByTech).sort().forEach(tech => {
            const jobs = jobsByTech[tech];
            const optimizedJobs = this.optimizeRoute(jobs);
            const totalHours = optimizedJobs.reduce((sum, job) => sum + job.durationHours, 0);
            const totalDriveTime = this.estimateTotalDriveTime(optimizedJobs);

            html += `
                <div class="tech-route-card optimized">
                    <div class="tech-route-header">
                        <div class="tech-name">
                            <i class="fas fa-user"></i>
                            ${tech}
                        </div>
                        <div class="tech-stats">
                            <span class="badge">${optimizedJobs.length} stops</span>
                            <span class="badge">${totalHours.toFixed(1)} work hrs</span>
                            <span class="badge badge-info">${totalDriveTime} drive time</span>
                        </div>
                    </div>
                    <div class="route-timeline">
                        ${this.renderTimeline(optimizedJobs)}
                    </div>
                </div>
            `;
        });

        html += '</div></div>';
        return html;
    }

    optimizeRoute(jobs) {
        // Simple optimization: sort by zone first, then by timeframe
        return [...jobs].sort((a, b) => {
            // Zone comparison
            if (a.zone !== b.zone) {
                return a.zone.localeCompare(b.zone);
            }
            // Timeframe comparison
            return a.timeframeStart.localeCompare(b.timeframeStart);
        });
    }

    estimateTotalDriveTime(jobs) {
        // Rough estimate: 20 minutes between jobs
        const estimatedMinutes = (jobs.length - 1) * 20;
        const hours = Math.floor(estimatedMinutes / 60);
        const minutes = estimatedMinutes % 60;

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    }

    renderTimeline(jobs) {
        let currentTime = 9 * 60; // Start at 9:00 AM in minutes
        let html = '<div class="timeline">';

        jobs.forEach((job, idx) => {
            const startHour = Math.floor(currentTime / 60);
            const startMin = currentTime % 60;
            const startTime = `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`;

            currentTime += job.durationHours * 60;

            const endHour = Math.floor(currentTime / 60);
            const endMin = currentTime % 60;
            const endTime = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;

            html += `
                <div class="timeline-item">
                    <div class="timeline-marker">${idx + 1}</div>
                    <div class="timeline-content">
                        <div class="timeline-time">${startTime} - ${endTime}</div>
                        <div class="timeline-job">
                            <strong>${job.customerName}</strong>
                            <span class="job-type">${job.serviceType}</span>
                        </div>
                        <div class="timeline-location">
                            <i class="fas fa-map-marker-alt"></i>
                            ${job.customer_address}
                        </div>
                        ${job.phone ? `<div class="timeline-phone"><i class="fas fa-phone"></i> ${job.phone}</div>` : ''}
                    </div>
                </div>
            `;

            // Add 20 minutes travel time between jobs
            if (idx < jobs.length - 1) {
                currentTime += 20;
                html += `
                    <div class="timeline-travel">
                        <i class="fas fa-car"></i> ~20 min travel
                    </div>
                `;
            }
        });

        html += '</div>';
        return html;
    }

    renderJobCard(job, stopNumber) {
        const priorityClass = job.priority === 'high' ? 'priority-high' : job.priority === 'medium' ? 'priority-medium' : '';

        return `
            <div class="job-card ${priorityClass}">
                <div class="job-header">
                    <span class="stop-number">#${stopNumber}</span>
                    <span class="job-time">${job.timeframeStart} - ${job.timeframeEnd}</span>
                    <span class="job-duration">${job.durationHours}h</span>
                </div>
                <div class="job-customer">
                    <strong>${job.customerName}</strong>
                    ${job.jobId ? `<span class="job-id">${job.jobId}</span>` : ''}
                </div>
                <div class="job-service">
                    <span class="badge badge-${this.getServiceTypeColor(job.serviceType)}">${job.serviceType}</span>
                    <span class="badge">Zone ${job.zone}</span>
                </div>
                <div class="job-address">
                    <i class="fas fa-map-marker-alt"></i>
                    ${job.customer_address}
                </div>
                ${job.phone ? `
                <div class="job-phone">
                    <i class="fas fa-phone"></i>
                    <a href="tel:${job.phone}">${job.phone}</a>
                </div>
                ` : ''}
                ${job.workers.length > 0 ? `
                <div class="job-workers">
                    <i class="fas fa-users"></i>
                    ${job.workers.join(', ')}
                </div>
                ` : ''}
            </div>
        `;
    }

    getServiceTypeColor(serviceType) {
        const type = serviceType.toLowerCase();
        if (type.includes('install')) return 'success';
        if (type.includes('pull')) return 'warning';
        if (type.includes('check') || type.includes('service')) return 'info';
        if (type.includes('demo')) return 'danger';
        return 'secondary';
    }

    calculateTotalHours() {
        return this.jobs.reduce((sum, job) => sum + job.durationHours, 0).toFixed(1);
    }

    async exportRoutes() {
        const jobsByTech = this.groupJobsByTech();
        let csvContent = 'Technician,Stop,Customer,Job ID,Service Type,Zone,Timeframe,Duration,Address,Phone\n';

        Object.keys(jobsByTech).sort().forEach(tech => {
            const jobs = this.optimizeRoute(jobsByTech[tech]);
            jobs.forEach((job, idx) => {
                csvContent += `"${tech}",${idx + 1},"${job.customerName}","${job.jobId}","${job.serviceType}","${job.zone}","${job.timeframeStart}-${job.timeframeEnd}",${job.durationHours},"${job.customer_address}","${job.phone}"\n`;
            });
        });

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `optimized_routes_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);

        this.app.modalManager.showModal('Success', 'Routes exported successfully!');
    }

    openAllInMaps() {
        const jobsByTech = this.groupJobsByTech();
        const tech = Object.keys(jobsByTech)[0]; // Open first tech's route for now

        if (!tech) {
            this.app.modalManager.showModal('Error', 'No routes to display');
            return;
        }

        const jobs = this.optimizeRoute(jobsByTech[tech]);
        const addresses = jobs.map(job => encodeURIComponent(job.customer_address));

        // Google Maps can handle up to 10 waypoints
        if (addresses.length > 10) {
            this.app.modalManager.showModal('Notice', `Google Maps supports up to 10 stops. Opening first 10 stops for ${tech}.`);
            const url = `https://www.google.com/maps/dir/${addresses.slice(0, 10).join('/')}`;
            window.open(url, '_blank');
        } else {
            const url = `https://www.google.com/maps/dir/${addresses.join('/')}`;
            window.open(url, '_blank');
        }
    }
}
