class InstallDptManager {
    constructor(app) {
        this.app = app;
        this.db = app.firebaseService.db;
    }

    async initialize() {
        if (document.getElementById('install-dpt-tab')) {
            this.setupEventListeners();
            await this.findAndDisplayJobsMissingInstall(); // Auto-load the list
        }
    }

    setupEventListeners() {
        const view = document.getElementById('install-dpt-view');
        if (!view) return;

        view.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (!button) return;

            if (button.id === 'second-shift-report-btn') {
                this.openSecondShiftReportModal();
            }

            if (button.id === 'install-window-report-btn') {
                this.openInstallWindowReportModal();
            }

            const saveBtn = e.target.closest('.save-install-btn');
            if (saveBtn) {
                const jobId = saveBtn.closest('tr').dataset.jobId;
                this.saveInstallDptData(jobId);
            }

            const noInstallBtn = e.target.closest('.no-install-btn');
            if (noInstallBtn) {
                const jobId = noInstallBtn.closest('tr').dataset.jobId;
                this.markAsNoInstall(jobId);
            }
        });
    }

    extractJobNumber(text) {
        const match = (text || '').match(/(\d{2}-\d{5,})/);
        return match ? match[0] : null;
    }

    openInstallWindowReportModal() {
        const today = new Date();
        const dayOfWeek = today.getDay(); // Sunday = 0, Monday = 1, etc.
        const lastSunday = new Date(today);
        lastSunday.setDate(today.getDate() - dayOfWeek);
        const lastMonday = new Date(lastSunday);
        lastMonday.setDate(lastSunday.getDate() - 6);

        const formatDate = (date) => date.toISOString().split('T')[0];

        const modalBody = `
            <p>Select a date range to view the total leftover install windows.</p>
            <div class="form-grid">
                <div class="form-group">
                    <label for="report-start-date">Start Date</label>
                    <input type="date" id="report-start-date" class="form-input" value="${formatDate(lastMonday)}">
                </div>
                <div class="form-group">
                    <label for="report-end-date">End Date</label>
                    <input type="date" id="report-end-date" class="form-input" value="${formatDate(lastSunday)}">
                </div>
            </div>
            <div id="install-window-report-results" style="margin-top: 1rem;"></div>
        `;

        this.app.modalManager.showModal('Install Window Report', modalBody, [
            { text: 'Close', class: 'btn-secondary', onclick: 'laborTool.modalManager.closeModal()' },
            { text: 'Generate Report', class: 'btn-primary', onclick: 'laborTool.installDptManager.generateInstallWindowReport()' }
        ]);
    }

    async generateInstallWindowReport() {
        const startDate = document.getElementById('report-start-date').value;
        const endDate = document.getElementById('report-end-date').value;
        const resultsContainer = document.getElementById('install-window-report-results');

        if (!startDate || !endDate) {
            resultsContainer.innerHTML = '<p class="text-danger">Please select a valid date range.</p>';
            return;
        }

        resultsContainer.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Generating report...</div>';

        try {
            const reports = await this.app.firebaseService.getSecondShiftReportsByDateRange(startDate, endDate);
            
            if (reports.length === 0) {
                resultsContainer.innerHTML = '<p>No second shift reports found for the selected date range.</p>';
                return;
            }

            const totals = {
                '2-5': 0,
                '5-8': 0,
                '6-9': 0,
            };

            reports.forEach(report => {
                if (report.installWindowsLeft && report.installWindows) {
                    totals['2-5'] += parseInt(report.installWindows['2-5'] || 0, 10);
                    totals['5-8'] += parseInt(report.installWindows['5-8'] || 0, 10);
                    totals['6-9'] += parseInt(report.installWindows['6-9'] || 0, 10);
                }
            });

            resultsContainer.innerHTML = `
                <h4>Total Leftover Windows (${startDate} to ${endDate})</h4>
                <ul class="breakdown-list">
                    <li class="breakdown-item">
                        <span class="breakdown-label">2-5 PM</span>
                        <span class="breakdown-value">${totals['2-5']}</span>
                    </li>
                    <li class="breakdown-item">
                        <span class="breakdown-label">5-8 PM</span>
                        <span class="breakdown-value">${totals['5-8']}</span>
                    </li>
                    <li class="breakdown-item">
                        <span class="breakdown-label">6-9 PM</span>
                        <span class="breakdown-value">${totals['6-9']}</span>
                    </li>
                </ul>
            `;

        } catch (error) {
            console.error("Error generating install window report:", error);
            resultsContainer.innerHTML = '<p class="text-danger">An error occurred while generating the report.</p>';
        }
    }

    openSecondShiftReportModal() {
        const today = new Date().toISOString().split('T')[0];
        const modalBody = `
            <style>
                .job-entry { display: grid; grid-template-columns: 1fr 2fr auto; gap: 8px; align-items: center; margin-bottom: 8px; }
                .job-entry-3col { grid-template-columns: 1fr 1fr 1fr auto; }
                .question-section { margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--border-color); }
                
                /* Enhanced Radio Buttons */
                .radio-group { display: flex; align-items: center; gap: 20px; }
                .radio-group label { 
                    display: inline-flex;
                    align-items: center;
                    cursor: pointer;
                    font-size: 1.1em;
                }
                .radio-group input[type="radio"] {
                    display: none; 
                }
                .radio-group label::before {
                    content: '';
                    display: inline-block;
                    width: 22px;
                    height: 22px;
                    margin-right: 8px;
                    border: 2px solid var(--border-color);
                    border-radius: 50%;
                    background-color: white;
                    transition: all 0.2s;
                }
                .radio-group input[type="radio"]:checked + label::before {
                    border-color: var(--primary-color);
                    background-color: var(--primary-color);
                    box-shadow: inset 0 0 0 4px white;
                }

                .hidden-section { display: none; margin-top: 10px; background-color: #f8fafc; padding: 15px; border-radius: var(--radius-md); border: 1px solid var(--border-color); }
                .install-windows-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 15px; }
                
                /* Enhanced Number Inputs */
                .custom-number-input { display: flex; align-items: center; }
                .custom-number-input input[type=number] {
                    -webkit-appearance: textfield; -moz-appearance: textfield; appearance: textfield;
                    text-align: center; border-left: none; border-right: none; border-radius: 0;
                    width: 60px; height: 48px; font-size: 1.2em;
                }
                .custom-number-input input[type=number]::-webkit-inner-spin-button,
                .custom-number-input input[type=number]::-webkit-outer-spin-button {
                    -webkit-appearance: none; margin: 0;
                }
                .custom-number-input button {
                    width: 48px; height: 48px; font-size: 1.5rem; font-weight: bold;
                    color: var(--primary-color); background-color: #f1f5f9;
                    border: 2px solid var(--border-color); cursor: pointer; line-height: 44px;
                }
                .custom-number-input .decrement-btn { border-radius: var(--radius-md) 0 0 var(--radius-md); border-right: none; }
                .custom-number-input .increment-btn { border-radius: 0 var(--radius-md) var(--radius-md) 0; border-left: none; }
                #pushedJobsCount { height: 48px; font-size: 1.2em; text-align: center; }

                /* Enhanced Demo Entry Layout */
                .demo-job-entry { 
                    display: grid; 
                    grid-template-columns: 2fr 1.5fr; 
                    gap: 12px; 
                    align-items: end; 
                    margin-bottom: 12px; 
                    padding-bottom: 12px;
                    border-bottom: 1px solid var(--border-color);
                }
                .demo-job-entry:last-child { border-bottom: none; }
                .demo-job-entry .form-group { display: flex; flex-direction: column; }
                .demo-job-entry .actions { grid-column: 1 / -1; text-align: right; }
                 @media (min-width: 600px) {
                    .demo-job-entry {
                        grid-template-columns: 2fr 1.5fr 1fr 1fr auto;
                        gap: 8px; align-items: end;
                    }
                    .demo-job-entry .actions { grid-column: auto; }
                 }
            </style>
            <div class="form-group">
                <label for="reportDate">Report Date</label>
                <input type="date" id="reportDate" class="form-input" value="${today}">
            </div>

            <div class="question-section">
                <div class="form-group">
                    <label>Any Install windows left?</label>
                    <div class="radio-group">
                        <input type="radio" name="installWindowsLeft" value="yes" id="iwl_yes" onchange="document.getElementById('installWindowsContainer').style.display='block'"> 
                        <label for="iwl_yes">Yes</label>
                        <input type="radio" name="installWindowsLeft" value="no" id="iwl_no" onchange="document.getElementById('installWindowsContainer').style.display='none'" checked> 
                        <label for="iwl_no">No</label>
                    </div>
                </div>
                <div id="installWindowsContainer" class="hidden-section">
                    <p>Enter the number of windows available for each time slot:</p>
                    <div class="install-windows-grid">
                        <div class="form-group">
                            <label for="windows2to5">2-5 PM</label>
                             <div class="custom-number-input"><button type="button" class="decrement-btn">-</button><input type="number" id="windows2to5" class="form-input" min="0" value="0"><button type="button" class="increment-btn">+</button></div>
                        </div>
                        <div class="form-group">
                            <label for="windows5to8">5-8 PM</label>
                             <div class="custom-number-input"><button type="button" class="decrement-btn">-</button><input type="number" id="windows5to8" class="form-input" min="0" value="0"><button type="button" class="increment-btn">+</button></div>
                        </div>
                        <div class="form-group">
                            <label for="windows6to9">6-9 PM</label>
                             <div class="custom-number-input"><button type="button" class="decrement-btn">-</button><input type="number" id="windows6to9" class="form-input" min="0" value="0"><button type="button" class="increment-btn">+</button></div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="question-section">
                <div class="form-group">
                    <label>Was demo requested on any installs?</label>
                    <div class="radio-group">
                         <input type="radio" name="demoRequested" value="yes" id="dr_yes" onchange="document.getElementById('demoRequestContainer').style.display='block'">
                         <label for="dr_yes">Yes</label>
                         <input type="radio" name="demoRequested" value="no" id="dr_no" onchange="document.getElementById('demoRequestContainer').style.display='none'" checked>
                         <label for="dr_no">No</label>
                    </div>
                </div>
                <div id="demoRequestContainer" class="hidden-section">
                    <div id="demoJobsContainer"></div>
                    <button class="btn btn-secondary btn-small" onclick="laborTool.installDptManager.addDemoJobEntry()">+ Add Demo Job</button>
                </div>
            </div>

            <div class="question-section">
                <div class="form-group">
                    <label>Any jobs landed pushed due to lack of install windows?</label>
                    <div class="radio-group">
                        <input type="radio" name="jobsPushed" value="yes" id="jp_yes" onchange="document.getElementById('jobsPushedContainer').style.display='block'"> 
                        <label for="jp_yes">Yes</label>
                        <input type="radio" name="jobsPushed" value="no" id="jp_no" onchange="document.getElementById('jobsPushedContainer').style.display='none'" checked> 
                        <label for="jp_no">No</label>
                    </div>
                </div>
                <div id="jobsPushedContainer" class="hidden-section">
                    <div class="form-group">
                        <label for="pushedJobsCount">How many?</label>
                         <div class="custom-number-input" style="justify-content: center;"><button type="button" class="decrement-btn">-</button><input type="number" id="pushedJobsCount" class="form-input" min="0" value="0"><button type="button" class="increment-btn">+</button></div>
                    </div>
                </div>
            </div>
            
            <div class="question-section">
                <div class="form-group">
                    <label>Jobs to know about (nuances, wins, concerns)</label>
                    <div id="nuancesJobsContainer"></div>
                    <button class="btn btn-secondary btn-small" onclick="laborTool.installDptManager.addNuanceJobEntry()">+ Add Job</button>
                </div>
            </div>
            <div class="form-group">
                <label>Jobs that cancelled/rescheduled/went on hold</label>
                <div id="cancelledJobsContainer"></div>
                <button class="btn btn-secondary btn-small" onclick="laborTool.installDptManager.addCancelledJobEntry()">+ Add Job</button>
            </div>
            <div class="form-group">
                <label>After hours jobs</label>
                <div id="afterHoursJobsContainer"></div>
                <button class="btn btn-secondary btn-small" onclick="laborTool.installDptManager.addAfterHoursJobEntry()">+ Add Job</button>
            </div>
            <div class="form-grid" style="grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-top: 1.5rem;">
                <div class="form-group"><label for="techShoutouts">Technician Shoutouts</label><textarea id="techShoutouts" class="form-input" rows="3"></textarea></div>
                <div class="form-group"><label for="techConcerns">Technician Concerns</label><textarea id="techConcerns" class="form-input" rows="3"></textarea></div>
                <div class="form-group"><label for="deptShoutouts">Other Department Shoutouts</label><textarea id="deptShoutouts" class="form-input" rows="3"></textarea></div>
                <div class="form-group"><label for="deptConcerns">Other Department Concerns</label><textarea id="deptConcerns" class="form-input" rows="3"></textarea></div>
            </div>
        `;

        this.app.modalManager.showModal('Second Shift Report', modalBody, [
            { text: 'Cancel', class: 'btn-secondary', onclick: 'laborTool.modalManager.closeModal()' },
            { text: 'Submit Report', class: 'btn-primary', onclick: 'laborTool.installDptManager.saveSecondShiftReport()' }
        ]);

        this.addNuanceJobEntry();
        this.addCancelledJobEntry();
        this.addAfterHoursJobEntry();
        this.setupCustomNumberInputs();
    }

    setupCustomNumberInputs() {
        document.querySelectorAll('.custom-number-input').forEach(wrapper => {
            const input = wrapper.querySelector('input[type="number"]');
            const decrementBtn = wrapper.querySelector('.decrement-btn');
            const incrementBtn = wrapper.querySelector('.increment-btn');

            decrementBtn.addEventListener('click', () => {
                let currentValue = parseInt(input.value, 10);
                const min = input.min ? parseInt(input.min, 10) : 0;
                if (currentValue > min) {
                    input.value = currentValue - 1;
                }
            });

            incrementBtn.addEventListener('click', () => {
                let currentValue = parseInt(input.value, 10);
                input.value = currentValue + 1;
            });
        });
    }

    addDemoJobEntry() {
        const container = document.getElementById('demoJobsContainer');
        const entryId = `demo-job-${Date.now()}`;
        const entryDiv = document.createElement('div');
        entryDiv.id = entryId;
        entryDiv.className = 'demo-job-entry';
        entryDiv.innerHTML = `
            <div class="form-group">
                <label>Job # / Name</label>
                <input type="text" class="form-input demo-job-name" placeholder="Job # / Name">
            </div>
            <div class="form-group">
                <label>Demo Type</label>
                <select class="form-input demo-job-type">
                    <option value="investigative">Investigative</option>
                    <option value="emergency">Emergency</option>
                    <option value="demo to dry">Demo to dry</option>
                </select>
            </div>
            <div class="form-group">
                <label>Duration (hrs)</label>
                <input type="number" class="form-input demo-job-duration" placeholder="Hrs">
            </div>
            <div class="form-group">
                <label>Two Man?</label>
                <select class="form-input demo-job-two-man">
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                </select>
            </div>
            <div class="actions">
                <button class="btn btn-danger btn-small" onclick="document.getElementById('${entryId}').remove()">&times;</button>
            </div>
        `;
        container.appendChild(entryDiv);
    }
