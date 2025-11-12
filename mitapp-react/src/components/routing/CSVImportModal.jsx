import { useRef } from 'react';

const CSVImportModal = ({ isOpen, onClose, onImport }) => {
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    try {
      onImport(e);
      onClose();
    } catch (error) {
      console.error('Error importing CSV:', error);
      alert(`Error importing CSV: ${error.message}\n\nPlease check the file format and try again.`);
    }
  };

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3><i className="fas fa-upload"></i> Import Daily Jobs</h3>
          <button className="modal-close" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
            Select your daily export CSV file. The file should include customer info, addresses, timeframes, durations, and zone assignments.
          </p>
          <div style={{ marginBottom: '20px' }}>
            <label
              htmlFor="csvFile"
              className="btn btn-secondary"
              style={{ cursor: 'pointer', display: 'inline-block' }}
            >
              <i className="fas fa-file-csv"></i> Choose CSV File
            </label>
            <input
              ref={fileInputRef}
              type="file"
              id="csvFile"
              accept=".csv"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </div>
          <div style={{
            padding: '12px',
            backgroundColor: 'var(--active-bg)',
            borderRadius: '6px',
            fontSize: '14px'
          }}>
            <strong>Houston Branch CSV Format:</strong>
            <ul style={{ marginTop: '8px', marginBottom: 0, paddingLeft: '20px' }}>
              <li>text (Job ID)</li>
              <li>route_title (Customer Name | Job Type)</li>
              <li>customer_address (Houston area)</li>
              <li>Zone</li>
              <li>duration (hours)</li>
              <li>workers (assigned workers array)</li>
              <li>route_description (includes TF(HH:MM-HH:MM))</li>
            </ul>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default CSVImportModal;
