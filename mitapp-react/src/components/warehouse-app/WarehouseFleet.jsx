import { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, addDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../../config/firebase';

const WarehouseFleet = () => {
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [activeTab, setActiveTab] = useState('details');
  const [inspections, setInspections] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [repairs, setRepairs] = useState([]);
  const [showModal, setShowModal] = useState(false);

  // Work order note form
  const [woNote, setWoNote] = useState('');
  const [woTargetDate, setWoTargetDate] = useState('');
  const [woCost, setWoCost] = useState('');

  // Repair form
  const [repairForm, setRepairForm] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    cost: ''
  });

  useEffect(() => {
    loadVehicles();
  }, []);

  const loadVehicles = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'hou_fleet'));
      const vehicleList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setVehicles(vehicleList);
    } catch (error) {
      console.error('Error loading vehicles:', error);
    }
  };

  const loadVehicleDetails = async (vehicleId) => {
    try {
      // Load inspections
      const inspectionSnapshot = await getDocs(
        query(
          collection(db, 'hou_fleet', vehicleId, 'inspections'),
          orderBy('date', 'desc')
        )
      );
      setInspections(inspectionSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

      // Load work orders
      const woSnapshot = await getDocs(
        collection(db, 'hou_fleet', vehicleId, 'workOrders')
      );
      setWorkOrders(woSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

      // Load repairs
      const repairSnapshot = await getDocs(
        collection(db, 'hou_fleet', vehicleId, 'repairs')
      );
      setRepairs(repairSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

    } catch (error) {
      console.error('Error loading vehicle details:', error);
    }
  };

  const handleVehicleClick = (vehicle) => {
    setSelectedVehicle(vehicle);
    loadVehicleDetails(vehicle.id);
    setShowModal(true);
    setActiveTab('details');
  };

  const handleAddWONote = async (woId) => {
    if (!woNote.trim()) return;

    try {
      const woDoc = doc(db, 'hou_fleet', selectedVehicle.id, 'workOrders', woId);
      await updateDoc(woDoc, {
        notes: woNote,
        targetFixDate: woTargetDate || null,
        cost: woCost ? parseFloat(woCost) : null,
        lastUpdated: new Date().toISOString()
      });

      alert('Work order updated successfully!');
      loadVehicleDetails(selectedVehicle.id);
      setWoNote('');
      setWoTargetDate('');
      setWoCost('');
    } catch (error) {
      console.error('Error updating work order:', error);
      alert('Failed to update work order');
    }
  };

  const handleCompleteWO = async (woId) => {
    if (!window.confirm('Mark this work order as completed?')) return;

    try {
      const woDoc = doc(db, 'hou_fleet', selectedVehicle.id, 'workOrders', woId);
      await updateDoc(woDoc, {
        status: 'Completed',
        completedDate: new Date().toISOString()
      });

      alert('Work order marked as completed!');
      loadVehicleDetails(selectedVehicle.id);
    } catch (error) {
      console.error('Error completing work order:', error);
      alert('Failed to complete work order');
    }
  };

  const handleAddRepair = async () => {
    if (!repairForm.description || !repairForm.cost) {
      alert('Please fill in description and cost');
      return;
    }

    try {
      await addDoc(collection(db, 'hou_fleet', selectedVehicle.id, 'repairs'), {
        date: repairForm.date,
        description: repairForm.description,
        cost: parseFloat(repairForm.cost),
        createdAt: new Date().toISOString()
      });

      alert('Repair logged successfully!');
      loadVehicleDetails(selectedVehicle.id);
      setRepairForm({
        date: new Date().toISOString().split('T')[0],
        description: '',
        cost: ''
      });
    } catch (error) {
      console.error('Error adding repair:', error);
      alert('Failed to log repair');
    }
  };

  const calculateTotalCost = () => {
    const woCosts = workOrders.reduce((sum, wo) => sum + (wo.cost || 0), 0);
    const repairCosts = repairs.reduce((sum, r) => sum + (r.cost || 0), 0);
    return woCosts + repairCosts;
  };

  const renderDetails = () => (
    <div className="warehouse-vehicle-details">
      <div className="detail-row">
        <span className="detail-label">Truck Number:</span>
        <span className="detail-value">{selectedVehicle.truckNumber}</span>
      </div>
      <div className="detail-row">
        <span className="detail-label">Type:</span>
        <span className="detail-value">{selectedVehicle.type}</span>
      </div>
      <div className="detail-row">
        <span className="detail-label">Status:</span>
        <span className={`detail-value status-badge status-${selectedVehicle.status?.toLowerCase().replace(/\s/g, '-')}`}>
          {selectedVehicle.status}
        </span>
      </div>
      <div className="detail-row">
        <span className="detail-label">Mileage:</span>
        <span className="detail-value">{selectedVehicle.mileage?.toLocaleString() || 'N/A'}</span>
      </div>
      <div className="detail-row">
        <span className="detail-label">Assigned To:</span>
        <span className="detail-value">{selectedVehicle.assignedTo || 'Unassigned'}</span>
      </div>
    </div>
  );

  const renderInspections = () => (
    <div className="warehouse-inspections">
      {inspections.length === 0 ? (
        <p>No inspection records</p>
      ) : (
        inspections.map(inspection => (
          <div key={inspection.id} className="inspection-card">
            <div className="inspection-header">
              <span className="inspection-date">
                {new Date(inspection.date).toLocaleDateString()}
              </span>
              <span className="inspection-driver">{inspection.driverName || inspection.technicianName}</span>
            </div>
            <div className="inspection-mileage">Mileage: {inspection.currentMileage}</div>
            {inspection.notes && (
              <div className="inspection-notes">{inspection.notes}</div>
            )}
          </div>
        ))
      )}
    </div>
  );

  const renderWorkOrders = () => (
    <div className="warehouse-work-orders">
      {workOrders.length === 0 ? (
        <p>No work orders</p>
      ) : (
        workOrders.map(wo => (
          <div key={wo.id} className="wo-card">
            <div className="wo-header">
              <span className={`wo-status status-${wo.status?.toLowerCase()}`}>{wo.status}</span>
              <span className="wo-date">{new Date(wo.dateReported).toLocaleDateString()}</span>
            </div>
            <div className="wo-issue">{wo.issue}</div>
            {wo.notes && <div className="wo-notes">Notes: {wo.notes}</div>}
            {wo.targetFixDate && (
              <div className="wo-target">Target: {new Date(wo.targetFixDate).toLocaleDateString()}</div>
            )}
            {wo.cost && <div className="wo-cost">Cost: ${wo.cost.toFixed(2)}</div>}

            {wo.status === 'Open' && (
              <div className="wo-actions">
                <input
                  type="text"
                  placeholder="Add note..."
                  value={woNote}
                  onChange={(e) => setWoNote(e.target.value)}
                  style={{ marginRight: '8px', padding: '8px', flex: 1 }}
                />
                <input
                  type="date"
                  placeholder="Target date"
                  value={woTargetDate}
                  onChange={(e) => setWoTargetDate(e.target.value)}
                  style={{ marginRight: '8px', padding: '8px', width: '140px' }}
                />
                <input
                  type="number"
                  placeholder="Cost"
                  value={woCost}
                  onChange={(e) => setWoCost(e.target.value)}
                  style={{ marginRight: '8px', padding: '8px', width: '100px' }}
                />
                <button className="btn btn-small btn-primary" onClick={() => handleAddWONote(wo.id)}>
                  Update
                </button>
                <button className="btn btn-small btn-success" onClick={() => handleCompleteWO(wo.id)}>
                  Complete
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );

  const renderRepairs = () => (
    <div className="warehouse-repairs">
      <div className="add-repair-form">
        <h4>Log New Repair</h4>
        <div className="form-group">
          <input
            type="date"
            value={repairForm.date}
            onChange={(e) => setRepairForm({ ...repairForm, date: e.target.value })}
          />
        </div>
        <div className="form-group">
          <input
            type="text"
            placeholder="Description"
            value={repairForm.description}
            onChange={(e) => setRepairForm({ ...repairForm, description: e.target.value })}
          />
        </div>
        <div className="form-group">
          <input
            type="number"
            placeholder="Cost"
            value={repairForm.cost}
            onChange={(e) => setRepairForm({ ...repairForm, cost: e.target.value })}
          />
        </div>
        <button className="btn btn-primary" onClick={handleAddRepair}>
          Add Repair
        </button>
      </div>

      <div className="repairs-list">
        <h4>Repair History</h4>
        {repairs.length === 0 ? (
          <p>No repair records</p>
        ) : (
          repairs.map(repair => (
            <div key={repair.id} className="repair-card">
              <div className="repair-date">{new Date(repair.date).toLocaleDateString()}</div>
              <div className="repair-description">{repair.description}</div>
              <div className="repair-cost">${repair.cost.toFixed(2)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderCosts = () => (
    <div className="warehouse-costs">
      <div className="cost-summary">
        <h3>Lifetime Cost Summary</h3>
        <div className="cost-total">${calculateTotalCost().toFixed(2)}</div>
      </div>

      <div className="cost-breakdown">
        <h4>Work Orders</h4>
        <div className="cost-value">${workOrders.reduce((sum, wo) => sum + (wo.cost || 0), 0).toFixed(2)}</div>
      </div>

      <div className="cost-breakdown">
        <h4>Manual Repairs</h4>
        <div className="cost-value">${repairs.reduce((sum, r) => sum + (r.cost || 0), 0).toFixed(2)}</div>
      </div>
    </div>
  );

  return (
    <div className="warehouse-fleet-container">
      <h2>Fleet Management</h2>

      <div className="warehouse-fleet-list">
        {vehicles.map(vehicle => (
          <div
            key={vehicle.id}
            className="warehouse-fleet-card"
            onClick={() => handleVehicleClick(vehicle)}
          >
            <div className="fleet-card-header">
              <span className="fleet-truck-number">{vehicle.truckNumber}</span>
              <span className={`fleet-status status-${vehicle.status?.toLowerCase().replace(/\s/g, '-')}`}>
                {vehicle.status}
              </span>
            </div>
            <div className="fleet-type">{vehicle.type}</div>
            <div className="fleet-assigned">{vehicle.assignedTo || 'Unassigned'}</div>
          </div>
        ))}
      </div>

      {showModal && selectedVehicle && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-dialog modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selectedVehicle.truckNumber} - {selectedVehicle.type}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="modal-tabs">
              {['details', 'inspections', 'workOrders', 'repairs', 'costs'].map(tab => (
                <button
                  key={tab}
                  className={`modal-tab ${activeTab === tab ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1).replace(/([A-Z])/g, ' $1')}
                </button>
              ))}
            </div>

            <div className="modal-body">
              {activeTab === 'details' && renderDetails()}
              {activeTab === 'inspections' && renderInspections()}
              {activeTab === 'workOrders' && renderWorkOrders()}
              {activeTab === 'repairs' && renderRepairs()}
              {activeTab === 'costs' && renderCosts()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WarehouseFleet;
