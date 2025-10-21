class ToolManager {
    constructor(app) {
        this.app = app;
        this.db = app.firebaseService.db;
        this.allTools = [];
        this.allTechnicians = [];
    }

    async initialize() {
        if (document.getElementById('tools-tab')) {
            await Promise.all([
                this.loadAllTools(),
                this.loadAllTechnicians()
            ]);
            this.setupEventListeners();
            this.renderPendingRequests();
            this.populateTechFilter();
        }
    }

    async loadAllTools() {
        try {
            const snapshot = await this.db.collection('hou_tools').orderBy('name').get();
            this.allTools = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error loading tools:", error);
            this.allTools = [];
        }
    }

    async loadAllTechnicians() {
        const staffingData = await this.app.firebaseService.loadStaffingData();
        if (staffingData && staffingData.zones) {
            this.allTechnicians = staffingData.zones
                .flatMap(z => [z.lead, ...z.members])
                .filter(Boolean)
                .sort((a, b) => a.name.localeCompare(b.name));
        }
    }

    setupEventListeners() {
        document.getElementById('subtab-pending-btn')?.addEventListener('click', () => this.switchView('pending'));
        document.getElementById('subtab-completed-btn')?.addEventListener('click', () => {
            this.switchView('completed');
            this.renderCompletedRequests();
        });
        document.getElementById('subtab-inventory-btn')?.addEventListener('click', () => {
            this.switchView('inventory');
            this.renderInventory();
        });

        document.getElementById('add-tool-btn')?.addEventListener('click', () => this.openToolModal());
        document.getElementById('run-inventory-btn')?.addEventListener('click', () => this.startInventory());

        document.getElementById('tech-filter')?.addEventListener('change', (e) => this.renderCompletedRequests(e.target.value));
    }

    startInventory() {
        const modalBody = `<p>Which office are you running an inventory for?</p>`;
        this.app.modalManager.showModal('Select Office for Inventory', modalBody, [
            { text: 'Katy', class: 'btn-secondary', onclick: `warehouseApp.toolManager.runInventoryForOffice('Katy')` },
            { text: 'Conroe', class: 'btn-secondary', onclick: `warehouseApp.toolManager.runInventoryForOffice('Conroe')` },
            { text: 'Cancel', class: 'btn-primary', onclick: `warehouseApp.modalManager.closeModal()` }
        ]);
    }

    runInventoryForOffice(office) {
        this.app.modalManager.closeModal();
        const container = document.getElementById('tool-inventory-container');
        const quantityField = office === 'Katy' ? 'quantityKaty' : 'quantityConroe';

        const tableHtml = `
            <div class="inventory-workflow-container">
                <div class="inventory-workflow-header">
                     <h4>Inventory Count for ${office} Office</h4>
                     <p>Enter the current physical count for each tool. Leave blank if unchanged.</p>
                </div>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Tool Name</th>
                            <th>Current Qty</th>
                            <th>New Count</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.allTools.map(tool => `
                            <tr data-tool-id="${tool.id}">
                                <td data-label="Tool Name">${tool.name}</td>
                                <td data-label="Current Qty">${tool[quantityField] || 0}</td>
                                <td data-label="New Count">
                                    <input type="number" class="inventory-quantity-input new-inventory-count" placeholder="${tool[quantityField] || 0}">
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div class="inventory-workflow-actions">
                    <button class="btn btn-secondary" onclick="warehouseApp.toolManager.renderInventory()">Cancel</button>
                    <button class="btn btn-primary" onclick="warehouseApp.toolManager.submitInventoryCount('${office}')">Submit Inventory Count</button>
                </div>
            </div>
        `;

        container.innerHTML = tableHtml;
    }

    submitInventoryCount(office) {
        if (!confirm(`Are you sure you want to update the inventory counts for the ${office} office? This will overwrite existing quantities.`)) {
            return;
        }

        const quantityField = office === 'Katy' ? 'quantityKaty' : 'quantityConroe';
        const batch = this.db.batch();
        let updatesMade = 0;

        document.querySelectorAll('.new-inventory-count').forEach(input => {
            const newValue = input.value;
            if (newValue !== '' && !isNaN(newValue)) {
                const toolId = input.closest('tr').dataset.toolId;
                const toolRef = this.db.collection('hou_tools').doc(toolId);
                batch.update(toolRef, { [quantityField]: parseInt(newValue, 10) });
                updatesMade++;
            }
        });

        if (updatesMade === 0) {
            alert("No new counts were entered. Inventory was not updated.");
            this.renderInventory();
            return;
        }

        batch.commit()
            .then(async () => {
                alert(`${updatesMade} tool quantities have been updated successfully for the ${office} office.`);
                await this.loadAllTools(); // Refresh local data
                this.renderInventory(); // Re-render the default inventory view
            })
            .catch(error => {
                console.error("Error updating inventory:", error);
                alert("An error occurred while updating the inventory.");
            });
    }

    switchView(viewName) {
        document.querySelectorAll('.tool-view').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.sub-nav-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`${viewName}-view`).classList.add('active');
        document.querySelector(`.sub-nav-btn[data-view="${viewName}"]`).classList.add('active');
    }

    async renderPendingRequests() {
        const container = document.getElementById('pending-requests-container');
        container.innerHTML = '<p>Loading pending requests...</p>';
        const requests = await this.app.firebaseService.loadToolRequests('Pending');

        if (requests.length === 0) {
            container.innerHTML = '<p class="no-entries">No pending tool requests found.</p>';
            return;
        }

        const tableHtml = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Technician</th>
                        <th>Tool</th>
                        <th>Reason</th>
                        <th>Urgency</th>
                        <th>Notes</th>
                        <th style="text-align: right;">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${requests.map(req => `
                        <tr>
                            <td data-label="Date">${req.createdAt.toDate().toLocaleDateString()}</td>
                            <td data-label="Technician">${req.technicianName}</td>
                            <td data-label="Tool">${req.toolName}</td>
                            <td data-label="Reason">${req.reason}</td>
                            <td data-label="Urgency">${req.urgency}</td>
                            <td data-label="Notes">${req.notes || 'N/A'}</td>
                            <td data-label="Actions" class="actions" style="text-align: right;">
                                <button class="btn btn-primary btn-small" onclick="warehouseApp.toolManager.promptForOffice('${req.id}', '${req.toolName}')">Complete</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        container.innerHTML = tableHtml;
    }
    
    promptForOffice(requestId, toolName) {
        const modalBody = `<p>Which office is the tool being taken from?</p>`;
        this.app.modalManager.showModal('Select Office', modalBody, [
            { text: 'Katy', class: 'btn-secondary', onclick: `warehouseApp.toolManager.updateRequestStatus('${requestId}', 'Completed', 'Katy', '${toolName}')` },
            { text: 'Conroe', class: 'btn-secondary', onclick: `warehouseApp.toolManager.updateRequestStatus('${requestId}', 'Completed', 'Conroe', '${toolName}')` },
            { text: 'Cancel', class: 'btn-primary', onclick: `warehouseApp.modalManager.closeModal()` }
        ]);
    }

    populateTechFilter() {
        const filter = document.getElementById('tech-filter');
        if (!filter) return;
        let optionsHtml = '<option value="all">All Technicians</option>';
        this.allTechnicians.forEach(tech => {
            optionsHtml += `<option value="${tech.id}">${tech.name}</option>`;
        });
        filter.innerHTML = optionsHtml;
    }

    async renderCompletedRequests(technicianId = 'all') {
        const container = document.getElementById('completed-requests-container');
        const summaryContainer = document.getElementById('completed-requests-summary');
        container.innerHTML = '<p>Loading completed requests...</p>';
        summaryContainer.innerHTML = '';

        let requests = await this.app.firebaseService.loadToolRequests('Completed');
        
        if (technicianId !== 'all') {
            requests = requests.filter(req => req.technicianId === technicianId);
        }

        if (requests.length === 0) {
            container.innerHTML = '<p class="no-entries">No completed requests found for this filter.</p>';
            return;
        }

        const totalCost = requests.reduce((sum, req) => sum + (req.toolCost || 0), 0);
        summaryContainer.innerHTML = `<p>Showing ${requests.length} requests with a total cost of <span class="cost">$${totalCost.toFixed(2)}</span></p>`;

        const tableHtml = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Technician</th>
                        <th>Tool</th>
                        <th>Cost</th>
                    </tr>
                </thead>
                <tbody>
                    ${requests.map(req => `
                        <tr>
                            <td data-label="Date">${req.completedAt.toDate().toLocaleDateString()}</td>
                            <td data-label="Technician">${req.technicianName}</td>
                            <td data-label="Tool">${req.toolName}</td>
                            <td data-label="Cost">$${(req.toolCost || 0).toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        container.innerHTML = tableHtml;
    }

    renderInventory() {
        const container = document.getElementById('tool-inventory-container');
        if (this.allTools.length === 0) {
            container.innerHTML = '<p class="no-entries">No tools found in inventory.</p>';
            return;
        }

        const tableHtml = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Tool Name</th>
                        <th>Cost</th>
                        <th>Katy Office Qty</th>
                        <th>Conroe Office Qty</th>
                        <th style="text-align: right;">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.allTools.map(tool => `
                        <tr id="tool-row-${tool.id}">
                            <td data-label="Tool Name">${tool.name}</td>
                            <td data-label="Cost">$${(tool.cost || 0).toFixed(2)}</td>
                            <td data-label="Katy Qty"><input type="number" class="inventory-quantity-input" id="katy-qty-${tool.id}" value="${tool.quantityKaty || 0}"></td>
                            <td data-label="Conroe Qty"><input type="number" class="inventory-quantity-input" id="conroe-qty-${tool.id}" value="${tool.quantityConroe || 0}"></td>
                            <td data-label="Actions" class="actions" style="text-align: right;">
                                <button class="btn btn-secondary btn-small" onclick="warehouseApp.toolManager.openToolModal('${tool.id}')">Edit</button>
                                <button class="btn btn-primary btn-small" onclick="warehouseApp.toolManager.saveInventoryRow('${tool.id}')">Save Qty</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        container.innerHTML = tableHtml;
    }
    
    async saveInventoryRow(toolId) {
        const katyQty = parseInt(document.getElementById(`katy-qty-${toolId}`).value) || 0;
        const conroeQty = parseInt(document.getElementById(`conroe-qty-${toolId}`).value) || 0;
        
        const toolData = {
            quantityKaty: katyQty,
            quantityConroe: conroeQty
        };

        try {
            await this.app.firebaseService.saveTool(toolId, toolData);
            // Visually confirm save
            const row = document.getElementById(`tool-row-${toolId}`);
            row.style.backgroundColor = '#d4edda';
            setTimeout(() => { row.style.backgroundColor = ''; }, 1500);
            
            // Update local cache
            const toolInCache = this.allTools.find(t => t.id === toolId);
            if(toolInCache) {
                toolInCache.quantityKaty = katyQty;
                toolInCache.quantityConroe = conroeQty;
            }

        } catch (error) {
             alert('Failed to save quantities.');
        }
    }

    openToolModal(toolId = null) {
        const tool = toolId ? this.allTools.find(t => t.id === toolId) : null;
        const title = tool ? 'Edit Tool' : 'Add New Tool';

        const modalBody = `
            <div class="form-group">
                <label for="tool-name">Tool Name</label>
                <input type="text" id="tool-name" class="form-input" value="${tool ? tool.name : ''}">
            </div>
            <div class="form-group">
                <label for="tool-cost">Cost</label>
                <input type="number" id="tool-cost" class="form-input" value="${tool ? tool.cost : ''}" placeholder="0.00">
            </div>
            <div class="form-grid">
                 <div class="form-group">
                    <label for="quantityKaty">Katy Office Quantity</label>
                    <input type="number" id="quantityKaty" class="form-input" value="${tool ? tool.quantityKaty || 0 : 0}">
                </div>
                 <div class="form-group">
                    <label for="quantityConroe">Conroe Office Quantity</label>
                    <input type="number" id="quantityConroe" class="form-input" value="${tool ? tool.quantityConroe || 0 : 0}">
                </div>
            </div>
        `;

        this.app.modalManager.showModal(title, modalBody, [
            { text: 'Cancel', class: 'btn-secondary', onclick: 'warehouseApp.modalManager.closeModal()' },
            { text: 'Save Tool', class: 'btn-primary', onclick: `warehouseApp.toolManager.saveTool('${toolId || ''}')` }
        ]);
    }

    async saveTool(toolId) {
        const name = document.getElementById('tool-name').value.trim();
        const cost = parseFloat(document.getElementById('tool-cost').value) || 0;
        const quantityKaty = parseInt(document.getElementById('quantityKaty').value) || 0;
        const quantityConroe = parseInt(document.getElementById('quantityConroe').value) || 0;

        if (!name) {
            alert('Please enter a tool name.');
            return;
        }

        const toolData = { name, cost, quantityKaty, quantityConroe };

        try {
            await this.app.firebaseService.saveTool(toolId, toolData);
            alert('Tool saved successfully!');
            this.app.modalManager.closeModal();
            await this.loadAllTools();
            this.renderInventory();
        } catch (error) {
            alert('Failed to save tool.');
        }
    }

    async deleteTool(toolId) {
        if (confirm('Are you sure you want to delete this tool?')) {
            try {
                await this.app.firebaseService.deleteTool(toolId);
                alert('Tool deleted successfully!');
                await this.loadAllTools();
                this.renderInventory();
            } catch (error) {
                alert('Failed to delete tool.');
            }
        }
    }

    async updateRequestStatus(requestId, status, office, toolName) {
        this.app.modalManager.closeModal(); // Close the office selection modal

        try {
            const tool = this.allTools.find(t => t.name === toolName);
            if (tool) {
                const fieldToUpdate = office === 'Katy' ? 'quantityKaty' : 'quantityConroe';
                // Use Firestore's atomic decrement operation
                const decrement = firebase.firestore.FieldValue.increment(-1);
                await this.db.collection('hou_tools').doc(tool.id).update({ [fieldToUpdate]: decrement });
            }
            
            await this.app.firebaseService.updateToolRequestStatus(requestId, status);
            alert(`Request marked as ${status}. Inventory updated for ${office} office.`);
            
            await this.loadAllTools(); // Refresh local tool data with new quantities
            this.renderPendingRequests();
        } catch (error) {
            console.error(error);
            alert('Failed to update request status or inventory.');
        }
    }
}