import Layout from '../components/common/Layout';

const Admin = () => {
  return (
    <Layout>
      <div className="tab-content active">
        <div className="tab-header">
          <h2>Admin</h2>
        </div>
        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-users-cog"></i> Admin</h3>
          </div>
          <p>Admin functionality will be implemented here.</p>
        </div>
      </div>
    </Layout>
  );
};

export default Admin;
