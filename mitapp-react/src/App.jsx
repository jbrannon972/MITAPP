import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { DataProvider } from './contexts/DataContext';
import ProtectedRoute from './components/common/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import LaborForecasting from './pages/LaborForecasting';
import Team from './pages/Team';
import Calendar from './pages/Calendar';
import Warehouse from './pages/Warehouse';
import Analyzer from './pages/Analyzer';
import Damages from './pages/Damages';
import InstallDpt from './pages/InstallDpt';
import Admin from './pages/Admin';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Routing from './pages/Routing';
import TechApp from './pages/tech-app/TechApp';
import WarehouseApp from './pages/warehouse-app/WarehouseApp';
import './styles/styles.css';
import './styles/theme-overrides.css';

function App() {
  // Set dark theme as default on app load
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    document.body.setAttribute('data-theme', savedTheme);
  }, []);

  return (
    <AuthProvider>
      <DataProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />

          <Route path="/" element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } />

          <Route path="/forecasting" element={
            <ProtectedRoute requiredRoles={['Manager', 'Auditor']}>
              <LaborForecasting />
            </ProtectedRoute>
          } />

          <Route path="/team" element={
            <ProtectedRoute>
              <Team />
            </ProtectedRoute>
          } />

          <Route path="/calendar" element={
            <ProtectedRoute>
              <Calendar />
            </ProtectedRoute>
          } />

          <Route path="/warehouse" element={
            <ProtectedRoute>
              <Warehouse />
            </ProtectedRoute>
          } />

          {/* Redirect old routes to warehouse */}
          <Route path="/fleet" element={<Navigate to="/warehouse" replace />} />
          <Route path="/equipment" element={<Navigate to="/warehouse" replace />} />
          <Route path="/tools" element={<Navigate to="/warehouse" replace />} />

          <Route path="/analyzer" element={
            <ProtectedRoute>
              <Analyzer />
            </ProtectedRoute>
          } />

          <Route path="/damages" element={
            <ProtectedRoute>
              <Damages />
            </ProtectedRoute>
          } />

          <Route path="/install-dpt" element={
            <ProtectedRoute>
              <InstallDpt />
            </ProtectedRoute>
          } />

          <Route path="/admin" element={
            <ProtectedRoute requiredRoles={['Manager']}>
              <Admin />
            </ProtectedRoute>
          } />

          <Route path="/reports" element={
            <ProtectedRoute requiredRoles={['Manager', 'Auditor']}>
              <Reports />
            </ProtectedRoute>
          } />

          <Route path="/settings" element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          } />

          <Route path="/routing" element={
            <ProtectedRoute>
              <Routing />
            </ProtectedRoute>
          } />

          <Route path="/tech-app" element={
            <ProtectedRoute requiredRoles={['Tech', 'MIT Tech', 'Demo Tech']}>
              <TechApp />
            </ProtectedRoute>
          } />

          <Route path="/warehouse-app" element={
            <ProtectedRoute requiredRoles={['Warehouse']}>
              <WarehouseApp />
            </ProtectedRoute>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Router>
      </DataProvider>
    </AuthProvider>
  );
}

export default App;
