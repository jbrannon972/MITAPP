import React, { useState, useEffect } from 'react';
import firebaseService from '../../services/firebaseService';

/**
 * Storm Mode - Emergency staff management during high-demand situations
 * Manages technicians, project managers, EHQ leaders, CS staff, and subcontractors
 */
const StormMode = ({
  techs = [],
  selectedDate,
  onDateChange,
  showAlert,
  activeUsers = [],
  actionButtons,
  viewSelector
}) => {
  const [activeTab, setActiveTab] = useState('technicians');
  const [loading, setLoading] = useState(true);

  // Storm Mode staff state
  const [projectManagers, setProjectManagers] = useState([]);
  const [ehqLeaders, setEhqLeaders] = useState([]);
  const [ehqCSStaff, setEhqCSStaff] = useState([]);
  const [subContractors, setSubContractors] = useState([]);

  // Add/Edit modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [modalType, setModalType] = useState(''); // 'pm', 'ehq', 'cs', 'sub'
  const [formData, setFormData] = useState({
    name: '',
    startingLocation: 'office_1',
    capabilities: {
      install: false,
      sub: false,
      cs: false,
      pull: false
    },
    quantity: 1
  });

  const tabs = [
    { id: 'technicians', label: 'Technicians', icon: 'fa-user-hard-hat' },
    { id: 'projectManagers', label: 'Project Managers', icon: 'fa-clipboard-user' },
    { id: 'ehqLeaders', label: 'EHQ Leaders', icon: 'fa-user-tie' },
    { id: 'ehqCSStaff', label: 'EHQ CS Staff', icon: 'fa-headset' },
    { id: 'subContractors', label: 'Sub Contractors', icon: 'fa-people-group' }
  ];

  const offices = {
    office_1: 'Conroe',
    office_2: 'Katy'
  };

  // Load Storm Mode data on mount and when date changes
  useEffect(() => {
    loadStormModeData();
  }, [selectedDate]);

  const loadStormModeData = async () => {
    setLoading(true);
    try {
      const data = await firebaseService.loadStormModeData(selectedDate);
      setProjectManagers(data.projectManagers || []);
      setEhqLeaders(data.ehqLeaders || []);
      setEhqCSStaff(data.ehqCSStaff || []);
      setSubContractors(data.subContractors || []);
    } catch (error) {
      console.error('Error loading Storm Mode data:', error);
      showAlert?.('Error loading Storm Mode data. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Date navigation handlers
  const handlePreviousDay = () => {
    if (!onDateChange) return;
    const date = new Date(selectedDate);
    date.setDate(date.getDate() - 1);
    onDateChange(date.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    if (!onDateChange) return;
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + 1);
    onDateChange(date.toISOString().split('T')[0]);
  };

  const handleToday = () => {
    if (!onDateChange) return;
    const today = new Date();
    onDateChange(today.toISOString().split('T')[0]);
  };

  // Update staff member (PM, EHQ Leader, CS Staff)
  const updateStaff = async (id, field, value, type) => {
    try {
      let updates = {};

      if (field.startsWith('capabilities.')) {
        // Handle capability updates
        const capField = field.split('.')[1];
        const staff = type === 'pm' ? projectManagers.find(p => p.id === id) :
                      type === 'ehq' ? ehqLeaders.find(l => l.id === id) :
                      ehqCSStaff.find(s => s.id === id);

        updates = {
          capabilities: {
            ...staff.capabilities,
            [capField]: value
          }
        };
      } else {
        updates[field] = value;
      }

      // Update in Firebase
      if (type === 'pm') {
        await firebaseService.updateProjectManager(selectedDate, id, updates);
        setProjectManagers(prev => prev.map(pm =>
          pm.id === id ? { ...pm, ...updates, capabilities: updates.capabilities || pm.capabilities } : pm
        ));
      } else if (type === 'ehq') {
        await firebaseService.updateEHQLeader(selectedDate, id, updates);
        setEhqLeaders(prev => prev.map(l =>
          l.id === id ? { ...l, ...updates, capabilities: updates.capabilities || l.capabilities } : l
        ));
      } else if (type === 'cs') {
        await firebaseService.updateEHQCSStaff(selectedDate, id, updates);
        setEhqCSStaff(prev => prev.map(s =>
          s.id === id ? { ...s, ...updates, capabilities: updates.capabilities || s.capabilities } : s
        ));
      }
    } catch (error) {
      console.error('Error updating staff:', error);
      showAlert?.('Error updating staff. Please try again.', 'error');
    }
  };

  // Update sub contractor
  const updateSubContractor = async (id, field, value) => {
    try {
      const updates = { [field]: value };
      await firebaseService.updateSubContractor(selectedDate, id, updates);
      setSubContractors(prev => prev.map(sub =>
        sub.id === id ? { ...sub, ...updates } : sub
      ));
    } catch (error) {
      console.error('Error updating sub contractor:', error);
      showAlert?.('Error updating sub contractor. Please try again.', 'error');
    }
  };

  // Delete staff member
  const deleteStaff = async (id, type) => {
    if (!confirm('Are you sure you want to delete this staff member?')) return;

    try {
      if (type === 'pm') {
        await firebaseService.deleteProjectManager(selectedDate, id);
        setProjectManagers(prev => prev.filter(pm => pm.id !== id));
      } else if (type === 'ehq') {
        await firebaseService.deleteEHQLeader(selectedDate, id);
        setEhqLeaders(prev => prev.filter(l => l.id !== id));
      } else if (type === 'cs') {
        await firebaseService.deleteEHQCSStaff(selectedDate, id);
        setEhqCSStaff(prev => prev.filter(s => s.id !== id));
      } else if (type === 'sub') {
        await firebaseService.deleteSubContractor(selectedDate, id);
        setSubContractors(prev => prev.filter(s => s.id !== id));
      }
      showAlert?.('Staff member deleted successfully', 'success');
    } catch (error) {
      console.error('Error deleting staff:', error);
      showAlert?.('Error deleting staff. Please try again.', 'error');
    }
  };

  // Open add modal
  const openAddModal = (type) => {
    setModalType(type);
    setEditingStaff(null);
    // Set default capabilities based on type
    setFormData({
      name: '',
      startingLocation: 'office_1',
      capabilities: {
        install: type === 'pm' || type === 'ehq',
        sub: type === 'pm' || type === 'ehq',
        cs: type === 'cs',
        pull: type === 'pm'
      },
      quantity: 1
    });
    setShowAddModal(true);
  };

  // Add new staff member
  const addStaffMember = async (staffData) => {
    try {
      if (modalType === 'pm') {
        const newPM = await firebaseService.addProjectManager(selectedDate, staffData);
        setProjectManagers(prev => [...prev, newPM]);
      } else if (modalType === 'ehq') {
        const newLeader = await firebaseService.addEHQLeader(selectedDate, staffData);
        setEhqLeaders(prev => [...prev, newLeader]);
      } else if (modalType === 'cs') {
        const newStaff = await firebaseService.addEHQCSStaff(selectedDate, staffData);
        setEhqCSStaff(prev => [...prev, newStaff]);
      } else if (modalType === 'sub') {
        const newSub = await firebaseService.addSubContractor(selectedDate, staffData);
        setSubContractors(prev => [...prev, newSub]);
      }
      setShowAddModal(false);
      showAlert?.('Staff member added successfully', 'success');
    } catch (error) {
      console.error('Error adding staff:', error);
      showAlert?.('Error adding staff. Please try again.', 'error');
    }
  };

  // Render staff table (PM, EHQ Leaders, EHQ CS Staff)
  const renderStaffTable = (data, type) => {
    return (
      <div className="table-container">
        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="btn btn-primary"
            onClick={() => openAddModal(type)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <i className="fas fa-plus"></i>
            Add {type === 'pm' ? 'Project Manager' : type === 'ehq' ? 'EHQ Leader' : 'CS Staff'}
          </button>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Starting Location</th>
              <th>Install</th>
              <th>Sub</th>
              <th>CS</th>
              <th>Pull</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.length > 0 ? (
              data.map((staff) => (
                <tr key={staff.id}>
                  <td><strong>{staff.name}</strong></td>
                  <td>
                    <select
                      value={staff.startingLocation}
                      onChange={(e) => updateStaff(staff.id, 'startingLocation', e.target.value, type)}
                      className="form-control"
                      style={{ width: 'auto', padding: '4px 8px', fontSize: '14px' }}
                    >
                      <option value="office_1">Conroe</option>
                      <option value="office_2">Katy</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={staff.capabilities?.install || false}
                      onChange={(e) => updateStaff(staff.id, 'capabilities.install', e.target.checked, type)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={staff.capabilities?.sub || false}
                      onChange={(e) => updateStaff(staff.id, 'capabilities.sub', e.target.checked, type)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={staff.capabilities?.cs || false}
                      onChange={(e) => updateStaff(staff.id, 'capabilities.cs', e.target.checked, type)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      disabled={type === 'cs'} // CS staff always have CS capability
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={staff.capabilities?.pull || false}
                      onChange={(e) => updateStaff(staff.id, 'capabilities.pull', e.target.checked, type)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                  </td>
                  <td>
                    <button
                      onClick={() => deleteStaff(staff.id, type)}
                      className="btn btn-danger btn-sm"
                      style={{ padding: '4px 8px', fontSize: '12px' }}
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>
                  No staff members added yet. Click "Add" to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  // Render sub contractors table
  const renderSubContractorsTable = () => {
    return (
      <div className="table-container">
        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="btn btn-primary"
            onClick={() => openAddModal('sub')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <i className="fas fa-plus"></i>
            Add Sub Contractor
          </button>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Crew Name</th>
              <th>Quantity Available</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {subContractors.length > 0 ? (
              subContractors.map((sub) => (
                <tr key={sub.id}>
                  <td><strong>{sub.name}</strong></td>
                  <td>
                    <input
                      type="number"
                      value={sub.quantity}
                      onChange={(e) => updateSubContractor(sub.id, 'quantity', parseInt(e.target.value) || 0)}
                      className="form-control"
                      style={{ width: '80px', padding: '4px 8px', fontSize: '14px' }}
                      min="0"
                    />
                  </td>
                  <td>
                    <button
                      onClick={() => deleteStaff(sub.id, 'sub')}
                      className="btn btn-danger btn-sm"
                      style={{ padding: '4px 8px', fontSize: '12px' }}
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="3" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>
                  No sub contractors added yet. Click "Add" to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  // Render technicians table
  const renderTechniciansTable = () => {
    return (
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Office</th>
              <th>Shift</th>
            </tr>
          </thead>
          <tbody>
            {techs.length > 0 ? (
              techs.map((tech) => (
                <tr key={tech.id}>
                  <td><strong>{tech.name}</strong></td>
                  <td>{tech.role}</td>
                  <td>
                    <span className="status-badge status-available">
                      {tech.office === 'office_1' ? 'Conroe' : 'Katy'}
                    </span>
                  </td>
                  <td>{tech.shift === 'second' ? 'Second Shift' : 'First Shift'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="4" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>
                  No technicians available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  // Handle modal submit
  const handleModalSubmit = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      showAlert?.('Please enter a name', 'error');
      return;
    }
    addStaffMember(formData);
  };

  // Add/Edit Modal
  const renderAddModal = () => {
    if (!showAddModal) return null;

    const title = modalType === 'pm' ? 'Add Project Manager' :
                  modalType === 'ehq' ? 'Add EHQ Leader' :
                  modalType === 'cs' ? 'Add EHQ CS Staff' :
                  'Add Sub Contractor';

    return (
      <div className="modal-overlay active" onClick={() => setShowAddModal(false)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3><i className="fas fa-plus"></i> {title}</h3>
            <button className="modal-close" onClick={() => setShowAddModal(false)}>
              <i className="fas fa-times"></i>
            </button>
          </div>
          <div className="modal-body">
            <form onSubmit={handleModalSubmit}>
              <div className="form-group">
                <label>{modalType === 'sub' ? 'Crew Name' : 'Name'}</label>
                <input
                  type="text"
                  className="form-control"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={modalType === 'sub' ? 'Enter crew name' : 'Enter name'}
                  autoFocus
                />
              </div>

              {modalType !== 'sub' && (
                <>
                  <div className="form-group">
                    <label>Starting Location</label>
                    <select
                      className="form-control"
                      value={formData.startingLocation}
                      onChange={(e) => setFormData({ ...formData, startingLocation: e.target.value })}
                    >
                      <option value="office_1">Conroe</option>
                      <option value="office_2">Katy</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Capabilities</label>
                    <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={formData.capabilities.install}
                          onChange={(e) => setFormData({
                            ...formData,
                            capabilities: { ...formData.capabilities, install: e.target.checked }
                          })}
                        />
                        Install
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={formData.capabilities.sub}
                          onChange={(e) => setFormData({
                            ...formData,
                            capabilities: { ...formData.capabilities, sub: e.target.checked }
                          })}
                        />
                        Sub
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={formData.capabilities.cs}
                          onChange={(e) => setFormData({
                            ...formData,
                            capabilities: { ...formData.capabilities, cs: e.target.checked }
                          })}
                          disabled={modalType === 'cs'}
                        />
                        CS
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={formData.capabilities.pull}
                          onChange={(e) => setFormData({
                            ...formData,
                            capabilities: { ...formData.capabilities, pull: e.target.checked }
                          })}
                        />
                        Pull
                      </label>
                    </div>
                  </div>
                </>
              )}

              {modalType === 'sub' && (
                <div className="form-group">
                  <label>Quantity Available</label>
                  <input
                    type="number"
                    className="form-control"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                    min="1"
                  />
                </div>
              )}
            </form>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleModalSubmit}>
              Add
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <div>Loading Storm Mode data...</div>
      </div>
    );
  }

  // Calculate total staff count
  const totalStaff = projectManagers.length + ehqLeaders.length + ehqCSStaff.length + subContractors.length;

  return (
    <div style={{ height: 'calc(100vh - 140px)', display: 'flex', flexDirection: 'column' }}>
      {/* Compact Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '8px',
        padding: '8px 12px',
        backgroundColor: 'var(--surface-secondary)',
        borderRadius: '6px',
        border: '1px solid #e5e7eb'
      }}>
        {/* Left: Title, Date, Staff Counts */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>
            <i className="fas fa-bolt" style={{ color: 'var(--danger-color)', marginRight: '6px' }}></i>
            Storm Mode
          </h3>

          {/* Compact Date Picker */}
          {onDateChange && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <button
                onClick={handlePreviousDay}
                className="btn btn-secondary btn-small"
                style={{
                  padding: '2px 6px',
                  fontSize: '11px',
                  minWidth: 'unset',
                  lineHeight: '1'
                }}
                title="Previous day"
              >
                <i className="fas fa-chevron-left"></i>
              </button>

              <input
                type="date"
                value={selectedDate}
                onChange={(e) => onDateChange(e.target.value)}
                className="form-control"
                style={{
                  width: '110px',
                  fontSize: '11px',
                  padding: '2px 6px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '4px'
                }}
              />

              <button
                onClick={handleNextDay}
                className="btn btn-secondary btn-small"
                style={{
                  padding: '2px 6px',
                  fontSize: '11px',
                  minWidth: 'unset',
                  lineHeight: '1'
                }}
                title="Next day"
              >
                <i className="fas fa-chevron-right"></i>
              </button>

              <button
                onClick={handleToday}
                className="btn btn-primary btn-small"
                style={{
                  padding: '2px 8px',
                  fontSize: '11px'
                }}
                title="Go to today"
              >
                Today
              </button>
            </div>
          )}

          {/* Staff Counts */}
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            <span style={{ fontWeight: '600', color: 'var(--danger-color)' }}>{totalStaff}</span> emergency staff •
            <span style={{ fontWeight: '600', color: 'var(--text-primary)', marginLeft: '3px' }}>{techs.length}</span> regular techs
          </div>

          {/* Active Users - Presence Indicators */}
          {activeUsers && activeUsers.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 8px',
              backgroundColor: 'var(--info-bg)',
              borderRadius: '4px',
              fontSize: '11px',
              border: '1px solid var(--info-color)',
              color: 'var(--text-primary)'
            }}>
              <i className="fas fa-users" style={{ color: 'var(--info-color)', fontSize: '10px' }}></i>
              <span style={{ fontWeight: '500' }}>
                {activeUsers.length} {activeUsers.length === 1 ? 'other user' : 'others'} viewing
              </span>
            </div>
          )}
        </div>

        {/* Right: Action Buttons and View Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {actionButtons}
          {viewSelector}
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '16px',
        borderBottom: '2px solid var(--surface-secondary)',
        paddingBottom: '8px'
      }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 16px',
              fontSize: '14px',
              fontWeight: activeTab === tab.id ? '600' : '500',
              border: 'none',
              borderRadius: '6px 6px 0 0',
              backgroundColor: activeTab === tab.id ? 'var(--primary-color)' : 'var(--surface-secondary)',
              color: activeTab === tab.id ? 'white' : 'var(--text-primary)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <i className={`fas ${tab.icon}`}></i>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="card" style={{ flex: 1, overflow: 'auto' }}>
        <div className="card-header">
          <h3>
            <i className={`fas ${tabs.find(t => t.id === activeTab)?.icon}`}></i>
            {' '}{tabs.find(t => t.id === activeTab)?.label}
          </h3>
        </div>
        <div className="card-body">
          {activeTab === 'technicians' && renderTechniciansTable()}
          {activeTab === 'projectManagers' && renderStaffTable(projectManagers, 'pm')}
          {activeTab === 'ehqLeaders' && renderStaffTable(ehqLeaders, 'ehq')}
          {activeTab === 'ehqCSStaff' && renderStaffTable(ehqCSStaff, 'cs')}
          {activeTab === 'subContractors' && renderSubContractorsTable()}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {renderAddModal()}
    </div>
  );
};

export default StormMode;
