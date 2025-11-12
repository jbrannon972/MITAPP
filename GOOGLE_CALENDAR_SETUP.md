# Google Calendar Integration Setup

## Fixing "redirect_uri_mismatch" Error

This error occurs when the Google OAuth Client ID doesn't have your app's URL configured. Follow these steps to fix it:

## Step 1: Identify Your App URLs

Your app is likely running on one of these URLs:
- **Local Development**: `http://localhost:5173` or `http://localhost:3000`
- **Netlify**: `https://your-app-name.netlify.app`
- **Custom Domain**: `https://your-custom-domain.com`

## Step 2: Configure Google Cloud Console

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/apis/credentials
   - Make sure you're logged in with the account that owns the project

2. **Find Your OAuth 2.0 Client ID**
   - Look for the Client ID: `1069061948061-roq457in5ig4hnbd1hq8pt4n5jkl0if6.apps.googleusercontent.com`
   - Click the **Edit** button (pencil icon)

3. **Add Authorized JavaScript Origins**

   Add ALL URLs where your app runs:

   ```
   http://localhost:5173
   http://localhost:3000
   http://localhost:5174
   https://your-netlify-app.netlify.app
   https://your-custom-domain.com
   ```

   **Important Notes:**
   - Include both `http://localhost` AND your production URL
   - Do NOT add trailing slashes (❌ `http://localhost:5173/`)
   - Do NOT add paths (❌ `http://localhost:5173/routing`)
   - Just the origin (✅ `http://localhost:5173`)

4. **Authorized Redirect URIs (Optional)**

   For Google Identity Services, you typically DON'T need redirect URIs, but if prompted, add:

   ```
   http://localhost:5173
   https://your-netlify-app.netlify.app
   ```

5. **Click SAVE**

   ⚠️ **Important**: Changes can take 5-10 minutes to propagate!

## Step 3: Test the Integration

1. Clear your browser cache or use an incognito window
2. Go to your app's routing page
3. Click "Push to Calendars"
4. You should now see the Google sign-in popup without errors

## Common Issues

### Issue: Still getting the error after adding URLs
**Solution**: Wait 5-10 minutes for Google's changes to propagate, then try again in a new incognito window

### Issue: Different port number
**Solution**: Check your app's actual URL in the browser address bar and add that exact URL to authorized origins

### Issue: Error says "invalid client"
**Solution**: Make sure you're using the correct Client ID. The one configured in the app is:
```
1069061948061-roq457in5ig4hnbd1hq8pt4n5jkl0if6.apps.googleusercontent.com
```

## Quick Reference

**Your Google Project ID**: `project-1069061948061`

**Your OAuth Client ID**:
```
1069061948061-roq457in5ig4hnbd1hq8pt4n5jkl0if6.apps.googleusercontent.com
```

**Scopes Required**:
- `https://www.googleapis.com/auth/calendar.events` (Read/Write calendar events)

## Need to Create a New OAuth Client?

If you need to create a fresh OAuth client:

1. Go to: https://console.cloud.google.com/apis/credentials
2. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
3. Select **Web application**
4. Add your authorized JavaScript origins (see step 2 above)
5. Click **CREATE**
6. Copy the new Client ID and update it in `mitapp-react/src/config/firebase.js`

## Testing Checklist

- [ ] Added localhost URL to authorized origins
- [ ] Added production URL to authorized origins
- [ ] Waited 5-10 minutes after saving
- [ ] Tested in incognito window
- [ ] Successfully signed in with Google
- [ ] Successfully pushed routes to calendar

## Support

If you're still having issues:
1. Double-check the exact URL in your browser address bar
2. Make sure that URL is in the authorized origins list
3. Try in an incognito window
4. Check the browser console for detailed error messages
