import { useState, useEffect } from 'react';
import Layout from '../components/common/Layout';
import { useAuth } from '../contexts/AuthContext';
import firebaseService from '../services/firebaseService';

const Fleet = () => {
  const { currentUser } = useAuth();
  const [fleetData, setFleetData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    available: 0,
    unassigned: 0,
    inRepairs: 0
  });

  useEffect(() => {
    loadFleetData();
  }, []);

  const loadFleetData = async () => {
    try {
      setLoading(true);
      const vehicles = await firebaseService.loadFleetData();
      setFleetData(vehicles || []);

      // Calculate stats
      const available = vehicles.filter(v => v.status === 'Available').length;
      const unassigned = vehicles.filter(v => !v.assignedTo).length;
      const inRepairs = vehicles.filter(v => v.status === 'In Repairs').length;

      setStats({ available, unassigned, inRepairs });
    } catch (error) {
      console.error('Error loading fleet data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="tab-content active">
          <p>Loading fleet data...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div id="fleet-tab" className="tab-content active">
        <div className="tab-header">
          <h2>Fleet Management</h2>
        </div>

        {/* Fleet Stats */}
        <div className="dashboard-grid" style={{ marginBottom: '32px' }}>
          <div className="metric-card single-line">
            <div className="metric-header"><h3><i className="fas fa-car-side"></i> Available</h3></div>
            <span className="stat-value">{stats.available}</span>
          </div>
          <div className="metric-card single-line">
            <div className="metric-header"><h3><i className="fas fa-user-slash"></i> Unassigned</h3></div>
            <span className="stat-value">{stats.unassigned}</span>
          </div>
          <div className="metric-card single-line">
            <div className="metric-header"><h3><i className="fas fa-tools"></i> In Repairs</h3></div>
            <span className="stat-value">{stats.inRepairs}</span>
          </div>
        </div>

        {/* Fleet List */}
        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-truck"></i> Fleet Vehicles</h3>
          </div>
          <div className="table-container">
            {fleetData.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Truck #</th>
                    <th>Type</th>
                    <th>Assigned To</th>
                    <th>Status</th>
                    <th>Make/Model</th>
                    <th>Year</th>
                  </tr>
                </thead>
                <tbody>
                  {fleetData.map((vehicle, index) => (
                    <tr key={vehicle.id || index}>
                      <td><strong>{vehicle.truckNumber || 'N/A'}</strong></td>
                      <td>{vehicle.type || 'N/A'}</td>
                      <td>{vehicle.assignedTo || 'Unassigned'}</td>
                      <td>
                        <span className={`status-badge status-${(vehicle.status || 'unknown').toLowerCase().replace(' ', '-')}`}>
                          {vehicle.status || 'Unknown'}
                        </span>
                      </td>
                      <td>{vehicle.make && vehicle.model ? `${vehicle.make} ${vehicle.model}` : 'N/A'}</td>
                      <td>{vehicle.year || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ padding: '20px', textAlign: 'center' }}>No vehicles in fleet.</p>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Fleet;
