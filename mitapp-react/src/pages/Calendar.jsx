import Layout from '../components/common/Layout';

const Calendar = () => {
  return (
    <Layout>
      <div className="tab-content active">
        <div className="tab-header">
          <h2>Calendar</h2>
        </div>
        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-calendar"></i> Calendar</h3>
          </div>
          <p>Calendar functionality will be implemented here.</p>
        </div>
      </div>
    </Layout>
  );
};

export default Calendar;
