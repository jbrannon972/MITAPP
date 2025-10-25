import { useState, useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getMapboxService } from '../../services/mapboxService';

const ManualMode = ({
  jobs,
  routes,
  techs,
  offices,
  mapboxToken,
  onUpdateRoutes,
  onUpdateJobs
}) => {
  const [buildingRoute, setBuildingRoute] = useState([]);
  const [showAllJobs, setShowAllJobs] = useState(false);
  const [hoveredJob, setHoveredJob] = useState(null);
  const [draggedRoute, setDraggedRoute] = useState(null);
  const [selectedJobOnMap, setSelectedJobOnMap] = useState(null);

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

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
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [mapboxToken]);

  // Update markers when jobs or filter changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const renderJobMarkers = async () => {
      // Clear existing markers
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];

      const map = mapInstanceRef.current;

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

      // Filter jobs based on toggle
      const visibleJobs = showAllJobs
        ? jobs
        : jobs.filter(j => !j.assignedTech);

      // Geocode and add job markers
      const mapbox = getMapboxService();

      for (const job of visibleJobs) {
        // Use cached coordinates or geocode
        let coords = job.coordinates;
        if (!coords && job.address) {
          try {
            coords = await mapbox.geocodeAddress(job.address);
            // Update job with coordinates (optimization for future renders)
            job.coordinates = coords;
          } catch (error) {
            console.error('Geocoding error:', error);
            continue;
          }
        }

        if (!coords || !coords.lng || !coords.lat) continue;

        // Determine marker color based on status
        let markerColor = '#10b981'; // Green for unassigned
        if (job.assignedTech) {
          markerColor = '#6b7280'; // Gray for assigned
        }
        if (buildingRoute.some(j => j.id === job.id)) {
          markerColor = '#f59e0b'; // Orange for in building route
        }

        const el = document.createElement('div');
        el.style.cursor = 'pointer';
        el.innerHTML = `
          <div class="job-marker" style="
            background-color: ${markerColor};
            color: white;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 14px;
            border: 3px solid white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            transition: transform 0.2s;
          ">
            ${job.requiresTwoTechs ? '<i class="fas fa-users" style="font-size: 12px;"></i>' : '<i class="fas fa-map-pin" style="font-size: 12px;"></i>'}
          </div>
        `;

        // Hover effect
        el.addEventListener('mouseenter', () => {
          el.querySelector('.job-marker').style.transform = 'scale(1.2)';
          setHoveredJob(job);
        });

        el.addEventListener('mouseleave', () => {
          el.querySelector('.job-marker').style.transform = 'scale(1)';
          setHoveredJob(null);
        });

        // Click to add to building route
        el.addEventListener('click', () => {
          handleJobClick(job);
        });

        const popup = new mapboxgl.Popup({ offset: 25, closeButton: false })
          .setHTML(`
            <div style="padding: 8px; min-width: 200px;">
              <strong style="font-size: 14px;">${job.customerName}</strong>
              <div style="margin-top: 6px; font-size: 12px; color: #6b7280;">
                <div><i class="fas fa-map-marker-alt"></i> ${job.address}</div>
                <div style="margin-top: 4px;"><i class="fas fa-wrench"></i> ${job.jobType}</div>
                <div style="margin-top: 4px;"><i class="fas fa-clock"></i> ${job.duration}h</div>
                ${job.requiresTwoTechs ? '<div style="margin-top: 4px; color: #f59e0b;"><i class="fas fa-users"></i> Requires 2 Techs</div>' : ''}
                <div style="margin-top: 4px;"><i class="fas fa-calendar-alt"></i> ${job.timeframeStart} - ${job.timeframeEnd}</div>
              </div>
            </div>
          `);

        const marker = new mapboxgl.Marker(el)
          .setLngLat([coords.lng, coords.lat])
          .setPopup(popup)
          .addTo(map);

        markersRef.current.push(marker);
      }
    };

    renderJobMarkers();
  }, [jobs, showAllJobs, buildingRoute]);

  const handleJobClick = (job) => {
    // Don't add assigned jobs to building route unless showing all
    if (job.assignedTech && !showAllJobs) return;

    // Check if already in building route
    const existingIndex = buildingRoute.findIndex(j => j.id === job.id);

    if (existingIndex >= 0) {
      // Remove from building route
      setBuildingRoute(buildingRoute.filter(j => j.id !== job.id));
    } else {
      // Add to building route
      setBuildingRoute([...buildingRoute, job]);
    }
  };

  const handleDragStart = (e, routeJobs, techId = null) => {
    setDraggedRoute({ jobs: routeJobs, fromTechId: techId });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDropOnTech = async (e, targetTechId) => {
    e.preventDefault();

    if (!draggedRoute) return;

    const { jobs: routeJobs, fromTechId } = draggedRoute;

    // Update routes
    const updatedRoutes = { ...routes };

    // Remove from source tech if applicable
    if (fromTechId) {
      updatedRoutes[fromTechId] = {
        ...updatedRoutes[fromTechId],
        jobs: updatedRoutes[fromTechId].jobs.filter(
          j => !routeJobs.some(rj => rj.id === j.id)
        )
      };
    }

    // Add to target tech
    const targetTech = techs.find(t => t.id === targetTechId);
    if (!updatedRoutes[targetTechId]) {
      updatedRoutes[targetTechId] = {
        tech: targetTech,
        jobs: []
      };
    }

    updatedRoutes[targetTechId] = {
      ...updatedRoutes[targetTechId],
      jobs: [...updatedRoutes[targetTechId].jobs, ...routeJobs]
    };

    // Update jobs with new assignments
    const updatedJobs = jobs.map(job => {
      if (routeJobs.some(rj => rj.id === job.id)) {
        return { ...job, assignedTech: targetTechId, status: 'assigned' };
      }
      return job;
    });

    // Clear building route if it was dragged
    if (!fromTechId) {
      setBuildingRoute([]);
    }

    setDraggedRoute(null);

    // Callback to parent
    await onUpdateRoutes(updatedRoutes);
    await onUpdateJobs(updatedJobs);
  };

  const removeJobFromBuildingRoute = (jobId) => {
    setBuildingRoute(buildingRoute.filter(j => j.id !== jobId));
  };

  const clearBuildingRoute = () => {
    setBuildingRoute([]);
  };

  const removeJobFromTech = async (jobId, techId) => {
    const updatedRoutes = { ...routes };
    updatedRoutes[techId] = {
      ...updatedRoutes[techId],
      jobs: updatedRoutes[techId].jobs.filter(j => j.id !== jobId)
    };

    const updatedJobs = jobs.map(job => {
      if (job.id === jobId) {
        return { ...job, assignedTech: null, status: 'unassigned' };
      }
      return job;
    });

    await onUpdateRoutes(updatedRoutes);
    await onUpdateJobs(updatedJobs);
  };

  const reorderJobsInRoute = (techId, startIndex, endIndex) => {
    const updatedRoutes = { ...routes };
    const techJobs = [...updatedRoutes[techId].jobs];
    const [removed] = techJobs.splice(startIndex, 1);
    techJobs.splice(endIndex, 0, removed);

    updatedRoutes[techId] = {
      ...updatedRoutes[techId],
      jobs: techJobs
    };

    onUpdateRoutes(updatedRoutes);
  };

  const unassignedCount = jobs.filter(j => !j.assignedTech).length;
  const assignedCount = jobs.filter(j => j.assignedTech).length;

  return (
    <div>
      {/* Header with toggle */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        padding: '16px',
        backgroundColor: '#f9fafb',
        borderRadius: '8px',
        border: '1px solid #e5e7eb'
      }}>
        <div>
          <h3 style={{ margin: 0, marginBottom: '8px' }}>Manual Route Builder</h3>
          <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>
            Click jobs on the map to build routes, then drag routes to technicians
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ fontSize: '14px', color: '#6b7280' }}>
            <span style={{ fontWeight: '500', color: '#10b981' }}>{unassignedCount}</span> unassigned •
            <span style={{ fontWeight: '500', color: '#3b82f6', marginLeft: '4px' }}>{assignedCount}</span> assigned
          </div>

          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            padding: '8px 16px',
            backgroundColor: 'white',
            borderRadius: '6px',
            border: '2px solid #e5e7eb',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s'
          }}>
            <input
              type="checkbox"
              checked={showAllJobs}
              onChange={(e) => setShowAllJobs(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <span>Show All Jobs</span>
          </label>
        </div>
      </div>

      {/* Main layout: Map + Tech List */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '20px', height: 'calc(100vh - 300px)' }}>

        {/* Map Section */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', position: 'relative', height: '100%' }}>
          <div
            ref={mapContainerRef}
            style={{ width: '100%', height: '100%' }}
          />

          {/* Building Route Overlay */}
          {buildingRoute.length > 0 && (
            <div style={{
              position: 'absolute',
              bottom: '16px',
              left: '16px',
              backgroundColor: 'white',
              padding: '16px',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              minWidth: '300px',
              maxHeight: '400px',
              overflow: 'auto',
              zIndex: 1
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
                paddingBottom: '12px',
                borderBottom: '2px solid #e5e7eb'
              }}>
                <h4 style={{ margin: 0, color: '#f59e0b' }}>
                  <i className="fas fa-route"></i> Building Route ({buildingRoute.length})
                </h4>
                <button
                  onClick={clearBuildingRoute}
                  className="btn btn-secondary btn-small"
                  style={{ padding: '4px 8px', fontSize: '12px' }}
                >
                  <i className="fas fa-times"></i> Clear
                </button>
              </div>

              <div
                draggable
                onDragStart={(e) => handleDragStart(e, buildingRoute)}
                style={{
                  cursor: 'grab',
                  padding: '8px',
                  backgroundColor: '#fef3c7',
                  borderRadius: '6px',
                  marginBottom: '8px',
                  border: '2px dashed #f59e0b'
                }}
              >
                <div style={{ fontSize: '12px', color: '#92400e', marginBottom: '8px', fontWeight: '500' }}>
                  <i className="fas fa-hand-paper"></i> Drag this route to a tech
                </div>
              </div>

              {buildingRoute.map((job, idx) => (
                <div
                  key={job.id}
                  style={{
                    padding: '10px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '6px',
                    marginBottom: '6px',
                    borderLeft: '3px solid #f59e0b',
                    fontSize: '13px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div style={{ flex: 1 }}>
                      <strong>{idx + 1}. {job.customerName}</strong>
                      <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                        {job.jobType} • {job.duration}h
                        {job.requiresTwoTechs && (
                          <span style={{ color: '#f59e0b', marginLeft: '6px' }}>
                            <i className="fas fa-users"></i> 2 Techs
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => removeJobFromBuildingRoute(job.id)}
                      className="btn btn-secondary btn-small"
                      style={{ padding: '2px 6px', fontSize: '11px' }}
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  </div>
                </div>
              ))}

              <div style={{
                marginTop: '12px',
                paddingTop: '12px',
                borderTop: '1px solid #e5e7eb',
                fontSize: '12px',
                color: '#6b7280'
              }}>
                Total: {buildingRoute.reduce((sum, j) => sum + j.duration, 0).toFixed(1)}h
              </div>
            </div>
          )}

          {/* Legend */}
          <div style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            backgroundColor: 'white',
            padding: '12px',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            fontSize: '12px',
            zIndex: 1
          }}>
            <div style={{ fontWeight: '600', marginBottom: '8px' }}>Legend</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#10b981' }}></div>
              <span>Unassigned</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#f59e0b' }}></div>
              <span>In Building Route</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#6b7280' }}></div>
              <span>Assigned</span>
            </div>
          </div>
        </div>

        {/* Tech List Section */}
        <div className="card" style={{ padding: '16px', height: '100%', overflow: 'auto' }}>
          <h4 style={{ margin: 0, marginBottom: '16px' }}>
            <i className="fas fa-users"></i> Technicians ({techs.length})
          </h4>

          {techs.map(tech => {
            const techRoute = routes[tech.id];
            const jobCount = techRoute?.jobs?.length || 0;
            const totalHours = techRoute?.jobs?.reduce((sum, j) => sum + j.duration, 0) || 0;

            return (
              <div
                key={tech.id}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDropOnTech(e, tech.id)}
                style={{
                  marginBottom: '12px',
                  padding: '12px',
                  backgroundColor: jobCount > 0 ? '#eff6ff' : '#f9fafb',
                  border: '2px dashed #e5e7eb',
                  borderRadius: '8px',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '4px' }}>
                    {tech.name}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                    {tech.role} • {tech.zone} • {offices[tech.office]?.shortName}
                  </div>
                  <div style={{ fontSize: '12px', color: '#3b82f6', marginTop: '4px', fontWeight: '500' }}>
                    {jobCount} jobs • {totalHours.toFixed(1)}h
                  </div>
                </div>

                {techRoute && techRoute.jobs && techRoute.jobs.length > 0 && (
                  <div
                    draggable
                    onDragStart={(e) => handleDragStart(e, techRoute.jobs, tech.id)}
                    style={{ cursor: 'grab' }}
                  >
                    {techRoute.jobs.map((job, idx) => (
                      <div
                        key={job.id}
                        style={{
                          padding: '8px',
                          backgroundColor: 'white',
                          borderRadius: '4px',
                          marginBottom: '4px',
                          fontSize: '12px',
                          borderLeft: '3px solid #3b82f6'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                          <div style={{ flex: 1 }}>
                            <strong>{idx + 1}. {job.customerName}</strong>
                            <div style={{ color: '#6b7280', marginTop: '2px', fontSize: '11px' }}>
                              {job.jobType} • {job.duration}h
                              {job.requiresTwoTechs && (
                                <span style={{ color: '#f59e0b', marginLeft: '4px' }}>
                                  <i className="fas fa-users"></i>
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => removeJobFromTech(job.id, tech.id)}
                            className="btn btn-secondary btn-small"
                            style={{ padding: '2px 6px', fontSize: '10px' }}
                          >
                            <i className="fas fa-times"></i>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {(!techRoute || !techRoute.jobs || techRoute.jobs.length === 0) && (
                  <div style={{
                    padding: '16px',
                    textAlign: 'center',
                    color: '#9ca3af',
                    fontSize: '12px',
                    fontStyle: 'italic'
                  }}>
                    Drop route here
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ManualMode;
