class ToolManager {
    constructor(app) {
        this.app = app;
        this.db = app.firebaseService.db;
        this.allTechnicians = [];
        this.viewsRendered = new Set(); // Keep track of which views have been rendered
        this.tools = [];
    }

    async initialize() {
        const toolsView = document.getElementById('tools-view');
        if (toolsView) {
            await this.loadAllTechnicians();
            await this.loadTools();
            this.renderToolTabStructure(toolsView);
            this.setupEventListeners(toolsView);
            // Render the default view
            this.renderPendingRequests();
            this.viewsRendered.add('pending');
        }
    }

    renderToolTabStructure(container) {
        container.innerHTML = `
            <div class="tab-header">
                <div class="sub-nav">
                    <button class="sub-nav-btn active" data-view="pending">Pending Requests</button>
                    <button class="sub-nav-btn" data-view="completed">Completed</button>
                </div>
                 <div class="tab-controls">
                    <button class="btn btn-primary" id="request-tool-btn"><i class="fas fa-plus"></i> Request Tool</button>
                </div>
            </div>

            <div id="pending-view" class="tool-view active">
                <div class="card">
                    <div class="card-header">
                        <h3>Pending Tool Requests</h3>
                    </div>
                    <div class="table-container" id="pending-requests-container"></div>
                </div>
            </div>

            <div id="completed-view" class="tool-view" style="display: none;">
                <div class="card">
                    <div class="card-header">
                        <h3>Completed Tool Requests</h3>
                        <div class="filter-controls">
                            <label for="tech-filter">Filter by Technician:</label>
                            <select id="tech-filter" class="form-input"></select>
                        </div>
                    </div>
                    <div id="completed-requests-summary" class="summary-bar"></div>
                    <div class="table-container" id="completed-requests-container"></div>
                </div>
            </div>
        `;
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

    async loadTools() {
        try {
            const snapshot = await this.db.collection('hou_tools').orderBy('name').get();
            this.tools = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error loading tools:", error);
            this.tools = []; // Ensure tools is an array even on error
        }
    }

    setupEventListeners(view) {
        view.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (button) {
                if (button.classList.contains('sub-nav-btn')) {
                    this.switchView(button.dataset.view);
                }
                if (button.id === 'request-tool-btn') {
                    this.openToolRequestModal();
                }
            }
        });

