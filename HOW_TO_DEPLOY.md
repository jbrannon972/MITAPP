# 🎯 How to Deploy - Step by Step

## Where Do I Run These Commands?

**You run these commands on YOUR COMPUTER** in a terminal/command prompt.

---

## 📍 Step-by-Step Instructions

### **Step 1: Open Terminal/Command Prompt on Your Computer**

**On Windows:**
- Press `Windows Key + R`
- Type `cmd` or `powershell`
- Press Enter

**On Mac:**
- Press `Command + Space`
- Type `terminal`
- Press Enter

**On Linux:**
- Press `Ctrl + Alt + T`
- Or search for "Terminal" in your applications

---

### **Step 2: Navigate to Where You Want to Download the Code**

```bash
# Go to your Documents folder (or wherever you want)
cd Documents

# Or Desktop
cd Desktop

# Or create a projects folder
mkdir projects
cd projects
```

---

### **Step 3: Download the Code from GitHub**

Copy and paste this into your terminal:

```bash
git clone https://github.com/jbrannon972/MITAPP.git
```

Press Enter. This downloads all the code to your computer.

---

### **Step 4: Go Into the Project Folder**

```bash
cd MITAPP/mitapp-react
```

---

### **Step 5: Install Dependencies**

```bash
npm install
```

This might take 1-2 minutes. It downloads all the libraries needed.

---

### **Step 6: Login to Firebase (One Time Only)**

```bash
firebase login
```

This will:
1. Open your web browser
2. Ask you to sign in with Google
3. Ask permission to use Firebase
4. After you approve, close the browser and return to terminal

---

### **Step 7: Deploy!**

```bash
npm run deploy
```

Watch the terminal - you'll see:
- "Building..."
- "Deploying..."
- "Deploy complete!"
- Your app URL: https://mit-foreasting.web.app

---

## 🖼️ Visual Guide

Here's what it looks like:

```
Your Computer
    ↓
Terminal/Command Prompt Window
    ↓
Type commands here and press Enter
    ↓
Magic happens!
```

### Example Terminal Session:

```
$ cd Documents
$ git clone https://github.com/jbrannon972/MITAPP.git
Cloning into 'MITAPP'...
✓ Done

$ cd MITAPP/mitapp-react
$ npm install
Installing dependencies...
✓ Done

$ firebase login
Opening browser...
✓ Success! Logged in

$ npm run deploy
Building...
✓ Build complete
Deploying...
✓ Deploy complete!

Your app is live at: https://mit-foreasting.web.app
```

---

## 🔧 Prerequisites (Things You Need First)

Before you can deploy, make sure you have these installed on your computer:

### 1. **Git** (to download code)
- Download from: https://git-scm.com/downloads
- Install it
- Verify by typing in terminal: `git --version`

### 2. **Node.js** (to run the app)
- Download from: https://nodejs.org/
- Choose the LTS version (left button)
- Install it
- Verify by typing in terminal: `node --version`

### 3. **npm** (comes with Node.js automatically)
- Verify by typing in terminal: `npm --version`

---

## 📝 Complete First-Time Setup

Run these commands **IN ORDER** in your terminal:

### **1. Check Prerequisites**

```bash
git --version
# Should show: git version 2.x.x

node --version
# Should show: v18.x.x or higher

npm --version
# Should show: 9.x.x or higher
```

If any command says "not found" or "command not recognized", install that tool first (see Prerequisites above).

### **2. Download the Code**

```bash
# Go to where you want to save the project
cd Documents

# Download from GitHub
git clone https://github.com/jbrannon972/MITAPP.git

# Go into the project
cd MITAPP/mitapp-react
```

### **3. Install Project Dependencies**

```bash
npm install
```

Wait for it to finish (1-2 minutes).

### **4. Login to Firebase**

```bash
firebase login
```

Your browser will open - sign in with your Google account.

### **5. Deploy!**

```bash
npm run deploy
```

### **6. Done!**

Open your browser and go to: **https://mit-foreasting.web.app**

Your app is live! 🎉

---

## 🔄 Future Deployments (After First Time)

After the first setup, deploying updates is super easy:

```bash
# 1. Open terminal

# 2. Go to the project folder
cd Documents/MITAPP/mitapp-react
# (adjust path to where you put it)

# 3. Get latest code (if working with others)
git pull

# 4. Deploy
npm run deploy
```

That's it! Your changes are live in 30 seconds!

---

## 🆘 Troubleshooting

### "git: command not found"
**Solution:** Install Git from https://git-scm.com/downloads

### "npm: command not found"
**Solution:** Install Node.js from https://nodejs.org/

### "firebase: command not found"
**Solution:** The firebase command is installed locally in the project. Use:
```bash
npx firebase login
npx firebase deploy --only hosting
```

Or install it globally:
```bash
npm install -g firebase-tools
```

### "Permission denied"
**Solution on Mac/Linux:** Add `sudo` before the command:
```bash
sudo npm install -g firebase-tools
```

### "Port 5173 already in use" (when running dev server)
**Solution:** Something else is using that port. Either close it or change the port in `vite.config.js`

---

## 💡 Quick Tips

1. **Don't close the terminal** while commands are running
2. **Wait for each command to finish** before typing the next one
3. **If something goes wrong**, read the error message - it usually tells you what's needed
4. **You can copy/paste** commands into the terminal (right-click → paste)

---

## 📱 What About the Code in This Chat?

The code changes I made are already **pushed to GitHub** in the branch:
`claude/analyze-web-app-011CUKXGz3AFhAh5Uv2Qc4iw`

When you clone the repo and checkout that branch, you'll have everything ready to deploy!

---

## ✅ Quick Checklist

Before deploying, make sure you have:

- [ ] Git installed on your computer
- [ ] Node.js installed on your computer
- [ ] Terminal/Command Prompt open
- [ ] Internet connection
- [ ] Google account (for Firebase login)

Then just follow Steps 1-7 above!

---

## 🎬 Video Guide Alternative

If you prefer video tutorials, search YouTube for:
- "How to use terminal on Windows/Mac"
- "How to use git clone"
- "How to deploy to Firebase"

---

**You're ready to deploy!** Just open your terminal and follow the steps above. 🚀

Need help? The error messages in the terminal usually tell you exactly what to do!
