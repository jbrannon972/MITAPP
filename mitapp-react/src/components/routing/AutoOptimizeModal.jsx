const AutoOptimizeModal = ({
  isOpen,
  onClose,
  onOptimize,
  mapboxToken,
  onMapboxTokenChange,
  onSaveToken,
  unassignedJobsCount = 0
}) => {
  if (!isOpen) return null;

  const handleOptimize = () => {
    try {
      if (!mapboxToken) {
        alert('Please enter a Mapbox API token before optimizing.');
        return;
      }
      onOptimize();
    } catch (error) {
      console.error('Error starting optimization:', error);
      alert(`Error starting optimization: ${error.message}`);
    }
  };

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3><i className="fas fa-magic"></i> Automatic Route Optimization</h3>
          <button className="modal-close" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: '20px', color: 'var(--text-secondary)' }}>
            The optimizer will automatically assign all {unassignedJobsCount} unassigned jobs to technicians and optimize their routes.
          </p>

          <div style={{
            marginBottom: '20px',
            padding: '16px',
            backgroundColor: 'var(--surface-secondary)',
            borderRadius: '8px'
          }}>
            <h4 style={{ margin: 0, marginBottom: '12px' }}>What the optimizer does:</h4>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px' }}>
              <li>Balances workload across available technicians</li>
              <li>Optimizes route order to minimize drive time</li>
              <li>Respects job timeframe windows</li>
              <li>Keeps techs in their zones when possible</li>
              <li>Auto-assigns demo techs to 2-person jobs</li>
              <li>Excludes Management and MIT Leads (except 2nd shift)</li>
            </ul>
          </div>

          <div className="form-group">
            <label htmlFor="mapboxToken">
              Mapbox API Token
              <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                (Required for drive time calculations)
              </span>
            </label>
            <input
              type="text"
              id="mapboxToken"
              className="form-control"
              value={mapboxToken}
              onChange={(e) => onMapboxTokenChange(e.target.value)}
              placeholder="pk.your-mapbox-token-here"
            />
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Get a free token at{' '}
              <a href="https://www.mapbox.com" target="_blank" rel="noopener noreferrer">
                mapbox.com
              </a>
            </p>
          </div>

          {mapboxToken && (
            <button
              className="btn btn-secondary"
              onClick={onSaveToken}
              style={{ marginBottom: '16px' }}
            >
              <i className="fas fa-save"></i> Save Token
            </button>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-success"
            onClick={handleOptimize}
            disabled={!mapboxToken}
          >
            <i className="fas fa-magic"></i> Optimize Routes
          </button>
        </div>
      </div>
    </div>
  );
};

export default AutoOptimizeModal;
