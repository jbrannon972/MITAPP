class UIRenderer {
    constructor(app) {
        this.app = app;
    }

    async buildNavigation() {
        const navContent = document.querySelector('.nav-content');
        if (!navContent) return;

        const navButtons = [
            { tab: 'dashboard', icon: 'fa-dashboard', text: 'Dashboard' },
            { tab: 'fleet', icon: 'fa-car', text: 'Fleet' },
            { tab: 'equipment', icon: 'fa-tools', text: 'Equipment' },
            { tab: 'team', icon: 'fa-users', text: 'Team' },
            { tab: 'calendar', icon: 'fa-calendar-alt', text: 'Schedule' },
            { tab: 'tools', icon: 'fa-wrench', text: 'Tools'}
        ];

        navContent.innerHTML = navButtons.map(btn => `
            <button class="nav-btn" data-tab="${btn.tab}">
                <i class="fas ${btn.icon}"></i><span>${btn.text}</span>
            </button>
        `).join('');

        this.setActiveTab();
    }

    setActiveTab() {
        const currentPath = window.location.pathname;
        let activeTab = 'dashboard';
        if (currentPath.includes('fleet.html')) activeTab = 'fleet';
        else if (currentPath.includes('equipment.html')) activeTab = 'equipment';
        else if (currentPath.includes('team.html')) activeTab = 'team';
        else if (currentPath.includes('calendar.html')) activeTab = 'calendar';
        else if (currentPath.includes('tools.html')) activeTab = 'tools';
        
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const activeNavButton = document.querySelector(`.nav-btn[data-tab="${activeTab}"]`);
        if (activeNavButton) {
            activeNavButton.classList.add('active');
        }
    }

    async renderDashboard() {
        this.startClock();
        await this.renderDashboardMetrics();
        document.getElementById('eod-report-btn')?.addEventListener('click', () => this.app.fleetManager.openEodReportModal());
    }

    async renderDashboardMetrics() {
        // At a Glance WO Counts
        document.getElementById('pending-fleet-wos').textContent = await this.app.fleetManager.getOutstandingWOCount();
        document.getElementById('pending-equipment-wos').textContent = await this.app.equipmentManager.getOutstandingWOCount();

        // New metric for recent Fleet WOs
        const recentFleetWOs = await this.app.fleetManager.getRecentWorkOrders();
        const recentFleetWOsCount = recentFleetWOs.length;
        
        const recentWOsEl = document.getElementById('recent-fleet-wos');
        const recentWOsCardEl = document.getElementById('recent-fleet-wos-card');
    
        if (recentWOsEl) {
            recentWOsEl.textContent = recentFleetWOsCount;
        }
        if (recentWOsCardEl) {
            recentWOsCardEl.onclick = () => {
                if (recentFleetWOsCount > 0) {
                    this.app.fleetManager.showRecentWorkOrdersModal(recentFleetWOs);
                } else {
                    alert("No new work orders in the last 24 hours.");
                }
            };
        }

        // New metric for recent Tool Requests
        const recentToolRequests = await this.app.firebaseService.getRecentToolRequests();
        const recentToolRequestsCount = recentToolRequests.length;

        const recentToolsEl = document.getElementById('recent-tool-requests');
        const recentToolsCardEl = document.getElementById('recent-tool-requests-card');

        if (recentToolsEl) {
            recentToolsEl.textContent = recentToolRequestsCount;
        }
        if (recentToolsCardEl) {
            recentToolsCardEl.onclick = () => {
                this.showRecentToolRequestsModal(recentToolRequests);
            };
        }

        // Create the Tech ID to Name map
        const allTechs = this.app.teamManager.staffingData.zones.flatMap(z => [z.lead, ...z.members].filter(Boolean));
        const techIdToNameMap = new Map(allTechs.map(tech => [tech.id, tech.name]));

        // Render Vehicle Lists
        this.renderVehicleList('vehicles-in-repair-list', this.app.fleetManager.getVehiclesInRepair(), false, techIdToNameMap);
        this.renderVehicleList('unassigned-vehicles-list', this.app.fleetManager.getUnassignedVehicles(), false, techIdToNameMap);
        
        const availableVans = await this.app.fleetManager.getAvailableVehiclesFromOffTechnicians();
        this.renderVehicleList('available-tech-off-list', availableVans, true, techIdToNameMap);
    }

    showRecentToolRequestsModal(requests) {
        if (!requests || requests.length === 0) {
            this.app.modalManager.showModal('Recent Tool Requests', '<p>No tool requests were submitted in the last 24 hours.</p>', [{ text: 'Close', class: 'btn-secondary', onclick: 'warehouseApp.modalManager.closeModal()' }]);
            return;
        }

        const requestListHtml = requests.map(req => {
            const dateRequested = req.createdAt.toDate().toLocaleString();
            return `
                <div class="wo-list-item">
                    <div class="wo-list-header">
                        <strong>${req.technicianName}</strong>
                        <small>${dateRequested}</small>
                    </div>
                    <p class="wo-list-description"><strong>Tool:</strong> ${req.toolName}</p>
                    <p class="wo-list-description"><strong>Reason:</strong> ${req.reason}</p>
                </div>
            `;
        }).join('');

        const modalBody = `
            <style>
                .wo-list-item { 
                    margin-bottom: 1rem; 
                    padding-bottom: 1rem; 
                    border-bottom: 1px solid var(--border-color);
                }
                .wo-list-item:last-child {
                    border-bottom: none;
                    margin-bottom: 0;
                }
                .wo-list-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 0.5rem;
                }
                .wo-list-description {
                    margin: 0.25rem 0;
                    color: var(--text-secondary);
                }
            </style>
            <div class="wo-list-container">
                ${requestListHtml}
            </div>
        `;

        this.app.modalManager.showModal('Tool Requests (Last 24 Hours)', modalBody, [{ text: 'Close', class: 'btn-secondary', onclick: 'warehouseApp.modalManager.closeModal()' }]);
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

    startClock() {
        const dateTimeEl = document.getElementById('current-datetime');
        if (!dateTimeEl) return;
        const updateTime = () => {
            const now = new Date();
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
            dateTimeEl.textContent = now.toLocaleDateString('en-US', options);
        };
        updateTime();
        setInterval(updateTime, 60000);
    }
}