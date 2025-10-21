class CalendarManager {
    constructor(app) {
        this.app = app;
        this.db = app.firebaseService.db;
        this.currentDate = new Date();
        this.currentView = 'month';
        this.isAdmin = false;
        this.currentEditDate = null;
        this.isPrinting = false;
    }

    async initialize() {
        if (document.getElementById('calendarContainer')) {
            this.checkAdminStatus();
            this.setupEventListeners();
            await this.app.dataManager.buildUnifiedTechnicianData();
            this.renderCalendar();
        }
    }

    setupEventListeners() {
        document.getElementById('calPrevBtn')?.addEventListener('click', () => this.navigate(-1));
        document.getElementById('calNextBtn')?.addEventListener('click', () => this.navigate(1));
        document.getElementById('calDayViewBtn')?.addEventListener('click', () => this.switchView('day'));
        document.getElementById('calWeekViewBtn')?.addEventListener('click', () => this.switchView('week'));
        document.getElementById('calMonthViewBtn')?.addEventListener('click', () => this.switchView('month'));
        document.getElementById('calPrintBtn')?.addEventListener('click', () => this.handlePrint());
        document.getElementById('calLoginBtn')?.addEventListener('click', () => this.openAdminModal());
        document.getElementById('calLogoutBtn')?.addEventListener('click', () => this.logout());
        document.getElementById('calManageRecurringBtn')?.addEventListener('click', () => this.openRecurringScheduleModal());
        document.getElementById('weekend-report-btn')?.addEventListener('click', () => this.generateWeekendReport());
        
        document.getElementById('calSyncBtn')?.addEventListener('click', () => this.syncRipplingCalendar());

        document.body.addEventListener('click', (e) => {
            const calModal = e.target.closest('.cal-modal');
            if (e.target.closest('.close')) calModal?.style.setProperty('display', 'none');
            if (e.target.closest('#calSaveSchedule')) this.saveSchedule();
            if (e.target.id === 'calSubmitLogin') this.login();
        });
    }

    async syncRipplingCalendar() {
        const syncButton = document.getElementById('calSyncBtn');
        if (this.app.user.role !== 'Manager') {
            alert("You must be a Manager to perform this action.");
            return;
        }

        const iCalUrl = 'webcal://app.rippling.com/api/feed/calendar/pto/all-reports/mpddmgvrmobo67mp/fae7526ebae71b747bb3a68129033095c76027f0ba187a62915ca80d3ae8def0/calendar.ics?company=685d9aa96419b55f758d812c';
        const proxyUrl = 'https://cors-anywhere.herokuapp.com/';
        const fetchUrl = `${proxyUrl}${iCalUrl.replace("webcal://", "https://")}`;

        syncButton.disabled = true;
        syncButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';
        this.app.modalManager.showModal("Syncing Calendar", "<p>Fetching and processing time-off data from Rippling. Please wait...</p>", []);

        try {
            await this.app.dataManager.buildUnifiedTechnicianData();
            const allStaff = this.app.dataManager.unifiedTechnicianData;
            const nameMappings = await this.app.firebaseService.getNameMappings();

            if (allStaff.length === 0) throw new Error("Could not load staff list to match names.");

            const response = await fetch(fetchUrl);
            if (!response.ok) {
                 if(response.status === 403) {
                    throw new Error(`CORS Anywhere proxy requires activation. Please click this link in a new tab, request temporary access, then try syncing again: <a href="${proxyUrl}" target="_blank" rel="noopener noreferrer">${proxyUrl}</a>`);
                }
                throw new Error(`Failed to fetch calendar data. Status: ${response.status}`);
            }
            const iCalData = await response.text();
            const jcalData = ICAL.parse(iCalData);
            const vcalendar = new ICAL.Component(jcalData);
            const vevents = vcalendar.getAllSubcomponents('vevent');

            const batch = this.db.batch();
            let updatesStaged = 0;
            let logHtml = '<h4>Sync Log:</h4>';
            const unmappedNames = new Set();
            const eventsToProcess = [];

            vevents.forEach(event => {
                const summary = event.getFirstPropertyValue('summary');
                if (!summary) return;

                const employeeName = summary.split(' on ')[0].trim();
                
                const mappedId = nameMappings[employeeName];

                if (mappedId === 'ignore') {
                    logHtml += `<p>Skipping ignored employee "${employeeName}".</p>`;
                    return; // Explicitly skip this person
                }
                
                let staffMember = mappedId ? allStaff.find(s => s.id === mappedId) : null;

                if (!staffMember) {
                    staffMember = allStaff.find(s => s.name && s.name.toLowerCase() === employeeName.toLowerCase());
                }

                if (!staffMember) {
                    unmappedNames.add(employeeName);
                } else {
                    eventsToProcess.push({ event, staffMember });
                }
            });

            if (unmappedNames.size > 0) {
                this.openMappingModal(Array.from(unmappedNames), allStaff);
                return; 
            }

            for (const { event, staffMember } of eventsToProcess) {
                const startDate = event.getFirstPropertyValue('dtstart').toJSDate();
                const endDate = event.getFirstPropertyValue('dtend').toJSDate();

                for (let d = new Date(startDate); d < endDate; d.setDate(d.getDate() + 1)) {
                    const dateString = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    const docRef = this.db.collection('hou_schedules').doc(dateString);
                    const docSnap = await docRef.get();
                    const existingData = docSnap.exists ? docSnap.data() : {};
                    const staffEntry = existingData.staff?.find(s => s.id === staffMember.id && s.status === 'vacation');

                    if (!staffEntry) {
                        logHtml += `<p>Staging update for <strong>${staffMember.name}</strong> on ${dateString}.</p>`;
                        updatesStaged++;
                        const scheduleUpdate = { id: staffMember.id, status: 'vacation', hours: '', source: 'Rippling' };
                        batch.set(docRef, { date: firebase.firestore.Timestamp.fromDate(d), staff: firebase.firestore.FieldValue.arrayUnion(scheduleUpdate) }, { merge: true });
                    }
                }
            }

            if (updatesStaged > 0) {
                await batch.commit();
                logHtml += `<p>✅ Successfully committed ${updatesStaged} new schedule updates.</p>`;
            } else {
                logHtml += '<p>No new time-off events found to sync.</p>';
            }
            
            this.app.modalManager.showModal("Sync Complete", logHtml, [
                { text: 'Close', class: 'btn-secondary', onclick: 'laborTool.modalManager.closeModal(); location.reload();' }
            ]);

        } catch (error) {
            console.error("Sync failed:", error);
            this.app.modalManager.showModal("Sync Failed", `<p class="text-danger">An error occurred during the sync process:</p><p>${error.message}</p>`, [
                 { text: 'Close', class: 'btn-secondary', onclick: 'laborTool.modalManager.closeModal()' }
            ]);
        } finally {
            syncButton.disabled = false;
            syncButton.innerHTML = '<i class="fas fa-sync"></i> Sync with Rippling';
        }
    }

    async syncRipplingForDay(date) {
        if (this.app.user.role !== 'Manager') {
            alert("You must be a Manager to perform this action.");
            return;
        }
    
        const iCalUrl = 'webcal://app.rippling.com/api/feed/calendar/pto/all-reports/mpddmgvrmobo67mp/fae7526ebae71b747bb3a68129033095c76027f0ba187a62915ca80d3ae8def0/calendar.ics?company=685d9aa96419b55f758d812c';
        const proxyUrl = 'https://cors-anywhere.herokuapp.com/';
        const fetchUrl = `${proxyUrl}${iCalUrl.replace("webcal://", "https://")}`;
    
        this.app.modalManager.showModal("Syncing Calendar", `<p>Fetching and processing time-off data from Rippling for ${date.toLocaleDateString()}. Please wait...</p>`, []);
    
        try {
            await this.app.dataManager.buildUnifiedTechnicianData();
            const allStaff = this.app.dataManager.unifiedTechnicianData;
            const nameMappings = await this.app.firebaseService.getNameMappings();
    
            const response = await fetch(fetchUrl);
            if (!response.ok) throw new Error(`Failed to fetch calendar data. Status: ${response.status}`);
    
            const iCalData = await response.text();
            const jcalData = ICAL.parse(iCalData);
            const vcalendar = new ICAL.Component(jcalData);
            const vevents = vcalendar.getAllSubcomponents('vevent');
    
            const batch = this.db.batch();
            let updatesStaged = 0;
            let logHtml = `<h4>Sync Log for ${date.toLocaleDateString()}:</h4>`;
    
            for (const event of vevents) {
                const summary = event.getFirstPropertyValue('summary');
                if (!summary) continue;
    
                const employeeName = summary.split(' on ')[0].trim();
                const startDate = event.getFirstPropertyValue('dtstart').toJSDate();
                const endDate = event.getFirstPropertyValue('dtend').toJSDate();
    
                if (date >= startDate && date < endDate) {
                    const mappedId = nameMappings[employeeName];
                    let staffMember = mappedId ? allStaff.find(s => s.id === mappedId) : null;
                    if (!staffMember) {
                        staffMember = allStaff.find(s => s.name && s.name.toLowerCase() === employeeName.toLowerCase());
                    }
    
                    if (staffMember) {
                        const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                        const docRef = this.db.collection('hou_schedules').doc(dateString);
                        const docSnap = await docRef.get();
                        const existingData = docSnap.exists ? docSnap.data() : {};
                        const staffEntry = existingData.staff?.find(s => s.id === staffMember.id && s.status === 'vacation');
    
                        if (!staffEntry) {
                            logHtml += `<p>Staging update for <strong>${staffMember.name}</strong>.</p>`;
                            updatesStaged++;
                            const scheduleUpdate = { id: staffMember.id, status: 'vacation', hours: '', source: 'Rippling' };
                            batch.set(docRef, { date: firebase.firestore.Timestamp.fromDate(date), staff: firebase.firestore.FieldValue.arrayUnion(scheduleUpdate) }, { merge: true });
                        }
                    }
                }
            }
    
            if (updatesStaged > 0) {
                await batch.commit();
                logHtml += `<p>✅ Successfully committed ${updatesStaged} new schedule updates.</p>`;
            } else {
                logHtml += '<p>No new time-off events found to sync for today.</p>';
            }
    
            this.app.modalManager.showModal("Sync Complete", logHtml, [
                { text: 'Close', class: 'btn-secondary', onclick: 'laborTool.modalManager.closeModal()' }
            ]);
    
        } catch (error) {
            console.error("Daily sync failed:", error);
            this.app.modalManager.showModal("Sync Failed", `<p class="text-danger">An error occurred:</p><p>${error.message}</p>`, [
                 { text: 'Close', class: 'btn-secondary', onclick: 'laborTool.modalManager.closeModal()' }
            ]);
        }
    }

    openMappingModal(unmappedNames, allStaff) {
        const staffOptions = allStaff.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        
        const mappingRows = unmappedNames.map(name => `
            <div class="mapping-row" data-rippling-name="${name}">
                <span class="rippling-name">${name}</span>
                <select class="form-input staff-select">
                    <option value="">-- Select Employee --</option>
                    <option value="ignore" style="font-style: italic; color: #6c757d;">-- Ignore this person --</option>
                    ${staffOptions}
                </select>
            </div>
        `).join('');

        const modalBody = `
            <style>
                .mapping-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: center; margin-bottom: 12px; }
                .rippling-name { font-weight: 500; }
            </style>
            <h4>Unmatched Rippling Names</h4>
            <p>Some names from the Rippling calendar could not be automatically matched. Please map them to the correct employee or choose to ignore them. These mappings will be saved for future syncs.</p>
            <div id="mapping-container">${mappingRows}</div>
        `;

        this.app.modalManager.showModal("Manual Employee Mapping", modalBody, [
            { text: 'Cancel', class: 'btn-secondary', onclick: 'laborTool.modalManager.closeModal()' },
            { text: 'Save Mappings & Re-Sync', class: 'btn-primary', onclick: 'laborTool.calendarManager.saveNameMappings()' }
        ]);
    }

    async saveNameMappings() {
        const mappingRows = document.querySelectorAll('.mapping-row');
        const newMappings = {};
        let unmappedCount = 0;

        mappingRows.forEach(row => {
            const ripplingName = row.dataset.ripplingName;
            const selectedId = row.querySelector('.staff-select').value;
            if (selectedId) {
                newMappings[ripplingName] = selectedId;
            } else {
                unmappedCount++;
            }
        });

        if (unmappedCount > 0) {
            if (!confirm(`You have ${unmappedCount} unmapped name(s). Do you want to save the current mappings and sync only the ones you've completed?`)) {
                return;
            }
        }

        try {
            await this.app.firebaseService.saveNameMappings(newMappings);
            this.app.modalManager.closeModal();
            this.syncRipplingCalendar(); 
        } catch (error) {
            alert('Failed to save mappings. Please try again.');
            console.error("Error saving mappings:", error);
        }
    }
    
    switchView(view) {
        this.currentView = view;
        this.currentDate = new Date();
        document.querySelectorAll('.calendar-view-switcher button').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`cal${view.charAt(0).toUpperCase() + view.slice(1)}ViewBtn`).classList.add('active');
        this.renderCalendar();
    }

    navigate(direction) {
        if (this.currentView === 'month') this.currentDate.setMonth(this.currentDate.getMonth() + direction);
        else if (this.currentView === 'week') this.currentDate.setDate(this.currentDate.getDate() + (7 * direction));
        else this.currentDate.setDate(this.currentDate.getDate() + direction);
        this.renderCalendar();
    }

    async renderCalendar() {
        const calendarEl = document.getElementById('calendarContainer');
        calendarEl.innerHTML = '<div class="calendar-loading"><p>Loading calendar...</p></div>';

        await this.app.dataManager.buildUnifiedTechnicianData();

        switch (this.currentView) {
            case 'day': await this.renderDayView(); break;
            case 'week': await this.renderWeekView(); break;
            default: await this.renderMonthView(); break;
        }
    }

    _getDefaultStatusForPerson(person, dateObject) {
        const dayKey = dateObject.getDay();
        const isWeekend = dayKey === 0 || dayKey === 6;
        const weekNumber = this.getWeekNumber(dateObject);
        let status = isWeekend ? 'off' : 'on';
        let hours = '';
        let source = isWeekend ? 'Weekend Default' : 'Weekday Default';

        const personRules = person.recurringRules || [];

        if (personRules.length > 0) {
            for (const rule of personRules) {
                const ruleStartDate = rule.startDate ? new Date(rule.startDate) : null;
                const ruleEndDate = rule.endDate ? new Date(rule.endDate) : null;
                if ((!ruleStartDate || dateObject >= ruleStartDate) && (!ruleEndDate || dateObject <= ruleEndDate)) {
                    const ruleDays = Array.isArray(rule.days) ? rule.days : [rule.days];
                    if (ruleDays.includes(dayKey)) {
                        let appliesThisWeek = true;
                        if (rule.frequency === 'every-other') {
                            const weekAnchorParity = parseInt(rule.weekAnchor, 10) % 2;
                            const weekNumberParity = weekNumber % 2;
                            appliesThisWeek = weekNumberParity === weekAnchorParity;
                        }
                        if (appliesThisWeek) {
                            status = rule.status;
                            hours = rule.hours || '';
                            source = 'Recurring Rule';
                            break; 
                        }
                    }
                }
            }
        }
        
        return { status, hours, source };
    }

    async getCalculatedScheduleForDay(dateObject, monthlySchedules) {
        const specificDaySchedule = monthlySchedules.specific[dateObject.getDate()];
        const allStaff = this.app.dataManager.unifiedTechnicianData;
        const calculatedSchedule = {
            notes: specificDaySchedule?.notes || '',
            staff: []
        };
        for (const staffMember of allStaff) {
            if (!staffMember) continue;
            const { status: defaultStatus, hours: defaultHours, source: defaultSource } = this._getDefaultStatusForPerson(staffMember, dateObject);
            let personSchedule = { ...staffMember, status: defaultStatus, hours: defaultHours, source: defaultSource };
            
            const specificEntry = specificDaySchedule?.staff?.find(s => s.id === staffMember.id);
            if (specificEntry) {
                personSchedule.status = specificEntry.status;
                personSchedule.hours = specificEntry.hours || '';
                personSchedule.source = 'Specific Override';
            }
            calculatedSchedule.staff.push(personSchedule);
        }
        calculatedSchedule.staff.sort((a, b) => a.name.localeCompare(b.name));
        return calculatedSchedule;
    }

    async openEditRecurringForTechModal(techId) {
        const tech = this.app.teamManager.findPersonById(techId);
        if (!tech) return;

        const rules = await this.app.firebaseService.getRecurringRulesForTech(techId);
        const rulesHtml = rules.map((rule) => this.renderRuleHtml(rule)).join('');
        const body = `
            <div id="recurring-rules-container">${rulesHtml}</div>
            <button class="btn btn-outline" id="add-rule-btn" style="width: 100%; margin-top: 16px;"><i class="fas fa-plus"></i> Add New Rule</button>
        `;
        this.app.modalManager.showModal(`Recurring Schedule for ${tech.name}`, body, [
            { text: 'Back to List', class: 'btn-secondary', onclick: 'laborTool.calendarManager.openRecurringScheduleModal()' },
            { text: 'Save Changes', class: 'btn-primary', onclick: `laborTool.calendarManager.saveRecurringForTech('${tech.id}', '${tech.name}')` }
        ]);
        document.getElementById('add-rule-btn').addEventListener('click', () => {
            const newRuleHtml = this.renderRuleHtml({ days: [], status: 'off', frequency: 'every', weekAnchor: 1 }, null);
            document.getElementById('recurring-rules-container').insertAdjacentHTML('beforeend', newRuleHtml);
        });
    }

    renderRuleHtml(rule, ruleId = null) {
        const id = ruleId || rule.id || `new_${Date.now()}`;
        const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayCheckboxes = daysOfWeek.map((day, i) => `
            <label><input type="checkbox" value="${i}" ${(Array.isArray(rule.days) ? rule.days : [rule.days]).includes(i) ? 'checked' : ''}> ${day}</label>
        `).join('');
        const statusOptions = ['on', 'off', 'sick', 'vacation', 'no-call-no-show']
            .map(s => `<option value="${s}" ${rule.status === s ? 'selected' : ''}>${s.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>`).join('');
        return `
            <div class="rule-item" data-rule-id="${id}">
                <div class="rule-header">
                    <span>Rule</span>
                    <button class="btn btn-danger btn-small" onclick="laborTool.calendarManager.deleteRecurringRule('${id}')"><i class="fas fa-trash"></i></button>
                </div>
                <div class="rule-body">
                    <div class="form-group"><label>For these days:</label><div class="day-selector">${dayCheckboxes}</div></div>
                    <div class="form-grid">
                        <div class="form-group"><label>Set Status to:</label><select class="form-input status-select">${statusOptions}</select></div>
                        <div class="form-group"><label>With Hours (optional):</label><input type="text" class="form-input hours-input" placeholder="e.g., 9-5" value="${rule.hours || ''}"></div>
                    </div>
                    <div class="form-grid">
                        <div class="form-group"><label>Frequency:</label><select class="form-input frequency-select" onchange="this.closest('.rule-body').querySelector('.week-anchor-group').style.display = this.value === 'every-other' ? 'block' : 'none'"><option value="every" ${rule.frequency === 'every' ? 'selected' : ''}>Every Week</option><option value="every-other" ${rule.frequency === 'every-other' ? 'selected' : ''}>Every Other Week</option></select></div>
                        <div class="form-group week-anchor-group" style="display: ${rule.frequency === 'every-other' ? 'block' : 'none'};"><label>Starting on:</label><select class="form-input week-anchor-select"><option value="1" ${rule.weekAnchor == 1 ? 'selected' : ''}>Week 1 (Odd)</option><option value="2" ${rule.weekAnchor == 2 ? 'selected' : ''}>Week 2 (Even)</option></select></div>
                    </div>
                </div>
            </div>`;
    }

    async deleteRecurringRule(ruleId) {
        if (!ruleId.startsWith('new_')) {
            if (confirm('Are you sure you want to delete this rule permanently?')) {
                await this.app.firebaseService.deleteRecurringRule(ruleId);
                document.querySelector(`.rule-item[data-rule-id="${ruleId}"]`).remove();
                await this.app.dataManager.buildUnifiedTechnicianData();
            }
        } else {
            document.querySelector(`.rule-item[data-rule-id="${ruleId}"]`).remove();
        }
    }
    
    async saveRecurringForTech(techId, techName) {
        const ruleElements = document.querySelectorAll('.rule-item');
        const promises = [];
        for (const ruleEl of ruleElements) {
            const ruleId = ruleEl.dataset.ruleId;
            const isNew = ruleId.startsWith('new_');
            const finalRuleId = isNew ? this.db.collection('hou_recurring_rules').doc().id : ruleId;

            const ruleData = {
                technicianId: techId,
                technicianName: techName,
                days: Array.from(ruleEl.querySelectorAll('.day-selector input:checked')).map(cb => parseInt(cb.value)),
                status: ruleEl.querySelector('.status-select').value,
                hours: ruleEl.querySelector('.hours-input').value.trim(),
                frequency: ruleEl.querySelector('.frequency-select').value,
                weekAnchor: parseInt(ruleEl.querySelector('.week-anchor-select').value),
            };
            promises.push(this.app.firebaseService.saveRecurringRule(finalRuleId, ruleData));
        }
        await Promise.all(promises);
        this.app.showSuccess("Recurring schedule saved!");
        
        await this.app.dataManager.buildUnifiedTechnicianData();

        this.app.modalManager.closeModal();
        this.renderCalendar();
    }
    
    async renderMonthView() {
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        document.getElementById('calCurrentDate').textContent = `${monthNames[this.currentDate.getMonth()]} ${this.currentDate.getFullYear()}`;

        const calendarEl = document.getElementById('calendarContainer');
        const monthlySchedules = await this.app.firebaseService.getScheduleDataForMonth(this.currentDate.getFullYear(), this.currentDate.getMonth());

        const table = document.createElement('table');
        table.className = 'calendar-table';
        const thead = table.createTHead();
        const headerRow = thead.insertRow();
        ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach(day => headerRow.appendChild(Object.assign(document.createElement('th'), { textContent: day })));

        const tbody = table.createTBody();
        const firstDayOfMonth = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1).getDay();
        const daysInCurrentMonth = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 0).getDate();
        const totalWeeks = Math.ceil((firstDayOfMonth + daysInCurrentMonth) / 7);

        let dayCounter = 1;

        for (let i = 0; i < totalWeeks; i++) {
            const tr = tbody.insertRow();
            for (let j = 0; j < 7; j++) {
                const td = tr.insertCell();
                if ((i === 0 && j < firstDayOfMonth) || dayCounter > daysInCurrentMonth) {
                    td.classList.add('other-month');
                } else {
                    const cellDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), dayCounter);
                    await this.populateTableCellDetails(td, cellDate, monthlySchedules);
                    dayCounter++;
                }
            }
        }

        calendarEl.innerHTML = '';
        calendarEl.appendChild(table);
    }

    async renderWeekView() {
        const calendarEl = document.getElementById('calendarContainer');
        const startOfWeek = new Date(this.currentDate);
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 6);

        document.getElementById('calCurrentDate').textContent = `${startOfWeek.toLocaleDateString()} - ${endOfWeek.toLocaleDateString()}`;
        const monthlySchedules = await this.app.firebaseService.getScheduleDataForMonth(this.currentDate.getFullYear(), this.currentDate.getMonth());

        let weekHtml = '<div class="week-view-container">';
        for (let i = 0; i < 7; i++) {
            const day = new Date(startOfWeek);
            day.setDate(day.getDate() + i);
            const schedule = await this.getCalculatedScheduleForDay(day, monthlySchedules);
            const { primaryList, primaryHeaderText } = this.getDayViewLists(day, schedule);
            
            const staffListHtml = primaryList.length > 0
                ? primaryList.map(s => `<div class="staff-compact staff-${s.status.replace(' ', '-')}">${this.formatNameCompact(s.name)}: ${this.formatStatus(s)}</div>`).join('')
                : '<p class="no-entries">No special schedule</p>';

            weekHtml += `
                <div class="week-day-item" onclick="laborTool.calendarManager.handleDayClick(new Date('${day.toISOString()}'))">
                    <div class="week-day-header">${day.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</div>
                    <div class="week-day-body">
                        <h4>${primaryHeaderText}</h4>
                        ${staffListHtml}
                        ${schedule.notes ? `<div class="week-day-notes"><strong>Notes:</strong> ${schedule.notes}</div>` : ''}
                    </div>
                </div>
            `;
        }
        weekHtml += '</div>';
        calendarEl.innerHTML = weekHtml;
    }

    async renderDayView() {
        const calendarEl = document.getElementById('calendarContainer');
        document.getElementById('calCurrentDate').textContent = this.currentDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        const schedule = await this.getCalculatedScheduleForDay(this.currentDate, await this.app.firebaseService.getScheduleDataForMonth(this.currentDate.getFullYear(), this.currentDate.getMonth()));
        
        const { primaryList, secondaryList, primaryHeaderText, secondaryHeaderText } = this.getDayViewLists(this.currentDate, schedule);

        const primaryListHtml = primaryList.length > 0 ? primaryList.map(s => `<div class="view-staff-item status-${s.status}">${s.name}: ${this.formatStatus(s)}</div>`).join('') : '<p>None</p>';
        const secondaryListHtml = secondaryList.length > 0 ? secondaryList.map(s => `<div class="view-staff-item status-${s.status}">${s.name}: ${this.formatStatus(s)}</div>`).join('') : '<p>None</p>';

        calendarEl.innerHTML = `
            <div class="day-view-container">
                <h3>Notes:</h3>
                <div class="view-notes">${schedule.notes || 'No notes for this day.'}</div>
                <h3>${primaryHeaderText}</h3>
                <div class="view-staff-list">${primaryListHtml}</div>
                <h3>${secondaryHeaderText}</h3>
                <div class="view-staff-list">${secondaryListHtml}</div>
            </div>
        `;
    }
    
    async populateTableCellDetails(tdElement, dateObject, monthlySchedules) {
        tdElement.innerHTML = ''; 
        const dayOfMonth = dateObject.getDate();
        const dayKey = dateObject.getDay();
        const isWeekend = dayKey === 0 || dayKey === 6;

        const dateHeaderDiv = document.createElement('div');
        dateHeaderDiv.className = 'date-header';
        dateHeaderDiv.innerHTML = `<div class="date-number">${dayOfMonth}</div>`;
        const holidayName = this.getHolidayName(dateObject);
        if (holidayName) {
            tdElement.classList.add('holiday');
            dateHeaderDiv.innerHTML += `<div class="holiday-label">${holidayName}</div>`;
        }
        tdElement.appendChild(dateHeaderDiv);

        if (dateObject.toDateString() === new Date().toDateString()) tdElement.classList.add('today');
        if (isWeekend) tdElement.classList.add('weekend');
        
        tdElement.addEventListener('click', () => this.handleDayClick(dateObject));

        const schedule = await this.getCalculatedScheduleForDay(dateObject, monthlySchedules);
        
        const offStatuses = ['off', 'sick', 'vacation', 'no-call-no-show'];

        const staffToDisplay = schedule.staff.filter(s => {
            if (isWeekend) {
                return s.status === 'on' || s.hours;
            } else {
                return offStatuses.includes(s.status) || s.hours;
            }
        });

        const staffGridDiv = document.createElement('div');
        staffGridDiv.className = 'staff-grid';
        const maxToShowOnScreen = this.isPrinting ? staffToDisplay.length : 4;

        staffToDisplay.slice(0, maxToShowOnScreen).forEach(staffEntry => {
            const staffItemDiv = document.createElement('div');
            staffItemDiv.className = `staff-compact staff-${staffEntry.status.replace(' ', '-')} ${staffEntry.hours ? 'staff-custom-hours' : ''}`;
            staffItemDiv.innerHTML = `<div class="staff-name">${this.isPrinting ? staffEntry.name : this.formatNameCompact(staffEntry.name)}</div>`;
            if (staffEntry.hours) {
                 staffItemDiv.innerHTML += `<div class="staff-shift-info staff-shift-custom">${staffEntry.hours}</div>`;
            } else if (staffEntry.status !== 'on' && staffEntry.status !== 'off') {
                const statusText = staffEntry.status.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
                staffItemDiv.innerHTML += `<div class="staff-shift-info">${statusText}</div>`;
            }
            staffGridDiv.appendChild(staffItemDiv);
        });

        if (!this.isPrinting && staffToDisplay.length > maxToShowOnScreen) {
            staffGridDiv.innerHTML += `<div class="more-indicator">+${staffToDisplay.length - maxToShowOnScreen} more</div>`;
        }
        
        if (staffGridDiv.hasChildNodes()) tdElement.appendChild(staffGridDiv);

        if (schedule.notes && !this.isPrinting) {
            tdElement.appendChild(Object.assign(document.createElement('div'), {
                className: 'direct-note-display',
                textContent: schedule.notes,
                title: schedule.notes
            }));
        }
    }

    async handleDayClick(dateObject) {
        if (this.isPrinting) return;
        
        const monthlySchedules = await this.app.firebaseService.getScheduleDataForMonth(dateObject.getFullYear(), dateObject.getMonth());
        const scheduleForDay = await this.getCalculatedScheduleForDay(dateObject, monthlySchedules);

        if (this.isAdmin) {
            this.openEditScheduleModal(dateObject, scheduleForDay);
        } else {
            this.openViewScheduleModal(dateObject, scheduleForDay);
        }
    }

    getDayViewLists(dateObject, schedule) {
        const isWeekend = [0, 6].includes(dateObject.getDay());
        const offStatuses = ['off', 'sick', 'vacation', 'no-call-no-show'];
        const primaryHeaderText = isWeekend ? "Working Today" : "Scheduled Off / Custom";
        const secondaryHeaderText = isWeekend ? "Scheduled Off" : "Working Today";
        const primaryList = schedule.staff.filter(s => isWeekend ? (s.status === 'on' || s.hours) : (offStatuses.includes(s.status) || s.hours));
        const secondaryList = schedule.staff.filter(s => isWeekend ? (offStatuses.includes(s.status) && !s.hours) : (s.status === 'on' && !s.hours));
        return { primaryList, secondaryList, primaryHeaderText, secondaryHeaderText };
    }

    formatStatus(s) {
        let statusText = s.status.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        if (s.hours) statusText += ` (${s.hours})`;
        return statusText;
    }

    openViewScheduleModal(dateObject, schedule) {
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const dateString = `${monthNames[dateObject.getMonth()]} ${dateObject.getDate()}, ${dateObject.getFullYear()}`;
        const { primaryList, secondaryList, primaryHeaderText, secondaryHeaderText } = this.getDayViewLists(dateObject, schedule);
        
        const primaryListHtml = primaryList.length > 0 ? primaryList.map(s => `<div class="view-staff-item status-${s.status}">${s.name}: ${this.formatStatus(s)}</div>`).join('') : '<p>None</p>';
        const secondaryListHtml = secondaryList.length > 0 ? secondaryList.map(s => `<div class="view-staff-item status-${s.status}">${s.name}: ${this.formatStatus(s)}</div>`).join('') : '<p>None</p>';
        
        this.app.modalManager.showModal(dateString, `
            <div class="view-content">
                <h3>Notes:</h3>
                <div class="view-notes">${schedule.notes || 'No notes for this day.'}</div>
                <h3>${primaryHeaderText}</h3>
                <div class="view-staff-list">${primaryListHtml}</div>
                <h3>${secondaryHeaderText}</h3>
                <div class="view-staff-list">${secondaryListHtml}</div>
            </div>`, 
            [{ text: 'Close', class: 'btn-secondary', onclick: 'laborTool.modalManager.closeModal()' }]
        );
    }
    
    openEditScheduleModal(dateObj, schedule) {
        this.currentEditDate = dateObj;
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const dateString = `Edit Schedule for ${monthNames[dateObj.getMonth()]} ${dateObj.getDate()}`;
        
        const sortedStaff = [...schedule.staff].sort((a, b) => {
            const offStatuses = ['off', 'sick', 'vacation', 'no-call-no-show'];
            const aIsPriority = offStatuses.includes(a.status) || a.source === 'Recurring Rule' || a.hours;
            const bIsPriority = offStatuses.includes(b.status) || b.source === 'Recurring Rule' || b.hours;

            if (aIsPriority && !bIsPriority) return -1;
            if (!aIsPriority && bIsPriority) return 1;
            return a.name.localeCompare(b.name);
        });

        const staffListHtml = sortedStaff.map(staff => {
            const statusOptions = ['on', 'off', 'sick', 'vacation', 'no-call-no-show']
                .map(s => `<option value="${s}" ${staff.status === s ? 'selected' : ''}>${s.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>`).join('');
            
            const sourceIndicator = `<span class="status-source-badge source-${(staff.source || '').toLowerCase().replace(/ /g, '-')}">${staff.source}</span>`;

            return `
            <div class="staff-item-edit" data-staff-id="${staff.id}">
                <span class="staff-name-container">${staff.name} ${sourceIndicator}</span>
                <div class="staff-controls">
                    <input type="text" class="hours-input" placeholder="Notes..." value="${staff.hours || ''}" autocomplete="off">
                    <select class="status-select">${statusOptions}</select>
                </div>
            </div>`;
        }).join('');
        
        const modalBody = `
            <div class="edit-modal-layout-stacked">
                <div class="form-group">
                    <label for="staffSearchInput">Search Staff (Overrides for this day)</label>
                    <input type="text" id="staffSearchInput" class="form-input" placeholder="Start typing a name...">
                </div>
                <div class="staff-list-section">
                    ${staffListHtml}
                </div>
                <div class="form-group notes-section-stacked">
                    <label for="calNotes">Notes for this day:</label>
                    <textarea id="calNotes" class="form-control">${schedule.notes || ''}</textarea>
                </div>
            </div>`;
        
        this.app.modalManager.showModal(dateString, modalBody, [
            { text: 'Cancel', class: 'btn-secondary', onclick: 'laborTool.modalManager.closeModal()' },
            { text: 'Save Schedule', class: 'btn-primary', onclick: 'laborTool.calendarManager.saveSchedule()' }
        ]);

        // Add event listener for the new search bar
        document.getElementById('staffSearchInput').addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            document.querySelectorAll('.staff-item-edit').forEach(item => {
                const staffName = item.querySelector('.staff-name-container').textContent.toLowerCase();
                if (staffName.includes(searchTerm)) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    }

    async saveSchedule() {
        if (!this.currentEditDate) return;
        const allStaff = this.app.dataManager.unifiedTechnicianData;

        const staffData = Array.from(document.querySelectorAll('.staff-item-edit')).map(item => {
            const staffId = item.dataset.staffId;
            const tech = allStaff.find(t => t.id === staffId);
            
            if (!tech) {
                console.warn(`Could not find technician with ID ${staffId}. Skipping schedule save for this entry.`);
                return null;
            }

            const status = item.querySelector('.status-select').value;
            const hours = item.querySelector('.hours-input').value.trim();
            
            const { status: defaultStatus, hours: defaultHours } = this._getDefaultStatusForPerson(tech, this.currentEditDate);

            if (status !== defaultStatus || hours !== defaultHours) {
                return { id: staffId, status, hours };
            }
            return null;
        }).filter(item => item !== null);

        const schedulePayload = {
            date: firebase.firestore.Timestamp.fromDate(this.currentEditDate),
            staff: staffData,
            notes: document.getElementById('calNotes').value.trim()
        };
        
        try {
            await this.app.firebaseService.saveSchedule(schedulePayload);
            this.app.modalManager.closeModal();
            this.renderCalendar();
        } catch (error) {
            alert("Failed to save schedule.");
        }
    }

    async openRecurringScheduleModal() {
        const allTechs = this.app.teamManager.getAllTechnicians();
        const techRules = this.app.dataManager.unifiedTechnicianData.reduce((acc, tech) => {
            if (tech.recurringRules && tech.recurringRules.length > 0) {
                acc[tech.id] = tech.recurringRules.length;
            }
            return acc;
        }, {});

        let listHtml = '<div class="recurring-tech-list">';
        if (Object.keys(techRules).length > 0) {
            allTechs.forEach(tech => {
                if(techRules[tech.id]) {
                    listHtml += `
                        <div class="recurring-tech-item" onclick="laborTool.calendarManager.openEditRecurringForTechModal('${tech.id}')">
                            <span class="tech-name">${tech.name}</span>
                            <span class="summary">${techRules[tech.id]} active rule(s)</span>
                            <i class="fas fa-chevron-right"></i>
                        </div>
                    `;
                }
            });
        } else {
            listHtml += '<p class="no-entries">No custom recurring schedules found.</p>';
        }
        listHtml += '</div>';

        this.app.modalManager.showModal(
            'Manage Recurring Schedules',
            listHtml,
            [
                { text: 'Add Custom Schedule', class: 'btn-primary', onclick: 'laborTool.calendarManager.openTechSelectorForRecurring()' },
                { text: 'Close', class: 'btn-secondary', onclick: 'laborTool.modalManager.closeModal()' }
            ]
        );
    }
    
    openTechSelectorForRecurring() {
        const allTechs = this.app.teamManager.getAllTechnicians();
        const options = allTechs.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        const body = `
            <p>Select a technician to create or edit a custom recurring schedule.</p>
            <div class="form-group">
                <label for="tech-select-recurring">Technician</label>
                <select id="tech-select-recurring" class="form-input">${options}</select>
            </div>
        `;
        this.app.modalManager.showModal('Select Technician', body, [
            { text: 'Cancel', class: 'btn-secondary', onclick: 'laborTool.calendarManager.openRecurringScheduleModal()' },
            { text: 'Next', class: 'btn-primary', onclick: 'laborTool.calendarManager.openEditRecurringForTechModal(document.getElementById(\'tech-select-recurring\').value)' }
        ]);
    }
    
    getWeekNumber(d) {
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
        var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
        var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
        return weekNo;
    }

    async getActualStaffingForMonth(month, year) {
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const staffing = [];
        const allMitTechs = this.app.teamManager.getAllTechnicians().filter(s => s.role === 'MIT Tech');
        const monthlySchedules = await this.app.firebaseService.getScheduleDataForMonth(year, month);
    
        for (let day = 1; day <= daysInMonth; day++) {
            let staffedToday = 0;
            const currentDate = new Date(year, month, day);
            const scheduleForDay = await this.getCalculatedScheduleForDay(currentDate, monthlySchedules);
    
            allMitTechs.forEach(tech => {
                const endDate = tech.endDate ? new Date(tech.endDate) : null;
                const trainingEndDate = tech.trainingEndDate ? new Date(tech.trainingEndDate) : null;
    
                const isActive = !endDate || endDate > currentDate;
                const isDoneTraining = !tech.inTraining || (trainingEndDate && trainingEndDate <= currentDate);
                
                if (isActive && isDoneTraining) {
                    const staffEntry = scheduleForDay.staff.find(s => s.id === tech.id);
                    if (staffEntry && staffEntry.status === 'on') {
                        staffedToday++;
                    }
                }
            });
            staffing.push(staffedToday);
        }
        return staffing;
    }

    formatNameCompact(fullName) { if (!fullName) return ''; const parts = fullName.split(' '); return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1].charAt(0)}.` : parts[0]; }
    handlePrint() { this.isPrinting = true; this.renderCalendar().then(() => { setTimeout(() => { window.print(); this.isPrinting = false; this.renderCalendar(); }, 500); }); }
    checkAdminStatus() { this.isAdmin = localStorage.getItem('calendarAdmin') === 'true'; this.updateAdminUI(); }
    updateAdminUI() {
        const loginBtn = document.getElementById('calLoginBtn');
        const logoutBtn = document.getElementById('calLogoutBtn');
        const adminControls = document.querySelector('.calendar-actions');
        const syncBtn = document.getElementById('calSyncBtn');

        if (loginBtn) loginBtn.style.display = this.isAdmin ? 'none' : 'block';
        if (logoutBtn) logoutBtn.style.display = this.isAdmin ? 'block' : 'none';
        if (adminControls) adminControls.style.display = this.isAdmin ? 'flex' : 'none';
        if (syncBtn) syncBtn.style.display = this.isAdmin ? 'inline-flex' : 'none';
    }
    openAdminModal() { document.getElementById('calAdminModal').style.display = 'flex'; }
    login() { if (document.getElementById('calPassword').value === 'Entrusted1') { this.isAdmin = true; localStorage.setItem('calendarAdmin', 'true'); this.updateAdminUI(); document.getElementById('calAdminModal').style.display = 'none'; document.getElementById('calPassword').value = ''; this.renderCalendar(); } else { alert('Incorrect password'); } }
    logout() { this.isAdmin = false; localStorage.removeItem('calendarAdmin'); this.updateAdminUI(); this.renderCalendar(); }
    getHolidayName(date) { const M = date.getMonth(), D = date.getDate(), dayOfWeek = date.getDay(); if (M === 0 && D === 1) return "New Year's Day"; if (M === 6 && D === 4) return "Independence Day"; if (M === 11 && D === 25) return "Christmas Day"; if (M === 4 && dayOfWeek === 1 && D > 24) return "Memorial Day"; if (M === 8 && dayOfWeek === 1 && D <= 7) return "Labor Day"; if (M === 10 && dayOfWeek === 4 && D >= 22 && D <= 28) return "Thanksgiving"; return null; }

    async generateWeekendReport() {
        const today = new Date();
        let currentDay = new Date(today);
        const weekends = [];
    
        while (weekends.length < 4) {
            if (currentDay.getDay() === 6) { // Saturday
                const saturday = new Date(currentDay);
                const sunday = new Date(currentDay);
                sunday.setDate(sunday.getDate() + 1);
                weekends.push({ saturday, sunday });
            }
            currentDay.setDate(currentDay.getDate() + 1);
        }
    
        const startDate = weekends[0].saturday.toLocaleDateString();
        const endDate = weekends[3].sunday.toLocaleDateString();
    
        let reportHtml = `
            <div class="weekend-report-container">
                <div class="report-header">
                    <h2>Upcoming Weekend Schedule</h2>
                    <p class="date-range">For the period of ${startDate} to ${endDate}</p>
                </div>
        `;
    
        for (const weekend of weekends) {
            const satSchedule = await this.getCalculatedScheduleForDay(weekend.saturday, await this.app.firebaseService.getScheduleDataForMonth(weekend.saturday.getFullYear(), weekend.saturday.getMonth()));
            const sunSchedule = await this.getCalculatedScheduleForDay(weekend.sunday, await this.app.firebaseService.getScheduleDataForMonth(weekend.sunday.getFullYear(), weekend.sunday.getMonth()));
    
            const workingOnSat = satSchedule.staff.filter(s => s.status === 'on' || s.hours);
            const workingOnSun = sunSchedule.staff.filter(s => s.status === 'on' || s.hours);
    
            reportHtml += `
                <div class="weekend-group">
                    <div class="day-group">
                        <h4>Saturday, ${weekend.saturday.toLocaleDateString()}</h4>
                        ${workingOnSat.length > 0 ? workingOnSat.map(s => `<p>${s.name} ${s.hours ? `(${s.hours})` : ''}</p>`).join('') : '<p>No one scheduled.</p>'}
                        ${satSchedule.notes ? `<p class="notes">Notes: ${satSchedule.notes}</p>` : ''}
                    </div>
                    <div class="day-group">
                        <h4>Sunday, ${weekend.sunday.toLocaleDateString()}</h4>
                        ${workingOnSun.length > 0 ? workingOnSun.map(s => `<p>${s.name} ${s.hours ? `(${s.hours})` : ''}</p>`).join('') : '<p>No one scheduled.</p>'}
                        ${sunSchedule.notes ? `<p class="notes">Notes: ${sunSchedule.notes}</p>` : ''}
                    </div>
                </div>
            `;
        }
    
        reportHtml += '</div>';
    
        document.body.classList.add('report-printing');
    
        this.app.modalManager.showModal(
            'Weekend Report',
            reportHtml,
            [
                { text: 'Print', class: 'btn-primary', onclick: 'window.print();' },
                { text: 'Close', class: 'btn-secondary', onclick: 'document.body.classList.remove(\'report-printing\'); laborTool.modalManager.closeModal();' }
            ]
        );
    }
}