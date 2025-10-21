class FleetManager {
    constructor(app) {
        this.app = app;
        this.db = app.firebaseService.db;
        this.fleetData = [];
    }
    
    async initialize() {
        await this.loadFleetData();
    }

    async loadFleetData() {
        try {
            const data = await this.app.firebaseService.loadFleetData();
            this.fleetData = data ? data.vehicles : [];
        } catch (error) {
            console.error('Error loading fleet data:', error);
        }
    }

    promptForVehicle(action) {
        const title = 'Start Monthly Inspection';
        const buttonText = 'Continue to Inspection';
        
        const allTechs = this.app.teamManager.getAllTechnicians();
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
            <p>Please select the vehicle you want to inspect.</p>
            <div class="form-group">
                <label for="vehicle-select-prompt">Vehicle</label>
                <select id="vehicle-select-prompt" class="form-input">${optionsHtml}</select>
            </div>
        `;
    
        this.app.modalManager.showModal(title, modalBody, [
            { text: 'Cancel', class: 'btn-secondary', onclick: 'techApp.modalManager.closeModal()' },
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
            this.openInspectionModal(selectedVehicleId);
        });
        
        footer.appendChild(continueBtn);
    }
    
    openInspectionModal(vehicleId) {
        const vehicle = this.fleetData.find(v => v.id === vehicleId);
        if (!vehicle) return;

        const today = new Date().toLocaleDateString();
        const driverName = this.app.user.username || 'N/A';

        const createInspectionRow = (label, id, type = 'checkbox') => {
            let controls = '';
            if (type === 'checkbox') {
                controls = `
                    <div class="inspection-toggle-group">
                        <label class="inspection-choice-btn"><input type="radio" name="${id}" value="good" checked><span>Good</span></label>
                        <label class="inspection-choice-btn"><input type="radio" name="${id}" value="bad"><span>Bad</span></label>
                    </div>
                `;
            } else if (type === 'yesno') {
                controls = `
                    <div class="inspection-toggle-group">
                        <label class="inspection-choice-btn"><input type="radio" name="${id}" value="no" checked><span>No</span></label>
                        <label class="inspection-choice-btn"><input type="radio" name="${id}" value="yes"><span>Yes</span></label>
                    </div>
                `;
            }
            const detailsInput = `<input type="text" class="form-input details-input" id="${id}-details" placeholder="Details (if needed)...">`;

            return `
                <div class="inspection-row">
                    <div class="inspection-label">${label}</div>
                    <div class="inspection-controls">${controls}</div>
                    <div class="inspection-details">${detailsInput}</div>
                </div>
            `;
        };

        const modalBody = `
            <div class="inspection-form-container">
                <div class="form-grid-info">
                    <div class="form-group"><label>Date</label><input type="text" class="form-input" id="inspection-date" value="${today}" readonly></div>
                    <div class="form-group"><label>Driver</label><input type="text" class="form-input" id="inspection-driver" value="${driverName}" readonly></div>
                    <div class="form-group"><label>Vehicle #</label><input type="text" class="form-input" id="inspection-vehicle" value="${vehicle.truckNumber}" readonly></div>
                    <div class="form-group"><label>Current Mileage</label><input type="number" class="form-input" id="inspection-mileage" placeholder="Enter current mileage" value="${vehicle.mileage || ''}"></div>
                </div>
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
            { text: 'Cancel', class: 'btn-secondary', onclick: 'techApp.modalManager.closeModal()' },
            { text: 'Submit Inspection', class: 'btn-primary', onclick: `techApp.fleetManager.submitInspection('${vehicle.id}')` }
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
                // updatePayload.status = 'In Repairs';
            }
            
            await vehicleDocRef.set(updatePayload, { merge: true });

            const vehicle = this.fleetData.find(v => v.id === vehicleId);
            if (vehicle) {
                vehicle.mileage = inspectionData.mileage;
                // if(hasIssues) vehicle.status = 'In Repairs';
            }

            alert('Inspection submitted successfully!');
            this.app.modalManager.closeModal();
            
        } catch (error) {
            console.error("Error submitting inspection:", error);
            alert('Failed to submit inspection.');
        }
    }
}