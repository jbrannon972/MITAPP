import { useState, useEffect } from 'react';
import Layout from '../components/common/Layout';
import firebaseService from '../services/firebaseService';
import notificationService from '../services/notificationService';
import { useAuth } from '../contexts/AuthContext';
import { exportToCSV, prepareDamagesDataForExport } from '../utils/exportUtils';

const Damages = () => {
  const { currentUser } = useAuth();
  const [damages, setDamages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDamage, setEditingDamage] = useState(null);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    technician: '',
    vehicle: '',
    equipment: '',
    description: '',
    status: 'Pending',
    cost: ''
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    loadDamages();
  }, []);

  const loadDamages = async () => {
    try {
      setLoading(true);
      const data = await firebaseService.loadDamageReports();
      setDamages(data || []);
    } catch (error) {
      console.error('Error loading damages:', error);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingDamage(null);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      technician: '',
      vehicle: '',
      equipment: '',
      description: '',
      status: 'Pending',
      cost: ''
    });
    setShowModal(true);
  };

  const openEditModal = (damage) => {
    setEditingDamage(damage);
    setFormData({
      date: damage.date_of_occurrence || new Date().toISOString().split('T')[0],
      technician: damage.technician_name || '',
      vehicle: damage.vehicle_number || '',
      equipment: damage.equipment_id || '',
      description: damage.damage_description || '',
      status: damage.status || (damage.resolved ? 'Resolved' : 'Pending'),
      cost: damage.estimated_cost || ''
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingDamage(null);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveDamage = async () => {
    try {
      if (!formData.description.trim()) {
        alert('Description is required');
        return;
      }

      const damageData = {
        date_of_occurrence: formData.date,
        technician_name: formData.technician,
        vehicle_number: formData.vehicle,
        equipment_id: formData.equipment,
        damage_description: formData.description,
        estimated_cost: parseFloat(formData.cost) || 0,
        resolved: formData.status === 'Resolved',
        status: formData.status,
        createdAt: new Date()
      };

      if (editingDamage && editingDamage.id) {
        // Update existing damage
        await firebaseService.updateDocument('hou_damages', editingDamage.id, damageData);
      } else {
        // Add new damage
        const newDamageId = await firebaseService.addDocument('hou_damages', damageData);

        // Notify managers of new damage report
        const damageWithId = { ...damageData, id: newDamageId };
        await notificationService.notifyManagersOfDamage(
          damageWithId,
          currentUser?.username || 'A user'
        );
      }

      alert(editingDamage ? 'Damage report updated successfully!' : 'Damage report added successfully!');
      closeModal();
      loadDamages();
    } catch (error) {
      console.error('Error saving damage report:', error);
      alert('Error saving damage report. Please try again.');
    }
  };

  const handleDeleteDamage = async (damage) => {
    if (!window.confirm('Are you sure you want to delete this damage report?')) {
      return;
    }

    try {
      if (damage.id) {
        await firebaseService.deleteDocument('hou_damages', damage.id);
        alert('Damage report deleted successfully!');
        loadDamages();
      }
    } catch (error) {
      console.error('Error deleting damage report:', error);
      alert('Error deleting damage report. Please try again.');
    }
  };

  const filteredDamages = damages.filter(damage => {
    const matchesSearch = searchTerm === '' ||
      (damage.technician_name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (damage.vehicle_number?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (damage.equipment_id?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (damage.damage_description?.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || damage.status === statusFilter || (damage.resolved && statusFilter === 'Resolved');

    return matchesSearch && matchesStatus;
  });

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  const handleExport = () => {
    const dataToExport = prepareDamagesDataForExport(filteredDamages);
    exportToCSV(dataToExport, 'damage_reports');
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

        {/* Search and Filter */}
        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-filter"></i> Search & Filter</h3>
          </div>
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '16px', alignItems: 'end' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label htmlFor="searchInput">Search Damage Reports</label>
                <input
                  type="text"
                  id="searchInput"
                  className="form-control"
                  placeholder="Search by technician, vehicle, equipment, or description..."
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
                  <option value="Pending">Pending</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Resolved">Resolved</option>
                  <option value="Closed">Closed</option>
                </select>
              </div>
            </div>
            {(searchTerm || statusFilter !== 'all') && (
              <div style={{ marginTop: '12px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                Showing {filteredDamages.length} of {damages.length} reports
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-car-crash"></i> Damage Reports</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-secondary" onClick={handleExport}>
                <i className="fas fa-download"></i> Export CSV
              </button>
              <button className="btn btn-primary" onClick={openAddModal}>
                <i className="fas fa-plus"></i> Report Damage
              </button>
            </div>
          </div>
          <div className="table-container">
            {filteredDamages.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Technician</th>
                    <th>Vehicle/Equipment</th>
                    <th>Description</th>
                    <th>Status</th>
                    <th>Cost</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDamages.map((damage, index) => (
                    <tr key={damage.id || index}>
                      <td>{formatDate(damage.date_of_occurrence)}</td>
                      <td>{damage.technician_name || 'N/A'}</td>
                      <td>{damage.vehicle_number || damage.equipment_id || 'N/A'}</td>
                      <td>{damage.damage_description || 'No description'}</td>
                      <td>
                        <span className={`status-badge status-${(damage.status || 'pending').toLowerCase().replace(' ', '-')}`}>
                          {damage.status || (damage.resolved ? 'Resolved' : 'Pending')}
                        </span>
                      </td>
                      <td>{damage.estimated_cost ? `$${parseFloat(damage.estimated_cost).toFixed(2)}` : 'TBD'}</td>
                      <td>
                        <button
                          className="btn btn-secondary btn-small"
                          onClick={() => openEditModal(damage)}
                          style={{ marginRight: '8px' }}
                        >
                          <i className="fas fa-edit"></i> Edit
                        </button>
                        <button
                          className="btn btn-danger btn-small"
                          onClick={() => handleDeleteDamage(damage)}
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
                {damages.length === 0 ? 'No damage reports found.' : 'No reports match your search criteria.'}
              </p>
            )}
          </div>
        </div>

        {/* Add/Edit Damage Modal */}
        {showModal && (
          <div className="modal-overlay active" onClick={closeModal}>
            <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>
                  <i className="fas fa-car-crash"></i> {editingDamage ? 'Edit Damage Report' : 'Report New Damage'}
                </h3>
                <button className="modal-close" onClick={closeModal}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="form-group">
                    <label htmlFor="date">Date <span style={{ color: 'red' }}>*</span></label>
                    <input
                      type="date"
                      id="date"
                      name="date"
                      className="form-control"
                      value={formData.date}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="technician">Technician</label>
                    <input
                      type="text"
                      id="technician"
                      name="technician"
                      className="form-control"
                      value={formData.technician}
                      onChange={handleInputChange}
                      placeholder="Technician name"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="vehicle">Vehicle</label>
                    <input
                      type="text"
                      id="vehicle"
                      name="vehicle"
                      className="form-control"
                      value={formData.vehicle}
                      onChange={handleInputChange}
                      placeholder="Vehicle number or name"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="equipment">Equipment</label>
                    <input
                      type="text"
                      id="equipment"
                      name="equipment"
                      className="form-control"
                      value={formData.equipment}
                      onChange={handleInputChange}
                      placeholder="Equipment name or ID"
                    />
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
                      <option value="Pending">Pending</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Resolved">Resolved</option>
                      <option value="Closed">Closed</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="cost">Estimated Cost ($)</label>
                    <input
                      type="number"
                      id="cost"
                      name="cost"
                      className="form-control"
                      value={formData.cost}
                      onChange={handleInputChange}
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                    />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label htmlFor="description">Description <span style={{ color: 'red' }}>*</span></label>
                    <textarea
                      id="description"
                      name="description"
                      className="form-control"
                      value={formData.description}
                      onChange={handleInputChange}
                      rows="4"
                      placeholder="Detailed description of the damage..."
                      required
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={closeModal}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleSaveDamage}>
                  <i className="fas fa-save"></i> {editingDamage ? 'Update' : 'Submit'} Report
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Damages;
