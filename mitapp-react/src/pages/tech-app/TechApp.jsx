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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
    { id: 'calendar', label: 'My Schedule', icon: 'fa-calendar' },
    { id: 'team', label: 'Team', icon: 'fa-users' },
    { id: 'report', label: 'Report', icon: 'fa-clipboard-list' }
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'calendar':
        return <TechCalendar />;
      case 'team':
        return <TechTeam />;
      case 'report':
        return <TechReport />;
      default:
        return null;
    }
  };

  return (
    <div className="tech-app-container">
      <header className="tech-header">
        <div className="tech-header-content">
          <h1>
            <i className="fas fa-tools"></i> HOU Mitigation
          </h1>
          <button className="tech-logout-btn" onClick={handleLogout}>
            <i className="fas fa-sign-out-alt"></i>
          </button>
        </div>
      </header>

      <main className="tech-main">
        <div className="tech-tab-nav">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`tech-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <i className={`fas ${tab.icon}`}></i>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="tech-content-wrapper">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default TechApp;
