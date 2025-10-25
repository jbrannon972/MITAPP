import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';

const TechReport = () => {
  const [activeReport, setActiveReport] = useState('fleet');
  const [vehicles, setVehicles] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [tools, setTools] = useState([]);
  const { currentUser } = useAuth();
  const { staffingData } = useData();

  // Fleet Inspection State
  const [inspectionForm, setInspectionForm] = useState({
    vehicleId: '',
    driverName: '',
    currentMileage: '',
    headlights: 'Good',
    turnSignals: 'Good',
    brakeLights: 'Good',
    dashWarningLights: 'No',
    bodyDamage: 'No',
    brakeNoise: 'No',
    tireTread: 'Good',
    windshieldWipers: 'Good',
    fluids: 'Good',
    leaks: 'Good',
    interiorCleanliness: 'Good',
    exteriorCleanliness: 'Good',
    driverSignature: '',
    notes: ''
  });

  // Equipment WO State
  const [equipmentForm, setEquipmentForm] = useState({
    equipmentId: '',
    issueDescription: ''
  });

  // Damage Report State
  const [damageForm, setDamageForm] = useState({
    jobNumber: '',
    dateOccurred: new Date().toISOString().split('T')[0],
    cause: 'Water Damage',
    description: '',
    howOccurred: '',
    zone: ''
  });

  // Tool Request State
  const [toolRequests, setToolRequests] = useState([{
    toolId: '',
    toolName: '',
    reason: '',
    urgency: 'Medium',
    notes: ''
  }]);

  useEffect(() => {
    loadVehicles();
    loadEquipment();
    loadTools();
  }, [currentUser]);

  const loadVehicles = async () => {
    try {
      const q = query(collection(db, 'hou_fleet'), where('status', '!=', 'Retired'));
      const snapshot = await getDocs(q);
      const vehicleList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setVehicles(vehicleList);

      // Pre-select user's assigned vehicle
      const myVehicle = vehicleList.find(v => v.assignedTo === currentUser?.userId);
      if (myVehicle) {
        setInspectionForm(prev => ({ ...prev, vehicleId: myVehicle.id }));
      }
    } catch (error) {
      console.error('Error loading vehicles:', error);
    }
  };

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

  const loadTools = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'hou_tools'));
      const toolList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTools(toolList);
    } catch (error) {
      console.error('Error loading tools:', error);
    }
  };

  const handleInspectionSubmit = async (e) => {
    e.preventDefault();

    if (!inspectionForm.vehicleId || !inspectionForm.driverSignature || !inspectionForm.currentMileage) {
      alert('Please fill in vehicle, signature, and mileage fields');
      return;
    }

    try {
      const vehicle = vehicles.find(v => v.id === inspectionForm.vehicleId);

      // Create inspection record
      const inspectionData = {
        ...inspectionForm,
        date: new Date().toISOString(),
        technicianId: currentUser.userId,
        technicianName: currentUser.username,
        vehicleNumber: vehicle.truckNumber
      };

      await addDoc(
        collection(db, 'hou_fleet', inspectionForm.vehicleId, 'inspections'),
        inspectionData
      );

      // Update vehicle mileage
      await updateDoc(doc(db, 'hou_fleet', inspectionForm.vehicleId), {
        mileage: inspectionForm.currentMileage
      });

      // Create work orders for failed items
      const issues = [];
      const checkFields = [
        { field: 'headlights', value: inspectionForm.headlights, label: 'Headlights' },
        { field: 'turnSignals', value: inspectionForm.turnSignals, label: 'Turn Signals' },
        { field: 'brakeLights', value: inspectionForm.brakeLights, label: 'Brake Lights' },
        { field: 'dashWarningLights', value: inspectionForm.dashWarningLights, label: 'Dashboard Warning Lights', badValue: 'Yes' },
        { field: 'bodyDamage', value: inspectionForm.bodyDamage, label: 'Body/Windshield Damage', badValue: 'Yes' },
        { field: 'brakeNoise', value: inspectionForm.brakeNoise, label: 'Brake Noise', badValue: 'Yes' },
        { field: 'tireTread', value: inspectionForm.tireTread, label: 'Tire Tread' },
        { field: 'windshieldWipers', value: inspectionForm.windshieldWipers, label: 'Windshield Wipers' },
        { field: 'fluids', value: inspectionForm.fluids, label: 'Fluids' },
        { field: 'leaks', value: inspectionForm.leaks, label: 'Leaks', badValue: 'Bad' },
        { field: 'interiorCleanliness', value: inspectionForm.interiorCleanliness, label: 'Interior Cleanliness' },
        { field: 'exteriorCleanliness', value: inspectionForm.exteriorCleanliness, label: 'Exterior Cleanliness' }
      ];

      checkFields.forEach(item => {
        const isBad = item.badValue ? item.value === item.badValue : item.value === 'Bad';
        if (isBad) {
          issues.push(item.label);
        }
      });

      if (issues.length > 0) {
        const woDescription = `Monthly Inspection Issues: ${issues.join(', ')}. ${inspectionForm.notes || ''}`;
        await addDoc(
          collection(db, 'hou_fleet', inspectionForm.vehicleId, 'workOrders'),
          {
            issue: woDescription,
            dateReported: new Date().toISOString(),
            reportedBy: currentUser.username,
            status: 'Open',
            source: 'Monthly Inspection'
          }
        );
      }

      alert('Inspection submitted successfully!');

      // Reset form
      setInspectionForm({
        vehicleId: inspectionForm.vehicleId,
        driverName: '',
        currentMileage: '',
        headlights: 'Good',
        turnSignals: 'Good',
        brakeLights: 'Good',
        dashWarningLights: 'No',
        bodyDamage: 'No',
        brakeNoise: 'No',
        tireTread: 'Good',
        windshieldWipers: 'Good',
        fluids: 'Good',
        leaks: 'Good',
        interiorCleanliness: 'Good',
        exteriorCleanliness: 'Good',
        driverSignature: '',
        notes: ''
      });
    } catch (error) {
      console.error('Error submitting inspection:', error);
      alert('Failed to submit inspection');
    }
  };

  const handleEquipmentWOSubmit = async (e) => {
    e.preventDefault();

    if (!equipmentForm.equipmentId || !equipmentForm.issueDescription) {
      alert('Please select equipment and describe the issue');
      return;
    }

    try {
      await addDoc(
        collection(db, 'equipment', equipmentForm.equipmentId, 'workOrders'),
        {
          issue: equipmentForm.issueDescription,
          dateReported: new Date().toISOString(),
          reportedBy: currentUser.username,
          technicianId: currentUser.userId,
          status: 'Open'
        }
      );

      // Update equipment status to maintenance
      await updateDoc(doc(db, 'equipment', equipmentForm.equipmentId), {
        status: 'Maintenance'
      });

      alert('Equipment work order submitted successfully!');
      setEquipmentForm({ equipmentId: '', issueDescription: '' });
    } catch (error) {
      console.error('Error submitting equipment WO:', error);
      alert('Failed to submit work order');
    }
  };

  const handleDamageReportSubmit = async (e) => {
    e.preventDefault();

    if (!damageForm.jobNumber || !damageForm.description) {
      alert('Please fill in job number and description');
      return;
    }

    try {
      await addDoc(collection(db, 'damage_reports'), {
        jobNumber: damageForm.jobNumber,
        dateOfOccurrence: damageForm.dateOccurred,
        cause: damageForm.cause,
        description: damageForm.description,
        howOccurred: damageForm.howOccurred,
        zone: damageForm.zone,
        technicianId: currentUser.userId,
        technicianName: currentUser.username,
        submittedAt: new Date().toISOString(),
        status: 'New',
        reviewed: false,
        resolved: false,
        activityLog: [{
          action: 'Report created',
          timestamp: new Date().toISOString(),
          user: currentUser.username
        }]
      });

      alert('Damage report submitted successfully!');
      setDamageForm({
        jobNumber: '',
        dateOccurred: new Date().toISOString().split('T')[0],
        cause: 'Water Damage',
        description: '',
        howOccurred: '',
        zone: ''
      });
    } catch (error) {
      console.error('Error submitting damage report:', error);
      alert('Failed to submit damage report');
    }
  };

  const handleToolRequestSubmit = async (e) => {
    e.preventDefault();

    const validRequests = toolRequests.filter(req => req.toolId && req.reason);
    if (validRequests.length === 0) {
      alert('Please fill in at least one tool request');
      return;
    }

    try {
      const promises = validRequests.map(req => {
        const tool = tools.find(t => t.id === req.toolId);
        return addDoc(collection(db, 'hou_tool_requests'), {
          toolName: tool?.name || req.toolName,
          toolCost: tool?.cost || 0,
          reason: req.reason,
          urgency: req.urgency,
          notes: req.notes,
          technicianId: currentUser.userId,
          technicianName: currentUser.username,
          createdAt: new Date().toISOString(),
          status: 'Pending'
        });
      });

      await Promise.all(promises);

      alert(`${validRequests.length} tool request(s) submitted successfully!`);
      setToolRequests([{
        toolId: '',
        toolName: '',
        reason: '',
        urgency: 'Medium',
        notes: ''
      }]);
    } catch (error) {
      console.error('Error submitting tool requests:', error);
      alert('Failed to submit tool requests');
    }
  };

  const addToolRequest = () => {
    setToolRequests([...toolRequests, {
      toolId: '',
      toolName: '',
      reason: '',
      urgency: 'Medium',
      notes: ''
    }]);
  };

  const removeToolRequest = (index) => {
    setToolRequests(toolRequests.filter((_, i) => i !== index));
  };

  const updateToolRequest = (index, field, value) => {
    const updated = [...toolRequests];
    updated[index][field] = value;
    setToolRequests(updated);
  };

  const renderFleetInspection = () => (
    <form onSubmit={handleInspectionSubmit} className="tech-report-form">
      <h3>Monthly Vehicle Inspection</h3>

      <div className="tech-form-group">
        <label>Vehicle *</label>
        <select
          value={inspectionForm.vehicleId}
          onChange={(e) => setInspectionForm({ ...inspectionForm, vehicleId: e.target.value })}
          required
        >
          <option value="">Select Vehicle</option>
          {vehicles.map(vehicle => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicle.truckNumber} - {vehicle.type}
            </option>
          ))}
        </select>
      </div>

      <div className="tech-form-group">
        <label>Driver Name</label>
        <input
          type="text"
          value={inspectionForm.driverName}
          onChange={(e) => setInspectionForm({ ...inspectionForm, driverName: e.target.value })}
          placeholder="Your name"
        />
      </div>

      <div className="tech-form-group">
        <label>Current Mileage *</label>
        <input
          type="number"
          value={inspectionForm.currentMileage}
          onChange={(e) => setInspectionForm({ ...inspectionForm, currentMileage: e.target.value })}
          placeholder="Enter current mileage"
          required
        />
      </div>

      <div className="tech-inspection-grid">
        <div className="tech-inspection-item">
          <label>Headlights</label>
          <select
            value={inspectionForm.headlights}
            onChange={(e) => setInspectionForm({ ...inspectionForm, headlights: e.target.value })}
          >
            <option value="Good">Good</option>
            <option value="Bad">Bad</option>
          </select>
        </div>

        <div className="tech-inspection-item">
          <label>Turn Signals</label>
          <select
            value={inspectionForm.turnSignals}
            onChange={(e) => setInspectionForm({ ...inspectionForm, turnSignals: e.target.value })}
          >
            <option value="Good">Good</option>
            <option value="Bad">Bad</option>
          </select>
        </div>

        <div className="tech-inspection-item">
          <label>Brake Lights</label>
          <select
            value={inspectionForm.brakeLights}
            onChange={(e) => setInspectionForm({ ...inspectionForm, brakeLights: e.target.value })}
          >
            <option value="Good">Good</option>
            <option value="Bad">Bad</option>
          </select>
        </div>

        <div className="tech-inspection-item">
          <label>Dashboard Warning Lights</label>
          <select
            value={inspectionForm.dashWarningLights}
            onChange={(e) => setInspectionForm({ ...inspectionForm, dashWarningLights: e.target.value })}
          >
            <option value="No">No</option>
            <option value="Yes">Yes</option>
          </select>
        </div>

        <div className="tech-inspection-item">
          <label>Body/Windshield Damage</label>
          <select
            value={inspectionForm.bodyDamage}
            onChange={(e) => setInspectionForm({ ...inspectionForm, bodyDamage: e.target.value })}
          >
            <option value="No">No</option>
            <option value="Yes">Yes</option>
          </select>
        </div>

        <div className="tech-inspection-item">
          <label>Brake Noise</label>
          <select
            value={inspectionForm.brakeNoise}
            onChange={(e) => setInspectionForm({ ...inspectionForm, brakeNoise: e.target.value })}
          >
            <option value="No">No</option>
            <option value="Yes">Yes</option>
          </select>
        </div>

        <div className="tech-inspection-item">
          <label>Tire Tread</label>
          <select
            value={inspectionForm.tireTread}
            onChange={(e) => setInspectionForm({ ...inspectionForm, tireTread: e.target.value })}
          >
            <option value="Good">Good</option>
            <option value="Bad">Bad</option>
          </select>
        </div>

        <div className="tech-inspection-item">
          <label>Windshield Wipers</label>
          <select
            value={inspectionForm.windshieldWipers}
            onChange={(e) => setInspectionForm({ ...inspectionForm, windshieldWipers: e.target.value })}
          >
            <option value="Good">Good</option>
            <option value="Bad">Bad</option>
          </select>
        </div>

        <div className="tech-inspection-item">
          <label>Fluids</label>
          <select
            value={inspectionForm.fluids}
            onChange={(e) => setInspectionForm({ ...inspectionForm, fluids: e.target.value })}
          >
            <option value="Good">Good</option>
            <option value="Bad">Bad</option>
          </select>
        </div>

        <div className="tech-inspection-item">
          <label>Leaks</label>
          <select
            value={inspectionForm.leaks}
            onChange={(e) => setInspectionForm({ ...inspectionForm, leaks: e.target.value })}
          >
            <option value="Good">No Leaks</option>
            <option value="Bad">Has Leaks</option>
          </select>
        </div>

        <div className="tech-inspection-item">
          <label>Interior Cleanliness</label>
          <select
            value={inspectionForm.interiorCleanliness}
            onChange={(e) => setInspectionForm({ ...inspectionForm, interiorCleanliness: e.target.value })}
          >
            <option value="Good">Good</option>
            <option value="Bad">Bad</option>
          </select>
        </div>

        <div className="tech-inspection-item">
          <label>Exterior Cleanliness</label>
          <select
            value={inspectionForm.exteriorCleanliness}
            onChange={(e) => setInspectionForm({ ...inspectionForm, exteriorCleanliness: e.target.value })}
          >
            <option value="Good">Good</option>
            <option value="Bad">Bad</option>
          </select>
        </div>
      </div>

      <div className="tech-form-group">
        <label>Additional Notes</label>
        <textarea
          value={inspectionForm.notes}
          onChange={(e) => setInspectionForm({ ...inspectionForm, notes: e.target.value })}
          placeholder="Any additional issues or notes..."
          rows="3"
        />
      </div>

      <div className="tech-form-group">
        <label>Driver Signature *</label>
        <input
          type="text"
          value={inspectionForm.driverSignature}
          onChange={(e) => setInspectionForm({ ...inspectionForm, driverSignature: e.target.value })}
          placeholder="Type your full name to sign"
          required
        />
      </div>

      <button type="submit" className="tech-submit-btn">
        <i className="fas fa-check-circle"></i> Submit Inspection
      </button>
    </form>
  );

  const renderEquipmentWO = () => (
    <form onSubmit={handleEquipmentWOSubmit} className="tech-report-form">
      <h3>Equipment Work Order</h3>

      <div className="tech-form-group">
        <label>Equipment *</label>
        <select
          value={equipmentForm.equipmentId}
          onChange={(e) => setEquipmentForm({ ...equipmentForm, equipmentId: e.target.value })}
          required
        >
          <option value="">Select Equipment</option>
          {equipment.map(item => (
            <option key={item.id} value={item.id}>
              {item.type} - {item.model} ({item.serialNumber})
            </option>
          ))}
        </select>
      </div>

      <div className="tech-form-group">
        <label>Issue Description *</label>
        <textarea
          value={equipmentForm.issueDescription}
          onChange={(e) => setEquipmentForm({ ...equipmentForm, issueDescription: e.target.value })}
          placeholder="Describe the issue..."
          rows="4"
          required
        />
      </div>

      <button type="submit" className="tech-submit-btn">
        <i className="fas fa-tools"></i> Submit Work Order
      </button>
    </form>
  );

  const renderDamageReport = () => (
    <form onSubmit={handleDamageReportSubmit} className="tech-report-form">
      <h3>Damage Report</h3>

      <div className="tech-form-group">
        <label>Job Number *</label>
        <input
          type="text"
          value={damageForm.jobNumber}
          onChange={(e) => setDamageForm({ ...damageForm, jobNumber: e.target.value })}
          placeholder="Enter job number"
          required
        />
      </div>

      <div className="tech-form-group">
        <label>Date of Occurrence *</label>
        <input
          type="date"
          value={damageForm.dateOccurred}
          onChange={(e) => setDamageForm({ ...damageForm, dateOccurred: e.target.value })}
          required
        />
      </div>

      <div className="tech-form-group">
        <label>Cause *</label>
        <select
          value={damageForm.cause}
          onChange={(e) => setDamageForm({ ...damageForm, cause: e.target.value })}
          required
        >
          <option value="Water Damage">Water Damage</option>
          <option value="Scratched Floor">Scratched Floor</option>
          <option value="Broken Item">Broken Item</option>
          <option value="Drywall Damage">Drywall Damage</option>
          <option value="Paint Damage">Paint Damage</option>
          <option value="Other">Other</option>
        </select>
      </div>

      <div className="tech-form-group">
        <label>What Happened *</label>
        <textarea
          value={damageForm.description}
          onChange={(e) => setDamageForm({ ...damageForm, description: e.target.value })}
          placeholder="Describe what was damaged..."
          rows="3"
          required
        />
      </div>

      <div className="tech-form-group">
        <label>How It Occurred *</label>
        <textarea
          value={damageForm.howOccurred}
          onChange={(e) => setDamageForm({ ...damageForm, howOccurred: e.target.value })}
          placeholder="Explain how the damage occurred..."
          rows="3"
          required
        />
      </div>

      <div className="tech-form-group">
        <label>Zone</label>
        <input
          type="text"
          value={damageForm.zone}
          onChange={(e) => setDamageForm({ ...damageForm, zone: e.target.value })}
          placeholder="Zone location"
        />
      </div>

      <button type="submit" className="tech-submit-btn">
        <i className="fas fa-exclamation-triangle"></i> Submit Damage Report
      </button>
    </form>
  );

  const renderToolRequests = () => (
    <form onSubmit={handleToolRequestSubmit} className="tech-report-form">
      <h3>Tool Requests</h3>

      {toolRequests.map((request, index) => (
        <div key={index} className="tech-tool-request-item">
          <div className="tech-tool-request-header">
            <span>Request #{index + 1}</span>
            {toolRequests.length > 1 && (
              <button
                type="button"
                onClick={() => removeToolRequest(index)}
                className="tech-remove-btn"
              >
                <i className="fas fa-times"></i>
              </button>
            )}
          </div>

          <div className="tech-form-group">
            <label>Tool *</label>
            <select
              value={request.toolId}
              onChange={(e) => updateToolRequest(index, 'toolId', e.target.value)}
              required
            >
              <option value="">Select Tool</option>
              {tools.map(tool => (
                <option key={tool.id} value={tool.id}>
                  {tool.name}
                </option>
              ))}
              <option value="other">Other (specify below)</option>
            </select>
          </div>

          {request.toolId === 'other' && (
            <div className="tech-form-group">
              <label>Tool Name *</label>
              <input
                type="text"
                value={request.toolName}
                onChange={(e) => updateToolRequest(index, 'toolName', e.target.value)}
                placeholder="Enter tool name"
                required
              />
            </div>
          )}

          <div className="tech-form-group">
            <label>Reason *</label>
            <textarea
              value={request.reason}
              onChange={(e) => updateToolRequest(index, 'reason', e.target.value)}
              placeholder="Why do you need this tool?"
              rows="2"
              required
            />
          </div>

          <div className="tech-form-group">
            <label>Urgency *</label>
            <select
              value={request.urgency}
              onChange={(e) => updateToolRequest(index, 'urgency', e.target.value)}
              required
            >
              <option value="Low">Low - Within the week</option>
              <option value="Medium">Medium - Within a few days</option>
              <option value="High">High - ASAP</option>
            </select>
          </div>

          <div className="tech-form-group">
            <label>Additional Notes</label>
            <textarea
              value={request.notes}
              onChange={(e) => updateToolRequest(index, 'notes', e.target.value)}
              placeholder="Any additional information..."
              rows="2"
            />
          </div>
        </div>
      ))}

      <button type="button" onClick={addToolRequest} className="tech-add-btn">
        <i className="fas fa-plus"></i> Add Another Tool
      </button>

      <button type="submit" className="tech-submit-btn">
        <i className="fas fa-paper-plane"></i> Submit Tool Request(s)
      </button>
    </form>
  );

  return (
    <div className="tech-report-container">
      <div className="tech-report-tabs">
        <button
          className={`tech-report-tab ${activeReport === 'fleet' ? 'active' : ''}`}
          onClick={() => setActiveReport('fleet')}
        >
          <i className="fas fa-truck"></i> Fleet
        </button>
        <button
          className={`tech-report-tab ${activeReport === 'equipment' ? 'active' : ''}`}
          onClick={() => setActiveReport('equipment')}
        >
          <i className="fas fa-toolbox"></i> Equipment
        </button>
        <button
          className={`tech-report-tab ${activeReport === 'damage' ? 'active' : ''}`}
          onClick={() => setActiveReport('damage')}
        >
          <i className="fas fa-exclamation-circle"></i> Damage
        </button>
        <button
          className={`tech-report-tab ${activeReport === 'tools' ? 'active' : ''}`}
          onClick={() => setActiveReport('tools')}
        >
          <i className="fas fa-wrench"></i> Tools
        </button>
      </div>

      <div className="tech-report-content">
        {activeReport === 'fleet' && renderFleetInspection()}
        {activeReport === 'equipment' && renderEquipmentWO()}
        {activeReport === 'damage' && renderDamageReport()}
        {activeReport === 'tools' && renderToolRequests()}
      </div>
    </div>
  );
};

export default TechReport;
