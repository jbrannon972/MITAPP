import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, Timestamp, doc, updateDoc, addDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useData } from '../../contexts/DataContext';

const WarehouseDashboard = () => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [vehiclesInRepair, setVehiclesInRepair] = useState([]);
  const [unassignedVehicles, setUnassignedVehicles] = useState([]);
  const [availableVehicles, setAvailableVehicles] = useState([]);
  const [fleetWOsPending, setFleetWOsPending] = useState(0);
  const [fleetWOsRecent, setFleetWOsRecent] = useState(0);
  const [equipmentWOsPending, setEquipmentWOsPending] = useState(0);
  const [toolRequestsRecent, setToolRequestsRecent] = useState(0);
  const [showEODModal, setShowEODModal] = useState(false);
  const [eodNotes, setEodNotes] = useState('');
  const { staffingData } = useData();

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    loadDashboardData();

    return () => clearInterval(timer);
  }, []);

  const loadDashboardData = async () => {
    try {
      await Promise.all([
        loadVehicleData(),
        loadFleetWOs(),
        loadEquipmentWOs(),
        loadToolRequests()
      ]);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    }
  };

  const loadVehicleData = async () => {
    try {
      const vehicleSnapshot = await getDocs(collection(db, 'hou_fleet'));
      const allVehicles = vehicleSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Vehicles in repair
      const inRepair = allVehicles.filter(v => v.status === 'In Repairs');
      setVehiclesInRepair(inRepair);

      // Unassigned vehicles
      const unassigned = allVehicles.filter(v =>
        (!v.assignedTo || v.assignedTo === '') &&
        v.status !== 'In Repairs' &&
        v.status !== 'Retired'
      );
      setUnassignedVehicles(unassigned);

      // Available vehicles (tech is off today)
      const today = new Date().toISOString().split('T')[0];
      const scheduleDoc = await getDocs(
        query(collection(db, 'hou_schedules'), where('date', '==', today))
      );

      let techsOffToday = [];
      if (!scheduleDoc.empty) {
        const scheduleData = scheduleDoc.docs[0].data();
        techsOffToday = (scheduleData.staffList || [])
          .filter(s => s.status === 'Off' || s.status === 'Vacation')
          .map(s => s.technicianId);
      }

      const available = allVehicles.filter(v =>
        v.assignedTo &&
        techsOffToday.includes(v.assignedTo) &&
        v.status !== 'In Repairs' &&
        v.status !== 'Retired'
      );
      setAvailableVehicles(available);

    } catch (error) {
      console.error('Error loading vehicle data:', error);
    }
  };

  const loadFleetWOs = async () => {
    try {
      const vehicleSnapshot = await getDocs(collection(db, 'hou_fleet'));
      let pendingCount = 0;
      let recentCount = 0;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      for (const vehicleDoc of vehicleSnapshot.docs) {
        const wosSnapshot = await getDocs(
          collection(db, 'hou_fleet', vehicleDoc.id, 'workOrders')
        );

        wosSnapshot.forEach(woDoc => {
          const wo = woDoc.data();
          if (wo.status === 'Open') {
            pendingCount++;
          }
          const reportedDate = wo.dateReported ? new Date(wo.dateReported) : null;
          if (reportedDate && reportedDate >= yesterday) {
            recentCount++;
          }
        });
      }

      setFleetWOsPending(pendingCount);
      setFleetWOsRecent(recentCount);
    } catch (error) {
      console.error('Error loading fleet WOs:', error);
    }
  };

  const loadEquipmentWOs = async () => {
    try {
      const equipmentSnapshot = await getDocs(collection(db, 'equipment'));
      let pendingCount = 0;

      for (const equipDoc of equipmentSnapshot.docs) {
        const wosSnapshot = await getDocs(
          collection(db, 'equipment', equipDoc.id, 'workOrders')
        );

        wosSnapshot.forEach(woDoc => {
          const wo = woDoc.data();
          if (wo.status === 'Open') {
            pendingCount++;
          }
        });
      }

      setEquipmentWOsPending(pendingCount);
    } catch (error) {
      console.error('Error loading equipment WOs:', error);
    }
  };

  const loadToolRequests = async () => {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const requestsSnapshot = await getDocs(collection(db, 'hou_tool_requests'));
      const recentCount = requestsSnapshot.docs.filter(doc => {
        const data = doc.data();
        const createdDate = data.createdAt ? new Date(data.createdAt) : null;
        return createdDate && createdDate >= yesterday;
      }).length;

      setToolRequestsRecent(recentCount);
    } catch (error) {
      console.error('Error loading tool requests:', error);
    }
  };

  const handleEODSubmit = async () => {
    if (!eodNotes.trim()) {
      alert('Please add notes for the EOD report');
      return;
    }

    try {
      await addDoc(collection(db, 'warehouse_eod_reports'), {
        date: new Date().toISOString().split('T')[0],
        timestamp: new Date().toISOString(),
        notes: eodNotes,
        vehiclesInRepair: vehiclesInRepair.map(v => ({
          id: v.id,
          truckNumber: v.truckNumber,
          type: v.type
        })),
        metrics: {
          fleetWOsPending,
          equipmentWOsPending,
          unassignedVehiclesCount: unassignedVehicles.length
        }
      });

      alert('EOD Report submitted successfully!');
      setShowEODModal(false);
      setEodNotes('');
    } catch (error) {
      console.error('Error submitting EOD report:', error);
      alert('Failed to submit EOD report');
    }
  };

  return (
    <div className="warehouse-dashboard">
      <div className="warehouse-welcome">
        <div>
          <h2>Welcome, Warehouse Team!</h2>
          <p className="warehouse-datetime">
            {currentTime.toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })} - {currentTime.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowEODModal(true)}>
          <i className="fas fa-clipboard-list"></i> EOD Report
        </button>
      </div>

      <div className="warehouse-dashboard-grid">
        <div className="warehouse-card">
          <div className="warehouse-card-header">
            <h3><i className="fas fa-tools"></i> Vehicles in Repair</h3>
          </div>
          <div className="warehouse-vehicle-list">
            {vehiclesInRepair.length === 0 ? (
              <p className="warehouse-no-items">No vehicles in repair</p>
            ) : (
              vehiclesInRepair.map(vehicle => (
                <div key={vehicle.id} className="warehouse-vehicle-item">
                  <span className="warehouse-vehicle-name">
                    {vehicle.truckNumber} - {vehicle.type}
                  </span>
                  <span className="warehouse-vehicle-status">In Repair</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="warehouse-card">
          <div className="warehouse-card-header">
            <h3><i className="fas fa-user-slash"></i> Unassigned Vehicles</h3>
          </div>
          <div className="warehouse-vehicle-list">
            {unassignedVehicles.length === 0 ? (
              <p className="warehouse-no-items">No unassigned vehicles</p>
            ) : (
              unassignedVehicles.map(vehicle => (
                <div key={vehicle.id} className="warehouse-vehicle-item">
                  <span className="warehouse-vehicle-name">
                    {vehicle.truckNumber} - {vehicle.type}
                  </span>
                  <span className="warehouse-vehicle-status status-available">Available</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="warehouse-card">
          <div className="warehouse-card-header">
            <h3><i className="fas fa-calendar-times"></i> Available (Tech Off Today)</h3>
          </div>
          <div className="warehouse-vehicle-list">
            {availableVehicles.length === 0 ? (
              <p className="warehouse-no-items">No available vehicles</p>
            ) : (
              availableVehicles.map(vehicle => (
                <div key={vehicle.id} className="warehouse-vehicle-item">
                  <span className="warehouse-vehicle-name">
                    {vehicle.truckNumber} - {vehicle.type}
                  </span>
                  <span className="warehouse-vehicle-detail">Tech Off</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="warehouse-card warehouse-card-full">
          <div className="warehouse-card-header">
            <h3><i className="fas fa-clipboard-check"></i> At a Glance</h3>
          </div>
          <div className="warehouse-glance-grid">
            <div className="warehouse-glance-item">
              <span className="warehouse-glance-value">{fleetWOsPending}</span>
              <span className="warehouse-glance-label">Pending Fleet WOs</span>
            </div>
            <div
              className="warehouse-glance-item clickable"
              onClick={() => alert(`${fleetWOsRecent} Fleet WOs in last 24 hours`)}
            >
              <span className="warehouse-glance-value">{fleetWOsRecent}</span>
              <span className="warehouse-glance-label">Fleet WOs (Last 24h)</span>
            </div>
            <div className="warehouse-glance-item">
              <span className="warehouse-glance-value">{equipmentWOsPending}</span>
              <span className="warehouse-glance-label">Pending Equipment WOs</span>
            </div>
            <div
              className="warehouse-glance-item clickable"
              onClick={() => alert(`${toolRequestsRecent} Tool Requests in last 24 hours`)}
            >
              <span className="warehouse-glance-value">{toolRequestsRecent}</span>
              <span className="warehouse-glance-label">Tool Requests (Last 24h)</span>
            </div>
          </div>
        </div>
      </div>

      {showEODModal && (
        <div className="modal-overlay" onClick={() => setShowEODModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>End of Day Report</h3>
              <button className="modal-close" onClick={() => setShowEODModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Summary and Notes</label>
                <textarea
                  value={eodNotes}
                  onChange={(e) => setEodNotes(e.target.value)}
                  placeholder="Enter EOD summary, vehicle updates, urgent actions, etc..."
                  rows="10"
                  style={{ width: '100%' }}
                />
              </div>

              <div className="eod-summary">
                <h4>Today's Metrics:</h4>
                <ul>
                  <li>Vehicles in Repair: {vehiclesInRepair.length}</li>
                  <li>Unassigned Vehicles: {unassignedVehicles.length}</li>
                  <li>Available Vehicles: {availableVehicles.length}</li>
                  <li>Pending Fleet WOs: {fleetWOsPending}</li>
                  <li>Pending Equipment WOs: {equipmentWOsPending}</li>
                </ul>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowEODModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleEODSubmit}>
                <i className="fas fa-check"></i> Submit EOD Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WarehouseDashboard;
