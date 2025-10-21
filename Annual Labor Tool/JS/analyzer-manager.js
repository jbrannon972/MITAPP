// analyzer-manager.js
class AnalyzerManager {
    constructor(app) {
        this.app = app;
        this.db = app.firebaseService.db;
        this.analysisResults = null;
        this.currentData = null;
        this.dateToDelete = null;
        this.allTimeStatsCache = null;
        this.analysisDate = null;


        this.app.reportManager = new ReportManager(this.app);
    }

    async initialize() {
        if (document.getElementById('analyzer-tab')) {
            this.setupEventListeners();
            this.setDefaultDates();
            await this.loadReportsView();
        }
    }

    async getAllJobLocations() {
        if (!this.allTimeStatsCache || !this.allTimeStatsCache.jobHistory) {
             await this.loadDashboardData();
        }
        
        const locations = new Map();
        
        (this.allTimeStatsCache.jobHistory || []).forEach(job => {
            if (job.address && !locations.has(job.address)) {
                locations.set(job.address, {
                    name: job.name,
                    address: job.address
                });
            }
        });
        
        return Array.from(locations.values());
    }

    async loadReportsView() {
        try {
            const response = await fetch('reports.html');
            if (!response.ok) throw new Error('Could not fetch reports.html');
            const html = await response.text();
            document.getElementById('reports-view').innerHTML = html;
            this.app.reportManager.initialize();
        } catch (error) {
            console.error('Failed to load reports view:', error);
            document.getElementById('reports-view').innerHTML = '<p class="text-danger">Error: Could not load the reporting module.</p>';
        }
    }

    setDefaultDates() {
        const today = new Date();
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        const formatDate = (date) => date.toISOString().split('T')[0];

        document.getElementById('startDate').value = formatDate(firstDayOfMonth);
        document.getElementById('endDate').value = formatDate(today);
    }

