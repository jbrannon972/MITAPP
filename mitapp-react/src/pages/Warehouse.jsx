import Layout from '../components/common/Layout';

const Warehouse = () => {
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
            <i className="fas fa-warehouse"></i> Warehouse Dashboard
          </h1>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          {/* Fleet Card */}
          <div className="card" style={{ cursor: 'pointer' }} onClick={() => window.location.href = '/fleet'}>
            <div style={{ padding: '32px', textAlign: 'center' }}>
              <i className="fas fa-truck" style={{ fontSize: '64px', color: 'var(--primary-color)', marginBottom: '16px' }}></i>
              <h2 style={{ margin: '0 0 8px 0' }}>Fleet Management</h2>
              <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                Manage vehicles, assignments, inspections, and work orders
              </p>
            </div>
          </div>

          {/* Equipment Card */}
          <div className="card" style={{ cursor: 'pointer' }} onClick={() => window.location.href = '/equipment'}>
            <div style={{ padding: '32px', textAlign: 'center' }}>
              <i className="fas fa-toolbox" style={{ fontSize: '64px', color: 'var(--success-color)', marginBottom: '16px' }}></i>
              <h2 style={{ margin: '0 0 8px 0' }}>Equipment</h2>
              <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                Track equipment inventory, assignments, and maintenance
              </p>
            </div>
          </div>

          {/* Tools Card */}
          <div className="card" style={{ cursor: 'pointer' }} onClick={() => window.location.href = '/tools'}>
            <div style={{ padding: '32px', textAlign: 'center' }}>
              <i className="fas fa-wrench" style={{ fontSize: '64px', color: 'var(--warning-color)', marginBottom: '16px' }}></i>
              <h2 style={{ margin: '0 0 8px 0' }}>Tools</h2>
              <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                Manage tool requests, inventory, and trends analytics
              </p>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: '20px' }}>
          <div className="card-header">
            <h3><i className="fas fa-info-circle"></i> Quick Access</h3>
          </div>
          <div style={{ padding: '20px' }}>
            <p style={{ marginBottom: '12px', color: 'var(--text-secondary)' }}>
              Use the <strong>Warehouse</strong> dropdown in the navigation bar above to quickly access:
            </p>
            <ul style={{ margin: 0, paddingLeft: '24px', color: 'var(--text-secondary)' }}>
              <li><strong>Dashboard</strong> - This overview page</li>
              <li><strong>Fleet</strong> - Vehicle management and tracking</li>
              <li><strong>Equipment</strong> - Equipment inventory and assignments</li>
              <li><strong>Tools</strong> - Tool requests and inventory with analytics</li>
            </ul>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Warehouse;
