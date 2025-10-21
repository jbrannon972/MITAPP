// MIT APP/Tech App/JS/firebase-service.js
class FirebaseService {
    constructor() {
        this.db = firebase.firestore();
        this.storage = firebase.storage();
    }

    async submitDamageReport(reportData) {
        return this.db.collection('damage_reports').add(reportData);
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

    async getScheduleDataForMonth(year, month) {
        const schedulesMap = { specific: {} };
        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);
        const startTimestamp = firebase.firestore.Timestamp.fromDate(firstDayOfMonth);
        const endTimestamp = firebase.firestore.Timestamp.fromDate(lastDayOfMonth);

        try {
            const specificSchedulesSnap = await this.db.collection('hou_schedules')
                .where('date', '>=', startTimestamp)
                .where('date', '<=', endTimestamp)
                .get();

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

    async loadEquipmentData() {
        try {
            const snapshot = await this.db.collection("equipment").orderBy("createdAt", "desc").get();
            return snapshot.docs.map(e => ({ id: e.id, ...e.data() }));
        } catch (error) {
            console.error("Could not load equipment data:", error);
            return [];
        }
    }

    async submitWorkOrder(collection, docId, description) {
        try {
            const docRef = this.db.collection(collection).doc(docId);
            await docRef.collection('workOrders').add({
                issueDescription: description,
                dateReported: firebase.firestore.Timestamp.now(),
                status: 'Open',
            });
            // await docRef.set({ status: 'In Repairs' }, { merge: true });
            return true;
        } catch (error) {
            console.error(`Failed to submit work order for ${collection}:`, error);
            return false;
        }
    }
}