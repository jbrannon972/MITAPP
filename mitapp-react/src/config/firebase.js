import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getMessaging, isSupported } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: "AIzaSyBEKOGT7S8rn3NKBNysT352GFGPt9GYf8E",
  authDomain: "mit-foreasting.firebaseapp.com",
  projectId: "mit-foreasting",
  storageBucket: "mit-foreasting.firebasestorage.app",
  messagingSenderId: "1069061948061",
  appId: "1:1069061948061:web:c657b4dfb344cb7b924a74",
  measurementId: "G-Z9ZE012Y2C"
};

// Google Calendar API Configuration
// To update: Go to Google Cloud Console > Credentials > OAuth 2.0 Client IDs
export const GOOGLE_CLIENT_ID = '1069061948061-roq457in5ig4hnbd1hq8pt4n5jkl0if6.apps.googleusercontent.com';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Initialize Firebase Cloud Messaging
let messaging = null;
export const getMessagingInstance = async () => {
  if (messaging) return messaging;
  const supported = await isSupported();
  if (supported) {
    messaging = getMessaging(app);
  }
  return messaging;
};

export default app;
