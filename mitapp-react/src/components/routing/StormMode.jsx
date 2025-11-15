import React, { useState } from 'react';

/**
 * Storm Mode - Emergency staff management during high-demand situations
 * Manages technicians, project managers, EHQ leaders, CS staff, and subcontractors
 */
const StormMode = ({
  techs = [],
  selectedDate,
  showAlert
}) => {
  const [activeTab, setActiveTab] = useState('technicians');

  // Mock data for staff - will be replaced with Firebase later
  const [projectManagers, setProjectManagers] = useState([
    { id: 1, name: 'Sample PM 1', startingLocation: 'office_1', install: true, sub: false, cs: false, pull: false },
    { id: 2, name: 'Sample PM 2', startingLocation: 'office_1', install: false, sub: true, cs: false, pull: true }
  ]);

  const [ehqLeaders, setEhqLeaders] = useState([
    { id: 1, name: 'Sample Leader 1', startingLocation: 'office_1', install: true, sub: false, cs: true, pull: false }
  ]);

  const [ehqCSStaff, setEhqCSStaff] = useState([
    { id: 1, name: 'Sample CS 1', startingLocation: 'office_2', install: false, sub: false, cs: true, pull: false }
  ]);

  const [subContractors, setSubContractors] = useState([
    { id: 1, name: 'ABC Crew', quantity: 5 },
    { id: 2, name: 'XYZ Contractors', quantity: 3 }
  ]);

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

  // Render staff table (PM, EHQ Leaders, EHQ CS Staff)
  const renderStaffTable = (data, setData) => {
    const updateStaff = (id, field, value) => {
      setData(data.map(staff =>
        staff.id === id ? { ...staff, [field]: value } : staff
      ));
    };

    return (
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Starting Location</th>
              <th>Install</th>
              <th>Sub</th>
              <th>CS</th>
              <th>Pull</th>
            </tr>
          </thead>
          <tbody>
            {data.map((staff) => (
              <tr key={staff.id}>
                <td><strong>{staff.name}</strong></td>
                <td>
                  <select
                    value={staff.startingLocation}
                    onChange={(e) => updateStaff(staff.id, 'startingLocation', e.target.value)}
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
                    checked={staff.install}
                    onChange={(e) => updateStaff(staff.id, 'install', e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={staff.sub}
                    onChange={(e) => updateStaff(staff.id, 'sub', e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={staff.cs}
                    onChange={(e) => updateStaff(staff.id, 'cs', e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={staff.pull}
                    onChange={(e) => updateStaff(staff.id, 'pull', e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // Render sub contractors table
  const renderSubContractorsTable = () => {
    const updateSubContractor = (id, field, value) => {
      setSubContractors(subContractors.map(sub =>
        sub.id === id ? { ...sub, [field]: value } : sub
      ));
    };

    return (
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Crew Name</th>
              <th>Quantity Available</th>
            </tr>
          </thead>
          <tbody>
            {subContractors.map((sub) => (
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
              </tr>
            ))}
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

  return (
    <div style={{ height: 'calc(100vh - 140px)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        marginBottom: '16px',
        padding: '16px',
        backgroundColor: 'var(--danger-bg)',
        borderRadius: '6px',
        border: '2px solid var(--danger-color)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <i className="fas fa-bolt" style={{ fontSize: '32px', color: 'var(--danger-color)' }}></i>
          <div>
            <h2 style={{ margin: 0, color: 'var(--danger-color)' }}>Storm Mode - Emergency Staff Management</h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
              Manage additional staff for {selectedDate}
            </p>
          </div>
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
          {activeTab === 'projectManagers' && renderStaffTable(projectManagers, setProjectManagers)}
          {activeTab === 'ehqLeaders' && renderStaffTable(ehqLeaders, setEhqLeaders)}
          {activeTab === 'ehqCSStaff' && renderStaffTable(ehqCSStaff, setEhqCSStaff)}
          {activeTab === 'subContractors' && renderSubContractorsTable()}
        </div>
      </div>
    </div>
  );
};

export default StormMode;
