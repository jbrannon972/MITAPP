import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const Navigation = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const navigateTo = (path) => {
    navigate(path);
    setMobileMenuOpen(false);
  };

  const isActive = (path) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  // Define navigation items based on role
  const getNavItems = () => {
    const role = currentUser?.role;
    const navItems = [];

    // Dashboard - everyone has access
    navItems.push({ path: '/', label: 'Dashboard', icon: 'fa-th-large' });

    // Forecasting - only Manager and Auditor
    if (role === 'Manager' || role === 'Auditor') {
      navItems.push({ path: '/forecasting', label: 'Forecasting', icon: 'fa-chart-line' });
    }

    // Team - everyone except Fleet
    if (role !== 'Fleet') {
      navItems.push({ path: '/team', label: 'Team', icon: 'fa-users' });
    }

    // Warehouse/Fleet/Equipment - everyone except Fleet Safety
    if (role !== 'Fleet Safety') {
      navItems.push({ path: '/fleet', label: 'Fleet', icon: 'fa-truck' });
      navItems.push({ path: '/equipment', label: 'Equipment', icon: 'fa-toolbox' });
      navItems.push({ path: '/tools', label: 'Tools', icon: 'fa-wrench' });
    }

    // Calendar - everyone except Fleet Safety
    if (role !== 'Fleet Safety') {
      navItems.push({ path: '/calendar', label: 'Calendar', icon: 'fa-calendar' });
    }

    // Analyzer - everyone except Fleet and Fleet Safety
    if (role !== 'Fleet' && role !== 'Fleet Safety') {
      navItems.push({ path: '/analyzer', label: 'Analyzer', icon: 'fa-chart-bar' });
    }

    // Damages - everyone except Fleet
    if (role !== 'Fleet') {
      navItems.push({ path: '/damages', label: 'Damages', icon: 'fa-car-crash' });
    }

    // Slack - everyone except Fleet
    if (role !== 'Fleet') {
      navItems.push({ path: '/slack', label: 'Slack', icon: 'fa-slack' });
    }

    // Reports - only Manager and Auditor
    if (role === 'Manager' || role === 'Auditor') {
      navItems.push({ path: '/reports', label: 'Reports', icon: 'fa-file-alt' });
    }

    return navItems;
  };

  const navItems = getNavItems();

  return (
    <div className="container">
      <div className="header-content">
        <div id="main-nav-container" className={mobileMenuOpen ? 'is-open' : ''}>
          <div className="nav-content">
            {navItems.map((item) => (
              <button
                key={item.path}
                className={`nav-btn ${isActive(item.path) ? 'active' : ''}`}
                onClick={() => navigateTo(item.path)}
              >
                <i className={`fas ${item.icon}`}></i>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          <div className="header-controls">
            {currentUser?.role === 'Manager' && (
              <button
                id="admin-panel-btn"
                className="btn btn-secondary"
                onClick={() => navigateTo('/admin')}
              >
                <i className="fas fa-users-cog"></i> Admin
              </button>
            )}
            <button
              id="settings-btn"
              className="btn btn-secondary"
              onClick={() => navigateTo('/settings')}
            >
              <i className="fas fa-cog"></i> Settings
            </button>
            <button
              id="logout-btn"
              className="btn btn-primary nav-logout-btn"
              onClick={handleLogout}
            >
              <i className="fas fa-sign-out-alt"></i> Logout
            </button>
          </div>
        </div>

        <button
          className="hamburger-menu"
          aria-label="Open navigation menu"
          onClick={toggleMobileMenu}
        >
          <i className="fas fa-bars"></i>
        </button>
      </div>
    </div>
  );
};

export default Navigation;
