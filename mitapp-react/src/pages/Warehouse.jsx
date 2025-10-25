import { useState } from 'react';
import Layout from '../components/common/Layout';
import Fleet from './Fleet';
import Equipment from './Equipment';
import Tools from './Tools';

const Warehouse = () => {
  const [activeTab, setActiveTab] = useState('fleet');

  return (
    <Layout>
      <div id="warehouse-tab" className="tab-content active">
        <div className="tab-header">
          <div className="sub-nav">
            <button
              className={`sub-nav-btn ${activeTab === 'fleet' ? 'active' : ''}`}
              onClick={() => setActiveTab('fleet')}
            >
              <i className="fas fa-truck"></i> Fleet
            </button>
            <button
              className={`sub-nav-btn ${activeTab === 'equipment' ? 'active' : ''}`}
              onClick={() => setActiveTab('equipment')}
            >
              <i className="fas fa-toolbox"></i> Equipment
            </button>
            <button
              className={`sub-nav-btn ${activeTab === 'tools' ? 'active' : ''}`}
              onClick={() => setActiveTab('tools')}
            >
              <i className="fas fa-wrench"></i> Tools
            </button>
          </div>
        </div>

        <div className="warehouse-content">
          {activeTab === 'fleet' && <Fleet />}
          {activeTab === 'equipment' && <Equipment />}
          {activeTab === 'tools' && <Tools />}
        </div>
      </div>
    </Layout>
  );
};

export default Warehouse;
