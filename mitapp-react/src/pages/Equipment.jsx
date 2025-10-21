import { useState, useEffect } from 'react';
import Layout from '../components/common/Layout';
import firebaseService from '../services/firebaseService';

const Equipment = () => {
  const [equipmentData, setEquipmentData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEquipmentData();
  }, []);

  const loadEquipmentData = async () => {
    try {
      setLoading(true);
      const equipment = await firebaseService.getEquipment();
      setEquipmentData(equipment || []);
    } catch (error) {
      console.error('Error loading equipment data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="tab-content active">
          <p>Loading equipment data...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div id="equipment-tab" className="tab-content active">
        <div className="tab-header">
          <h2>Equipment Management</h2>
        </div>

        {/* Equipment List */}
        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-toolbox"></i> Equipment Inventory</h3>
          </div>
          <div className="table-container">
            {equipmentData.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item #</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Assigned To</th>
                    <th>Status</th>
                    <th>Location</th>
                  </tr>
                </thead>
                <tbody>
                  {equipmentData.map((item, index) => (
                    <tr key={item.id || index}>
                      <td><strong>{item.itemNumber || 'N/A'}</strong></td>
                      <td>{item.name || 'N/A'}</td>
                      <td>{item.category || 'N/A'}</td>
                      <td>{item.assignedTo || 'Unassigned'}</td>
                      <td>
                        <span className={`status-badge status-${(item.status || 'unknown').toLowerCase().replace(' ', '-')}`}>
                          {item.status || 'Unknown'}
                        </span>
                      </td>
                      <td>{item.location || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ padding: '20px', textAlign: 'center' }}>No equipment in inventory.</p>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Equipment;
