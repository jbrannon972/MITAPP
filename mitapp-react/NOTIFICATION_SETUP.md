# Push Notification Setup Instructions

This app uses Firebase Cloud Messaging (FCM) to send push notifications to users.

## Required: Generate VAPID Key

To enable push notifications, you need to generate a VAPID key from the Firebase Console:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `mit-foreasting`
3. Click on the gear icon (Settings) → Project settings
4. Go to the "Cloud Messaging" tab
5. Scroll down to "Web configuration"
6. Under "Web Push certificates", click "Generate key pair"
7. Copy the generated key

## Update the Code

Once you have your VAPID key, update it in:

**File:** `/src/services/notificationService.js`

Find this line (around line 58):
```javascript
vapidKey: 'REPLACE_WITH_YOUR_VAPID_KEY'
```

Replace `'REPLACE_WITH_YOUR_VAPID_KEY'` with your actual VAPID key.

## How It Works

### Automatic Reminders

The app automatically schedules daily reminders based on user roles:

- **MIT Lead**: Receives notification at **4:15 PM** daily to submit their MIT Lead report
- **Second Shift Lead**: Receives notification at **9:45 PM** daily to submit their Second Shift report

### Notification Permission

When an MIT Lead or Second Shift Lead logs in, they'll see a blue banner at the top of the screen asking them to enable notifications. They can:
- Click "Enable Notifications" to grant permission
- Click "Dismiss" to hide the banner

### Testing Notifications

To test the notifications:

1. Log in as a user with role "MIT Lead" or "Second Shift Lead"
2. Click "Enable Notifications" when the banner appears
3. Grant notification permission when prompted by the browser
4. The app will automatically schedule daily reminders

For immediate testing, you can temporarily modify the time in:
- `/src/services/notificationService.js`
- In the `setupRoleBasedNotifications()` function
- Change the time to a few minutes from now (e.g., if it's 3:45 PM, set it to "15:47")

## Troubleshooting

### Notifications not working?

1. **Check browser support**: Push notifications work in most modern browsers but not all (e.g., iOS Safari has limited support)
2. **Check permission**: Make sure you granted notification permission
3. **Check VAPID key**: Ensure the VAPID key is correctly set in `notificationService.js`
4. **Check console**: Open browser DevTools and check for errors in the console
5. **Service Worker**: Check that the service worker is registered (in DevTools → Application → Service Workers)

### FCM Token Issues

If users aren't receiving notifications, check:
1. The FCM tokens are being saved to Firestore (collection: `fcm_tokens`)
2. The Firebase Cloud Messaging API is enabled in Google Cloud Console
3. The service worker is active and running

## Architecture

### Files Modified/Created

1. **`/src/config/firebase.js`** - Added Firebase Messaging initialization
2. **`/src/services/notificationService.js`** - Notification scheduling and permission handling
3. **`/public/firebase-messaging-sw.js`** - Service worker for background notifications
4. **`/src/components/NotificationPermissionBanner.jsx`** - UI for requesting permission
5. **`/src/contexts/AuthContext.jsx`** - Integration with auth system
6. **`/src/App.jsx`** - Added notification banner to app
7. **`vite.config.js`** - Added service worker to build

### How Scheduling Works

The app uses browser `setTimeout` to schedule local notifications:
1. When user logs in, calculate time until next reminder
2. Schedule a notification using `setTimeout`
3. When notification fires, reschedule for next day
4. Notifications persist across page reloads (rescheduled on login)

### Data Flow

1. User logs in → `AuthContext` initializes notifications
2. `notificationService` requests permission (if needed)
3. `notificationService` gets FCM token from Firebase
4. Token saved to Firestore (`fcm_tokens` collection)
5. `notificationService` schedules daily reminder based on role
6. At scheduled time, browser shows notification
7. User clicks notification → app opens/focuses

## Future Enhancements

Potential improvements:
- Server-side scheduling using Firebase Cloud Functions
- Notification history/log
- Custom notification sounds
- Snooze functionality
- Multiple reminder times
- Role-based notification preferences
