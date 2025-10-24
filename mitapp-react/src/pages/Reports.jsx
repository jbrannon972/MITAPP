import { useState, useEffect } from 'react';
import Layout from '../components/common/Layout';
import firebaseService from '../services/firebaseService';
import { useData } from '../contexts/DataContext';
import { exportToCSV } from '../utils/exportUtils';

const Reports = () => {
  const { staffingData } = useData();
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    zone: 'all'
  });

  // Data state
  const [fleetData, setFleetData] = useState([]);
  const [equipmentData, setEquipmentData] = useState([]);
  const [toolsData, setToolsData] = useState([]);
  const [damagesData, setDamagesData] = useState([]);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      const [fleet, equipment, tools, damages] = await Promise.all([
        firebaseService.loadFleetData(),
        firebaseService.getEquipment(),
        firebaseService.getTools(),
        firebaseService.getDocument('hou_damages', 'damage_reports')
      ]);

      setFleetData(fleet || []);
      setEquipmentData(equipment || []);
      setToolsData(tools || []);
      setDamagesData(damages?.reports || []);
    } catch (error) {
      console.error('Error loading report data:', error);
    }
  };

  const reportTypes = [
    { id: 'fleetUtilization', name: 'Fleet Utilization Report', icon: 'fa-truck', category: 'Fleet' },
    { id: 'fleetStatus', name: 'Fleet Status Summary', icon: 'fa-car-side', category: 'Fleet' },
    { id: 'equipmentStatus', name: 'Equipment Status Report', icon: 'fa-toolbox', category: 'Equipment' },
    { id: 'equipmentAssignment', name: 'Equipment Assignment Report', icon: 'fa-clipboard-list', category: 'Equipment' },
    { id: 'toolsInventory', name: 'Tools Inventory Report', icon: 'fa-wrench', category: 'Tools' },
    { id: 'toolsUsage', name: 'Tools Usage Analysis', icon: 'fa-chart-line', category: 'Tools' },
    { id: 'damagesCost', name: 'Damages Cost Analysis', icon: 'fa-dollar-sign', category: 'Damages' },
    { id: 'damagesStatus', name: 'Damages Status Report', icon: 'fa-car-crash', category: 'Damages' },
    { id: 'teamDistribution', name: 'Team Distribution Report', icon: 'fa-users', category: 'Team' },
    { id: 'zoneResources', name: 'Zone Resources Report', icon: 'fa-map-marked-alt', category: 'Team' }
  ];

  const generateReport = () => {
    setLoading(true);
    let data = null;

    switch (selectedReport) {
      case 'fleetStatus':
        data = generateFleetStatusReport();
        break;
      case 'equipmentStatus':
        data = generateEquipmentStatusReport();
        break;
      case 'toolsInventory':
        data = generateToolsInventoryReport();
        break;
      case 'damagesCost':
        data = generateDamagesCostReport();
        break;
      case 'teamDistribution':
        data = generateTeamDistributionReport();
        break;
      default:
        data = { message: 'This report is under development. Please select another report.' };
    }

    setReportData(data);
    setLoading(false);
  };

  const generateFleetStatusReport = () => {
    const statusCounts = {};
    fleetData.forEach(vehicle => {
      const status = vehicle.status || 'Unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    const assignedCount = fleetData.filter(v => v.assignedTo).length;
    const unassignedCount = fleetData.length - assignedCount;

    return {
      type: 'fleet',
      summary: {
        total: fleetData.length,
        assigned: assignedCount,
        unassigned: unassignedCount
      },
      statusBreakdown: statusCounts,
      details: fleetData
    };
  };

  const generateEquipmentStatusReport = () => {
    const statusCounts = {};
    equipmentData.forEach(item => {
      const status = item.status || 'Unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    return {
      type: 'equipment',
      summary: {
        total: equipmentData.length,
        available: statusCounts['Available'] || 0,
        inUse: statusCounts['In Use'] || 0,
        inRepairs: statusCounts['In Repairs'] || 0
      },
      statusBreakdown: statusCounts,
      details: equipmentData
    };
  };

  const generateToolsInventoryReport = () => {
    const statusCounts = {};
    const categoryCounts = {};

    toolsData.forEach(tool => {
      const status = tool.status || 'Unknown';
      const category = tool.category || 'Uncategorized';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    });

    return {
      type: 'tools',
      summary: {
        total: toolsData.length,
        available: statusCounts['Available'] || 0,
        inUse: statusCounts['In Use'] || 0,
        lost: statusCounts['Lost'] || 0
      },
      statusBreakdown: statusCounts,
      categoryBreakdown: categoryCounts,
      details: toolsData
    };
  };

  const generateDamagesCostReport = () => {
    const totalCost = damagesData.reduce((sum, damage) => {
      return sum + (parseFloat(damage.cost) || 0);
    }, 0);

    const statusCounts = {};
    damagesData.forEach(damage => {
      const status = damage.status || 'Pending';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    const costByStatus = {};
    damagesData.forEach(damage => {
      const status = damage.status || 'Pending';
      costByStatus[status] = (costByStatus[status] || 0) + (parseFloat(damage.cost) || 0);
    });

    return {
      type: 'damages',
      summary: {
        total: damagesData.length,
        totalCost: totalCost,
        avgCost: damagesData.length > 0 ? totalCost / damagesData.length : 0,
        pending: statusCounts['Pending'] || 0,
        resolved: statusCounts['Resolved'] || 0
      },
      statusBreakdown: statusCounts,
      costByStatus: costByStatus,
      details: damagesData
    };
  };

  const generateTeamDistributionReport = () => {
    if (!staffingData) return { message: 'No team data available' };

    const totalStaff = (staffingData.management?.length || 0) +
      (staffingData.zones?.reduce((sum, zone) => sum + zone.members.length + (zone.lead ? 1 : 0), 0) || 0);

    const roleBreakdown = {};

    if (staffingData.management) {
      staffingData.management.forEach(member => {
        const role = member.role || 'Unknown';
        roleBreakdown[role] = (roleBreakdown[role] || 0) + 1;
      });
    }

    if (staffingData.zones) {
      staffingData.zones.forEach(zone => {
        if (zone.lead) {
          const role = zone.lead.role || 'Unknown';
          roleBreakdown[role] = (roleBreakdown[role] || 0) + 1;
        }
        zone.members.forEach(member => {
          const role = member.role || 'Unknown';
          roleBreakdown[role] = (roleBreakdown[role] || 0) + 1;
        });
      });
    }

    return {
      type: 'team',
      summary: {
        totalStaff: totalStaff,
        zones: staffingData.zones?.length || 0,
        management: staffingData.management?.length || 0
      },
      roleBreakdown: roleBreakdown,
      zoneData: staffingData.zones || []
    };
  };

  const handleExportReport = () => {
    if (!reportData) return;

    let dataToExport = [];
    const reportName = reportTypes.find(r => r.id === selectedReport)?.name || 'report';

    if (reportData.details) {
      dataToExport = reportData.details;
    } else {
      dataToExport = [reportData.summary];
    }

    exportToCSV(dataToExport, reportName.toLowerCase().replace(/ /g, '_'));
  };

  const renderReportContent = () => {
    if (!selectedReport) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '400px',
          color: '#9ca3af'
        }}>
          <i className="fas fa-file-alt" style={{ fontSize: '64px', marginBottom: '20px' }}></i>
          <p style={{ fontSize: '18px' }}>Select a report from the left to get started.</p>
        </div>
      );
    }

    const report = reportTypes.find(r => r.id === selectedReport);

    return (
      <div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '24px',
          paddingBottom: '16px',
          borderBottom: '2px solid #e5e7eb'
        }}>
          <i className={`fas ${report.icon}`} style={{ fontSize: '24px', color: '#3b82f6' }}></i>
          <h2 style={{ margin: 0 }}>{report.name}</h2>
        </div>

        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-filter"></i> Report Filters</h3>
          </div>
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Start Date</label>
                <input
                  type="date"
                  className="form-input"
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>End Date</label>
                <input
                  type="date"
                  className="form-input"
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Zone</label>
                <select
                  className="form-input"
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }}
                >
                  <option value="all">All Zones</option>
                  <option value="north">North</option>
                  <option value="south">South</option>
                  <option value="east">East</option>
                  <option value="west">West</option>
                </select>
              </div>
            </div>
            <div style={{ marginTop: '16px', display: 'flex', gap: '12px' }}>
              <button className="btn btn-primary" onClick={generateReport} disabled={loading}>
                <i className="fas fa-play"></i> {loading ? 'Generating...' : 'Generate Report'}
              </button>
              <button className="btn btn-secondary" onClick={handleExportReport} disabled={!reportData}>
                <i className="fas fa-download"></i> Export
              </button>
            </div>
          </div>
        </div>

        {/* Report Results */}
        {reportData && (
          <div className="card" style={{ marginTop: '24px' }}>
            <div className="card-header">
              <h3><i className="fas fa-chart-bar"></i> Report Results</h3>
            </div>
            <div style={{ padding: '20px' }}>
              {reportData.message ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                  <i className="fas fa-info-circle" style={{ fontSize: '48px', marginBottom: '16px', color: '#3b82f6' }}></i>
                  <p style={{ fontSize: '16px' }}>{reportData.message}</p>
                </div>
              ) : (
                <>
                  {/* Summary Metrics */}
                  {reportData.summary && (
                    <div className="dashboard-grid" style={{ marginBottom: '24px' }}>
                      {Object.entries(reportData.summary).map(([key, value]) => (
                        <div key={key} className="metric-card">
                          <div className="metric-header">
                            <h3>{key.replace(/([A-Z])/g, ' $1').trim().toUpperCase()}</h3>
                          </div>
                          <div className="metric-value">
                            {typeof value === 'number' && key.toLowerCase().includes('cost')
                              ? '$' + value.toFixed(2)
                              : typeof value === 'number' && key.toLowerCase().includes('avg')
                              ? value.toFixed(2)
                              : value}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Status Breakdown */}
                  {reportData.statusBreakdown && (
                    <div style={{ marginTop: '24px' }}>
                      <h4 style={{ marginBottom: '16px' }}>Status Breakdown</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                        {Object.entries(reportData.statusBreakdown).map(([status, count]) => (
                          <div key={status} style={{
                            padding: '12px 16px',
                            backgroundColor: '#f3f4f6',
                            borderRadius: '6px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}>
                            <span style={{ fontWeight: '500' }}>{status}</span>
                            <span style={{
                              backgroundColor: '#3b82f6',
                              color: 'white',
                              padding: '4px 12px',
                              borderRadius: '12px',
                              fontSize: '14px',
                              fontWeight: '600'
                            }}>{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Category Breakdown for Tools */}
                  {reportData.categoryBreakdown && (
                    <div style={{ marginTop: '24px' }}>
                      <h4 style={{ marginBottom: '16px' }}>Category Breakdown</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                        {Object.entries(reportData.categoryBreakdown).map(([category, count]) => (
                          <div key={category} style={{
                            padding: '12px 16px',
                            backgroundColor: '#f3f4f6',
                            borderRadius: '6px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}>
                            <span style={{ fontWeight: '500' }}>{category}</span>
                            <span style={{
                              backgroundColor: '#10b981',
                              color: 'white',
                              padding: '4px 12px',
                              borderRadius: '12px',
                              fontSize: '14px',
                              fontWeight: '600'
                            }}>{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Role Breakdown for Team */}
                  {reportData.roleBreakdown && (
                    <div style={{ marginTop: '24px' }}>
                      <h4 style={{ marginBottom: '16px' }}>Role Distribution</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                        {Object.entries(reportData.roleBreakdown).map(([role, count]) => (
                          <div key={role} style={{
                            padding: '12px 16px',
                            backgroundColor: '#f3f4f6',
                            borderRadius: '6px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}>
                            <span style={{ fontWeight: '500' }}>{role}</span>
                            <span style={{
                              backgroundColor: '#8b5cf6',
                              color: 'white',
                              padding: '4px 12px',
                              borderRadius: '12px',
                              fontSize: '14px',
                              fontWeight: '600'
                            }}>{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Cost by Status for Damages */}
                  {reportData.costByStatus && (
                    <div style={{ marginTop: '24px' }}>
                      <h4 style={{ marginBottom: '16px' }}>Cost by Status</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                        {Object.entries(reportData.costByStatus).map(([status, cost]) => (
                          <div key={status} style={{
                            padding: '12px 16px',
                            backgroundColor: '#f3f4f6',
                            borderRadius: '6px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}>
                            <span style={{ fontWeight: '500' }}>{status}</span>
                            <span style={{
                              backgroundColor: '#ef4444',
                              color: 'white',
                              padding: '4px 12px',
                              borderRadius: '12px',
                              fontSize: '14px',
                              fontWeight: '600'
                            }}>${cost.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Layout>
      <div className="tab-content active">
        <div className="tab-header">
          <h2>Reports & Analytics</h2>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '280px 1fr',
          gap: '24px',
          minHeight: '600px'
        }}>
          {/* Reports Sidebar */}
          <div className="card" style={{ height: 'fit-content' }}>
            <div className="card-header">
              <h3><i className="fas fa-list"></i> Select a Report</h3>
            </div>
            <div style={{ padding: '0' }}>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {reportTypes.map((report) => (
                  <li
                    key={report.id}
                    onClick={() => setSelectedReport(report.id)}
                    style={{
                      padding: '12px 16px',
                      cursor: 'pointer',
                      borderBottom: '1px solid #e5e7eb',
                      backgroundColor: selectedReport === report.id ? '#eff6ff' : 'transparent',
                      color: selectedReport === report.id ? '#3b82f6' : '#374151',
                      fontWeight: selectedReport === report.id ? '600' : '400',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (selectedReport !== report.id) {
                        e.target.style.backgroundColor = '#f9fafb';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedReport !== report.id) {
                        e.target.style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    <i className={`fas ${report.icon}`} style={{ marginRight: '8px', width: '20px' }}></i>
                    {report.name}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Report Content */}
          <div>
            {renderReportContent()}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Reports;
