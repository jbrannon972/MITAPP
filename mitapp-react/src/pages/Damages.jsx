import { useState, useEffect } from 'react';
import Layout from '../components/common/Layout';
import firebaseService from '../services/firebaseService';

const Damages = () => {
  const [damages, setDamages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDamages();
  }, []);

  const loadDamages = async () => {
    try {
      setLoading(true);
      const data = await firebaseService.getDocument('hou_damages', 'damage_reports');
      setDamages(data?.reports || []);
    } catch (error) {
      console.error('Error loading damages:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <Layout>
        <div className="tab-content active">
          <p>Loading damages data...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div id="damages-tab" className="tab-content active">
        <div className="tab-header">
          <h2>Damages Tracking</h2>
        </div>

        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-car-crash"></i> Damage Reports</h3>
          </div>
          <div className="table-container">
            {damages.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Technician</th>
                    <th>Vehicle/Equipment</th>
                    <th>Description</th>
                    <th>Status</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {damages.map((damage, index) => (
                    <tr key={damage.id || index}>
                      <td>{formatDate(damage.date)}</td>
                      <td>{damage.technician || 'N/A'}</td>
                      <td>{damage.vehicle || damage.equipment || 'N/A'}</td>
                      <td>{damage.description || 'No description'}</td>
                      <td>
                        <span className={`status-badge status-${(damage.status || 'pending').toLowerCase()}`}>
                          {damage.status || 'Pending'}
                        </span>
                      </td>
                      <td>{damage.cost ? `$${damage.cost.toFixed(2)}` : 'TBD'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ padding: '20px', textAlign: 'center' }}>No damage reports found.</p>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Damages;
