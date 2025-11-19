/**
 * Calendar Data Migration Script
 *
 * Purpose: Migrate React-format calendar data to Vanilla JS format
 * Ensures both calendar versions use the same data structure
 *
 * IMPORTANT: This script includes full backup and rollback capabilities
 * Run this ONCE to unify all calendar data
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin SDK
// YOU MUST PROVIDE YOUR SERVICE ACCOUNT KEY
const serviceAccount = require('../firebase-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Configuration
const BACKUP_DIR = path.join(__dirname, '../backups');
const COLLECTION_NAME = 'hou_schedules';
const DRY_RUN = process.argv.includes('--dry-run'); // Test mode - no writes
const BACKUP_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * Logger with timestamp and color coding
 */
const logger = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ${new Date().toISOString()} - ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`),
  error: (msg) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`),
  debug: (msg) => console.log(`[DEBUG] ${new Date().toISOString()} - ${msg}`)
};

/**
 * Backup all schedule data before migration
 */
async function backupScheduleData() {
  logger.info('Starting full backup of schedule data...');

  try {
    const snapshot = await db.collection(COLLECTION_NAME).get();
    const backupData = {
      timestamp: BACKUP_TIMESTAMP,
      collection: COLLECTION_NAME,
      documentCount: snapshot.size,
      documents: []
    };

    snapshot.forEach(doc => {
      backupData.documents.push({
        id: doc.id,
        data: doc.data(),
        createTime: doc.createTime?.toDate().toISOString(),
        updateTime: doc.updateTime?.toDate().toISOString()
      });
    });

    const backupFile = path.join(BACKUP_DIR, `${COLLECTION_NAME}_backup_${BACKUP_TIMESTAMP}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));

    logger.success(`Backup complete: ${backupData.documentCount} documents saved to ${backupFile}`);
    return backupData;
  } catch (error) {
    logger.error(`Backup failed: ${error.message}`);
    throw error;
  }
}

/**
 * Analyze data format and identify what needs migration
 */
function analyzeScheduleDocument(docId, data) {
  const analysis = {
    id: docId,
    format: 'unknown',
    issues: [],
    needsMigration: false
  };

  // Check document ID format
  const isDateStringId = /^\d{4}-\d{2}-\d{2}$/.test(docId);

  // Check date field
  const hasTimestampDate = data.date && data.date._seconds !== undefined;
  const hasStringDate = typeof data.date === 'string';
  const hasDateObject = data.date instanceof admin.firestore.Timestamp;

  // Determine format
  if (isDateStringId && !hasDateObject) {
    analysis.format = 'react';
    analysis.issues.push('Document ID is date string (React format)');
    analysis.needsMigration = true;
  } else if (hasDateObject || hasTimestampDate) {
    analysis.format = 'vanilla';
  }

  // Check for staff data structure
  if (data.staffList && !data.staff) {
    analysis.issues.push('Uses staffList instead of staff');
    analysis.needsMigration = true;
  }

  // Check for capitalized status values
  if (data.staff && Array.isArray(data.staff)) {
    const hasCapitalizedStatus = data.staff.some(s =>
      s.status && /^[A-Z]/.test(s.status)
    );
    if (hasCapitalizedStatus) {
      analysis.issues.push('Status values are capitalized (should be lowercase)');
      analysis.needsMigration = true;
    }
  }

  return analysis;
}

/**
 * Convert React format document to Vanilla format
 */
function convertToVanillaFormat(docId, data) {
  const converted = {
    ...data
  };

  // Parse date from document ID if needed
  if (/^\d{4}-\d{2}-\d{2}$/.test(docId)) {
    const [year, month, day] = docId.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    converted.date = admin.firestore.Timestamp.fromDate(date);
  }

  // Ensure date is a Timestamp
  if (typeof converted.date === 'string') {
    converted.date = admin.firestore.Timestamp.fromDate(new Date(converted.date));
  } else if (!converted.date) {
    // Try to parse from docId
    if (/^\d{4}-\d{2}-\d{2}$/.test(docId)) {
      const [year, month, day] = docId.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      converted.date = admin.firestore.Timestamp.fromDate(date);
    }
  }

  // Rename staffList to staff
  if (converted.staffList && !converted.staff) {
    converted.staff = converted.staffList;
    delete converted.staffList;
  }

  // Convert status values to lowercase
  if (converted.staff && Array.isArray(converted.staff)) {
    converted.staff = converted.staff.map(s => ({
      ...s,
      status: s.status ? s.status.toLowerCase() : 'off'
    }));
  }

  // Ensure staff array exists
  if (!converted.staff) {
    converted.staff = [];
  }

  // Ensure notes field exists
  if (!converted.notes) {
    converted.notes = '';
  }

  return converted;
}

/**
 * Generate a new document ID for migrated data
 */
function generateDocId(data) {
  const date = data.date.toDate();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  // Use auto-generated ID with timestamp to avoid conflicts
  return `${year}${month}${day}_${Date.now()}`;
}

/**
 * Main migration function
 */
async function migrateCalendarData() {
  logger.info('='.repeat(80));
  logger.info('CALENDAR DATA MIGRATION SCRIPT');
  logger.info('='.repeat(80));
  logger.info(`Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'LIVE (will modify data)'}`);
  logger.info('='.repeat(80));

  try {
    // Step 1: Backup
    const backup = await backupScheduleData();

    // Step 2: Analyze all documents
    logger.info('Analyzing schedule documents...');
    const snapshot = await db.collection(COLLECTION_NAME).get();

    const analyses = [];
    snapshot.forEach(doc => {
      const analysis = analyzeScheduleDocument(doc.id, doc.data());
      analyses.push(analysis);
    });

    const needsMigration = analyses.filter(a => a.needsMigration);
    const alreadyCorrect = analyses.filter(a => !a.needsMigration);

    logger.info(`Total documents: ${analyses.length}`);
    logger.info(`Already in correct format: ${alreadyCorrect.length}`);
    logger.warn(`Need migration: ${needsMigration.length}`);

    if (needsMigration.length === 0) {
      logger.success('No migration needed! All data is already in correct format.');
      return;
    }

    // Step 3: Show what will be migrated
    logger.info('\nDocuments that need migration:');
    needsMigration.forEach(doc => {
      logger.debug(`  - ${doc.id}: ${doc.issues.join(', ')}`);
    });

    if (DRY_RUN) {
      logger.warn('\n=== DRY RUN MODE - No changes will be made ===');
      logger.warn('Remove --dry-run flag to perform actual migration');
      return;
    }

    // Step 4: Confirm before proceeding
    logger.warn('\n' + '!'.repeat(80));
    logger.warn('ABOUT TO MODIFY PRODUCTION DATA');
    logger.warn('Press Ctrl+C within 10 seconds to cancel...');
    logger.warn('!'.repeat(80));

    await new Promise(resolve => setTimeout(resolve, 10000));

    // Step 5: Perform migration
    logger.info('\nStarting migration...');
    const batch = db.batch();
    let batchCount = 0;
    const results = {
      migrated: [],
      errors: []
    };

    for (const analysis of needsMigration) {
      try {
        const docRef = db.collection(COLLECTION_NAME).doc(analysis.id);
        const docSnap = await docRef.get();
        const originalData = docSnap.data();

        const convertedData = convertToVanillaFormat(analysis.id, originalData);

        // Update the existing document
        batch.update(docRef, convertedData);
        batchCount++;

        results.migrated.push({
          id: analysis.id,
          original: originalData,
          converted: convertedData
        });

        // Commit batch every 500 operations (Firestore limit)
        if (batchCount >= 500) {
          await batch.commit();
          logger.info(`Committed batch of ${batchCount} documents`);
          batchCount = 0;
        }
      } catch (error) {
        logger.error(`Failed to migrate ${analysis.id}: ${error.message}`);
        results.errors.push({
          id: analysis.id,
          error: error.message
        });
      }
    }

    // Commit remaining batch
    if (batchCount > 0) {
      await batch.commit();
      logger.info(`Committed final batch of ${batchCount} documents`);
    }

    // Step 6: Save migration report
    const reportFile = path.join(BACKUP_DIR, `migration_report_${BACKUP_TIMESTAMP}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(results, null, 2));

    // Step 7: Summary
    logger.info('\n' + '='.repeat(80));
    logger.success(`MIGRATION COMPLETE`);
    logger.info('='.repeat(80));
    logger.success(`Successfully migrated: ${results.migrated.length} documents`);
    if (results.errors.length > 0) {
      logger.error(`Failed to migrate: ${results.errors.length} documents`);
      logger.error('Check migration report for details');
    }
    logger.info(`Backup saved: ${path.join(BACKUP_DIR, `${COLLECTION_NAME}_backup_${BACKUP_TIMESTAMP}.json`)}`);
    logger.info(`Migration report: ${reportFile}`);
    logger.info('='.repeat(80));

  } catch (error) {
    logger.error(`Migration failed: ${error.message}`);
    logger.error(error.stack);
    logger.info('\nIf data was corrupted, restore from backup using the rollback script.');
    throw error;
  }
}

