import { getMessagingInstance } from '../config/firebase';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

class NotificationService {
  constructor() {
    this.messaging = null;
    this.currentToken = null;
    this.scheduledNotifications = new Map();
  }

  /**
   * Initialize the notification service
   */
  async initialize() {
    try {
      this.messaging = await getMessagingInstance();
      if (!this.messaging) {
        console.warn('Firebase Messaging not supported in this browser');
        return false;
      }
      return true;
    } catch (error) {
      console.error('Error initializing notification service:', error);
      return false;
    }
  }

  /**
   * Request notification permission from the user
   */
  async requestPermission() {
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        console.log('Notification permission granted.');
        return true;
      } else {
        console.log('Notification permission denied.');
        return false;
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }

  /**
   * Get FCM token and save it to Firestore
   */
  async getAndSaveFCMToken(userId) {
    try {
      if (!this.messaging) {
        await this.initialize();
      }

      if (!this.messaging) {
        console.warn('Cannot get FCM token - messaging not supported');
        return null;
      }

      // Get the FCM token
      const token = await getToken(this.messaging, {
        vapidKey: 'BAQf0xP8pus8aJn9l9-ZKrwbPa3AwEMFugSoPKGrhD6wvXvJKGNDbr1wxqA6bJS5_uW-ns-E7FdjtSAAe0GVBi4'
      });

      if (token) {
        this.currentToken = token;
        console.log('FCM Token:', token);

        // Save token to Firestore
        await setDoc(doc(db, 'fcm_tokens', userId), {
          token,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        return token;
      } else {
        console.log('No registration token available.');
        return null;
      }
    } catch (error) {
      console.error('Error getting FCM token:', error);
      return null;
    }
  }

  /**
   * Listen for foreground messages
   */
  setupForegroundListener() {
    if (!this.messaging) return;

    onMessage(this.messaging, (payload) => {
      console.log('Foreground message received:', payload);

      const notificationTitle = payload.notification?.title || 'Labor Tool Reminder';
      const notificationOptions = {
        body: payload.notification?.body || 'You have a pending task',
        icon: '/Elogo.png',
        tag: 'daily-report-reminder',
        requireInteraction: true
      };

      // Show notification even when app is in foreground
      if (Notification.permission === 'granted') {
        new Notification(notificationTitle, notificationOptions);
      }
    });
  }

  /**
   * Schedule daily notification for a specific time
   * @param {string} role - User role (e.g., 'MIT Lead', '2nd Shift Lead')
   * @param {string} time - Time in HH:MM format (e.g., '16:15' for 4:15 PM)
   * @param {string} message - Notification message
   */
  scheduleDailyNotification(role, time, message) {
    // Parse time
    const [hours, minutes] = time.split(':').map(Number);

    // Calculate next notification time
    const now = new Date();
    const scheduledTime = new Date();
    scheduledTime.setHours(hours, minutes, 0, 0);

    // If the time has passed today, schedule for tomorrow
    if (scheduledTime <= now) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }

    // Calculate delay
    const delay = scheduledTime - now;

    console.log(`Scheduling notification for ${role} at ${time} (in ${Math.round(delay / 1000 / 60)} minutes)`);

    // Clear existing timeout for this role if any
    if (this.scheduledNotifications.has(role)) {
      clearTimeout(this.scheduledNotifications.get(role));
    }

    // Schedule the notification
    const timeoutId = setTimeout(() => {
      this.showLocalNotification(message);
      // Reschedule for next day
      this.scheduleDailyNotification(role, time, message);
    }, delay);

    this.scheduledNotifications.set(role, timeoutId);
  }

  /**
   * Show a local notification
   */
  showLocalNotification(message) {
    if (Notification.permission === 'granted') {
      const notification = new Notification('Daily Report Reminder', {
        body: message,
        icon: '/Elogo.png',
        badge: '/Elogo.png',
        tag: 'daily-report-reminder',
        requireInteraction: true,
        vibrate: [200, 100, 200]
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    }
  }

  /**
   * Setup role-based notification schedules
   * @param {string} role - User role
   */
  setupRoleBasedNotifications(role) {
    // Clear all existing schedules
    this.scheduledNotifications.forEach((timeoutId) => clearTimeout(timeoutId));
    this.scheduledNotifications.clear();

    // Schedule based on role
    if (role === 'MIT Lead') {
      this.scheduleDailyNotification(
        role,
        '16:15', // 4:15 PM
        'Time to submit your daily MIT Lead report!'
      );
    } else if (role === 'Second Shift Lead') {
      this.scheduleDailyNotification(
        role,
        '21:45', // 9:45 PM
        'Time to submit your daily Second Shift report!'
      );
    }
  }

  /**
   * Cancel all scheduled notifications
   */
  cancelAllNotifications() {
    this.scheduledNotifications.forEach((timeoutId) => clearTimeout(timeoutId));
    this.scheduledNotifications.clear();
  }

  /**
   * Check if notifications are supported
   */
  isSupported() {
    return 'Notification' in window && 'serviceWorker' in navigator;
  }

  /**
   * Get current notification permission status
   */
  getPermissionStatus() {
    if (!this.isSupported()) return 'unsupported';
    return Notification.permission;
  }
}

export default new NotificationService();
