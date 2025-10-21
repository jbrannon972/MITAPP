# Deployment Guide

## GitHub Pages Deployment

The React app is configured to automatically deploy to GitHub Pages when changes are pushed to the main/master branch.

### Automatic Deployment (Recommended)

1. **Enable GitHub Pages in Repository Settings**
   - Go to your GitHub repository: https://github.com/jbrannon972/MITAPP
   - Click on **Settings** tab
   - Scroll down to **Pages** section (in the left sidebar under "Code and automation")
   - Under **Source**, select **GitHub Actions**
   - Save the settings

2. **Push Changes to Main Branch**
   ```bash
   git checkout main
   git merge claude/analyze-web-app-011CUKXGz3AFhAh5Uv2Qc4iw
   git push origin main
   ```

3. **Monitor Deployment**
   - Go to the **Actions** tab in your GitHub repository
   - You'll see the "Deploy React App to GitHub Pages" workflow running
   - Once completed, your app will be live!

4. **Access Your Deployed App**
   - URL: `https://jbrannon972.github.io/MITAPP/`
   - The workflow will also show the deployment URL in the "deploy" job output

### Manual Deployment (Alternative)

If you prefer to deploy manually:

```bash
cd mitapp-react
npm install gh-pages --save-dev
npm run deploy
```

## Configuration Files

### GitHub Actions Workflow
- **File**: `.github/workflows/deploy.yml`
- **Triggers**: Pushes to main/master branch, or manual workflow dispatch
- **Process**:
  1. Checks out code
  2. Sets up Node.js
  3. Installs dependencies
  4. Builds the React app
  5. Deploys to GitHub Pages

### Vite Configuration
- **File**: `mitapp-react/vite.config.js`
- **Base Path**: Set to `/MITAPP/` to match the repository name
- This ensures all assets load correctly on GitHub Pages

## Deployment Status

After deployment, you can check:

1. **GitHub Actions Status**
   - https://github.com/jbrannon972/MITAPP/actions

2. **GitHub Pages Status**
   - Settings → Pages → Your site is live at...

## Troubleshooting

### If deployment fails:

1. **Check GitHub Actions logs**
   - Go to Actions tab
   - Click on the failed workflow
   - Review the error messages

2. **Verify GitHub Pages is enabled**
   - Settings → Pages → Source should be "GitHub Actions"

3. **Check permissions**
   - The workflow needs write permissions for Pages
   - Settings → Actions → General → Workflow permissions → Read and write permissions

### If app loads but shows blank page:

1. **Check browser console for errors**
   - Look for 404 errors on asset files
   - Verify the base path in `vite.config.js` matches your repo name

2. **Verify build output**
   ```bash
   cd mitapp-react
   npm run build
   # Check that dist/ folder is created
   ```

## Updating the Deployed App

Every time you push to the main branch, the app will automatically rebuild and redeploy. The process takes about 2-3 minutes.

```bash
# Make changes
git add .
git commit -m "Update app"
git push origin main
# Wait for GitHub Actions to complete
# Your changes are now live!
```

## Custom Domain (Optional)

To use a custom domain:

1. Add a `CNAME` file to `mitapp-react/public/` with your domain
2. Configure DNS records to point to GitHub Pages
3. Update in Settings → Pages → Custom domain

## Important Notes

⚠️ **Firebase Configuration**: The Firebase config is currently embedded in the code. For production, consider:
- Using environment variables
- Implementing Firebase App Check for security
- Reviewing Firestore security rules

⚠️ **Authentication**: GitHub Pages serves static files only. Firebase Authentication should work, but ensure:
- Authorized domains are configured in Firebase Console
- Add your GitHub Pages URL to authorized domains

## Next Steps After Deployment

1. ✅ Verify the app loads at the GitHub Pages URL
2. ✅ Test login functionality
3. ✅ Check that Firebase connection works
4. ⏳ Add your GitHub Pages domain to Firebase authorized domains
5. ⏳ Test all features thoroughly
6. ⏳ Monitor for any errors in production

---

**Deployment configured and ready!** 🚀

Push to main branch to trigger automatic deployment.
