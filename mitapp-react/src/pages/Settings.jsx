import { useState, useEffect } from 'react';
import Layout from '../components/common/Layout';
import { useAuth } from '../contexts/AuthContext';

const Settings = () => {
  const { currentUser, updateUserProfile } = useAuth();
  const [activeSection, setActiveSection] = useState('profile');
  const [saving, setSaving] = useState(false);

  const [profileData, setProfileData] = useState({
    displayName: currentUser?.displayName || '',
    email: currentUser?.email || '',
    role: currentUser?.role || 'Technician',
    phone: currentUser?.phone || '',
    zone: currentUser?.zone || ''
  });

  const [appSettings, setAppSettings] = useState({
    theme: 'light',
    notificationsEnabled: true,
    emailNotifications: true,
    autoSave: true,
    compactView: false
  });

  // Load theme from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('appSettings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setAppSettings(prev => ({ ...prev, ...parsed }));
        // Apply theme immediately
        if (parsed.theme === 'dark') {
          document.body.classList.add('dark-mode');
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    }
  }, []);

  // Apply theme changes to document body
  useEffect(() => {
    if (appSettings.theme === 'dark') {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [appSettings.theme]);

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const sections = [
    { id: 'profile', name: 'Profile', icon: 'fa-user' },
    { id: 'password', name: 'Change Password', icon: 'fa-key' },
    { id: 'app', name: 'App Preferences', icon: 'fa-cog' },
    { id: 'data', name: 'Data Management', icon: 'fa-database' },
    { id: 'about', name: 'About', icon: 'fa-info-circle' }
  ];

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setProfileData(prev => ({ ...prev, [name]: value }));
  };

  const handleAppSettingChange = (setting, value) => {
    setAppSettings(prev => {
      const newSettings = typeof value !== 'undefined'
        ? { ...prev, [setting]: value }
        : { ...prev, [setting]: !prev[setting] };

      // Auto-save theme changes immediately
      if (setting === 'theme') {
        localStorage.setItem('appSettings', JSON.stringify(newSettings));
      }

      return newSettings;
    });
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      // In a real implementation, this would update the Firebase user profile
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
      alert('Profile updated successfully!');
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Error updating profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAppSettings = () => {
    setSaving(true);
    try {
      localStorage.setItem('appSettings', JSON.stringify(appSettings));
      setTimeout(() => {
        alert('Settings saved successfully!');
        setSaving(false);
      }, 500);
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Error saving settings. Please try again.');
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      alert('Please fill in all password fields');
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      alert('New passwords do not match');
      return;
    }

    if (passwordData.newPassword.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }

    setSaving(true);
    try {
      const { updateUserPassword } = await import('../contexts/AuthContext');
      const { getAuth, EmailAuthProvider, reauthenticateWithCredential, updatePassword } = await import('firebase/auth');

      const auth = getAuth();
      const user = auth.currentUser;

      if (!user || !user.email) {
        throw new Error('No authenticated user found');
      }

      // Re-authenticate user
      const credential = EmailAuthProvider.credential(user.email, passwordData.currentPassword);
      await reauthenticateWithCredential(user, credential);

      // Update password
      await updatePassword(user, passwordData.newPassword);

      alert('Password changed successfully!');
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
    } catch (error) {
      console.error('Error changing password:', error);
      if (error.code === 'auth/wrong-password') {
        alert('Current password is incorrect');
      } else if (error.code === 'auth/requires-recent-login') {
        alert('Please log out and log in again before changing your password');
      } else {
        alert('Error changing password. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const renderPasswordSection = () => (
    <div>
      <h3 style={{ marginBottom: '24px', fontSize: '20px' }}>Change Password</h3>
      <div style={{ maxWidth: '600px' }}>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Current Password</label>
          <input
            type="password"
            className="form-control"
            value={passwordData.currentPassword}
            onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
            placeholder="Enter current password"
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>New Password</label>
          <input
            type="password"
            className="form-control"
            value={passwordData.newPassword}
            onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
            placeholder="Enter new password (min 6 characters)"
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Confirm New Password</label>
          <input
            type="password"
            className="form-control"
            value={passwordData.confirmPassword}
            onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
            placeholder="Confirm new password"
          />
        </div>

        <button
          className="btn btn-primary"
          onClick={handleChangePassword}
          disabled={saving}
        >
          {saving ? 'Changing Password...' : 'Change Password'}
        </button>
      </div>
    </div>
  );

  const renderProfileSection = () => (
    <div>
      <h3 style={{ marginBottom: '24px', fontSize: '20px' }}>Profile Settings</h3>
      <div style={{ maxWidth: '600px' }}>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Display Name</label>
          <input
            type="text"
            name="displayName"
            className="form-control"
            value={profileData.displayName}
            onChange={handleProfileChange}
            placeholder="Your name"
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Email</label>
          <input
            type="email"
            name="email"
            className="form-control"
            value={profileData.email}
            onChange={handleProfileChange}
            placeholder="your.email@company.com"
            disabled
            style={{ backgroundColor: 'var(--surface-tertiary)', cursor: 'not-allowed' }}
          />
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Email cannot be changed</p>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Role</label>
          <select
            name="role"
            className="form-control"
            value={profileData.role}
            onChange={handleProfileChange}
          >
            <option value="Technician">Technician</option>
            <option value="MIT Tech">MIT Tech</option>
            <option value="MIT Lead">MIT Lead</option>
            <option value="Supervisor">Supervisor</option>
            <option value="Manager">Manager</option>
          </select>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Phone Number</label>
          <input
            type="tel"
            name="phone"
            className="form-control"
            value={profileData.phone}
            onChange={handleProfileChange}
            placeholder="(555) 123-4567"
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Assigned Zone</label>
          <input
            type="text"
            name="zone"
            className="form-control"
            value={profileData.zone}
            onChange={handleProfileChange}
            placeholder="e.g., North Houston"
          />
        </div>

        <button
          className="btn btn-primary"
          onClick={handleSaveProfile}
          disabled={saving}
        >
          <i className="fas fa-save"></i> {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </div>
    </div>
  );

  const renderAppPreferencesSection = () => (
    <div>
      <h3 style={{ marginBottom: '24px', fontSize: '20px' }}>App Preferences</h3>
      <div style={{ maxWidth: '600px' }}>
        <div style={{ marginBottom: '24px' }}>
          <h4 style={{ marginBottom: '16px' }}>Appearance</h4>

          {/* Dark Mode Toggle */}
          <div style={{ padding: '16px', backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '6px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>Dark Mode</strong>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Toggle between light and dark theme
                </p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={appSettings.theme === 'dark'}
                  onChange={(e) => handleAppSettingChange('theme', e.target.checked ? 'dark' : 'light')}
                />
                <span className="slider round"></span>
              </label>
            </div>
          </div>

          <div style={{ padding: '16px', backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '6px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>Compact View</strong>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Show more data in less space
                </p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={appSettings.compactView}
                  onChange={() => handleAppSettingChange('compactView')}
                />
                <span className="slider round"></span>
              </label>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <h4 style={{ marginBottom: '16px' }}>Notifications</h4>
          <div style={{ padding: '16px', backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '6px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>Enable Notifications</strong>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Receive in-app notifications
                </p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={appSettings.notificationsEnabled}
                  onChange={() => handleAppSettingChange('notificationsEnabled')}
                />
                <span className="slider round"></span>
              </label>
            </div>
          </div>

          <div style={{ padding: '16px', backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '6px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>Email Notifications</strong>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Receive email updates
                </p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={appSettings.emailNotifications}
                  onChange={() => handleAppSettingChange('emailNotifications')}
                />
                <span className="slider round"></span>
              </label>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <h4 style={{ marginBottom: '16px' }}>Data</h4>
          <div style={{ padding: '16px', backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '6px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>Auto-Save</strong>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Automatically save changes
                </p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={appSettings.autoSave}
                  onChange={() => handleAppSettingChange('autoSave')}
                />
                <span className="slider round"></span>
              </label>
            </div>
          </div>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleSaveAppSettings}
          disabled={saving}
        >
          <i className="fas fa-save"></i> {saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    </div>
  );

  const renderDataManagementSection = () => (
    <div>
      <h3 style={{ marginBottom: '24px', fontSize: '20px' }}>Data Management</h3>
      <div style={{ maxWidth: '600px' }}>
        <div style={{ marginBottom: '24px' }}>
          <h4 style={{ marginBottom: '16px' }}>Export Data</h4>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Export all your data to CSV or JSON format for backup or analysis.
          </p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-secondary">
              <i className="fas fa-file-csv"></i> Export to CSV
            </button>
            <button className="btn btn-secondary">
              <i className="fas fa-file-code"></i> Export to JSON
            </button>
          </div>
        </div>

        <div style={{ marginBottom: '24px', paddingTop: '24px', borderTop: '1px solid var(--border-color)' }}>
          <h4 style={{ marginBottom: '16px' }}>Backup & Restore</h4>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Create a complete backup of all application data or restore from a previous backup.
          </p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-secondary">
              <i className="fas fa-download"></i> Create Backup
            </button>
            <button className="btn btn-secondary">
              <i className="fas fa-upload"></i> Restore from Backup
            </button>
          </div>
        </div>

        <div style={{ marginBottom: '24px', paddingTop: '24px', borderTop: '1px solid var(--border-color)' }}>
          <h4 style={{ marginBottom: '16px', color: 'var(--danger-color)' }}>
            <i className="fas fa-exclamation-triangle"></i> Danger Zone
          </h4>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
            These actions cannot be undone. Please proceed with caution.
          </p>
          <button className="btn btn-danger">
            <i className="fas fa-trash"></i> Clear All Data
          </button>
        </div>
      </div>
    </div>
  );

  const renderAboutSection = () => (
    <div>
      <h3 style={{ marginBottom: '24px', fontSize: '20px' }}>About MIT App</h3>
      <div style={{ maxWidth: '600px' }}>
        <div style={{ padding: '24px', backgroundColor: 'var(--surface-secondary)', borderRadius: '8px', marginBottom: '24px' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <i className="fas fa-hard-hat" style={{ fontSize: '64px', color: 'var(--info-color)', marginBottom: '16px' }}></i>
            <h2 style={{ margin: 0, marginBottom: '8px' }}>MIT Management App</h2>
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Version 2.0.0</p>
          </div>

          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
            <h4 style={{ marginBottom: '16px' }}>Features</h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li style={{ padding: '8px 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <i className="fas fa-check-circle" style={{ color: 'var(--success-color)' }}></i>
                Fleet Management with real-time tracking
              </li>
              <li style={{ padding: '8px 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <i className="fas fa-check-circle" style={{ color: 'var(--success-color)' }}></i>
                Equipment & Tools Inventory
              </li>
              <li style={{ padding: '8px 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <i className="fas fa-check-circle" style={{ color: 'var(--success-color)' }}></i>
                Damage Tracking & Cost Analysis
              </li>
              <li style={{ padding: '8px 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <i className="fas fa-check-circle" style={{ color: 'var(--success-color)' }}></i>
                Team & Zone Management
              </li>
              <li style={{ padding: '8px 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <i className="fas fa-check-circle" style={{ color: 'var(--success-color)' }}></i>
                Labor Forecasting & Planning
              </li>
              <li style={{ padding: '8px 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <i className="fas fa-check-circle" style={{ color: 'var(--success-color)' }}></i>
                Comprehensive Reporting & Analytics
              </li>
            </ul>
          </div>

          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', marginTop: '20px' }}>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, textAlign: 'center' }}>
              © 2024 MIT Management App. All rights reserved.
            </p>
          </div>
        </div>

        <div style={{ marginTop: '24px' }}>
          <h4 style={{ marginBottom: '16px' }}>System Information</h4>
          <div style={{ backgroundColor: 'var(--surface-secondary)', padding: '16px', borderRadius: '6px' }}>
            <table style={{ width: '100%', borderSpacing: '0 8px' }}>
              <tbody>
                <tr>
                  <td style={{ color: 'var(--text-secondary)', paddingRight: '16px' }}>Last Updated:</td>
                  <td style={{ fontWeight: '500' }}>{new Date().toLocaleDateString()}</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--text-secondary)', paddingRight: '16px' }}>Platform:</td>
                  <td style={{ fontWeight: '500' }}>Web Application</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--text-secondary)', paddingRight: '16px' }}>Database:</td>
                  <td style={{ fontWeight: '500' }}>Firebase Firestore</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--text-secondary)', paddingRight: '16px' }}>Browser:</td>
                  <td style={{ fontWeight: '500' }}>{navigator.userAgent.split(' ').slice(-1)[0]}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeSection) {
      case 'profile':
        return renderProfileSection();
      case 'password':
        return renderPasswordSection();
      case 'app':
        return renderAppPreferencesSection();
      case 'data':
        return renderDataManagementSection();
      case 'about':
        return renderAboutSection();
      default:
        return null;
    }
  };

  return (
    <Layout>
      <div className="tab-content active">
        <div className="tab-header">
          <h2>Settings</h2>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '250px 1fr',
          gap: '24px',
          minHeight: '600px'
        }}>
          {/* Settings Sidebar */}
          <div className="card" style={{ height: 'fit-content' }}>
            <div className="card-header">
              <h3><i className="fas fa-sliders-h"></i> Categories</h3>
            </div>
            <div style={{ padding: '0' }}>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {sections.map((section) => (
                  <li
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    style={{
                      padding: '12px 16px',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border-color)',
                      backgroundColor: activeSection === section.id ? 'var(--active-bg)' : 'transparent',
                      color: activeSection === section.id ? 'var(--info-color)' : 'var(--text-primary)',
                      fontWeight: activeSection === section.id ? '600' : '400',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (activeSection !== section.id) {
                        e.target.style.backgroundColor = 'var(--surface-secondary)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (activeSection !== section.id) {
                        e.target.style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    <i className={`fas ${section.icon}`} style={{ marginRight: '8px', width: '20px' }}></i>
                    {section.name}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Settings Content */}
          <div className="card">
            <div style={{ padding: '24px' }}>
              {renderContent()}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Settings;
