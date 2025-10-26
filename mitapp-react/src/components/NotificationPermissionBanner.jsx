import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const NotificationPermissionBanner = () => {
  const { currentUser, notificationPermission, requestNotificationPermission } = useAuth();
  const [isDismissed, setIsDismissed] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);

  // Only show for MIT Lead, Second Shift Lead, or Manager who haven't granted permission
  const shouldShow =
    !isDismissed &&
    currentUser &&
    (currentUser.role === 'MIT Lead' || currentUser.role === 'Second Shift Lead' || currentUser.role === 'Manager') &&
    notificationPermission !== 'granted' &&
    notificationPermission !== 'denied';

  if (!shouldShow) return null;

  const handleEnableNotifications = async () => {
    setIsRequesting(true);
    try {
      const granted = await requestNotificationPermission();
      if (granted) {
        setIsDismissed(true);
      }
    } finally {
      setIsRequesting(false);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
  };

  const getReminderTime = () => {
    if (currentUser.role === 'MIT Lead') return '4:15 PM';
    if (currentUser.role === 'Second Shift Lead') return '9:45 PM';
    return '';
  };

  const getBannerMessage = () => {
    if (currentUser.role === 'Manager') {
      return 'Get notified when damage reports are submitted';
    }
    return `Get notified at ${getReminderTime()} each day to submit your daily report`;
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      backgroundColor: '#3b82f6',
      color: 'white',
      padding: '12px 16px',
      zIndex: 1000,
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: '12px'
    }}>
      <div style={{ flex: 1, minWidth: '250px' }}>
        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
          {currentUser.role === 'Manager' ? 'Enable Damage Notifications' : 'Enable Daily Report Reminders'}
        </div>
        <div style={{ fontSize: '14px', opacity: 0.95 }}>
          {getBannerMessage()}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          onClick={handleEnableNotifications}
          disabled={isRequesting}
          style={{
            backgroundColor: 'white',
            color: '#3b82f6',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            fontWeight: 'bold',
            cursor: isRequesting ? 'not-allowed' : 'pointer',
            opacity: isRequesting ? 0.7 : 1,
            transition: 'opacity 0.2s'
          }}
        >
          {isRequesting ? 'Enabling...' : 'Enable Notifications'}
        </button>

        <button
          onClick={handleDismiss}
          disabled={isRequesting}
          style={{
            backgroundColor: 'transparent',
            color: 'white',
            border: '1px solid white',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: isRequesting ? 'not-allowed' : 'pointer',
            opacity: isRequesting ? 0.5 : 1,
            transition: 'opacity 0.2s'
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};

export default NotificationPermissionBanner;
