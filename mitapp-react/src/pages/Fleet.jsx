import { useState, useEffect } from 'react';
import Layout from '../components/common/Layout';
import { useAuth } from '../contexts/AuthContext';
import firebaseService from '../services/firebaseService';
import { exportToCSV, prepareFleetDataForExport } from '../utils/exportUtils';

const Fleet = () => {
  const { currentUser } = useAuth();
  const [fleetData, setFleetData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    available: 0,
    unassigned: 0,
    inRepairs: 0
  });
  const [showModal, setShowModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [formData, setFormData] = useState({
    truckNumber: '',
    type: '',
    assignedTo: '',
    status: 'Available',
    make: '',
    model: '',
    year: ''
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedVehicles, setSelectedVehicles] = useState([]);
  const [showBulkActions, setShowBulkActions] = useState(false);

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

  const openAddModal = () => {
    setEditingVehicle(null);
    setFormData({
      truckNumber: '',
      type: '',
      assignedTo: '',
      status: 'Available',
      make: '',
      model: '',
      year: ''
    });
    setShowModal(true);
  };

  const openEditModal = (vehicle) => {
    setEditingVehicle(vehicle);
    setFormData({
      truckNumber: vehicle.truckNumber || '',
      type: vehicle.type || '',
      assignedTo: vehicle.assignedTo || '',
      status: vehicle.status || 'Available',
      make: vehicle.make || '',
      model: vehicle.model || '',
      year: vehicle.year || ''
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingVehicle(null);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveVehicle = async () => {
    try {
      if (!formData.truckNumber.trim()) {
        alert('Truck number is required');
        return;
      }

      const vehicleId = editingVehicle?.id || `truck_${Date.now()}`;
      await firebaseService.saveFleetVehicle(vehicleId, formData);

      alert(editingVehicle ? 'Vehicle updated successfully!' : 'Vehicle added successfully!');
      closeModal();
      loadFleetData();
    } catch (error) {
      console.error('Error saving vehicle:', error);
      alert('Error saving vehicle. Please try again.');
    }
  };

  const handleDeleteVehicle = async (vehicle) => {
    if (!window.confirm(`Are you sure you want to delete truck ${vehicle.truckNumber}?`)) {
      return;
    }

    try {
      await firebaseService.deleteDocument('hou_fleet', vehicle.id);
      alert('Vehicle deleted successfully!');
      loadFleetData();
    } catch (error) {
      console.error('Error deleting vehicle:', error);
      alert('Error deleting vehicle. Please try again.');
    }
  };

  const filteredVehicles = fleetData.filter(vehicle => {
    const matchesSearch = searchTerm === '' ||
      (vehicle.truckNumber?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (vehicle.type?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (vehicle.assignedTo?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (vehicle.make?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (vehicle.model?.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || vehicle.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleExport = () => {
    const dataToExport = prepareFleetDataForExport(filteredVehicles);
    exportToCSV(dataToExport, 'fleet_vehicles');
  };

  const handleSelectVehicle = (vehicleId) => {
    setSelectedVehicles(prev => {
      if (prev.includes(vehicleId)) {
        const newSelection = prev.filter(id => id !== vehicleId);
        setShowBulkActions(newSelection.length > 0);
        return newSelection;
      } else {
        const newSelection = [...prev, vehicleId];
        setShowBulkActions(true);
        return newSelection;
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedVehicles.length === filteredVehicles.length) {
      setSelectedVehicles([]);
      setShowBulkActions(false);
    } else {
      setSelectedVehicles(filteredVehicles.map(v => v.id));
      setShowBulkActions(true);
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete ${selectedVehicles.length} vehicle(s)?`)) {
      return;
    }

    try {
      await Promise.all(
        selectedVehicles.map(id => firebaseService.deleteDocument('hou_fleet', id))
      );
      alert('Vehicles deleted successfully!');
      setSelectedVehicles([]);
      setShowBulkActions(false);
      loadFleetData();
    } catch (error) {
      console.error('Error deleting vehicles:', error);
      alert('Error deleting vehicles. Please try again.');
    }
  };

  const handleBulkStatusChange = async (newStatus) => {
    try {
      const vehiclesToUpdate = fleetData.filter(v => selectedVehicles.includes(v.id));
      await Promise.all(
        vehiclesToUpdate.map(vehicle =>
          firebaseService.saveFleetVehicle(vehicle.id, { ...vehicle, status: newStatus })
        )
      );
      alert('Status updated successfully!');
      setSelectedVehicles([]);
      setShowBulkActions(false);
      loadFleetData();
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Error updating status. Please try again.');
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

        {/* Search and Filter */}
        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-filter"></i> Search & Filter</h3>
          </div>
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '16px', alignItems: 'end' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label htmlFor="searchInput">Search Vehicles</label>
                <input
                  type="text"
                  id="searchInput"
                  className="form-control"
                  placeholder="Search by truck #, type, assignment, make, or model..."
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
                Showing {filteredVehicles.length} of {fleetData.length} vehicles
              </div>
            )}
          </div>
        </div>

        {/* Bulk Actions Bar */}
        {showBulkActions && (
          <div className="card" style={{ backgroundColor: '#eff6ff', borderColor: '#3b82f6' }}>
            <div style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <i className="fas fa-check-circle" style={{ color: '#3b82f6', fontSize: '20px' }}></i>
                <span style={{ fontWeight: '500' }}>{selectedVehicles.length} vehicle(s) selected</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select
                  className="form-control"
                  style={{ width: 'auto', display: 'inline-block' }}
                  onChange={(e) => {
                    if (e.target.value) {
                      handleBulkStatusChange(e.target.value);
                      e.target.value = '';
                    }
                  }}
                  defaultValue=""
                >
                  <option value="">Change Status...</option>
                  <option value="Available">Available</option>
                  <option value="In Use">In Use</option>
                  <option value="In Repairs">In Repairs</option>
                  <option value="Out of Service">Out of Service</option>
                </select>
                <button className="btn btn-danger" onClick={handleBulkDelete}>
                  <i className="fas fa-trash"></i> Delete Selected
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Fleet List */}
        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-truck"></i> Fleet Vehicles</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-secondary" onClick={handleExport}>
                <i className="fas fa-download"></i> Export CSV
              </button>
              <button className="btn btn-primary" onClick={openAddModal}>
                <i className="fas fa-plus"></i> Add Vehicle
              </button>
            </div>
          </div>
          <div className="table-container">
            {filteredVehicles.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>
                      <input
                        type="checkbox"
                        checked={selectedVehicles.length === filteredVehicles.length && filteredVehicles.length > 0}
                        onChange={handleSelectAll}
                        style={{ cursor: 'pointer' }}
                      />
                    </th>
                    <th>Truck #</th>
                    <th>Type</th>
                    <th>Assigned To</th>
                    <th>Status</th>
                    <th>Make/Model</th>
                    <th>Year</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVehicles.map((vehicle, index) => (
                    <tr key={vehicle.id || index}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedVehicles.includes(vehicle.id)}
                          onChange={() => handleSelectVehicle(vehicle.id)}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>
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
                      <td>
                        <button
                          className="btn btn-secondary btn-small"
                          onClick={() => openEditModal(vehicle)}
                          style={{ marginRight: '8px' }}
                        >
                          <i className="fas fa-edit"></i> Edit
                        </button>
                        <button
                          className="btn btn-danger btn-small"
                          onClick={() => handleDeleteVehicle(vehicle)}
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
                {fleetData.length === 0 ? 'No vehicles in fleet.' : 'No vehicles match your search criteria.'}
              </p>
            )}
          </div>
        </div>

        {/* Add/Edit Vehicle Modal */}
        {showModal && (
          <div className="modal-overlay active" onClick={closeModal}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>
                  <i className="fas fa-truck"></i> {editingVehicle ? 'Edit Vehicle' : 'Add Vehicle'}
                </h3>
                <button className="modal-close" onClick={closeModal}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="form-group">
                    <label htmlFor="truckNumber">Truck Number <span style={{ color: 'red' }}>*</span></label>
                    <input
                      type="text"
                      id="truckNumber"
                      name="truckNumber"
                      className="form-control"
                      value={formData.truckNumber}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="type">Type</label>
                    <select
                      id="type"
                      name="type"
                      className="form-control"
                      value={formData.type}
                      onChange={handleInputChange}
                    >
                      <option value="">Select Type</option>
                      <option value="Van">Van</option>
                      <option value="Truck">Truck</option>
                      <option value="Service Vehicle">Service Vehicle</option>
                      <option value="Utility">Utility</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="make">Make</label>
                    <input
                      type="text"
                      id="make"
                      name="make"
                      className="form-control"
                      value={formData.make}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="model">Model</label>
                    <input
                      type="text"
                      id="model"
                      name="model"
                      className="form-control"
                      value={formData.model}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="year">Year</label>
                    <input
                      type="text"
                      id="year"
                      name="year"
                      className="form-control"
                      value={formData.year}
                      onChange={handleInputChange}
                      placeholder="e.g., 2020"
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
                      <option value="Available">Available</option>
                      <option value="In Use">In Use</option>
                      <option value="In Repairs">In Repairs</option>
                      <option value="Out of Service">Out of Service</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
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
                <button className="btn btn-primary" onClick={handleSaveVehicle}>
                  <i className="fas fa-save"></i> {editingVehicle ? 'Update' : 'Add'} Vehicle
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Fleet;
