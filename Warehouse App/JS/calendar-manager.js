class CalendarManager {
    constructor(app) {
        this.app = app;
        this.db = app.firebaseService.db;
        this.currentDate = new Date();
        this.currentView = 'month'; // 'day', 'week', 'month'
        this.isPrinting = false;
        this.recurringRulesCache = null; // Cache for recurring rules
    }

    async initialize() {
        // Always load the recurring rules, regardless of the page.
        await this.loadRecurringRules(); 

        if (document.getElementById('calendarContainer')) {
            // Remove admin-only buttons from the DOM if they exist
            document.getElementById('calManageRecurringBtn')?.remove();
            document.getElementById('calLoginBtn')?.remove();
            document.getElementById('calLogoutBtn')?.remove();
            
            this.setupEventListeners();
            await this.renderCalendar(); 
        }
    }
    
    async loadRecurringRules() {
        try {
            const snapshot = await this.db.collection('hou_recurring_rules').get();
            this.recurringRulesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch(e) {
            console.error("Failed to load recurring rules", e);
            this.recurringRulesCache = [];
        }
    }

    setupEventListeners() {
        document.getElementById('calPrevBtn')?.addEventListener('click', () => this.navigate(-1));
        document.getElementById('calNextBtn')?.addEventListener('click', () => this.navigate(1));
        document.getElementById('calDayViewBtn')?.addEventListener('click', () => this.switchView('day'));
        document.getElementById('calWeekViewBtn')?.addEventListener('click', () => this.switchView('week'));
        document.getElementById('calMonthViewBtn')?.addEventListener('click', () => this.switchView('month'));
        document.getElementById('calPrintBtn')?.addEventListener('click', () => this.handlePrint());
    }

    switchView(view) {
        this.currentView = view;
        this.currentDate = new Date(); // Reset to today when switching
        document.querySelectorAll('.calendar-view-switcher button').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`cal${view.charAt(0).toUpperCase() + view.slice(1)}ViewBtn`).classList.add('active');
        this.renderCalendar();
    }

    navigate(direction) {
        if (this.currentView === 'month') {
            this.currentDate.setMonth(this.currentDate.getMonth() + direction);
        } else if (this.currentView === 'week') {
            this.currentDate.setDate(this.currentDate.getDate() + (7 * direction));
        } else { // day
            this.currentDate.setDate(this.currentDate.getDate() + direction);
        }
        this.renderCalendar();
    }

    async renderCalendar() {
        const calendarEl = document.getElementById('calendarContainer');
        calendarEl.innerHTML = '<div class="calendar-loading"><p>Loading calendar...</p></div>';
        
        // Refresh the rules cache each time the calendar is rendered
        await this.loadRecurringRules();
    
        switch (this.currentView) {
            case 'day': await this.renderDayView(); break;
            case 'week': await this.renderWeekView(); break;
            case 'month': default: await this.renderMonthView(); break;
        }
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
                <div class="week-day-item" onclick="warehouseApp.calendarManager.handleDayClick(new Date('${day.toISOString()}'))">
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
        tdElement.appendChild(dateHeaderDiv);

        if (dateObject.toDateString() === new Date().toDateString()) tdElement.classList.add('today');
        if (isWeekend) tdElement.classList.add('weekend');
        
        tdElement.addEventListener('click', () => this.handleDayClick(dateObject));

        const schedule = await this.getCalculatedScheduleForDay(dateObject, monthlySchedules);
        const offStatuses = ['off', 'sick', 'vacation', 'no-call-no-show'];
        
        const staffToDisplay = isWeekend
            ? schedule.staff.filter(s => s.status === 'on' || s.hours)
            : schedule.staff.filter(s => offStatuses.includes(s.status) || s.hours);

        const staffGridDiv = document.createElement('div');
        staffGridDiv.className = 'staff-grid';
        const maxToShowOnScreen = 4;

        staffToDisplay.slice(0, maxToShowOnScreen).forEach(staffEntry => {
            const staffItemDiv = document.createElement('div');
            staffItemDiv.className = `staff-compact staff-${staffEntry.status.replace(' ', '-')} ${staffEntry.hours ? 'staff-custom-hours' : ''}`;
            staffItemDiv.innerHTML = `<div class="staff-name">${this.formatNameCompact(staffEntry.name)}</div>`;
            if (staffEntry.hours) {
                 staffItemDiv.innerHTML += `<div class="staff-shift-info staff-shift-custom">${staffEntry.hours}</div>`;
            } else if (staffEntry.status !== 'on' && staffEntry.status !== 'off') {
                const statusText = staffEntry.status.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
                staffItemDiv.innerHTML += `<div class="staff-shift-info">${statusText}</div>`;
            }
            staffGridDiv.appendChild(staffItemDiv);
        });

        if (staffToDisplay.length > maxToShowOnScreen) {
            staffGridDiv.innerHTML += `<div class="more-indicator">+${staffToDisplay.length - maxToShowOnScreen} more</div>`;
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

    async handleDayClick(dateObject) {
        const monthlySchedules = await this.app.firebaseService.getScheduleDataForMonth(dateObject.getFullYear(), dateObject.getMonth());
        const scheduleForDay = await this.getCalculatedScheduleForDay(dateObject, monthlySchedules);
        this.openViewScheduleModal(dateObject, scheduleForDay);
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
    
    _getDefaultStatusForPerson(person, dateObject) {
        const dayKey = dateObject.getDay();
        const isWeekend = dayKey === 0 || dayKey === 6;
        const weekNumber = this.getWeekNumber(dateObject);
        let status = isWeekend ? 'off' : 'on';
        let hours = '';
        
        const personRules = this.recurringRulesCache ? this.recurringRulesCache.filter(r => r.technicianId === person.id) : [];

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
        
        const staffingData = this.app.teamManager.staffingData;
        const allStaff = [
            ...(staffingData.management || []),
            ...((staffingData.zones || []).flatMap(z => [z.lead, ...z.members])),
            ...(staffingData.warehouseStaff || [])
        ].filter(Boolean);

        const calculatedSchedule = {
            notes: specificDaySchedule?.notes || '',
            staff: []
        };

        for (const staffMember of allStaff) {
            if (!staffMember || !staffMember.id) continue;
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

    openViewScheduleModal(dateObject, schedule) {
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const dateString = `${monthNames[dateObject.getMonth()]} ${dateObject.getDate()}, ${dateObject.getFullYear()}`;
        const { primaryList, secondaryList, primaryHeaderText, secondaryHeaderText } = this.getDayViewLists(dateObject, schedule);
        
        const primaryListHtml = primaryList.length > 0 ? primaryList.map(s => `<div class="view-staff-item status-${s.status}">${s.name}: ${this.formatStatus(s)}</div>`).join('') : '<p>None</p>';
        const secondaryListHtml = secondaryList.length > 0 ? secondaryList.map(s => `<div class="view-staff-item status-${s.status}">${s.name}: ${this.formatStatus(s)}</div>`).join('') : '<p>None</p>';

        const modalHtml = `<div id="calViewModal" class="cal-modal" style="display: flex;"><div class="modal-content"><span class="close">&times;</span><h2>${dateString}</h2><div class="view-content"><h3>Notes:</h3><div class="view-notes">${schedule.notes || 'No notes for this day.'}</div><h3>${primaryHeaderText}</h3><div class="view-staff-list">${primaryListHtml}</div><h3>${secondaryHeaderText}</h3><div class="view-staff-list">${secondaryListHtml}</div></div></div></div>`;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        document.querySelector('#calViewModal .close').addEventListener('click', () => document.getElementById('calViewModal').remove());
    }

    getWeekNumber(d) {
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
        var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
        var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
        return weekNo;
    }

    formatNameCompact(fullName) { 
        if (!fullName) return ''; 
        const parts = fullName.split(' '); 
        return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1].charAt(0)}.` : parts[0]; 
    }
    
    handlePrint() { 
        this.isPrinting = true; 
        this.renderCalendar().then(() => { 
            setTimeout(() => { 
                window.print(); 
                this.isPrinting = false; 
                this.renderCalendar(); 
            }, 500); 
        }); 
    }
}