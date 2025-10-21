class DataManager {
    constructor(app) {
        this.app = app;
        // This new property will hold our unified data, our single source of truth.
        this.unifiedTechnicianData = []; 
    }

    async loadAllData() {
        // These can still run in parallel as they don't depend on each other.
        await Promise.all([
            this.loadAllMonthlyData(),
            this.loadWageSettings(),
            this.loadStaffingData()
        ]);
        
        // CRITICAL STEP: After all primary data is loaded, we build the unified data structure.
        // This MUST happen before any other calculations or rendering.
        await this.buildUnifiedTechnicianData();

        // Now that the data is unified and reliable, we can proceed with calculations.
        this.app.calculator.calculateAllMonths();
    }

    // This is the new function that creates the single source of truth for scheduling.
    async buildUnifiedTechnicianData() {
        const recurringRules = await this.app.firebaseService.getRecurringRules();
        const allTechnicians = this.app.teamManager.getAllTechnicians();

        this.unifiedTechnicianData = allTechnicians.map(tech => {
            return {
                ...tech,
                // We embed each technician's rules directly into their object.
                recurringRules: recurringRules.filter(rule => rule.technicianId === tech.id)
            };
        });
    }

    generatePersonId() {
        return 'person_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    sanitizeStaffingData(staffingData) {
        if (staffingData.zones) {
            staffingData.zones.forEach(zone => {
                if (zone.lead && !zone.lead.id) {
                    zone.lead.id = this.generatePersonId();
                }
                if (zone.members) {
                    zone.members.forEach(member => {
                        if (!member.id) {
                            member.id = this.generatePersonId();
                        }
                    });
                }
            });
        }
        return staffingData;
    }

    async loadAllMonthlyData() {
        try {
            const monthlyDataFromDB = await this.app.firebaseService.loadAllMonthlyData(this.app.currentYear);
            for (let i = 0; i < 12; i++) {
                this.app.monthlyData[i] = monthlyDataFromDB[i] || this.getDefaultMonthlyData(i);
            }
        } catch (error) {
            console.error('Error loading all monthly data, using defaults:', error);
            for (let i = 0; i < 12; i++) {
                this.app.monthlyData[i] = this.getDefaultMonthlyData(i);
            }
        }
    }

    async loadWageSettings() {
        try {
            this.app.wageSettings = await this.app.firebaseService.loadWageSettings() || this.getDefaultWageSettings();
        } catch (error) {
            console.error('Error loading wage settings, using defaults:', error);
            this.app.wageSettings = this.getDefaultWageSettings();
        }
    }

    async loadStaffingData() {
        try {
            let loadedData = await this.app.firebaseService.loadStaffingData();
            if (!loadedData || !loadedData.zones) {
                console.warn('No valid staffing data in DB, using default data.');
                loadedData = this.getDefaultStaffingData();
            }
            this.app.staffingData = this.sanitizeStaffingData(loadedData);
        } catch (error) {
            console.error('Error loading staffing data, using default data:', error);
            let defaultData = this.getDefaultStaffingData();
            this.app.staffingData = this.sanitizeStaffingData(defaultData);
        }
    }

    getDefaultStaffingData() {
        return {
            "zones": [
                { "name": "Zone 1", "lead": { "id": "lead_josh_g", "name": "Josh G", "role": "MIT Lead" }, "members": [ { "id": "tech_jesse_v", "name": "Jesse V", "role": "MIT Tech" }, { "id": "tech_recardo_m", "name": "Recardo M", "role": "MIT Tech" }, { "id": "tech_cody_dt", "name": "Cody (DT?)", "role": "Demo Tech" } ] },
                { "name": "Zone 2", "lead": { "id": "lead_hardie_j", "name": "Hardie J", "role": "MIT Lead" }, "members": [ { "id": "tech_jacob_b", "name": "Jacob B", "role": "MIT Tech" }, { "id": "tech_gregg_v", "name": "Gregg V", "role": "MIT Tech" }, { "id": "tech_braeden_p", "name": "Braeden P", "role": "MIT Tech" } ] },
                { "name": "Zone 3", "lead": { "id": "lead_nathaniel_f", "name": "Nathaniel F", "role": "MIT Lead" }, "members": [ { "id": "tech_alex_c", "name": "Alex C", "role": "MIT Tech" }, { "id": "tech_von_n", "name": "Von N", "role": "MIT Tech" }, { "id": "tech_jose_e", "name": "Jose E", "role": "MIT Tech" } ] },
                { "name": "Zone 4", "lead": { "id": "lead_jacob_c", "name": "Jacob C", "role": "MIT Lead" }, "members": [ { "id": "tech_chris_r", "name": "Chris R", "role": "MIT Tech" }, { "id": "tech_preston", "name": "Preston", "role": "MIT Tech" }, { "id": "tech_aj_garcia", "name": "AJ Garcia", "role": "MIT Tech" } ] },
                { "name": "Zone 5", "lead": { "id": "lead_chandler_h", "name": "Chandler H", "role": "MIT Lead" }, "members": [ { "id": "tech_sterlin_w", "name": "Sterlin W", "role": "MIT Tech" }, { "id": "tech_justin_h", "name": "Justin H", "role": "MIT Tech" }, { "id": "tech_nate_d", "name": "Nate D", "role": "MIT Tech" } ] },
                { "name": "2nd Shift", "lead": { "id": "lead_jordan_b", "name": "Jordan B", "role": "MIT Lead" }, "members": [ { "id": "tech_tanner_g", "name": "Tanner G", "role": "MIT Tech" }, { "id": "tech_toby_m", "name": "Toby M", "role": "MIT Tech" }, { "id": "tech_dominik_d", "name": "Dominik D", "role": "MIT Tech" } ] }
            ],
            "management": [
                { "id": "mgr_jason_brannon", "name": "Jason Brannon", "role": "Manager" }
            ]
        };
    }
    
    getDefaultMonthlyData(month) {
        const isHistorical = month < new Date().getMonth();
        return { 
            daysInMonth: [23, 19, 21, 22, 21, 20, 22, 21, 21, 22, 18, 22][month], 
            leadsPercentGoal: isHistorical ? [0.828, 0.902, 0.873, 0.78, 0.76, 0.89][month] || 0.85 : 0.85, 
            leadsTarget: [401, 366, 361, 391, 500, 505, 510, 515, 431, 416, 406, 396][month], 
            bookingRate: isHistorical ? [0.852, 0.833, 0.857, 0.83, 0.847, 0.805][month] || 0.85 : 0.85, 
            wtrInsClosingRate: isHistorical ? [0.4382, 0.4873, 0.4074, 0.4173, 0.4068, 0.378][month] || 0.43 : 0.43, 
            wtrCashClosingRate: isHistorical ? [0.212, 0.1527, 0.1618, 0.2008, 0.2516, 0.218][month] || 0.175 : 0.175, 
            mitAvgDaysOnsite: 5, 
            hoursPerAppointment: 4, 
            otHoursPerTechPerDay: month === 7 ? 1.5 : 0, 
            teamMembersOffPerDay: 3, 
            averageDriveTime: 1.0
        };
    }
    
    getDefaultWageSettings() {
        return { avgHourlyBaseWage: 19.52, avgOTWage: 29.28, fieldSupervisorWage: 64000, fieldSupervisorBonus: 500, foremanWage: 59000, assistantMitManagerWage: 78000, mitManagerWage: 100000 };
    }

    async updateMonthlyDataFromInputs() {
        const data = this.app.monthlyData[this.app.currentMonth];
        data.daysInMonth = parseInt(document.getElementById('daysInMonth').value) || 0;
        data.leadsPercentGoal = parseFloat(document.getElementById('leadsPercentGoal').value) || 0;
        data.leadsTarget = parseInt(document.getElementById('leadsTarget').value) || 0;
        data.bookingRate = parseFloat(document.getElementById('bookingRate').value) || 0;
        data.wtrInsClosingRate = parseFloat(document.getElementById('wtrInsClosingRate').value) || 0;
        data.wtrCashClosingRate = parseFloat(document.getElementById('wtrCashClosingRate').value) || 0;
        data.mitAvgDaysOnsite = parseFloat(document.getElementById('mitAvgDaysOnsite').value) || 0;
        data.hoursPerAppointment = parseInt(document.getElementById('hoursPerAppointment').value) || 0;
        data.otHoursPerTechPerDay = parseFloat(document.getElementById('otHoursPerTechPerDay').value) || 0;
        data.teamMembersOffPerDay = parseInt(document.getElementById('teamMembersOffPerDay').value) || 0;
        data.averageDriveTime = parseFloat(document.getElementById('averageDriveTime').value) || 0;

        this.app.calculator.calculateAllMonths();
        await this.app.firebaseService.saveMonthlyData(this.app.currentYear, this.app.currentMonth + 1, data);
        
        this.app.uiRenderer.renderInputsView();
    }
}