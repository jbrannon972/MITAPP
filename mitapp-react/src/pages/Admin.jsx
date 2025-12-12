import { useState, useEffect } from 'react';
import Layout from '../components/common/Layout';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import firebaseService from '../services/firebaseService';

const Admin = () => {
  const { currentUser } = useAuth();
  const { staffingData, loading: dataLoading } = useData();
  const [allUsers, setAllUsers] = useState([]);
  const [techsWithoutAccounts, setTechsWithoutAccounts] = useState([]);
  const [creatingAccounts, setCreatingAccounts] = useState(false);
  const [creationResults, setCreationResults] = useState(null);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: 'Mitigation1',
    role: 'Manager',
    zoneName: ''
  });

  useEffect(() => {
    if (staffingData) {
      loadUsers();
    }
  }, [staffingData]);

  const loadUsers = async () => {
    // Combine all staff from different sources
    const users = [
      ...(staffingData.management || []).map(user => ({ ...user, zoneName: 'Management' })),
      ...(staffingData.warehouseStaff || []).map(user => ({ ...user, zoneName: 'Warehouse' })),
      ...(staffingData.zones || []).flatMap(zone =>
        [
          zone.lead ? { ...zone.lead, zoneName: zone.name } : null,
          ...(zone.members || []).map(member => ({ ...member, zoneName: zone.name }))
        ].filter(Boolean)
      )
    ].filter(Boolean);

    setAllUsers(users);

    // Find techs without auth accounts (those without a userId/id field or with email but no account)
    const techsWithoutAuth = users.filter(user => {
      // If user has no id/userId AND has an email, they likely don't have an auth account
      return user.email && !user.id && !user.userId;
    });

    setTechsWithoutAccounts(techsWithoutAuth);
  };

  const createMissingAccounts = async () => {
    if (techsWithoutAccounts.length === 0) {
      alert('No techs without accounts found.');
      return;
    }

    const confirmMessage = `This will create ${techsWithoutAccounts.length} user account(s) with the password "Mitigation1".\n\nTechs:\n${techsWithoutAccounts.map(t => `- ${t.name} (${t.email})`).join('\n')}\n\nContinue?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    setCreatingAccounts(true);
    setCreationResults(null);

    try {
      const results = await firebaseService.createTechAccounts(techsWithoutAccounts);
      setCreationResults(results);

      // Reload users to reflect new accounts
      await loadUsers();

      // Show success message
      if (results.created.length > 0) {
        alert(`Successfully created ${results.created.length} account(s)!\n\nPassword for all accounts: Mitigation1\n\n${results.errors.length > 0 ? `Errors: ${results.errors.length}` : ''}`);
      }
    } catch (error) {
      console.error('Error creating accounts:', error);
      alert(`Error creating accounts: ${error.message}`);
    } finally {
      setCreatingAccounts(false);
    }
  };

  const handleAddUserClick = () => {
    setNewUser({
      name: '',
      email: '',
      password: 'Mitigation1',
      role: 'Manager',
      zoneName: ''
    });
    setShowAddUserModal(true);
  };

  const handleCreateUser = async () => {
    // Validate inputs
    if (!newUser.name || !newUser.email || !newUser.password) {
      alert('Please fill in all required fields (Name, Email, Password)');
      return;
    }

    // Validate zone if MIT Tech or Demo Tech
    if (['MIT Tech', 'Demo Tech'].includes(newUser.role) && !newUser.zoneName) {
      alert('Please select a zone for this technician');
      return;
    }

    try {
      const userToCreate = {
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        zoneName: newUser.zoneName || (newUser.role === 'Warehouse' ? 'Warehouse' : 'Management')
      };

      const results = await firebaseService.createTechAccounts([userToCreate]);

      if (results.created.length > 0) {
        alert(`User created successfully!\n\nEmail: ${newUser.email}\nPassword: ${newUser.password}`);
        setShowAddUserModal(false);
        await loadUsers();
      } else if (results.errors.length > 0) {
        alert(`Error creating user: ${results.errors[0].error}`);
      }
    } catch (error) {
      console.error('Error creating user:', error);
      alert(`Error creating user: ${error.message}`);
    }
  };

  if (dataLoading) {
    return (
      <Layout>
        <div className="tab-content active">
          <p>Loading user data...</p>
        </div>
      </Layout>
    );
  }

  // Check if user has admin/manager permissions
  const isManager = currentUser?.role === 'Manager' || currentUser?.role === 'Admin';

  if (!isManager) {
    return (
      <Layout>
        <div className="tab-content active">
          <div className="card">
            <div className="card-header">
              <h3><i className="fas fa-exclamation-triangle"></i> Access Denied</h3>
            </div>
            <p style={{ padding: '20px' }}>You do not have permission to access this page.</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="tab-content active">
        <div className="tab-header">
          <h2>User Management</h2>
        </div>

        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-users-cog"></i> All Users</h3>
            <div className="tab-controls">
              {techsWithoutAccounts.length > 0 && (
                <button
                  className="btn btn-success"
                  onClick={createMissingAccounts}
                  disabled={creatingAccounts}
                  title="Create accounts for techs without auth"
                >
                  <i className="fas fa-user-plus"></i>{' '}
                  {creatingAccounts ? 'Creating...' : `Create ${techsWithoutAccounts.length} Missing Account${techsWithoutAccounts.length > 1 ? 's' : ''}`}
                </button>
              )}
              <button className="btn btn-primary" onClick={handleAddUserClick}>
                <i className="fas fa-plus"></i> Add User
              </button>
            </div>
          </div>
          <div className="table-container">
            {allUsers.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Zone</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allUsers.map((user, index) => (
                    <tr key={user.id || index}>
                      <td>{user.name || 'N/A'}</td>
                      <td>{user.email || 'N/A'}</td>
                      <td>{user.role || 'N/A'}</td>
                      <td>{user.zoneName || 'N/A'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-danger btn-small"
                          disabled
                          title="Coming soon"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ padding: '20px', textAlign: 'center' }}>No users found.</p>
            )}
          </div>
        </div>

        {/* Creation Results */}
        {creationResults && (
          <div className="card" style={{ marginTop: '24px' }}>
            <div className="card-header">
              <h3>
                <i className={creationResults.created.length > 0 ? 'fas fa-check-circle' : 'fas fa-exclamation-circle'}></i>{' '}
                Account Creation Results
              </h3>
              <button
                className="btn btn-secondary btn-small"
                onClick={() => setCreationResults(null)}
                title="Close"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div style={{ padding: '20px' }}>
              {creationResults.created.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ color: 'var(--success-color)', marginBottom: '10px' }}>
                    <i className="fas fa-check"></i> Successfully Created ({creationResults.created.length})
                  </h4>
                  <ul style={{ listStyle: 'none', padding: 0 }}>
                    {creationResults.created.map((user, idx) => (
                      <li key={idx} style={{ padding: '8px', background: 'var(--status-completed-bg)', borderRadius: '4px', marginBottom: '4px' }}>
                        <strong>{user.name}</strong> - {user.email}
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          Password: <strong>Mitigation1</strong>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {creationResults.errors.length > 0 && (
                <div>
                  <h4 style={{ color: 'var(--error-color)', marginBottom: '10px' }}>
                    <i className="fas fa-exclamation-triangle"></i> Errors ({creationResults.errors.length})
                  </h4>
                  <ul style={{ listStyle: 'none', padding: 0 }}>
                    {creationResults.errors.map((error, idx) => (
                      <li key={idx} style={{ padding: '8px', background: 'var(--status-error-bg)', borderRadius: '4px', marginBottom: '4px' }}>
                        <strong>{error.tech}</strong>: {error.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="card" style={{ marginTop: '24px' }}>
          <div className="card-header">
            <h3><i className="fas fa-info-circle"></i> User Summary</h3>
          </div>
          <div style={{ padding: '20px' }}>
            <div className="summary-grid">
              <div>
                <strong>Total Users:</strong> {allUsers.length}
              </div>
              <div>
                <strong>Management:</strong> {allUsers.filter(u => u.zoneName === 'Management').length}
              </div>
              <div>
                <strong>Warehouse Staff:</strong> {allUsers.filter(u => u.zoneName === 'Warehouse').length}
              </div>
              <div>
                <strong>Zone Technicians:</strong> {allUsers.filter(u => u.zoneName !== 'Management' && u.zoneName !== 'Warehouse').length}
              </div>
            </div>
          </div>
        </div>

        {/* Add User Modal */}
        {showAddUserModal && (
          <div className="modal-overlay active" style={{ zIndex: 9999 }}>
            <div className="modal" style={{ maxWidth: '500px' }}>
              <div className="modal-header">
                <h3><i className="fas fa-user-plus"></i> Add New User</h3>
                <button className="modal-close" onClick={() => setShowAddUserModal(false)}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="new-name">Full Name *</label>
                  <input
                    type="text"
                    id="new-name"
                    className="form-input"
                    placeholder="e.g., John Doe"
                    value={newUser.name}
                    onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="new-email">Email *</label>
                  <input
                    type="email"
                    id="new-email"
                    className="form-input"
                    placeholder="john.doe@entrusted.com"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="new-password">Password *</label>
                  <input
                    type="password"
                    id="new-password"
                    className="form-input"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="new-role">Role *</label>
                  <select
                    id="new-role"
                    className="form-input"
                    value={newUser.role}
                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value, zoneName: '' })}
                  >
                    <option value="Manager">Manager</option>
                    <option value="Supervisor">Supervisor</option>
                    <option value="MIT Lead">MIT Lead</option>
                    <option value="Fleet">Fleet</option>
                    <option value="Fleet Safety">Fleet Safety</option>
                    <option value="Auditor">Auditor</option>
                    <option value="Warehouse">Warehouse</option>
                    <option value="MIT Tech">MIT Tech</option>
                    <option value="Demo Tech">Demo Tech</option>
                  </select>
                </div>
                {['MIT Tech', 'Demo Tech'].includes(newUser.role) && (
                  <div className="form-group">
                    <label htmlFor="zone-select">Assign to Zone *</label>
                    <select
                      id="zone-select"
                      className="form-input"
                      value={newUser.zoneName}
                      onChange={(e) => setNewUser({ ...newUser, zoneName: e.target.value })}
                    >
                      <option value="">-- Select Zone --</option>
                      {staffingData?.zones?.map((zone) => (
                        <option key={zone.name} value={zone.name}>
                          {zone.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowAddUserModal(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleCreateUser}>
                  Create User
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Admin;
