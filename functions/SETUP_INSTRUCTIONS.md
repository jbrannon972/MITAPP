# Quick Setup Guide - Daily Email Reports

## Step-by-Step Setup (5 minutes)

### Step 1: Create Gmail App Password

1. Go to: https://myaccount.google.com/security
2. Click **2-Step Verification** (enable if not already)
3. Go to: https://myaccount.google.com/apppasswords
4. Select:
   - App: **Mail**
   - Device: **Other (Custom name)**
   - Name it: **MIT App Reports**
5. Click **Generate**
6. **Copy the 16-character password** (you'll need it in Step 3)

### Step 2: Install Firebase CLI (if not already installed)

```bash
npm install -g firebase-tools
firebase login
```

### Step 3: Configure Email Credentials

Run these commands in your terminal:

```bash
cd /home/user/MITAPP/functions

# Replace with YOUR email and app password from Step 1
firebase functions:config:set email.user="your-email@gmail.com"
firebase functions:config:set email.password="abcd-efgh-ijkl-mnop"
```

**Example:**
```bash
firebase functions:config:set email.user="jason.brannon@entrusted.com"
firebase functions:config:set email.password="abcd-efgh-ijkl-mnop"
```

### Step 4: Install Dependencies

```bash
npm install
```

### Step 5: Deploy the Function

```bash
npm run deploy
```

This will deploy the function to Firebase. It will start running automatically every day at 5 AM CST.

### Step 6: Test It (Optional)

You can manually trigger the function to test it:

1. Go to Firebase Console: https://console.firebase.google.com
2. Select your project
3. Click **Functions** in the left sidebar
4. Find **sendDailySupervisorReports**
5. Click the **3 dots** menu → **Test function**
6. Check your email (jason.brannon@entrusted.com)

## Verification

After deployment, you should see:

```
✔ functions[sendDailySupervisorReports(us-central1)] Successful...
```

## What Happens Next?

- The function will run **automatically every day at 5:00 AM CST**
- You'll receive an email at **jason.brannon@entrusted.com**
- Email includes all supervisor reports from the previous day
- If no reports exist, you'll get a "No Reports" notification

## Monitoring

View logs to see when it runs:

```bash
firebase functions:log --only sendDailySupervisorReports
```

## Need to Change Something?

### Change the time:
Edit `index.js` line 26:
```javascript
.schedule('0 11 * * *') // 11 AM UTC = 5 AM CST
```

### Change email address:
Edit `index.js` line 10:
```javascript
recipient: 'jason.brannon@entrusted.com',
```

Then redeploy:
```bash
npm run deploy
```

## Troubleshooting

**Email not arriving?**
1. Check spam folder
2. Verify Gmail App Password: `firebase functions:config:get`
3. Check logs: `firebase functions:log`

**Permission errors?**
```bash
firebase login
```

**Function not deploying?**
```bash
npm install
npm run deploy
```

## Cost

**$0/month** - Well within Firebase free tier limits
