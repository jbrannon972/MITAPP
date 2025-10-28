import { useState, useEffect } from 'react';
import firebaseService from '../../services/firebaseService';

const EditProfileModal = ({ person, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: person.name || '',
    role: person.role || 'MIT Tech',
    email: person.email || '',
    office: person.office || 'office_1',
    hireDate: person.hireDate || '',
    endDate: person.endDate || '',
    inTraining: person.inTraining || false,
    trainingEndDate: person.trainingEndDate || ''
  });
  const [evaluation, setEvaluation] = useState(null);
  const [driverScore, setDriverScore] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfileData();
  }, []);

  const loadProfileData = async () => {
    try {
      setLoading(true);

      // Load evaluation
      if (person.id) {
        const evalData = await firebaseService.getLatestEvaluation(person.id);
        if (evalData && evalData.ratings) {
          const ratings = Object.values(evalData.ratings);
          if (ratings.length === 8) {
            const total = ratings.reduce((sum, val) => sum + parseInt(val || 0), 0);
            const score = (total / 8).toFixed(2);
            let category, categoryClass;
            if (score >= 3.2) {
              category = '20';
              categoryClass = 'success';
            } else if (score >= 2.0) {
              category = '70';
              categoryClass = 'warning';
            } else {
              category = '10';
              categoryClass = 'danger';
            }
            setEvaluation({ score, category, categoryClass, date: evalData.createdAt });
          }
        }

        // Load driver score
        if (person.driverScore && person.driverScore.miles > 0) {
          const { alerts, eventScore, miles } = person.driverScore;
          const rate = ((alerts || 0) + (eventScore || 0)) / miles * 1000;
          let label, ratingClass;
          if (rate < 0.5) {
            label = 'Safe Driver';
            ratingClass = 'success';
          } else if (rate < 1.0) {
            label = 'Driving Well';
            ratingClass = 'warning';
          } else if (rate < 2.0) {
            label = 'Risky Driver';
            ratingClass = 'danger';
          } else {
            label = 'High Risk';
            ratingClass = 'danger';
          }
          setDriverScore({ rate: rate.toFixed(2), label, class: ratingClass });
        }

        // Load vehicle
        const fleetData = await firebaseService.loadFleetData();
        const assignedVehicle = fleetData.find(v => v.assignedTo === person.id);
        setVehicle(assignedVehicle);
      }
    } catch (error) {
      console.error('Error loading profile data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSave = async () => {
    try {
      await onSave({...person, ...formData});
      onClose();
    } catch (error) {
      console.error('Error saving profile:', error);
      alert('Error saving profile. Please try again.');
    }
  };

  const roleOptions = [
    'Manager', 'Supervisor', 'MIT Lead', 'MIT Tech', 'Demo Tech',
    'Fleet', 'Fleet Safety', 'Auditor', 'Warehouse'
  ];

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3><i className="fas fa-user-circle"></i> {person.name}</h3>
          <button className="modal-close" onClick={onClose}><i className="fas fa-times"></i></button>
        </div>
        <div className="modal-body">
          {/* Summary Boxes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
            <div>
              <h4 style={{ fontSize: '16px', marginTop: 0, marginBottom: '12px', color: 'var(--primary-color)', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                <i className="fas fa-chart-bar"></i> 70/20/10 Score
              </h4>
              {loading ? (
                <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: '#f8fafc' }}>
                  Loading...
                </div>
              ) : evaluation ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: evaluation.categoryClass === 'success' ? '#f0fdf4' : evaluation.categoryClass === 'warning' ? '#fffbeb' : '#fef2f2', color: evaluation.categoryClass === 'success' ? '#15803d' : evaluation.categoryClass === 'warning' ? '#b45309' : '#b91c1c' }}>
                  <div style={{ fontSize: '2em', fontWeight: '700' }}>{evaluation.score}</div>
                  <div>
                    <div style={{ fontWeight: '600' }}>Category: <strong>{evaluation.category}</strong></div>
                    <div style={{ fontSize: '0.9em', opacity: 0.8 }}>
                      Last Eval: {evaluation.date ? new Date(evaluation.date.seconds * 1000).toLocaleDateString() : 'N/A'}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: '#f8fafc' }}>
                  <p>No evaluation found.</p>
                </div>
              )}
            </div>
            <div>
              <h4 style={{ fontSize: '16px', marginTop: 0, marginBottom: '12px', color: 'var(--primary-color)', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                <i className="fas fa-tachometer-alt"></i> Driver Score
              </h4>
              {loading ? (
                <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: '#f8fafc' }}>
                  Loading...
                </div>
              ) : driverScore ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: driverScore.class === 'success' ? '#f0fdf4' : driverScore.class === 'warning' ? '#fffbeb' : '#fef2f2', color: driverScore.class === 'success' ? '#15803d' : driverScore.class === 'warning' ? '#b45309' : '#b91c1c' }}>
                  <div style={{ fontSize: '2em', fontWeight: '700' }}>{driverScore.rate}</div>
                  <div>
                    <div style={{ fontWeight: '600' }}>Rating: <strong>{driverScore.label}</strong></div>
                    <div style={{ fontSize: '0.9em', opacity: 0.8 }}>Rate per 1k miles</div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: '#f8fafc' }}>
                  <p>N/A</p>
                </div>
              )}
            </div>
          </div>

          {/* Core Details */}
          <h4 style={{ fontSize: '16px', marginTop: '20px', marginBottom: '12px', color: 'var(--primary-color)', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
            <i className="fas fa-user-circle"></i> Core Details
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label htmlFor="name">Full Name <span style={{ color: 'var(--danger-color)' }}>*</span></label>
              <input
                type="text"
                id="name"
                name="name"
                className="form-input"
                value={formData.name}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="role">Role <span style={{ color: 'var(--danger-color)' }}>*</span></label>
              <select
                id="role"
                name="role"
                className="form-input"
                value={formData.role}
                onChange={handleChange}
              >
                {roleOptions.map(role => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="office">
                Starting Office <span style={{ color: 'var(--danger-color)' }}>*</span>
                <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  (Used for route planning)
                </span>
              </label>
              <select
                id="office"
                name="office"
                className="form-input"
                value={formData.office}
                onChange={handleChange}
              >
                <option value="office_1">Conroe Office</option>
                <option value="office_2">Katy Office</option>
              </select>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', marginBottom: 0 }}>
                Determines the starting location for drive time calculations and route optimization
              </p>
            </div>
            <div className="form-group">
              <label htmlFor="email">
                Email (Gmail for Calendar)
                <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  (Required for route calendar integration)
                </span>
              </label>
              <input
                type="email"
                id="email"
                name="email"
                className="form-input"
                value={formData.email}
                onChange={handleChange}
                placeholder="e.g., cody.mccrorey@entrusted.com"
              />
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', marginBottom: 0 }}>
                This email is used to push route assignments to the technician's Google Calendar
              </p>
            </div>
            <div className="form-group">
              <label htmlFor="hireDate">Hire Date</label>
              <input
                type="date"
                id="hireDate"
                name="hireDate"
                className="form-input"
                value={formData.hireDate}
                onChange={handleChange}
                placeholder="mm/dd/yyyy"
              />
            </div>
            <div className="form-group">
              <label htmlFor="endDate">End Date</label>
              <input
                type="date"
                id="endDate"
                name="endDate"
                className="form-input"
                value={formData.endDate}
                onChange={handleChange}
                placeholder="mm/dd/yyyy"
              />
            </div>
          </div>

          {/* Status & Training */}
          <h4 style={{ fontSize: '16px', marginTop: '20px', marginBottom: '12px', color: 'var(--primary-color)', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
            <i className="fas fa-tasks"></i> Status & Training
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center' }}>
              <input
                type="checkbox"
                id="inTraining"
                name="inTraining"
                checked={formData.inTraining}
                onChange={handleChange}
                style={{ width: 'auto', marginRight: '8px' }}
              />
              <label htmlFor="inTraining" style={{ marginBottom: 0 }}>In Training?</label>
            </div>
            <div className="form-group">
              <label htmlFor="trainingEndDate">Training End Date</label>
              <input
                type="date"
                id="trainingEndDate"
                name="trainingEndDate"
                className="form-input"
                value={formData.trainingEndDate}
                onChange={handleChange}
                placeholder="mm/dd/yyyy"
              />
            </div>
          </div>

          {/* Assigned Vehicle */}
          <h4 style={{ fontSize: '16px', marginTop: '20px', marginBottom: '12px', color: 'var(--primary-color)', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
            <i className="fas fa-car"></i> Assigned Vehicle
          </h4>
          <p>
            {vehicle ? (
              <><strong>Truck #:</strong> {vehicle.truckNumber || vehicle.vehicleNumber} ({vehicle.type})</>
            ) : (
              'No vehicle assigned.'
            )}
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>
            <i className="fas fa-save"></i> Save Profile
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditProfileModal;
