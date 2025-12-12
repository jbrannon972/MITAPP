# Calendar Data Migration Script

## Purpose

This script migrates calendar data from the React app format to the Vanilla JS format, ensuring both calendar versions use identical data structures.

## What It Does

1. **Backs up all schedule data** before making any changes
2. **Analyzes existing data** to identify what needs migration
3. **Converts React format to Vanilla format**:
   - Converts document IDs from `YYYY-MM-DD` strings to auto-generated IDs
   - Ensures `date` field uses Firebase Timestamp objects
   - Renames `staffList` to `staff`
   - Converts capitalized status values (e.g., `"Scheduled"`) to lowercase (e.g., `"scheduled"`)
4. **Provides rollback capability** in case something goes wrong

## Prerequisites

### 1. Get Firebase Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (`mit-foreasting`)
3. Go to **Project Settings** → **Service Accounts**
4. Click **Generate New Private Key**
5. Save the downloaded JSON file as `firebase-service-account.json` in the root of this repository

**IMPORTANT:** Never commit this file to git! It's already in `.gitignore`.

### 2. Install Dependencies

```bash
cd scripts
npm install
```

## Usage

### Step 1: Dry Run (Test Mode)

**ALWAYS run this first** to see what will be changed without modifying any data:

```bash
npm run migrate:dry-run
```

This will:
- ✅ Show how many documents need migration
- ✅ List all issues found
- ✅ Create a backup
- ❌ NOT modify any data

### Step 2: Review the Output

Check the console output carefully:

```
[INFO] Total documents: 45
[INFO] Already in correct format: 32
[WARN] Need migration: 13

Documents that need migration:
  - 2025-11-01: Document ID is date string (React format), Status values are capitalized
  - 2025-11-02: Document ID is date string (React format), Uses staffList instead of staff
  ...
```

### Step 3: Live Migration

Once you're confident the dry run looks correct:

```bash
npm run migrate:live
```

⚠️ **WARNING:** This will modify your production database!

The script will:
1. Create a full backup
2. Wait 10 seconds (giving you time to cancel with Ctrl+C)
3. Perform the migration
4. Generate a detailed migration report

### Step 4: Verify

Check the output for any errors:

```
[SUCCESS] MIGRATION COMPLETE
[SUCCESS] Successfully migrated: 13 documents
[INFO] Backup saved: ../backups/hou_schedules_backup_2025-11-19T12-30-00-000Z.json
[INFO] Migration report: ../backups/migration_report_2025-11-19T12-30-00-000Z.json
```

## Rollback (If Something Goes Wrong)

If the migration causes issues, you can restore from backup:

```bash
npm run rollback ../backups/hou_schedules_backup_2025-11-19T12-30-00-000Z.json
```

Replace the filename with your actual backup file from the `backups/` directory.

## Files Generated

### Backups Directory

All backups and reports are saved to `../backups/`:

- `hou_schedules_backup_TIMESTAMP.json` - Full backup of all schedule data
- `migration_report_TIMESTAMP.json` - Detailed report of what was migrated

## Data Format Details

### Before (React Format)

```javascript
// Document ID: "2025-11-01"
{
  date: "2025-11-01",  // String or missing
  staffList: [         // Or "staff"
    {
      id: "tech_123",
      name: "John Doe",
      status: "Scheduled",  // Capitalized
      hours: "8h"
    }
  ],
  notes: "Some notes"
}
```

### After (Vanilla Format)

```javascript
// Document ID: Auto-generated (e.g., "20251101_1700000000000")
{
  date: Timestamp(2025-11-01 00:00:00),  // Firebase Timestamp
  staff: [
    {
      id: "tech_123",
      name: "John Doe",
      status: "on",         // Lowercase
      hours: "8:00-5:00"    // Time range format
    }
  ],
  notes: "Some notes"
}
```

## Troubleshooting

### Error: "Cannot find module 'firebase-admin'"

```bash
cd scripts
npm install
```

### Error: "Cannot find firebase-service-account.json"

Make sure you've downloaded the service account key and placed it in the root directory.

### Error: "Permission denied"

Make sure your service account has Firestore read/write permissions.

### Migration seems stuck

The script processes in batches of 500 documents. Large datasets may take several minutes.

## Safety Features

✅ **Full backup** before any changes
✅ **Dry run mode** to test first
✅ **10-second countdown** before live migration
✅ **Batch processing** to handle large datasets
✅ **Detailed logging** of every change
✅ **Rollback capability** to restore from backup
✅ **Error handling** to prevent partial migrations

## Support

If you encounter any issues, check:

1. The console output for specific error messages
2. The migration report in `backups/migration_report_TIMESTAMP.json`
3. Your Firebase Console to verify the data

For rollback assistance, always keep the backup files in `backups/` directory.
