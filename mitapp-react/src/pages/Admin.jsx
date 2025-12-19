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
  const [loadingAccounts, setLoadingAccounts] = useState(false);
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
    setLoadingAccounts(true);

    try {
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

      // Get all existing accounts from Firebase Auth via Cloud Function
      // This is the proper way to check - directly against Firebase Auth, not a Firestore collection
      const existingEmails = await firebaseService.listAuthUserEmails();

      console.log(`Found ${existingEmails.size} existing Firebase Auth accounts`);

      // Find techs with emails that DON'T have a Firebase Auth account
      const techsWithoutAuth = users.filter(user => {
        if (!user.email) return false;
        return !existingEmails.has(user.email.toLowerCase());
      });

      console.log(`Found ${techsWithoutAuth.length} techs without accounts:`, techsWithoutAuth.map(t => t.name));
      setTechsWithoutAccounts(techsWithoutAuth);
    } catch (error) {
      console.error('Error loading users:', error);
      // If the Cloud Function isn't deployed yet, show a message
      if (error.message.includes('404') || error.message.includes('not found')) {
        alert('The account checking function needs to be deployed. Please deploy the Cloud Functions first.');
      }
    } finally {
      setLoadingAccounts(false);
    }
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

        {/* Techs Without Accounts Section */}
        {techsWithoutAccounts.length > 0 && (
          <div className="card" style={{ marginBottom: '24px', border: '2px solid var(--warning-color)' }}>
            <div className="card-header" style={{ background: 'var(--warning-color)', color: 'white' }}>
              <h3><i className="fas fa-exclamation-triangle"></i> Techs Without Accounts ({techsWithoutAccounts.length})</h3>
              <div className="tab-controls">
                <button
                  className="btn btn-success"
                  onClick={createMissingAccounts}
                  disabled={creatingAccounts}
                  title="Create accounts with password: Mitigation1"
                >
                  <i className="fas fa-user-plus"></i>{' '}
                  {creatingAccounts ? 'Creating...' : 'Create All Accounts'}
                </button>
              </div>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Zone</th>
                  </tr>
                </thead>
                <tbody>
                  {techsWithoutAccounts.map((user, index) => (
                    <tr key={user.id || index} style={{ background: 'var(--warning-bg)' }}>
                      <td><strong>{user.name || 'N/A'}</strong></td>
                      <td>{user.email || 'N/A'}</td>
                      <td>{user.role || 'N/A'}</td>
                      <td>{user.zoneName || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '12px 20px', background: 'var(--bg-secondary)', fontSize: '14px', color: 'var(--text-secondary)' }}>
              <i className="fas fa-info-circle"></i> All accounts will be created with password: <strong>Mitigation1</strong>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-users-cog"></i> All Team Members</h3>
            <div className="tab-controls">
              <button
                className="btn btn-secondary"
                onClick={loadUsers}
                disabled={loadingAccounts}
                title="Refresh and check for missing accounts"
              >
                <i className={`fas fa-sync-alt ${loadingAccounts ? 'fa-spin' : ''}`}></i>{' '}
                {loadingAccounts ? 'Checking...' : 'Check Accounts'}
              </button>
              <button className="btn btn-primary" onClick={handleAddUserClick}>
                <i className="fas fa-plus"></i> Add User
              </button>
            </div>
          </div>
          <div className="table-container">
            {loadingAccounts ? (
              <p style={{ padding: '20px', textAlign: 'center' }}>
                <i className="fas fa-spinner fa-spin"></i> Checking accounts...
              </p>
            ) : allUsers.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Zone</th>
                    <th>Account Status</th>
                  </tr>
                </thead>
                <tbody>
                  {allUsers.map((user, index) => {
                    const hasAccount = user.email && !techsWithoutAccounts.some(t => t.email?.toLowerCase() === user.email?.toLowerCase());
                    return (
                      <tr key={user.id || index}>
                        <td>{user.name || 'N/A'}</td>
                        <td>{user.email || <span style={{ color: 'var(--text-secondary)' }}>No email</span>}</td>
                        <td>{user.role || 'N/A'}</td>
                        <td>{user.zoneName || 'N/A'}</td>
                        <td>
                          {!user.email ? (
                            <span style={{ color: 'var(--text-secondary)' }}>—</span>
                          ) : hasAccount ? (
                            <span style={{ color: 'var(--success-color)' }}>
                              <i className="fas fa-check-circle"></i> Has Account
                            </span>
                          ) : (
                            <span style={{ color: 'var(--warning-color)' }}>
                              <i className="fas fa-exclamation-circle"></i> No Account
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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