        view.querySelector('#tech-filter')?.addEventListener('change', (e) => this.renderCompletedRequests(e.target.value));
    }

    switchView(viewName) {
        const toolsView = document.getElementById('tools-view');
        toolsView.querySelectorAll('.tool-view').forEach(v => v.style.display = 'none');
        toolsView.querySelectorAll('.sub-nav-btn').forEach(b => b.classList.remove('active'));
        
        toolsView.querySelector(`#${viewName}-view`).style.display = 'block';
        toolsView.querySelector(`.sub-nav-btn[data-view="${viewName}"]`).classList.add('active');

        if (!this.viewsRendered.has(viewName)) {
            if (viewName === 'completed') {
                this.populateTechFilter();
                this.renderCompletedRequests();
            }
            this.viewsRendered.add(viewName);
        }
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
                                <button class="btn btn-primary btn-small" onclick="laborTool.toolManager.updateRequestStatus('${req.id}', 'Completed')">Complete</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        container.innerHTML = tableHtml;
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
            summaryContainer.innerHTML = '<p>No requests to summarize.</p>';
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

    async updateRequestStatus(requestId, status) {
        try {
            await this.app.firebaseService.updateToolRequestStatus(requestId, status);
            alert(`Request marked as ${status}.`);
            this.renderPendingRequests(); // Refresh the list
        } catch (error) {
            console.error(error);
            alert('Failed to update request status.');
        }
    }

    openToolRequestModal() {
        if (this.tools.length === 0) {
            alert("Could not load the tool list. Please try again later.");
            return;
        }

        const urgencyOptions = ['Low - Within the week', 'Medium - Within a few days', 'High - ASAP'].map(o => `<option value="${o}">${o}</option>`).join('');

        const modalBody = `
            <style>
                .searchable-dropdown {
                    position: relative;
                }
                .options-container {
                    display: none;
                    position: absolute;
                    background-color: white;
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-md);
                    width: 100%;
                    max-height: 200px;
                    overflow-y: auto;
                    z-index: 1001; /* Above other modal content */
                }
                .options-container.visible {
                    display: block;
                }
                .option-item {
                    padding: 12px;
                    cursor: pointer;
                }
                .option-item:hover {
                    background-color: #f1f5f9;
                }
                .option-item.selected {
                    background-color: var(--primary-color);
                    color: white;
                }
                .tool-request-row {
                    background: #f8fafc;
                    padding: 1rem;
                    border-radius: var(--radius-md);
                    margin-bottom: 1rem;
                    border: 1px solid var(--border-color);
                }
                .tool-request-row .form-group {
                    margin-bottom: 0;
                }
            </style>
            <div id="tool-requests-container">
                </div>
            <button class="btn btn-secondary" id="add-tool-row-btn" style="margin-bottom: 1rem;"><i class="fas fa-plus"></i> Add Another Tool</button>
            <div class="form-group">
                <label for="tool-reason">Reason for Request (for all tools)</label>
                <textarea id="tool-reason" class="form-input" rows="3" placeholder="e.g., Lost, broken, new technician, etc."></textarea>
            </div>
            <div class="form-group">
                <label for="tool-urgency">Urgency</label>
                <select id="tool-urgency" class="form-input">${urgencyOptions}</select>
            </div>
            <div class="form-group">
                <label for="tool-notes">Additional Notes</label>
                <textarea id="tool-notes" class="form-input" rows="3" placeholder="Any other details..."></textarea>
            </div>
        `;

        this.app.modalManager.showModal('Request a New Tool', modalBody, [
            { text: 'Cancel', class: 'btn-secondary', onclick: 'laborTool.modalManager.closeModal()' },
            { text: 'Submit Request', class: 'btn-primary', onclick: 'laborTool.toolManager.submitToolRequest()' }
        ]);
        
        this.addToolRequestRow(); // Add the first row by default
        document.getElementById('add-tool-row-btn').addEventListener('click', () => this.addToolRequestRow());
    }
    
    addToolRequestRow() {
        const container = document.getElementById('tool-requests-container');
        const rowId = `tool-row-${Date.now()}`;
        const rowDiv = document.createElement('div');
        rowDiv.className = 'tool-request-row';
        rowDiv.id = rowId;

        rowDiv.innerHTML = `
            <div class="form-group">
                <label for="tool-search-input-${rowId}">Tool</label>
                <div class="searchable-dropdown">
                    <input type="text" id="tool-search-input-${rowId}" class="form-input tool-search-input" placeholder="Search or select a tool...">
                    <input type="hidden" class="tool-select" name="tool-select">
                    <div class="options-container"></div>
                </div>
            </div>
            <div class="form-group other-tool-container" style="display: none;">
                <label for="other-tool-name-${rowId}">Please specify the tool you need:</label>
                <input type="text" id="other-tool-name-${rowId}" class="form-input other-tool-name">
            </div>
        `;

        container.appendChild(rowDiv);
        this.setupSearchableDropdown(rowDiv);
    }

    setupSearchableDropdown(container) {
        const searchInput = container.querySelector('.tool-search-input');
        const hiddenInput = container.querySelector('.tool-select');
        const optionsContainer = container.querySelector('.options-container');
        const otherToolContainer = container.querySelector('.other-tool-container');

        const allOptions = [...this.tools.map(t => t.name), "Other"];

        const renderOptions = (filter = '') => {
            optionsContainer.innerHTML = '';
            const filteredOptions = allOptions.filter(opt => opt.toLowerCase().includes(filter.toLowerCase()));
            
            filteredOptions.forEach(opt => {
                const item = document.createElement('div');
                item.className = 'option-item';
                item.textContent = opt;
                item.dataset.value = opt;
                item.addEventListener('click', () => {
                    searchInput.value = opt;
                    hiddenInput.value = opt;
                    optionsContainer.classList.remove('visible');
                    
                    if (opt === 'Other') {
                        otherToolContainer.style.display = 'block';
                    } else {
                        otherToolContainer.style.display = 'none';
                    }
                });
                optionsContainer.appendChild(item);
            });
            optionsContainer.classList.toggle('visible', filteredOptions.length > 0);
        };

        searchInput.addEventListener('focus', () => renderOptions(searchInput.value));
        searchInput.addEventListener('input', () => renderOptions(searchInput.value));

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.searchable-dropdown')) {
                optionsContainer.classList.remove('visible');
            }
        }, true);
    }

    async submitToolRequest() {
        const toolRows = document.querySelectorAll('.tool-request-row');
        const reason = document.getElementById('tool-reason').value.trim();
        const urgency = document.getElementById('tool-urgency').value;
        const notes = document.getElementById('tool-notes').value.trim();
        const user = this.app.user;

        if (toolRows.length === 0) {
            alert('Please add at least one tool to your request.');
            return;
        }

        if (!reason) {
            alert('Please provide a reason for the request.');
            return;
        }

        const requests = [];
        for (const row of toolRows) {
            const hiddenInput = row.querySelector('.tool-select');
            let toolName = hiddenInput.value;

            if (toolName === 'Other') {
                toolName = row.querySelector('.other-tool-name').value.trim();
                if (!toolName) {
                    alert('Please specify the tool name for the "Other" option.');
                    return;
                }
            }
            
            if (!toolName) {
                alert('Please select a tool for each row.');
                return;
            }

            const selectedTool = this.tools.find(t => t.name === toolName);

            requests.push({
                toolName: toolName,
                toolCost: selectedTool ? selectedTool.cost : 0,
                reason: reason,
                urgency: urgency,
                notes: notes,
                technicianId: user.userId,
                technicianName: user.username,
                status: 'Pending',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        try {
            const batch = this.db.batch();
            requests.forEach(requestData => {
                const docRef = this.db.collection('hou_tool_requests').doc();
                batch.set(docRef, requestData);
            });
            await batch.commit();

            alert('Tool request(s) submitted successfully!');
            this.app.modalManager.closeModal();
            this.renderPendingRequests();
        } catch (error) {
            console.error("Error submitting tool request:", error);
            alert('There was an error submitting your request. Please try again.');
        }
    }
}