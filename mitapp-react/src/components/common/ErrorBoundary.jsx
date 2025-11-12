import { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });

    // You could send error to logging service here
    // Example: logErrorToService(error, errorInfo);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });

    // Optionally reload the page or navigate away
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      // Custom error UI
      return (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          backgroundColor: 'var(--surface-color)',
          borderRadius: '8px',
          margin: '20px'
        }}>
          <div style={{
            fontSize: '48px',
            color: 'var(--danger-color)',
            marginBottom: '16px'
          }}>
            <i className="fas fa-exclamation-triangle"></i>
          </div>
          <h2 style={{ margin: '0 0 16px 0', color: 'var(--text-primary)' }}>
            {this.props.title || 'Something went wrong'}
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
            {this.props.message || 'An unexpected error occurred. Please try again.'}
          </p>

          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details style={{
              marginBottom: '24px',
              padding: '16px',
              backgroundColor: 'var(--surface-secondary)',
              borderRadius: '6px',
              textAlign: 'left',
              maxWidth: '600px',
              margin: '0 auto 24px auto'
            }}>
              <summary style={{ cursor: 'pointer', fontWeight: '600', marginBottom: '8px' }}>
                Error Details (Development Mode)
              </summary>
              <pre style={{
                fontSize: '12px',
                overflow: 'auto',
                padding: '12px',
                backgroundColor: 'var(--surface-color)',
                borderRadius: '4px',
                marginTop: '8px'
              }}>
                {this.state.error.toString()}
                {'\n\n'}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              className="btn btn-primary"
              onClick={this.handleReset}
            >
              <i className="fas fa-redo"></i> Try Again
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => window.location.reload()}
            >
              <i className="fas fa-sync"></i> Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
