import { useState, useEffect } from 'react';
import Layout from '../components/common/Layout';
import firebaseService from '../services/firebaseService';

const Tools = () => {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTool, setEditingTool] = useState(null);
  const [formData, setFormData] = useState({
    toolId: '',
    name: '',
    category: '',
    assignedTo: '',
    status: 'Available',
    location: ''
  });

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

  const openAddModal = () => {
    setEditingTool(null);
    setFormData({
      toolId: '',
      name: '',
      category: '',
      assignedTo: '',
      status: 'Available',
      location: ''
    });
    setShowModal(true);
  };

  const openEditModal = (tool) => {
    setEditingTool(tool);
    setFormData({
      toolId: tool.toolId || '',
      name: tool.name || '',
      category: tool.category || '',
      assignedTo: tool.assignedTo || '',
      status: tool.status || 'Available',
      location: tool.location || ''
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingTool(null);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveTool = async () => {
    try {
      if (!formData.name.trim()) {
        alert('Tool name is required');
        return;
      }

      const toolDocId = editingTool?.id || `tool_${Date.now()}`;
      await firebaseService.saveDocument('hou_tools', toolDocId, formData);

      alert(editingTool ? 'Tool updated successfully!' : 'Tool added successfully!');
      closeModal();
      loadTools();
    } catch (error) {
      console.error('Error saving tool:', error);
      alert('Error saving tool. Please try again.');
    }
  };

  const handleDeleteTool = async (tool) => {
    if (!window.confirm(`Are you sure you want to delete ${tool.name}?`)) {
      return;
    }

    try {
      await firebaseService.deleteDocument('hou_tools', tool.id);
      alert('Tool deleted successfully!');
      loadTools();
    } catch (error) {
      console.error('Error deleting tool:', error);
      alert('Error deleting tool. Please try again.');
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
            <button className="btn btn-primary" onClick={openAddModal}>
              <i className="fas fa-plus"></i> Add Tool
            </button>
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
                    <th>Actions</th>
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
                      <td>
                        <button
                          className="btn btn-secondary btn-small"
                          onClick={() => openEditModal(tool)}
                          style={{ marginRight: '8px' }}
                        >
                          <i className="fas fa-edit"></i> Edit
                        </button>
                        <button
                          className="btn btn-danger btn-small"
                          onClick={() => handleDeleteTool(tool)}
                        >
                          <i className="fas fa-trash"></i> Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ padding: '20px', textAlign: 'center' }}>No tools in inventory.</p>
            )}
          </div>
        </div>

        {/* Add/Edit Tool Modal */}
        {showModal && (
          <div className="modal-overlay active" onClick={closeModal}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>
                  <i className="fas fa-wrench"></i> {editingTool ? 'Edit Tool' : 'Add Tool'}
                </h3>
                <button className="modal-close" onClick={closeModal}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="form-group">
                    <label htmlFor="toolId">Tool ID</label>
                    <input
                      type="text"
                      id="toolId"
                      name="toolId"
                      className="form-control"
                      value={formData.toolId}
                      onChange={handleInputChange}
                      placeholder="e.g., T-001"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="name">Name <span style={{ color: 'red' }}>*</span></label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      className="form-control"
                      value={formData.name}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="category">Category</label>
                    <select
                      id="category"
                      name="category"
                      className="form-control"
                      value={formData.category}
                      onChange={handleInputChange}
                    >
                      <option value="">Select Category</option>
                      <option value="Hand Tools">Hand Tools</option>
                      <option value="Power Tools">Power Tools</option>
                      <option value="Measuring Tools">Measuring Tools</option>
                      <option value="Safety Gear">Safety Gear</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="status">Status</label>
                    <select
                      id="status"
                      name="status"
                      className="form-control"
                      value={formData.status}
                      onChange={handleInputChange}
                    >
                      <option value="Available">Available</option>
                      <option value="In Use">In Use</option>
                      <option value="In Repairs">In Repairs</option>
                      <option value="Lost">Lost</option>
                      <option value="Out of Service">Out of Service</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="location">Location</label>
                    <input
                      type="text"
                      id="location"
                      name="location"
                      className="form-control"
                      value={formData.location}
                      onChange={handleInputChange}
                      placeholder="e.g., Tool Room A"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="assignedTo">Assigned To</label>
                    <input
                      type="text"
                      id="assignedTo"
                      name="assignedTo"
                      className="form-control"
                      value={formData.assignedTo}
                      onChange={handleInputChange}
                      placeholder="Technician name"
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={closeModal}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleSaveTool}>
                  <i className="fas fa-save"></i> {editingTool ? 'Update' : 'Add'} Tool
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Tools;
