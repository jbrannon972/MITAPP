class EquipmentManager {
    constructor(app) {
        this.app = app;
        this.db = app.firebaseService.db;
        this.equipment = [];
        this.html5QrCode = null;
        this.activeStatusFilters = []; // Can be 'active', 'maintenance', 'retired'
        this.activeTypeFilters = [];   // Can be 'Dehumidifier', 'Fan', 'Air Scrubber'
    }

    async initialize() {
        if (document.getElementById('equipment-view')) {
            await this.loadEquipmentData();
            this.handleUrlQrCode();
            this.renderEquipmentTab();
            // Add a listener to switch views on resize
            window.addEventListener('resize', () => this.applyFilters(document.getElementById('equipmentSearch').value));
        }
    }

    async getOutstandingWOCount() {
        try {
            const woSnapshot = await this.db.collectionGroup('workOrders').where('status', '==', 'Open').get();
            let count = 0;
            woSnapshot.forEach(doc => {
                // We must check if the parent collection is 'equipment'
                if (doc.ref.parent.parent.parent.path === 'equipment') {
                    count++;
                }
            });
            return count;
        } catch (error) {
            console.error("Error fetching equipment WO count:", error);
            return 'N/A';
        }
    }

    async handleUrlQrCode() {
        const urlParams = new URLSearchParams(window.location.search);
        const qrCode = urlParams.get('qr');
    
        if (qrCode) {
            console.log(`QR code found in URL: ${qrCode}.`);
            if (this.equipment.length === 0) {
                await this.loadEquipmentData();
            }
    
            const foundItem = this.equipment.find(item => item.qrCode === qrCode);
    
            if (foundItem) {
                setTimeout(() => this.openEquipmentModal(foundItem.id), 500);
            } else {
                setTimeout(() => this.promptToAddEquipment(qrCode), 500);
            }
            
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }
    }
    
    renderEquipmentTab() {
        const container = document.getElementById('equipment-tab-content');
        if (!container) return;

        container.innerHTML = `
            <div class="tab-header">
                <div class="tab-controls">
                    <button class="btn btn-secondary" id="toggle-stats-btn" style="display: none;"><i class="fas fa-chart-bar"></i> Stats</button>
                    <button class="btn btn-secondary" id="check-grain-depression-btn"><i class="fas fa-tint"></i> Check Grain Dep.</button>
                    <button class="btn btn-secondary" id="scan-qr-code-btn"><i class="fas fa-qrcode"></i> Scan QR</button>
                    <button class="btn btn-primary" id="add-equipment-btn"><i class="fas fa-plus"></i> Add</button>
                </div>
            </div>
            <div id="stats-container">
                <div class="dashboard-grid" id="equipment-summary"></div>
            </div>
            <div class="card list-card">
                <div class="card-header">
                    <h3><i class="fas fa-list"></i> Equipment Inventory</h3>
                    <div class="list-search-wrapper">
                        <i class="fas fa-search"></i>
                        <input type="text" id="equipmentSearch" placeholder="Search by model, serial, or QR...">
                    </div>
                </div>
                <div class="mobile-list-container" id="equipment-list-container-cards"></div>
                <div class="table-container" id="equipment-list-container-table">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Type</th>
                                <th>Model</th>
                                <th>Serial #</th>
                                <th>QR Code</th>
                                <th>Status</th>
                                <th style="text-align: right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="equipment-table-body"></tbody>
                    </table>
                </div>
            </div>
        `;
        
        this.setupEventListeners();
        this.renderDashboard();
        this.applyFilters();
    }


    setupEventListeners() {
        // Use #equipment-view as the parent for event delegation
        const view = document.getElementById('equipment-view');
        if(!view) return;

        view.querySelector('#add-equipment-btn')?.addEventListener('click', () => this.openEquipmentModal());
        view.querySelector('#scan-qr-code-btn')?.addEventListener('click', () => this.openQrScanner(this.handleHeaderScan.bind(this)));
        view.querySelector('#check-grain-depression-btn')?.addEventListener('click', () => this.openQrScanner(this.handleGrainDepressionScan.bind(this)));
        
        view.querySelector('#equipmentSearch')?.addEventListener('input', (e) => this.applyFilters(e.target.value));

        const toggleBtn = view.querySelector('#toggle-stats-btn');
        toggleBtn?.addEventListener('click', () => {
            const statsContainer = view.querySelector('#stats-container');
            statsContainer.classList.toggle('expanded');
        });
    }

    async renderWorkOrdersView() {
        const container = document.getElementById('work-orders-view');
        if (!container) return;
        container.innerHTML = '<p>Loading work orders...</p>';

        try {
            const woSnapshot = await this.db.collectionGroup('workOrders').where('status', '==', 'Open').get();
            let content = '<div class="wo-accordion-container">';
            let hasWOs = false;

            woSnapshot.forEach(doc => {
                if (doc.ref.parent.parent.parent.path === 'equipment') {
                    hasWOs = true;
                    const wo = doc.data();
                    const equipmentId = doc.ref.parent.parent.id;
                    const equipment = this.equipment.find(e => e.id === equipmentId);
                    const targetDate = wo.targetFixDate ? wo.targetFixDate.toDate().toISOString().split('T')[0] : '';
                    
                    content += `
                        <div class="wo-item">
                            <div class="wo-header" onclick="laborTool.equipmentManager.toggleWoDetails('${doc.id}')">
                                <h5>${equipment?.model || 'Unknown'} (QR: ${equipment?.qrCode || 'N/A'})</h5>
                                <p class="wo-date">Reported: ${wo.dateReported.toDate().toLocaleDateString()}</p>
                            </div>
                            <div class="wo-body" id="wo-body-${doc.id}">
                                <p class="wo-description-full">${wo.issueDescription}</p>
                                <div class="wo-card">
                                    <div class="form-group"><label>Target Fix Date</label><input type="date" id="targetDate-${doc.id}" class="form-input" value="${targetDate}"></div>
                                    <div class="form-group">
                                        <label>Notes</label>
                                        <div class="wo-notes-list">${(wo.notes || []).map(n => `<p><small>${n.author} (${n.timestamp.toDate().toLocaleDateString()}): ${n.text}</small></p>`).join('') || '<p><small>No notes yet.</small></p>'}</div>
                                        <textarea id="note-${doc.id}" class="form-input" rows="2" placeholder="Add a new note..."></textarea>
                                    </div>
                                    <div class="wo-actions">
                                        <button class="btn btn-secondary" onclick="laborTool.equipmentManager.saveWoChanges('${equipmentId}', '${doc.id}')">Save Changes</button>
                                        <button class="btn btn-primary" onclick="laborTool.equipmentManager.completeWo('${equipmentId}', '${doc.id}')">Mark as Completed</button>
                                    </div>
                                </div>
                            </div>
                        </div>`;
                }
            });
            content += '</div>';
            container.innerHTML = hasWOs ? content : '<h4>Pending Work Orders</h4><p>No pending work orders found.</p>';
        } catch (error) {
            console.error("Error fetching pending work orders:", error);
            container.innerHTML = '<p class="text-danger">Could not retrieve work orders.</p>';
        }
    }
    
    toggleWoDetails(workOrderId) {
        const body = document.getElementById(`wo-body-${workOrderId}`);
        if (body) {
            body.style.display = body.style.display === 'block' ? 'none' : 'block';
        }
    }

    async saveWoChanges(equipmentId, workOrderId) {
        const targetDateInput = document.getElementById(`targetDate-${workOrderId}`);
        const newNoteInput = document.getElementById(`note-${workOrderId}`);
        const updateData = {};

        if (targetDateInput.value) {
            updateData.targetFixDate = firebase.firestore.Timestamp.fromDate(new Date(targetDateInput.value));
        }
        if (newNoteInput.value.trim()) {
            updateData.notes = firebase.firestore.FieldValue.arrayUnion({
                text: newNoteInput.value.trim(),
                author: "Admin",
                timestamp: firebase.firestore.Timestamp.now()
            });
        }

        if (Object.keys(updateData).length === 0) return alert("Nothing to save.");

        try {
            await this.db.collection('equipment').doc(equipmentId).collection('workOrders').doc(workOrderId).update(updateData);
            this.app.showSuccess("Work order updated!");
            this.renderWorkOrdersView(); 
        } catch (error) {
            this.app.showError("Failed to save changes.");
        }
    }

    async completeWo(equipmentId, workOrderId) {
        if (!confirm("Are you sure?")) return;
        try {
            await this.db.collection('equipment').doc(equipmentId).collection('workOrders').doc(workOrderId).update({
                status: 'Completed',
                completedAt: firebase.firestore.Timestamp.now()
            });
            this.app.showSuccess("Work order completed!");
            document.getElementById(`wo-body-${workOrderId}`).parentElement.remove();
        } catch (error) {
            this.app.showError("Failed to complete work order.");
        }
    }
    
    async openQrScanner(onSuccessCallback) {
        const modalBody = `
            <div id="qr-reader-container" style="width: 100%;">
                <p>Point camera at a QR code. Use the slider to zoom if needed.</p>
                <div id="qr-reader" style="border-radius: 8px; overflow: hidden; position: relative;"></div>
                <div id="zoom-controls" style="display: none; padding: 10px; text-align: center;">
                    <label for="zoom-slider">Zoom:</label>
                    <input type="range" id="zoom-slider" min="1" max="5" step="0.1" value="1" style="width: 70%;">
                </div>
                <div style="text-align: center; margin-top: 15px;">
                    <p><strong>Or, if the scanner isn't working:</strong></p>
                    <input type="file" id="qr-image-upload" accept="image/*" style="display: none;">
                    <button class="btn btn-secondary" onclick="document.getElementById('qr-image-upload').click()">
                        <i class="fas fa-upload"></i> Upload QR Code Image
                    </button>
                </div>
            </div>
        `;
        const footerButtons = [{ text: 'Cancel', class: 'btn-secondary', onclick: 'laborTool.equipmentManager.stopQrScanner(true)' }];
        this.app.modalManager.showModal('Scan Equipment QR Code', modalBody, footerButtons);
        
        this.html5QrCode = new Html5Qrcode("qr-reader", { verbose: true });

        const successCallback = (decodedText) => {
            this.stopQrScanner(false);
            this.app.modalManager.closeModal();
            if (onSuccessCallback) {
                onSuccessCallback(decodedText);
            }
        };

        document.getElementById('qr-image-upload').addEventListener('change', async (e) => {
            if (e.target.files && e.target.files.length > 0) {
                try {
                    const decodedText = await this.html5QrCode.scanFile(e.target.files[0], false);
                    successCallback(decodedText);
                } catch (err) {
                    alert("Could not read a QR code from the uploaded image.");
                }
            }
        });

        try {
            await this.html5QrCode.start(
                { facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } },
                successCallback, () => {}
            );
            window.addEventListener('orientationchange', () => this.html5QrCode.restart());

            setTimeout(() => {
                const video = document.querySelector('#qr-reader video');
                if (video && video.srcObject) {
                    const track = video.srcObject.getVideoTracks()[0];
                    const capabilities = track.getCapabilities();
                    if (capabilities.zoom) {
                        const zoomSlider = document.getElementById('zoom-slider');
                        zoomSlider.min = capabilities.zoom.min;
                        zoomSlider.max = capabilities.zoom.max;
                        zoomSlider.step = capabilities.zoom.step;
                        zoomSlider.value = track.getSettings().zoom || 1;
                        document.getElementById('zoom-controls').style.display = 'block';
                        zoomSlider.addEventListener('input', () => {
                            track.applyConstraints({ advanced: [{ zoom: zoomSlider.value }] });
                        });
                    }
                }
            }, 1000);

        } catch (err) {
            document.getElementById('qr-reader').innerHTML = `<p>Error: ${err.message}. Please allow camera access or upload an image.</p>`;
        }
    }

    stopQrScanner(shouldCloseModal) {
        if (this.html5QrCode && this.html5QrCode.isScanning) {
            this.html5QrCode.stop().then(() => {
                if (shouldCloseModal) {
                    this.app.modalManager.closeModal();
                }
            }).catch(() => {
                 if (shouldCloseModal) {
                    this.app.modalManager.closeModal();
                }
            });
        } else if (shouldCloseModal) {
            this.app.modalManager.closeModal();
        }
    }

    handleHeaderScan(qrCode) {
        const foundItem = this.equipment.find(t => t.qrCode === qrCode);
        foundItem ? this.openEquipmentModal(foundItem.id) : this.promptToAddEquipment(qrCode);
    }

    handleGrainDepressionScan(qrCode) {
        const foundItem = this.equipment.find(t => t.qrCode === qrCode);
        foundItem ? this.openGrainDepressionModal(foundItem) : this.promptToAddEquipment(qrCode);
    }

    promptToAddEquipment(qrCode) {
        const message = `<p>The scanned QR code "<strong>${qrCode}</strong>" was not found.</p><p>Would you like to add it as a new piece of equipment?</p>`;
        this.app.modalManager.showModal('Equipment Not Found', message, [
            { text: 'Cancel', class: 'btn-secondary', onclick: 'laborTool.modalManager.closeModal()' },
            { text: 'Add New', class: 'btn-primary', onclick: `laborTool.equipmentManager.closeModal(); laborTool.equipmentManager.openEquipmentModal(null, '${qrCode}')` }
        ]);
    }

    async loadEquipmentData() {
        try {
            const snapshot = await this.db.collection("equipment").orderBy("createdAt", "desc").get();
            this.equipment = snapshot.docs.map(e => ({ id: e.id, ...e.data() }));
        } catch (error) {
            this.app.showError("Could not load equipment data.");
        }
    }

    renderDashboard() {
        const summaryContainer = document.getElementById("equipment-summary");
        if (!summaryContainer) return;

        const total = this.equipment.length;
        const active = this.equipment.filter(e => e.status === 'active').length;
        const inMaintenance = this.equipment.filter(e => e.status === 'maintenance').length;
        const retired = this.equipment.filter(e => e.status === 'retired').length;
        const dehus = this.equipment.filter(e => e.type === 'Dehumidifier').length;
        const fans = this.equipment.filter(e => e.type === 'Fan').length;
        const scrubbers = this.equipment.filter(e => e.type === 'Air Scrubber').length;

        summaryContainer.innerHTML = `
            <div id="filter-card-all" class="card metric-card single-line" onclick="laborTool.equipmentManager.resetFilters()">
                <div class="metric-header"><h3><i class="fas fa-boxes-stacked"></i> Total Units</h3></div><span class="stat-value">${total}</span>
            </div>
            <div id="filter-card-active" class="card metric-card single-line" onclick="laborTool.equipmentManager.toggleStatusFilter('active')">
                <div class="metric-header"><h3><i class="fas fa-check-circle"></i> Active</h3></div><span class="stat-value">${active}</span>
            </div>
            <div id="filter-card-maintenance" class="card metric-card single-line" onclick="laborTool.equipmentManager.toggleStatusFilter('maintenance')">
                <div class="metric-header"><h3><i class="fas fa-tools"></i> In Maintenance</h3></div><span class="stat-value">${inMaintenance}</span>
            </div>
            <div id="filter-card-retired" class="card metric-card single-line" onclick="laborTool.equipmentManager.toggleStatusFilter('retired')">
                <div class="metric-header"><h3><i class="fas fa-times-circle"></i> Retired</h3></div><span class="stat-value">${retired}</span>
            </div>
            <div id="filter-card-Dehumidifier" class="card metric-card single-line" onclick="laborTool.equipmentManager.toggleTypeFilter('Dehumidifier')">
                <div class="metric-header"><h3><i class="fas fa-wind"></i> Dehus</h3></div><span class="stat-value">${dehus}</span>
            </div>
            <div id="filter-card-Fan" class="card metric-card single-line" onclick="laborTool.equipmentManager.toggleTypeFilter('Fan')">
                <div class="metric-header"><h3><i class="fas fa-fan"></i> Fans</h3></div><span class="stat-value">${fans}</span>
            </div>
            <div id="filter-card-Air Scrubber" class="card metric-card single-line" onclick="laborTool.equipmentManager.toggleTypeFilter('Air Scrubber')">
                <div class="metric-header"><h3><i class="fas fa-virus-slash"></i> Scrubbers</h3></div><span class="stat-value">${scrubbers}</span>
            </div>`;

        this.updateActiveFilterUI();
    }
    
    resetFilters() {
        this.activeStatusFilters = [];
        this.activeTypeFilters = [];
        this.applyFilters(document.getElementById('equipmentSearch').value);
    }

    toggleStatusFilter(status) {
        const index = this.activeStatusFilters.indexOf(status);
        if (index > -1) this.activeStatusFilters.splice(index, 1);
        else this.activeStatusFilters.push(status);
        this.applyFilters(document.getElementById('equipmentSearch').value);
    }
    
    toggleTypeFilter(type) {
        const index = this.activeTypeFilters.indexOf(type);
        if (index > -1) this.activeTypeFilters.splice(index, 1);
        else this.activeTypeFilters.push(type);
        this.applyFilters(document.getElementById('equipmentSearch').value);
    }

    applyFilters(searchTerm = '') {
        const lowercasedSearchTerm = searchTerm.toLowerCase();
        let filteredEquipment = this.equipment;

        if (this.activeStatusFilters.length > 0) {
            filteredEquipment = filteredEquipment.filter(item => this.activeStatusFilters.includes(item.status));
        }
        if (this.activeTypeFilters.length > 0) {
            filteredEquipment = filteredEquipment.filter(item => this.activeTypeFilters.includes(item.type));
        }
        if (lowercasedSearchTerm) {
            filteredEquipment = filteredEquipment.filter(item =>
                item.model?.toLowerCase().includes(lowercasedSearchTerm) ||
                item.serialNumber?.toLowerCase().includes(lowercasedSearchTerm) ||
                item.qrCode?.toLowerCase().includes(lowercasedSearchTerm)
            );
        }
        
        if (window.matchMedia('(max-width: 768px)').matches) {
            this.renderEquipmentAsCards(filteredEquipment);
        } else {
            this.renderEquipmentAsTable(filteredEquipment);
        }

        this.updateActiveFilterUI();
    }

    updateActiveFilterUI() {
        document.querySelectorAll('.metric-card').forEach(card => card.classList.remove('active-filter'));
        
        if (this.activeStatusFilters.length === 0 && this.activeTypeFilters.length === 0) {
             document.getElementById('filter-card-all')?.classList.add('active-filter');
        } else {
            this.activeStatusFilters.forEach(status => {
                document.getElementById(`filter-card-${status}`)?.classList.add('active-filter');
            });
            this.activeTypeFilters.forEach(type => {
                document.getElementById(`filter-card-${type}`)?.classList.add('active-filter');
            });
        }
    }
    
    renderEquipmentAsCards(filteredData) {
        const listContainer = document.getElementById("equipment-list-container-cards");
        if (!listContainer) return;
        
        if (filteredData.length === 0) {
            listContainer.innerHTML = `<div class="list-empty-state"><i class="fas fa-search-minus"></i><p>No equipment matches your filters.</p></div>`;
            return;
        }

        const cardsHtml = filteredData.map(item => {
            const iconClass = { 'Dehumidifier': 'fas fa-wind', 'Fan': 'fas fa-fan', 'Air Scrubber': 'fas fa-virus-slash' }[item.type] || 'fas fa-box';
            return `
                <div class="item-card" onclick="laborTool.equipmentManager.openEquipmentModal('${item.id}')">
                    <div class="item-card-header"><i class="${iconClass} item-icon"></i><h4 class="item-title">${item.model || 'N/A'}</h4><span class="status-badge status-${item.status}">${item.status || "N/A"}</span></div>
                    <div class="item-card-body"><div class="item-detail"><span class="item-label">Serial #</span><span class="item-value">${item.serialNumber || "N/A"}</span></div><div class="item-detail"><span class="item-label">QR Code</span><span class="item-value">${item.qrCode || "N/A"}</span></div></div>
                </div>`;
        }).join('');
        listContainer.innerHTML = cardsHtml;
    }

    renderEquipmentAsTable(filteredData) {
        const tableBody = document.getElementById("equipment-table-body");
        if (!tableBody) return;

        if (filteredData.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" class="text-center">No equipment matches your filters.</td></tr>`;
            return;
        }

        const rowsHtml = filteredData.map(item => `
            <tr onclick="laborTool.equipmentManager.openEquipmentModal('${item.id}')" style="cursor: pointer;">
                <td data-label="Type">${item.type || 'N/A'}</td>
                <td data-label="Model">${item.model || 'N/A'}</td>
                <td data-label="Serial #">${item.serialNumber || 'N/A'}</td>
                <td data-label="QR Code">${item.qrCode || 'N/A'}</td>
                <td data-label="Status"><span class="status-badge status-${item.status}">${item.status || "N/A"}</span></td>
                <td data-label="Actions" class="actions" style="text-align: right;">
                    <button class="btn btn-secondary btn-small" onclick="event.stopPropagation(); laborTool.equipmentManager.openEquipmentModal('${item.id}')">View/Edit</button>
                </td>
            </tr>
        `).join('');
        tableBody.innerHTML = rowsHtml;
    }

    calculateGPP(tempF, rh) {
        if (isNaN(tempF) || isNaN(rh) || 0 === rh) return 0;
        const tempC = (tempF - 32) / 1.8;
        const satPressure = 6.11 * Math.pow(10, 7.5 * tempC / (237.7 + tempC));
        const vaporPressure = satPressure * (rh / 100);
        return 7e3 * (.62198 * vaporPressure / (1013.25 - vaporPressure));
    }

    openGrainDepressionModal(item) {
        const modalBody = `
            <div class="grain-calc-grid">
                <div class="grain-calc-section"><h4>Inlet Readings</h4><div class="form-group"><label>Temp (°F)</label><input type="number" id="tempIn" class="form-input" oninput="laborTool.equipmentManager.updateGrainCalc()"></div><div class="form-group"><label>RH (%)</label><input type="number" id="rhIn" class="form-input" oninput="laborTool.equipmentManager.updateGrainCalc()"></div><p style="text-align:center; font-weight:bold;">GPP: <span id="gppInResult">0</span></p></div>
                <div class="grain-calc-section"><h4>Outlet Readings</h4><div class="form-group"><label>Temp (°F)</label><input type="number" id="tempOut" class="form-input" oninput="laborTool.equipmentManager.updateGrainCalc()"></div><div class="form-group"><label>RH (%)</label><input type="number" id="rhOut" class="form-input" oninput="laborTool.equipmentManager.updateGrainCalc()"></div><p style="text-align:center; font-weight:bold;">GPP: <span id="gppOutResult">0</span></p></div>
            </div>
            <div class="grain-results-display"><h3>Grain Depression</h3><div class="result-value" id="grainDepressionResult">0</div></div>`;
        const footerButtons = [{ text: "Cancel", class: "btn-secondary", onclick: "laborTool.closeModal()" }, { text: "Log Grain Depression", class: "btn-primary", onclick: `laborTool.equipmentManager.logGrainDepression('${item.id}')` }];
        this.app.modalManager.showModal(`Grain Depression for ${item.model}`, modalBody, footerButtons);
    }

    updateGrainCalc() {
        const tempIn = parseFloat(document.getElementById("tempIn").value);
        const rhIn = parseFloat(document.getElementById("rhIn").value);
        const tempOut = parseFloat(document.getElementById("tempOut").value);
        const rhOut = parseFloat(document.getElementById("rhOut").value);
        const gppIn = this.calculateGPP(tempIn, rhIn);
        const gppOut = this.calculateGPP(tempOut, rhOut);
        document.getElementById("gppInResult").textContent = gppIn.toFixed(2);
        document.getElementById("gppOutResult").textContent = gppOut.toFixed(2);
        document.getElementById("grainDepressionResult").textContent = (gppIn - gppOut).toFixed(2);
    }

    async logGrainDepression(equipmentId) {
        const data = {
            tempIn: parseFloat(document.getElementById("tempIn").value) || 0, rhIn: parseFloat(document.getElementById("rhIn").value) || 0,
            tempOut: parseFloat(document.getElementById("tempOut").value) || 0, rhOut: parseFloat(document.getElementById("rhOut").value) || 0,
            gppIn: parseFloat(document.getElementById("gppInResult").textContent) || 0, gppOut: parseFloat(document.getElementById("gppOutResult").textContent) || 0,
            grainDepression: parseFloat(document.getElementById("grainDepressionResult").textContent) || 0, loggedAt: firebase.firestore.Timestamp.now()
        };
        if (0 === data.grainDepression) return alert("Cannot log a grain depression of 0.");
        try {
            await this.db.collection("equipment").doc(equipmentId).collection("grainDepressionHistory").add(data);
            this.app.showSuccess("Grain depression logged!");
            this.closeModal();
        } catch (error) {
            this.app.showError("Failed to log data.");
        }
    }

    async openEquipmentModal(equipmentId = null, qrCode = null) {
        this.currentEditingId = equipmentId;
        const isNew = !equipmentId;
        const item = isNew ? {} : this.equipment.find(e => e.id === equipmentId);
        const title = isNew ? "Add New Equipment" : `Manage ${item?.model || "Equipment"}`;
        
        const models = [...new Set(this.equipment.map(e => e.model).filter(Boolean))];
        const modelOptions = models.map(m => `<option value="${m}" ${item?.model === m ? "selected" : ""}>${m}</option>`).join("");
        
        const statuses = ['active', 'maintenance', 'retired'];
        const statusOptions = statuses.map(s => `<option value="${s}" ${item?.status === s ? "selected" : ""}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join("");

        let workOrders = [], repairHistory = [], grainHistory = [];
        if (!isNew) {
            const [woSnap, repairSnap, grainSnap] = await Promise.all([
                this.db.collection("equipment").doc(equipmentId).collection("workOrders").orderBy("dateReported", "desc").get(),
                this.db.collection("equipment").doc(equipmentId).collection("repairHistory").orderBy("dateCompleted", "desc").get(),
                this.db.collection("equipment").doc(equipmentId).collection("grainDepressionHistory").orderBy("loggedAt", "desc").get()
            ]);
            workOrders = woSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            repairHistory = repairSnap.docs.map(doc => doc.data());
            grainHistory = grainSnap.docs.map(doc => doc.data());
        }

        const modalBody = `
            <div class="modal-tabs">
                <button class="modal-tab-btn active" data-tab="details">Details</button>
                <button class="modal-tab-btn" data-tab="notes" ${isNew ? "disabled" : ""}>Notes</button>
                <button class="modal-tab-btn" data-tab="wo" ${isNew ? "disabled" : ""}>Work Orders</button>
                <button class="modal-tab-btn" data-tab="repair" ${isNew ? "disabled" : ""}>Repairs</button>
                <button class="modal-tab-btn" data-tab="grain" ${isNew ? "disabled" : ""}>Grain History</button>
            </div>
            <div id="details-tab" class="modal-tab-content active">
                <div class="form-grid equipment-form">
                    <div class="form-group"><label>Type</label><select id="equipmentType" class="form-input"><option value="Dehumidifier" ${"Dehumidifier"===item?.type?"selected":""}>Dehumidifier</option><option value="Fan" ${"Fan"===item?.type?"selected":""}>Fan</option><option value="Air Scrubber" ${"Air Scrubber"===item?.type?"selected":""}>Air Scrubber</option></select></div>
                    <div class="form-group"><label>Model</label><select id="equipmentModelSelect" class="form-input" onchange="this.value === 'add_new' ? document.getElementById('newModelInput').style.display='block' : document.getElementById('newModelInput').style.display='none'"><option value="">-- Select Model --</option>${modelOptions}<option value="add_new">-- Add New Model --</option></select><input type="text" id="newModelInput" class="form-input" style="display:none; margin-top: 8px;" placeholder="Enter new model name"></div>
                    <div class="form-group"><label>Serial Number</label><input type="text" id="equipmentSerial" class="form-input" value="${item?.serialNumber || ""}"></div>
                    <div class="form-group"><label>QR Code ID</label><input type="text" id="equipmentQrCode" class="form-input" value="${isNew && qrCode ? qrCode : item?.qrCode || ""}" readonly></div>
                    <div class="form-group"><label>Status</label><select id="equipmentStatus" class="form-input">${statusOptions}</select></div>
                </div>
            </div>
            <div id="notes-tab" class="modal-tab-content"><div class="form-group"><label>Notes</label><textarea id="equipmentNotes" class="form-input" rows="8">${item?.notes || ""}</textarea></div></div>
            <div id="wo-tab" class="modal-tab-content"><div class="history-section"><h4>New Work Order</h4><div class="form-group"><label>Issue Description</label><textarea id="woDescription" class="form-input" rows="4"></textarea></div><button class="btn btn-primary" onclick="laborTool.equipmentManager.submitWorkOrder()">Submit WO</button></div><div class="history-section"><h4>Work Order History (${workOrders.length})</h4><div class="history-list">${workOrders.map(wo => `<div class="history-item"><strong>${wo.dateReported.toDate().toLocaleDateString()}:</strong> ${wo.issueDescription} <em>(Status: ${wo.status})</em></div>`).join("") || "<p>No work orders found.</p>"}</div></div></div>
            <div id="repair-tab" class="modal-tab-content"><div class="history-section"><h4>Log New Repair</h4><div class="form-group"><label>Repair Description</label><textarea id="repairDescription" class="form-input" rows="3"></textarea></div><button class="btn btn-primary" onclick="laborTool.equipmentManager.logRepair()">Log Repair</button></div><div class="history-section"><h4>Repair History (${repairHistory.length})</h4><div class="history-list">${repairHistory.map(r => `<div class="history-item"><strong>${r.dateCompleted.toDate().toLocaleDateString()}:</strong> ${r.repairDescription}</div>`).join("") || "<p>No repair history found.</p>"}</div></div></div>
            <div id="grain-tab" class="modal-tab-content"><div class="history-section"><h4>Grain Depression History (${grainHistory.length})</h4><div class="history-list">${grainHistory.map(g => `<div class="history-item"><strong>${g.loggedAt.toDate().toLocaleString()}:</strong> ${g.grainDepression.toFixed(2)} GPP</div>`).join("") || "<p>No history found.</p>"}</div></div></div>`;

        const footerButtons = [{ text: "Cancel", class: "btn-secondary", onclick: "laborTool.closeModal()" }, { text: "Save", class: "btn-primary", onclick: `laborTool.equipmentManager.saveEquipment()` }];
        
        this.app.modalManager.showModal(title, modalBody, footerButtons);
        document.querySelectorAll(".modal-tab-btn").forEach(btn => btn.addEventListener("click", e => {
            document.querySelectorAll(".modal-tab-btn, .modal-tab-content").forEach(el => el.classList.remove("active"));
            e.target.classList.add("active");
            document.getElementById(`${e.target.dataset.tab}-tab`).classList.add("active");
        }));
    }

    async saveEquipment() {
        const modelSelect = document.getElementById("equipmentModelSelect");
        let model = "add_new" === modelSelect.value ? document.getElementById("newModelInput").value.trim() : modelSelect.value;
        if (!model) return alert("Please select or add a model name.");
        
        const data = {
            type: document.getElementById("equipmentType").value,
            model: model,
            serialNumber: document.getElementById("equipmentSerial").value,
            qrCode: document.getElementById("equipmentQrCode").value,
            status: document.getElementById("equipmentStatus").value,
            notes: document.getElementById("equipmentNotes")?.value || "",
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            if (this.currentEditingId) {
                await this.db.collection("equipment").doc(this.currentEditingId).update(data);
            } else {
                data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                if(!data.status) data.status = 'active';
                await this.db.collection("equipment").add(data);
            }
            this.app.showSuccess("Equipment saved!");
            this.closeModal();
            await this.loadEquipmentData();
        } catch (error) {
            this.app.showError("Failed to save equipment.");
        }
    }

    async submitWorkOrder() {
        if (!this.currentEditingId) return;
        const description = document.getElementById("woDescription").value;
        if (!description) return alert("Please enter a description.");
        try {
            await this.db.collection("equipment").doc(this.currentEditingId).collection("workOrders").add({
                issueDescription: description, dateReported: firebase.firestore.Timestamp.now(), status: "Open"
            });
            await this.db.collection("equipment").doc(this.currentEditingId).update({ status: 'maintenance' });
            this.app.showSuccess("Work order submitted!");
            this.closeModal();
            this.openEquipmentModal(this.currentEditingId);
            await this.loadEquipmentData();
        } catch (error) {
            this.app.showError("Failed to submit work order.");
        }
    }

    async logRepair() {
        if (!this.currentEditingId) return;
        const description = document.getElementById("repairDescription").value;
        if (!description) return alert("Please enter a repair description.");
        try {
            await this.db.collection("equipment").doc(this.currentEditingId).collection("repairHistory").add({
                repairDescription: description, dateCompleted: firebase.firestore.Timestamp.now()
            });
            this.app.showSuccess("Repair logged!");
            this.closeModal();
            this.openEquipmentModal(this.currentEditingId);
        } catch (error) {
            this.app.showError("Failed to log repair.");
        }
    }

    closeModal() {
        if (this.html5QrCode && this.html5QrCode.isScanning) {
            this.html5QrCode.stop().catch(() => {});
        }
        this.app.modalManager.closeModal();
    }
}