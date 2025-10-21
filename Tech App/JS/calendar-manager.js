// MIT APP/Tech App/JS/calendar-manager.js
class CalendarManager {
    constructor(app) {
        this.app = app;
        this.currentDate = new Date();
        this.currentView = 'my-schedule';
        this.recurringRulesCache = null; // Cache for recurring rules
    }

    async initialize() {
        const container = document.getElementById('calendar-tab');
        container.innerHTML = `
            <div class="tab-header"><h2>Schedule Calendar</h2></div>
            <div class="calendar-controls">
                <div class="calendar-nav">
                    <button id="calPrevBtn" class="btn btn-secondary"><i class="fas fa-chevron-left"></i></button>
                    <h2 id="calCurrentDate"></h2>
                    <button id="calNextBtn" class="btn btn-secondary"><i class="fas fa-chevron-right"></i></button>
                </div>
                <div class="calendar-view-switcher">
                    <button id="calMyScheduleViewBtn" class="btn btn-secondary btn-small active">My Schedule</button>
                    <button id="calDayViewBtn" class="btn btn-secondary btn-small">Day</button>
                    <button id="calWeekViewBtn" class="btn btn-secondary btn-small">Week</button>
                    <button id="calMonthViewBtn" class="btn btn-secondary btn-small">Month</button>
                </div>
            </div>
            <div id="calendarContainer" class="calendar-container"></div>
        `;
        this.addEventListeners();
        await this.loadRecurringRules(); // Pre-load rules
        this.renderCalendar();
    }
    
    async loadRecurringRules() {
        // Create a temporary FirebaseService instance if not available on app
        const service = this.app.firebaseService || new FirebaseService();
        try {
            const snapshot = await service.db.collection('hou_recurring_rules').get();
            this.recurringRulesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch(e) {
            console.error("Failed to load recurring rules", e);
            this.recurringRulesCache = [];
        }
    }

    addEventListeners() {
        document.getElementById('calPrevBtn').addEventListener('click', () => this.navigate(-1));
        document.getElementById('calNextBtn').addEventListener('click', () => this.navigate(1));
        document.getElementById('calMyScheduleViewBtn').addEventListener('click', () => this.switchView('my-schedule'));
        document.getElementById('calDayViewBtn').addEventListener('click', () => this.switchView('day'));
        document.getElementById('calWeekViewBtn').addEventListener('click', () => this.switchView('week'));
        document.getElementById('calMonthViewBtn').addEventListener('click', () => this.switchView('month'));
    }

    switchView(view) {
        this.currentView = view;
        this.currentDate = new Date();
        document.querySelectorAll('.calendar-view-switcher button').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`cal${view.charAt(0).toUpperCase() + view.slice(1).replace('-s', 'S')}ViewBtn`).classList.add('active');
        this.renderCalendar();
    }

    navigate(direction) {
        if (this.currentView === 'month') this.currentDate.setMonth(this.currentDate.getMonth() + direction);
        else if (this.currentView === 'week' || this.currentView === 'my-schedule') this.currentDate.setDate(this.currentDate.getDate() + (7 * direction));
        else this.currentDate.setDate(this.currentDate.getDate() + direction);
        this.renderCalendar();
    }

    async renderCalendar() {
        const calendarEl = document.getElementById('calendarContainer');
        calendarEl.innerHTML = '<p>Loading calendar...</p>';
        await this.loadRecurringRules(); // Refresh cache before every render
        switch (this.currentView) {
            case 'day': await this.renderDayView(); break;
            case 'week': await this.renderWeekView(); break;
            case 'my-schedule': await this.renderMyScheduleView(); break;
            default: await this.renderMonthView(); break;
        }
    }

    getWeekNumber(d) {
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return weekNo;
    }

    _getDefaultStatusForPerson(person, dateObject) {
        const dayKey = dateObject.getDay();
        const isWeekend = dayKey === 0 || dayKey === 6;
        const weekNumber = this.getWeekNumber(dateObject);
        let status = isWeekend ? 'off' : 'on';
        let hours = '';
        
        const personRules = this.recurringRulesCache.filter(r => r.technicianId === person.id);

        if (personRules.length > 0) {
            for (const rule of personRules) {
                const ruleStartDate = rule.startDate ? new Date(rule.startDate) : null;
                const ruleEndDate = rule.endDate ? new Date(rule.endDate) : null;
                if ((!ruleStartDate || dateObject >= ruleStartDate) && (!ruleEndDate || dateObject <= ruleEndDate)) {
                    if (rule.days.includes(dayKey)) {
                        let appliesThisWeek = true;
                        if (rule.frequency === 'every-other') {
                            appliesThisWeek = (weekNumber % 2) === (rule.weekAnchor % 2);
                        }
                        if (appliesThisWeek) {
                            status = rule.status;
                            hours = rule.hours || '';
                            break;
                        }
                    }
                }
            }
        }
        return { status, hours };
    }

