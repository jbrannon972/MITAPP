class FirebaseService {
    constructor() {
        this.db = firebase.firestore();
    }

    // --- NEW MAPPING FUNCTIONS START ---
    async getNameMappings() {
        try {
            const doc = await this.db.collection('hou_settings').doc('name_mappings').get();
            if (doc.exists) {
                return doc.data();
            }
            return {}; // Return an empty object if no mappings exist yet
        } catch (error) {
            console.error("Error fetching name mappings:", error);
            return {}; // Return empty object on error to prevent crashes
        }
    }

    async saveNameMappings(mappings) {
        try {
            const docRef = this.db.collection('hou_settings').doc('name_mappings');
            // Use set with merge:true to add/update mappings without overwriting the whole document
            await docRef.set(mappings, { merge: true });
            return true;
        } catch (error) {
            console.error("Error saving name mappings:", error);
            return false;
        }
    }
    // --- NEW MAPPING FUNCTIONS END ---

    async getAllTechnicians() {
        try {
            const staffingDoc = await this.db.collection('hou_settings').doc('staffing_data').get();
            if (!staffingDoc.exists) return [];
            
            const staffingData = staffingDoc.data();
            const allStaff = [];

            (staffingData.zones || []).forEach(zone => {
                if (zone.lead) allStaff.push({ ...zone.lead, zoneName: zone.name });
                (zone.members || []).forEach(member => allStaff.push({ ...member, zoneName: zone.name }));
            });
            
            return allStaff.filter(Boolean);

        } catch (error) {
            console.error('Error fetching all technicians:', error);
            return [];
        }
    }

    async loadDamageReports() {
        try {
            const snapshot = await this.db.collection('damage_reports').orderBy('date_of_occurrence', 'desc').get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error('Error loading damage reports:', error);
            return [];
        }
    }

    async updateDamageReport(reportId, data) {
        try {
            await this.db.collection('damage_reports').doc(reportId).update(data);
            return true;
        } catch (error) {
            console.error('Error updating damage report:', error);
            return false;
        }
    }
    
    // --- START: ADDED TOOL MANAGEMENT FUNCTIONS ---
    async loadToolRequests(status) {
        const snapshot = await this.db.collection('hou_tool_requests')
            .where('status', '==', status)
            .orderBy('createdAt', 'desc')
            .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    
    async updateToolRequestStatus(requestId, status) {
        const updateData = {
            status: status,
            completedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        return this.db.collection('hou_tool_requests').doc(requestId).update(updateData);
    }
    // --- END: ADDED TOOL MANAGEMENT FUNCTIONS ---


    async getRecurringRules() {
        try {
            const snapshot = await this.db.collection('hou_recurring_rules').get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error('Error fetching recurring rules:', error);
            return [];
        }
    }

    async getRecurringRulesForTech(technicianId) {
        try {
            const snapshot = await this.db.collection('hou_recurring_rules')
                .where('technicianId', '==', technicianId)
                .get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(`Error fetching recurring rules for tech ${technicianId}:`, error);
            return [];
        }
    }

    async saveRecurringRule(ruleId, ruleData) {
        return this.db.collection('hou_recurring_rules').doc(ruleId).set(ruleData, { merge: true });
    }

    async deleteRecurringRule(ruleId) {
        return this.db.collection('hou_recurring_rules').doc(ruleId).delete();
    }

    async getScheduleDataForMonth(year, month) {
        const schedulesMap = { specific: {} };
        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);
        const startTimestamp = firebase.firestore.Timestamp.fromDate(firstDayOfMonth);
        const endTimestamp = firebase.firestore.Timestamp.fromDate(lastDayOfMonth);
        try {
            const specificSchedulesSnap = await this.db.collection('hou_schedules').where('date', '>=', startTimestamp).where('date', '<=', endTimestamp).get();
            specificSchedulesSnap.forEach(doc => {
                const data = doc.data();
                if (data.date) {
                    schedulesMap.specific[data.date.toDate().getDate()] = data;
                }
            });
        } catch (error) {
            console.error("Error fetching specific schedule data for month:", error);
        }
        return schedulesMap;
    }
    async getSecondShiftLeadName() {
        try {
            const doc = await this.db.collection('hou_settings').doc('staffing_data').get();
            if (doc.exists) {
                const staffingData = doc.data();
                const secondShiftZone = staffingData.zones.find(zone => zone.name === '2nd Shift');
                return secondShiftZone ? secondShiftZone.lead.name : null;
            }
            return null;
        } catch (error) {
            console.error('Error getting 2nd shift lead name:', error);
            return null;
        }
    }
    async saveMonthlyData(year, month, data) {
        try {
            const docId = `${year}-${String(month).padStart(2, '0')}`;
            await this.db.collection('hou_monthly_data').doc(docId).set(data, { merge: true });
            return true;
        } catch (error) {
            console.error('Error saving monthly data:', error);
            return false;
        }
    }
    async loadAllMonthlyData(year) {
        try {
            const snapshot = await this.db.collection('hou_monthly_data')
                .where(firebase.firestore.FieldPath.documentId(), '>=', `${year}-01`)
                .where(firebase.firestore.FieldPath.documentId(), '<=', `${year}-12`)
                .get();
            const monthlyData = {};
            snapshot.forEach(doc => {
                const monthIndex = parseInt(doc.id.split('-')[1]) - 1;
                monthlyData[monthIndex] = doc.data();
            });
            return monthlyData;
        } catch (error) {
            console.error('Error loading all monthly data:', error);
            return {};
        }
    }
    async loadWageSettings() {
        try {
            const doc = await this.db.collection('hou_settings').doc('wage_settings').get();
            return doc.exists ? doc.data() : null;
        } catch (error) {
            console.error('Error loading wage settings:', error);
            return null;
        }
    }
    async loadStaffingData() {
        try {
            const doc = await this.db.collection('hou_settings').doc('staffing_data').get();
            return doc.exists ? doc.data() : null;
        } catch (error) {
            console.error('Error loading staffing data:', error);
            return null;
        }
    }
    async saveStaffingData(data) {
        try {
            await this.db.collection('hou_settings').doc('staffing_data').set(data);
            return true;
        } catch (error) {
            console.error('Error saving staffing data:', error);
            return false;
        }
    }
    async loadFleetData() {
        try {
            const snapshot = await this.db.collection('hou_fleet').get();
            const vehicles = [];
            snapshot.forEach(doc => {
                if (doc.id !== 'all_vehicles') {
                    vehicles.push({ id: doc.id, ...doc.data() });
                }
            });
            return { vehicles };
        } catch (error) {
            console.error('Error loading fleet data:', error);
            return null;
        }
    }
    async saveVehicleData(vehicleId, vehicleData) {
        try {
            await this.db.collection('hou_fleet').doc(vehicleId).set(vehicleData, { merge: true });
            return true;
        } catch (error) {
            console.error('Error saving vehicle data:', error);
            return false;
        }
    }
    async deleteVehicleData(vehicleId) {
        try {
            await this.db.collection('hou_fleet').doc(vehicleId).delete();
            return true;
        } catch (error) {
            console.error('Error deleting vehicle data:', error);
            return false;
        }
    }
    async getSchedulesForDateRange(startDate, endDate) {
        try {
            const startTimestamp = firebase.firestore.Timestamp.fromDate(new Date(startDate));
            const endTimestamp = firebase.firestore.Timestamp.fromDate(new Date(endDate + 'T23:59:59'));
            const snapshot = await this.db.collection('hou_schedules')
                .where('date', '>=', startTimestamp)
                .where('date', '<=', endTimestamp)
                .get();
            return snapshot.docs.map(doc => doc.data());
        } catch (error) {
            console.error('Error fetching schedules for date range:', error);
            return [];
        }
    }
    async saveSchedule(payload) {
        try {
            const date = payload.date.toDate();
            const docId = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            await this.db.collection('hou_schedules').doc(docId).set(payload, { merge: true });
            return true;
        } catch (error) {
            console.error('Error saving specific schedule:', error);
            throw error;
        }
    }
    async loadAllEvaluationsForYear(year) {
        try {
            const startDate = firebase.firestore.Timestamp.fromDate(new Date(year, 0, 1));
            const endDate = firebase.firestore.Timestamp.fromDate(new Date(year, 11, 31, 23, 59, 59));
            const snapshot = await this.db.collection('technician-evaluations')
                .where('createdAt', '>=', startDate)
                .where('createdAt', '<=', endDate)
                .get();
            return snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
        } catch (error) {
            console.error('Error loading all evaluations for year:', error);
            return [];
        }
    }
    async saveDailyStats(date, data) {
        return this.db.collection('analyzer_daily_stats').doc(date).set(data);
    }
    async updateJobHistory(jobId, date, jobData, dataToMerge = {}) {
        const jobDocRef = this.db.collection('analyzer_job_history').doc(jobId);
        return this.db.runTransaction(async (transaction) => {
            const jobDoc = await transaction.get(jobDocRef);
            if (!jobDoc.exists) {
                transaction.set(jobDocRef, {
                    visitCount: 1,
                    dates: [date],
                    firstSeen: date,
                    lastSeen: date,
                    name: jobData.name,
                    address: jobData.address,
                    hasInstallRecord: dataToMerge.hasInstallRecord || false,
                    ...dataToMerge
                });
            } else {
                const data = jobDoc.data();
                const newDates = new Set(data.dates || []);
                newDates.add(date);
                const updateData = {
                    dates: Array.from(newDates).sort(),
                    visitCount: newDates.size,
                    lastSeen: date,
                    ...dataToMerge
                };
                transaction.update(jobDocRef, updateData);
            }
        });
    }
    async findJobsWithoutInstall() {
        try {
            const snapshot = await this.db.collection('analyzer_job_history')
                .where('hasInstallRecord', '==', false)
                .where('noInstallRequired', '==', false)
                .orderBy('lastSeen', 'desc')
                .limit(50)
                .get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Critical Error finding jobs without install record. This requires a composite index in Firestore.", error);
            alert("A database error occurred. You MUST create a Firestore index for this query to work. Check the browser console (F12) for a link to create it automatically.");
            return [];
        }
    }
    async getAllJobHistoriesForSanitizing() {
        const snapshot = await this.db.collection('analyzer_job_history').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    async getDashboardData() {
        const dailyStatsSnapshot = await this.db.collection('analyzer_daily_stats').orderBy("date", "desc").get();
        const jobHistorySnapshot = await this.db.collection('analyzer_job_history').get();
        const dailyStats = dailyStatsSnapshot.docs.map(d => d.data());
        const allZones = ['All Zones', ...new Set(dailyStats.map(d => Object.keys(d.zoneCounts || {})).flat())].sort();
        return {
            dailyStats,
            jobHistory: jobHistorySnapshot.docs.map(d => ({id: d.id, ...d.data()})),
            allZones
        };
    }
    async getSubContractorReportData(startDate, endDate, crew) {
        const q = this.db.collection("analyzer_daily_stats")
            .where("date", ">=", startDate)
            .where("date", "<=", endDate)
            .orderBy("date", "desc");
        const snapshot = await q.get();
        let reportJobs = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.subContractorJobs) {
                data.subContractorJobs.forEach(job => {
                    if (job.crew === crew) {
                        reportJobs.push({ date: data.date, ...job });
                    }
                });
            }
        });
        return reportJobs;
    }
    async getDailyStats(date) {
        const docSnap = await this.db.collection("analyzer_daily_stats").doc(date).get();
        return docSnap.exists ? docSnap.data() : null;
    }
    async getAllDailyStats() {
        const snapshot = await this.db.collection("analyzer_daily_stats").orderBy("date", "desc").get();
        return snapshot.docs.map(doc => doc.data());
    }
    async getMonthlyStats(year, month) {
        const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const nextMonth = new Date(year, month + 1, 1);
        const endDate = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;
        try {
            const snapshot = await this.db.collection("analyzer_daily_stats")
                .where("date", ">=", startDate)
                .where("date", "<", endDate)
                .get();
            return snapshot.docs.map(doc => doc.data());
        } catch (error) {
            console.error("Error fetching monthly stats:", error);
            return [];
        }
    }
    async getRecentDailyStats(days = 90) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - days);
        const formatDate = (date) => date.toISOString().split('T')[0];
        const startDateString = formatDate(startDate);
        try {
            const snapshot = await this.db.collection("analyzer_daily_stats")
                .where("date", ">=", startDateString)
                .get();
            return snapshot.docs.map(doc => doc.data());
        } catch (error) {
            console.error(`Error fetching stats for the last ${days} days:`, error);
            return [];
        }
    }
    async deleteDailyStats(date) {
        return this.db.collection("analyzer_daily_stats").doc(date).delete();
    }
    async saveSecondShiftReport(date, data) {
        return this.db.collection('second_shift_reports').doc(date).set(data);
    }
    async getSecondShiftReportByDate(date) {
        const docSnap = await this.db.collection('second_shift_reports').doc(date).get();
        return docSnap.exists ? docSnap.data() : null;
    }
    async getSecondShiftReportsByDateRange(startDate, endDate) {
        const snapshot = await this.db.collection('second_shift_reports')
            .where('date', '>=', startDate)
            .where('date', '<=', endDate)
            .orderBy('date', 'desc')
            .get();
        return snapshot.docs.map(doc => doc.data());
    }
    async getSecondShiftInstallsByDateRange(startDate, endDate) {
        try {
            const snapshot = await this.db.collection('install_details')
                .where('installedBy', '==', 'Second Shift')
                .where('installedDate', '>=', startDate)
                .where('installedDate', '<=', endDate)
                .orderBy('installedDate', 'desc')
                .get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error('Error fetching second shift installs:', error);
            alert("A database error occurred fetching install data. A Firestore index might be required. Check the console (F12) for details.");
            return [];
        }
    }

    // --- NEW SLACK MENTION TODO FUNCTIONS ---
    async getAllTodos() {
        const snapshot = await this.db.collection('todos').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async getTodosByUserId(userId) {
        const snapshot = await this.db.collection('todos').where('userId', '==', userId).get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async updateTodo(todoId, data) {
        return this.db.collection('todos').doc(todoId).update(data);
    }
    
    async createTodo(todoId, todoData) {
        return this.db.collection('todos').doc(todoId).set(todoData);
    }
    
    async checkTodoExists(todoId) {
        const docSnap = await this.db.collection('todos').doc(todoId).get();
        return docSnap.exists;
    }

    async clearAllTodos() {
        const snapshot = await this.db.collection('todos').get();
        const batch = this.db.batch();
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        return snapshot.size;
    }
}