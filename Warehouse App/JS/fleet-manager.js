class FleetManager {
    constructor(app) {
        this.app = app;
        this.db = app.firebaseService.db;
        this.fleetData = [];
    }

    // Helper function to format currency
    formatCurrency(value) {
        if (typeof value !== 'number') {
            return '$0.00';
        }
        return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    }

    async loadFleetData() {
        try {
            const data = await this.app.firebaseService.loadFleetData();
            this.fleetData = (data ? data.vehicles : []).map((v, index) => ({ ...v, id: v.id || `vehicle_${Date.now()}_${index}`}));
        } catch (error) {
            console.error('Error loading fleet data:', error);
            this.app.showError('Could not load fleet data.');
        }
    }

    async initialize() {
        // This function is now called from core.js after all data is loaded
        if (document.getElementById('fleet-tab-content')) {
            this.renderFleetTab();
            this.setupEventListeners();
        }
    }

    async getOutstandingWOCount() {
        try {
            const woSnapshot = await this.db.collectionGroup('workOrders').where('status', '==', 'Open').get();
            let count = 0;
            woSnapshot.forEach(doc => {
                if (doc.ref.parent.parent.path.startsWith('hou_fleet')) {
                    count++;
                }
            });
            return count;
        } catch (error) {
            console.error("Error fetching fleet WO count:", error);
            return 'N/A';
        }
    }

    getVehiclesInRepair() {
        return this.fleetData.filter(vehicle => vehicle.status === 'In Repairs');
    }

    getUnassignedVehicles() {
        return this.fleetData.filter(vehicle => !vehicle.assignedTo);
    }

    async getAvailableVehiclesFromOffTechnicians() {
        const today = new Date();
        const monthlySchedules = await this.app.firebaseService.getScheduleDataForMonth(today.getFullYear(), today.getMonth());
        const schedule = await this.app.calendarManager.getCalculatedScheduleForDay(today, monthlySchedules);

        // Get the IDs of staff who are off
        const offStaffIds = new Set(schedule.staff
            .filter(s => s.status !== 'on')
            .map(s => s.id));

        // Find vehicles assigned to those off staff members
        return this.fleetData.filter(vehicle => offStaffIds.has(vehicle.assignedTo));
    }

    async getRecentWorkOrders(hours = 24) {
        const now = new Date();
        const pastDate = new Date(now.getTime() - hours * 60 * 60 * 1000);
        const pastTimestamp = firebase.firestore.Timestamp.fromDate(pastDate);
    
        const recentWOs = [];
        try {
            const woSnapshot = await this.db.collectionGroup('workOrders')
                .where('dateReported', '>=', pastTimestamp)
                .orderBy('dateReported', 'desc')
                .get();
            
            woSnapshot.forEach(doc => {
                if (doc.ref.parent.parent.path.startsWith('hou_fleet')) {
                    recentWOs.push({ 
                        id: doc.id, 
                        vehicleId: doc.ref.parent.parent.id, 
                        ...doc.data() 
                    });
                }
            });
        } catch (error) {
            console.error("Error fetching recent fleet WOs. A Firestore index might be required:", error);
            alert("Could not fetch recent work orders. A database index may be required. Please check the browser console (F12) for a link to create it.");
        }
        return recentWOs;
    }

    showRecentWorkOrdersModal(workOrders) {
        if (!workOrders || workOrders.length === 0) {
            this.app.modalManager.showModal('Recent Fleet Work Orders', '<p>No work orders were submitted in the last 24 hours.</p>', [{ text: 'Close', class: 'btn-secondary', onclick: 'warehouseApp.modalManager.closeModal()' }]);
            return;
        }
    
        const vehicleMap = new Map(this.fleetData.map(v => [v.id, v]));
    
        const woListHtml = workOrders.map(wo => {
            const vehicle = vehicleMap.get(wo.vehicleId);
            const vehicleName = vehicle ? `${vehicle.truckNumber} (${vehicle.type})` : 'Unknown Vehicle';
            const dateReported = wo.dateReported.toDate().toLocaleString();
    
            return `
                <div class="wo-list-item">
                    <div class="wo-list-header">
                        <strong>${vehicleName}</strong>
                        <small>${dateReported}</small>
                    </div>
                    <p class="wo-list-description">${wo.issueDescription}</p>
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
                    margin: 0;
                    color: var(--text-secondary);
                }
            </style>
            <div class="wo-list-container">
                ${woListHtml}
            </div>
        `;
    
        this.app.modalManager.showModal('Fleet Work Orders (Last 24 Hours)', modalBody, [{ text: 'Close', class: 'btn-secondary', onclick: 'warehouseApp.modalManager.closeModal()' }]);
    }
    
    setupEventListeners() {
        const fleetTab = document.getElementById('fleet-tab');
        if (!fleetTab) return;

        fleetTab.addEventListener('click', (event) => {
            const button = event.target.closest('button');
            if (!button) {
                const woHeader = event.target.closest('.wo-header');
                if (woHeader && woHeader.dataset.woId) {
                    this.toggleWoDetails(woHeader.dataset.woId);
                }
                return;
            }
            const { action, vehicleId, view, woId } = button.dataset;

            if (action === 'switch-view') this.switchFleetView(view);
            else if (action === 'view-edit') this.openVehicleProfileModal(vehicleId);
            else if (action === 'save-wo-changes') this.saveWoChanges(vehicleId, woId);
            else if (action === 'complete-wo') this.completeWo(vehicleId, woId);
        });
        
        document.getElementById('toggle-fleet-stats-btn')?.addEventListener('click', () => {
             document.getElementById('fleet-stats-container')?.classList.toggle('expanded');
        });
        document.getElementById('add-vehicle-btn')?.addEventListener('click', () => this.openVehicleProfileModal(null));
        document.getElementById('report-issue-btn')?.addEventListener('click', () => this.promptForVehicle('report-issue'));
        document.getElementById('monthly-inspection-btn')?.addEventListener('click', () => this.promptForVehicle('monthly-inspection'));
        document.getElementById('log-repair-btn')?.addEventListener('click', () => this.promptForVehicle('log-repair'));
    }

    promptForVehicle(action) {
        const title = action === 'report-issue' ? 'Report an Issue' : action === 'log-repair' ? 'Log a Repair' : 'Start Monthly Inspection';
        const buttonText = action === 'report-issue' ? 'Continue to Report' : action === 'log-repair' ? 'Continue' : 'Continue to Inspection';
        
        const allTechs = this.app.teamManager.staffingData.zones.flatMap(z => [z.lead, ...z.members].filter(Boolean));
        const techIdToNameMap = new Map(allTechs.map(tech => [tech.id, tech.name]));

        let optionsHtml = '<option value="">-- Select a Vehicle --</option>';
        this.fleetData
            .filter(v => v.status !== 'Retired')
            .sort((a,b) => (a.truckNumber || '').localeCompare(b.truckNumber || ''))
            .forEach(v => {
                const assignedToDisplay = techIdToNameMap.get(v.assignedTo) || v.assignedTo || 'Unassigned';
                optionsHtml += `<option value="${v.id}">${v.truckNumber || 'Unknown'} (${v.type || 'N/A'}) - ${assignedToDisplay}</option>`;
            });

        const modalBody = `
            <p>Please select the vehicle you want to ${action === 'report-issue' ? 'report an issue for' : action === 'log-repair' ? 'log a repair for' : 'inspect'}.</p>
            <div class="form-group">
                <label for="vehicle-select-prompt">Vehicle</label>
                <select id="vehicle-select-prompt" class="form-input">${optionsHtml}</select>
            </div>
        `;
    
        this.app.modalManager.showModal(title, modalBody, [
            { text: 'Cancel', class: 'btn-secondary', onclick: 'warehouseApp.modalManager.closeModal()' },
        ]);
        
        const footer = document.querySelector('#modalOverlay .modal-footer');
        const continueBtn = document.createElement('button');
        continueBtn.className = 'btn btn-primary';
        continueBtn.textContent = buttonText;
        
        continueBtn.addEventListener('click', () => {
            const selectedVehicleId = document.getElementById('vehicle-select-prompt').value;
            if (!selectedVehicleId) {
                alert('Please select a vehicle.');
                return;
            }
            this.app.modalManager.closeModal();
            if (action === 'report-issue') {
                this.openWorkOrderModal(selectedVehicleId);
            } else if (action === 'monthly-inspection') {
                this.openInspectionModal(selectedVehicleId);
            } else if (action === 'log-repair') {
                this.openRepairModal(selectedVehicleId);
            }
        });
        
        footer.appendChild(continueBtn);
    }

    renderFleetDashboard() {
        const available = this.fleetData.filter(v => ['Ford Transit', 'Sprinter', 'Prius'].includes(v.type) && v.status !== 'In Repairs' && v.status !== 'Retired').length;
        document.getElementById('vansAvailable').textContent = available;
        document.getElementById('vansUnassigned').textContent = this.getUnassignedVehicles().length;
        document.getElementById('vansInRepairs').textContent = this.getVehiclesInRepair().length;
    }

    renderFleetTab() {
        const container = document.getElementById('fleet-tab-content');
        if (!container) return;
        this.renderFleetDashboard();
        const subNavHtml = `
            <div class="sub-nav">
                <button class="sub-nav-btn active" data-action="switch-view" data-view="dashboard">Dashboard</button>
                <button class="sub-nav-btn" data-action="switch-view" data-view="work-orders">Pending Work Orders</button>
            </div>`;

        const allTechs = this.app.teamManager.staffingData.zones.flatMap(z => [z.lead, ...z.members].filter(Boolean));
        const techIdToNameMap = new Map(allTechs.map(tech => [tech.id, tech.name]));

        let tableHtml = `<div class="table-container"><table class="data-table" id="fleetTable"><thead><tr><th>Truck #</th><th>Type</th><th>Status</th><th>Assigned To</th><th>Mileage</th><th style="text-align: right;">Actions</th></tr></thead><tbody>`;
        this.fleetData.forEach(vehicle => {
            const assignedToDisplay = techIdToNameMap.get(vehicle.assignedTo) || vehicle.assignedTo || 'Unassigned';
            tableHtml += `
                <tr data-vehicle-id="${vehicle.id}" class="${vehicle.status === 'Retired' ? 'retired-row' : ''}">
                    <td data-label="Truck #">${vehicle.truckNumber || 'N/A'}</td>
                    <td data-label="Type">${vehicle.type || 'N/A'}</td>
                    <td data-label="Status">${vehicle.status || 'N/A'}</td>
                    <td data-label="Assigned To">${assignedToDisplay}</td>
                    <td data-label="Mileage">${vehicle.mileage ? vehicle.mileage.toLocaleString() : 'N/A'}</td>
                    <td data-label="Actions" class="actions" style="text-align: right;">
                        <button class="btn btn-secondary btn-small" data-action="view-edit" data-vehicle-id="${vehicle.id}">View/Edit</button>
                    </td>
                </tr>`;
        });
        tableHtml += `</tbody></table></div>`;

        const fleetDashboardView = `<div id="fleet-dashboard-view" class="fleet-view active">${tableHtml}</div>`;
        const workOrdersView = `<div id="fleet-work-orders-view" class="fleet-view"></div>`;

        container.innerHTML = subNavHtml + fleetDashboardView + workOrdersView;
    }

    switchFleetView(viewName) {
        document.querySelectorAll('.fleet-view').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('#fleet-tab-content .sub-nav-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`fleet-${viewName}-view`)?.classList.add('active');
        document.querySelector(`.sub-nav-btn[data-view="${viewName}"]`)?.classList.add('active');
        if (viewName === 'work-orders') {
            this.renderWorkOrdersView();
        }
    }

    async openEodReportModal() {
        const today = new Date().toLocaleDateString();
        const user = this.app.user.email.split('@')[0].replace('.', ' ').replace(/\b\w/g, l => l.toUpperCase());
    
        const openWOsSnapshot = await this.db.collectionGroup('workOrders').where('status', '==', 'Open').get();
        
        const openWOs = [];
        openWOsSnapshot.forEach(doc => {
            if (doc.ref.parent.parent.path.startsWith('hou_fleet')) {
                openWOs.push({ id: doc.id, vehicleId: doc.ref.parent.parent.id, ...doc.data() });
            }
        });
    
        const vehicleMap = new Map(this.fleetData.map(v => [v.id, v]));
    
        const wosByVehicle = openWOs.reduce((acc, wo) => {
            const vehicle = vehicleMap.get(wo.vehicleId);
            if (vehicle && vehicle.status === 'In Repairs') {
                if (!acc[vehicle.id]) {
                    acc[vehicle.id] = {
                        vehicleInfo: vehicle,
                        wos: []
                    };
                }
                acc[vehicle.id].wos.push(wo);
            }
            return acc;
        }, {});
    
        const repairListHtml = Object.values(wosByVehicle).map(({ vehicleInfo, wos }) => {
            const vehicleHeaderHtml = `
                <div class="eod-vehicle-group">
                    <h5 class="eod-vehicle-header">${vehicleInfo.truckNumber || 'Unknown'} (${vehicleInfo.type || 'N/A'})</h5>`;
            
            const woDetailsHtml = wos.map(wo => {
                const targetFixDate = wo.targetFixDate 
                    ? wo.targetFixDate.toDate().toISOString().split('T')[0] 
                    : '';
                return `
                    <div class="eod-wo-item" id="eod-wo-item-${wo.id}">
                        <p class="eod-wo-description">${wo.issueDescription || 'No description provided'}</p>
                        <div class="eod-wo-inputs">
                            <div class="form-group">
                                <label>Vendor/Mechanic Update</label>
                                <input type="text" id="eod-note-${wo.id}" class="form-input" placeholder="Enter update...">
                            </div>
                            <div class="form-group">
                                <label>New Target Resolution Date</label>
                                <input type="date" id="eod-date-${wo.id}" class="form-input" value="${targetFixDate}">
                            </div>
                        </div>
                        <div class="eod-wo-actions">
                            <button class="btn btn-secondary btn-small" onclick="warehouseApp.fleetManager.markEodWoNoChanges('${wo.id}')">No Changes</button>
                            <button class="btn btn-primary btn-small" onclick="warehouseApp.fleetManager.saveEodWoChanges('${vehicleInfo.id}', '${wo.id}')">Save Update</button>
                        </div>
                    </div>`;
            }).join('');
    
            return `${vehicleHeaderHtml}${woDetailsHtml}</div>`;
        }).join('');
    
        const modalBody = `
            <style>
                .report-section { margin-bottom: 24px; border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 16px; background-color: #f8fafc; }
                .report-section h4 { font-family: 'Oswald', sans-serif; border-bottom: 2px solid var(--primary-color); padding-bottom: 8px; margin-bottom: 12px; font-size: 1.1rem; }
                .verification-buttons { display: flex; flex-direction: column; gap: 8px; }
                .verification-button { background-color: var(--surface-color); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 12px; text-align: left; cursor: pointer; transition: all 0.2s ease-in-out; }
                .verification-button:hover { background-color: #eef2f7; }
                .verification-button.selected { background-color: #dcfce7; border-color: var(--success-color); font-weight: 600; }
                .eod-vehicle-group { margin-bottom: 20px; }
                .eod-vehicle-header { font-family: 'Oswald', sans-serif; font-size: 1.2rem; font-weight: 600; margin-bottom: 12px; }
                .eod-wo-item { background-color: var(--surface-color); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px; margin-bottom: 8px; }
                .eod-wo-description { margin: 0 0 16px 0; }
                .eod-wo-inputs { margin-bottom: 16px; }
                .eod-wo-actions { display: flex; justify-content: flex-end; gap: 8px; }
            </style>
            <div class="form-grid" style="grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                <div class="form-group"><strong>Report Date:</strong> ${today}</div>
                <div class="form-group"><strong>Filed By:</strong> ${user}</div>
            </div>
    
            <div class="report-section">
                <h4>Section 1: Data Verification</h4>
                <div class="verification-buttons">
                    <button class="verification-button" onclick="this.classList.toggle('selected')">Unassigned Vehicles list is correct.</button>
                    <button class="verification-button" onclick="this.classList.toggle('selected')">All new issues reported today have been entered as Work Orders.</button>
                    <button class="verification-button" onclick="this.classList.toggle('selected')">All vehicles returned from repair today have been updated in the system.</button>
                </div>
            </div>
    
            <div class="report-section">
                <h4>Section 2: Review & Update WOs / Vehicles in Repair</h4>
                <div class="wo-accordion-container">
                    ${repairListHtml || '<p>No vehicles currently in repair.</p>'}
                </div>
            </div>
    
            <div class="report-section">
                <h4>Section 3: Urgent Actions for Tomorrow Morning</h4>
                <div class="form-group">
                    <textarea class="form-input" rows="3" placeholder="List any critical tasks..."></textarea>
                </div>
            </div>
        `;
    
        this.app.modalManager.showModal('Daily Fleet EOD Report', modalBody, [
            { text: 'Close', class: 'btn-secondary', onclick: 'warehouseApp.modalManager.closeModal()' },
            { text: 'Submit Report', class: 'btn-primary', onclick: 'warehouseApp.modalManager.closeModal()' }
        ]);
    }
    
    async saveEodWoChanges(vehicleId, workOrderId) {
        const newNote = document.getElementById(`eod-note-${workOrderId}`).value.trim();
        const newDate = document.getElementById(`eod-date-${workOrderId}`).value;
        const updateData = {};
    
        if (newNote) {
            updateData.notes = firebase.firestore.FieldValue.arrayUnion({
                text: newNote,
                author: this.app.user.email.split('@')[0],
                timestamp: firebase.firestore.Timestamp.now()
            });
        }
    
        if (newDate) {
            updateData.targetFixDate = firebase.firestore.Timestamp.fromDate(new Date(newDate));
        }
    
        if (Object.keys(updateData).length === 0) {
            this.markEodWoNoChanges(workOrderId);
            return;
        }
    
        try {
            await this.db.collection('hou_fleet').doc(vehicleId).collection('workOrders').doc(workOrderId).update(updateData);
            const itemEl = document.getElementById(`eod-wo-item-${workOrderId}`);
            itemEl.style.backgroundColor = '#dcfce7';
            itemEl.querySelector('.eod-wo-actions').innerHTML = '<p style="color: green; font-weight: bold;">Saved!</p>';
            setTimeout(() => { itemEl.style.backgroundColor = ''; }, 1500);
        } catch (error) {
            console.error("Error saving EOD WO changes:", error);
            alert('Failed to save update.');
        }
    }
    
    markEodWoNoChanges(workOrderId) {
        const itemEl = document.getElementById(`eod-wo-item-${workOrderId}`);
        itemEl.style.backgroundColor = '#f1f5f9';
        itemEl.querySelector('.eod-wo-actions').innerHTML = '<p style="color: grey;">Reviewed</p>';
    }

    async openVehicleProfileModal(vehicleId) {
        const isNew = !vehicleId;
        const vehicle = isNew ? { id: `vehicle_${Date.now()}` } : this.fleetData.find(v => v.id === vehicleId);
        if (!vehicle) return;
    
        const modalBody = `
            <style>
                .fleet-modal-content { display: none; }
                .fleet-modal-content.active { display: block; animation: fadeInUp 0.3s ease; }
                .btn-link { background: none; border: none; color: var(--primary-color); text-decoration: underline; cursor: pointer; padding: 0; font-size: 1em; }
                .inspection-details-grid { display: flex; flex-direction: column; gap: 4px; }
                .inspection-detail-item { display: grid; grid-template-columns: 2fr 1fr 3fr; align-items: center; background: #f8fafc; padding: 8px; border-radius: var(--radius-sm); border-left: 3px solid #f8fafc;}
                .inspection-detail-item.issue { background: #fef2f2; border-left-color: var(--danger-color); }
                .item-label { font-weight: 500; }
                .item-value { text-transform: capitalize; font-weight: 600; }
                .item-details { color: var(--text-secondary); font-style: italic; }
            </style>
            <div class="modal-tabs">
                <button class="modal-tab-btn active" data-tab="details">Details</button>
                <button class="modal-tab-btn" data-tab="inspections" ${isNew ? 'disabled' : ''}>Inspections</button>
                <button class="modal-tab-btn" data-tab="wo" ${isNew ? 'disabled' : ''}>Work Orders</button>
                <button class="modal-tab-btn" data-tab="repairs" ${isNew ? 'disabled' : ''}>Repairs</button>
                <button class="modal-tab-btn" data-tab="costs" ${isNew ? 'disabled' : ''}>Costs</button>
            </div>
            <div id="details-tab" class="fleet-modal-content active">${this.getVehicleDetailsFormHtml(vehicle)}</div>
            <div id="inspections-tab" class="fleet-modal-content"></div>
            <div id="wo-tab" class="fleet-modal-content"></div>
            <div id="repairs-tab" class="fleet-modal-content"></div>
            <div id="costs-tab" class="fleet-modal-content"></div>`;
    
        this.app.modalManager.showModal(`Vehicle Profile: ${vehicle.truckNumber || 'New Vehicle'}`, modalBody, [
            { text: 'Delete Vehicle', class: 'btn-danger', onclick: `warehouseApp.fleetManager.deleteVehicle('${vehicle.id}')`, disabled: isNew },
            { text: 'Cancel', class: 'btn-secondary', onclick: 'warehouseApp.modalManager.closeModal()' },
            { text: 'Save Changes', class: 'btn-primary', onclick: `warehouseApp.fleetManager.saveVehicleProfile('${vehicle.id}')` }
        ]);
        
        const modal = document.querySelector('#modalOverlay .modal');
        modal.addEventListener('click', (e) => {
            const tabButton = e.target.closest('.modal-tab-btn');
            if (!tabButton) return;
    
            const tabId = tabButton.dataset.tab;
    
            modal.querySelectorAll(".modal-tab-btn, .fleet-modal-content").forEach(el => el.classList.remove("active"));
            
            tabButton.classList.add("active");
            const tabContent = document.getElementById(`${tabId}-tab`);
            tabContent.classList.add("active");
    
            if (tabContent.innerHTML.trim() === '' || tabId === 'details') {
                if (tabId === 'details') {
                    tabContent.innerHTML = this.getVehicleDetailsFormHtml(vehicle);
                } else {
                    tabContent.innerHTML = '<p>Loading...</p>';
                }

                if (tabId === 'wo') this.renderVehicleWOHistory(vehicle.id, 'wo-tab');
                else if (tabId === 'repairs') this.renderVehicleRepairHistory(vehicle.id, 'repairs-tab');
                else if (tabId === 'costs') this.renderVehicleCostSummary(vehicle.id, 'costs-tab');
                else if (tabId === 'inspections') this.renderVehicleInspectionsList(vehicle.id, 'inspections-tab');
            }
        });
    }

    getVehicleDetailsFormHtml(vehicle) {
        const vehicleStatuses = ["Available", "In Use (Conroe)", "In Use (Katy)", "In Use (Houston)", "In Repairs", "Retired"];
        const statusOptionsHtml = vehicleStatuses.map(s => `<option value="${s}" ${vehicle.status === s ? 'selected' : ''}>${s}</option>`).join('');
    
        const vehicleTypes = ['Ford Transit', 'Sprinter', 'Ford Connect', 'Box Truck', 'Nissan NV2500', 'Prius'];
        const typeOptionsHtml = vehicleTypes.map(t => `<option value="${t}" ${vehicle.type === t ? 'selected' : ''}>${t}</option>`).join('');
    
        const allTechs = this.app.teamManager.staffingData.zones.flatMap(z => [z.lead, ...z.members].filter(Boolean));
        let techOptionsHtml = `<option value="">Unassigned</option>`;
        const isAssignedToOther = vehicle.assignedTo && !allTechs.some(tech => tech.id === vehicle.assignedTo);
        allTechs.forEach(tech => {
            techOptionsHtml += `<option value="${tech.id}" ${vehicle.assignedTo === tech.id ? 'selected' : ''}>${tech.name}</option>`;
        });
        techOptionsHtml += `<option value="Other" ${isAssignedToOther ? 'selected' : ''}>Other...</option>`;
        const otherInputStyle = isAssignedToOther ? 'display: block;' : 'display: none;';
    
        return `
            <div class="form-grid">
                <div class="form-group"><label>Truck Number</label><input type="text" id="truckNumber" class="form-input" value="${vehicle.truckNumber || ''}"></div>
                <div class="form-group"><label>Vehicle Status</label><select id="status" class="form-input">${statusOptionsHtml}</select></div>
                <div class="form-group"><label>Vehicle Type</label><select id="type" class="form-input">${typeOptionsHtml}</select></div>
                <div class="form-group"><label>Quality Rating (1-5)</label><input type="number" id="qualityRating" class="form-input" value="${vehicle.qualityRating || ''}" min="1" max="5"></div>
                <div class="form-group"><label>Mileage</label><input type="number" id="mileage" class="form-input" value="${vehicle.mileage || ''}"></div>
                <div class="form-group"><label>File Link</label><input type="text" id="file" class="form-input" value="${vehicle.file || ''}"></div>
                <div class="form-group full-width"><label>Assigned To</label><select id="assignedTo" class="form-input" onchange="document.getElementById('otherAssignedToContainer').style.display = this.value === 'Other' ? 'block' : 'none';">${techOptionsHtml}</select></div>
                <div id="otherAssignedToContainer" class="form-group full-width" style="${otherInputStyle}"><label>Other Name</label><input type="text" id="otherAssignedTo" class="form-input" value="${isAssignedToOther ? vehicle.assignedTo : ''}" placeholder="Enter name..."></div>
                <div class="form-group full-width"><label>Notes</label><textarea id="notes" class="form-input">${vehicle.notes || ''}</textarea></div>
                <div class="form-group full-width"><label>Maintenance Needed</label><textarea id="maintenanceNeeded" class="form-input">${vehicle.maintenanceNeeded || ''}</textarea></div>
            </div>`;
    }

    async renderVehicleWOHistory(vehicleId, containerId) {
        const container = document.getElementById(containerId);
        const woSnap = await this.db.collection('hou_fleet').doc(vehicleId).collection('workOrders').orderBy("dateReported", "desc").get();
        let content = '<div class="history-section"><h4>Work Order History</h4><div class="history-list">';
        if (woSnap.empty) {
            content += '<p>No work orders found for this vehicle.</p>';
        } else {
            content += woSnap.docs.map(doc => {
                const wo = doc.data();
                const cost = wo.status === 'Completed' && wo.repairCost ? ` - ${this.formatCurrency(wo.repairCost)}` : '';
                return `<div class="history-item"><strong>${wo.dateReported.toDate().toLocaleDateString()}:</strong> ${wo.issueDescription} <em>(Status: ${wo.status}${cost})</em></div>`;
            }).join('');
        }
        content += '</div></div>';
        container.innerHTML = content;
    }

    async renderVehicleRepairHistory(vehicleId, containerId) {
        const container = document.getElementById(containerId);
        const repairSnap = await this.db.collection('hou_fleet').doc(vehicleId).collection('repairs').orderBy("date", "desc").get();
        let content = `<div class="history-section"><div class="card-header" style="padding:0; margin-bottom:12px; border:none;"><h4>Repair History</h4><button class="btn btn-primary btn-small" id="log-repair-btn-inline">Log New Repair</button></div><div class="history-list">`;
        if (repairSnap.empty) {
            content += '<p>No manual repairs logged for this vehicle.</p>';
        } else {
            content += repairSnap.docs.map(doc => {
                const repair = doc.data();
                return `<div class="history-item"><strong>${repair.date.toDate().toLocaleDateString()}:</strong> ${repair.description} - ${this.formatCurrency(repair.cost)}</div>`;
            }).join('');
        }
        content += '</div></div>';
        container.innerHTML = content;
        document.getElementById('log-repair-btn-inline')?.addEventListener('click', () => this.openRepairModal(vehicleId));
    }

    async renderVehicleCostSummary(vehicleId, containerId) {
        const container = document.getElementById(containerId);
        let totalCost = 0;
        let costHtml = '<div class="history-section"><h4>Cost Summary</h4><div class="history-list" style="padding-top: 15px;"><ul>';
        const woSnap = await this.db.collection('hou_fleet').doc(vehicleId).collection('workOrders').where('status', '==', 'Completed').get();
        woSnap.forEach(doc => {
            const wo = doc.data();
            if (wo.repairCost) {
                totalCost += wo.repairCost;
                costHtml += `<li>WO (${doc.id.substring(0, 5)}...): ${this.formatCurrency(wo.repairCost)}</li>`;
            }
        });
        const repairSnap = await this.db.collection('hou_fleet').doc(vehicleId).collection('repairs').get();
        repairSnap.forEach(doc => {
            const repair = doc.data();
            totalCost += repair.cost;
            costHtml += `<li>Repair (${repair.date.toDate().toLocaleDateString()}): ${this.formatCurrency(repair.cost)}</li>`;
        });
        costHtml += '</ul></div></div>';
        container.innerHTML = `<h3 style="text-align:center; margin-bottom: 10px;">Total Lifetime Cost: ${this.formatCurrency(totalCost)}</h3>${costHtml}`;
    }

    async renderVehicleInspectionsList(vehicleId, containerId) {
        const container = document.getElementById(containerId);
        const snapshot = await this.db.collection('hou_fleet').doc(vehicleId).collection('inspections').orderBy("inspectionDate", "desc").get();
        let content = '<div class="history-section"><h4>Past Inspections</h4><div class="history-list">';
        if (snapshot.empty) {
            content += '<p>No past inspections found for this vehicle.</p>';
        } else {
            content += snapshot.docs.map(doc => {
                const inspection = doc.data();
                return `<div class="history-item"><button class="btn-link" onclick="warehouseApp.fleetManager.renderSingleInspection('${vehicleId}', '${doc.id}')">Inspection from ${inspection.inspectionDate.toDate().toLocaleDateString()}</button></div>`;
            }).join('');
        }
        content += '</div></div>';
        container.innerHTML = content;
    }

    async renderSingleInspection(vehicleId, inspectionId) {
        const container = document.getElementById('inspections-tab');
        const doc = await this.db.collection('hou_fleet').doc(vehicleId).collection('inspections').doc(inspectionId).get();
        if (!doc.exists) {
            container.innerHTML = '<p>Could not load inspection details.</p>';
            return;
        }
        const data = doc.data();
        const itemLabels = {
            'head-lights': 'Head lights', 'turn-signals': 'Turn Signals', 'brake-lights': 'Brake Lights', 'warning-lights': 'Dashboard warning lights on?',
            'damages': 'Any new body or windshield damages?', 'brake-noises': 'Hearing any high pitch noises when you brake?', 'tire-tread': 'Tire Tread',
            'wipers': 'Windshield Wipers', 'fluids': 'Fluids', 'leaks': 'Leaks', 'interior-cleanliness': 'Interior Cleanliness', 'exterior-cleanliness': 'Exterior Cleanliness'
        };
        let detailsHtml = `
            <div class="history-section">
                <div class="card-header" style="padding:0; margin-bottom:12px; border:none;">
                    <h4>Inspection on ${data.inspectionDate.toLocaleString()}</h4>
                    <button class="btn btn-secondary btn-small" onclick="warehouseApp.fleetManager.renderVehicleInspectionsList('${vehicleId}', 'inspections-tab')">Back to List</button>
                </div>
                <p><strong>Driver:</strong> ${data.driver} | <strong>Mileage:</strong> ${data.mileage.toLocaleString()}</p>
                <div class="inspection-details-grid">
        `;
        for(const key in data.items) {
            const item = data.items[key];
            const isIssue = item.value === 'bad' || item.value === 'yes';
            detailsHtml += `
                <div class="inspection-detail-item ${isIssue ? 'issue' : ''}">
                    <span class="item-label">${itemLabels[key] || key}</span>
                    <span class="item-value">${item.value}</span>
                    <span class="item-details">${item.details || 'N/A'}</span>
                </div>
            `;
        }
        detailsHtml += '</div></div>';
        container.innerHTML = detailsHtml;
    }

    async saveVehicleProfile(vehicleId) {
        const isNew = !this.fleetData.some(v => v.id === vehicleId);
        let vehicleData = isNew ? { id: vehicleId } : { ...this.fleetData.find(v => v.id === vehicleId) };
    
        let newTechId = document.getElementById('assignedTo').value;
        if (newTechId === 'Other') {
            newTechId = document.getElementById('otherAssignedTo').value.trim();
        }
    
        if (newTechId && vehicleData.assignedTo !== newTechId) {
            const previouslyAssignedVehicle = this.fleetData.find(v => v.assignedTo === newTechId && v.id !== vehicleId);
            if (previouslyAssignedVehicle) {
                previouslyAssignedVehicle.assignedTo = "";
                await this.app.firebaseService.saveVehicleData(previouslyAssignedVehicle.id, previouslyAssignedVehicle);
            }
        }
    
        const updatedData = {
            truckNumber: document.getElementById('truckNumber').value,
            status: document.getElementById('status').value,
            type: document.getElementById('type').value,
            qualityRating: parseInt(document.getElementById('qualityRating').value) || null,
            mileage: parseInt(document.getElementById('mileage').value) || null,
            file: document.getElementById('file').value,
            assignedTo: newTechId,
            notes: document.getElementById('notes').value,
            maintenanceNeeded: document.getElementById('maintenanceNeeded').value
        };
    
        Object.assign(vehicleData, updatedData);
    
        try {
            await this.app.firebaseService.saveVehicleData(vehicleId, vehicleData);
    
            if (isNew) {
                this.fleetData.push(vehicleData);
            } else {
                const index = this.fleetData.findIndex(v => v.id === vehicleId);
                if (index !== -1) this.fleetData[index] = vehicleData;
            }
    
            this.app.showSuccess('Vehicle updated successfully!');
            this.app.modalManager.closeModal();
            this.renderFleetTab();
            this.renderFleetDashboard();
        } catch (error) {
            console.error("Error in saveVehicleProfile:", error);
            this.app.showError('Failed to save vehicle data.');
        }
    }

    deleteVehicle(vehicleId) {
        const vehicle = this.fleetData.find(v => v.id === vehicleId);
        if (!vehicle) return;
        const vehicleIdentifier = vehicle.truckNumber || vehicle.id;
        this.app.modalManager.showConfirmDialog(
            'Delete Vehicle',
            `Are you sure you want to permanently delete vehicle "${vehicleIdentifier}"? This action cannot be undone.`,
            `warehouseApp.fleetManager.confirmDeleteVehicle('${vehicleId}')`
        );
    }

    async confirmDeleteVehicle(vehicleId) {
        const success = await this.app.firebaseService.deleteVehicleData(vehicleId);
        if (success) {
            this.fleetData = this.fleetData.filter(v => v.id !== vehicleId);
            this.app.showSuccess('Vehicle deleted successfully.');
            this.app.modalManager.closeModal();
            this.renderFleetTab();
            this.renderFleetDashboard();
        } else {
            this.app.showError('Failed to delete vehicle.');
        }
    }
    
    async renderWorkOrdersView() {
        const container = document.getElementById('fleet-work-orders-view');
        if (!container) return;
        container.innerHTML = '<p>Loading work orders...</p>';
        try {
            const woSnapshot = await this.db.collectionGroup('workOrders').where('status', '==', 'Open').get();
            let hasWorkOrders = false;
            let content = '<div class="wo-accordion-container">';

            for (const doc of woSnapshot.docs) {
                const parentPath = doc.ref.parent.parent.path;
                if (parentPath.startsWith('hou_fleet/')) {
                    hasWorkOrders = true;
                    const wo = doc.data();
                    const vehicleId = doc.ref.parent.parent.id;
                    const vehicle = this.fleetData.find(v => v.id === vehicleId);
                    const targetDate = wo.targetFixDate ? wo.targetFixDate.toDate().toISOString().split('T')[0] : '';
                     content += `
                        <div class="wo-item">
                            <div class="wo-header" data-wo-id="${doc.id}">
                                <h5>${vehicle?.truckNumber || 'Unknown'} (${vehicle?.type || 'N/A'})</h5>
                                <p class="wo-date">Reported: ${wo.dateReported.toDate().toLocaleDateString()}</p>
                            </div>
                            <div class="wo-body" id="wo-body-${doc.id}" style="display: none;">
                                <p class="wo-description-full">${wo.issueDescription}</p>
                                <div class="wo-card">
                                    <div class="form-group"><label>Target Fix Date</label><input type="date" id="targetDate-${doc.id}" class="form-input" value="${targetDate}"></div>
                                    <div class="form-group"><label>Repair Cost</label><input type="number" id="repairCost-${doc.id}" class="form-input" placeholder="0.00" value="${wo.repairCost || ''}"></div>
                                    <div class="form-group"><label>Notes</label><div class="wo-notes-list" id="notes-list-${doc.id}">${(wo.notes || []).map(n => `<p><small>${n.author} (${n.timestamp.toDate().toLocaleDateString()}): ${n.text}</small></p>`).join('') || '<p><small>No notes yet.</small></p>'}</div><textarea id="note-${doc.id}" class="form-input" rows="2" placeholder="Add a new note..."></textarea></div>
                                    <div class="wo-actions">
                                       <button class="btn btn-secondary" data-action="save-wo-changes" data-vehicle-id="${vehicleId}" data-wo-id="${doc.id}">Save Changes</button>
                                       <button class="btn btn-primary" data-action="complete-wo" data-vehicle-id="${vehicleId}" data-wo-id="${doc.id}">Mark as Completed</button>
                                    </div>
                                </div>
                            </div>
                        </div>`;
                }
            }
            content += '</div>';

            container.innerHTML = hasWorkOrders ? content : '<h4>Pending Work Orders</h4><p>No pending work orders found for vehicles.</p>';
        } catch (error) {
            console.error("Error rendering work orders:", error);
            container.innerHTML = '<p class="text-danger">Could not retrieve work orders. A Firestore Index may be required.</p>';
        }
    }

    toggleWoDetails(workOrderId) {
        const body = document.getElementById(`wo-body-${workOrderId}`);
        if(body) body.style.display = body.style.display === 'block' ? 'none' : 'block';
    }

    async saveWoChanges(vehicleId, workOrderId) {
        const costInput = document.getElementById(`repairCost-${workOrderId}`);
        const newNoteInput = document.getElementById(`note-${workOrderId}`);
        const targetDateInput = document.getElementById(`targetDate-${workOrderId}`);
        const updateData = {};

        if (newNoteInput.value.trim()) updateData.notes = firebase.firestore.FieldValue.arrayUnion({text: newNoteInput.value.trim(), author: "Admin", timestamp: firebase.firestore.Timestamp.now()});
        if (costInput.value) { const cost = parseFloat(costInput.value); if (!isNaN(cost)) updateData.repairCost = cost; }
        if (targetDateInput.value) updateData.targetFixDate = firebase.firestore.Timestamp.fromDate(new Date(targetDateInput.value));

        try {
            await this.db.collection('hou_fleet').doc(vehicleId).collection('workOrders').doc(workOrderId).update(updateData);
            this.app.showSuccess("Work order updated!");
            this.renderWorkOrdersView();
        } catch (error) { this.app.showError("Failed to save changes."); }
    }

    async completeWo(vehicleId, workOrderId) {
        if (!confirm("Are you sure?")) return;
        const costInput = document.getElementById(`repairCost-${workOrderId}`);
        const updateData = { status: 'Completed', completedAt: firebase.firestore.Timestamp.now() };
        if(costInput.value) { const cost = parseFloat(costInput.value); if (!isNaN(cost)) updateData.repairCost = cost; }

        try {
            await this.db.collection('hou_fleet').doc(vehicleId).collection('workOrders').doc(workOrderId).update(updateData);
            this.app.showSuccess("Work order completed!");
            this.renderWorkOrdersView();
        } catch (error) { this.app.showError("Failed to complete work order."); }
    }

    openWorkOrderModal(vehicleId) {
        const vehicle = this.fleetData.find(v => v.id === vehicleId);
        if (!vehicle) return;
        const modalBody = `<div class="form-group"><label>Issue Description</label><textarea id="woDescription" class="form-input" rows="4"></textarea></div>`;
        this.app.modalManager.showModal(`New Work Order for ${vehicle.truckNumber}`, modalBody, [
            { text: 'Cancel', class: 'btn-secondary', onclick: 'warehouseApp.modalManager.closeModal()' },
            { text: 'Submit', class: 'btn-primary', onclick: `warehouseApp.fleetManager.submitWorkOrder('${vehicle.id}')` }
        ]);
    }

    async submitWorkOrder(vehicleId) {
        const description = document.getElementById('woDescription').value.trim();
        if (!description) return alert('Please provide a description.');
        try {
            const vehicleDocRef = this.db.collection('hou_fleet').doc(vehicleId);
            await vehicleDocRef.collection('workOrders').add({
                issueDescription: description,
                dateReported: firebase.firestore.Timestamp.now(),
                status: 'Open',
            });
            await vehicleDocRef.set({ status: 'In Repairs' }, { merge: true });

            const vehicle = this.fleetData.find(v => v.id === vehicleId);
            if(vehicle) vehicle.status = 'In Repairs';

            this.app.showSuccess('Work order submitted!');
            this.app.modalManager.closeModal();
            this.renderFleetTab();
        } catch (error) { this.app.showError('Failed to submit work order.'); }
    }

    openInspectionModal(vehicleId) {
        const vehicle = this.fleetData.find(v => v.id === vehicleId);
        if (!vehicle) return;

        const today = new Date().toLocaleDateString();
        const driverName = vehicle.assignedTo || 'Unassigned';

        const createInspectionRow = (label, id, type = 'checkbox') => {
            let controls = '';
            if (type === 'checkbox') {
                controls = `
                    <div class="inspection-choice"><label><input type="radio" name="${id}" value="good" checked> Good</label></div>
                    <div class="inspection-choice"><label><input type="radio" name="${id}" value="bad"> Bad</label></div>
                `;
            } else if (type === 'yesno') {
                controls = `
                    <div class="inspection-choice"><label><input type="radio" name="${id}" value="no" checked> No</label></div>
                    <div class="inspection-choice"><label><input type="radio" name="${id}" value="yes"> Yes</label></div>
                `;
            }
            const detailsInput = `<input type="text" class="form-input details-input" id="${id}-details" placeholder="Details...">`;

            return `
                <div class="inspection-row">
                    <div class="inspection-label">${label}</div>
                    <div class="inspection-controls">${controls}</div>
                    <div class="inspection-details">${detailsInput}</div>
                </div>
            `;
        };

        const modalBody = `
            <style>
                .inspection-form-container { display: flex; flex-direction: column; gap: 8px; }
                .inspection-row { display: grid; grid-template-columns: 2fr 1.5fr 3fr; gap: 16px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border-color); }
                .inspection-row:last-child { border-bottom: none; }
                .inspection-label { font-weight: 500; }
                .inspection-controls { display: flex; gap: 16px; justify-content: center; }
                .inspection-choice { display: flex; align-items: center; }
                .inspection-choice input { margin-right: 5px; }
                .details-input { font-size: 14px; padding: 6px 10px; }
                .form-grid-info { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
            </style>
            <div class="inspection-form-container">
                <div class="form-grid-info">
                    <div class="form-group"><label>Date</label><input type="text" class="form-input" id="inspection-date" value="${today}" readonly></div>
                    <div class="form-group"><label>Driver</label><input type="text" class="form-input" id="inspection-driver" value="${driverName}" readonly></div>
                    <div class="form-group"><label>Vehicle #</label><input type="text" class="form-input" id="inspection-vehicle" value="${vehicle.truckNumber}" readonly></div>
                    <div class="form-group"><label>Current Mileage</label><input type="number" class="form-input" id="inspection-mileage" placeholder="Enter current mileage" value="${vehicle.mileage || ''}"></div>
                </div>
                <div class="inspection-row" style="background: #f8f9fa; font-weight: bold; padding: 8px;"><div class="inspection-label">Item</div><div class="inspection-controls">Status</div><div class="inspection-details">Details</div></div>
                ${createInspectionRow('Head lights', 'head-lights')}
                ${createInspectionRow('Turn Signals', 'turn-signals')}
                ${createInspectionRow('Brake Lights', 'brake-lights')}
                ${createInspectionRow('Dashboard warning lights on?', 'warning-lights', 'yesno')}
                ${createInspectionRow('Any new body or windshield damages?', 'damages', 'yesno')}
                ${createInspectionRow('Hearing any high pitch noises when you brake?', 'brake-noises', 'yesno')}
                ${createInspectionRow('Tire Tread', 'tire-tread')}
                ${createInspectionRow('Windshield Wipers', 'wipers')}
                ${createInspectionRow('Fluids', 'fluids')}
                ${createInspectionRow('Leaks', 'leaks')}
                ${createInspectionRow('Interior Cleanliness', 'interior-cleanliness')}
                ${createInspectionRow('Exterior Cleanliness', 'exterior-cleanliness')}
                <div class="form-group" style="margin-top: 20px;"><label for="driver-signature">Driver Signature (Type Full Name)</label><input type="text" id="driver-signature" class="form-input" placeholder="Type your full name to sign"></div>
            </div>
        `;

        this.app.modalManager.showModal(`Monthly Inspection for ${vehicle.truckNumber}`, modalBody, [
            { text: 'Cancel', class: 'btn-secondary', onclick: 'warehouseApp.modalManager.closeModal()' },
            { text: 'Submit Inspection', class: 'btn-primary', onclick: `warehouseApp.fleetManager.submitInspection('${vehicle.id}')` }
        ]);
    }

    async submitInspection(vehicleId) {
        const inspectionData = {
            inspectionDate: firebase.firestore.Timestamp.now(),
            driver: document.getElementById('inspection-driver').value,
            vehicleNumber: document.getElementById('inspection-vehicle').value,
            mileage: parseInt(document.getElementById('inspection-mileage').value) || 0,
            signature: document.getElementById('driver-signature').value.trim(),
            items: {}
        };

        if (!inspectionData.signature) return alert('Driver signature is required to submit the inspection.');
        if (inspectionData.mileage <= 0) return alert('Please enter the current mileage.');

        const itemIds = ['head-lights', 'turn-signals', 'brake-lights', 'warning-lights', 'damages', 'brake-noises', 'tire-tread', 'wipers', 'fluids', 'leaks', 'interior-cleanliness', 'exterior-cleanliness'];
        let hasIssues = false;
        let woDescription = "Issues found during monthly inspection:\n";

        for (const id of itemIds) {
            const value = document.querySelector(`input[name="${id}"]:checked`).value;
            const details = document.getElementById(`${id}-details`).value.trim();
            inspectionData.items[id] = { value, details };

            if (value === 'bad' || value === 'yes') {
                hasIssues = true;
                const label = document.querySelector(`input[name="${id}"]`).closest('.inspection-row').querySelector('.inspection-label').textContent;
                 if (!details) {
                    return alert(`Details are required for "${label}".`);
                }
                woDescription += `- ${label}: ${details}\n`;
            }
        }

        try {
            const vehicleDocRef = this.db.collection('hou_fleet').doc(vehicleId);
            await vehicleDocRef.collection('inspections').add(inspectionData);

            let updatePayload = {
                mileage: inspectionData.mileage
            };

            if (hasIssues) {
                await vehicleDocRef.collection('workOrders').add({ issueDescription: woDescription, dateReported: firebase.firestore.Timestamp.now(), status: 'Open', source: 'Monthly Inspection' });
                updatePayload.status = 'In Repairs';
            }
            
            await vehicleDocRef.set(updatePayload, { merge: true });

            const vehicle = this.fleetData.find(v => v.id === vehicleId);
            if (vehicle) {
                vehicle.mileage = inspectionData.mileage;
                if(hasIssues) vehicle.status = 'In Repairs';
            }

            this.app.showSuccess('Inspection submitted successfully!');
            this.app.modalManager.closeModal();
            this.renderFleetTab();
            this.renderFleetDashboard();
        } catch (error) {
            console.error("Error submitting inspection:", error);
            this.app.showError('Failed to submit inspection.');
        }
    }

    openRepairModal(vehicleId) {
        const modalBody = `
            <div class="form-grid">
                <div class="form-group"><label>Repair Date</label><input type="date" id="repairDate" class="form-input" value="${new Date().toISOString().slice(0, 10)}"></div>
                <div class="form-group"><label>Repair Cost</label><input type="number" id="repairCost" class="form-input" placeholder="0.00"></div>
                <div class="form-group full-width"><label>Description</label><textarea id="repairDescription" class="form-input"></textarea></div>
            </div>`;
        this.app.modalManager.showModal('Log Manual Repair', modalBody, [
            { text: 'Cancel', class: 'btn-secondary', onclick: 'warehouseApp.modalManager.closeModal()' },
            { text: 'Log Repair', class: 'btn-primary', onclick: `warehouseApp.fleetManager.logRepair('${vehicleId}')` }
        ]);
    }

    async logRepair(vehicleId) {
        const cost = parseFloat(document.getElementById('repairCost').value);
        const description = document.getElementById('repairDescription').value;
        const date = document.getElementById('repairDate').value;
        if (!cost || !description || !date) return alert('Please fill out all fields.');

        try {
            await this.db.collection('hou_fleet').doc(vehicleId).collection('repairs').add({
                cost, description, date: firebase.firestore.Timestamp.fromDate(new Date(date))
            });
            this.app.showSuccess('Repair logged successfully!');
            this.app.modalManager.closeModal();
        } catch (error) { this.app.showError('Failed to log repair.'); }
    }
}