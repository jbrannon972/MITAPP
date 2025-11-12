# PWA Logo Setup Instructions

The app is now configured as a Progressive Web App (PWA) and requires the logo file.

## Required File

Place the file **Elogo.png** in this directory (`/mitapp-react/public/`)

## Logo Requirements

For best PWA experience, the logo should be:
- **Format:** PNG with transparent background
- **Recommended size:** 512x512 pixels minimum
- **Aspect ratio:** Square (1:1)
- **File name:** `Elogo.png` (case-sensitive)

## Icon Sizes

The PWA will automatically use the logo for:
- 192x192 (Android home screen)
- 512x512 (App splash screen)
- Favicon (browser tab)
- Apple touch icon (iOS home screen)

## Optional: Multiple Sizes

For optimal quality across devices, you can create multiple sized versions:
- `icon-192.png` (192x192)
- `icon-512.png` (512x512)

If you provide multiple sizes, update `vite.config.js` to reference them.

## Current Status

⚠️ **Elogo.png is currently missing from this directory**

The PWA will still work, but users won't see the app icon until the logo is added.

Once you add the logo file:
1. Rebuild the app: `npm run build`
2. Redeploy to Netlify

The icon will then appear when users:
- Install the app to their home screen
- View the app in their browser tab
- See the splash screen on mobile
