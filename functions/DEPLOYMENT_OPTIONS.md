# Deployment Options - Choose Your Method

You have **two ways** to deploy the daily email report Cloud Functions:

## Option 1: GitHub Actions (Recommended) ⭐

**Best for:** Automatic deployment when you push code changes

**Pros:**
- ✅ Fully automated - just push to GitHub
- ✅ No local setup needed
- ✅ Deployment logs in GitHub UI
- ✅ Easy to trigger manually from GitHub
- ✅ Great for teams

**Setup Time:** ~10 minutes

**Follow:** `GITHUB_ACTIONS_SETUP.md`

**Quick Steps:**
1. Create Firebase service account
2. Get Firebase CI token
3. Create Gmail app password
4. Add 4 secrets to GitHub
5. Push to GitHub - done!

---

## Option 2: Manual Deployment

**Best for:** One-time deployment or direct control

**Pros:**
- ✅ Simple and direct
- ✅ No GitHub configuration needed
- ✅ Good for testing locally

**Setup Time:** ~5 minutes

**Follow:** `SETUP_INSTRUCTIONS.md`

**Quick Steps:**
1. Create Gmail app password
2. Run: `npm install`
3. Run: `firebase functions:config:set email.user="your@email.com"`
4. Run: `firebase functions:config:set email.password="app-password"`
5. Run: `npm run deploy` - done!

---

## Comparison

| Feature | GitHub Actions | Manual |
|---------|----------------|--------|
| **Deployment** | Automatic on push | Manual command |
| **Setup Complexity** | Medium (10 min) | Easy (5 min) |
| **Maintenance** | Hands-off | Run deploy manually |
| **Team Friendly** | Yes | No |
| **Local Setup Required** | No | Yes (Firebase CLI) |
| **Logs** | GitHub UI + Firebase | Firebase only |
| **Re-deployment** | Just push to GitHub | Run `npm run deploy` |

---

## Recommendation

**For most users:** Use **GitHub Actions** (Option 1)

It's the modern approach and you'll never have to think about deployment again - just push your code and it deploys automatically!

**If you prefer simplicity:** Use **Manual** (Option 2)

Perfect if you want a quick one-time setup and don't plan to change the code often.

---

## Already Deployed?

Both methods achieve the same result - a Cloud Function that runs at 5 AM CST daily and emails supervisor reports to jason.brannon@entrusted.com.

Once deployed (either way), you're done! The function runs automatically every day.

---

## Choose Your Path

- **[GitHub Actions Setup →](GITHUB_ACTIONS_SETUP.md)** (Recommended)
- **[Manual Setup →](SETUP_INSTRUCTIONS.md)** (Simpler)

Both work perfectly - pick the one that fits your workflow!
