import { db } from '../config/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy
} from 'firebase/firestore';

class FirebaseService {
  // Collection references
  collections = {
    settings: 'hou_settings',
    calendar: 'hou_calendar',
    fleet: 'hou_fleet',
    equipment: 'hou_equipment',
    evaluations: 'hou_evaluations',
    leaderboard: 'hou_leaderboard',
    damages: 'hou_damages',
    slackMentions: 'hou_slack_mentions'
  };

  // Load staffing data
  async loadStaffingData() {
    try {
      const docRef = doc(db, this.collections.settings, 'staffing_data');
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? docSnap.data() : null;
    } catch (error) {
      console.error('Error loading staffing data:', error);
      throw error;
    }
  }

  // Save staffing data
  async saveStaffingData(data) {
    try {
      const docRef = doc(db, this.collections.settings, 'staffing_data');
      await setDoc(docRef, data);
    } catch (error) {
      console.error('Error saving staffing data:', error);
      throw error;
    }
  }

  // Load wage settings
  async loadWageSettings() {
    try {
      const docRef = doc(db, this.collections.settings, 'wage_settings');
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? docSnap.data() : null;
    } catch (error) {
      console.error('Error loading wage settings:', error);
      throw error;
    }
  }

  // Save wage settings
  async saveWageSettings(data) {
    try {
      const docRef = doc(db, this.collections.settings, 'wage_settings');
      await setDoc(docRef, data);
    } catch (error) {
      console.error('Error saving wage settings:', error);
      throw error;
    }
  }

  // Load monthly data
  async loadMonthlyData(year) {
    try {
      const docRef = doc(db, this.collections.settings, `monthly_data_${year}`);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? docSnap.data() : null;
    } catch (error) {
      console.error('Error loading monthly data:', error);
      throw error;
    }
  }

  // Save monthly data
  async saveMonthlyData(year, data) {
    try {
      const docRef = doc(db, this.collections.settings, `monthly_data_${year}`);
      await setDoc(docRef, data);
    } catch (error) {
      console.error('Error saving monthly data:', error);
      throw error;
    }
  }

