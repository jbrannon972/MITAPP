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

      // Check permissions
      if (!staffMember || !staffMember.role || staffMember.role === 'Tech' || staffMember.role === 'Warehouse') {
        await signOut(auth);
        localStorage.removeItem('loggedInUser');
        throw new Error('This account does not have access to the Supervisor tool.');
      }

      // Create user session data
      const sessionData = {
        email: user.email,
        uid: user.uid,
        role: staffMember.role,
        username: staffMember.name,
        userId: staffMember.id
      };

      localStorage.setItem('loggedInUser', JSON.stringify(sessionData));
      setCurrentUser(sessionData);

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
        // Try to get user from localStorage first
        const localUser = localStorage.getItem('loggedInUser');
        if (localUser) {
          setCurrentUser(JSON.parse(localUser));
        } else {
          // Fetch staff member data
          const staffMember = await getStaffMemberFromStaffingData(user.email);
          if (staffMember && staffMember.role && staffMember.role !== 'Tech' && staffMember.role !== 'Warehouse') {
            const sessionData = {
              email: user.email,
              uid: user.uid,
              role: staffMember.role,
              username: staffMember.name,
              userId: staffMember.id
            };
            localStorage.setItem('loggedInUser', JSON.stringify(sessionData));
            setCurrentUser(sessionData);
          } else {
            setCurrentUser(null);
          }
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
    error
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
