# 🍎 Mac Terminal Deployment Guide

## Step-by-Step: Deploy from Mac Terminal

---

## ✅ Prerequisites (Install These First)

### 1. **Install Homebrew** (Mac package manager)

Open Terminal and paste this:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Press Enter and follow the prompts.

### 2. **Install Git**

```bash
brew install git
```

### 3. **Install Node.js**

```bash
brew install node
```

### 4. **Verify Everything is Installed**

```bash
git --version
# Should show: git version 2.x.x

node --version
# Should show: v18.x.x or higher

npm --version
# Should show: 9.x.x or higher
```

If all three commands show version numbers, you're ready! ✅

---

## 🚀 Deployment Steps (Copy & Paste These!)

### **Step 1: Open Terminal**

- Press **Command (⌘) + Space**
- Type **`terminal`**
- Press **Enter**

A window opens - this is your Terminal!

---

### **Step 2: Go to Your Desktop** (or wherever you want the code)

```bash
cd ~/Desktop
```

Press Enter.

---

### **Step 3: Download the Code from GitHub**

Copy and paste this entire command:

```bash
git clone https://github.com/jbrannon972/MITAPP.git
```

Press Enter. You'll see:
```
Cloning into 'MITAPP'...
...
done.
```

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

This takes 1-2 minutes. You'll see lots of text scrolling. Wait for it to finish.

---

### **Step 6: Choose Your Deployment Method**

Now pick ONE of these three options:

---

## 🎯 **OPTION 1: Netlify (EASIEST!) ⭐**

### **Method A: Drag & Drop (No More Terminal!)**

```bash
# Build the app
npm run build
```

Then:
1. Open Finder
2. Navigate to: Desktop → MITAPP → mitapp-react → **dist**
3. Open browser to: https://app.netlify.com/drop
4. **Drag the `dist` folder** onto the page
5. Done! Your app is live!

### **Method B: One Command**

```bash
# Login to Netlify (first time only)
npx netlify login
```

Your browser will open - sign up/login with GitHub or email, then come back to Terminal.

```bash
# Initialize Netlify (first time only)
npx netlify init
```

Follow the prompts:
- Create & configure a new site: **Yes**
- Your team: **Select your team**
- Site name: **mitapp-react** (or whatever you want)
- Build command: **npm run build**
- Directory to deploy: **dist**

```bash
# Deploy!
npm run deploy
```

**Your app is live!** The Terminal will show your URL! 🎉

**URL:** https://[your-name].netlify.app

---

## 🔥 **OPTION 2: Firebase**

```bash
# Login to Firebase (first time only)
npx firebase login
```

Your browser opens - sign in with Google, then come back to Terminal.

```bash
# Deploy!
npm run deploy:firebase
```

**Your app is live!** 🎉

**URL:** https://mit-foreasting.web.app

---

## 📄 **OPTION 3: GitHub Pages**

```bash
# Deploy!
npm run deploy:gh-pages
```

**Your app is live!** 🎉

**URL:** https://jbrannon972.github.io/MITAPP/

**Note:** After first deploy, go to:
- https://github.com/jbrannon972/MITAPP/settings/pages
- Source: Select `gh-pages` branch

---

## 📝 Complete Terminal Session Example

Here's what your entire Terminal session looks like:

```bash
# Open Terminal (Command + Space, type "terminal")

# 1. Go to Desktop
cd ~/Desktop

# 2. Download code
git clone https://github.com/jbrannon972/MITAPP.git

# 3. Go into project
cd MITAPP/mitapp-react

# 4. Install dependencies
npm install

# 5a. For Netlify (Easiest - Drag & Drop)
npm run build
# Then drag dist folder to netlify.com/drop

# OR 5b. For Netlify (CLI)
npx netlify login
npx netlify init
npm run deploy

# OR 5c. For Firebase
npx firebase login
npm run deploy:firebase

# OR 5d. For GitHub Pages
npm run deploy:gh-pages
```

---

## 🔄 Future Updates (After First Time)

Whenever you want to deploy updates:

```bash
# 1. Open Terminal

# 2. Go to project
cd ~/Desktop/MITAPP/mitapp-react

# 3. Get latest code (if working with others)
git pull origin claude/analyze-web-app-011CUKXGz3AFhAh5Uv2Qc4iw

# 4. Deploy (choose one):
npm run deploy              # Netlify
npm run deploy:firebase     # Firebase
npm run deploy:gh-pages     # GitHub Pages
```

---

## 🎯 My Recommendation for Mac

**Easiest for beginners:**
1. `npm run build`
2. Drag `dist` folder to netlify.com/drop
3. Done!

**Most automated:**
```bash
npx netlify login
npm run deploy
```

**Best for your project (using Firebase already):**
```bash
npx firebase login
npm run deploy:firebase
```

---

## 🐛 Common Issues on Mac

### "Permission denied"

Add `sudo` before the command:
```bash
sudo npm install -g firebase-tools
```

It will ask for your Mac password.

### "Command not found"

Install it globally:
```bash
npm install -g netlify-cli
# or
npm install -g firebase-tools
```

Or use `npx`:
```bash
npx netlify login
npx firebase login
```

### "Cannot find module"

Make sure you're in the right folder:
```bash
cd ~/Desktop/MITAPP/mitapp-react
npm install
```

---

## 💡 Mac Terminal Tips

### Useful Commands:

```bash
pwd                    # Show current folder
ls                     # List files in current folder
cd ~                   # Go to home directory
cd ~/Desktop           # Go to Desktop
cd ..                  # Go up one folder
clear                  # Clear terminal screen
```

### Shortcuts:

- **Command + K** - Clear terminal
- **Command + T** - New terminal tab
- **Command + W** - Close tab
- **Tab** - Auto-complete file/folder names
- **Up Arrow** - Previous command
- **Command + C** - Cancel current command

---

## ✅ Complete Checklist

Before deploying, make sure:

- [ ] Homebrew installed
- [ ] Git installed (`git --version` works)
- [ ] Node.js installed (`node --version` works)
- [ ] npm installed (`npm --version` works)
- [ ] Code downloaded (`cd ~/Desktop/MITAPP/mitapp-react` works)
- [ ] Dependencies installed (`npm install` completed)
- [ ] Logged into deployment service (Netlify/Firebase/GitHub)

Then run:
- [ ] `npm run deploy` (or your chosen method)

---

## 🎉 Success!

When deployment succeeds, you'll see:

**Netlify:**
```
✔ Deploy complete!
URL: https://your-site.netlify.app
```

**Firebase:**
```
✔ Deploy complete!
Hosting URL: https://mit-foreasting.web.app
```

**GitHub Pages:**
```
Published
```

Open that URL in your browser and your app is live! 🚀

---

## 📞 Need Help?

If you get stuck:

1. **Read the error message** - it usually tells you what's wrong
2. **Make sure you're in the right folder** - `pwd` shows where you are
3. **Try reinstalling dependencies** - `npm install`
4. **Check the version** - `node --version` should be 18+

---

**You're all set!** Just open Terminal and follow the steps above! 🍎✨
