/**
 * Update user role in Firestore
 * Usage: node update-user-role.js <email> <role>
 * Example: node update-user-role.js jason.brannon@entrusted.com Manager
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function updateUserRole(email, newRole) {
  try {
    console.log(`Looking for user with email: ${email}...`);

    // Get user by email from Firebase Auth
    const userRecord = await admin.auth().getUserByEmail(email);
    const uid = userRecord.uid;

    console.log(`Found user: ${userRecord.displayName || email}`);
    console.log(`UID: ${uid}`);

    // Get current user data from Firestore
    const userDoc = await db.collection('users').doc(uid).get();

    if (!userDoc.exists) {
      console.log('User document does not exist in Firestore. Creating...');

      // Create user document
      await db.collection('users').doc(uid).set({
        email: email,
        username: userRecord.displayName || email,
        name: userRecord.displayName || email,
        role: newRole,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`✅ Created user document with role: ${newRole}`);
    } else {
      const currentData = userDoc.data();
      console.log(`Current role: ${currentData.role || 'Not set'}`);

      // Update role
      await db.collection('users').doc(uid).update({
        role: newRole,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`✅ Updated role from "${currentData.role || 'Not set'}" to "${newRole}"`);
    }

    console.log('\nDone! The user can now access admin features.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Get command line arguments
const email = process.argv[2];
const role = process.argv[3] || 'Manager';

if (!email) {
  console.error('Usage: node update-user-role.js <email> [role]');
  console.error('Example: node update-user-role.js jason.brannon@entrusted.com Manager');
  process.exit(1);
}

updateUserRole(email, role);
