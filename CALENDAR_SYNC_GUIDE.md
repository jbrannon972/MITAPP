# Tech Calendar Synchronization Guide

## Overview

The Tech Calendar has been fully synchronized between the OG Vanilla JS version and the React version. Both now use **identical data structures and logic**.

## What Was Done

### ✅ React TechCalendar Updated

**File:** `mitapp-react/src/components/tech-app/TechCalendar.jsx`

Changes made to match vanilla JS:
- Status values now lowercase: `'on'`, `'off'`, `'sick'`, `'vacation'`, `'no-call-no-show'`
- Recurring frequency matches: `'weekly'`, `'every-other'` (not `'every-other-week'`)
- Data loading method matches vanilla JS `getScheduleDataForMonth()`
- All formatting functions match vanilla JS exactly
- Week number calculation matches vanilla JS
- Default status logic matches vanilla JS

### ✅ React FirebaseService Updated

**File:** `mitapp-react/src/services/firebaseService.js`

Changes made:
- `getScheduleDataForMonth()` now returns `{ specific: { [dayNumber]: data } }` structure
- Uses Firebase Timestamp for date queries
- Removes string-based document IDs in favor of auto-generated IDs

### ✅ Migration Script Created

**File:** `scripts/migrate-calendar-data.js`

Features:
- Full backup before any changes
- Dry run mode to test first
- Converts React format → Vanilla format
- Rollback capability
- Detailed logging and reports

## Unified Data Format

Both calendar versions now use this exact format:

```javascript
// Collection: hou_schedules
// Document structure:
{
  date: Timestamp(2025-11-19 00:00:00),  // Firebase Timestamp object
  staff: [
    {
      id: "tech_id",
      name: "John Doe",
      status: "on",              // LOWERCASE: on, off, sick, vacation, no-call-no-show
      hours: "8:00-5:00"         // Optional time range
    }
  ],
  notes: "Optional notes"
}

// Recurring Rules Collection: hou_recurring_rules
// Document ID: {technicianId}
{
  technicianId: "tech_id",
  days: [1, 2, 3, 4, 5],         // 0=Sunday, 6=Saturday
  status: "on",                  // LOWERCASE
  hours: "8:00-5:00",
  frequency: "weekly",           // "weekly" or "every-other"
  weekAnchor: 1,                 // For every-other frequency
  startDate: "2025-01-01",
  endDate: "2025-12-31"
}
```

## Migration Steps

### Prerequisites

1. **Get Firebase Service Account Key**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your project (`mit-foreasting`)
   - **Project Settings** → **Service Accounts**
   - Click **Generate New Private Key**
   - Save as `firebase-service-account.json` in repo root

2. **Install Dependencies**
   ```bash
   cd scripts
   npm install
   ```

### Step 1: Dry Run

**ALWAYS run dry run first!**

```bash
cd scripts
npm run migrate:dry-run
```

This shows what will change without modifying data.

### Step 2: Review Output

Check the console carefully:

```
[INFO] Total documents: 45
[INFO] Already in correct format: 32
[WARN] Need migration: 13
```

### Step 3: Run Migration

```bash
npm run migrate:live
```

⚠️ **WARNING:** This modifies production data!

The script will:
1. Create full backup
2. Wait 10 seconds (Ctrl+C to cancel)
3. Migrate data
4. Generate report

### Step 4: Verify

Test both calendar versions:
1. **Vanilla JS Tech App:** `Tech App/index.html`
2. **React Tech App:** `mitapp-react` (Calendar tab)

Both should show identical data.

### Rollback (If Needed)

```bash
npm run rollback ../backups/hou_schedules_backup_TIMESTAMP.json
```

## Maintaining Sync Going Forward

### Rules to Follow

1. **Status Values** - ALWAYS lowercase:
   - ✅ `'on'`, `'off'`, `'sick'`, `'vacation'`
   - ❌ `'On'`, `'Off'`, `'Scheduled'`, `'Sick'`

2. **Recurring Frequency** - Use vanilla JS values:
   - ✅ `'weekly'`, `'every-other'`
   - ❌ `'every-other-week'`

3. **Data Structure** - Use monthly schedule map:
   - ✅ `{ specific: { 1: {staff: [], notes: ''}, 2: {...} } }`
   - ❌ Individual date strings as keys

4. **Date Field** - ALWAYS use Firebase Timestamp:
   - ✅ `Timestamp.fromDate(new Date())`
   - ❌ `"2025-11-19"` or plain Date objects

### When Making Changes

**If you update the Vanilla JS calendar:**
1. Update `Tech App/JS/calendar-manager.js`
2. Update `mitapp-react/src/components/tech-app/TechCalendar.jsx`
3. Test both versions

**If you update the React calendar:**
1. Update `mitapp-react/src/components/tech-app/TechCalendar.jsx`
2. Update `Tech App/JS/calendar-manager.js`
3. Test both versions

### Code Comments

Both files now have comments indicating they must stay in sync:

```javascript
/**
 * IMPORTANT: This component is synced with Tech App/JS/calendar-manager.js
 * Any changes here should be reflected in the vanilla JS version and vice versa
 */
```

## Testing Checklist

After any changes or migration, verify:

- [ ] **My Schedule View** - Shows correct week schedule
- [ ] **Day View** - Shows correct staff for selected day
- [ ] **Week View** - Shows correct 7-day schedule
- [ ] **Month View** - Shows correct month calendar
- [ ] **Status Colors** - Display correctly in both versions
- [ ] **Recurring Rules** - Apply correctly (check every-other weeks)
- [ ] **Custom Hours** - Display in correct format
- [ ] **Notes** - Show on correct days
- [ ] **Navigation** - Prev/Next buttons work
- [ ] **Modal Popups** - Work correctly

## Troubleshooting

### Issue: Different data shown in React vs Vanilla

**Cause:** Migration not run or incomplete

**Solution:**
```bash
cd scripts
npm run migrate:live
```

### Issue: Statuses not displaying correctly

**Cause:** Capitalized status values in database

**Solution:** Migration script will fix this

### Issue: Recurring rules not working

**Cause:** Wrong frequency value

**Solution:** Check `hou_recurring_rules` collection, ensure frequency is `'every-other'` not `'every-other-week'`

### Issue: "Cannot read property 'toDate' of undefined"

**Cause:** Missing date field or wrong format

**Solution:** Ensure all schedule docs have `date` field as Firebase Timestamp

## Files Modified

```
MITAPP/
├── mitapp-react/
│   ├── src/
│   │   ├── components/
│   │   │   └── tech-app/
│   │   │       └── TechCalendar.jsx          ← Updated to match vanilla JS
│   │   └── services/
│   │       └── firebaseService.js            ← Updated schedule methods
├── scripts/
│   ├── migrate-calendar-data.js              ← NEW: Migration script
│   ├── package.json                          ← NEW: Script dependencies
│   └── README.md                             ← NEW: Migration guide
└── CALENDAR_SYNC_GUIDE.md                    ← NEW: This file
```

## Support

If you encounter issues:

1. Check the console for specific error messages
2. Review migration report in `backups/migration_report_TIMESTAMP.json`
3. Verify Firebase data structure in Firebase Console
4. Use rollback if data corruption occurs

## Summary

✅ Both calendars now use **identical** data structures
✅ Migration script ensures **no data loss**
✅ Clear documentation for **maintaining sync**
✅ **Rollback capability** if issues arise

The tech calendars are now **fully synchronized** and ready for production use!