// ... rest of the file is unchanged
    addNuanceJobEntry() {
        const container = document.getElementById('nuancesJobsContainer');
        const entryId = `nuance-${Date.now()}`;
        const entryDiv = document.createElement('div');
        entryDiv.id = entryId;
        entryDiv.className = 'job-entry nuance-job-entry';
        entryDiv.innerHTML = `
            <input type="text" class="form-input job-name" placeholder="Job Name / Number">
            <input type="text" class="form-input job-notes" placeholder="Notes (nuance, win, concern, etc.)">
            <button class="btn btn-danger btn-small" onclick="document.getElementById('${entryId}').remove()">&times;</button>
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
            <button class="btn btn-danger btn-small" onclick="document.getElementById('${entryId}').remove()">&times;</button>
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
            <button class="btn btn-danger btn-small" onclick="document.getElementById('${entryId}').remove()">&times;</button>
        `;
        container.appendChild(entryDiv);
    }

    async saveSecondShiftReport() {
        const date = document.getElementById('reportDate').value;
        if (!date) {
            alert('Please select a date for the report.');
            return;
        }

        const collectJobEntries = (selector, isDemo = false) => {
            const entries = [];
            document.querySelectorAll(selector).forEach(entry => {
                const jobNameInput = entry.querySelector('.job-name, .demo-job-name');
                if (!jobNameInput) return;
                const jobName = jobNameInput.value.trim();

                if (jobName) {
                    const entryData = { jobName };
                    if (isDemo) {
                        entryData.type = entry.querySelector('.demo-job-type')?.value;
                        entryData.duration = entry.querySelector('.demo-job-duration')?.value;
                        entryData.twoMan = entry.querySelector('.demo-job-two-man')?.value;
                    } else {
                        const notesInput = entry.querySelector('.job-notes');
                        const reasonInput = entry.querySelector('.job-reason');
                        const whoInput = entry.querySelector('.job-who');
                        if(notesInput) entryData.notes = notesInput.value.trim();
                        if(reasonInput) entryData.reason = reasonInput.value.trim();
                        if(whoInput) entryData.who = whoInput.value.trim();
                    }
                    entries.push(entryData);
                }
            });
            return entries;
        };

        // Collect new data
        const installWindowsLeft = document.querySelector('input[name="installWindowsLeft"]:checked').value === 'yes';
        const installWindows = installWindowsLeft ? {
            '2-5': document.getElementById('windows2to5').value,
            '5-8': document.getElementById('windows5to8').value,
            '6-9': document.getElementById('windows6to9').value
        } : null;

        const demoRequested = document.querySelector('input[name="demoRequested"]:checked').value === 'yes';
        const demoJobs = demoRequested ? collectJobEntries('.demo-job-entry', true) : [];

        const jobsPushed = document.querySelector('input[name="jobsPushed"]:checked').value === 'yes';
        const pushedJobsCount = jobsPushed ? document.getElementById('pushedJobsCount').value : 0;
        
        // Collect original data
        const nuances = collectJobEntries('.nuance-job-entry');
        const cancelledJobs = collectJobEntries('.cancelled-job-entry');
        const afterHoursJobs = collectJobEntries('.after-hours-job-entry');

        const reportData = {
            date,
            installWindowsLeft,
            installWindows,
            demoRequested,
            demoJobs,
            jobsPushed,
            pushedJobsCount,
            nuances,
            cancelledJobs,
            afterHoursJobs,
            afterHours: afterHoursJobs.length > 0,
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
            await this.db.collection('analyzer_job_history').doc(jobId).set({ hasInstallRecord: true }, { merge: true });

            await this.app.analyzerManager.updateStatsWithNewInstall(installedDate, finalDuration, jobId, installType);

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
}