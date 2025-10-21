class EvaluationManager {
    constructor(app) {
        this.app = app;
        this.db = app.firebaseService.db;
        this.allEvaluations = {};
        this.currentView = 'card';
        this.editingEvaluationId = null;
        this.currentFilters = { zone: 'all', category: 'all' };
    }

    initialize() {
        if (!document.getElementById('evaluation-view')) return;
        this.renderBaseHTML();
        this.setupEventListeners();
        this.setupEvaluationsListener();
        const isDesktop = window.matchMedia('(min-width: 768px)').matches;
        this.switchEvaluationView(isDesktop ? 'table' : 'card');
    }

    renderBaseHTML() {
        const container = document.getElementById('evaluation-view');
        if (!container) return;
        container.innerHTML = `
            <div class="controls-row">
                <div class="controls-left">
                    <div class="filter-row"><span class="filter-label">Zone/POD:</span><select id="eval-zone-pod-filter" class="form-input"></select></div>
                    <div class="filter-row"><span class="filter-label">Category:</span><select id="eval-category-filter" class="form-input"><option value="all">All</option><option value="20">20</option><option value="70">70</option><option value="10">10</option></select></div>
                    <button id="eval-clear-filters-btn" class="btn btn-secondary btn-small">Clear</button>
                </div>
                <div class="controls-right">
                    <div class="sub-nav"><button class="sub-nav-btn" id="eval-card-view-btn"><i class="fas fa-grip-horizontal"></i> Cards</button><button class="sub-nav-btn" id="eval-table-view-btn"><i class="fas fa-bars"></i> Table</button></div>
                    <button class="btn btn-secondary" id="eval-print-btn"><i class="fas fa-print"></i> Print Report</button>
                    <button class="btn btn-primary" id="eval-add-btn"><i class="fas fa-plus"></i> Add Eval</button>
                </div>
            </div>
            <div id="eval-card-view" class="evaluation-content"><div id="evaluation-cards-container" class="cards-grid"></div></div>
            <div id="eval-table-view" class="evaluation-content" style="display: none;"><div class="table-container"><table class="data-table"><thead><tr><th>Employee</th><th>Category</th><th>Avg. Score</th><th>Zone</th><th>Plan</th><th>Last Evaluated</th><th style="text-align: right;">Actions</th></tr></thead><tbody id="evaluation-table-body"></tbody></table></div></div>
        `;
    }

    setupEventListeners() {
        const view = document.getElementById('evaluation-view');
        if (!view) return;

        view.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (!button) return;

            const { action, techId } = button.dataset;

            if (action === 'view-history') this.openEvaluationHistoryModal(techId);
            else if (action === 'edit-eval') this.openEvaluationModal(techId);
            else if (button.id === 'eval-card-view-btn') this.switchEvaluationView('card');
            else if (button.id === 'eval-table-view-btn') this.switchEvaluationView('table');
            else if (button.id === 'eval-add-btn') this.openEvaluationModal();
            else if (button.id === 'eval-clear-filters-btn') this.clearFilters();
            else if (button.id === 'eval-print-btn') this.openPrintModal();
        });

        document.getElementById('eval-zone-pod-filter')?.addEventListener('change', (e) => { this.currentFilters.zone = e.target.value; this.displayTechnicians(); });
        document.getElementById('eval-category-filter')?.addEventListener('change', (e) => { this.currentFilters.category = e.target.value; this.displayTechnicians(); });
    }
    
    clearFilters() {
        document.getElementById('eval-zone-pod-filter').value = 'all';
        document.getElementById('eval-category-filter').value = 'all';
        this.currentFilters = { zone: 'all', category: 'all' };
        this.displayTechnicians();
    }

    switchEvaluationView(view) {
        this.currentView = view;
        document.getElementById('eval-card-view-btn').classList.toggle('active', view === 'card');
        document.getElementById('eval-table-view-btn').classList.toggle('active', view === 'table');
        document.getElementById('eval-card-view').style.display = view === 'card' ? 'block' : 'none';
        document.getElementById('eval-table-view').style.display = view === 'table' ? 'block' : 'none';
        this.displayTechnicians();
    }

    setupEvaluationsListener() {
        this.db.collection('technician-evaluations').onSnapshot(snapshot => {
            this.allEvaluations = {};
            snapshot.forEach(doc => {
                const evaluation = { id: doc.id, ...doc.data() };
                if (evaluation.technicianId) {
                    if (!this.allEvaluations[evaluation.technicianId] || this.allEvaluations[evaluation.technicianId].createdAt.seconds < evaluation.createdAt.seconds) {
                        this.allEvaluations[evaluation.technicianId] = evaluation;
                    }
                }
            });
            this.displayTechnicians();
        }, (error) => console.error("Error listening to evaluations:", error));
    }

    updateZoneFilter() {
        if (!this.app.staffingData.zones) return;
        const zones = [...new Set(this.app.staffingData.zones.map(z => z.name))];
        const filterSelect = document.getElementById('eval-zone-pod-filter');
        if (!filterSelect) return;
        
        const currentVal = filterSelect.value;
        filterSelect.innerHTML = '<option value="all">All Zones</option>' + zones.map(z => `<option value="${z}">${z}</option>`).join('');
        filterSelect.value = currentVal;
    }

    calculateCategoryAndScore(ratings) {
        if (!ratings || Object.keys(ratings).length < 8) { // Check for at least 8 ratings
            return { category: null, averageScore: null };
        }
        const ratingValues = Object.values(ratings).map(v => parseInt(v || 0));
        const total = ratingValues.reduce((sum, val) => sum + val, 0);
        const avg = total / ratingValues.length;
        
        // Category assignment is now handled in displayTechnicians
        return { category: null, averageScore: avg };
    }

    displayTechnicians() {
        if (!this.app.staffingData.zones) return;
        this.updateZoneFilter();
        
        const allStaff = this.app.teamManager.getAllTechnicians();
        const userRole = this.app.user.role;
    
        // Start with all staff, but remove Managers from the list entirely.
        let staffToDisplay = allStaff.filter(tech => tech.role !== 'Manager');
    
        // If the user is a Supervisor or MIT Lead, they cannot see others in those roles.
        if (userRole === 'Supervisor' || userRole === 'MIT Lead') {
            staffToDisplay = staffToDisplay.filter(tech => tech.role !== 'Supervisor' && tech.role !== 'MIT Lead');
        }
    
        const assignCategories = (employeeList) => {
            let employeesWithEvals = employeeList
                .map(tech => {
                    const latestEvaluation = this.allEvaluations[tech.id] || null;
                    const { averageScore } = latestEvaluation ? this.calculateCategoryAndScore(latestEvaluation.ratings) : { averageScore: null };
                    const zone = this.app.staffingData.zones.find(z => 
                        (z.lead && z.lead.id === tech.id) || 
                        (z.members && z.members.some(m => m.id === tech.id))
                    );
                    return { ...tech, latestEvaluation, averageScore, zoneName: zone ? zone.name : 'N/A' };
                })
                .filter(t => t.averageScore !== null);

            employeesWithEvals.sort((a, b) => b.averageScore - a.averageScore);

            const totalEmployees = employeesWithEvals.length;
            const top20Count = Math.ceil(totalEmployees * 0.2);
            let bottom10Count = Math.ceil(totalEmployees * 0.2);

            if (totalEmployees > 0 && bottom10Count === 0) {
                bottom10Count = 1;
            }

            return employeesWithEvals.map((tech, index) => {
                let category;
                if (index < top20Count) {
                    category = '20';
                } else if (index >= totalEmployees - bottom10Count) {
                    category = '10';
                } else {
                    category = '70';
                }
                return { ...tech, category };
            });
        };
    
        // Process the filtered list
        let allRankedStaff = assignCategories(staffToDisplay);
        
        // Add back staff without evaluations (from the already filtered list)
        const staffWithEvalsIds = new Set(allRankedStaff.map(s => s.id));
        const staffWithoutEvals = staffToDisplay
            .filter(s => !staffWithEvalsIds.has(s.id))
            .map(tech => {
                const zone = this.app.staffingData.zones.find(z => 
                    (z.lead && z.lead.id === tech.id) || 
                    (z.members && z.members.some(m => m.id === tech.id))
                );
                return { ...tech, latestEvaluation: null, category: null, averageScore: null, zoneName: zone ? zone.name : 'N/A' };
            });

        let finalDisplayList = [...allRankedStaff, ...staffWithoutEvals];
        
        // Apply secondary filters from the UI
        if (this.currentFilters.zone !== 'all') finalDisplayList = finalDisplayList.filter(t => t.zoneName === this.currentFilters.zone);
        if (this.currentFilters.category !== 'all') finalDisplayList = finalDisplayList.filter(t => t.category === this.currentFilters.category);

        const cardContainer = document.getElementById('evaluation-cards-container');
        const tableBody = document.getElementById('evaluation-table-body');
        
        if (this.currentView === 'card' && cardContainer) {
            cardContainer.innerHTML = finalDisplayList.length > 0 ? finalDisplayList.map(tech => this.renderTechnicianCard(tech)).join('') : '<p class="text-center" style="grid-column: 1 / -1;">No technicians match filters.</p>';
        } else if (tableBody) {
            tableBody.innerHTML = finalDisplayList.length > 0 ? finalDisplayList.map(tech => this.renderTechnicianTableRow(tech)).join('') : '<tr><td colspan="7" class="text-center">No technicians match filters.</td></tr>';
        }
    }

    formatDate(timestamp) {
        return timestamp ? timestamp.toDate().toLocaleDateString() : 'N/A';
    }
    
    renderTechnicianCard(tech) {
        const category = tech.category || 'na';
        return `
            <div class="technician-card">
                <div class="card-header"><h4 class="card-title">${tech.name}</h4><span class="card-zone">${tech.zoneName}</span></div>
                <div class="card-category category-${category}">${tech.category || 'N/A'}</div>
                <div class="card-actions">
                    <button class="btn btn-secondary btn-small" data-action="view-history" data-tech-id="${tech.id}">History</button>
                    <button class="btn btn-primary btn-small" data-action="edit-eval" data-tech-id="${tech.id}">New/Edit</button>
                </div>
            </div>`;
    }

    renderTechnicianTableRow(tech) {
        const category = tech.category || 'na';
        const evalData = tech.latestEvaluation;
        return `
            <tr>
                <td data-label="Employee">${tech.name}</td>
                <td data-label="Category"><span class="status-badge category-${category}">${tech.category || 'N/A'}</span></td>
                <td data-label="Avg. Score"><strong>${tech.averageScore ? tech.averageScore.toFixed(2) : 'N/A'}</strong></td>
                <td data-label="Zone">${tech.zoneName}</td>
                <td data-label="Plan">${evalData?.developmentPlan || 'None'}</td>
                <td data-label="Last Evaluated">${this.formatDate(evalData?.createdAt)}</td>
                <td data-label="Actions" style="text-align: right;">
                     <button class="btn btn-secondary btn-small" data-action="view-history" data-tech-id="${tech.id}">History</button>
                     <button class="btn btn-primary btn-small" data-action="edit-eval" data-tech-id="${tech.id}">New/Edit</button>
                </td>
            </tr>`;
    }

    async openEvaluationModal(technicianId = null) {
        this.editingEvaluationId = null;
        const allTechs = this.app.teamManager.getAllTechnicians();
        const tech = technicianId ? allTechs.find(t => t.id === technicianId) : null;
        const latestEval = technicianId ? this.allEvaluations[technicianId] : null;

        const title = latestEval ? `Edit Evaluation for ${tech.name}` : 'New Evaluation';
        if (latestEval) this.editingEvaluationId = latestEval.id;

        const ratingFields = ['leadership', 'culture', 'jobfit', 'integrity', 'people', 'workethic', 'excellence', 'longevity'];
        const ratingHtml = ratingFields.map(field => `
            <div class="form-group">
                <label>${field.charAt(0).toUpperCase() + field.slice(1)}</label>
                <select id="${field}-rating" class="form-input">
                    <option value="">Select</option>
                    ${[1,2,3,4].map(n => `<option value="${n}" ${latestEval?.ratings?.[field] == n ? 'selected' : ''}>${n}</option>`).join('')}
                </select>
            </div>`).join('');
        
        const planStart = latestEval?.planStart ? latestEval.planStart.toDate().toISOString().split('T')[0] : '';
        const planEnd = latestEval?.planEnd ? latestEval.planEnd.toDate().toISOString().split('T')[0] : '';
        const evalDate = latestEval?.createdAt ? latestEval.createdAt.toDate().toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

        const modalBody = `
            <div class="form-grid">
                <div class="form-group">
                    <label for="employee-name-select">Employee Name</label>
                    <select id="employee-name-select" class="form-input" ${technicianId ? 'disabled' : ''}>
                        ${allTechs.map(t => `<option value="${t.id}" ${t.id === technicianId ? 'selected' : ''}>${t.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label for="evaluation-date">Evaluation Date</label>
                    <input type="date" id="evaluation-date" class="form-input" value="${evalDate}">
                </div>
            </div>
            <h4 style="margin-top: 1.5rem; margin-bottom: 1rem;">Ratings (1=Poor, 4=Excellent)</h4>
            <div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">${ratingHtml}</div>
            <div class="form-group" style="margin-top: 1.5rem;"><label for="training-opportunities">Training Opportunities</label><textarea id="training-opportunities" class="form-input" rows="3">${latestEval?.trainingOpportunities || ''}</textarea></div>
            <div class="form-group"><label for="observations">Observations</label><textarea id="observations" class="form-input" rows="3">${latestEval?.observations || ''}</textarea></div>
            <hr style="margin: 1.5rem 0;">
            <h4>Development Plan</h4>
            <div class="form-grid">
                <div class="form-group"><label for="development-plan">Plan Type</label><select id="development-plan" class="form-input"><option value="">None</option><option value="training-plan" ${latestEval?.developmentPlan === 'training-plan' ? 'selected' : ''}>Training Plan</option><option value="idp" ${latestEval?.developmentPlan === 'idp' ? 'selected' : ''}>IDP</option><option value="pip" ${latestEval?.developmentPlan === 'pip' ? 'selected' : ''}>PIP</option></select></div>
                <div class="form-group"><label for="plan-document-link">Plan Document Link</label><input type="url" id="plan-document-link" class="form-input" value="${latestEval?.planDocumentLink || ''}" placeholder="https://docs.google.com/..."></div>
                <div class="form-group"><label for="plan-start">Plan Start Date</label><input type="date" id="plan-start" class="form-input" value="${planStart}"></div>
                <div class="form-group"><label for="plan-end">Plan End Date</label><input type="date" id="plan-end" class="form-input" value="${planEnd}"></div>
            </div>`;

        this.app.modalManager.showModal(title, modalBody, [
            { text: 'Cancel', class: 'btn-secondary', onclick: 'laborTool.modalManager.closeModal()' },
            { text: 'Save', class: 'btn-primary', onclick: `laborTool.evaluationManager.saveEvaluation()` }
        ]);
    }

    async saveEvaluation() {
        const technicianId = document.getElementById('employee-name-select').value;
        if (!technicianId) return this.app.showError('Please select a technician.');
        
        const ratings = {};
        const ratingFields = ['leadership', 'culture', 'jobfit', 'integrity', 'people', 'workethic', 'excellence', 'longevity'];
        for (const field of ratingFields) {
            const value = document.getElementById(`${field}-rating`).value;
            if (!value) return this.app.showError(`Please provide a rating for "${field}".`);
            ratings[field] = value;
        }

        const evaluationDate = document.getElementById('evaluation-date').value;
        if (!evaluationDate) return this.app.showError('Please select an evaluation date.');

        const evaluationData = {
            technicianId,
            employeeName: this.app.teamManager.findPersonById(technicianId).name,
            evaluatorName: this.app.user.username,
            createdAt: firebase.firestore.Timestamp.fromDate(new Date(evaluationDate)),
            ratings,
            trainingOpportunities: document.getElementById('training-opportunities').value.trim(),
            observations: document.getElementById('observations').value.trim(),
            developmentPlan: document.getElementById('development-plan').value,
            planDocumentLink: document.getElementById('plan-document-link').value.trim(),
            planStart: document.getElementById('plan-start').value ? firebase.firestore.Timestamp.fromDate(new Date(document.getElementById('plan-start').value)) : null,
            planEnd: document.getElementById('plan-end').value ? firebase.firestore.Timestamp.fromDate(new Date(document.getElementById('plan-end').value)) : null,
        };

        try {
            const docRef = this.editingEvaluationId ? this.db.collection('technician-evaluations').doc(this.editingEvaluationId) : this.db.collection('technician-evaluations').doc();
            await docRef.set(evaluationData, { merge: true });
            this.app.showSuccess('Evaluation saved successfully!');
            this.app.modalManager.closeModal();
        } catch (error) {
            console.error("Error saving evaluation: ", error);
            this.app.showError("Error saving evaluation.");
        }
    }
    
    async openEvaluationHistoryModal(technicianId) {
        const tech = this.app.teamManager.findPersonById(technicianId);
        this.app.modalManager.showModal(`History for ${tech.name}`, '<p>Loading history...</p>', []);
        
        try {
            const snapshot = await this.db.collection('technician-evaluations').where('technicianId', '==', technicianId).orderBy('createdAt', 'desc').get();
            let historyHtml = '<div class="history-list">';
            if (snapshot.empty) {
                historyHtml += '<p>No evaluation history found.</p>';
            } else {
                snapshot.forEach(doc => {
                    const data = doc.data();
                    const { category } = this.calculateCategoryAndScore(data.ratings);
                    historyHtml += `
                        <div class="history-item">
                            <h4>${this.formatDate(data.createdAt)} - Category: ${category || 'N/A'}</h4>
                            <p><strong>Plan:</strong> ${data.developmentPlan || 'None'}</p>
                            <button class="btn btn-secondary btn-small" data-action="edit-eval" data-tech-id="${data.technicianId}">View/Edit This Entry</button>
                        </div>`;
                });
            }
            historyHtml += '</div>';

            this.app.modalManager.showModal(`History for ${tech.name}`, historyHtml, [{ text: 'Close', class: 'btn-secondary', onclick: 'laborTool.modalManager.closeModal()' }]);
        } catch(error) {
            console.error("Error loading history", error);
            this.app.modalManager.showModal('Error', '<p>Could not load evaluation history.</p>', [{ text: 'Close', class: 'btn-secondary', onclick: 'laborTool.modalManager.closeModal()' }]);
        }
    }

    openPrintModal() {
        const allStaff = this.app.teamManager.getAllTechnicians();
        const supervisors = allStaff.filter(tech => tech.role === 'Supervisor' || tech.role === 'MIT Lead');
        const technicians = allStaff.filter(tech => tech.role !== 'Supervisor' && tech.role !== 'MIT Lead' && tech.role !== 'Manager');

        const generateCheckboxList = (employeeList) => {
            return employeeList.map(emp => `
                <div class="checkbox-item">
                    <input type="checkbox" id="print-check-${emp.id}" name="employeeToPrint" value="${emp.id}" checked>
                    <label for="print-check-${emp.id}">${emp.name}</label>
                </div>
            `).join('');
        };
        
        const modalBody = `
            <p>Select the employees to include in the report.</p>
            <div class="print-selection-container">
                <div class="print-selection-column">
                    <h4>Supervisors & Leads</h4>
                    ${generateCheckboxList(supervisors)}
                </div>
                <div class="print-selection-column">
                    <h4>Technicians</h4>
                    ${generateCheckboxList(technicians)}
                </div>
            </div>
        `;

        this.app.modalManager.showModal('Print 20/70/10 Report', modalBody, [
            { text: 'Cancel', class: 'btn-secondary', onclick: 'laborTool.modalManager.closeModal()' },
            { text: 'Print', class: 'btn-primary', onclick: 'laborTool.evaluationManager.printEvaluationReport()' }
        ]);
    }

    printEvaluationReport() {
        const selectedIds = Array.from(document.querySelectorAll('input[name="employeeToPrint"]:checked')).map(cb => cb.value);
        const allStaff = this.app.teamManager.getAllTechnicians();

        const selectedStaff = allStaff.filter(s => selectedIds.includes(s.id));
        
        const supervisors = selectedStaff.filter(tech => tech.role === 'Supervisor' || tech.role === 'MIT Lead');
        const technicians = selectedStaff.filter(tech => tech.role !== 'Supervisor' && tech.role !== 'MIT Lead' && tech.role !== 'Manager');

        const generateReportTable = (employeeList) => {
            if (employeeList.length === 0) return '<p>No employees selected in this category.</p>';
            
            let employeesWithEvals = employeeList
                .map(tech => {
                    const latestEvaluation = this.allEvaluations[tech.id] || null;
                    const { averageScore } = latestEvaluation ? this.calculateCategoryAndScore(latestEvaluation.ratings) : { averageScore: null };
                    return { ...tech, latestEvaluation, averageScore };
                })
                .filter(t => t.averageScore !== null);

            employeesWithEvals.sort((a, b) => b.averageScore - a.averageScore);

            const totalEmployees = employeesWithEvals.length;
            const top20Count = Math.ceil(totalEmployees * 0.2);
            let bottom10Count = Math.ceil(totalEmployees * 0.2);

            if (totalEmployees > 0 && bottom10Count === 0) {
                bottom10Count = 1;
            }

            const rankedEmployees = employeesWithEvals.map((tech, index) => {
                let category;
                if (index < top20Count) category = '20';
                else if (index >= totalEmployees - bottom10Count) category = '10';
                else category = '70';
                return { ...tech, category };
            });

            return `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Employee</th>
                            <th>Category</th>
                            <th>Avg. Score</th>
                            <th>Leadership</th>
                            <th>Culture</th>
                            <th>Jobfit</th>
                            <th>Integrity</th>
                            <th>People</th>
                            <th>Workethic</th>
                            <th>Excellence</th>
                            <th>Longevity</th>
                            <th>Last Evaluated</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rankedEmployees.map(tech => `
                            <tr>
                                <td>${tech.name}</td>
                                <td>${tech.category}</td>
                                <td>${tech.averageScore.toFixed(2)}</td>
                                <td>${tech.latestEvaluation.ratings.leadership || 'N/A'}</td>
                                <td>${tech.latestEvaluation.ratings.culture || 'N/A'}</td>
                                <td>${tech.latestEvaluation.ratings.jobfit || 'N/A'}</td>
                                <td>${tech.latestEvaluation.ratings.integrity || 'N/A'}</td>
                                <td>${tech.latestEvaluation.ratings.people || 'N/A'}</td>
                                <td>${tech.latestEvaluation.ratings.workethic || 'N/A'}</td>
                                <td>${tech.latestEvaluation.ratings.excellence || 'N/A'}</td>
                                <td>${tech.latestEvaluation.ratings.longevity || 'N/A'}</td>
                                <td>${this.formatDate(tech.latestEvaluation?.createdAt)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        };

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
                <head>
                    <title>20/70/10 Report</title>
                    <link rel="stylesheet" href="css/styles.css">
                    <link rel="stylesheet" href="css/evaluation-styles.css">
                    <style>
                        body { background-color: white; font-family: sans-serif; }
                        .print-page { page-break-after: always; padding: 20px; }
                        .print-page:last-child { page-break-after: avoid; }
                        table { width: 100%; border-collapse: collapse; }
                        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                        th { background-color: #f2f2f2; }
                    </style>
                </head>
                <body>
                    <div class="print-page">
                        <h2>Supervisors & Leads</h2>
                        ${generateReportTable(supervisors)}
                    </div>
                    <div class="print-page">
                        <h2>Technicians</h2>
                        ${generateReportTable(technicians)}
                    </div>
                </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    }
}