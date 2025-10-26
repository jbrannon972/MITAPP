# GitHub Actions Deployment Setup

This guide will help you set up automatic deployment of Firebase Cloud Functions via GitHub Actions.

## Overview

Every time you push changes to the `functions/` folder, GitHub Actions will automatically:
1. Install dependencies
2. Configure email settings
3. Deploy the Cloud Functions to Firebase
4. The daily email reports will start running at 5 AM CST

## Setup Steps (10 minutes)

### Step 1: Create Firebase Service Account

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Click the **Settings gear** → **Project settings**
4. Go to **Service accounts** tab
5. Click **Generate new private key**
6. Click **Generate key** - this downloads a JSON file
7. **Save this file securely** - you'll need it in Step 3

### Step 2: Get Firebase CI Token

Open your terminal and run:

```bash
firebase login:ci
```

This will:
1. Open a browser for you to log in
2. Generate a CI token
3. Display the token in the terminal

**Copy this token** - you'll need it in Step 3.

### Step 3: Create Gmail App Password (if you haven't already)

1. Go to https://myaccount.google.com/apppasswords
2. Select **Mail** → **Other (Custom name)**
3. Name it: **MIT App Reports**
4. Click **Generate**
5. **Copy the 16-character password** - you'll need it in Step 4

### Step 4: Add GitHub Secrets

1. Go to your GitHub repository
2. Click **Settings** tab
3. Click **Secrets and variables** → **Actions**
4. Click **New repository secret** for each of these:

#### Secret 1: FIREBASE_TOKEN
- **Name:** `FIREBASE_TOKEN`
- **Value:** The CI token from Step 2
- Click **Add secret**

#### Secret 2: FIREBASE_SERVICE_ACCOUNT
- **Name:** `FIREBASE_SERVICE_ACCOUNT`
- **Value:** Open the JSON file from Step 1, copy the ENTIRE contents
- Click **Add secret**

#### Secret 3: EMAIL_USER
- **Name:** `EMAIL_USER`
- **Value:** Your Gmail address (e.g., `your-email@gmail.com`)
- Click **Add secret**

#### Secret 4: EMAIL_PASSWORD
- **Name:** `EMAIL_PASSWORD`
- **Value:** The 16-character app password from Step 3
- Click **Add secret**

### Step 5: Trigger Deployment

You have two options:

#### Option A: Automatic (Push to GitHub)
```bash
git add .
git commit -m "Setup GitHub Actions deployment"
git push
```

GitHub Actions will automatically deploy!

#### Option B: Manual (GitHub UI)
1. Go to your GitHub repository
2. Click **Actions** tab
3. Click **Deploy Firebase Functions** workflow
4. Click **Run workflow** button
5. Click the green **Run workflow** button

### Step 6: Verify Deployment

1. Go to **Actions** tab in GitHub
2. Click on the running workflow
3. Watch the deployment progress
4. Look for ✅ **Firebase Functions deployed successfully!**

## Verify It's Working

### Check Firebase Console
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **Functions** in the left sidebar
3. You should see **sendDailySupervisorReports** listed
4. Status should be **Active**

### Check Logs
```bash
firebase functions:log --only sendDailySupervisorReports
```

### Manual Test (Optional)
1. Go to Firebase Console → Functions
2. Click **sendDailySupervisorReports**
3. Click **Testing** tab
4. Click **Run function**
5. Check your email!

## Troubleshooting

### "Error: HTTP Error: 403, Permission denied"

**Solution:** Your Firebase token may be invalid.
```bash
# Generate a new token
firebase login:ci

# Update the FIREBASE_TOKEN secret in GitHub
```

### "Error: Failed to set environment variables"

**Solution:** This is usually okay - it will still deploy. The environment variables are set on first deployment.

### "Deployment failed - Authentication error"

**Solutions:**
1. Verify FIREBASE_SERVICE_ACCOUNT secret contains the full JSON (including `{` and `}`)
2. Re-download service account key from Firebase Console
3. Make sure you selected the correct Firebase project

### "Email not sending after deployment"

**Solutions:**
1. Verify EMAIL_USER secret is correct
2. Verify EMAIL_PASSWORD is the Gmail App Password (not your regular password)
3. Check Firebase Functions logs for errors:
   ```bash
   firebase functions:log
   ```

## What Happens Automatically

✅ **Every time you push changes to `functions/` folder:**
- GitHub Actions runs automatically
- Installs dependencies
- Configures email settings
- Deploys to Firebase
- You get a ✅ or ❌ notification in GitHub

✅ **Every day at 5:00 AM CST:**
- Cloud Function runs automatically
- Fetches supervisor reports from yesterday
- Sends formatted email to jason.brannon@entrusted.com

## Manual Deployment (if needed)

If you ever need to deploy manually:

```bash
cd functions
firebase deploy --only functions
```

## GitHub Actions Workflow Details

**File:** `.github/workflows/deploy-functions.yml`

**Triggers:**
- Push to `claude/connect-service-011CUUw7Cvs7ixKxsQzoHotb` branch
- Push to `main` branch
- Changes to `functions/` folder
- Manual trigger from GitHub UI

**Secrets Used:**
- `FIREBASE_TOKEN` - For Firebase CLI authentication
- `FIREBASE_SERVICE_ACCOUNT` - Service account JSON for deployment
- `EMAIL_USER` - Gmail address for sending emails
- `EMAIL_PASSWORD` - Gmail app password

## Security Notes

✅ **Good Practices:**
- Secrets are encrypted in GitHub
- Service account JSON is never committed to git
- Passwords are app-specific (not your main Gmail password)
- Service account file is cleaned up after deployment

⚠️ **Important:**
- Never commit the Firebase service account JSON to git
- Never commit your .env file
- Rotate Gmail app password periodically
- Keep Firebase token secure

## Cost

**GitHub Actions:** Free for public repos, 2000 minutes/month for private repos
**Firebase Functions:** $0/month (within free tier)
**Total:** $0/month ✅

## Next Steps

After successful deployment:
1. You're done! The function will run automatically daily
2. Check your email tomorrow at 5:05 AM CST
3. Monitor logs occasionally to ensure everything is working

## Quick Reference

```bash
# View GitHub Actions runs
# Go to: https://github.com/YOUR_USERNAME/YOUR_REPO/actions

# View Firebase logs
firebase functions:log

# Manual deployment
firebase deploy --only functions

# Test function manually
# Firebase Console → Functions → sendDailySupervisorReports → Testing → Run

# Generate new CI token
firebase login:ci

# View current Firebase project
firebase projects:list
```

## Support

If you encounter issues:
1. Check GitHub Actions logs in the **Actions** tab
2. Check Firebase Functions logs: `firebase functions:log`
3. Verify all 4 GitHub secrets are set correctly
4. Make sure Firebase project is selected: `firebase use PROJECT_ID`

---

**That's it!** Your daily email reports are now fully automated via GitHub Actions! 🎉
