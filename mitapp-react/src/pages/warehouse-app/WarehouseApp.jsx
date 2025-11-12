import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import WarehouseDashboard from '../../components/warehouse-app/WarehouseDashboard';
import WarehouseFleet from '../../components/warehouse-app/WarehouseFleet';
import WarehouseEquipment from '../../components/warehouse-app/WarehouseEquipment';
import WarehouseTools from '../../components/warehouse-app/WarehouseTools';
import WarehouseCalendar from '../../components/warehouse-app/WarehouseCalendar';
import WarehouseTeam from '../../components/warehouse-app/WarehouseTeam';
import '../../styles/warehouse-app.css';

const WarehouseApp = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
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
    { id: 'dashboard', label: 'Dashboard', icon: 'fa-th-large' },
    { id: 'fleet', label: 'Fleet', icon: 'fa-truck' },
    { id: 'equipment', label: 'Equipment', icon: 'fa-toolbox' },
    { id: 'tools', label: 'Tools', icon: 'fa-wrench' },
    { id: 'calendar', label: 'Calendar', icon: 'fa-calendar' },
    { id: 'team', label: 'Team', icon: 'fa-users' }
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <WarehouseDashboard />;
      case 'fleet':
        return <WarehouseFleet />;
      case 'equipment':
        return <WarehouseEquipment />;
      case 'tools':
        return <WarehouseTools />;
      case 'calendar':
        return <WarehouseCalendar />;
      case 'team':
        return <WarehouseTeam />;
      default:
        return null;
    }
  };

  return (
    <div className="warehouse-app-container">
      <header className="warehouse-header">
        <div className="warehouse-header-content">
          <h1>
            <i className="fas fa-warehouse"></i> Warehouse Dashboard
          </h1>
          <div className="warehouse-header-actions">
            <span className="warehouse-user">{currentUser?.username}</span>
            <button className="warehouse-logout-btn" onClick={handleLogout}>
              <i className="fas fa-sign-out-alt"></i> Logout
            </button>
          </div>
        </div>
      </header>

      <main className="warehouse-main">
        <nav className="warehouse-tab-nav">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`warehouse-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <i className={`fas ${tab.icon}`}></i>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="warehouse-content-wrapper">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default WarehouseApp;
