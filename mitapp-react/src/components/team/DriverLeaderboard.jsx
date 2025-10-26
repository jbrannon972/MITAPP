import { useState, useEffect } from 'react';
import { useData } from '../../contexts/DataContext';

const DriverLeaderboard = () => {
  const { staffingData, saveStaffingData } = useData();
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [password, setPassword] = useState('');
  const [editingDriver, setEditingDriver] = useState(null);

  useEffect(() => {
    const adminStatus = localStorage.getItem('leaderboardAdmin') === 'true';
    setIsAdmin(adminStatus);
  }, []);

  const eventKey = [
    { event: "Rolling Stop", rating: 3 },
    { event: "Following Too Close", rating: 3 },
    { event: "Hard Brake", rating: 3 },
    { event: "Speeding Above 15mph", rating: 5 },
    { event: "Smoking / Vaping", rating: 5 },
    { event: "Critical Distance", rating: 10 },
    { event: "No Seatbelt", rating: 10 },
    { event: "Cornering (hard turn)", rating: 10 },
    { event: "Rough / Uneven Surface", rating: 10 },
    { event: "Incident (small)", rating: 50 },
    { event: "Accident (large)", rating: 100 }
  ];

  const getSafetyRating = (rate) => {
    if (rate <= 9) return { label: 'Safe', className: 'rating-safe' };
    if (rate <= 29) return { label: 'Well', className: 'rating-well' };
    if (rate <= 79) return { label: 'Risky', className: 'rating-risky' };
    return { label: 'Danger', className: 'rating-danger' };
  };

  const getAllTechnicians = () => {
    if (!staffingData?.zones) return [];
    const techs = [];
    staffingData.zones.forEach(zone => {
      if (zone.lead) techs.push(zone.lead);
      if (zone.members) techs.push(...zone.members);
    });
    return techs;
  };

  const allDrivers = getAllTechnicians()
    .filter(tech => tech.driverScore && tech.driverScore.miles > 0)
    .map(tech => {
      const { alerts, eventScore, miles } = tech.driverScore;
      const totalScore = (alerts || 0) + (eventScore || 0);
      const rate = miles > 0 ? (totalScore / miles) * 1000 : 0;
      return { ...tech, rate };
    })
    .sort((a, b) => a.rate - b.rate);

  const handleLogin = () => {
    if (password === 'Safety1') {
      setIsAdmin(true);
      localStorage.setItem('leaderboardAdmin', 'true');
      setShowLoginModal(false);
      setPassword('');
    } else {
      alert('Incorrect password');
    }
  };

  const handleLogout = () => {
    setIsAdmin(false);
    localStorage.removeItem('leaderboardAdmin');
  };

  const handleSaveDriver = async () => {
    if (!editingDriver) return;

    const updatedZones = staffingData.zones.map(zone => {
      if (zone.lead && zone.lead.id === editingDriver.id) {
        return { ...zone, lead: editingDriver };
      }
      const memberIndex = zone.members.findIndex(m => m.id === editingDriver.id);
      if (memberIndex !== -1) {
        const updatedMembers = [...zone.members];
        updatedMembers[memberIndex] = editingDriver;
        return { ...zone, members: updatedMembers };
      }
      return zone;
    });

    await saveStaffingData({ ...staffingData, zones: updatedZones });
    setEditingDriver(null);
  };

  return (
    <div className="leaderboard-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
      <div className="leaderboard-main">
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3><i className="fas fa-trophy"></i> Safe Driver Rankings</h3>
            <div>
              {isAdmin ? (
                <button className="btn btn-secondary btn-small" onClick={handleLogout}>
                  <i className="fas fa-sign-out-alt"></i> Logout
                </button>
              ) : (
                <button className="btn btn-secondary btn-small" onClick={() => setShowLoginModal(true)}>
                  <i className="fas fa-lock"></i> Admin Login
                </button>
              )}
            </div>
          </div>
          <div className="table-container">
            <table className="data-table leaderboard-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Driver</th>
                  <th>Alerts</th>
                  <th>Event Score</th>
                  <th>Miles</th>
                  <th>Rate (1k mi)</th>
                  {isAdmin && <th>Edit</th>}
                </tr>
              </thead>
              <tbody>
                {allDrivers.length > 0 ? (
                  allDrivers.map((driver, index) => {
                    const rating = getSafetyRating(driver.rate);
                    return (
                      <tr key={driver.id} className={rating.className}>
                        <td data-label="Rank">
                          <span className={`rank-badge rank-${index + 1}`}>{index + 1}</span>
                        </td>
                        <td data-label="Driver">{driver.name}</td>
                        <td data-label="Alerts">{driver.driverScore.alerts || 0}</td>
                        <td data-label="Event Score">{driver.driverScore.eventScore || 0}</td>
                        <td data-label="Miles">{driver.driverScore.miles?.toLocaleString() || 0}</td>
                        <td data-label="Rate (1k mi)">{driver.rate.toFixed(2)}</td>
                        {isAdmin && (
                          <td data-label="Edit">
                            <button
                              className="btn btn-secondary btn-small"
                              onClick={() => setEditingDriver({...driver})}
                            >
                              Edit
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={isAdmin ? 7 : 6} style={{ textAlign: 'center', padding: '20px' }}>
                      No drivers have recorded scores yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="leaderboard-sidebar">
        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-key"></i> Event Key</h3>
          </div>
          <div className="key-list" style={{ padding: '16px' }}>
            {eventKey.map((item, index) => (
              <div key={index} className="key-item" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                <span className="key-event">{item.event}</span>
                <span className="key-rating" style={{ fontWeight: '600' }}>{item.rating} pts</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ marginTop: '20px' }}>
          <div className="card-header">
            <h3><i className="fas fa-tachometer-alt"></i> Rating Key</h3>
          </div>
          <div className="rating-key-list" style={{ padding: '16px' }}>
            <div className="rating-key-item rating-safe" style={{ padding: '8px', marginBottom: '8px', borderRadius: 'var(--radius-md)' }}>
              <strong>0-9:</strong> Safe
            </div>
            <div className="rating-key-item rating-well" style={{ padding: '8px', marginBottom: '8px', borderRadius: 'var(--radius-md)' }}>
              <strong>10-29:</strong> Well
            </div>
            <div className="rating-key-item rating-risky" style={{ padding: '8px', marginBottom: '8px', borderRadius: 'var(--radius-md)' }}>
              <strong>30-79:</strong> Risky
            </div>
            <div className="rating-key-item rating-danger" style={{ padding: '8px', borderRadius: 'var(--radius-md)' }}>
              <strong>80+:</strong> Danger
            </div>
          </div>
        </div>
      </div>

      {/* Login Modal */}
      {showLoginModal && (
        <div className="modal-overlay active" onClick={() => setShowLoginModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Leaderboard Admin Login</h3>
              <button className="modal-close" onClick={() => setShowLoginModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="leaderboardPassword">Password:</label>
                <input
                  type="password"
                  id="leaderboardPassword"
                  className="form-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowLoginModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleLogin}>Login</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Driver Modal */}
      {editingDriver && (
        <div className="modal-overlay active" onClick={() => setEditingDriver(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Scores for {editingDriver.name}</h3>
              <button className="modal-close" onClick={() => setEditingDriver(null)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label>Alerts</label>
                  <input
                    type="number"
                    className="form-input"
                    value={editingDriver.driverScore.alerts || 0}
                    onChange={(e) => setEditingDriver({
                      ...editingDriver,
                      driverScore: { ...editingDriver.driverScore, alerts: parseInt(e.target.value) || 0 }
                    })}
                  />
                </div>
                <div className="form-group">
                  <label>Event Score</label>
                  <input
                    type="number"
                    className="form-input"
                    value={editingDriver.driverScore.eventScore || 0}
                    onChange={(e) => setEditingDriver({
                      ...editingDriver,
                      driverScore: { ...editingDriver.driverScore, eventScore: parseInt(e.target.value) || 0 }
                    })}
                  />
                </div>
                <div className="form-group">
                  <label>Miles</label>
                  <input
                    type="number"
                    className="form-input"
                    value={editingDriver.driverScore.miles || 0}
                    onChange={(e) => setEditingDriver({
                      ...editingDriver,
                      driverScore: { ...editingDriver.driverScore, miles: parseInt(e.target.value) || 0 }
                    })}
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditingDriver(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveDriver}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverLeaderboard;
