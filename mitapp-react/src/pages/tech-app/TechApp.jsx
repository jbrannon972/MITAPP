import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import TechCalendar from '../../components/tech-app/TechCalendar';
import TechTeam from '../../components/tech-app/TechTeam';
import TechReport from '../../components/tech-app/TechReport';
import '../../styles/tech-app.css';
import '../../styles/tech-calendar.css';
import '../../styles/tech-report.css';
import '../../styles/tech-team.css';

const TechApp = () => {
  const [activeTab, setActiveTab] = useState('calendar');
  const [showSettings, setShowSettings] = useState(false);
  const { currentUser, logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const tabs = [
    { id: 'calendar', label: 'Schedule', icon: 'fa-calendar-alt' },
    { id: 'team', label: 'Team', icon: 'fa-users' },
    { id: 'report', label: 'Report', icon: 'fa-clipboard-check' },
    { id: 'profile', label: 'Profile', icon: 'fa-user-circle' }
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'calendar':
        return <TechCalendar />;
      case 'team':
        return <TechTeam />;
      case 'report':
        return <TechReport />;
      case 'profile':
        return (
          <div className="tech-profile-view">
            <div className="tech-profile-card">
              <div className="tech-profile-avatar">
                <i className="fas fa-user-circle"></i>
              </div>
              <h2>{currentUser?.username || 'Technician'}</h2>
              <p className="tech-profile-role">Field Technician</p>
            </div>

            <div className="tech-settings-section">
              <h3>Settings</h3>
              <div className="tech-settings-list">
                <button className="tech-settings-item">
                  <i className="fas fa-bell"></i>
                  <span>Notifications</span>
                  <i className="fas fa-chevron-right"></i>
                </button>
                <button className="tech-settings-item">
                  <i className="fas fa-moon"></i>
                  <span>Dark Mode</span>
                  <i className="fas fa-chevron-right"></i>
                </button>
                <button className="tech-settings-item">
                  <i className="fas fa-language"></i>
                  <span>Language</span>
                  <i className="fas fa-chevron-right"></i>
                </button>
              </div>
            </div>

            <button className="tech-logout-btn-full" onClick={handleLogout}>
              <i className="fas fa-sign-out-alt"></i> Logout
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="tech-app-container modern">
      <header className="tech-header-modern">
        <div className="tech-header-content">
          <h1>
            <i className="fas fa-hard-hat"></i> HOU Mitigation
          </h1>
          <div className="tech-header-user">
            <span className="tech-user-name">{currentUser?.username?.split(' ')[0] || 'Tech'}</span>
          </div>
        </div>
      </header>

      <main className="tech-main-modern">
        <div className="tech-content-wrapper-modern">
          {renderContent()}
        </div>
      </main>

      <nav className="tech-bottom-nav">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tech-nav-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <i className={`fas ${tab.icon}`}></i>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

export default TechApp;
