import { useState, useEffect } from 'react';
import Layout from '../components/common/Layout';
import firebaseService from '../services/firebaseService';

const Equipment = () => {
  const [equipmentData, setEquipmentData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    itemNumber: '',
    name: '',
    category: '',
    assignedTo: '',
    status: 'Available',
    location: ''
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

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

  const openAddModal = () => {
    setEditingItem(null);
    setFormData({
      itemNumber: '',
      name: '',
      category: '',
      assignedTo: '',
      status: 'Available',
      location: ''
    });
    setShowModal(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setFormData({
      itemNumber: item.itemNumber || '',
      name: item.name || '',
      category: item.category || '',
      assignedTo: item.assignedTo || '',
      status: item.status || 'Available',
      location: item.location || ''
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingItem(null);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveItem = async () => {
    try {
      if (!formData.name.trim()) {
        alert('Equipment name is required');
        return;
      }

      const itemId = editingItem?.id || `equipment_${Date.now()}`;
      await firebaseService.saveEquipment(itemId, formData);

      alert(editingItem ? 'Equipment updated successfully!' : 'Equipment added successfully!');
      closeModal();
      loadEquipmentData();
    } catch (error) {
      console.error('Error saving equipment:', error);
      alert('Error saving equipment. Please try again.');
    }
  };

  const handleDeleteItem = async (item) => {
    if (!window.confirm(`Are you sure you want to delete ${item.name}?`)) {
      return;
    }

    try {
      await firebaseService.deleteDocument('hou_equipment', item.id);
      alert('Equipment deleted successfully!');
      loadEquipmentData();
    } catch (error) {
      console.error('Error deleting equipment:', error);
      alert('Error deleting equipment. Please try again.');
    }
  };

  const filteredEquipment = equipmentData.filter(item => {
    const matchesSearch = searchTerm === '' ||
      (item.itemNumber?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.category?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.assignedTo?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.location?.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

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

        {/* Search and Filter */}
        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-filter"></i> Search & Filter</h3>
          </div>
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '16px', alignItems: 'end' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label htmlFor="searchInput">Search Equipment</label>
                <input
                  type="text"
                  id="searchInput"
                  className="form-control"
                  placeholder="Search by item #, name, category, assignment, or location..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ margin: 0, minWidth: '200px' }}>
                <label htmlFor="statusFilter">Filter by Status</label>
                <select
                  id="statusFilter"
                  className="form-control"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">All Statuses</option>
                  <option value="Available">Available</option>
                  <option value="In Use">In Use</option>
                  <option value="In Repairs">In Repairs</option>
                  <option value="Out of Service">Out of Service</option>
                </select>
              </div>
            </div>
            {(searchTerm || statusFilter !== 'all') && (
              <div style={{ marginTop: '12px', fontSize: '14px', color: '#6b7280' }}>
                Showing {filteredEquipment.length} of {equipmentData.length} items
              </div>
            )}
          </div>
        </div>

        {/* Equipment List */}
        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-toolbox"></i> Equipment Inventory</h3>
            <button className="btn btn-primary" onClick={openAddModal}>
              <i className="fas fa-plus"></i> Add Equipment
            </button>
          </div>
          <div className="table-container">
            {filteredEquipment.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item #</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Assigned To</th>
                    <th>Status</th>
                    <th>Location</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEquipment.map((item, index) => (
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
                      <td>
                        <button
                          className="btn btn-secondary btn-small"
                          onClick={() => openEditModal(item)}
                          style={{ marginRight: '8px' }}
                        >
                          <i className="fas fa-edit"></i> Edit
                        </button>
                        <button
                          className="btn btn-danger btn-small"
                          onClick={() => handleDeleteItem(item)}
                        >
                          <i className="fas fa-trash"></i> Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ padding: '20px', textAlign: 'center' }}>
                {equipmentData.length === 0 ? 'No equipment in inventory.' : 'No equipment matches your search criteria.'}
              </p>
            )}
          </div>
        </div>

        {/* Add/Edit Equipment Modal */}
        {showModal && (
          <div className="modal-overlay active" onClick={closeModal}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>
                  <i className="fas fa-toolbox"></i> {editingItem ? 'Edit Equipment' : 'Add Equipment'}
                </h3>
                <button className="modal-close" onClick={closeModal}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="form-group">
                    <label htmlFor="itemNumber">Item Number</label>
                    <input
                      type="text"
                      id="itemNumber"
                      name="itemNumber"
                      className="form-control"
                      value={formData.itemNumber}
                      onChange={handleInputChange}
                      placeholder="e.g., EQ-001"
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
                      <option value="Power Tools">Power Tools</option>
                      <option value="Hand Tools">Hand Tools</option>
                      <option value="Safety Equipment">Safety Equipment</option>
                      <option value="Testing Equipment">Testing Equipment</option>
                      <option value="Ladders">Ladders</option>
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
                      placeholder="e.g., Warehouse A"
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
                <button className="btn btn-primary" onClick={handleSaveItem}>
                  <i className="fas fa-save"></i> {editingItem ? 'Update' : 'Add'} Equipment
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Equipment;