    setupEventListeners() {
        const view = document.getElementById('analyzer-tab');
        if (!view) return;

        view.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (!button) return;

            if (button.classList.contains('sub-nav-btn')) {
                this.switchView(button.dataset.view);
            }

            const saveBtn = e.target.closest('.save-install-btn');
            if(saveBtn) {
                const jobId = saveBtn.closest('tr').dataset.jobId;
                this.saveInstallDptData(jobId);
            }

            if (button.id === 'find-missing-installs-btn') {
                this.findAndDisplayJobsMissingInstall();
            }
            if (button.id === 'second-shift-report-btn') {
                this.openSecondShiftReportModal();
            }

            const noInstallBtn = e.target.closest('.no-install-btn');
            if(noInstallBtn) {
                const jobId = noInstallBtn.closest('tr').dataset.jobId;
                this.markAsNoInstall(jobId);
            }
        });

        document.querySelector('label[for="csvFile"]')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.promptForAnalysisDate();
        });
        document.getElementById('csvFile')?.addEventListener('change', (event) => this.handleFileUpload(event));
        document.getElementById('duplicateBtn')?.addEventListener('click', () => this.checkForDuplicates());
        document.getElementById('saveStatsBtn')?.addEventListener('click', () => this.saveStatsToFirebase());
        document.getElementById('addSubJobBtn')?.addEventListener('click', () => this.addSubContractorJob());
        document.getElementById('loadDashboardBtn')?.addEventListener('click', () => this.loadDashboardData());
        document.getElementById('loadHistoricalStatsBtn')?.addEventListener('click', () => this.loadHistoricalStats());
        document.getElementById('showAllHistoricalStatsBtn')?.addEventListener('click', () => this.loadAllHistoricalStats());

        document.getElementById('deleteModal')?.querySelector('.modal-close').addEventListener('click', () => this.closeDeleteModal());
        document.getElementById('cancelDeleteBtn')?.addEventListener('click', () => this.closeDeleteModal());
        document.getElementById('confirmDeleteBtn')?.addEventListener('click', () => this.confirmDelete());
    }

    promptForAnalysisDate() {
        const today = new Date().toISOString().split('T')[0];
        const modalBody = `
            <p>Please select the date for which you are analyzing data.</p>
            <div class="form-group">
                <label for="analysis-date-picker">Analysis Date</label>
                <input type="date" id="analysis-date-picker" class="form-input" value="${today}">
            </div>
        `;

        this.app.modalManager.showModal('Select Analysis Date', modalBody, [
            { text: 'Cancel', class: 'btn-secondary', onclick: 'laborTool.modalManager.closeModal()' },
            { 
                text: 'Continue', 
                class: 'btn-primary', 
                onclick: `
                    laborTool.analyzerManager.analysisDate = new Date(document.getElementById('analysis-date-picker').value + 'T12:00:00Z');
                    laborTool.modalManager.closeModal();
                    document.getElementById('csvFile').click();
                `
            }
        ]);
    }


    switchView(viewName) {
        document.querySelectorAll('.analyzer-view').forEach(v => v.style.display = 'none');
        document.querySelectorAll('#analyzer-tab .sub-nav-btn').forEach(b => b.classList.remove('active'));

        document.getElementById(`${viewName}-view`).style.display = 'block';
        document.querySelector(`.sub-nav-btn[data-view="${viewName}"]`).classList.add('active');

        if (viewName === 'dashboard' && !this.allTimeStatsCache) {
            this.loadDashboardData();
        }
    }
    
    openSecondShiftReportModal() {
        const today = new Date().toISOString().split('T')[0];
        const modalBody = `
            <style>
                .job-entry { display: grid; grid-template-columns: 1fr 2fr auto; gap: 8px; align-items: center; margin-bottom: 8px; }
                .job-entry-3col { grid-template-columns: 1fr 1fr 1fr auto; }
            </style>
            <div class="form-group">
                <label for="reportDate">Report Date</label>
                <input type="date" id="reportDate" class="form-input" value="${today}">
            </div>
            <div class="form-group">
                <label>Jobs to know about (nuances, wins, concerns)</label>
                <div id="nuancesJobsContainer"></div>
                <button class="btn btn-secondary btn-small" onclick="laborTool.analyzerManager.addNuanceJobEntry()">+ Add Job</button>
            </div>
            <div class="form-group">
                <label>Jobs that cancelled/rescheduled/went on hold</label>
                <div id="cancelledJobsContainer"></div>
                <button class="btn btn-secondary btn-small" onclick="laborTool.analyzerManager.addCancelledJobEntry()">+ Add Job</button>
            </div>
            <div class="form-group">
                <label>After hours jobs</label>
                <div id="afterHoursJobsContainer"></div>
                <button class="btn btn-secondary btn-small" onclick="laborTool.analyzerManager.addAfterHoursJobEntry()">+ Add Job</button>
            </div>
            <div class="form-grid" style="grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-top: 1.5rem;">
                <div class="form-group">
                    <label for="techShoutouts">Technician Shoutouts</label>
                    <textarea id="techShoutouts" class="form-input" rows="3"></textarea>
                </div>
                <div class="form-group">
                    <label for="techConcerns">Technician Concerns</label>
                    <textarea id="techConcerns" class="form-input" rows="3"></textarea>
                </div>
                <div class="form-group">
                    <label for="deptShoutouts">Other Department Shoutouts</label>
                    <textarea id="deptShoutouts" class="form-input" rows="3"></textarea>
                </div>
                 <div class="form-group">
                    <label for="deptConcerns">Other Department Concerns</label>
                    <textarea id="deptConcerns" class="form-input" rows="3"></textarea>
                </div>
            </div>
        `;

        this.app.modalManager.showModal('Second Shift Report', modalBody, [
            { text: 'Cancel', class: 'btn-secondary', onclick: 'laborTool.modalManager.closeModal()' },
            { text: 'Submit Report', class: 'btn-primary', onclick: 'laborTool.analyzerManager.saveSecondShiftReport()' }
        ]);
        
        this.addNuanceJobEntry();
        this.addCancelledJobEntry();
        this.addAfterHoursJobEntry();
    }

    addNuanceJobEntry() {
        const container = document.getElementById('nuancesJobsContainer');
        const entryId = `nuance-${Date.now()}`;
        const entryDiv = document.createElement('div');
        entryDiv.id = entryId;
        entryDiv.className = 'job-entry nuance-job-entry';
        entryDiv.innerHTML = `
            <input type="text" class="form-input job-name" placeholder="Job Name / Number">
            <input type="text" class="form-input job-notes" placeholder="Notes (nuance, win, concern, etc.)">
            <button class="btn btn-danger btn-small" onclick="document.getElementById('${entryId}').remove()">×</button>
        `;
        container.appendChild(entryDiv);
    }

    addCancelledJobEntry() {
        const container = document.getElementById('cancelledJobsContainer');
        const entryId = `cancelled-${Date.now()}`;
        const entryDiv = document.createElement('div');
        entryDiv.id = entryId;
        entryDiv.className = 'job-entry cancelled-job-entry';
        entryDiv.innerHTML = `
            <input type="text" class="form-input job-name" placeholder="Job Name / Number">
            <input type="text" class="form-input job-notes" placeholder="Notes (e.g., Rescheduled to Friday)">
            <button class="btn btn-danger btn-small" onclick="document.getElementById('${entryId}').remove()">×</button>
        `;
        container.appendChild(entryDiv);
    }

    addAfterHoursJobEntry() {
        const container = document.getElementById('afterHoursJobsContainer');
        const entryId = `after-hours-${Date.now()}`;
        const entryDiv = document.createElement('div');
        entryDiv.id = entryId;
        entryDiv.className = 'job-entry job-entry-3col after-hours-job-entry';
        entryDiv.innerHTML = `
            <input type="text" class="form-input job-name" placeholder="Job Name / Number">
            <input type="text" class="form-input job-reason" placeholder="Reason for after hours">
            <input type="text" class="form-input job-who" placeholder="Who went">
            <button class="btn btn-danger btn-small" onclick="document.getElementById('${entryId}').remove()">×</button>
        `;
        container.appendChild(entryDiv);
    }

    async saveSecondShiftReport() {
        const date = document.getElementById('reportDate').value;
        if (!date) {
            alert('Please select a date for the report.');
            return;
        }

        const collectJobEntries = (selector) => {
            const entries = [];
            document.querySelectorAll(selector).forEach(entry => {
                const jobName = entry.querySelector('.job-name')?.value.trim();
                const notes = entry.querySelector('.job-notes')?.value.trim();
                const reason = entry.querySelector('.job-reason')?.value.trim();
                const who = entry.querySelector('.job-who')?.value.trim();
                
                if (jobName) {
                    const entryData = { jobName };
                    if (notes !== undefined) entryData.notes = notes;
                    if (reason !== undefined) entryData.reason = reason;
                    if (who !== undefined) entryData.who = who;
                    entries.push(entryData);
                }
            });
            return entries;
        };

        const nuances = collectJobEntries('.nuance-job-entry');
        const cancelledJobs = collectJobEntries('.cancelled-job-entry');
        const afterHoursJobs = collectJobEntries('.after-hours-job-entry');

        const reportData = {
            date,
            nuances,
            cancelledJobs,
            afterHoursJobs,
            afterHours: afterHoursJobs.length > 0, // Keep this boolean for quick checks
            techShoutouts: document.getElementById('techShoutouts').value.trim(),
            techConcerns: document.getElementById('techConcerns').value.trim(),
            deptShoutouts: document.getElementById('deptShoutouts').value.trim(),
            deptConcerns: document.getElementById('deptConcerns').value.trim(),
            submittedBy: this.app.user.username,
            submittedAt: new Date().toISOString()
        };

        try {
            await this.app.firebaseService.saveSecondShiftReport(date, reportData);
            this.app.showSuccess('Second shift report submitted successfully!');
            this.app.modalManager.closeModal();
        } catch (error) {
            this.app.showError(`Failed to save report: ${error.message}`);
        }
    }

    async findAndDisplayJobsMissingInstall() {
        const container = document.getElementById('install-dpt-results');
        if (!container) return;

        container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Searching database for jobs missing install records...</div>';

        const missingInstalls = await this.app.firebaseService.findJobsWithoutInstall();

        if (missingInstalls.length === 0) {
            container.innerHTML = '<div class="file-input-section" style="margin-top: 1rem;"><p>All jobs appear to have an install record. If this is incorrect, you may need to run the data sanitizer utility.</p></div>';
            return;
        }

        const demoOptions = ['Investigative demo', 'Emergency demo', 'Demo to expose leak', 'Cash Demo', 'Demo to dry']
            .map(opt => `<option value="${opt}">${opt}</option>`).join('');

        const tableRows = missingInstalls.map(job => `
            <tr data-job-id="${job.id}" data-last-seen="${job.lastSeen || ''}">
                <td data-label="Customer">${job.name}<br><small>${this.extractJobNumber(job.id)}</small></td>
                <td data-label="Last Seen">${job.lastSeen || 'N/A'}</td>
                <td data-label="Date Installed"><input type="date" class="form-input date-installed-input"></td>
                <td data-label="Demo Type">
                    <select class="form-input demo-type-select">
                        <option value="">-- Select --</option>
                        ${demoOptions}
                    </select>
                </td>
                <td data-label="Duration"><input type="number" class="form-input duration-input" placeholder="Hrs"></td>
                <td data-label="Two Man?">
                    <select class="form-input two-man-select">
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                    </select>
                </td>
                <td data-label="Notes"><textarea class="form-input notes-input" rows="1" placeholder="Installer notes..."></textarea></td>
                <td data-label="Action" class="actions-cell">
                    <button class="btn btn-primary btn-small save-install-btn">Save</button>
                    <button class="btn btn-secondary btn-small no-install-btn">No Install</button>
                </td>
            </tr>
        `).join('');

        container.innerHTML = `
            <div class="card" style="margin-top: 1rem;">
                <div class="card-header">
                    <h3><i class="fas fa-wrench"></i> Jobs Needing Install Record (${missingInstalls.length})</h3>
                </div>
                <div class="table-container">
                    <table class="data-table" id="install-dpt-table">
                        <thead>
                            <tr>
                                <th>Customer / Job #</th>
                                <th>Last Seen</th>
                                <th>Date Installed</th>
                                <th>Demo Type</th>
                                <th>Duration (hrs)</th>
                                <th>Two Man?</th>
                                <th>Notes</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                    </table>
                </div>
            </div>
            <style>
                #install-dpt-table th, #install-dpt-table td {
                    padding: 8px 10px;
                    font-size: 14px;
                    white-space: nowrap;
                }
                #install-dpt-table .form-input {
                    padding: 6px 8px;
                    font-size: 14px;
                    min-width: 120px;
                }
                #install-dpt-table .actions-cell {
                    display: flex;
                    flex-direction: row;
                    gap: 8px;
                    justify-content: flex-end;
                }
                @media (max-width: 768px) {
                    #install-dpt-table .actions-cell {
                         justify-content: center;
                    }
                }
            </style>
        `;
    }

    async saveInstallDptData(jobId) {
        const row = document.querySelector(`#install-dpt-table tr[data-job-id="${jobId}"]`);
        if (!row) return;

        const durationInput = row.querySelector('.duration-input');
        const notesInput = row.querySelector('.notes-input');
        const dateInput = row.querySelector('.date-installed-input');
        const demoSelect = row.querySelector('.demo-type-select');
        const twoManSelect = row.querySelector('.two-man-select');
        const button = row.querySelector('.save-install-btn');
        const lastSeenDate = row.dataset.lastSeen;

        let duration = parseFloat(durationInput.value);
        const notes = notesInput.value.trim();
        const installedDate = dateInput.value;
        const demoType = demoSelect.value;
        const isTwoMan = twoManSelect.value === 'yes';

        if (!installedDate) {
            alert('Please select the date of installation.');
            dateInput.focus();
            return;
        }
        if (isNaN(duration) || duration <= 0) {
            alert('Please enter a valid duration.');
            durationInput.focus();
            return;
        }

        const finalDuration = isTwoMan ? duration * 2 : duration;
        const installType = (installedDate === lastSeenDate) ? 'same-day' : 'prescheduled';

        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            // Step 1: Save the specific install details
            await this.db.collection('install_details').doc(jobId).set({
                duration: finalDuration,
                installerNotes: notes,
                installedDate: installedDate,
                demoType: demoType,
                isTwoMan: isTwoMan,
                installType: installType,
                installedBy: 'Second Shift',
                savedAt: firebase.firestore.Timestamp.now(),
                savedBy: this.app.user.username
            }, { merge: true });

            // Step 2: Update the job history record
            await this.db.collection('analyzer_job_history').doc(jobId).set({ hasInstallRecord: true }, { merge: true });

            // Step 3: Update the daily and global stats
            await this.updateStatsWithNewInstall(installedDate, finalDuration, jobId, installType);

            // Step 4: Update UI
            row.style.transition = 'all 0.5s ease';
            row.style.opacity = '0';
            setTimeout(() => row.remove(), 500);

        } catch (error) {
            console.error("Error saving install DPT data:", error);
            this.app.showError("Failed to save data.");
            button.disabled = false;
            button.innerHTML = 'Save';
        }
    }

    async markAsNoInstall(jobId) {
        const row = document.querySelector(`#install-dpt-table tr[data-job-id="${jobId}"]`);
        const button = row.querySelector('.no-install-btn');
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            await this.db.collection('analyzer_job_history').doc(jobId).set({
                hasInstallRecord: false,
                noInstallRequired: true,
                markedAsNoInstallAt: firebase.firestore.Timestamp.now(),
                markedAsNoInstallBy: this.app.user.username
            }, { merge: true });

            row.style.transition = 'all 0.5s ease';
            row.style.opacity = '0';
            setTimeout(() => row.remove(), 500);

        } catch (error) {
            console.error("Error marking job as no install:", error);
            this.app.showError("Failed to update the job record.");
            button.disabled = false;
            button.innerHTML = 'No Install';
        }
    }

    async saveStatsToFirebase() {
        if (!this.analysisResults) {
            alert('No analysis results to save.');
            return;
        }
    
        const saveBtn = document.getElementById('saveStatsBtn');
        const dateToSave = document.getElementById('saveDate').value;
        if (!dateToSave) {
            alert('Please select a date to save these stats for.');
            return;
        }
    
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving... (0%)`;
    
        try {
            const subContractorJobs = [];
            document.querySelectorAll('.sub-job-entry').forEach(entry => {
                const crew = entry.querySelector('.sub-job-crew').value;
                const assignmentSelect = entry.querySelector('.sub-job-assignment');
                const selectedOption = assignmentSelect.options[assignmentSelect.selectedIndex];
                const specialService = entry.querySelector('.special-service-select').value;
                const jobId = selectedOption.value;
                const jobName = selectedOption.dataset.name;
                const address = selectedOption.dataset.address;
                const price = parseFloat(entry.querySelector('.sub-job-price').value) || 0;
                let demoHours = parseFloat(entry.querySelector('.sub-job-hours').value) || 0;

                if (specialService !== 'None') demoHours = 0;

                if (crew && jobId && price > 0) {
                    subContractorJobs.push({ crew, jobId, jobName, address, price, demoHours, specialService });
                }
            });

            const subTeamCount = subContractorJobs.filter(j => j.specialService === 'None').length;
            const dateObj = new Date(dateToSave + 'T12:00:00Z');
            const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'long' });

            const dataToSave = {
                ...this.analysisResults,
                date: dateToSave,
                dayOfWeek,
                subTeamCount,
                subContractorJobs,
                savedAt: new Date().toISOString()
            };

            await this.app.firebaseService.saveDailyStats(dateToSave, dataToSave);
    
            // --- FIX STARTS HERE ---
            const installDetailsSnapshot = await this.db.collection('install_details').get();
            const alreadyInstalledJobIds = new Set();
            installDetailsSnapshot.forEach(doc => {
                alreadyInstalledJobIds.add(doc.id);
            });
            // --- FIX ENDS HERE ---

            const jobIdsToUpdate = this.analysisResults.jobNumbers.filter(id => id && id !== 'N/A');
            const totalJobsToUpdate = jobIdsToUpdate.length;
    
            let jobsProcessed = 0;
            for (const jobId of jobIdsToUpdate) {
                const jobData = this.analysisResults.jobsData.find(j => j.id === jobId);
                const jobType = this.analysisResults.jobIdToTypeMap[jobId];
                
                // --- FIX STARTS HERE ---
                const hasBeenPreviouslyInstalled = alreadyInstalledJobIds.has(jobId);
                const mergeData = {
                    hasInstallRecord: hasBeenPreviouslyInstalled || jobType === 'install'
                };
                // --- FIX ENDS HERE ---
                
                await this.app.firebaseService.updateJobHistory(jobId, dateToSave, jobData, mergeData);
                
                jobsProcessed++;
                const progress = Math.round((jobsProcessed / totalJobsToUpdate) * 100);
                saveBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving... (${progress}%)`;
            }
    
            document.getElementById('statusMessage').innerHTML = `<div class="status-message status-success">Stats and Job History saved for ${dateToSave}!</div>`;
            this.allTimeStatsCache = null;
    
        } catch (error) {
            console.error('Error during save process:', error);
            document.getElementById('statusMessage').innerHTML = `<div class="status-message status-error">A critical error occurred: ${error.message}</div>`;
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = `<i class="fas fa-save"></i> Save Daily Stats`;
        }
    }
    
    extractCustomerName(title) {
        const parts = (title || '').split('|');
        return parts[0] ? parts[0].trim() : 'Unknown';
    }

    extractJobNumber(text) {
        const match = (text || '').match(/(\d{2}-\d{5,})/);
        return match ? match[0] : null;
    }

    extractFullJobId(title) {
        const match = (title || '').match(/\d{2}-\d{5,}-\w+-\w+-\w+/);
        return match ? match[0] : 'N/A';
    }

    extractTimeFrame(row) {
        const title = row.route_title || '';
        const description = row.route_description || '';

        const titleMatch = title.match(/TF:\s*(\d{1,2}-\d{1,2})/i);
        if (titleMatch) return titleMatch[1];

        const descTFMatch = description.match(/TF:\s*(\d{1,2}-\d{1,2})(?:pm|am)?/i);
        if (descTFMatch) return descTFMatch[1];

        const descMatch = description.match(/TF\(([^)]+)\)/i);
        if (descMatch) {
            const tfContent = descMatch[1];
            const timeMatch = tfContent.match(/(\d{1,2})(?::?\d{0,2})?[-\s]*(?:to|-|–)?\s*(\d{1,2})(?::?\d{0,2})?/);
            if (timeMatch) return `${timeMatch[1]}-${timeMatch[2]}`;
            return tfContent;
        }

        return null;
    }

    extractAddressParts(fullAddress) {
        if (!fullAddress) return { street: 'N/A', city: 'N/A', zip: 'N/A' };
        const zipMatch = fullAddress.match(/(\d{5})$/);
        const zip = zipMatch ? zipMatch[1] : 'N/A';

        const parts = fullAddress.split(',');
        const street = parts[0] || 'N/A';
        const city = parts.length > 1 ? parts[1].trim() : 'N/A';

        return { street, city, zip };
    }

    parseCSV(text) {
        const data = [];
        let current = '';
        let inQuotes = false;
        let headers = null;
        let currentRow = [];

        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            if (char === '"') {
                inQuotes = !inQuotes;
                current += char;
            } else if (char === ',' && !inQuotes) {
                currentRow.push(current.trim());
                current = '';
            } else if ((char === '\n' || char === '\r') && !inQuotes) {
                if (current.trim() || currentRow.length > 0) {
                    currentRow.push(current.trim());

                    if (!headers) {
                        headers = currentRow.map(h => h.replace(/"/g, '').trim());
                    } else if (currentRow.length === headers.length) {
                        const row = {};
                        headers.forEach((header, index) => {
                            let value = currentRow[index] || '';
                            value = value.replace(/^"/, '').replace(/"$/, '');
                            if (!isNaN(value) && value !== '' && !isNaN(parseFloat(value))) {
                                row[header] = parseFloat(value);
                            } else {
                                row[header] = value;
                            }
                        });
                        data.push(row);
                    }
                    currentRow = [];
                    current = '';
                }
            } else if (char !== '\r') {
                current += char;
            }
        }

        if (current.trim() || currentRow.length > 0) {
            currentRow.push(current.trim());
            if (headers && currentRow.length === headers.length) {
                const row = {};
                headers.forEach((header, index) => {
                    let value = currentRow[index] || '';
                    value = value.replace(/^"/, '').replace(/"$/, '');
                    if (!isNaN(value) && value !== '' && !isNaN(parseFloat(value))) {
                        row[header] = parseFloat(value);
                    } else {
                        row[header] = value;
                    }
                });
                data.push(row);
            }
        }

        return { data, meta: { fields: headers } };
    }

    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const statusDiv = document.getElementById('statusMessage');
        const loadingDiv = document.getElementById('loadingMessage');

        try {
            statusDiv.innerHTML = `<div class="status-message status-success">File uploaded. Analyzing...</div>`;
            loadingDiv.style.display = 'block';

            const text = await file.text();
            this.analyzeCSVData(text);

            document.getElementById('duplicateBtn').disabled = false;
            document.getElementById('saveControls').style.display = 'flex';

        } catch (error) {
            statusDiv.innerHTML = `<div class="status-message status-error">Error reading file: ${error.message}</div>`;
            loadingDiv.style.display = 'none';
        }
    }

    analyzeCSVData(csvText) {
        try {
            const parsedData = this.parseCSV(csvText);
            if (!parsedData.data || parsedData.data.length === 0) throw new Error('No data found in CSV.');

            this.currentData = parsedData.data;
            const results = this.performAnalysis(parsedData.data);
            this.analysisResults = results;

            this.displayResults(results);

            document.getElementById('loadingMessage').style.display = 'none';

            const today = new Date().toISOString().split('T')[0];
            document.getElementById('saveDate').value = today;
            document.getElementById('analysisDateDisplay').textContent = today;

            document.getElementById('statusMessage').innerHTML = `<div class="status-message status-success">Analysis complete! ${results.totalJobs} jobs analyzed.</div>`;

        } catch (error) {
            console.error('Analysis error:', error);
            document.getElementById('statusMessage').innerHTML = `<div class="status-message status-error">Analysis error: ${error.message}</div>`;
            document.getElementById('loadingMessage').style.display = 'none';
        }
    }

    performAnalysis(data) {
        const jobTypePatterns = { install: /install/i, demo: /demo/i, cs: /check service|cs/i, pull: /pull/i };
        let jobTypeCounts = { install: 0, demo: 0, cs: 0, pull: 0, other: 0 };
        let jobTypeTechHours = { install: 0, demo: 0, cs: 0, pull: 0, other: 0 };
        let zoneCounts = {};
        let timeFrameCounts = { '9-12': 0, '9-4': 0, '12-4': 0, 'other': 0 };
        let otherTFDetails = [];
        const jobNumbers = new Set();
        let demoJobs = [];
        let dtTrueCount = 0, dtLaborHours = 0, totalLaborHours = 0;
        let jobIdToTypeMap = {};
        let jobsData = [];

        data.forEach(row => {
            const title = row.route_title || '';
            const duration = row.duration || 0;
            const description = row.route_description || '';
            const zone = `Z${row.Zone || 'N/A'}`;
            const isDT = /DT\((true)\)/i.test(description);
            const techHours = isDT ? duration * 2 : duration;
            const fullJobId = this.extractFullJobId(title);

            jobsData.push({
                id: fullJobId,
                name: this.extractCustomerName(title),
                address: row.customer_address
            });

            const timeFrame = this.extractTimeFrame(row);
            if (timeFrame === '9-12') timeFrameCounts['9-12']++;
            else if (timeFrame === '9-4' || timeFrame === '9-16') timeFrameCounts['9-4']++;
            else if (timeFrame === '12-4' || timeFrame === '12-16') timeFrameCounts['12-4']++;
            else if (timeFrame) {
                timeFrameCounts['other']++;
                otherTFDetails.push({ customer: this.extractCustomerName(title), timeFrame: timeFrame, jobNumber: fullJobId });
            }

            totalLaborHours += duration;
            if(zone.replace('Z', '').trim() !== 'N/A') {
                 zoneCounts[zone] = (zoneCounts[zone] || {jobs: 0, hours: 0});
                 zoneCounts[zone].jobs++;
                 zoneCounts[zone].hours += techHours;
            }


            let foundType = 'other';
            for (const [type, pattern] of Object.entries(jobTypePatterns)) {
                if (pattern.test(title)) {
                    foundType = type;
                    break;
                }
            }

            if (fullJobId !== 'N/A') {
                jobNumbers.add(fullJobId);
                jobIdToTypeMap[fullJobId] = foundType;
            }

            jobTypeCounts[foundType]++;
            jobTypeTechHours[foundType] += techHours;

            if (foundType === 'demo') {
                demoJobs.push({
                    id: fullJobId,
                    name: this.extractCustomerName(title),
                    address: row.customer_address,
                    jobType: foundType,
                    duration: duration,
                    isDT: isDT
                });
            }
            if (isDT) { dtTrueCount++; dtLaborHours += duration; }
        });

        const totalJobs = data.length;
        const totalTechHours = totalLaborHours + dtLaborHours;
        const averageTechHoursPerJob = totalJobs > 0 ? (totalTechHours / totalJobs).toFixed(2) : 0;

        return {
            totalJobs,
            sameDayInstallCount: 0,
            jobTypeCounts,
            jobTypeTechHours,
            zoneCounts,
            timeFrameCounts,
            otherTFDetails,
            demoJobs,
            dtTrueCount,
            dtLaborHours,
            totalLaborHours,
            totalTechHours,
            averageTechHoursPerJob,
            jobNumbers: Array.from(jobNumbers),
            jobIdToTypeMap,
            jobsData,
            timestamp: new Date().toISOString()
        };
    }

    _getMetricsHtml(results) {
        const otherTFCount = (results.timeFrameCounts && results.timeFrameCounts.other) ? results.timeFrameCounts.other : 0;
        const otherTFHtml = otherTFCount > 0
            ? `<span class="breakdown-value clickable" style="text-decoration: underline; cursor: pointer;" onclick="laborTool.analyzerManager.showOtherTFModal()">${otherTFCount}</span>`
            : `<span class="breakdown-value">0</span>`;

        const prescheduledJobs = results.totalJobs || 0;
        const sameDayInstalls = results.sameDayInstallCount || 0;
        const totalJobsCombined = prescheduledJobs + sameDayInstalls;
        const avgHours = totalJobsCombined > 0 ? ((results.totalTechHours || 0) / totalJobsCombined).toFixed(2) : '0.00';
        
        const jobsBreakdownHtml = `
            <ul class="breakdown-list">
                <li class="breakdown-item"><span class="breakdown-label">Prescheduled</span><span class="breakdown-value">${prescheduledJobs}</span></li>
                <li class="breakdown-item"><span class="breakdown-label">Same Day</span><span class="breakdown-value">${sameDayInstalls}</span></li>
                <li class="breakdown-item" style="border-top: 1px solid var(--border-color); font-weight: bold;"><span class="breakdown-label">Total</span><span class="breakdown-value">${totalJobsCombined}</span></li>
            </ul>`;

        return `
            <div class="metric-card concise">
                <div class="metric-header"><i class="fas fa-briefcase"></i> Total Jobs</div>
                <div class="metric-content" style="text-align: left; padding: 0 10px;">${jobsBreakdownHtml}</div>
            </div>
            <div class="metric-card concise">
                <div class="metric-header"><i class="fas fa-user-clock"></i> Avg Tech Hours</div>
                <div class="metric-content">
                    <div class="big-number">${avgHours}</div>
                    <div class="metric-description">Hours per job</div>
                </div>
            </div>
            <div class="metric-card concise">
                <div class="metric-header"><i class="fas fa-hard-hat"></i> Total Tech Hours</div>
                <div class="metric-content">
                    <div class="big-number">${(results.totalTechHours || 0).toFixed(1)}</div>
                    <div class="metric-description">Base: ${results.totalLaborHours || 0} + DT: ${results.dtLaborHours || 0}</div>
                </div>
            </div>
            <div class="metric-card concise">
                <div class="metric-header"><i class="fas fa-chart-pie"></i> Job Types</div>
                <div class="metric-content">
                    <ul class="breakdown-list">
                        ${Object.entries(results.jobTypeCounts).map(([type, count]) => `
                        <li class="breakdown-item">
                            <span class="breakdown-label">${type.charAt(0).toUpperCase() + type.slice(1)}</span>
                            <span class="breakdown-value">${count}</span>
                        </li>`).join('')}
                    </ul>
                </div>
            </div>
             <div class="metric-card concise">
                <div class="metric-header"><i class="fas fa-clock"></i> Time Frames</div>
                <div class="metric-content">
                    <ul class="breakdown-list time-frames">
                        <li class="breakdown-item"><span class="breakdown-label">9-12</span><span class="breakdown-value">${(results.timeFrameCounts && results.timeFrameCounts['9-12']) ? results.timeFrameCounts['9-12'] : 0}</span></li>
                        <li class="breakdown-item"><span class="breakdown-label">9-4</span><span class="breakdown-value">${(results.timeFrameCounts && results.timeFrameCounts['9-4']) ? results.timeFrameCounts['9-4'] : 0}</span></li>
                        <li class="breakdown-item"><span class="breakdown-label">12-4</span><span class="breakdown-value">${(results.timeFrameCounts && results.timeFrameCounts['12-4']) ? results.timeFrameCounts['12-4'] : 0}</span></li>
                        <li class="breakdown-item"><span class="breakdown-label">Other</span>${otherTFHtml}</li>
                    </ul>
                </div>
            </div>
            <div class="metric-card concise">
                <div class="metric-header"><i class="fas fa-chart-bar"></i> Daily Hours</div>
                <div class="metric-content chart-in-card">
                     <canvas id="analyzerDailyHoursChart"></canvas>
                </div>
            </div>
        `;
    }

    async displayResults(results) {
        const container = document.getElementById('singleRowResultsContainer');
        container.innerHTML = this._getMetricsHtml(results);
        container.style.display = 'grid';
    
        // Fetch the complete daily hours data, including available hours
        const dailyHoursData = await this.app.calculator.getDailyHoursData(this.analysisDate);
        
        // Merge the analysis results (requested hours) with the fetched available hours
        const chartData = {
            ...dailyHoursData, // This now includes hoursAvailable and dtHoursAvailable
            totalLaborHours: results.totalLaborHours,
            dtHours: results.dtLaborHours
        };
        
        this.app.chartRenderer.renderDailyHoursChart(chartData, 'analyzerDailyHoursChart');
    
        document.getElementById('subContractorSection').style.display = 'block';
        document.getElementById('demoJobsSection').style.display = 'block';
    
        this.populateDemoJobsTable(results.demoJobs);
    
        document.getElementById('subContractorJobsList').innerHTML = '';
    }
    

    populateDemoJobsTable(demoJobs) {
        const demoTableBody = document.querySelector('#demoJobsTable tbody');
        const demoJobsHeader = document.querySelector('#demoJobsSection h3');

        demoJobsHeader.innerHTML = `<i class="fas fa-clipboard-list"></i> Assignable Demo Jobs (${demoJobs.length})`;
        demoTableBody.innerHTML = ''; // Clear existing rows

        demoJobs.sort((a, b) => b.duration - a.duration); // Sort by duration descending

        demoJobs.forEach(job => {
            const { street, city, zip } = this.extractAddressParts(job.address);
            const simpleJobNumber = this.extractJobNumber(job.id);
            const row = document.createElement('tr');
            const displayDuration = job.isDT ? job.duration * 2 : job.duration;
            const jobDataString = JSON.stringify({id: job.id, name: job.name, address: job.address, duration: displayDuration}).replace(/"/g, '"');

            row.innerHTML = `
                <td>${job.name} <br><small>${simpleJobNumber}</small></td>
                <td>${street}</td>
                <td>${city}</td>
                <td>${zip}</td>
                <td>${job.jobType.charAt(0).toUpperCase() + job.jobType.slice(1)}</td>
                <td>${displayDuration} hrs</td>
                <td>${job.isDT ? 'Y' : 'N'}</td>
                <td><button class="select-job-btn" onclick='laborTool.analyzerManager.selectDemoJobForSub(${jobDataString})'>Select</button></td>
            `;
            demoTableBody.appendChild(row);
        });
    }

    addSubContractorJob() {
        const list = document.getElementById('subContractorJobsList');
        const entryId = `sub-job-${Date.now()}`;
        const entry = document.createElement('div');
        entry.className = 'sub-job-entry';
        entry.id = entryId;

        const demoOptions = this.analysisResults.demoJobs.map(job =>
            `<option value="${job.id}" data-name="${job.name}" data-address="${job.address}">${job.name} (${job.id})</option>`
        ).join('');

        entry.innerHTML = `
            <select class="sub-job-crew">
                <option value="Enrique">Enrique</option>
                <option value="PG Works">PG Works</option>
                <option value="Other">Other</option>
            </select>
            <select class="sub-job-assignment">
                <option value="">Select a Job</option>
                ${demoOptions}
            </select>
            <select class="special-service-select" onchange="laborTool.analyzerManager.handleSpecialServiceChange(this)">
                <option value="None">None</option>
                <option value="Scaffolding">Scaffolding</option>
                <option value="Countertops">Countertops</option>
                <option value="Other">Other</option>
            </select>
            <input type="number" placeholder="Price Paid ($)" class="sub-job-price">
            <input type="number" placeholder="Demo Hours Handled" class="sub-job-hours">
            <button class="remove-sub-btn" onclick="document.getElementById('${entryId}').remove()">
                <i class="fas fa-trash"></i>
            </button>
        `;
        list.appendChild(entry);
        return entry;
    }

    handleSpecialServiceChange(selectElement) {
        const parentEntry = selectElement.closest('.sub-job-entry');
        const hoursInput = parentEntry.querySelector('.sub-job-hours');
        if (selectElement.value !== 'None') {
            hoursInput.value = '';
            hoursInput.disabled = true;
        } else {
            hoursInput.disabled = false;
        }
    }

    selectDemoJobForSub(jobData) {
        const newEntry = this.addSubContractorJob();
        const assignmentSelect = newEntry.querySelector('.sub-job-assignment');
        const hoursInput = newEntry.querySelector('.sub-job-hours');
        assignmentSelect.value = jobData.id;
        hoursInput.value = jobData.duration;
        newEntry.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    async loadDashboardData() {
        const loadingDiv = document.getElementById('dashboardLoading');
        const container = document.getElementById('dashboardContainer');
        loadingDiv.style.display = 'block';
        container.innerHTML = '';

        try {
            if (!this.allTimeStatsCache) {
                this.allTimeStatsCache = await this.app.firebaseService.getDashboardData();
                const zoneFilter = document.getElementById('zoneFilter');
                if (zoneFilter) {
                   zoneFilter.innerHTML = this.allTimeStatsCache.allZones.map(z => `<option value="${z}">${z}</option>`).join('');
                }
            }

            const startDate = document.getElementById('startDate').value;
            const endDate = document.getElementById('endDate').value;

            const selectedDayTypes = Array.from(document.querySelectorAll('input[name="dayType"]:checked')).map(cb => cb.value);

            const filteredDailyStats = this.allTimeStatsCache.dailyStats.filter(stat => {
                const statDate = new Date(stat.date + 'T12:00:00Z');
                const dayIndex = statDate.getDay();
                let dayType = '';
                if (dayIndex === 0) dayType = 'sunday';
                else if (dayIndex === 6) dayType = 'saturday';
                else dayType = 'weekday';

                return (!startDate || stat.date >= startDate) &&
                       (!endDate || stat.date <= endDate) &&
                       (selectedDayTypes.includes(dayType));
            });

            if (filteredDailyStats.length === 0) {
                container.innerHTML = `<div class="status-message status-error">No data found for the selected filters.</div>`;
                return;
            }

            // --- Data Aggregation ---
            let totalPrescheduledJobs = 0, totalSameDayInstalls = 0, totalTechHours = 0, totalSubSpending = 0, totalSubHoursUsed = 0, totalDemoHours = 0;
            let totalDtJobs = 0, totalDtHours = 0, totalSubTeams = 0, totalTechHoursForAllTypes = 0;
            const specialServiceSpending = { Scaffolding: 0, Countertops: 0, Other: 0 };
            const jobsByDay = { 'Monday': 0, 'Tuesday': 0, 'Wednesday': 0, 'Thursday': 0, 'Friday': 0, 'Saturday': 0, 'Sunday': 0 };
            const techHourDistribution = { install: 0, demo: 0, cs: 0, pull: 0, other: 0 };
            const visitTypeCounts = { install: 0, demo: 0, cs: 0, pull: 0, other: 0 };
            const uniqueJobsPerType = { install: new Set(), demo: new Set(), cs: new Set(), pull: new Set(), other: new Set() };
            const jobTypeAggregates = { install: {t:0, c:0}, demo: {t:0, c:0}, cs: {t:0, c:0}, pull: {t:0, c:0}, other: {t:0, c:0} };

            filteredDailyStats.forEach(stat => {
                const prescheduled = stat.totalJobs || 0;
                const sameDay = stat.sameDayInstallCount || 0;
                const totalForDay = prescheduled + sameDay;

                totalPrescheduledJobs += prescheduled;
                totalSameDayInstalls += sameDay;
                totalTechHours += stat.totalTechHours || 0;
                totalDtJobs += stat.dtTrueCount || 0;
                totalDtHours += stat.dtLaborHours || 0;
                totalSubTeams += stat.subTeamCount || 0;

                (stat.subContractorJobs || []).forEach(j => {
                    totalSubSpending += j.price;
                    totalSubHoursUsed += j.demoHours;
                    if (j.specialService && j.specialService !== 'None') {
                        specialServiceSpending[j.specialService] = (specialServiceSpending[j.specialService] || 0) + j.price;
                    }
                });

                if (stat.dayOfWeek && jobsByDay.hasOwnProperty(stat.dayOfWeek)) {
                    jobsByDay[stat.dayOfWeek] += totalForDay;
                }

                for(const type in techHourDistribution) {
                    jobTypeAggregates[type].c += (stat.jobTypeCounts && stat.jobTypeCounts[type]) ? stat.jobTypeCounts[type] : 0;
                    jobTypeAggregates[type].t += (stat.jobTypeTechHours && stat.jobTypeTechHours[type]) ? stat.jobTypeTechHours[type] : 0;
                    const hours = (stat.jobTypeTechHours && stat.jobTypeTechHours[type]) ? stat.jobTypeTechHours[type] : 0;
                    techHourDistribution[type] += hours;
                    totalTechHoursForAllTypes += hours;
                    if (type === 'demo') {
                        totalDemoHours += (stat.jobTypeTechHours && stat.jobTypeTechHours.demo) ? stat.jobTypeTechHours.demo : 0;
                    }
                }

                if (stat.jobIdToTypeMap) {
                    for (const [jobId, jobType] of Object.entries(stat.jobIdToTypeMap)) {
                        if (visitTypeCounts.hasOwnProperty(jobType)) {
                            visitTypeCounts[jobType]++;
                            uniqueJobsPerType[jobType].add(jobId);
                        }
                    }
                }
            });

            // --- Final Calculations ---
            const numberOfDays = filteredDailyStats.length;
            const totalCombinedJobs = totalPrescheduledJobs + totalSameDayInstalls;
            const avgTotalJobsPerDay = numberOfDays > 0 ? (totalCombinedJobs / numberOfDays).toFixed(1) : 0;
            const avgPrescheduledPerDay = numberOfDays > 0 ? (totalPrescheduledJobs / numberOfDays).toFixed(1) : 0;
            const avgSameDayPerDay = numberOfDays > 0 ? (totalSameDayInstalls / numberOfDays).toFixed(1) : 0;
            
            const avgHoursPerJob = totalCombinedJobs > 0 ? (totalTechHours / totalCombinedJobs).toFixed(2) : 0;
            const avgSubCostPerHour = totalSubHoursUsed > 0 ? (totalSubSpending / totalSubHoursUsed).toFixed(2) : 0;
            const avgDtJobsPerDay = numberOfDays > 0 ? (totalDtJobs / numberOfDays).toFixed(1) : 0;
            const avgDtHoursPerDay = numberOfDays > 0 ? (totalDtHours / numberOfDays).toFixed(1) : 0;
            const avgSubHoursPerDay = numberOfDays > 0 ? (totalSubHoursUsed / numberOfDays).toFixed(1) : 0;
            const potentialSubHours = totalSubTeams * 16;
            const subEfficiency = potentialSubHours > 0 ? ((totalSubHoursUsed / potentialSubHours) * 100).toFixed(1) : 0;
            const demosHandledBySubsPercentage = totalDemoHours > 0 ? ((totalSubHoursUsed / totalDemoHours) * 100).toFixed(1) : 0;
            const finalTechHourDistribution = {};
            for(const type in techHourDistribution) {
                finalTechHourDistribution[type] = totalTechHoursForAllTypes > 0 ? ((techHourDistribution[type] / totalTechHoursForAllTypes) * 100).toFixed(1) : 0;
            }
            const finalAvgVisits = {};
            for (const type in visitTypeCounts) {
                finalAvgVisits[type] = uniqueJobsPerType[type].size > 0 ? (visitTypeCounts[type] / uniqueJobsPerType[type].size).toFixed(2) : 0;
            }
            const finalAvgHoursPerService = Object.fromEntries(
                Object.entries(jobTypeAggregates).map(([type, data]) => [type, data.c > 0 ? (data.t / data.c).toFixed(2) : 0])
            );

            this.displayDashboard({
                avgTotalJobsPerDay, avgPrescheduledPerDay, avgSameDayPerDay,
                avgHoursPerJob, totalSubSpending, avgSubCostPerHour, subEfficiency, demosHandledBySubsPercentage, specialServiceSpending,
                avgDtJobsPerDay, avgDtHoursPerDay, avgSubHoursPerDay, jobsByDay, finalTechHourDistribution, finalAvgVisits, finalAvgHoursPerService
            });

        } catch (error) {
            console.error("Error loading dashboard:", error);
            container.innerHTML = `<div class="status-message status-error">Failed to load dashboard data.</div>`;
        } finally {
            loadingDiv.style.display = 'none';
        }
    }

    displayDashboard(data) {
        const container = document.getElementById('dashboardContainer');

        const jobsAvgBreakdownHtml = `
            <div class="metric-content" style="padding: 0 10px;">
                <ul class="breakdown-list">
                    <li class="breakdown-item"><span class="breakdown-label">Prescheduled</span><span class="breakdown-value">${data.avgPrescheduledPerDay}</span></li>
                    <li class="breakdown-item"><span class="breakdown-label">Same Day</span><span class="breakdown-value">${data.avgSameDayPerDay}</span></li>
                </ul>
                <div style="margin-top: 16px; text-align: center;">
                    <div class="big-number" style="margin-bottom: 0;">${data.avgTotalJobsPerDay}</div>
                    <div class="metric-description">Total Avg. Jobs / Day</div>
                </div>
            </div>`;

        const maxJobsInDay = Math.max(...Object.values(data.jobsByDay));
        const jobsByDayHtml = Object.entries(data.jobsByDay).map(([day, count]) => {
            const percentage = maxJobsInDay > 0 ? (count / maxJobsInDay) * 100 : 0;
            if (count > 0) {
                return `
                    <div class="bar-chart-row">
                        <span class="bar-chart-label">${day}</span>
                        <div class="bar-chart-bar-container">
                            <div class="bar-chart-bar" style="width: ${percentage}%;"></div>
                        </div>
                        <span class="bar-chart-value">${count}</span>
                    </div>
                `;
            }
            return '';
        }).join('');

        container.innerHTML = `
            <h3 class="dashboard-category-header">Overall Efficiency</h3>
            <div class="metric-card">
                <div class="metric-header"><h3><i class="fas fa-briefcase"></i> Avg. Jobs Per Day</h3></div>
                ${jobsAvgBreakdownHtml}
            </div>
            <div class="metric-card">
                <div class="metric-header"><h3><i class="fas fa-user-clock"></i> Avg. Hours Per Job</h3></div>
                <div class="metric-content">
                    <div class="big-number">${data.avgHoursPerJob}</div>
                    <div class="metric-description">Average tech hours per job (overall)</div>
                </div>
            </div>
             <div class="metric-card">
                <div class="metric-header"><h3><i class="fas fa-hard-hat"></i> Avg. Sub Hours Per Day</h3></div>
                <div class="metric-content">
                    <div class="big-number">${data.avgSubHoursPerDay}</div>
                    <div class="metric-description">Average hours handled by subs daily</div>
                </div>
            </div>
            <div class="metric-card">
                <div class="metric-header"><h3><i class="fas fa-users"></i> Daily DT Averages</h3></div>
                <div class="metric-content two-col-metric">
                    <div>
                        <div class="big-number">${data.avgDtJobsPerDay}</div>
                        <div class="metric-description">Avg. DT Jobs / Day</div>
                    </div>
                     <div>
                        <div class="big-number">${data.avgDtHoursPerDay}</div>
                        <div class="metric-description">Avg. DT Hours / Day</div>
                    </div>
                </div>
            </div>

            <h3 class="dashboard-category-header">Job & Trend Analysis</h3>
             <div class="metric-card">
                <div class="metric-header"><h3><i class="fas fa-tools"></i> Avg. Hours per Service</h3></div>
                <div class="metric-content">
                     <ul class="breakdown-list">
                        ${Object.entries(data.finalAvgHoursPerService).map(([type, hours]) => `
                        <li class="breakdown-item">
                            <span class="breakdown-label">${type.charAt(0).toUpperCase() + type.slice(1)}</span>
                            <span class="breakdown-value">${hours} hrs</span>
                        </li>`).join('')}
                    </ul>
                </div>
            </div>
            <div class="metric-card">
                <div class="metric-header"><h3><i class="fas fa-redo-alt"></i> Avg. Visits per Job</h3></div>
                <div class="metric-content">
                     <ul class="breakdown-list">
                        ${Object.entries(data.finalAvgVisits).map(([type, visits]) => `
                        <li class="breakdown-item">
                            <span class="breakdown-label">${type.charAt(0).toUpperCase() + type.slice(1)}</span>
                            <span class="breakdown-value">${visits} visits</span>
                        </li>`).join('')}
                    </ul>
                </div>
            </div>
             <div class="metric-card">
                <div class="metric-header"><h3><i class="fas fa-chart-pie"></i> Tech Hour Distribution</h3></div>
                <div class="metric-content">
                    <ul class="breakdown-list">
                        ${Object.entries(data.finalTechHourDistribution).map(([type, percentage]) => `
                        <li class="breakdown-item">
                            <span class="breakdown-label">${type.charAt(0).toUpperCase() + type.slice(1)}</span>
                            <span class="breakdown-value">${percentage}%</span>
                        </li>`).join('')}
                    </ul>
                </div>
            </div>
             <div class="metric-card">
                <div class="metric-header"><h3><i class="fas fa-calendar-day"></i> Jobs per Day of the Week</h3></div>
                <div class="metric-content">
                    <div class="bar-chart-container">
                        ${jobsByDayHtml}
                    </div>
                </div>
            </div>

            <h3 class="dashboard-category-header">Sub-Contractor Performance</h3>
            <div class="metric-card">
                <div class="metric-header"><h3><i class="fas fa-dollar-sign"></i> Total Spent on Subs</h3></div>
                <div class="metric-content">
                    <div class="big-number">$${data.totalSubSpending.toFixed(2)}</div>
                    <div class="metric-description">For the selected date range</div>
                </div>
            </div>
            <div class="metric-card">
                <div class="metric-header"><h3><i class="fas fa-cash-register"></i> Avg. Sub Cost per Hour</h3></div>
                 <div class="metric-content">
                    <div class="big-number">$${data.avgSubCostPerHour}</div>
                    <div class="metric-description">Avg. cost per hour worked by subs</div>
                </div>
            </div>
             <div class="metric-card">
                <div class="metric-header"><h3><i class="fas fa-hard-hat"></i> Sub-Contractor Efficiency</h3></div>
                <div class="metric-content">
                    <div class="big-number">${data.subEfficiency}%</div>
                    <div class="metric-description">Of available sub hours used</div>
                    <div class="progress-bar-container">
                        <div class="progress-bar" style="width: ${data.subEfficiency}%;"></div>
                    </div>
                </div>
            </div>
            <div class="metric-card">
                <div class="metric-header"><h3><i class="fas fa-percentage"></i> Demos by Subs</h3></div>
                <div class="metric-content">
                    <div class="big-number">${data.demosHandledBySubsPercentage}%</div>
                    <div class="metric-description">Of all demo hours handled by subs</div>
                    <div class="progress-bar-container">
                        <div class="progress-bar" style="width: ${data.demosHandledBySubsPercentage}%; background-color: #17a2b8;"></div>
                    </div>
                </div>
            </div>
             <div class="metric-card">
                <div class="metric-header"><h3><i class="fas fa-star"></i> Special Service Spending</h3></div>
                <div class="metric-content">
                     <ul class="breakdown-list">
                        ${Object.entries(data.specialServiceSpending).map(([service, amount]) => `
                        <li class="breakdown-item">
                            <span class="breakdown-label">${service}</span>
                            <span class="breakdown-value">$${amount.toFixed(2)}</span>
                        </li>`).join('')}
                    </ul>
                </div>
            </div>
        `;
    }

    async runSubContractorReport() {
        const crew = document.getElementById('reportSubContractor').value;
        const startDate = document.getElementById('reportStartDate').value;
        const endDate = document.getElementById('reportEndDate').value;
        const loadingDiv = document.getElementById('reportLoading');
        const resultsContainer = document.getElementById('reportResultsContainer');

        if (!startDate || !endDate) {
            alert('Please select a start and end date for the report.');
            return;
        }

        loadingDiv.style.display = 'block';
        resultsContainer.innerHTML = '';

        try {
            const reportJobs = await this.app.firebaseService.getSubContractorReportData(startDate, endDate, crew);
            this.displaySubContractorReport(reportJobs);

        } catch (error) {
            console.error("Error running report: ", error);
            resultsContainer.innerHTML = `<div class="status-message status-error">An error occurred while generating the report.</div>`;
        } finally {
            loadingDiv.style.display = 'none';
        }
    }

    displaySubContractorReport(jobs) {
        const resultsContainer = document.getElementById('reportResultsContainer');
        if (jobs.length === 0) {
            resultsContainer.innerHTML = `<div class="status-message status-success">No jobs found for the selected sub-contractor in this date range.</div>`;
            return;
        }

        const tableRows = jobs.map(job => {
            const simpleJobNumber = this.extractJobNumber(job.jobId) || 'N/A';
            const lastName = (job.jobName || '').split(' ')[0] || 'Unknown';

            return `
            <tr>
                <td>${job.date}</td>
                <td>
                    ${lastName}
                    <span class="job-id">${simpleJobNumber}</span>
                </td>
                <td>${job.address || 'Not Available'}</td>
                <td>$${(job.price || 0).toFixed(2)}</td>
            </tr>
        `}).join('');

        resultsContainer.innerHTML = `
            <table class="report-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Last Name / Job #</th>
                        <th>Address</th>
                        <th>Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        `;
    }

    async loadHistoricalStats() {
        const date = document.getElementById('historicalDate').value;
        if (!date) { alert('Please select a date.'); return; }

        const loadingDiv = document.getElementById('historicalLoading');
        const resultsDiv = document.getElementById('historicalResults');
        loadingDiv.style.display = 'block';
        resultsDiv.innerHTML = '';

        try {
            const docSnap = await this.app.firebaseService.getDailyStats(date);
            if (docSnap) {
                this.displayHistoricalResults(docSnap);
            } else {
                resultsDiv.innerHTML = `<div class="status-message status-error">No data found for ${date}.</div>`;
            }
        } catch (error) {
            console.error("Error loading historical stats:", error);
            resultsDiv.innerHTML = `<div class="status-message status-error">Error loading data.</div>`;
        } finally {
            loadingDiv.style.display = 'none';
        }
    }

    async loadAllHistoricalStats() {
        const loadingDiv = document.getElementById('historicalLoading');
        const resultsDiv = document.getElementById('historicalResults');
        loadingDiv.style.display = 'block';
        resultsDiv.innerHTML = '';

        try {
            const snapshot = await this.app.firebaseService.getAllDailyStats();
            if (snapshot.length === 0) {
                resultsDiv.innerHTML = `<div class="status-message status-error">No historical data found.</div>`;
            } else {
                let allDatesHTML = `<h4 class="full-width-grid">All Available Dates:</h4>`;
                snapshot.forEach(data => {
                    const totalHours = (data.totalTechHours || 0);
                    allDatesHTML += `
                        <div class="metric-card" style="cursor: pointer;" onclick="laborTool.analyzerManager.loadSpecificDate('${data.date}')">
                            <div class="metric-header"><h3><i class="fas fa-calendar"></i> ${data.date}</h3></div>
                            <div class="metric-content">
                                <ul class="breakdown-list">
                                    <li class="breakdown-item"><span class="breakdown-label">Jobs</span><span class="breakdown-value">${data.totalJobs || 0}</span></li>
                                    <li class="breakdown-item"><span class="breakdown-label">Tech Hours</span><span class="breakdown-value">${totalHours}</span></li>
                                    <li class="breakdown-item"><span class="breakdown-label">Subs</span><span class="breakdown-value">${data.subTeamCount || 0}</span></li>
                                </ul>
                            </div>
                        </div>`;
                });
                resultsDiv.innerHTML = allDatesHTML;
            }
        } catch(e) {
            console.error("Error loading all stats: ", e);
            resultsDiv.innerHTML = `<div class="status-message status-error">Error loading data.</div>`;
        } finally {
            loadingDiv.style.display = 'none';
        }
    }

    loadSpecificDate(date) {
        document.getElementById('historicalDate').value = date;
        this.loadHistoricalStats();
    }

    displayHistoricalResults(data) {
        const container = document.getElementById('historicalResults');

        const headerHtml = `<h4 class="full-width-grid">Stats for ${data.date} <button class="remove-sub-btn" onclick="laborTool.analyzerManager.showDeleteModal('${data.date}')"><i class="fas fa-trash"></i></button></h4>`;
        const metricsHtml = this._getMetricsHtml(data);

        let subJobsHtml = '';
        if (data.subContractorJobs && data.subContractorJobs.length > 0) {
            subJobsHtml = `
            <div class="sub-contractor-section full-width-grid">
                <h3><i class="fas fa-hard-hat"></i> Sub-Contractor Jobs on this Day</h3>
                <table class="sub-jobs-table">
                    <thead><tr><th>Crew</th><th>Job</th><th>Price</th><th>Demo Hours</th><th>Service</th></tr></thead>
                    <tbody>
                        ${data.subContractorJobs.map(j => `<tr><td>${j.crew}</td><td>${j.jobName || 'N/A'}</td><td>$${(j.price || 0).toFixed(2)}</td><td>${j.demoHours || 0} hrs</td><td>${j.specialService || 'N/A'}</td></tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
        } else {
             subJobsHtml = `
            <div class="sub-contractor-section full-width-grid">
                <h3><i class="fas fa-hard-hat"></i> Sub-Contractor Jobs on this Day</h3>
                <p>No sub-contractor jobs were logged for this date.</p>
            </div>`;
        }

        container.innerHTML = headerHtml + metricsHtml + subJobsHtml;
    }


    checkForDuplicates() {
        const resultsDiv = document.getElementById('duplicateResults');

        if (!this.currentData) {
            resultsDiv.innerHTML = '<div class="duplicate-results status-error">No data loaded. Please upload a CSV file first.</div>';
            return;
        }

        const duplicates = [];
        const seenJobNumbers = new Map();

        this.currentData.forEach((row, index) => {
            const jobNumber = this.extractJobNumber(row.route_title || '');

            if (jobNumber) {
                if (seenJobNumbers.has(jobNumber)) {
                    const originalJob = seenJobNumbers.get(jobNumber);
                    duplicates.push({
                        jobNumber: jobNumber,
                        job1: {
                            row: originalJob.index,
                            customer: this.extractCustomerName(originalJob.row.route_title || '')
                        },
                        job2: {
                            row: index + 1,
                            customer: this.extractCustomerName(row.route_title || '')
                        }
                    });
                } else {
                    seenJobNumbers.set(jobNumber, { index: index + 1, row });
                }
            }
        });

        if (duplicates.length === 0) {
            resultsDiv.innerHTML = '<div class="duplicate-results no-duplicates"><i class="fas fa-check-circle"></i> No duplicate job numbers found</div>';
        } else {
            const duplicateList = duplicates.map(dup =>
                `<div class="duplicate-item">Job ${dup.jobNumber}: ${dup.job1.customer} (Row ${dup.job1.row}) & ${dup.job2.customer} (Row ${dup.job2.row})</div>`
            ).join('');

            resultsDiv.innerHTML = `
                <div class="duplicate-results has-duplicates">
                    <i class="fas fa-exclamation-triangle"></i> Found ${duplicates.length} duplicate job number${duplicates.length > 1 ? 's' : ''}:
                    <div class="duplicate-list">${duplicateList}</div>
                </div>
            `;
        }
    }

    showDeleteModal(date) {
        this.dateToDelete = date;
        document.getElementById('deleteDate').textContent = date;
        document.getElementById('deleteModal').style.display = 'flex';
    }

    closeDeleteModal() {
        document.getElementById('deleteModal').style.display = 'none';
        this.dateToDelete = null;
    }

    showOtherTFModal() {
        if (!this.analysisResults || !this.analysisResults.otherTFDetails || this.analysisResults.otherTFDetails.length === 0) {
            return;
        }

        let modalContent = '<div>'; // Simple container
        this.analysisResults.otherTFDetails.forEach(detail => {
            modalContent += `
                <div class="tf-item">
                    <div class="tf-customer">${detail.customer}</div>
                    <div class="tf-time">Time Frame: ${detail.timeFrame}</div>
                    <div class="tf-details">Job #${detail.jobNumber}</div>
                </div>
            `;
        });
        modalContent += '</div>';

        this.app.modalManager.showModal(
            'Non-Standard Time Frames',
            modalContent,
            [{ text: 'Close', class: 'btn-secondary', onclick: 'laborTool.modalManager.closeModal()' }]
        );
    }

    async confirmDelete() {
        if (!this.dateToDelete) return;
        try {
            await this.app.firebaseService.deleteDailyStats(this.dateToDelete);
            this.closeDeleteModal();
            this.loadAllHistoricalStats();
            this.allTimeStatsCache = null;
        } catch (error) {
            console.error("Error deleting document: ", error);
            alert("Failed to delete stats.");
        }
    }
    
    // --- FIX STARTS HERE: ADD THE MISSING FUNCTION ---
    async updateStatsWithNewInstall(date, duration, jobId, installType) {
        let dailyStats = await this.app.firebaseService.getDailyStats(date);

        if (!dailyStats) {
            const dateObj = new Date(date + 'T12:00:00Z');
            dailyStats = {
                date: date,
                dayOfWeek: dateObj.toLocaleDateString('en-US', { weekday: 'long' }),
                totalJobs: 0,
                sameDayInstallCount: 0,
                totalTechHours: 0,
                totalLaborHours: 0,
                dtTrueCount: 0,
                dtLaborHours: 0,
                jobTypeCounts: { install: 0, demo: 0, cs: 0, pull: 0, other: 0 },
                jobTypeTechHours: { install: 0, demo: 0, cs: 0, pull: 0, other: 0 },
                jobIdToTypeMap: {},
                jobNumbers: [],
                zoneCounts: {},
                timeFrameCounts: { '9-12': 0, '9-4': 0, '12-4': 0, 'other': 0 },
                subTeamCount: 0,
                subContractorJobs: [],
                savedAt: new Date().toISOString()
            };
        }

        if (installType === 'same-day') {
            dailyStats.sameDayInstallCount = (dailyStats.sameDayInstallCount || 0) + 1;
        }

        dailyStats.totalTechHours = (dailyStats.totalTechHours || 0) + duration;
        dailyStats.totalLaborHours = (dailyStats.totalLaborHours || 0) + duration;
        
        if (!dailyStats.jobTypeTechHours) dailyStats.jobTypeTechHours = { install: 0 };
        dailyStats.jobTypeTechHours.install = (dailyStats.jobTypeTechHours.install || 0) + duration;
        
        if (!dailyStats.jobTypeCounts) dailyStats.jobTypeCounts = { install: 0 };
        dailyStats.jobTypeCounts.install = (dailyStats.jobTypeCounts.install || 0) + 1;


        if (!dailyStats.jobIdToTypeMap) dailyStats.jobIdToTypeMap = {};
        dailyStats.jobIdToTypeMap[jobId] = 'install';

        if (!dailyStats.jobNumbers) dailyStats.jobNumbers = [];
        if (!dailyStats.jobNumbers.includes(jobId)) {
            dailyStats.jobNumbers.push(jobId);
        }
        
        const currentTotalJobs = (dailyStats.totalJobs || 0) + (dailyStats.sameDayInstallCount || 0);
        dailyStats.averageTechHoursPerJob = currentTotalJobs > 0 ? (dailyStats.totalTechHours / currentTotalJobs).toFixed(2) : '0.00';


        await this.app.firebaseService.saveDailyStats(date, dailyStats);
        this.allTimeStatsCache = null; // Invalidate cache
    }
    // --- FIX ENDS HERE ---
}