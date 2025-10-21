class ReportManager {
    constructor(app) {
        this.app = app;
        this.fleetData = [];
        this.equipmentData = [];
        this.html5QrCode = null;
    }

    async initialize() {
        const container = document.getElementById('report-tab');
        container.innerHTML = `
            <div class="tab-header"><h2>Report an Issue or Inspection</h2></div>
            <div class="report-grid">
                <div class="report-section">
                    <h3><i class="fas fa-car"></i> Fleet</h3>
                    <p>Submit a work order for a vehicle or run a monthly inspection.</p>
                    <div class="report-actions">
                        <button class="btn btn-primary" id="fleet-wo-btn"><i class="fas fa-exclamation-triangle"></i> Report Issue</button>
                        <button class="btn btn-info" id="fleet-inspection-btn"><i class="fas fa-clipboard-check"></i> Run Inspection</button>
                    </div>
                </div>
                <div class="report-section">
                    <h3><i class="fas fa-tools"></i> Equipment</h3>
                    <p>Submit a work order for a piece of equipment.</p>
                     <div class="report-actions">
                        <button class="btn btn-primary" id="equip-wo-btn"><i class="fas fa-exclamation-triangle"></i> Report Issue</button>
                    </div>
                </div>
                <div class="report-section">
                    <h3><i class="fas fa-house-damage"></i> Job Site</h3>
                    <p>Report any damage that occurred at a job site.</p>
                    <div class="report-actions">
                        <button class="btn btn-danger" id="damage-report-btn"><i class="fas fa-exclamation-triangle"></i> Report Damage</button>
                    </div>
                </div>
                <div class="report-section">
                    <h3><i class="fas fa-wrench"></i> Tools</h3>
                    <p>Request a new or replacement tool from the warehouse.</p>
                    <div class="report-actions">
                        <button class="btn btn-primary" id="tool-request-btn"><i class="fas fa-plus"></i> Request a Tool</button>
                    </div>
                </div>
            </div>
        `;
        await this.loadData();
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('fleet-wo-btn')?.addEventListener('click', () => this.openFleetWOModal());
        document.getElementById('fleet-inspection-btn')?.addEventListener('click', () => this.app.fleetManager.promptForVehicle('monthly-inspection'));
        document.getElementById('equip-wo-btn')?.addEventListener('click', () => this.openEquipmentWOModal());
        document.getElementById('damage-report-btn')?.addEventListener('click', () => this.openDamageReportModal());
        document.getElementById('tool-request-btn')?.addEventListener('click', () => this.app.toolManager.openToolRequestModal());
    }

    async loadData() {
        const fleetDataResult = await this.app.firebaseService.loadFleetData();
        this.fleetData = fleetDataResult ? fleetDataResult.vehicles : [];
        this.equipmentData = await this.app.firebaseService.loadEquipmentData();
    }

    openFleetWOModal() {
        const fleetOptions = '<option value="">-- Select Vehicle --</option>' + this.fleetData
            .sort((a, b) => (a.truckNumber || '').localeCompare(b.truckNumber || ''))
            .map(v => `<option value="${v.id}">${v.truckNumber || 'N/A'} - ${v.type || 'N/A'}</option>`).join('');

        const modalBody = `
            <div class="form-group">
                <label for="fleet-select">Select Vehicle</label>
                <select id="fleet-select" class="form-input">${fleetOptions}</select>
            </div>
            <div class="form-group">
                <label for="fleet-issue">Issue Description</label>
                <textarea id="fleet-issue" class="form-input" rows="4"></textarea>
            </div>`;

        this.app.modalManager.showModal('Fleet Work Order', modalBody, [
            { text: 'Cancel', class: 'btn-secondary', onclick: 'techApp.modalManager.closeModal()' },
            { text: 'Submit', class: 'btn-primary', onclick: 'techApp.reportManager.submitFleetWO()' }
        ]);
    }

    openEquipmentWOModal() {
        const equipmentOptions = '<option value="">-- Select Equipment --</option>' + this.equipmentData
            .sort((a,b) => (a.model || '').localeCompare(b.model || ''))
            .map(e => `<option value="${e.qrCode}">${e.model || 'N/A'} (${e.serialNumber || 'N/A'})</option>`).join('');

        const modalBody = `
            <div class="form-group">
                <label for="equipment-select">Select Equipment</label>
                <select id="equipment-select" class="form-input">${equipmentOptions}</select>
                 <button class="btn btn-secondary" id="scan-qr-btn-modal" style="margin-top: 10px;"><i class="fas fa-qrcode"></i> Scan QR Code</button>
            </div>
            <div class="form-group">
                <label for="equipment-issue">Issue Description</label>
                <textarea id="equipment-issue" class="form-input" rows="4"></textarea>
            </div>`;

        this.app.modalManager.showModal('Equipment Work Order', modalBody, [
            { text: 'Cancel', class: 'btn-secondary', onclick: 'techApp.reportManager.stopQrScanner(true)' },
            { text: 'Submit', class: 'btn-primary', onclick: 'techApp.reportManager.submitEquipmentWO()' }
        ]);
        
        document.getElementById('scan-qr-btn-modal').addEventListener('click', () => this.openQrScanner());
    }

    openDamageReportModal() {
        const zoneOptions = this.app.teamManager.staffingData.zones.map(zone => `<option value="${zone.name}">${zone.name}</option>`).join('');
        const causeOptions = ['Water Damage', 'Scratched Floor', 'Broken Item', 'Drywall Damage', 'Paint Damage', 'Other'].map(c => `<option value="${c}">${c}</option>`).join('');

        const modalBody = `
            <div class="form-group">
                <label for="job_number">Job Number</label>
                <input type="text" id="job_number" class="form-input" required>
            </div>
            <div class="form-group">
                <label for="date_of_occurrence">Date of Occurrence</label>
                <input type="date" id="date_of_occurrence" class="form-input" required>
            </div>
            <div class="form-group">
                <label for="cause_of_damage">Cause of Damage</label>
                <select id="cause_of_damage" class="form-input" required>${causeOptions}</select>
            </div>
            <div class="form-group">
                <label for="description">Description of What Happened</label>
                <textarea id="description" class="form-input" rows="3" required></textarea>
            </div>
            <div class="form-group">
                <label for="how_it_occurred">How the Damage Occurred</label>
                <textarea id="how_it_occurred" class="form-input" rows="3" required></textarea>
            </div>
            <div class="form-group">
                <label for="zone_location">Zone Location</label>
                <select id="zone_location" class="form-input" required>
                    ${zoneOptions}
                </select>
            </div>
        `;
        this.app.modalManager.showModal('Report Damage', modalBody, [
            { text: 'Cancel', class: 'btn-secondary', onclick: 'techApp.modalManager.closeModal()' },
            { text: 'Submit Report', class: 'btn-primary', onclick: 'techApp.reportManager.submitDamageReport()' }
        ]);
    }
    
    async openQrScanner() {
        // Close the current modal before opening the scanner
        this.app.modalManager.closeModal();

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
        const footerButtons = [{ text: 'Cancel', class: 'btn-secondary', onclick: 'techApp.reportManager.stopQrScanner(true)' }];
        this.app.modalManager.showModal('Scan Equipment QR Code', modalBody, footerButtons);

        this.html5QrCode = new Html5Qrcode("qr-reader", { verbose: true });

        const successCallback = (decodedText) => {
            this.stopQrScanner(false);
            this.app.modalManager.closeModal();
            this.handleQrScan(decodedText);
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

            // Delay to ensure the video stream is established before checking capabilities
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
            document.getElementById('qr-reader').innerHTML = `<p class="text-danger">Error: ${err.message}. Please allow camera access or upload an image.</p>`;
        }
    }
    
    handleQrScan(qrCode) {
        this.openEquipmentWOModal(); // Reopen the modal
        setTimeout(() => {
            const equipmentSelect = document.getElementById('equipment-select');
            if (equipmentSelect) {
                equipmentSelect.value = qrCode;
                if (equipmentSelect.selectedIndex <= 0) {
                    alert(`Equipment with QR code "${qrCode}" not found.`);
                    equipmentSelect.selectedIndex = 0;
                }
            }
        }, 200);
    }

    stopQrScanner(shouldCloseModal) {
        if (this.html5QrCode && this.html5QrCode.isScanning) {
            this.html5QrCode.stop().then(() => {
                if (shouldCloseModal) this.app.modalManager.closeModal();
            }).catch(err => {
                console.error("Error stopping QR scanner:", err);
                if (shouldCloseModal) this.app.modalManager.closeModal();
            });
        } else if (shouldCloseModal) {
            this.app.modalManager.closeModal();
        }
    }


    async submitFleetWO() {
        const vehicleId = document.getElementById('fleet-select').value;
        const description = document.getElementById('fleet-issue').value.trim();
        if (!vehicleId || !description) return alert('Please select a vehicle and describe the issue.');
        
        const success = await this.app.firebaseService.submitWorkOrder('hou_fleet', vehicleId, description);
        if (success) {
            alert('Fleet work order submitted successfully!');
            this.app.modalManager.closeModal();
        } else {
            alert('Failed to submit fleet work order. Please try again.');
        }
    }

    async submitEquipmentWO() {
        const qrCode = document.getElementById('equipment-select').value;
        const equipment = this.equipmentData.find(e => e.qrCode === qrCode);
        const description = document.getElementById('equipment-issue').value.trim();
        
        if (!equipment || !description) return alert('Please select equipment and describe the issue.');

        const success = await this.app.firebaseService.submitWorkOrder('equipment', equipment.id, description);
        if (success) {
            alert('Equipment work order submitted successfully!');
            this.app.modalManager.closeModal();
        } else {
            alert('Failed to submit equipment work order. Please try again.');
        }
    }
    
    async submitDamageReport() {
        const reportData = {
            job_number: document.getElementById('job_number').value,
            date_of_occurrence: document.getElementById('date_of_occurrence').value,
            cause_of_damage: document.getElementById('cause_of_damage').value,
            description: document.getElementById('description').value,
            how_it_occurred: document.getElementById('how_it_occurred').value,
            zone_location: document.getElementById('zone_location').value,
            submittedBy: this.app.user.username,
            submittedById: this.app.user.userId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'New',
            reviewed: false,
            resolved: false,
            activityLog: [{
                entry: `Report created by ${this.app.user.username}.`,
                timestamp: new Date()
            }]
        };
    
        for (const key in reportData) {
            // Skip validation for boolean fields and the activity log
            if (typeof reportData[key] === 'boolean' || key === 'activityLog') {
                continue;
            }
            if (!reportData[key]) {
                alert(`Please fill out the ${key.replace(/_/g, ' ')} field.`);
                return;
            }
        }
    
        try {
            await this.app.firebaseService.submitDamageReport(reportData);
            alert('Damage report submitted successfully!');
            this.app.modalManager.closeModal();
        } catch (error) {
            alert(`Failed to submit damage report: ${error.message}`);
        }
    }
}