/**
 * Rollback function to restore from backup
 */
async function rollback(backupFile) {
  logger.warn('Starting rollback from backup...');

  try {
    const backupData = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
    logger.info(`Loading backup: ${backupData.documentCount} documents`);

    const batch = db.batch();
    let batchCount = 0;

    for (const doc of backupData.documents) {
      const docRef = db.collection(COLLECTION_NAME).doc(doc.id);
      batch.set(docRef, doc.data);
      batchCount++;

      if (batchCount >= 500) {
        await batch.commit();
        logger.info(`Restored batch of ${batchCount} documents`);
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
      logger.info(`Restored final batch of ${batchCount} documents`);
    }

    logger.success('Rollback complete!');
  } catch (error) {
    logger.error(`Rollback failed: ${error.message}`);
    throw error;
  }
}

// Script execution
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--rollback')) {
    const backupFile = args[args.indexOf('--rollback') + 1];
    if (!backupFile) {
      logger.error('Please provide backup file path: --rollback <backup-file>');
      process.exit(1);
    }
    rollback(backupFile).then(() => process.exit(0)).catch(() => process.exit(1));
  } else {
    migrateCalendarData().then(() => process.exit(0)).catch(() => process.exit(1));
  }
}

module.exports = { migrateCalendarData, rollback, analyzeScheduleDocument, convertToVanillaFormat };
