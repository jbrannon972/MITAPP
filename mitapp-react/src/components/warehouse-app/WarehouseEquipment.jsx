import { useState, useEffect } from 'react';
import { collection, getDocs, doc, addDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';

const WarehouseEquipment = () => {
  const [equipment, setEquipment] = useState([]);
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const [grainHistory, setGrainHistory] = useState([]);

  // Grain Depression Calculator State
  const [grainCalc, setGrainCalc] = useState({
    inletTemp: '',
    inletHumidity: '',
    outletTemp: '',
    outletHumidity: ''
  });
  const [gppResult, setGppResult] = useState(null);

  // Filters
  const [filter, setFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    loadEquipment();
  }, []);

  const loadEquipment = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'equipment'));
      const equipmentList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setEquipment(equipmentList);
    } catch (error) {
      console.error('Error loading equipment:', error);
    }
  };

  const loadGrainHistory = async (equipmentId) => {
    try {
      const historySnapshot = await getDocs(
        collection(db, 'equipment', equipmentId, 'grainDepressionHistory')
      );
      const history = historySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setGrainHistory(history);
    } catch (error) {
      console.error('Error loading grain history:', error);
    }
  };

  const calculateGPP = () => {
    const { inletTemp, inletHumidity, outletTemp, outletHumidity } = grainCalc;

    if (!inletTemp || !inletHumidity || !outletTemp || !outletHumidity) {
      alert('Please fill in all fields');
      return;
    }

    // GPP calculation formula (simplified)
    const tempDiff = parseFloat(inletTemp) - parseFloat(outletTemp);
    const humidityDiff = parseFloat(inletHumidity) - parseFloat(outletHumidity);
    const gpp = tempDiff * 0.5 + humidityDiff * 0.3;
    const grainDepression = Math.abs(gpp);

    setGppResult({
      gpp: gpp.toFixed(2),
      grainDepression: grainDepression.toFixed(2),
      tempDiff: tempDiff.toFixed(2),
      humidityDiff: humidityDiff.toFixed(2)
    });
  };

  const saveGrainReading = async () => {
    if (!gppResult || !selectedEquipment) {
      alert('Please calculate GPP first');
      return;
    }

    try {
      await addDoc(
        collection(db, 'equipment', selectedEquipment.id, 'grainDepressionHistory'),
        {
          ...grainCalc,
          ...gppResult,
          timestamp: new Date().toISOString(),
          date: new Date().toISOString().split('T')[0]
        }
      );

      alert('Grain reading saved successfully!');
      loadGrainHistory(selectedEquipment.id);

      // Reset form
      setGrainCalc({
        inletTemp: '',
        inletHumidity: '',
        outletTemp: '',
        outletHumidity: ''
      });
      setGppResult(null);
    } catch (error) {
      console.error('Error saving grain reading:', error);
      alert('Failed to save reading');
    }
  };

  const handleEquipmentClick = (equip) => {
    setSelectedEquipment(equip);
    loadGrainHistory(equip.id);
    setShowModal(true);
    setActiveTab('details');
  };

  const getFilteredEquipment = () => {
    return equipment.filter(item => {
      if (filter !== 'all' && item.status !== filter) return false;
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;
      return true;
    });
  };

  const getMetrics = () => {
    return {
      total: equipment.length,
      active: equipment.filter(e => e.status === 'Active').length,
      maintenance: equipment.filter(e => e.status === 'Maintenance').length,
      retired: equipment.filter(e => e.status === 'Retired').length,
      dehumidifiers: equipment.filter(e => e.type === 'Dehumidifier').length,
      fans: equipment.filter(e => e.type === 'Fan').length,
      airScrubbers: equipment.filter(e => e.type === 'Air Scrubber').length
    };
  };

  const metrics = getMetrics();
  const filteredEquipment = getFilteredEquipment();

  const renderDetails = () => (
    <div className="warehouse-equipment-details">
      <div className="detail-row">
        <span className="detail-label">Type:</span>
        <span className="detail-value">{selectedEquipment.type}</span>
      </div>
      <div className="detail-row">
        <span className="detail-label">Model:</span>
        <span className="detail-value">{selectedEquipment.model}</span>
      </div>
      <div className="detail-row">
        <span className="detail-label">Serial Number:</span>
        <span className="detail-value">{selectedEquipment.serialNumber}</span>
      </div>
      <div className="detail-row">
        <span className="detail-label">Status:</span>
        <span className={`detail-value status-badge status-${selectedEquipment.status?.toLowerCase()}`}>
          {selectedEquipment.status}
        </span>
      </div>
      {selectedEquipment.qrCode && (
        <div className="detail-row">
          <span className="detail-label">QR Code:</span>
          <span className="detail-value">{selectedEquipment.qrCode}</span>
        </div>
      )}
    </div>
  );

  const renderGrainCalculator = () => (
    <div className="grain-calculator">
      <h4>Grain Depression Calculator</h4>
      <div className="calc-form">
        <div className="calc-row">
          <div className="calc-field">
            <label>Inlet Temperature (°F)</label>
            <input
              type="number"
              value={grainCalc.inletTemp}
              onChange={(e) => setGrainCalc({ ...grainCalc, inletTemp: e.target.value })}
              placeholder="Enter inlet temp"
            />
          </div>
          <div className="calc-field">
            <label>Inlet Humidity (%)</label>
            <input
              type="number"
              value={grainCalc.inletHumidity}
              onChange={(e) => setGrainCalc({ ...grainCalc, inletHumidity: e.target.value })}
              placeholder="Enter inlet humidity"
            />
          </div>
        </div>

        <div className="calc-row">
          <div className="calc-field">
            <label>Outlet Temperature (°F)</label>
            <input
              type="number"
              value={grainCalc.outletTemp}
              onChange={(e) => setGrainCalc({ ...grainCalc, outletTemp: e.target.value })}
              placeholder="Enter outlet temp"
            />
          </div>
          <div className="calc-field">
            <label>Outlet Humidity (%)</label>
            <input
              type="number"
              value={grainCalc.outletHumidity}
              onChange={(e) => setGrainCalc({ ...grainCalc, outletHumidity: e.target.value })}
              placeholder="Enter outlet humidity"
            />
          </div>
        </div>

        <button className="btn btn-primary" onClick={calculateGPP}>
          Calculate GPP
        </button>
      </div>

      {gppResult && (
        <div className="calc-results">
          <h4>Results:</h4>
          <div className="result-item">
            <span className="result-label">Grain Protective Potential (GPP):</span>
            <span className="result-value">{gppResult.gpp}</span>
          </div>
          <div className="result-item">
            <span className="result-label">Grain Depression Differential:</span>
            <span className="result-value">{gppResult.grainDepression}</span>
          </div>
          <div className="result-item">
            <span className="result-label">Temperature Difference:</span>
            <span className="result-value">{gppResult.tempDiff}°F</span>
          </div>
          <div className="result-item">
            <span className="result-label">Humidity Difference:</span>
            <span className="result-value">{gppResult.humidityDiff}%</span>
          </div>
          <button className="btn btn-success" onClick={saveGrainReading}>
            Save Reading
          </button>
        </div>
      )}
    </div>
  );

  const renderGrainHistory = () => (
    <div className="grain-history">
      <h4>Grain Depression History</h4>
      {grainHistory.length === 0 ? (
        <p>No grain readings recorded</p>
      ) : (
        <div className="history-list">
          {grainHistory.map(reading => (
            <div key={reading.id} className="history-card">
              <div className="history-date">{new Date(reading.timestamp).toLocaleString()}</div>
              <div className="history-data">
                <span>GPP: {reading.gpp}</span>
                <span>Depression: {reading.grainDepression}</span>
                <span>Inlet: {reading.inletTemp}°F / {reading.inletHumidity}%</span>
                <span>Outlet: {reading.outletTemp}°F / {reading.outletHumidity}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="warehouse-equipment-container">
      <h2>Equipment Management</h2>

      <div className="equipment-metrics">
        <div className="metric-card clickable" onClick={() => setFilter('all')}>
          <div className="metric-value">{metrics.total}</div>
          <div className="metric-label">Total Units</div>
        </div>
        <div className="metric-card clickable" onClick={() => setFilter('Active')}>
          <div className="metric-value">{metrics.active}</div>
          <div className="metric-label">Active</div>
        </div>
        <div className="metric-card clickable" onClick={() => setFilter('Maintenance')}>
          <div className="metric-value">{metrics.maintenance}</div>
          <div className="metric-label">In Maintenance</div>
        </div>
        <div className="metric-card clickable" onClick={() => setFilter('Retired')}>
          <div className="metric-value">{metrics.retired}</div>
          <div className="metric-label">Retired</div>
        </div>
        <div className="metric-card clickable" onClick={() => setTypeFilter('Dehumidifier')}>
          <div className="metric-value">{metrics.dehumidifiers}</div>
          <div className="metric-label">Dehumidifiers</div>
        </div>
        <div className="metric-card clickable" onClick={() => setTypeFilter('Fan')}>
          <div className="metric-value">{metrics.fans}</div>
          <div className="metric-label">Fans</div>
        </div>
        <div className="metric-card clickable" onClick={() => setTypeFilter('Air Scrubber')}>
          <div className="metric-value">{metrics.airScrubbers}</div>
          <div className="metric-label">Air Scrubbers</div>
        </div>
      </div>

      {(filter !== 'all' || typeFilter !== 'all') && (
        <div className="filter-indicator">
          <span>Filters active:</span>
          {filter !== 'all' && <span className="filter-tag">{filter}</span>}
          {typeFilter !== 'all' && <span className="filter-tag">{typeFilter}</span>}
          <button
            className="btn btn-small"
            onClick={() => {
              setFilter('all');
              setTypeFilter('all');
            }}
          >
            Clear
          </button>
        </div>
      )}

      <div className="warehouse-equipment-list">
        {filteredEquipment.map(equip => (
          <div
            key={equip.id}
            className="warehouse-equipment-card"
            onClick={() => handleEquipmentClick(equip)}
          >
            <div className="equipment-card-header">
              <span className="equipment-type">{equip.type}</span>
              <span className={`equipment-status status-${equip.status?.toLowerCase()}`}>
                {equip.status}
              </span>
            </div>
            <div className="equipment-model">{equip.model}</div>
            <div className="equipment-serial">S/N: {equip.serialNumber}</div>
          </div>
        ))}
      </div>

      {showModal && selectedEquipment && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-dialog modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selectedEquipment.type} - {selectedEquipment.model}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="modal-tabs">
              {['details', 'grainCalc', 'grainHistory'].map(tab => (
                <button
                  key={tab}
                  className={`modal-tab ${activeTab === tab ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab === 'grainCalc' ? 'Grain Calculator' :
                   tab === 'grainHistory' ? 'Grain History' :
                   'Details'}
                </button>
              ))}
            </div>

            <div className="modal-body">
              {activeTab === 'details' && renderDetails()}
              {activeTab === 'grainCalc' && renderGrainCalculator()}
              {activeTab === 'grainHistory' && renderGrainHistory()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WarehouseEquipment;
