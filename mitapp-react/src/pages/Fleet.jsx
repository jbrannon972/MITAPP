import { useState, useEffect } from 'react';
import Layout from '../components/common/Layout';
import { useData } from '../contexts/DataContext';
import firebaseService from '../services/firebaseService';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { exportToCSV, prepareFleetDataForExport } from '../utils/exportUtils';

const Fleet = () => {
  const { staffingData } = useData();
  const [fleetData, setFleetData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    available: 0,
    unassigned: 0,
    inRepairs: 0
  });
  const [showModal, setShowModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [activeTab, setActiveTab] = useState('details');
  const [formData, setFormData] = useState({
    truckNumber: '',
    type: '',
    assignedTo: '',
    status: 'Available',
    qualityRating: '',
    mileage: '',
    file: '',
    notes: '',
    maintenanceNeeded: ''
  });
  const [workOrders, setWorkOrders] = useState([]);
  const [repairs, setRepairs] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [costs, setCosts] = useState({ total: 0, breakdown: [] });
  const [selectedInspection, setSelectedInspection] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    loadFleetData();
  }, []);

  const loadFleetData = async () => {
    try {
      setLoading(true);
      const vehicles = await firebaseService.loadFleetData();
      setFleetData(vehicles || []);

      // Calculate stats
      const vanTypes = ['Ford Transit', 'Sprinter', 'Prius'];
      const available = vehicles.filter(v => vanTypes.includes(v.type) && v.status !== 'In Repairs' && v.status !== 'Retired').length;
      const unassigned = vehicles.filter(v => !v.assignedTo).length;
      const inRepairs = vehicles.filter(v => v.status === 'In Repairs').length;

      setStats({ available, unassigned, inRepairs });
    } catch (error) {
      console.error('Error loading fleet data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTechName = (techId) => {
    if (!techId || !staffingData?.zones) return 'Unassigned';

    for (const zone of staffingData.zones) {
      if (zone.lead?.id === techId) return zone.lead.name;
      const member = zone.members?.find(m => m.id === techId);
      if (member) return member.name;
    }

    return techId; // Return ID if not found
  };

  const getAllTechnicians = () => {
    if (!staffingData?.zones) return [];

    const techs = [];
    staffingData.zones.forEach(zone => {
      if (zone.lead) techs.push(zone.lead);
      if (zone.members) techs.push(...zone.members);
    });

    return techs.sort((a, b) => a.name.localeCompare(b.name));
  };

  const openAddModal = () => {
    setEditingVehicle(null);
    setActiveTab('details');
    setFormData({
      truckNumber: '',
      type: '',
      assignedTo: '',
      status: 'Available',
      qualityRating: '',
      mileage: '',
      file: '',
      notes: '',
      maintenanceNeeded: ''
    });
    setShowModal(true);
  };

  const openEditModal = async (vehicle) => {
    setEditingVehicle(vehicle);
    setActiveTab('details');
    setFormData({
      truckNumber: vehicle.truckNumber || '',
      type: vehicle.type || '',
      assignedTo: vehicle.assignedTo || '',
      status: vehicle.status || 'Available',
      qualityRating: vehicle.qualityRating || '',
      mileage: vehicle.mileage || '',
      file: vehicle.file || '',
      notes: vehicle.notes || '',
      maintenanceNeeded: vehicle.maintenanceNeeded || ''
    });
    setShowModal(true);
  };

  const loadWorkOrders = async (vehicleId) => {
    try {
      const woRef = collection(db, 'hou_fleet', vehicleId, 'workOrders');
      const woQuery = query(woRef, orderBy('dateReported', 'desc'));
      const woSnap = await getDocs(woQuery);

      const woList = woSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      setWorkOrders(woList);
    } catch (error) {
      console.error('Error loading work orders:', error);
      setWorkOrders([]);
    }
  };

  const loadRepairs = async (vehicleId) => {
    try {
      const repairRef = collection(db, 'hou_fleet', vehicleId, 'repairs');
      const repairQuery = query(repairRef, orderBy('date', 'desc'));
      const repairSnap = await getDocs(repairQuery);

      const repairList = repairSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      setRepairs(repairList);
    } catch (error) {
      console.error('Error loading repairs:', error);
      setRepairs([]);
    }
  };

  const loadInspections = async (vehicleId) => {
    try {
      const inspectionRef = collection(db, 'hou_fleet', vehicleId, 'inspections');
      const inspectionQuery = query(inspectionRef, orderBy('inspectionDate', 'desc'));
      const inspectionSnap = await getDocs(inspectionQuery);

      const inspectionList = inspectionSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      setInspections(inspectionList);
      setSelectedInspection(null);
    } catch (error) {
      console.error('Error loading inspections:', error);
      setInspections([]);
    }
  };

  const loadCosts = async (vehicleId) => {
    try {
      let totalCost = 0;
      const breakdown = [];

      // Load WO costs
      const woRef = collection(db, 'hou_fleet', vehicleId, 'workOrders');
      const woQuery = query(woRef, where('status', '==', 'Completed'));
      const woSnap = await getDocs(woQuery);

      woSnap.forEach(doc => {
        const wo = doc.data();
        if (wo.repairCost) {
          totalCost += wo.repairCost;
          breakdown.push({
            type: 'Work Order',
            id: doc.id.substring(0, 8),
            cost: wo.repairCost
          });
        }
      });

      // Load repair costs
      const repairRef = collection(db, 'hou_fleet', vehicleId, 'repairs');
      const repairSnap = await getDocs(repairRef);

      repairSnap.forEach(doc => {
        const repair = doc.data();
        totalCost += repair.cost || 0;
        breakdown.push({
          type: 'Manual Repair',
          date: repair.date?.toDate?.().toLocaleDateString() || 'N/A',
          cost: repair.cost || 0
        });
      });

      setCosts({ total: totalCost, breakdown });
    } catch (error) {
      console.error('Error loading costs:', error);
      setCosts({ total: 0, breakdown: [] });
    }
  };

  const handleTabChange = async (tab) => {
    setActiveTab(tab);

    if (tab !== 'details' && editingVehicle) {
      if (tab === 'wo') await loadWorkOrders(editingVehicle.id);
      else if (tab === 'repairs') await loadRepairs(editingVehicle.id);
      else if (tab === 'inspections') await loadInspections(editingVehicle.id);
      else if (tab === 'costs') await loadCosts(editingVehicle.id);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingVehicle(null);
    setActiveTab('details');
    setWorkOrders([]);
    setRepairs([]);
    setInspections([]);
    setCosts({ total: 0, breakdown: [] });
    setSelectedInspection(null);
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

      const newTechId = formData.assignedTo;

      // Handle reassignment - unassign from previous vehicle
      if (newTechId && editingVehicle && editingVehicle.assignedTo !== newTechId) {
        const previouslyAssigned = fleetData.find(v => v.assignedTo === newTechId && v.id !== editingVehicle.id);
        if (previouslyAssigned) {
          await firebaseService.saveFleetVehicle(previouslyAssigned.id, { ...previouslyAssigned, assignedTo: '' });
        }
      }

      const vehicleData = {
        truckNumber: formData.truckNumber,
        type: formData.type,
        assignedTo: formData.assignedTo,
        status: formData.status,
        qualityRating: formData.qualityRating ? parseInt(formData.qualityRating) : null,
        mileage: formData.mileage ? parseInt(formData.mileage) : null,
        file: formData.file,
        notes: formData.notes,
        maintenanceNeeded: formData.maintenanceNeeded
      };

      const vehicleId = editingVehicle?.id || `vehicle_${Date.now()}`;
      await firebaseService.saveFleetVehicle(vehicleId, vehicleData);

      alert(editingVehicle ? 'Vehicle updated successfully!' : 'Vehicle added successfully!');
      closeModal();
      loadFleetData();
    } catch (error) {
      console.error('Error saving vehicle:', error);
      alert('Error saving vehicle. Please try again.');
    }
  };

  const handleDeleteVehicle = async (vehicle) => {
    if (!window.confirm(`Are you sure you want to delete truck ${vehicle.truckNumber}? This cannot be undone.`)) {
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
    const techName = getTechName(vehicle.assignedTo);
    const matchesSearch = searchTerm === '' ||
      (vehicle.truckNumber?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (vehicle.type?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (techName?.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || vehicle.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleExport = () => {
    const dataToExport = prepareFleetDataForExport(filteredVehicles);
    exportToCSV(dataToExport, 'fleet_vehicles');
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value || 0);
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <Layout>
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: '48px', color: 'var(--primary-color)' }}></i>
          <p style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>Loading fleet data...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ maxWidth: '100%', padding: '20px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}>
          <h1 style={{ margin: 0 }}>
            <i className="fas fa-truck"></i> Fleet Management
          </h1>
        </div>

        {/* Fleet Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '20px' }}>
          <div className="card">
            <div style={{ padding: '24px', textAlign: 'center' }}>
              <h3 style={{ margin: '0 0 12px 0', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500' }}>
                <i className="fas fa-car-side"></i> Vans Available
              </h3>
              <div style={{ fontSize: '48px', fontWeight: 'bold', color: 'var(--primary-color)' }}>
                {stats.available}
              </div>
            </div>
          </div>
          <div className="card">
            <div style={{ padding: '24px', textAlign: 'center' }}>
              <h3 style={{ margin: '0 0 12px 0', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500' }}>
                <i className="fas fa-user-slash"></i> Unassigned
              </h3>
              <div style={{ fontSize: '48px', fontWeight: 'bold', color: 'var(--warning-color)' }}>
                {stats.unassigned}
              </div>
            </div>
          </div>
          <div className="card">
            <div style={{ padding: '24px', textAlign: 'center' }}>
              <h3 style={{ margin: '0 0 12px 0', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500' }}>
                <i className="fas fa-tools"></i> In Repairs
              </h3>
              <div style={{ fontSize: '48px', fontWeight: 'bold', color: 'var(--danger-color)' }}>
                {stats.inRepairs}
              </div>
            </div>
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
                  placeholder="Search by truck #, type, or assignment..."
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
                  <option value="In Use (Conroe)">In Use (Conroe)</option>
                  <option value="In Use (Katy)">In Use (Katy)</option>
                  <option value="In Use (Houston)">In Use (Houston)</option>
                  <option value="In Repairs">In Repairs</option>
                  <option value="Retired">Retired</option>
                </select>
              </div>
            </div>
            {(searchTerm || statusFilter !== 'all') && (
              <div style={{ marginTop: '12px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                Showing {filteredVehicles.length} of {fleetData.length} vehicles
              </div>
            )}
          </div>
        </div>

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
                    <th>Truck #</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Assigned To</th>
                    <th>Mileage</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVehicles.map((vehicle, index) => (
                    <tr key={vehicle.id || index} className={vehicle.status === 'Retired' ? 'retired-row' : ''}>
                      <td data-label="Truck #"><strong>{vehicle.truckNumber || 'N/A'}</strong></td>
                      <td data-label="Type">{vehicle.type || 'N/A'}</td>
                      <td data-label="Status">
                        <span className={`status-badge status-${(vehicle.status || 'unknown').toLowerCase().replace(/ /g, '-').replace(/\(|\)/g, '')}`}>
                          {vehicle.status || 'Unknown'}
                        </span>
                      </td>
                      <td data-label="Assigned To">{getTechName(vehicle.assignedTo)}</td>
                      <td data-label="Mileage">{vehicle.mileage ? vehicle.mileage.toLocaleString() : 'N/A'}</td>
                      <td data-label="Actions" style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-secondary btn-small"
                          onClick={() => openEditModal(vehicle)}
                          style={{ marginRight: '8px' }}
                        >
                          <i className="fas fa-edit"></i> View/Edit
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
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px', maxHeight: '90vh', overflow: 'auto' }}>
              <div className="modal-header">
                <h3>
                  <i className="fas fa-truck"></i> Vehicle Profile: {formData.truckNumber || 'New Vehicle'}
                </h3>
                <button className="modal-close" onClick={closeModal}>
                  <i className="fas fa-times"></i>
                </button>
              </div>

              {/* Modal Tabs */}
              <div style={{
                display: 'flex',
                gap: '8px',
                padding: '16px 24px 0',
                borderBottom: '2px solid var(--border-color)'
              }}>
                <button
                  className={`btn ${activeTab === 'details' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleTabChange('details')}
                  style={{ fontSize: '14px' }}
                >
                  Details
                </button>
                <button
                  className={`btn ${activeTab === 'inspections' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleTabChange('inspections')}
                  style={{ fontSize: '14px' }}
                  disabled={!editingVehicle}
                >
                  Inspections
                </button>
                <button
                  className={`btn ${activeTab === 'wo' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleTabChange('wo')}
                  style={{ fontSize: '14px' }}
                  disabled={!editingVehicle}
                >
                  Work Orders
                </button>
                <button
                  className={`btn ${activeTab === 'repairs' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleTabChange('repairs')}
                  style={{ fontSize: '14px' }}
                  disabled={!editingVehicle}
                >
                  Repairs
                </button>
                <button
                  className={`btn ${activeTab === 'costs' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleTabChange('costs')}
                  style={{ fontSize: '14px' }}
                  disabled={!editingVehicle}
                >
                  Costs
                </button>
              </div>

              <div className="modal-body" style={{ minHeight: '400px' }}>
                {/* Details Tab */}
                {activeTab === 'details' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div className="form-group">
                      <label htmlFor="truckNumber">Truck Number <span style={{ color: 'var(--danger-color)' }}>*</span></label>
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
                      <label htmlFor="status">Vehicle Status</label>
                      <select
                        id="status"
                        name="status"
                        className="form-control"
                        value={formData.status}
                        onChange={handleInputChange}
                      >
                        <option value="Available">Available</option>
                        <option value="In Use (Conroe)">In Use (Conroe)</option>
                        <option value="In Use (Katy)">In Use (Katy)</option>
                        <option value="In Use (Houston)">In Use (Houston)</option>
                        <option value="In Repairs">In Repairs</option>
                        <option value="Retired">Retired</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="type">Vehicle Type</label>
                      <select
                        id="type"
                        name="type"
                        className="form-control"
                        value={formData.type}
                        onChange={handleInputChange}
                      >
                        <option value="">Select Type</option>
                        <option value="Ford Transit">Ford Transit</option>
                        <option value="Sprinter">Sprinter</option>
                        <option value="Ford Connect">Ford Connect</option>
                        <option value="Box Truck">Box Truck</option>
                        <option value="Nissan NV2500">Nissan NV2500</option>
                        <option value="Prius">Prius</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="qualityRating">Quality Rating (1-5)</label>
                      <input
                        type="number"
                        id="qualityRating"
                        name="qualityRating"
                        className="form-control"
                        value={formData.qualityRating}
                        onChange={handleInputChange}
                        min="1"
                        max="5"
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="mileage">Mileage</label>
                      <input
                        type="number"
                        id="mileage"
                        name="mileage"
                        className="form-control"
                        value={formData.mileage}
                        onChange={handleInputChange}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="file">File Link</label>
                      <input
                        type="text"
                        id="file"
                        name="file"
                        className="form-control"
                        value={formData.file}
                        onChange={handleInputChange}
                        placeholder="URL to file"
                      />
                    </div>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label htmlFor="assignedTo">Assigned To</label>
                      <select
                        id="assignedTo"
                        name="assignedTo"
                        className="form-control"
                        value={formData.assignedTo}
                        onChange={handleInputChange}
                      >
                        <option value="">Unassigned</option>
                        {getAllTechnicians().map(tech => (
                          <option key={tech.id} value={tech.id}>{tech.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label htmlFor="notes">Notes</label>
                      <textarea
                        id="notes"
                        name="notes"
                        className="form-control"
                        value={formData.notes}
                        onChange={handleInputChange}
                        rows="3"
                      />
                    </div>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label htmlFor="maintenanceNeeded">Maintenance Needed</label>
                      <textarea
                        id="maintenanceNeeded"
                        name="maintenanceNeeded"
                        className="form-control"
                        value={formData.maintenanceNeeded}
                        onChange={handleInputChange}
                        rows="3"
                      />
                    </div>
                  </div>
                )}

                {/* Inspections Tab */}
                {activeTab === 'inspections' && (
                  <div>
                    {selectedInspection ? (
                      <div>
                        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <h4>Inspection on {formatDate(selectedInspection.inspectionDate)}</h4>
                          <button
                            className="btn btn-secondary btn-small"
                            onClick={() => setSelectedInspection(null)}
                          >
                            <i className="fas fa-arrow-left"></i> Back to List
                          </button>
                        </div>
                        <p><strong>Driver:</strong> {getTechName(selectedInspection.driver)} | <strong>Mileage:</strong> {selectedInspection.mileage?.toLocaleString() || 'N/A'}</p>
                        <div style={{ marginTop: '20px' }}>
                          {selectedInspection.items && Object.entries(selectedInspection.items).map(([key, item]) => {
                            const isIssue = item.value === 'bad' || item.value === 'yes';
                            return (
                              <div key={key} style={{
                                display: 'grid',
                                gridTemplateColumns: '2fr 1fr 3fr',
                                gap: '12px',
                                padding: '12px',
                                backgroundColor: isIssue ? '#fef2f2' : '#f8fafc',
                                borderRadius: 'var(--radius-sm)',
                                borderLeft: `3px solid ${isIssue ? 'var(--danger-color)' : '#f8fafc'}`,
                                marginBottom: '8px'
                              }}>
                                <span style={{ fontWeight: '500' }}>{key.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                                <span style={{ fontWeight: '600', textTransform: 'capitalize' }}>{item.value}</span>
                                <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>{item.details || 'N/A'}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <h4>Past Inspections</h4>
                        {inspections.length === 0 ? (
                          <p style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            No past inspections found for this vehicle.
                          </p>
                        ) : (
                          <div style={{ marginTop: '16px' }}>
                            {inspections.map(inspection => (
                              <div key={inspection.id} style={{ marginBottom: '12px' }}>
                                <button
                                  className="btn btn-secondary"
                                  onClick={() => setSelectedInspection(inspection)}
                                  style={{ width: '100%', textAlign: 'left' }}
                                >
                                  <i className="fas fa-clipboard-check"></i> Inspection from {formatDate(inspection.inspectionDate)}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Work Orders Tab */}
                {activeTab === 'wo' && (
                  <div>
                    <h4>Work Order History</h4>
                    {workOrders.length === 0 ? (
                      <p style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        No work orders found for this vehicle.
                      </p>
                    ) : (
                      <div style={{ marginTop: '16px' }}>
                        {workOrders.map(wo => (
                          <div key={wo.id} style={{
                            padding: '16px',
                            backgroundColor: 'var(--surface-secondary)',
                            borderRadius: 'var(--radius-md)',
                            marginBottom: '12px',
                            borderLeft: `4px solid ${wo.status === 'Open' ? 'var(--warning-color)' : 'var(--success-color)'}`
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                              <strong>{formatDate(wo.dateReported)}</strong>
                              <span className={`status-badge status-${wo.status?.toLowerCase()}`}>{wo.status}</span>
                            </div>
                            <p>{wo.issueDescription}</p>
                            {wo.repairCost && (
                              <p style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>
                                <strong>Cost:</strong> {formatCurrency(wo.repairCost)}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Repairs Tab */}
                {activeTab === 'repairs' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h4>Repair History</h4>
                    </div>
                    {repairs.length === 0 ? (
                      <p style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        No manual repairs logged for this vehicle.
                      </p>
                    ) : (
                      <div>
                        {repairs.map(repair => (
                          <div key={repair.id} style={{
                            padding: '16px',
                            backgroundColor: 'var(--surface-secondary)',
                            borderRadius: 'var(--radius-md)',
                            marginBottom: '12px'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                              <strong>{formatDate(repair.date)}</strong>
                              <strong style={{ color: 'var(--danger-color)' }}>{formatCurrency(repair.cost)}</strong>
                            </div>
                            <p>{repair.description}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Costs Tab */}
                {activeTab === 'costs' && (
                  <div>
                    <h3 style={{ textAlign: 'center', marginBottom: '24px', color: 'var(--danger-color)' }}>
                      Total Lifetime Cost: {formatCurrency(costs.total)}
                    </h3>
                    <h4>Cost Breakdown</h4>
                    {costs.breakdown.length === 0 ? (
                      <p style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        No cost data available for this vehicle.
                      </p>
                    ) : (
                      <ul style={{ listStyle: 'none', padding: 0 }}>
                        {costs.breakdown.map((item, index) => (
                          <li key={index} style={{
                            padding: '12px',
                            backgroundColor: 'var(--surface-secondary)',
                            borderRadius: 'var(--radius-sm)',
                            marginBottom: '8px',
                            display: 'flex',
                            justifyContent: 'space-between'
                          }}>
                            <span>
                              {item.type} {item.id ? `(${item.id})` : item.date ? `(${item.date})` : ''}
                            </span>
                            <strong>{formatCurrency(item.cost)}</strong>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              <div className="modal-footer">
                {editingVehicle && (
                  <button
                    className="btn btn-danger"
                    onClick={() => {
                      closeModal();
                      handleDeleteVehicle(editingVehicle);
                    }}
                  >
                    <i className="fas fa-trash"></i> Delete Vehicle
                  </button>
                )}
                <button className="btn btn-secondary" onClick={closeModal}>
                  Cancel
                </button>
                {activeTab === 'details' && (
                  <button className="btn btn-primary" onClick={handleSaveVehicle}>
                    <i className="fas fa-save"></i> Save Changes
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Fleet;
