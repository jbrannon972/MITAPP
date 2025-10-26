import { createContext, useContext, useState, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from 'firebase/auth';
import { auth } from '../config/firebase';
import firebaseService from '../services/firebaseService';
import notificationService from '../services/notificationService';

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notificationPermission, setNotificationPermission] = useState('default');

  // Initialize notifications for user
  const initializeNotifications = async (user) => {
    try {
      // Initialize notification service
      const initialized = await notificationService.initialize();
      if (!initialized) {
        console.warn('Notification service not available');
        return;
      }

      // Setup foreground message listener
      notificationService.setupForegroundListener();

      // Check if we should request permission
      const permission = notificationService.getPermissionStatus();
      setNotificationPermission(permission);

      if (permission === 'granted') {
        // Get and save FCM token
        await notificationService.getAndSaveFCMToken(user.userId);

        // Setup role-based notifications
        notificationService.setupRoleBasedNotifications(user.role);
      }
    } catch (error) {
      console.error('Error initializing notifications:', error);
    }
  };

  // Request notification permission
  const requestNotificationPermission = async () => {
    try {
      const granted = await notificationService.requestPermission();
      const permission = notificationService.getPermissionStatus();
      setNotificationPermission(permission);

      if (granted && currentUser) {
        // Get and save FCM token
        await notificationService.getAndSaveFCMToken(currentUser.userId);

        // Setup role-based notifications
        notificationService.setupRoleBasedNotifications(currentUser.role);
      }

      return granted;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  };

  // Get staff member from staffing data
  const getStaffMemberFromStaffingData = async (email) => {
    try {
      const staffingData = await firebaseService.loadStaffingData();
      if (!staffingData) {
        console.warn('Staffing data not found in Firestore.');
        return null;
      }

      const allStaff = [
        ...(staffingData.management || []),
        ...((staffingData.zones || []).flatMap(z => [z.lead, ...z.members])),
        ...(staffingData.warehouseStaff || [])
      ].filter(Boolean);

      const formattedEmail = email.toLowerCase();

      const staffMember = allStaff.find(s => {
        if (s.email) {
          return s.email.toLowerCase() === formattedEmail;
        }
        if (!s.name) return false;
        const generatedEmail = s.name.toLowerCase().replace(/\s+/g, '.') + '@entrusted.com';
        return generatedEmail === formattedEmail;
      });

      return staffMember || null;
    } catch (error) {
      console.error('Error fetching staff member from staffing data:', error);
      return null;
    }
  };

  // Login function
  const login = async (email, password, rememberMe = true) => {
    try {
      setError(null);

      // Set persistence based on remember me (default to LOCAL to keep users logged in)
      const persistence = rememberMe ? browserLocalPersistence : browserSessionPersistence;
      await setPersistence(auth, persistence);

      // Sign in
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Get staff member data
      const staffMember = await getStaffMemberFromStaffingData(user.email);

      // Check if user exists in staffing data
      if (!staffMember || !staffMember.role) {
        await signOut(auth);
        localStorage.removeItem('loggedInUser');
        throw new Error('No staff record found for this account.');
      }

      // Create user session data for ALL roles (Tech, Warehouse, and Supervisors)
      const sessionData = {
        email: user.email,
        uid: user.uid,
        role: staffMember.role,
        username: staffMember.name,
        userId: staffMember.id
      };

      localStorage.setItem('loggedInUser', JSON.stringify(sessionData));
      setCurrentUser(sessionData);

      // Initialize notifications only for supervisor roles
      if (staffMember.role !== 'Tech' && staffMember.role !== 'MIT Tech' &&
          staffMember.role !== 'Demo Tech' && staffMember.role !== 'Warehouse') {
        await initializeNotifications(sessionData);
      }

      return sessionData;
    } catch (error) {
      const errorMessage = getFriendlyErrorMessage(error);
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  // Logout function
  const logout = async () => {
    try {
      // Cancel all scheduled notifications
      notificationService.cancelAllNotifications();

      await signOut(auth);
      localStorage.removeItem('loggedInUser');
      setCurrentUser(null);
    } catch (error) {
      console.error('Logout Error:', error);
      throw error;
    }
  };

  // Reset password function
  const resetPassword = async (email) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      const errorMessage = getFriendlyErrorMessage(error);
      throw new Error(errorMessage);
    }
  };

  // Get friendly error message
  const getFriendlyErrorMessage = (error) => {
    if (error.message && !error.code) return error.message;

    switch (error.code) {
      case 'auth/email-already-in-use':
        return 'This email address is already in use by another account.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/weak-password':
        return 'Password should be at least 6 characters.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Invalid email or password.';
      case 'auth/too-many-requests':
        return 'Access to this account has been temporarily disabled due to many failed login attempts.';
      default:
        return 'An unexpected error occurred. Please try again.';
    }
  };

  // Check auth state on mount
  useEffect(() => {
    // Set default persistence to LOCAL to keep users logged in
    setPersistence(auth, browserLocalPersistence).catch((error) => {
      console.error('Error setting persistence:', error);
    });

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // SECURITY FIX: Always re-validate user role from staffing data
        // Never blindly trust localStorage as it could be outdated or tampered with
        const staffMember = await getStaffMemberFromStaffingData(user.email);

        if (staffMember && staffMember.role) {
          // Create session data for ALL users (including Tech and Warehouse)
          const sessionData = {
            email: user.email,
            uid: user.uid,
            role: staffMember.role,
            username: staffMember.name,
            userId: staffMember.id
          };
          localStorage.setItem('loggedInUser', JSON.stringify(sessionData));
          setCurrentUser(sessionData);

          // Initialize notifications only for supervisor roles
          if (staffMember.role !== 'Tech' && staffMember.role !== 'Warehouse') {
            await initializeNotifications(sessionData);
          }
        } else {
          // No valid staff member found
          setCurrentUser(null);
          localStorage.removeItem('loggedInUser');
        }
      } else {
        setCurrentUser(null);
        localStorage.removeItem('loggedInUser');
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    login,
    logout,
    resetPassword,
    loading,
    error,
    notificationPermission,
    requestNotificationPermission
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
