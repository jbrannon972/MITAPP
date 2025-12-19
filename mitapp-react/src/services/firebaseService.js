import { db, functions, auth } from '../config/firebase';
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
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

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

  /**
   * Remove undefined values from an object (Firebase doesn't allow undefined)
   * @param {any} obj - Object to clean
   * @returns {any} Cleaned object without undefined values
   */
  removeUndefined(obj) {
    if (obj === null || obj === undefined) {
      return null;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.removeUndefined(item));
    }

    if (typeof obj === 'object' && obj !== null) {
      const cleaned = {};
      Object.keys(obj).forEach(key => {
        const value = obj[key];
        if (value !== undefined) {
          cleaned[key] = this.removeUndefined(value);
        }
      });
      return cleaned;
    }

    return obj;
  }

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

  // Schedule management (synced with Tech App/JS/firebase-service.js)
  async getScheduleDataForMonth(year, month) {
    const schedulesMap = { specific: {} };
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);

    console.log(`📅 Loading schedules for ${year}-${month + 1} (${firstDayOfMonth.toDateString()} to ${lastDayOfMonth.toDateString()})`);

    try {
      const schedulesRef = collection(db, 'hou_schedules');
      const snapshot = await getDocs(schedulesRef);

      console.log(`📄 Found ${snapshot.size} total schedule documents`);

      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.date) {
          // Handle both Timestamp and Date objects
          let dateObj;
          if (data.date.toDate) {
            dateObj = data.date.toDate();
          } else if (data.date instanceof Date) {
            dateObj = data.date;
          } else {
            dateObj = new Date(data.date);
          }

          // Only include dates in the requested month range
          if (dateObj >= firstDayOfMonth && dateObj <= lastDayOfMonth) {
            const dayOfMonth = dateObj.getDate();
            schedulesMap.specific[dayOfMonth] = data;
            console.log(`  ✅ Day ${dayOfMonth}: ${data.staff?.length || 0} staff overrides, notes: ${data.notes ? 'Yes' : 'No'}`);
          }
        }
      });

      console.log(`📦 Total days with schedules in this month: ${Object.keys(schedulesMap.specific).length}`);
    } catch (error) {
      console.error('Error fetching specific schedule data for month:', error);
    }
    return schedulesMap;
  }

  async saveSchedule(scheduleData) {
    try {
      // Convert to JS Date if it's a Timestamp, otherwise use as-is
      const date = scheduleData.date.toDate ? scheduleData.date.toDate() : new Date(scheduleData.date);

      // Use date-based document ID (YYYY-MM-DD) - EXACTLY like vanilla JS
      const docId = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const docRef = doc(db, 'hou_schedules', docId);

      console.log('💾 SAVE SCHEDULE - Matching vanilla JS behavior exactly');
      console.log(`  📅 Document ID: ${docId}`);
      console.log(`  📆 Date: ${date.toDateString()}`);
      console.log(`  👥 Staff array length: ${scheduleData.staff?.length || 0}`);
      if (scheduleData.staff && scheduleData.staff.length > 0) {
        scheduleData.staff.forEach(s => {
          console.log(`    - ${s.id}: status=${s.status}, hours=${s.hours || 'none'}`);
        });
      }
      console.log(`  📝 Notes: "${scheduleData.notes || ''}"`);

      // Build the payload EXACTLY like vanilla JS does
      // Vanilla JS saves: { date: Timestamp, staff: [...], notes: "..." }
      const payload = {
        date: Timestamp.fromDate(date),  // Convert JS Date to Firestore Timestamp
        staff: scheduleData.staff || [],  // Always include staff array
        notes: scheduleData.notes || ''   // Always include notes
      };

      console.log('  📦 Payload to save:', JSON.stringify(payload, (key, value) => {
        // Custom replacer to handle Timestamp objects for logging
        if (value && typeof value === 'object' && value.seconds !== undefined) {
          return `Timestamp(${new Date(value.seconds * 1000).toISOString()})`;
        }
        return value;
      }, 2));

      // Save with merge: true - EXACTLY like vanilla JS
      await setDoc(docRef, payload, { merge: true });

      console.log(`✅ Schedule saved successfully to hou_schedules/${docId}`);
    } catch (error) {
      console.error('❌ Error saving schedule:', error);
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
      // Use composite key: date_submittedBy to allow multiple reports per date
      const reportId = `${dateString}_${data.submittedBy.replace(/\s+/g, '_')}`;
      const docRef = doc(db, 'second_shift_reports', reportId);
      await setDoc(docRef, data);
    } catch (error) {
      console.error('Error saving second shift report:', error);
      throw error;
    }
  }

  async getAllSecondShiftReportsByDate(dateString) {
    try {
      const reportsRef = collection(db, 'second_shift_reports');
      const q = query(reportsRef, where('date', '==', dateString));
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error getting all second shift reports:', error);
      return [];
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

  async saveRecurringRules(techId, rules) {
    try {
      const docRef = doc(db, 'hou_recurring_rules', techId);
      await setDoc(docRef, {
        rules: rules,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error saving recurring rules:', error);
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
      // Clean undefined values before saving (Firebase doesn't allow them)
      const cleanedData = this.removeUndefined(data);
      await setDoc(docRef, cleanedData);
    } catch (error) {
      console.error(`Error saving document to ${collectionName}:`, error);
      throw error;
    }
  }

  // Generic update document
  async updateDocument(collectionName, docId, data) {
    try {
      const docRef = doc(db, collectionName, docId);
      // Clean undefined values before updating (Firebase doesn't allow them)
      const cleanedData = this.removeUndefined(data);
      await updateDoc(docRef, cleanedData);
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

  // Tool requests management
  async getToolRequests(status) {
    try {
      const requestsRef = collection(db, 'hou_tool_requests');
      const q = query(
        requestsRef,
        where('status', '==', status),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error loading tool requests:', error);
      return [];
    }
  }

  async updateToolRequestStatus(requestId, status) {
    try {
      const docRef = doc(db, 'hou_tool_requests', requestId);
      await updateDoc(docRef, {
        status: status,
        completedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating tool request status:', error);
      throw error;
    }
  }

  async createToolRequest(requestData) {
    try {
      const requestsRef = collection(db, 'hou_tool_requests');
      const docRef = doc(requestsRef);
      await setDoc(docRef, {
        ...requestData,
        createdAt: serverTimestamp()
      });
      return docRef.id;
    } catch (error) {
      console.error('Error creating tool request:', error);
      throw error;
    }
  }

  async createBatchToolRequests(requestsArray) {
    try {
      const promises = requestsArray.map(requestData =>
        this.createToolRequest(requestData)
      );
      await Promise.all(promises);
    } catch (error) {
      console.error('Error creating batch tool requests:', error);
      throw error;
    }
  }

  async getAllToolRequests() {
    try {
      const requestsRef = collection(db, 'hou_tool_requests');
      const q = query(requestsRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error loading all tool requests:', error);
      return [];
    }
  }

  async deleteToolRequest(requestId) {
    try {
      const docRef = doc(db, 'hou_tool_requests', requestId);
      await deleteDoc(docRef);
    } catch (error) {
      console.error('Error deleting tool request:', error);
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

  // Get daily stats (from job analyzer)
  async getDailyStats(dateString) {
    try {
      const docRef = doc(db, 'analyzer_daily_stats', dateString);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? docSnap.data() : null;
    } catch (error) {
      console.error('Error getting daily stats:', error);
      return null;
    }
  }

  // Load damage reports
  async loadDamageReports() {
    try {
      const collectionRef = collection(db, 'hou_damages');
      const snapshot = await getDocs(collectionRef);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error loading damage reports:', error);
      return [];
    }
  }

  // Get latest evaluation for a technician
  async getLatestEvaluation(technicianId) {
    try {
      const collectionRef = collection(db, 'technician-evaluations');
      const q = query(
        collectionRef,
        where('technicianId', '==', technicianId),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
      }
      return null;
    } catch (error) {
      console.error('Error getting latest evaluation:', error);
      return null;
    }
  }

  // Get all technicians with IDs
  async getAllTechnicians() {
    try {
      const docRef = doc(db, this.collections.settings, 'staffing_data');
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) return [];

      const data = docSnap.data();
      const techs = [];

      // Get from zones
      if (data.zones) {
        data.zones.forEach(zone => {
          if (zone.lead) techs.push({ ...zone.lead, zoneName: zone.name });
          if (zone.members) {
            zone.members.forEach(member => techs.push({ ...member, zoneName: zone.name }));
          }
        });
      }

      return techs;
    } catch (error) {
      console.error('Error getting all technicians:', error);
      return [];
    }
  }

  // ========== REAL-TIME COLLABORATION FEATURES ==========

  /**
   * Subscribe to real-time updates for a document
   * @param {string} collectionName - Collection name
   * @param {string} docId - Document ID
   * @param {function} callback - Callback function(data)
   * @param {function} onError - Optional error callback
   * @returns {function} Unsubscribe function
   */
  subscribeToDocument(collectionName, docId, callback, onError = null) {
    const docRef = doc(db, collectionName, docId);

    return onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        callback({ id: snapshot.id, ...snapshot.data() });
      } else {
        callback(null);
      }
    }, (error) => {
      console.error(`❌ Firestore listener error for ${collectionName}/${docId}:`, error);
      console.error(`Error code: ${error.code}, Message: ${error.message}`);

      // Call custom error handler if provided
      if (onError) {
        onError(error);
      }
    });
  }

  /**
   * Set user presence (active users viewing a specific resource)
   * @param {string} resourceType - Type of resource (e.g., 'routing')
   * @param {string} resourceId - Resource identifier (e.g., 'routes_2025-01-15')
   * @param {object} user - User info { id, name, email }
   */
  async setPresence(resourceType, resourceId, user) {
    try {
      const presenceRef = doc(db, 'presence', `${resourceType}_${resourceId}_${user.id}`);
      await setDoc(presenceRef, {
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        resourceType,
        resourceId,
        lastSeen: serverTimestamp(),
        active: true
      });
    } catch (error) {
      console.error('Error setting presence:', error);
    }
  }

  /**
   * Remove user presence
   * @param {string} resourceType - Type of resource
   * @param {string} resourceId - Resource identifier
   * @param {string} userId - User ID
   */
  async removePresence(resourceType, resourceId, userId) {
    try {
      const presenceRef = doc(db, 'presence', `${resourceType}_${resourceId}_${userId}`);
      await deleteDoc(presenceRef);
    } catch (error) {
      console.error('Error removing presence:', error);
    }
  }

  /**
   * Subscribe to presence updates for a resource
   * @param {string} resourceType - Type of resource
   * @param {string} resourceId - Resource identifier
   * @param {function} callback - Callback function(users[])
   * @param {function} onError - Optional error callback
   * @returns {function} Unsubscribe function
   */
  subscribeToPresence(resourceType, resourceId, callback, onError = null) {
    const presenceQuery = query(
      collection(db, 'presence'),
      where('resourceType', '==', resourceType),
      where('resourceId', '==', resourceId),
      where('active', '==', true)
    );

    return onSnapshot(presenceQuery, (snapshot) => {
      const users = snapshot.docs.map(doc => doc.data());
      callback(users);
    }, (error) => {
      console.error('❌ Firestore presence listener error:', error);
      console.error(`Error code: ${error.code}, Message: ${error.message}`);

      // Call custom error handler if provided
      if (onError) {
        onError(error);
      }
    });
  }

  /**
   * Update last modified info for conflict detection
   * @param {string} collectionName - Collection name
   * @param {string} docId - Document ID
   * @param {object} user - User info
   * @param {object} data - Data to save
   */
  async saveWithMetadata(collectionName, docId, data, user) {
    try {
      const docRef = doc(db, collectionName, docId);

      // Clean undefined values before saving (Firebase doesn't allow them)
      const cleanedData = this.removeUndefined({
        ...data,
        lastModifiedBy: user.name || 'Unknown',
        lastModifiedAt: serverTimestamp()
      });

      await setDoc(docRef, cleanedData);
    } catch (error) {
      console.error(`Error saving document with metadata to ${collectionName}:`, error);
      throw error;
    }
  }

  /**
   * Create user accounts for technicians without auth accounts
   * Uses HTTP endpoint with CORS support for cross-origin requests
   * @param {Array} techsToCreate - Array of tech objects with name, email, role, zoneName
   * @returns {Promise<Object>} Results with created and errors arrays
   */
  async createTechAccounts(techsToCreate) {
    try {
      // Get current user's ID token for authentication
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('User must be logged in to create accounts');
      }

      const idToken = await currentUser.getIdToken();

      // Use HTTP endpoint with CORS support instead of callable function
      const response = await fetch(
        'https://us-central1-mit-foreasting.cloudfunctions.net/createTechAccountsHttp',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({ techsToCreate })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error calling createTechAccounts function:', error);
      throw error;
    }
  }

  /**
   * List all Firebase Auth user emails
   * Used to check which techs already have accounts
   * @returns {Promise<Set>} Set of email addresses (lowercase) that have accounts
   */
  async listAuthUserEmails() {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('User must be logged in');
      }

      const idToken = await currentUser.getIdToken();

      const response = await fetch(
        'https://us-central1-mit-foreasting.cloudfunctions.net/listAuthUsersHttp',
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${idToken}`
          }
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log(`Retrieved ${result.count} existing auth user emails`);

      // Return as a Set for easy lookup
      return new Set(result.emails);
    } catch (error) {
      console.error('Error listing auth users:', error);
      throw error;
    }
  }

  // ==================== STORM MODE FUNCTIONS ====================

  /**
   * Load Storm Mode data for a specific date
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Object>} Storm Mode data including all staff categories
   */
  async loadStormModeData(date) {
    try {
      const docRef = doc(db, 'hou_storm_mode', date);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        return docSnap.data();
      }

      // Return default empty structure
      return {
        active: false,
        lastUpdated: null,
        projectManagers: [],
        ehqLeaders: [],
        ehqCSStaff: [],
        subContractors: []
      };
    } catch (error) {
      console.error('Error loading Storm Mode data:', error);
      throw error;
    }
  }

  /**
   * Save Storm Mode data for a specific date
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {Object} data - Storm Mode data
   */
  async saveStormModeData(date, data) {
    try {
      const docRef = doc(db, 'hou_storm_mode', date);
      const cleanedData = this.removeUndefined({
        ...data,
        lastUpdated: serverTimestamp()
      });
      await setDoc(docRef, cleanedData);
    } catch (error) {
      console.error('Error saving Storm Mode data:', error);
      throw error;
    }
  }

  /**
   * Add a Project Manager to Storm Mode
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {Object} pm - Project Manager object
   */
  async addProjectManager(date, pm) {
    try {
      const stormData = await this.loadStormModeData(date);
      const newPM = {
        id: `pm_${Date.now()}`,
        name: pm.name,
        startingLocation: pm.startingLocation || 'office_1',
        capabilities: {
          install: pm.capabilities?.install ?? true,
          sub: pm.capabilities?.sub ?? true,
          cs: pm.capabilities?.cs ?? true,
          pull: pm.capabilities?.pull ?? true
        },
        status: 'available',
        assignedToSub: null,
        email: pm.email || '',
        phone: pm.phone || ''
      };

      stormData.projectManagers.push(newPM);
      await this.saveStormModeData(date, stormData);
      return newPM;
    } catch (error) {
      console.error('Error adding Project Manager:', error);
      throw error;
    }
  }

  /**
   * Update a Project Manager
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} pmId - Project Manager ID
   * @param {Object} updates - Fields to update
   */
  async updateProjectManager(date, pmId, updates) {
    try {
      const stormData = await this.loadStormModeData(date);
      const index = stormData.projectManagers.findIndex(pm => pm.id === pmId);

      if (index !== -1) {
        stormData.projectManagers[index] = {
          ...stormData.projectManagers[index],
          ...updates
        };
        await this.saveStormModeData(date, stormData);
      }
    } catch (error) {
      console.error('Error updating Project Manager:', error);
      throw error;
    }
  }

  /**
   * Delete a Project Manager
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} pmId - Project Manager ID
   */
  async deleteProjectManager(date, pmId) {
    try {
      const stormData = await this.loadStormModeData(date);
      stormData.projectManagers = stormData.projectManagers.filter(pm => pm.id !== pmId);
      await this.saveStormModeData(date, stormData);
    } catch (error) {
      console.error('Error deleting Project Manager:', error);
      throw error;
    }
  }

  /**
   * Add an EHQ Leader to Storm Mode
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {Object} leader - EHQ Leader object
   */
  async addEHQLeader(date, leader) {
    try {
      const stormData = await this.loadStormModeData(date);
      const newLeader = {
        id: `ehq_${Date.now()}`,
        name: leader.name,
        startingLocation: leader.startingLocation || 'office_1',
        capabilities: {
          install: leader.capabilities?.install ?? true,
          sub: leader.capabilities?.sub ?? true,
          cs: leader.capabilities?.cs ?? true,
          pull: leader.capabilities?.pull ?? false
        },
        status: 'available',
        assignedToSub: null,
        email: leader.email || '',
        phone: leader.phone || ''
      };

      stormData.ehqLeaders.push(newLeader);
      await this.saveStormModeData(date, stormData);
      return newLeader;
    } catch (error) {
      console.error('Error adding EHQ Leader:', error);
      throw error;
    }
  }

  /**
   * Update an EHQ Leader
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} leaderId - EHQ Leader ID
   * @param {Object} updates - Fields to update
   */
  async updateEHQLeader(date, leaderId, updates) {
    try {
      const stormData = await this.loadStormModeData(date);
      const index = stormData.ehqLeaders.findIndex(l => l.id === leaderId);

      if (index !== -1) {
        stormData.ehqLeaders[index] = {
          ...stormData.ehqLeaders[index],
          ...updates
        };
        await this.saveStormModeData(date, stormData);
      }
    } catch (error) {
      console.error('Error updating EHQ Leader:', error);
      throw error;
    }
  }

  /**
   * Delete an EHQ Leader
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} leaderId - EHQ Leader ID
   */
  async deleteEHQLeader(date, leaderId) {
    try {
      const stormData = await this.loadStormModeData(date);
      stormData.ehqLeaders = stormData.ehqLeaders.filter(l => l.id !== leaderId);
      await this.saveStormModeData(date, stormData);
    } catch (error) {
      console.error('Error deleting EHQ Leader:', error);
      throw error;
    }
  }

  /**
   * Add an EHQ CS Staff member to Storm Mode
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {Object} staff - EHQ CS Staff object
   */
  async addEHQCSStaff(date, staff) {
    try {
      const stormData = await this.loadStormModeData(date);
      const newStaff = {
        id: `cs_${Date.now()}`,
        name: staff.name,
        startingLocation: staff.startingLocation || 'office_1',
        capabilities: {
          install: staff.capabilities?.install ?? false,
          sub: staff.capabilities?.sub ?? false,
          cs: true, // Always true for CS staff
          pull: staff.capabilities?.pull ?? false
        },
        status: 'available',
        email: staff.email || '',
        phone: staff.phone || ''
      };

      stormData.ehqCSStaff.push(newStaff);
      await this.saveStormModeData(date, stormData);
      return newStaff;
    } catch (error) {
      console.error('Error adding EHQ CS Staff:', error);
      throw error;
    }
  }

  /**
   * Update an EHQ CS Staff member
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} staffId - EHQ CS Staff ID
   * @param {Object} updates - Fields to update
   */
  async updateEHQCSStaff(date, staffId, updates) {
    try {
      const stormData = await this.loadStormModeData(date);
      const index = stormData.ehqCSStaff.findIndex(s => s.id === staffId);

      if (index !== -1) {
        // Ensure CS capability always stays true
        if (updates.capabilities) {
          updates.capabilities.cs = true;
        }
        stormData.ehqCSStaff[index] = {
          ...stormData.ehqCSStaff[index],
          ...updates
        };
        await this.saveStormModeData(date, stormData);
      }
    } catch (error) {
      console.error('Error updating EHQ CS Staff:', error);
      throw error;
    }
  }

  /**
   * Delete an EHQ CS Staff member
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} staffId - EHQ CS Staff ID
   */
  async deleteEHQCSStaff(date, staffId) {
    try {
      const stormData = await this.loadStormModeData(date);
      stormData.ehqCSStaff = stormData.ehqCSStaff.filter(s => s.id !== staffId);
      await this.saveStormModeData(date, stormData);
    } catch (error) {
      console.error('Error deleting EHQ CS Staff:', error);
      throw error;
    }
  }

  /**
   * Add a Sub Contractor to Storm Mode
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {Object} sub - Sub Contractor object
   */
  async addSubContractor(date, sub) {
    try {
      const stormData = await this.loadStormModeData(date);
      const newSub = {
        id: `sub_${Date.now()}`,
        name: sub.name,
        quantity: sub.quantity || 1,
        assignedStarter: null,
        starterStatus: 'needed',
        contactName: sub.contactName || '',
        contactPhone: sub.contactPhone || ''
      };

      stormData.subContractors.push(newSub);
      await this.saveStormModeData(date, stormData);
      return newSub;
    } catch (error) {
      console.error('Error adding Sub Contractor:', error);
      throw error;
    }
  }

  /**
   * Update a Sub Contractor
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} subId - Sub Contractor ID
   * @param {Object} updates - Fields to update
   */
  async updateSubContractor(date, subId, updates) {
    try {
      const stormData = await this.loadStormModeData(date);
      const index = stormData.subContractors.findIndex(s => s.id === subId);

      if (index !== -1) {
        stormData.subContractors[index] = {
          ...stormData.subContractors[index],
          ...updates
        };
        await this.saveStormModeData(date, stormData);
      }
    } catch (error) {
      console.error('Error updating Sub Contractor:', error);
      throw error;
    }
  }

  /**
   * Delete a Sub Contractor
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} subId - Sub Contractor ID
   */
  async deleteSubContractor(date, subId) {
    try {
      const stormData = await this.loadStormModeData(date);
      stormData.subContractors = stormData.subContractors.filter(s => s.id !== subId);
      await this.saveStormModeData(date, stormData);
    } catch (error) {
      console.error('Error deleting Sub Contractor:', error);
      throw error;
    }
  }

  /**
   * Assign a starter to a sub contractor
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} subId - Sub Contractor ID
   * @param {string} starterId - Starter ID (PM or EHQ Leader)
   * @param {string} starterType - 'projectManager' or 'ehqLeader'
   */
  async assignStarter(date, subId, starterId, starterType) {
    try {
      const stormData = await this.loadStormModeData(date);

      // Update sub contractor
      const subIndex = stormData.subContractors.findIndex(s => s.id === subId);
      if (subIndex !== -1) {
        stormData.subContractors[subIndex].assignedStarter = starterId;
        stormData.subContractors[subIndex].starterStatus = 'assigned';
      }

      // Update starter's assignedToSub field
      if (starterType === 'projectManager') {
        const pmIndex = stormData.projectManagers.findIndex(pm => pm.id === starterId);
        if (pmIndex !== -1) {
          stormData.projectManagers[pmIndex].assignedToSub = subId;
          stormData.projectManagers[pmIndex].status = 'assigned';
        }
      } else if (starterType === 'ehqLeader') {
        const leaderIndex = stormData.ehqLeaders.findIndex(l => l.id === starterId);
        if (leaderIndex !== -1) {
          stormData.ehqLeaders[leaderIndex].assignedToSub = subId;
          stormData.ehqLeaders[leaderIndex].status = 'assigned';
        }
      }

      await this.saveStormModeData(date, stormData);
    } catch (error) {
      console.error('Error assigning starter:', error);
      throw error;
    }
  }

  /**
   * Remove starter assignment from a sub contractor
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} subId - Sub Contractor ID
   */
  async removeStarter(date, subId) {
    try {
      const stormData = await this.loadStormModeData(date);

      // Find the sub contractor
      const sub = stormData.subContractors.find(s => s.id === subId);
      if (!sub || !sub.assignedStarter) return;

      const starterId = sub.assignedStarter;

      // Clear sub contractor's starter
      const subIndex = stormData.subContractors.findIndex(s => s.id === subId);
      if (subIndex !== -1) {
        stormData.subContractors[subIndex].assignedStarter = null;
        stormData.subContractors[subIndex].starterStatus = 'needed';
      }

      // Clear starter's assignedToSub field
      const pmIndex = stormData.projectManagers.findIndex(pm => pm.id === starterId);
      if (pmIndex !== -1) {
        stormData.projectManagers[pmIndex].assignedToSub = null;
        stormData.projectManagers[pmIndex].status = 'available';
      } else {
        const leaderIndex = stormData.ehqLeaders.findIndex(l => l.id === starterId);
        if (leaderIndex !== -1) {
          stormData.ehqLeaders[leaderIndex].assignedToSub = null;
          stormData.ehqLeaders[leaderIndex].status = 'available';
        }
      }

      await this.saveStormModeData(date, stormData);
    } catch (error) {
      console.error('Error removing starter:', error);
      throw error;
    }
  }

  /**
   * Toggle Storm Mode active status
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {boolean} active - Active status
   */
  async setStormModeActive(date, active) {
    try {
      const stormData = await this.loadStormModeData(date);
      stormData.active = active;
      await this.saveStormModeData(date, stormData);
    } catch (error) {
      console.error('Error setting Storm Mode active status:', error);
      throw error;
    }
  }

  /**
   * Get all available starters (PM and EHQ Leaders not assigned to subs)
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Array>} Array of available starters
   */
  async getAvailableStarters(date) {
    try {
      const stormData = await this.loadStormModeData(date);

      const availablePMs = stormData.projectManagers
        .filter(pm => !pm.assignedToSub)
        .map(pm => ({ ...pm, type: 'projectManager', label: `${pm.name} (PM)` }));

      const availableLeaders = stormData.ehqLeaders
        .filter(l => !l.assignedToSub)
        .map(l => ({ ...l, type: 'ehqLeader', label: `${l.name} (EHQ Leader)` }));

      return [...availablePMs, ...availableLeaders];
    } catch (error) {
      console.error('Error getting available starters:', error);
      throw error;
    }
  }
}

export default new FirebaseService();
