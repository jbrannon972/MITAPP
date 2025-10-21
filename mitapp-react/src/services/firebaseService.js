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

  // Fleet management
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