  // Get second shift lead name
  async getSecondShiftLeadName() {
    try {
      const docRef = doc(db, this.collections.settings, 'staffing_data');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        return data.secondShiftLead || null;
      }
      return null;
    } catch (error) {
      console.error('Error getting second shift lead:', error);
      return null;
    }
  }

  // Calendar events
  async getCalendarEvents(startDate, endDate) {
    try {
      const eventsRef = collection(db, this.collections.calendar);
      const q = query(
        eventsRef,
        where('date', '>=', startDate),
        where('date', '<=', endDate)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error getting calendar events:', error);
      throw error;
    }
  }

  async saveCalendarEvent(eventId, data) {
    try {
      const docRef = doc(db, this.collections.calendar, eventId);
      await setDoc(docRef, data);
    } catch (error) {
      console.error('Error saving calendar event:', error);
      throw error;
    }
  }

  async deleteCalendarEvent(eventId) {
    try {
      const docRef = doc(db, this.collections.calendar, eventId);
      await deleteDoc(docRef);
    } catch (error) {
      console.error('Error deleting calendar event:', error);
      throw error;
    }
  }

  // Schedule management
  async getScheduleDataForMonth(year, month) {
    try {
      // Fetch all schedule documents for the month
      const schedulesRef = collection(db, 'hou_schedules');

      // Build date range for the month
      const startDate = new Date(year, month, 1);
      const endDate = new Date(year, month + 1, 0);

      const snapshot = await getDocs(schedulesRef);

      const specificSchedules = {};

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const dateString = doc.id; // Format: YYYY-MM-DD

        // Check if this date is in the current month
        if (dateString.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)) {
          const day = parseInt(dateString.split('-')[2], 10);
          specificSchedules[day] = {
            staff: data.staff || [],
            notes: data.notes || ''
          };
        }
      });

      return {
        specific: specificSchedules
      };
    } catch (error) {
      console.error('Error getting schedule data for month:', error);
      return { specific: {} };
    }
  }

  async saveSchedule(scheduleData) {
    try {
      const date = scheduleData.date.toDate ? scheduleData.date.toDate() : new Date(scheduleData.date);
      const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

      const docRef = doc(db, 'hou_schedules', dateString);
      await setDoc(docRef, {
        date: scheduleData.date,
        staff: scheduleData.staff,
        notes: scheduleData.notes
      });
    } catch (error) {
      console.error('Error saving schedule:', error);
      throw error;
    }
  }

  // Second shift reports
  async getSecondShiftReportByDate(dateString) {
    try {
      const docRef = doc(db, 'second_shift_reports', dateString);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? docSnap.data() : null;
    } catch (error) {
      console.error('Error getting second shift report:', error);
      return null;
    }
  }

  async saveSecondShiftReport(dateString, data) {
    try {
      const docRef = doc(db, 'second_shift_reports', dateString);
      await setDoc(docRef, data);
    } catch (error) {
      console.error('Error saving second shift report:', error);
      throw error;
    }
  }

  // Fleet management
  async loadFleetData() {
    try {
      const fleetRef = collection(db, this.collections.fleet);
      const snapshot = await getDocs(fleetRef);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error loading fleet data:', error);
      return [];
    }
  }

  async getFleetVehicles() {
    try {
      const fleetRef = collection(db, this.collections.fleet);
      const snapshot = await getDocs(fleetRef);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error getting fleet vehicles:', error);
      throw error;
    }
  }

  async saveFleetVehicle(vehicleId, data) {
    try {
      const docRef = doc(db, this.collections.fleet, vehicleId);
      await setDoc(docRef, data);
    } catch (error) {
      console.error('Error saving fleet vehicle:', error);
      throw error;
    }
  }

  // Equipment management
  async getEquipment() {
    try {
      const equipmentRef = collection(db, this.collections.equipment);
      const snapshot = await getDocs(equipmentRef);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error getting equipment:', error);
      throw error;
    }
  }

  async saveEquipment(equipmentId, data) {
    try {
      const docRef = doc(db, this.collections.equipment, equipmentId);
      await setDoc(docRef, data);
    } catch (error) {
      console.error('Error saving equipment:', error);
      throw error;
    }
  }

  // Recurring rules management
  async getAllRecurringRules() {
    try {
      const rulesRef = collection(db, 'hou_recurring_rules');
      const snapshot = await getDocs(rulesRef);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error getting recurring rules:', error);
      return []; // Return empty array on error
    }
  }

  async getRecurringRulesForTech(techId) {
    try {
      const rulesRef = collection(db, 'hou_recurring_rules');
      const q = query(rulesRef, where('technicianId', '==', techId));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error getting recurring rules for tech:', error);
      return [];
    }
  }

  async saveRecurringRule(ruleId, data) {
    try {
      const docRef = doc(db, 'hou_recurring_rules', ruleId);
      await setDoc(docRef, data);
    } catch (error) {
      console.error('Error saving recurring rule:', error);
      throw error;
    }
  }

  async deleteRecurringRule(ruleId) {
    try {
      const docRef = doc(db, 'hou_recurring_rules', ruleId);
      await deleteDoc(docRef);
    } catch (error) {
      console.error('Error deleting recurring rule:', error);
      throw error;
    }
  }

  // Generic get document
  async getDocument(collectionName, docId) {
    try {
      const docRef = doc(db, collectionName, docId);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
    } catch (error) {
      console.error(`Error getting document from ${collectionName}:`, error);
      throw error;
    }
  }

  // Generic save document
  async saveDocument(collectionName, docId, data) {
    try {
      const docRef = doc(db, collectionName, docId);
      await setDoc(docRef, data);
    } catch (error) {
      console.error(`Error saving document to ${collectionName}:`, error);
      throw error;
    }
  }

  // Generic update document
  async updateDocument(collectionName, docId, data) {
    try {
      const docRef = doc(db, collectionName, docId);
      await updateDoc(docRef, data);
    } catch (error) {
      console.error(`Error updating document in ${collectionName}:`, error);
      throw error;
    }
  }

  // Generic delete document
  async deleteDocument(collectionName, docId) {
    try {
      const docRef = doc(db, collectionName, docId);
      await deleteDoc(docRef);
    } catch (error) {
      console.error(`Error deleting document from ${collectionName}:`, error);
      throw error;
    }
  }

  // Tools management
  async getTools() {
    try {
      const toolsRef = collection(db, 'hou_tools');
      const snapshot = await getDocs(toolsRef);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error loading tools:', error);
      return [];
    }
  }

  // Generic get collection
  async getCollection(collectionName) {
    try {
      const collectionRef = collection(db, collectionName);
      const snapshot = await getDocs(collectionRef);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error(`Error getting collection ${collectionName}:`, error);
      throw error;
    }
  }
}

export default new FirebaseService();
