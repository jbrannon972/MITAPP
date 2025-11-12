import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const ProtectedRoute = ({ children, requiredRoles = [] }) => {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loader"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  // SECURITY: Define non-supervisor roles that should be blocked from supervisor routes
  const nonSupervisorRoles = ['Tech', 'MIT Tech', 'Demo Tech', 'Warehouse'];

  // If requiredRoles is empty, this is a supervisor route - block Tech and Warehouse
  if (requiredRoles.length === 0) {
    if (nonSupervisorRoles.includes(currentUser.role)) {
      // Redirect to appropriate app based on role
      if (currentUser.role === 'Warehouse') {
        return <Navigate to="/warehouse-app" replace />;
      } else if (nonSupervisorRoles.includes(currentUser.role)) {
        return <Navigate to="/tech-app" replace />;
      }
    }
    // User has supervisor role, allow access
    return children;
  }

  // If requiredRoles is specified, check if user has one of the required roles
  if (!requiredRoles.includes(currentUser.role)) {
    // User doesn't have required role - redirect to their appropriate app
    if (currentUser.role === 'Warehouse') {
      return <Navigate to="/warehouse-app" replace />;
    } else if (nonSupervisorRoles.includes(currentUser.role)) {
      return <Navigate to="/tech-app" replace />;
    } else {
      // Supervisor trying to access restricted supervisor route (e.g., Manager-only)
      return <Navigate to="/" replace />;
    }
  }

  return children;
};

export default ProtectedRoute;
