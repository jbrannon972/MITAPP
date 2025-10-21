// MODIFICATION: The firebase.initializeApp() calls have been REMOVED from this file.
// They are now correctly placed in each HTML file, which ensures Firebase is initialized before any script tries to use it.

class FirebaseService {
    constructor() {
        this.db = firebase.firestore();
    }

    // --- Tool Management Functions ---
    async loadTools() {
        const snapshot = await this.db.collection('hou_tools').orderBy('name').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async saveTool(toolId, toolData) {
        if (toolId) {
            return this.db.collection('hou_tools').doc(toolId).update(toolData);
        } else {
            return this.db.collection('hou_tools').add(toolData);
        }
    }

    async deleteTool(toolId) {
        return this.db.collection('hou_tools').doc(toolId).delete();
    }

    async loadToolRequests(status) {
        const snapshot = await this.db.collection('hou_tool_requests')
            .where('status', '==', status)
            .orderBy('createdAt', 'desc')
            .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    
    async getRecentToolRequests(hours = 24) {
        const now = new Date();
        const pastDate = new Date(now.getTime() - hours * 60 * 60 * 1000);
        const pastTimestamp = firebase.firestore.Timestamp.fromDate(pastDate);

        const requests = [];
        try {
            const snapshot = await this.db.collection('hou_tool_requests')
                .where('createdAt', '>=', pastTimestamp)
                .orderBy('createdAt', 'desc')
                .get();
            
            snapshot.forEach(doc => {
                requests.push({ id: doc.id, ...doc.data() });
            });
        } catch (error) {
            console.error("Error fetching recent tool requests. A Firestore index might be required:", error);
            alert("Could not fetch recent tool requests. A database index may be required. Please check the browser console (F12) for a link to create it.");
        }
        return requests;
    }

    async updateToolRequestStatus(requestId, status) {
        const updateData = {
            status: status,
            completedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        return this.db.collection('hou_tool_requests').doc(requestId).update(updateData);
    }


    // --- NEW FUNCTION TO GET 2ND SHIFT LEAD ---
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

    // Monthly Data Operations
    async saveMonthlyData(year, month, data) {
        try {
            const docId = `${year}-${String(month).padStart(2, '0')}`;
            await this.db.collection('hou_monthly_data').doc(docId).set(data, { merge: true });
            console.log('Monthly data saved successfully');
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

    // Wage Settings Operations
    async loadWageSettings() {
        try {
            const doc = await this.db.collection('hou_settings').doc('wage_settings').get();
            return doc.exists ? doc.data() : null;
        } catch (error) {
            console.error('Error loading wage settings:', error);
            return null;
        }
    }

    // Staffing Data Operations
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

    // Fleet Data Operations
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

    // Calendar Operations
    async getScheduleDataForMonth(year, month) {
        const schedulesMap = { specific: {}, recurring: {} };
        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);
        const startTimestamp = firebase.firestore.Timestamp.fromDate(firstDayOfMonth);
        const endTimestamp = firebase.firestore.Timestamp.fromDate(lastDayOfMonth);

        try {
            const [specificSchedulesSnap, recurringSchedulesSnap] = await Promise.all([
                this.db.collection('hou_schedules').where('date', '>=', startTimestamp).where('date', '<=', endTimestamp).get(),
                this.db.collection('hou_recurring_schedules').get()
            ]);

            specificSchedulesSnap.forEach(doc => {
                const data = doc.data();
                schedulesMap.specific[data.date.toDate().getDate()] = data;
            });

            recurringSchedulesSnap.forEach(doc => {
                schedulesMap.recurring[doc.id] = doc.data();
            });
        } catch (error) {
            console.error("Error fetching schedule data for month:", error);
        }

        return schedulesMap;
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

    async getAllRecurringSchedules() {
        const recurringSchedules = {};
        try {
            const snapshot = await this.db.collection('hou_recurring_schedules').get();
            snapshot.forEach(doc => {
                recurringSchedules[doc.id] = doc.data();
            });
        } catch (error) {
            console.error("Error fetching all recurring schedules:", error);
        }
        return recurringSchedules;
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

    async saveRecurringSchedule(dayOfWeek, payload) {
        try {
            const recurringPayload = {
                staff: payload.staff,
                notes: payload.notes
            };
            await this.db.collection('hou_recurring_schedules').doc(dayOfWeek).set(recurringPayload, { merge: true });
            return true;
        } catch (error) {
            console.error('Error saving recurring schedule:', error);
            throw error;
        }
    }

    async deleteRecurringSchedule(dayOfWeek) {
        try {
            await this.db.collection('hou_recurring_schedules').doc(dayOfWeek).delete();
            return true;
        } catch (error) {
            console.error('Error deleting recurring schedule:', error);
            throw error;
        }
    }

    // Evaluation Operations
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
}