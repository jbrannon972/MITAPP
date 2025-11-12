import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true); // Default to true to keep users logged in
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const { login, resetPassword, currentUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // If already logged in, redirect based on role
    if (currentUser) {
      if (['Tech', 'MIT Tech', 'Demo Tech'].includes(currentUser.role)) {
        navigate('/tech-app');
      } else if (currentUser.role === 'Warehouse') {
        navigate('/warehouse-app');
      } else if (currentUser.role === 'Fleet Safety') {
        navigate('/team');
      } else {
        navigate('/');
      }
    }
  }, [currentUser, navigate]);

  const handleLogin = async (e) => {
    e?.preventDefault();
    setError('');
    setSuccess('');

    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    try {
      setLoading(true);
      const user = await login(email, password, rememberMe);

      // Navigate based on role
      if (['Tech', 'MIT Tech', 'Demo Tech'].includes(user.role)) {
        navigate('/tech-app');
      } else if (user.role === 'Warehouse') {
        navigate('/warehouse-app');
      } else if (user.role === 'Fleet Safety') {
        navigate('/team');
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError('');
    setSuccess('');

    if (!email) {
      setError('Please enter your email address to reset your password.');
      return;
    }

    try {
      await resetPassword(email);
      setSuccess('Password reset email sent! Please check your inbox and spam folder.');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleLogin();
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      backgroundColor: 'var(--background-color)'
    }}>
      <div className="login-container">
        <h1>
          <i className="fas fa-lock"></i> Entrusted Mitigation
        </h1>

        {error && (
          <div id="error-message" style={{ display: 'block' }}>
            {error}
          </div>
        )}

        {success && (
          <div id="success-message" style={{ display: 'block' }}>
            {success}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label htmlFor="username">Email</label>
            <input
              type="email"
              id="username"
              className="form-input"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              className="form-input"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={loading}
            />
          </div>

          <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center' }}>
            <input
              type="checkbox"
              id="rememberMe"
              style={{ width: 'auto', marginRight: '10px' }}
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              disabled={loading}
            />
            <label htmlFor="rememberMe" style={{ marginBottom: 0 }}>
              Remember Me
            </label>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>

          <a
            href="#"
            className="forgot-password"
            onClick={(e) => {
              e.preventDefault();
              handleForgotPassword();
            }}
          >
            Forgot Password?
          </a>
        </form>
      </div>

      <style>{`
        .login-container {
          padding: 40px;
          background: var(--surface-color);
          border-radius: var(--radius-xl);
          box-shadow: var(--shadow-lg);
          width: 100%;
          max-width: 420px;
          text-align: center;
        }
        .login-container h1 {
          font-family: 'Oswald', sans-serif;
          color: var(--primary-color);
          margin-bottom: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
        }
        .form-group {
          margin-bottom: 20px;
          text-align: left;
        }
        .form-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: 500;
        }
        .form-input {
          width: 100%;
        }
        #error-message, #success-message {
          padding: 12px;
          border-radius: var(--radius-md);
          margin-bottom: 20px;
          display: none;
        }
        #error-message {
          color: var(--danger-color);
          background-color: var(--danger-bg);
          border: 1px solid var(--danger-color);
        }
        #success-message {
          color: var(--success-color);
          background-color: var(--success-bg);
          border: 1px solid var(--success-color);
        }
        .forgot-password {
          display: block;
          margin-top: 15px;
          font-size: 14px;
          color: var(--text-secondary);
          cursor: pointer;
          text-decoration: none;
        }
        .forgot-password:hover {
          color: var(--primary-color);
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
};

export default Login;
