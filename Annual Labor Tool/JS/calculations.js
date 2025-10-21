class Calculator {
    constructor(app) {
        this.app = app;
    }

    calculateAllMonths() {
        for (let month = 0; month < 12; month++) {
            this.calculateMonth(month);
        }
    }

    calculateMonth(month) {
        const data = this.app.monthlyData[month];
        if (!data) return;

        const currentTechCount = this.getMITTechCount(month);
        data.currentStaffingLevel = currentTechCount;

        data.actualLeads = Math.round(data.leadsPercentGoal * data.leadsTarget);
        data.salesOps = Math.round(data.actualLeads * data.bookingRate);
        data.projectedWTRJobs = Math.round((data.salesOps * data.wtrInsClosingRate) + (data.salesOps * data.wtrCashClosingRate));
        data.activeJobsPerDay = (data.projectedWTRJobs / (data.daysInMonth || 22)) * data.mitAvgDaysOnsite;
        data.hoursNeededPerDay = data.activeJobsPerDay * data.hoursPerAppointment;

        const driveTime = data.averageDriveTime || 0;
        const effectiveWorkHours = (8 - driveTime) + data.otHoursPerTechPerDay;
        
        data.techsForemenNeeded = effectiveWorkHours > 0 ? Math.ceil(data.hoursNeededPerDay / effectiveWorkHours) : 0;
        
        data.staffingNeed = data.techsForemenNeeded + data.teamMembersOffPerDay;
        data.staffingDelta = data.currentStaffingLevel - data.staffingNeed;

        this.calculateLaborCosts(month);
    }

    calculateLaborCosts(month) {
        const data = this.app.monthlyData[month];
        if (!data || !this.app.wageSettings) return;
        const wages = this.app.wageSettings;

        const regularHours = data.techsForemenNeeded * 8 * (data.daysInMonth || 22);
        const overtimeHours = data.techsForemenNeeded * data.otHoursPerTechPerDay * (data.daysInMonth || 22);
        data.mitTechLaborCost = (regularHours * wages.avgHourlyBaseWage) + (overtimeHours * wages.avgOTWage);

        const numForeman = this.app.staffingData.zones ? this.app.staffingData.zones.length : 0;
        const numFieldSupervisors = 2;

        const monthlySalaries = ((wages.fieldSupervisorWage / 12) * numFieldSupervisors) +
                                (wages.foremanWage / 12 * numForeman) +
                                (wages.assistantMitManagerWage / 12) +
                                (wages.mitManagerWage / 12) +
                                (wages.fieldSupervisorBonus * numFieldSupervisors);

        data.fixedLaborCost = monthlySalaries;
        data.totalLaborSpend = data.mitTechLaborCost + data.fixedLaborCost;
        data.costPerWTRJob = data.projectedWTRJobs > 0 ? data.totalLaborSpend / data.projectedWTRJobs : 0;
    }

    getTotalStaff() {
        if (!this.app.staffingData || !this.app.staffingData.zones) return 0;
        let total = 0;
        this.app.staffingData.zones.forEach(zone => { total += 1 + zone.members.length; });
        return total;
    }

    getMITTechCount(month) {
        if (!this.app.staffingData || !this.app.staffingData.zones) return 0;
        let routeRunningTechs = 0;
        const referenceDate = new Date(this.app.currentYear, month + 1, 0); // Use last day of the month

        const isEligible = (person) => {
            if (!person) return false;
            const endDate = person.endDate ? new Date(person.endDate) : null;
            const trainingEndDate = person.trainingEndDate ? new Date(person.trainingEndDate) : null;
            
            const isActive = !endDate || endDate > referenceDate;
            const isDoneTraining = !person.inTraining || (trainingEndDate && trainingEndDate <= referenceDate);

            return isActive && isDoneTraining;
        };

        this.app.staffingData.zones.forEach(zone => {
            // Count all members with the role "MIT Tech"
            zone.members.forEach(member => {
                if (member.role === 'MIT Tech' && isEligible(member)) {
                    routeRunningTechs++;
                }
            });

            // *** NEW LOGIC: Specifically include the 2nd Shift Lead ***
            if (zone.name === '2nd Shift' && zone.lead && isEligible(zone.lead)) {
                routeRunningTechs++;
            }
        });

        return routeRunningTechs;
    }
    
    getDemoTechCount() {
        if (!this.app.staffingData || !this.app.staffingData.zones) return 0;
        let demoTechs = 0;
        const countDemoTech = (member) => {
            if (member.role === 'Demo Tech') demoTechs++;
        };
        this.app.staffingData.zones.forEach(zone => { zone.members.forEach(countDemoTech); });
        return demoTechs;
    }

    async calculateMonthlyForecast(month, year) {
        const data = this.app.monthlyData[month];
        if (!data) return { dailyRoutesNeeded: [], actualStaffing: [], newJobs: {} };

        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const projectedJobs = data.projectedWTRJobs || 0;
        const driveTime = data.averageDriveTime || 0;
        const otHoursPerTechPerDay = data.otHoursPerTechPerDay || 0;
        const hoursPerRoute = (8 - driveTime) + otHoursPerTechPerDay;

        let weekdays = 0, saturdays = 0, sundays = 0;
        for (let d = 1; d <= daysInMonth; d++) {
            const dayOfWeek = new Date(year, month, d).getDay();
            if (dayOfWeek > 0 && dayOfWeek < 6) weekdays++;
            else if (dayOfWeek === 6) saturdays++;
            else sundays++;
        }
        
        const weekdayJobs = projectedJobs > 0 ? projectedJobs / (weekdays + (saturdays * 0.5) + (sundays * 0.25)) : 0;
        const newJobs = { weekday: weekdayJobs, saturday: weekdayJobs / 2, sunday: weekdayJobs / 4 };

        const dailyRoutesNeeded = [];
        const baseDailyHoursNeeded = data.activeJobsPerDay * data.hoursPerAppointment;

        for (let d = 1; d <= daysInMonth; d++) {
            const dayOfWeek = new Date(year, month, d).getDay();
            let dailyHoursNeeded = baseDailyHoursNeeded;

            if (dayOfWeek === 6) {
                dailyHoursNeeded *= 0.5;
            } else if (dayOfWeek === 0) {
                dailyHoursNeeded *= 0.25;
            }

            const routesNeeded = hoursPerRoute > 0 ? dailyHoursNeeded / hoursPerRoute : 0;
            dailyRoutesNeeded.push(routesNeeded);
        }
        
        const actualStaffing = await this.app.calendarManager.getActualStaffingForMonth(month, year);

        return { dailyRoutesNeeded, actualStaffing, newJobs };
    }

    getAverageStaffingDelta() {
        let totalDelta = 0;
        let monthCount = 0;
        for (let i = 0; i < 12; i++) {
            if (this.app.monthlyData[i] && this.app.monthlyData[i].staffingDelta) {
                totalDelta += this.app.monthlyData[i].staffingDelta;
                monthCount++;
            }
        }
        return monthCount > 0 ? totalDelta / monthCount : 0;
    }

    getAverageDriverScore() {
        const allTechs = this.app.teamManager.getAllTechnicians();
        const driversWithScores = allTechs.filter(t => t.driverScore && t.driverScore.miles > 0);
        if (driversWithScores.length === 0) return 0;

        const totalRate = driversWithScores.reduce((sum, driver) => {
            const { alerts, eventScore, miles } = driver.driverScore;
            const totalScore = (alerts || 0) + (eventScore || 0);
            return sum + (totalScore / miles * 1000);
        }, 0);

        return totalRate / driversWithScores.length;
    }

    async getTechsOnRouteToday(date = new Date()) {
        const monthlySchedules = await this.app.firebaseService.getScheduleDataForMonth(date.getFullYear(), date.getMonth());
        const schedule = await this.app.calendarManager.getCalculatedScheduleForDay(date, monthlySchedules);
    
        // Get all technicians who are considered route runners
        const routeRunners = this.app.teamManager.getAllTechnicians().filter(s => {
            if (!s) return false; // Safeguard
            
            // A route runner is an MIT Tech not in training OR the lead of the 2nd shift zone
            const isSecondShiftLead = s.role === 'MIT Lead' && this.app.staffingData.zones.some(z => z.name === '2nd Shift' && z.lead.id === s.id);
            const isMitTech = s.role === 'MIT Tech' && !s.inTraining;
            
            return isMitTech || isSecondShiftLead;
        });
        
        let staffedToday = 0;
        routeRunners.forEach(staffMember => {
            const staffEntry = schedule.staff.find(s => s.id === staffMember.id);
            if (staffEntry && staffEntry.status === 'on') {
                staffedToday++;
            }
        });
        return staffedToday;
    }
    
    async getDemoTechsOnRouteToday(date = new Date()) {
        const monthlySchedules = await this.app.firebaseService.getScheduleDataForMonth(date.getFullYear(), date.getMonth());
        const schedule = await this.app.calendarManager.getCalculatedScheduleForDay(date, monthlySchedules);
        const demoTechs = this.app.teamManager.getAllTechnicians().filter(s => s.role === 'Demo Tech');
        
        let staffedToday = 0;
        demoTechs.forEach(staffMember => {
            const staffEntry = schedule.staff.find(s => s.id === staffMember.id);
            if (staffEntry && staffEntry.status === 'on') {
                staffedToday++;
            }
        });
        return staffedToday;
    }
    
    async getSubTeamsToday(date = new Date()) {
        const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const stats = await this.app.firebaseService.getDailyStats(dateString);
        return stats ? stats.subTeamCount || 0 : 0;
    }

    async getAverageInstallDuration(days = 90) {
        const recentStats = await this.app.firebaseService.getRecentDailyStats(days);
        const fallbackDuration = 4; // Default to 4 hours if no data is found

        if (!recentStats || recentStats.length === 0) {
            return fallbackDuration;
        }

        let totalInstallHours = 0;
        let totalInstallJobs = 0;

        recentStats.forEach(stats => {
            if (stats.jobTypeTechHours && stats.jobTypeTechHours.install) {
                totalInstallHours += stats.jobTypeTechHours.install;
            }
            if (stats.jobTypeCounts && stats.jobTypeCounts.install) {
                totalInstallJobs += stats.jobTypeCounts.install;
            }
        });
        
        return totalInstallJobs > 0 ? (totalInstallHours / totalInstallJobs) : fallbackDuration;
    }
    
    async getDailyHoursData(date = new Date()) {
        const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const stats = await this.app.firebaseService.getDailyStats(dateString);
        
        const subTeamCount = stats ? stats.subTeamCount || 0 : 0;
        const subPrepTime = subTeamCount * 1.5;
        let totalLaborHours = (stats ? stats.totalLaborHours || 0 : 0) + subPrepTime;
    
        const totalTechHours = (stats ? stats.totalTechHours || 0 : 0) + subPrepTime;
        const dtHours = stats ? stats.dtLaborHours || 0 : 0; // Total DT hours requested
        
        const techsOnRoute = await this.getTechsOnRouteToday(date);
        const demoTechsOnRoute = await this.getDemoTechsOnRouteToday(date);
        const monthData = this.app.monthlyData[date.getMonth()];
        const driveTime = monthData.averageDriveTime || 0;
        const otHours = monthData.otHoursPerTechPerDay || 0;
        
        const hoursPerTech = (8 - driveTime + otHours);
        const hoursAvailable = techsOnRoute * hoursPerTech;
        const dtHoursAvailable = demoTechsOnRoute * hoursPerTech; // Total available from our DTs
        const subHours = stats && stats.subContractorJobs ? stats.subContractorJobs.reduce((acc, job) => acc + (job.demoHours || 0), 0) : 0;
        
        const forecast = await this.calculateMonthlyForecast(date.getMonth(), date.getFullYear());
        const dayOfWeek = date.getDay();
        let newJobsToday = 0;
        if (dayOfWeek >= 1 && dayOfWeek <= 5) newJobsToday = forecast.newJobs.weekday || 0;
        else if (dayOfWeek === 6) newJobsToday = forecast.newJobs.saturday || 0;
        else if (dayOfWeek === 0) newJobsToday = forecast.newJobs.sunday || 0;
        
        const avgInstallDuration = await this.getAverageInstallDuration();
        const totalRequestedHours = totalLaborHours + dtHours;
        const availableHoursGoal = totalRequestedHours + (newJobsToday * avgInstallDuration);
        
        const baseWorkSurplus = hoursAvailable - totalLaborHours;
        const surplusHoursForNewInstalls = baseWorkSurplus;
    
        let potentialNewJobs = 0;
        if (surplusHoursForNewInstalls > 0 && avgInstallDuration > 0) {
            potentialNewJobs = Math.floor(surplusHoursForNewInstalls / avgInstallDuration);
        }
    
        // --- MODIFICATION START: Correct inefficient hours calculation ---
        const internalDemoHoursNeeded = Math.max(0, dtHours - subHours);
        const inefficientDemoHours = Math.max(0, dtHoursAvailable - internalDemoHoursNeeded);
        // --- MODIFICATION END ---
        
        return {
            totalTechHours,
            totalLaborHours,
            dtHours,
            hoursAvailable,
            dtHoursAvailable,
            subHours,
            availableHoursGoal,
            potentialNewJobs,
            inefficientDemoHours
        };
    }


    async getMonthlyAverages() {
        const labels = [];
        const avgDriverScores = [];
        const avgEvalScores = [];
        const allEvals = await this.app.firebaseService.loadAllEvaluationsForYear(this.app.currentYear);
        const allTechs = this.app.teamManager.getAllTechnicians();

        for (let i = 5; i >= 0; i--) {
            const date = new Date(this.app.currentYear, this.app.currentMonth - i, 1);
            const month = date.getMonth();
            const year = date.getFullYear();
            
            labels.push(date.toLocaleString('default', { month: 'short' }));

            // Driver Score Average
            const driversWithScores = allTechs.filter(t => t.driverScore && t.driverScore.miles > 0);
            let totalRate = 0;
            if (driversWithScores.length > 0) {
                 totalRate = driversWithScores.reduce((sum, driver) => {
                    const { alerts, eventScore, miles } = driver.driverScore;
                    const totalScore = (alerts || 0) + (eventScore || 0);
                    return sum + (totalScore / miles * 1000);
                }, 0);
                avgDriverScores.push(totalRate / driversWithScores.length);
            } else {
                avgDriverScores.push(0);
            }

            // Evaluation Score Average
            const evalsForMonth = allEvals.filter(e => e.createdAt.toDate().getMonth() === month && e.createdAt.toDate().getFullYear() === year);
            let totalEvalScore = 0;
            if (evalsForMonth.length > 0) {
                evalsForMonth.forEach(evaluation => {
                    const ratings = evaluation.ratings;
                    if (ratings && Object.keys(ratings).length === 8) {
                        const total = Object.values(ratings).reduce((sum, val) => sum + parseInt(val || 0), 0);
                        totalEvalScore += (total / 8);
                    }
                });
                avgEvalScores.push(totalEvalScore / evalsForMonth.length);
            } else {
                avgEvalScores.push(0);
            }
        }
        return { labels, avgDriverScores, avgEvalScores };
    }
}