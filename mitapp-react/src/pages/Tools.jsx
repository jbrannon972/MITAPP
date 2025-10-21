import { useState, useEffect } from 'react';
import Layout from '../components/common/Layout';
import firebaseService from '../services/firebaseService';

const Tools = () => {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTools();
  }, []);

  const loadTools = async () => {
    try {
      setLoading(true);
      const data = await firebaseService.getTools();
      setTools(data || []);
    } catch (error) {
      console.error('Error loading tools:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="tab-content active">
          <p>Loading tools...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="tab-content active">
        <div className="tab-header">
          <h2>Tools Management</h2>
        </div>

        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-wrench"></i> Tools Inventory</h3>
          </div>
          <div className="table-container">
            {tools.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tool ID</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Assigned To</th>
                    <th>Status</th>
                    <th>Location</th>
                  </tr>
                </thead>
                <tbody>
                  {tools.map((tool, index) => (
                    <tr key={tool.id || index}>
                      <td><strong>{tool.toolId || tool.id || 'N/A'}</strong></td>
                      <td>{tool.name || 'N/A'}</td>
                      <td>{tool.category || 'N/A'}</td>
                      <td>{tool.assignedTo || 'Unassigned'}</td>
                      <td>
                        <span className={`status-badge status-${(tool.status || 'unknown').toLowerCase().replace(' ', '-')}`}>
                          {tool.status || 'Unknown'}
                        </span>
                      </td>
                      <td>{tool.location || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ padding: '20px', textAlign: 'center' }}>No tools in inventory.</p>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Tools;