    async getCalculatedScheduleForDay(dateObject, monthlySchedules) {
        const specificDaySchedule = monthlySchedules.specific[dateObject.getDate()];
        const allStaff = this.app.teamManager.getAllTechnicians();
        const calculatedSchedule = {
            notes: specificDaySchedule?.notes || '',
            staff: []
        };
        for (const staffMember of allStaff) {
            if (!staffMember) continue;
            const { status: defaultStatus, hours: defaultHours } = this._getDefaultStatusForPerson(staffMember, dateObject);
            let personSchedule = { ...staffMember, status: defaultStatus, hours: defaultHours };
            const specificEntry = specificDaySchedule?.staff?.find(s => s.id === staffMember.id);
            if (specificEntry) {
                personSchedule.status = specificEntry.status;
                personSchedule.hours = specificEntry.hours || '';
            }
            calculatedSchedule.staff.push(personSchedule);
        }
        calculatedSchedule.staff.sort((a, b) => a.name.localeCompare(b.name));
        return calculatedSchedule;
    }
    
    // (The rest of the file is identical to the Supervisor version and can be copied)
    // ... paste the rest of the calendar-manager.js file from the SUPERVISOR app here ...
    // Note: I will paste it here for completeness
    
    formatNameCompact(fullName) {
        if (!fullName) return '';
        const parts = fullName.split(' ');
        return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1].charAt(0)}.` : parts[0];
    }

    formatStatus(s) {
        let statusText = s.status.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        if (s.hours) statusText += ` (${s.hours})`;
        return statusText;
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

    async renderMyScheduleView() {
        const calendarEl = document.getElementById('calendarContainer');
        const startDate = new Date(this.currentDate);
        startDate.setDate(startDate.getDate() - startDate.getDay());
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 6);
        document.getElementById('calCurrentDate').textContent = `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
        const loggedInUser = authManager.getLoggedInUser();
        if (!loggedInUser || !loggedInUser.userId) {
            calendarEl.innerHTML = '<p>Could not identify user. Please try logging in again.</p>';
            return;
        }
        const techId = loggedInUser.userId;
        const schedulesForStartMonth = await this.app.firebaseService.getScheduleDataForMonth(startDate.getFullYear(), startDate.getMonth());
        const schedulesForEndMonth = startDate.getMonth() !== endDate.getMonth() ? await this.app.firebaseService.getScheduleDataForMonth(endDate.getFullYear(), endDate.getMonth()) : schedulesForStartMonth;
        let myScheduleHtml = '<div class="my-schedule-container">';
        for (let i = 0; i < 7; i++) {
            const day = new Date(startDate);
            day.setDate(day.getDate() + i);
            const relevantSchedules = day.getMonth() === startDate.getMonth() ? schedulesForStartMonth : schedulesForEndMonth;
            const schedule = await this.getCalculatedScheduleForDay(day, relevantSchedules);
            const mySchedule = schedule.staff.find(s => s.id === techId);
            let statusHtml = '<p class="no-entries">Not found in schedule</p>';
            if (mySchedule) {
                statusHtml = `<div class="schedule-status status-${mySchedule.status.replace(' ', '-')}">${this.formatStatus(mySchedule)}</div>`;
            }
            myScheduleHtml += `
                <div class="schedule-entry">
                    <div class="schedule-date">${day.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</div>
                    ${statusHtml}
                </div>`;
        }
        myScheduleHtml += '</div>';
        calendarEl.innerHTML = myScheduleHtml;
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
            </div>`;
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
            const staffListHtml = primaryList.length > 0 ? primaryList.map(s => `<div class="staff-compact staff-${s.status.replace(' ', '-')}">${this.formatNameCompact(s.name)}: ${this.formatStatus(s)}</div>`).join('') : '<p class="no-entries">No special schedule</p>';
            weekHtml += `
                <div class="week-day-item">
                    <div class="week-day-header">${day.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</div>
                    <div class="week-day-body">
                        <h4>${primaryHeaderText}</h4>
                        ${staffListHtml}
                        ${schedule.notes ? `<div class="week-day-notes"><strong>Notes:</strong> ${schedule.notes}</div>` : ''}
                    </div>
                </div>`;
        }
        weekHtml += '</div>';
        calendarEl.innerHTML = weekHtml;
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
        const firstDay = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1).getDay();
        const daysInMonth = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 0).getDate();
        let dateCounter = 1;
        for (let i = 0; i < 6; i++) {
            const tr = tbody.insertRow();
            for (let j = 0; j < 7; j++) {
                const td = tr.insertCell();
                if ((i === 0 && j < firstDay) || dateCounter > daysInMonth) {
                    td.classList.add('other-month');
                } else {
                    const cellDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), dateCounter);
                    await this.populateTableCellDetails(td, cellDate, monthlySchedules);
                    dateCounter++;
                }
            }
            if (dateCounter > daysInMonth) break;
        }
        calendarEl.innerHTML = '';
        calendarEl.appendChild(table);
    }

    async populateTableCellDetails(tdElement, dateObject, monthlySchedules) {
        tdElement.innerHTML = `<div class="date-header"><div class="date-number">${dateObject.getDate()}</div></div>`;
        if (dateObject.toDateString() === new Date().toDateString()) tdElement.classList.add('today');
        tdElement.addEventListener('click', async () => this.openViewScheduleModal(dateObject, await this.getCalculatedScheduleForDay(dateObject, monthlySchedules)));
        const schedule = await this.getCalculatedScheduleForDay(dateObject, monthlySchedules);
        const offStatuses = ['off', 'sick', 'vacation', 'no-call-no-show'];
        const isWeekend = [0, 6].includes(dateObject.getDay());
        const staffToDisplay = isWeekend ? schedule.staff.filter(s => s.status === 'on' || s.hours) : schedule.staff.filter(s => offStatuses.includes(s.status) || s.hours);
        const staffGridDiv = document.createElement('div');
        staffGridDiv.className = 'staff-grid';
        staffToDisplay.slice(0, 4).forEach(staffEntry => {
            const staffItemDiv = document.createElement('div');
            staffItemDiv.className = `staff-compact staff-${staffEntry.status.replace(' ', '-')} ${staffEntry.hours ? 'staff-custom-hours' : ''}`;
            staffItemDiv.innerHTML = `<div class="staff-name">${this.formatNameCompact(staffEntry.name)}</div>`;
            if (staffEntry.hours) {
                staffItemDiv.innerHTML += `<div class="staff-shift-info staff-shift-custom">${staffEntry.hours}</div>`;
            } else if (staffEntry.status !== 'on' && staffEntry.status !== 'off') {
                staffItemDiv.innerHTML += `<div class="staff-shift-info">${staffEntry.status.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}</div>`;
            }
            staffGridDiv.appendChild(staffItemDiv);
        });
        if (staffToDisplay.length > 4) {
            staffGridDiv.innerHTML += `<div class="more-indicator">+${staffToDisplay.length - 4} more</div>`;
        }
        if (staffGridDiv.hasChildNodes()) tdElement.appendChild(staffGridDiv);
        if (schedule.notes) {
            tdElement.appendChild(Object.assign(document.createElement('div'), {
                className: 'direct-note-display',
                textContent: schedule.notes,
                title: schedule.notes
            }));
        }
    }

    openViewScheduleModal(dateObject, schedule) {
        const dateString = dateObject.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        const { primaryList, secondaryList, primaryHeaderText, secondaryHeaderText } = this.getDayViewLists(dateObject, schedule);
        const primaryListHtml = primaryList.length > 0 ? primaryList.map(s => `<div class="view-staff-item status-${s.status}">${s.name}: ${this.formatStatus(s)}</div>`).join('') : '<p>None</p>';
        const secondaryListHtml = secondaryList.length > 0 ? secondaryList.map(s => `<div class="view-staff-item status-${s.status}">${s.name}: ${this.formatStatus(s)}</div>`).join('') : '<p>None</p>';
        const modalHtml = `
            <div id="calViewModal" class="cal-modal" style="display: flex;">
                <div class="modal-content">
                    <span class="close">&times;</span>
                    <h2>${dateString}</h2>
                    <div class="view-content">
                        <h3>Notes:</h3>
                        <div class="view-notes">${schedule.notes || 'No notes for this day.'}</div>
                        <h3>${primaryHeaderText}</h3>
                        <div class="view-staff-list">${primaryListHtml}</div>
                        <h3>${secondaryHeaderText}</h3>
                        <div class="view-staff-list">${secondaryListHtml}</div>
                    </div>
                </div>
            </div>`;
        const overlay = document.getElementById('modalOverlay');
        overlay.innerHTML = modalHtml;
        overlay.classList.add('active');
        overlay.querySelector('.close').addEventListener('click', () => this.app.modalManager.closeModal());
    }
}