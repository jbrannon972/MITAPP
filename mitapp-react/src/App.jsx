import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { DataProvider } from './contexts/DataContext';
import ProtectedRoute from './components/common/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import LaborForecasting from './pages/LaborForecasting';
import Team from './pages/Team';
import Calendar from './pages/Calendar';
import Fleet from './pages/Fleet';
import Equipment from './pages/Equipment';
import Tools from './pages/Tools';
import Analyzer from './pages/Analyzer';
import Damages from './pages/Damages';
import InstallDpt from './pages/InstallDpt';
import SlackMentions from './pages/SlackMentions';
import Admin from './pages/Admin';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Routing from './pages/Routing';
import TechApp from './pages/tech-app/TechApp';
import WarehouseApp from './pages/warehouse-app/WarehouseApp';
import './styles/styles.css';

function App() {
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

          <Route path="/fleet" element={
            <ProtectedRoute>
              <Fleet />
            </ProtectedRoute>
          } />

          <Route path="/equipment" element={
            <ProtectedRoute>
              <Equipment />
            </ProtectedRoute>
          } />

          <Route path="/tools" element={
            <ProtectedRoute>
              <Tools />
            </ProtectedRoute>
          } />

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

          <Route path="/slack" element={
            <ProtectedRoute>
              <SlackMentions />
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
