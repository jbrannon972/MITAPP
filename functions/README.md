# MIT App Cloud Functions - Daily Email Reports

This Cloud Function automatically sends daily email summaries of all supervisor reports to jason.brannon@entrusted.com every morning at 5:00 AM CST.

## Features

- **Automated Daily Emails** - Runs every day at 5 AM CST
- **All Supervisor Reports** - Includes Second Shift Lead, MIT Leads, and other supervisors
- **Beautiful HTML Formatting** - Clean, professional email design
- **Summary Statistics** - Total reports, breakdown by type
- **Issue Highlighting** - Important issues and damages are visually highlighted
- **No Reports Alert** - Sends notification if no reports were submitted

## Setup Instructions

### 1. Prerequisites

- Firebase CLI installed (`npm install -g firebase-tools`)
- Firebase project initialized
- Gmail account for sending emails

### 2. Install Dependencies

```bash
cd functions
npm install
```

### 3. Configure Email Settings

#### Option A: Using Gmail (Recommended for simplicity)

1. **Create a Gmail App Password:**
   - Go to https://myaccount.google.com/security
   - Enable 2-Step Verification if not already enabled
   - Go to App Passwords: https://myaccount.google.com/apppasswords
   - Select "Mail" and "Other (Custom name)"
   - Name it "MIT App Reports"
   - Copy the 16-character password

2. **Set Firebase Environment Variables:**

```bash
firebase functions:config:set email.user="your-email@gmail.com"
firebase functions:config:set email.password="your-16-char-app-password"
```

#### Option B: Using SendGrid (Recommended for production)

1. Sign up at https://sendgrid.com (free tier: 100 emails/day)
2. Create an API key
3. Modify `index.js` to use SendGrid instead of nodemailer

### 4. Deploy the Function

```bash
# From the functions directory
npm run deploy

# OR from the project root
firebase deploy --only functions
```

### 5. Verify Deployment

```bash
# View function logs
firebase functions:log
```

### 6. Test the Function Manually (Optional)

You can trigger the function manually to test it:

```bash
# From Firebase Console
# Go to Functions > sendDailySupervisorReports > Testing tab
# Click "Run function"
```

## Function Details

### Schedule
- **Time:** 5:00 AM CST every day
- **Timezone:** America/Chicago (handles CST/CDT automatically)
- **Cron Expression:** `0 11 * * *` (11 AM UTC = 5 AM CST)

### What It Does

1. Runs at 5 AM CST every day
2. Queries Firestore for all supervisor reports from the previous day
3. Fetches reports from:
   - `second_shift_reports` collection
   - `daily_reports` collection (for MIT Leads and Supervisors)
4. Formats data into a beautiful HTML email
5. Sends to jason.brannon@entrusted.com

### Email Content Includes

- **Header:** Date and "Daily Supervisor Reports" title
- **Summary Stats:** Total reports, breakdown by type
- **Individual Report Cards:**
  - Supervisor name and role
  - Hours worked
  - Team members
  - Accomplishments (highlighted in green)
  - Issues/Challenges (highlighted in red)
  - Equipment issues
  - Damage reports
  - Notes

## Firestore Collections Used

The function queries these collections:

1. **second_shift_reports**
   - Fields: `date`, `submittedBy`, `shiftStart`, `shiftEnd`, `hoursWorked`, `teamMembers`, `accomplishments`, `issues`, `notes`, etc.

2. **daily_reports** (if exists)
   - Fields: `date`, `role`, `submittedBy`, `username`, `totalHours`, `techsWorking`, `summary`, `notes`, `issues`

## Customization

### Change Email Time

Edit the cron schedule in `index.js`:

```javascript
.schedule('0 11 * * *') // Current: 5 AM CST
.schedule('0 12 * * *') // Change to 6 AM CST
.schedule('0 10 * * *') // Change to 4 AM CST
```

### Change Recipient

Edit the recipient in `index.js`:

```javascript
const EMAIL_CONFIG = {
  recipient: 'jason.brannon@entrusted.com', // Change here
  // ...
};
```

### Add More Recipients

```javascript
const EMAIL_CONFIG = {
  recipient: 'jason.brannon@entrusted.com, other@email.com',
  // ...
};
```

## Monitoring

### View Logs

```bash
firebase functions:log --only sendDailySupervisorReports
```

### Check Function Status

```bash
firebase functions:list
```

### Email Delivery Issues

If emails aren't being delivered:

1. Check Firebase Console > Functions for errors
2. Verify email credentials are correct
3. Check Gmail's "Sent" folder
4. Check spam folder
5. Verify Gmail App Password is still valid

## Cost

**Free Tier Limits:**
- Cloud Functions: 2M invocations/month (we use 30/month)
- Outbound networking: 5GB/month (emails are tiny)
- **Estimated monthly cost: $0**

## Troubleshooting

### "Error: permission denied"
- Make sure you're authenticated: `firebase login`

### "Email not sending"
- Verify environment variables: `firebase functions:config:get`
- Check Gmail App Password is correct
- Make sure 2-Step Verification is enabled on Gmail account

### "No reports found" every day
- Check Firestore collection names match
- Verify date field types (should be Firestore Timestamp)
- Check timezone settings

## Security Notes

- **Never commit .env files** - They contain sensitive passwords
- Use Gmail App Passwords, not your actual password
- Keep the `.gitignore` file to prevent credential leaks
- Rotate App Passwords periodically

## Support

For issues or questions:
- Check Firebase Functions logs
- Review Firestore data structure
- Test function manually from Firebase Console

---

## Quick Reference Commands

```bash
# Deploy
npm run deploy

# View logs
npm run logs

# Test locally
npm run serve

# Set environment variables
firebase functions:config:set email.user="your@email.com"
firebase functions:config:set email.password="app-password"

# Get current config
firebase functions:config:get
```
