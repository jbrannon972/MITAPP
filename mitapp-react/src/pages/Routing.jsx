import { useState, useEffect, useRef } from 'react';
import Layout from '../components/common/Layout';
import ManualMode from '../components/routing/ManualMode';
import { useData } from '../contexts/DataContext';
import firebaseService from '../services/firebaseService';
import { getMapboxService, initMapboxService } from '../services/mapboxService';
import {
  optimizeRoute,
  balanceWorkload,
  assignDemoTechs,
  getRoutingEligibleTechs,
  calculateRouteSummary
} from '../utils/routeOptimizer';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const Routing = () => {
  const { staffingData } = useData();
  const [activeView, setActiveView] = useState('jobs');
  const [jobs, setJobs] = useState([]);
  const [routes, setRoutes] = useState({});
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showOptimizeModal, setShowOptimizeModal] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [mapboxToken, setMapboxToken] = useState(localStorage.getItem('mapboxToken') || 'pk.eyJ1IjoiamJyYW5ub245NzIiLCJhIjoiY204NXN2Z2w2Mms4ODJrb2tvemV2ZnlicyJ9.84JYhRSUAF5_-vvdebw-TA');
  const [selectedTech, setSelectedTech] = useState(null);
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  // Houston office locations
  const offices = {
    office_1: {
      name: 'Conroe Office',
      address: '10491 Fussel Rd, Conroe, TX 77303',
      shortName: 'Conroe'
    },
    office_2: {
      name: 'Katy Office',
      address: '5115 E 5th St, Katy, TX 77493',
      shortName: 'Katy'
    }
  };

  useEffect(() => {
    loadJobs();
    loadRoutes();
  }, [selectedDate]);

  const loadJobs = async () => {
    try {
      setLoading(true);
      const data = await firebaseService.getDocument('hou_routing', `jobs_${selectedDate}`);
      setJobs(data?.jobs || []);
    } catch (error) {
      console.error('Error loading jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRoutes = async () => {
    try {
      const data = await firebaseService.getDocument('hou_routing', `routes_${selectedDate}`);
      setRoutes(data?.routes || {});
    } catch (error) {
      console.error('Error loading routes:', error);
    }
  };

  const handleCSVImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const parsedJobs = parseCSV(text);
      setJobs(parsedJobs);
      saveJobs(parsedJobs);
      setShowImportModal(false);
      alert(`Successfully imported ${parsedJobs.length} jobs!`);
    };
    reader.readAsText(file);
  };

  // Proper CSV parser that handles commas inside quoted fields
  const parseCSVLine = (line) => {
    const values = [];
    let currentValue = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        // Handle double quotes ("") as escaped quotes
        if (insideQuotes && nextChar === '"') {
          currentValue += '"';
          i++; // Skip next quote
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        // End of field
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }

    // Add last value
    values.push(currentValue.trim());
    return values;
  };

  const cleanPhoneNumber = (phone) => {
    if (!phone) return '';
    // Remove tabs, extra spaces, and normalize
    return phone.replace(/\t/g, '').trim();
  };

  const parseCSV = (csvText) => {
    const lines = csvText.split('\n');
    if (lines.length === 0) return [];

    const headers = parseCSVLine(lines[0]);

    const jobs = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;

      const values = parseCSVLine(lines[i]);
      const job = {};

      headers.forEach((header, index) => {
        job[header] = values[index] || '';
      });

      // Parse route_title: "Customer Name | Job Number | Job Type | Zone"
      const titleParts = (job.route_title || '').split('|').map(p => p.trim());
      const customerName = titleParts[0] || '';
      const jobType = titleParts[2] || 'Other';

      // Parse timeframe from route_description
      const tfMatch = job.route_description?.match(/TF\((\d+:\d+)-(\d+:\d+)\)/);

      // Clean phone number
      const cleanPhone = cleanPhoneNumber(job.customer_phone);

      // Determine if 2 techs needed based on job type
      const requiresTwoTechs =
        jobType.toLowerCase().includes('install') ||
        jobType.toLowerCase().includes('demo prep') ||
        (jobType.toLowerCase().includes('demo') && !jobType.toLowerCase().includes('check'));

      jobs.push({
        id: job.text || `job_${Date.now()}_${i}`,
        customerName: customerName,
        address: job.customer_address || '',
        zone: job.Zone || '',
        duration: parseFloat(job.duration) || 1,
        timeframeStart: tfMatch ? tfMatch[1] : '09:00',
        timeframeEnd: tfMatch ? tfMatch[2] : '17:00',
        jobType: jobType,
        requiresTwoTechs: requiresTwoTechs,
        description: job.route_description || '',
        phone: cleanPhone,
        status: 'unassigned',
        originalData: {
          next_visit_date: job.next_visit_date,
          route_title: job.route_title,
          customer_address: job.customer_address,
          zone: job.Zone,
          text: job.text
        }
      });
    }

    return jobs;
  };

  const saveJobs = async (jobsData) => {
    try {
      await firebaseService.saveDocument('hou_routing', `jobs_${selectedDate}`, {
        jobs: jobsData,
        date: selectedDate,
        lastUpdated: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error saving jobs:', error);
      alert('Error saving jobs. Please try again.');
    }
  };

  const getTechList = () => {
    if (!staffingData?.zones) return [];

    const allTechs = [];

    // Add zone members
    staffingData.zones.forEach(zone => {
      if (zone.lead) {
        allTechs.push({
          id: zone.lead.id,
          name: zone.lead.name,
          role: zone.lead.role,
          zone: zone.name,
          office: zone.lead.office || 'office_1',
          isDemoTech: false
        });
      }

      zone.members.forEach(member => {
        allTechs.push({
          id: member.id,
          name: member.name,
          role: member.role,
          zone: zone.name,
          office: member.office || 'office_1',
          isDemoTech: member.role === 'Demo Tech'
        });
      });
    });

    return allTechs;
  };

  const getDemoTechs = () => {
    return getTechList().filter(t => t.isDemoTech);
  };

  const getLeadTechs = () => {
    const allTechs = getTechList();
    return getRoutingEligibleTechs(allTechs);
  };

  const assignJobToTech = async (jobId, techId) => {
    const updatedJobs = jobs.map(job => {
      if (job.id === jobId) {
        return { ...job, assignedTech: techId, status: 'assigned' };
      }
      return job;
    });

    setJobs(updatedJobs);
    await saveJobs(updatedJobs);

    // Update routes
    const tech = getTechList().find(t => t.id === techId);
    const job = updatedJobs.find(j => j.id === jobId);

    const updatedRoutes = { ...routes };
    if (!updatedRoutes[techId]) {
      updatedRoutes[techId] = {
        tech: tech,
        jobs: []
      };
    }
    updatedRoutes[techId].jobs.push(job);

    setRoutes(updatedRoutes);
    await saveRoutes(updatedRoutes);
  };

  const saveRoutes = async (routesData) => {
    try {
      await firebaseService.saveDocument('hou_routing', `routes_${selectedDate}`, {
        routes: routesData,
        date: selectedDate,
        lastUpdated: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error saving routes:', error);
    }
  };

  const unassignJob = async (jobId) => {
    const updatedJobs = jobs.map(job => {
      if (job.id === jobId) {
        return { ...job, assignedTech: null, status: 'unassigned' };
      }
      return job;
    });

    setJobs(updatedJobs);
    await saveJobs(updatedJobs);

    // Remove from routes
    const updatedRoutes = { ...routes };
    Object.keys(updatedRoutes).forEach(techId => {
      updatedRoutes[techId].jobs = updatedRoutes[techId].jobs.filter(j => j.id !== jobId);
    });

    setRoutes(updatedRoutes);
    await saveRoutes(updatedRoutes);
  };

  const handleAutoOptimize = async () => {
    if (!mapboxToken) {
      alert('Please enter a Mapbox API token in the optimization settings.');
      return;
    }

    setOptimizing(true);
    setShowOptimizeModal(false);

    try {
      const leadTechs = getLeadTechs();
      const demoTechs = getDemoTechs();
      const unassignedJobs = jobs.filter(j => !j.assignedTech);

      if (unassignedJobs.length === 0) {
        alert('No unassigned jobs to optimize.');
        setOptimizing(false);
        return;
      }

      // Step 2: Geocode all job addresses
      const mapbox = getMapboxService();
      const geocodedJobs = await Promise.all(
        unassignedJobs.map(async (job) => {
          const coords = await mapbox.geocodeAddress(job.address);
          return { ...job, coordinates: coords };
        })
      );

      // Step 3: Balance workload across techs with geocoded jobs
      const balancedAssignments = balanceWorkload(geocodedJobs, leadTechs);

      // Step 4: Optimize each tech's route with Mapbox
      const optimizedRoutes = {};

      for (const [techId, assignment] of Object.entries(balancedAssignments)) {
        if (assignment.jobs.length === 0) continue;

        // Get start location for this tech
        const startLocation = offices[assignment.tech.office].address;

        // Build distance matrix (if we have Mapbox token)
        let distanceMatrix = null;
        if (mapboxToken && assignment.jobs.length > 1) {
          const addresses = [
            startLocation,
            ...assignment.jobs.map(j => j.address)
          ];

          try {
            distanceMatrix = await mapbox.calculateDistanceMatrix(addresses);
          } catch (error) {
            console.error('Distance matrix error:', error);
          }
        }

        // Determine shift based on tech name or role
        const isSecondShift = assignment.tech.name?.toLowerCase().includes('second shift') ||
                             assignment.tech.name?.toLowerCase().includes('2nd shift');
        const shift = isSecondShift ? 'second' : 'first';

        // Optimize route order
        const optimized = await optimizeRoute(
          assignment.jobs,
          startLocation,
          distanceMatrix,
          shift
        );

        optimizedRoutes[techId] = {
          tech: assignment.tech,
          jobs: optimized.optimizedJobs,
          summary: {
            totalDuration: optimized.totalDuration,
            totalDistance: optimized.totalDistance
          }
        };
      }

      // Step 5: Auto-assign demo techs (keep them with same tech all day)
      const { routes: finalRoutes } = assignDemoTechs(optimizedRoutes, demoTechs);

      // Update state
      setRoutes(finalRoutes);
      await saveRoutes(finalRoutes);

      // Update jobs with assignments
      const updatedJobs = jobs.map(job => {
        for (const [techId, route] of Object.entries(finalRoutes)) {
          if (route.jobs.some(j => j.id === job.id)) {
            return { ...job, assignedTech: techId, status: 'assigned' };
          }
        }
        return job;
      });

      setJobs(updatedJobs);
      await saveJobs(updatedJobs);

      alert(`Successfully optimized routes for ${Object.keys(finalRoutes).length} technicians!`);
    } catch (error) {
      console.error('Optimization error:', error);
      alert('Error during optimization. Please try again.');
    } finally {
      setOptimizing(false);
    }
  };

  const handleSaveMapboxToken = () => {
    if (mapboxToken) {
      localStorage.setItem('mapboxToken', mapboxToken);
      // Reinitialize Mapbox service with new token
      initMapboxService(mapboxToken);
      alert('Mapbox token saved!');
    }
  };

  const renderJobsView = () => {
    const unassignedJobs = jobs.filter(j => !j.assignedTech);
    const assignedJobs = jobs.filter(j => j.assignedTech);

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h3 style={{ margin: 0, marginBottom: '8px' }}>Daily Jobs - {selectedDate}</h3>
            <p style={{ margin: 0, color: '#6b7280' }}>
              {jobs.length} total | {unassignedJobs.length} unassigned | {assignedJobs.length} assigned
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <input
              type="date"
              className="form-control"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{ width: 'auto' }}
            />
            <button
              className="btn btn-success"
              onClick={() => setShowOptimizeModal(true)}
              disabled={optimizing || unassignedJobs.length === 0}
            >
              <i className="fas fa-magic"></i> {optimizing ? 'Optimizing...' : 'Auto-Optimize'}
            </button>
            <button className="btn btn-primary" onClick={() => setShowImportModal(true)}>
              <i className="fas fa-upload"></i> Import CSV
            </button>
          </div>
        </div>

        <div className="dashboard-grid" style={{ marginBottom: '24px' }}>
          <div className="metric-card">
            <div className="metric-header">
              <h3>Total Jobs</h3>
            </div>
            <div className="metric-value">{jobs.length}</div>
          </div>
          <div className="metric-card">
            <div className="metric-header">
              <h3>Unassigned</h3>
            </div>
            <div className="metric-value" style={{ color: '#f59e0b' }}>{unassignedJobs.length}</div>
          </div>
          <div className="metric-card">
            <div className="metric-header">
              <h3>Assigned</h3>
            </div>
            <div className="metric-value" style={{ color: '#10b981' }}>{assignedJobs.length}</div>
          </div>
          <div className="metric-card">
            <div className="metric-header">
              <h3>Total Hours</h3>
            </div>
            <div className="metric-value">{jobs.reduce((sum, j) => sum + j.duration, 0).toFixed(1)}</div>
          </div>
        </div>

        {/* Unassigned Jobs */}
        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="card-header">
            <h3><i className="fas fa-clipboard-list"></i> Unassigned Jobs ({unassignedJobs.length})</h3>
          </div>
          <div className="table-container">
            {unassignedJobs.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Address</th>
                    <th>Zone</th>
                    <th>Type</th>
                    <th>Timeframe</th>
                    <th>Duration</th>
                    <th>2 Techs?</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {unassignedJobs.map((job) => (
                    <tr key={job.id}>
                      <td><strong>{job.customerName}</strong></td>
                      <td>{job.address}</td>
                      <td>
                        <span className="status-badge status-available">{job.zone}</span>
                      </td>
                      <td>{job.jobType}</td>
                      <td>{job.timeframeStart} - {job.timeframeEnd}</td>
                      <td>{job.duration}h</td>
                      <td>
                        {job.requiresTwoTechs ? (
                          <span style={{ color: '#f59e0b' }}>
                            <i className="fas fa-users"></i> Yes
                          </span>
                        ) : (
                          <span style={{ color: '#6b7280' }}>No</span>
                        )}
                      </td>
                      <td>
                        <select
                          className="form-control"
                          style={{ width: 'auto', padding: '4px 8px', fontSize: '14px' }}
                          onChange={(e) => {
                            if (e.target.value) {
                              assignJobToTech(job.id, e.target.value);
                              e.target.value = '';
                            }
                          }}
                          defaultValue=""
                        >
                          <option value="">Assign to...</option>
                          {getLeadTechs().map(tech => (
                            <option key={tech.id} value={tech.id}>
                              {tech.name} ({tech.zone}) - {offices[tech.office]?.shortName}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
                All jobs have been assigned!
              </p>
            )}
          </div>
        </div>

        {/* Assigned Jobs */}
        {assignedJobs.length > 0 && (
          <div className="card">
            <div className="card-header">
              <h3><i className="fas fa-check-circle"></i> Assigned Jobs ({assignedJobs.length})</h3>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Zone</th>
                    <th>Type</th>
                    <th>Duration</th>
                    <th>Assigned To</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assignedJobs.map((job) => {
                    const tech = getTechList().find(t => t.id === job.assignedTech);
                    return (
                      <tr key={job.id}>
                        <td><strong>{job.customerName}</strong></td>
                        <td>{job.zone}</td>
                        <td>{job.jobType}</td>
                        <td>{job.duration}h</td>
                        <td>
                          <span style={{ color: '#3b82f6', fontWeight: '500' }}>
                            <i className="fas fa-user"></i> {tech?.name || 'Unknown'}
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn btn-secondary btn-small"
                            onClick={() => unassignJob(job.id)}
                          >
                            <i className="fas fa-times"></i> Unassign
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderRoutesView = () => {
    const leadTechs = getLeadTechs();

    return (
      <div>
        <h3 style={{ marginBottom: '24px' }}>Route Assignments - {selectedDate}</h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(450px, 1fr))', gap: '20px' }}>
          {leadTechs.map(tech => {
            const techRoute = routes[tech.id];
            const summary = calculateRouteSummary(techRoute);

            return (
              <div key={tech.id} className="card">
                <div className="card-header" style={{ backgroundColor: summary.totalJobs > 0 ? '#eff6ff' : '#f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: 0, marginBottom: '4px' }}>
                      <i className="fas fa-user"></i> {tech.name}
                    </h3>
                    <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>
                      {tech.role} | {tech.zone} | {offices[tech.office]?.shortName}
                    </p>
                  </div>
                  {summary.totalJobs > 0 && (
                    <button
                      className="btn btn-primary btn-small"
                      onClick={() => handleTechClick(tech.id)}
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                    >
                      <i className="fas fa-map"></i> View on Map
                    </button>
                  )}
                </div>
                <div style={{ padding: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ textAlign: 'center', padding: '8px', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
                      <div style={{ fontSize: '20px', fontWeight: '600', color: '#3b82f6' }}>{summary.totalJobs}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>Jobs</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '8px', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
                      <div style={{ fontSize: '20px', fontWeight: '600', color: '#10b981' }}>{summary.totalHours}h</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>Work</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '8px', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
                      <div style={{ fontSize: '20px', fontWeight: '600', color: '#f59e0b' }}>{summary.totalDriveHours || 0}h</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>Drive</div>
                    </div>
                  </div>

                  {techRoute && techRoute.jobs && techRoute.jobs.length > 0 ? (
                    <div>
                      {techRoute.jobs.map((job, idx) => (
                        <div
                          key={job.id}
                          style={{
                            padding: '12px',
                            backgroundColor: '#f9fafb',
                            borderRadius: '6px',
                            marginBottom: '8px',
                            borderLeft: '3px solid #3b82f6'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                            <div style={{ flex: 1 }}>
                              <strong style={{ fontSize: '14px' }}>
                                {idx + 1}. {job.customerName}
                              </strong>
                              {job.demoTech && (
                                <span style={{ marginLeft: '8px', fontSize: '12px', color: '#8b5cf6' }}>
                                  <i className="fas fa-user-plus"></i> + {job.demoTech}
                                </span>
                              )}
                              <p style={{ margin: '4px 0', fontSize: '12px', color: '#6b7280' }}>
                                <i className="fas fa-map-marker-alt"></i> {job.address}
                              </p>
                              <div style={{ display: 'flex', gap: '12px', marginTop: '8px', flexWrap: 'wrap' }}>
                                {job.startTime && (
                                  <span style={{ fontSize: '12px' }}>
                                    <i className="fas fa-clock"></i> {job.startTime}
                                  </span>
                                )}
                                {!job.startTime && (
                                  <span style={{ fontSize: '12px' }}>
                                    <i className="fas fa-clock"></i> {job.timeframeStart}-{job.timeframeEnd}
                                  </span>
                                )}
                                <span style={{ fontSize: '12px' }}>
                                  <i className="fas fa-hourglass-half"></i> {job.duration}h
                                </span>
                                {job.travelTime > 0 && (
                                  <span style={{ fontSize: '12px', color: '#f59e0b' }}>
                                    <i className="fas fa-car"></i> {job.travelTime}min
                                  </span>
                                )}
                                <span style={{ fontSize: '12px' }}>
                                  {job.jobType}
                                </span>
                              </div>
                            </div>
                            <button
                              className="btn btn-secondary btn-small"
                              onClick={() => unassignJob(job.id)}
                              style={{ padding: '4px 8px', fontSize: '12px' }}
                            >
                              <i className="fas fa-times"></i>
                            </button>
                          </div>
                        </div>
                      ))}

                      {summary.efficiency > 0 && (
                        <div style={{ marginTop: '12px', padding: '8px', backgroundColor: summary.efficiency > 70 ? '#d1fae5' : '#fef3c7', borderRadius: '6px', textAlign: 'center' }}>
                          <span style={{ fontSize: '12px', fontWeight: '500' }}>
                            Efficiency: {summary.efficiency}%
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p style={{ textAlign: 'center', color: '#6b7280', fontSize: '14px', padding: '20px' }}>
                      No jobs assigned
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const handleTechClick = (techId) => {
    setSelectedTech(techId);
    setActiveView('map');
  };

  // Initialize map when map view is active
  useEffect(() => {
    if (activeView !== 'map' || !mapContainerRef.current || mapInstanceRef.current) return;

    mapboxgl.accessToken = mapboxToken;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-95.5698, 30.1945], // Houston center
      zoom: 10
    });

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [activeView, mapboxToken]);

  // Update markers and routes when selected tech changes
  useEffect(() => {
    if (!mapInstanceRef.current || activeView !== 'map') return;

    const renderRouteOnMap = async () => {
      // Clear existing markers
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];

      const map = mapInstanceRef.current;

      // Remove existing route layer and source if they exist
      if (map.getLayer('route')) map.removeLayer('route');
      if (map.getSource('route')) map.removeSource('route');

      // Add office markers
      const officeLocations = {
        office_1: { lng: -95.4559, lat: 30.3119, name: 'Conroe' },
        office_2: { lng: -95.6508, lat: 29.7858, name: 'Katy' }
      };

      Object.values(officeLocations).forEach(office => {
        const el = document.createElement('div');
        el.innerHTML = `<div style="background-color: #3b82f6; color: white; padding: 6px 10px; border-radius: 4px; font-weight: bold; font-size: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"><i class="fas fa-building"></i> ${office.name}</div>`;

        const marker = new mapboxgl.Marker(el)
          .setLngLat([office.lng, office.lat])
          .addTo(map);

        markersRef.current.push(marker);
      });

      // Add job markers and route lines if tech is selected
      if (selectedTech && routes[selectedTech]) {
        const techRoute = routes[selectedTech];
        const officeCoords = officeLocations[techRoute.tech.office];
        const coordinates = [[officeCoords.lng, officeCoords.lat]];

        // Add job markers with real coordinates
        for (let idx = 0; idx < (techRoute.jobs?.length || 0); idx++) {
          const job = techRoute.jobs[idx];

          // Use stored coordinates or skip if not available
          if (job.coordinates && job.coordinates.lng && job.coordinates.lat) {
            coordinates.push([job.coordinates.lng, job.coordinates.lat]);

            const el = document.createElement('div');
            el.innerHTML = `<div style="background-color: #10b981; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); cursor: pointer;">${idx + 1}</div>`;

            const marker = new mapboxgl.Marker(el)
              .setLngLat([job.coordinates.lng, job.coordinates.lat])
              .setPopup(new mapboxgl.Popup({ offset: 25 })
                .setHTML(`<div style="padding: 8px;"><strong>${idx + 1}. ${job.customerName}</strong><br/>${job.address}<br/>${job.duration}h job${job.travelTime ? `<br/>${job.travelTime}min drive` : ''}</div>`))
              .addTo(map);

            markersRef.current.push(marker);
          }
        }

        // Return to office at end
        coordinates.push([officeCoords.lng, officeCoords.lat]);

        // Draw route line if we have coordinates
        if (coordinates.length > 2) {
          map.addSource('route', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: coordinates
              }
            }
          });

          map.addLayer({
            id: 'route',
            type: 'line',
            source: 'route',
            layout: {
              'line-join': 'round',
              'line-cap': 'round'
            },
            paint: {
              'line-color': '#3b82f6',
              'line-width': 4,
              'line-opacity': 0.75
            }
          });

          // Fit map to show entire route
          const bounds = coordinates.reduce(
            (bounds, coord) => bounds.extend(coord),
            new mapboxgl.LngLatBounds(coordinates[0], coordinates[0])
          );
          map.fitBounds(bounds, { padding: 50 });
        }
      }
    };

    renderRouteOnMap();
  }, [selectedTech, routes, activeView]);

  const renderMapView = () => {
    const techRoute = selectedTech ? routes[selectedTech] : null;

    return (
      <div>
        <div style={{ marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Route Map</h3>
          {selectedTech && techRoute && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', color: '#6b7280' }}>Showing route for:</span>
              <span style={{ fontSize: '14px', fontWeight: '500', color: '#3b82f6' }}>
                {techRoute.tech.name}
              </span>
              <button
                className="btn btn-secondary btn-small"
                onClick={() => setSelectedTech(null)}
                style={{ padding: '4px 8px', fontSize: '12px' }}
              >
                Clear Selection
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '20px' }}>
          {/* Tech List */}
          <div className="card" style={{ maxHeight: '600px', overflow: 'auto' }}>
            <div className="card-header">
              <h4><i className="fas fa-users"></i> Select Tech</h4>
            </div>
            <div style={{ padding: '12px' }}>
              {Object.entries(routes).map(([techId, route]) => {
                const summary = calculateRouteSummary(route);
                return (
                  <div
                    key={techId}
                    onClick={() => setSelectedTech(techId)}
                    style={{
                      padding: '12px',
                      marginBottom: '8px',
                      backgroundColor: selectedTech === techId ? '#eff6ff' : '#f9fafb',
                      border: selectedTech === techId ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ fontWeight: '500', marginBottom: '4px' }}>
                      {route.tech.name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                      {summary.totalJobs} jobs • {summary.totalHours}h work
                    </div>
                    {summary.totalDriveHours > 0 && (
                      <div style={{ fontSize: '12px', color: '#f59e0b' }}>
                        <i className="fas fa-car"></i> {summary.totalDriveHours}h drive
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Map */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
            <div
              ref={mapContainerRef}
              style={{ width: '100%', height: '600px' }}
            />

            {/* Route Details Overlay */}
            {techRoute && (
              <div style={{
                position: 'absolute',
                top: '16px',
                left: '16px',
                backgroundColor: 'white',
                padding: '16px',
                borderRadius: '8px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                maxWidth: '300px',
                maxHeight: '500px',
                overflow: 'auto',
                zIndex: 1
              }}>
                <h4 style={{ margin: '0 0 12px 0' }}>
                  {techRoute.tech.name}'s Route
                </h4>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px' }}>
                  <div><strong>Office:</strong> {offices[techRoute.tech.office]?.shortName}</div>
                  <div><strong>Zone:</strong> {techRoute.tech.zone}</div>
                  <div><strong>Shift:</strong> {techRoute.tech.name?.toLowerCase().includes('second') ? '2nd (1:15 PM - 9-11 PM)' : '1st (8:15 AM - 4-6 PM)'}</div>
                </div>
                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
                  {techRoute.jobs.map((job, idx) => (
                    <div
                      key={job.id}
                      style={{
                        marginBottom: '12px',
                        paddingBottom: '12px',
                        borderBottom: idx < techRoute.jobs.length - 1 ? '1px solid #f3f4f6' : 'none'
                      }}
                    >
                      <div style={{ fontWeight: '500', fontSize: '13px', marginBottom: '4px' }}>
                        {idx + 1}. {job.customerName}
                      </div>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>
                        {job.startTime && `${job.startTime} • `}
                        {job.duration}h
                        {job.travelTime > 0 && ` • ${job.travelTime}min drive`}
                      </div>
                      {job.demoTech && (
                        <div style={{ fontSize: '11px', color: '#8b5cf6', marginTop: '2px' }}>
                          + {job.demoTech}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const handleRefresh = () => {
    loadJobs();
    loadRoutes();
  };

  const renderManualView = () => {
    const leadTechs = getLeadTechs();

    return (
      <ManualMode
        jobs={jobs}
        routes={routes}
        techs={leadTechs}
        offices={offices}
        mapboxToken={mapboxToken}
        onUpdateRoutes={saveRoutes}
        onUpdateJobs={saveJobs}
        onRefresh={handleRefresh}
        selectedDate={selectedDate}
      />
    );
  };

  const renderTechsView = () => {
    const allTechs = getTechList();
    const leadTechs = getLeadTechs();
    const demoTechs = getDemoTechs();

    return (
      <div>
        <h3 style={{ marginBottom: '24px' }}>Technician Directory - Houston</h3>

        <div className="dashboard-grid" style={{ marginBottom: '24px' }}>
          <div className="metric-card">
            <div className="metric-header">
              <h3>Total Techs</h3>
            </div>
            <div className="metric-value">{allTechs.length}</div>
          </div>
          <div className="metric-card">
            <div className="metric-header">
              <h3>Lead Techs</h3>
            </div>
            <div className="metric-value" style={{ color: '#3b82f6' }}>{leadTechs.length}</div>
          </div>
          <div className="metric-card">
            <div className="metric-header">
              <h3>Demo Techs</h3>
            </div>
            <div className="metric-value" style={{ color: '#8b5cf6' }}>{demoTechs.length}</div>
          </div>
          <div className="metric-card">
            <div className="metric-header">
              <h3>Offices</h3>
            </div>
            <div className="metric-value">2</div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="card-header">
            <h3><i className="fas fa-building"></i> Office Locations</h3>
          </div>
          <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {Object.entries(offices).map(([key, office]) => (
              <div key={key} style={{ padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
                <h4 style={{ margin: 0, marginBottom: '8px', color: '#3b82f6' }}>
                  <i className="fas fa-map-marker-alt"></i> {office.name}
                </h4>
                <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>{office.address}</p>
                <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
                  {allTechs.filter(t => t.office === key).length} technicians
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-users"></i> All Technicians</h3>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Zone</th>
                  <th>Office</th>
                  <th>Type</th>
                  <th>Can Route</th>
                  <th>Assigned Jobs</th>
                </tr>
              </thead>
              <tbody>
                {allTechs.map(tech => {
                  const techRoute = routes[tech.id];
                  const jobCount = techRoute?.jobs?.length || 0;
                  const canRoute = leadTechs.some(lt => lt.id === tech.id);

                  return (
                    <tr key={tech.id}>
                      <td><strong>{tech.name}</strong></td>
                      <td>{tech.role}</td>
                      <td>{tech.zone}</td>
                      <td>{offices[tech.office]?.shortName || 'N/A'}</td>
                      <td>
                        {tech.isDemoTech ? (
                          <span className="status-badge status-in-use">Demo Tech</span>
                        ) : (
                          <span className="status-badge status-available">Lead Tech</span>
                        )}
                      </td>
                      <td>
                        {canRoute ? (
                          <span style={{ color: '#10b981' }}>
                            <i className="fas fa-check-circle"></i> Yes
                          </span>
                        ) : (
                          <span style={{ color: '#6b7280' }}>
                            <i className="fas fa-times-circle"></i> No
                          </span>
                        )}
                      </td>
                      <td>
                        {jobCount > 0 ? (
                          <span style={{ color: '#3b82f6', fontWeight: '500' }}>
                            {jobCount} job{jobCount !== 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span style={{ color: '#6b7280' }}>None</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Layout>
      <div className="tab-content active">
        <div className="tab-header">
          <h2>Route Planning & Management - Houston</h2>
        </div>

        <div className="tab-controls" style={{ marginBottom: '24px' }}>
          <div className="sub-nav">
            <button
              className={`sub-nav-btn ${activeView === 'jobs' ? 'active' : ''}`}
              onClick={() => setActiveView('jobs')}
            >
              <i className="fas fa-clipboard-list"></i> Jobs
            </button>
            <button
              className={`sub-nav-btn ${activeView === 'routes' ? 'active' : ''}`}
              onClick={() => setActiveView('routes')}
            >
              <i className="fas fa-route"></i> Routes
            </button>
            <button
              className={`sub-nav-btn ${activeView === 'manual' ? 'active' : ''}`}
              onClick={() => setActiveView('manual')}
            >
              <i className="fas fa-hand-pointer"></i> Manual Mode
            </button>
            <button
              className={`sub-nav-btn ${activeView === 'map' ? 'active' : ''}`}
              onClick={() => setActiveView('map')}
            >
              <i className="fas fa-map"></i> Map View
            </button>
            <button
              className={`sub-nav-btn ${activeView === 'techs' ? 'active' : ''}`}
              onClick={() => setActiveView('techs')}
            >
              <i className="fas fa-users"></i> Technicians
            </button>
          </div>
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <>
            {activeView === 'jobs' && renderJobsView()}
            {activeView === 'routes' && renderRoutesView()}
            {activeView === 'manual' && renderManualView()}
            {activeView === 'map' && renderMapView()}
            {activeView === 'techs' && renderTechsView()}
          </>
        )}

        {/* CSV Import Modal */}
        {showImportModal && (
          <div className="modal-overlay active" onClick={() => setShowImportModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3><i className="fas fa-upload"></i> Import Daily Jobs</h3>
                <button className="modal-close" onClick={() => setShowImportModal(false)}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="modal-body">
                <p style={{ marginBottom: '16px', color: '#6b7280' }}>
                  Select your daily export CSV file. The file should include customer info, addresses, timeframes, durations, and zone assignments.
                </p>
                <div style={{ marginBottom: '20px' }}>
                  <label htmlFor="csvFile" className="btn btn-secondary" style={{ cursor: 'pointer', display: 'inline-block' }}>
                    <i className="fas fa-file-csv"></i> Choose CSV File
                  </label>
                  <input
                    type="file"
                    id="csvFile"
                    accept=".csv"
                    onChange={handleCSVImport}
                    style={{ display: 'none' }}
                  />
                </div>
                <div style={{ padding: '12px', backgroundColor: '#eff6ff', borderRadius: '6px', fontSize: '14px' }}>
                  <strong>Houston Branch CSV Format:</strong>
                  <ul style={{ marginTop: '8px', marginBottom: 0, paddingLeft: '20px' }}>
                    <li>text (Job ID)</li>
                    <li>route_title (Customer Name | Job Type)</li>
                    <li>customer_address (Houston area)</li>
                    <li>Zone</li>
                    <li>duration (hours)</li>
                    <li>workers (assigned workers array)</li>
                    <li>route_description (includes TF(HH:MM-HH:MM))</li>
                  </ul>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowImportModal(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Auto-Optimize Modal */}
        {showOptimizeModal && (
          <div className="modal-overlay active" onClick={() => setShowOptimizeModal(false)}>
            <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3><i className="fas fa-magic"></i> Automatic Route Optimization</h3>
                <button className="modal-close" onClick={() => setShowOptimizeModal(false)}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="modal-body">
                <p style={{ marginBottom: '20px', color: '#6b7280' }}>
                  The optimizer will automatically assign all unassigned jobs to technicians and optimize their routes.
                </p>

                <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
                  <h4 style={{ margin: 0, marginBottom: '12px' }}>What the optimizer does:</h4>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px' }}>
                    <li>Balances workload across available technicians</li>
                    <li>Optimizes route order to minimize drive time</li>
                    <li>Respects job timeframe windows</li>
                    <li>Keeps techs in their zones when possible</li>
                    <li>Auto-assigns demo techs to 2-person jobs</li>
                    <li>Excludes Management and MIT Leads (except 2nd shift)</li>
                  </ul>
                </div>

                <div className="form-group">
                  <label htmlFor="mapboxToken">
                    Mapbox API Token
                    <span style={{ marginLeft: '8px', fontSize: '12px', color: '#6b7280' }}>
                      (Required for drive time calculations)
                    </span>
                  </label>
                  <input
                    type="text"
                    id="mapboxToken"
                    className="form-control"
                    value={mapboxToken}
                    onChange={(e) => setMapboxToken(e.target.value)}
                    placeholder="pk.your-mapbox-token-here"
                  />
                  <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                    Get a free token at{' '}
                    <a href="https://www.mapbox.com" target="_blank" rel="noopener noreferrer">
                      mapbox.com
                    </a>
                  </p>
                </div>

                {mapboxToken && (
                  <button
                    className="btn btn-secondary"
                    onClick={handleSaveMapboxToken}
                    style={{ marginBottom: '16px' }}
                  >
                    <i className="fas fa-save"></i> Save Token
                  </button>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowOptimizeModal(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-success"
                  onClick={handleAutoOptimize}
                  disabled={!mapboxToken}
                >
                  <i className="fas fa-magic"></i> Optimize Routes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Routing;
