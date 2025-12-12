/**
 * Verify user email in Firebase Auth
 * Usage: node verify-user-email.js <email>
 * Example: node verify-user-email.js derek.pool@entrusted.com
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function verifyUserEmail(email) {
  try {
    console.log(`Looking for user with email: ${email}...`);

    // Get user by email from Firebase Auth
    const userRecord = await admin.auth().getUserByEmail(email);

    console.log(`Found user: ${userRecord.displayName || email}`);
    console.log(`UID: ${userRecord.uid}`);
    console.log(`Current emailVerified status: ${userRecord.emailVerified}`);

    if (userRecord.emailVerified) {
      console.log('✅ Email is already verified!');
      process.exit(0);
    }

    // Update user to verify email
    await admin.auth().updateUser(userRecord.uid, {
      emailVerified: true
    });

    console.log(`✅ Successfully verified email for ${email}`);
    console.log('\nThe user can now login with:');
    console.log(`  Email: ${email}`);
    console.log(`  Password: Mitigation1`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Get command line argument
const email = process.argv[2];

if (!email) {
  console.error('Usage: node verify-user-email.js <email>');
  console.error('Example: node verify-user-email.js derek.pool@entrusted.com');
  process.exit(1);
}

verifyUserEmail(email);
