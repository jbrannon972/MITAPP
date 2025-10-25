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
  const [selectedTech, setSelectedTech] = useState(null);

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  // Color mapping for different job types
  const getJobTypeColor = (jobType) => {
    const type = jobType.toLowerCase();
    if (type.includes('install')) return '#8b5cf6'; // Purple
    if (type.includes('demo prep') || type.includes('demo-prep')) return '#f59e0b'; // Orange
    if (type.includes('demo') && !type.includes('check')) return '#ec4899'; // Pink
    if (type.includes('service') || type.includes('repair')) return '#3b82f6'; // Blue
    if (type.includes('maintenance') || type.includes('maint')) return '#10b981'; // Green
    if (type.includes('inspection') || type.includes('check')) return '#06b6d4'; // Cyan
    return '#6b7280'; // Gray for other/unknown
  };

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

  // Update markers and routes when jobs, filter, or selected tech changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const renderJobMarkers = async () => {
      // Clear existing markers
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];

      const map = mapInstanceRef.current;

      // Remove existing route layers
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

        // Determine marker color based on job type and status
        let markerColor = getJobTypeColor(job.jobType);

        // Override with status colors
        if (buildingRoute.some(j => j.id === job.id)) {
          markerColor = '#fbbf24'; // Bright yellow for in building route
        } else if (job.assignedTech && !showAllJobs) {
          continue; // Skip assigned jobs if not showing all
        } else if (job.assignedTech) {
          // Dim the color for assigned jobs
          markerColor = markerColor + '80'; // Add transparency
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

      // Draw selected tech's route on the map
      if (selectedTech && routes[selectedTech]) {
        const techRoute = routes[selectedTech];
        const officeLocations = {
          office_1: { lng: -95.4559, lat: 30.3119 },
          office_2: { lng: -95.6508, lat: 29.7858 }
        };

        const officeCoords = officeLocations[techRoute.tech.office];
        const coordinates = [[officeCoords.lng, officeCoords.lat]];

        // Add route job markers
        for (let idx = 0; idx < (techRoute.jobs?.length || 0); idx++) {
          const job = techRoute.jobs[idx];

          if (job.coordinates && job.coordinates.lng && job.coordinates.lat) {
            coordinates.push([job.coordinates.lng, job.coordinates.lat]);

            // Add numbered markers for route jobs
            const el = document.createElement('div');
            el.innerHTML = `
              <div style="
                background-color: ${getJobTypeColor(job.jobType)};
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
                box-shadow: 0 2px 8px rgba(0,0,0,0.4);
              ">${idx + 1}</div>
            `;

            const marker = new mapboxgl.Marker(el)
              .setLngLat([job.coordinates.lng, job.coordinates.lat])
              .setPopup(new mapboxgl.Popup({ offset: 25 })
                .setHTML(`
                  <div style="padding: 8px;">
                    <strong>${idx + 1}. ${job.customerName}</strong><br/>
                    ${job.address}<br/>
                    ${job.jobType} • ${job.duration}h
                    ${job.travelTime ? `<br/>${job.travelTime}min drive` : ''}
                  </div>
                `))
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

    renderJobMarkers();
  }, [jobs, showAllJobs, buildingRoute, selectedTech, routes]);

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

  const handleTechClick = (techId) => {
    setSelectedTech(selectedTech === techId ? null : techId);
  };

  return (
    <div style={{ height: 'calc(100vh - 200px)', display: 'flex', flexDirection: 'column' }}>
      {/* Compact Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
        padding: '12px 16px',
        backgroundColor: '#f9fafb',
        borderRadius: '6px',
        border: '1px solid #e5e7eb'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '16px' }}>Manual Route Builder</h3>
          <div style={{ fontSize: '13px', color: '#6b7280' }}>
            <span style={{ fontWeight: '600', color: '#10b981' }}>{unassignedCount}</span> unassigned •
            <span style={{ fontWeight: '600', color: '#3b82f6', marginLeft: '4px' }}>{assignedCount}</span> assigned
          </div>
        </div>

        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          padding: '6px 12px',
          backgroundColor: 'white',
          borderRadius: '4px',
          border: '2px solid #e5e7eb',
          fontSize: '13px',
          fontWeight: '500'
        }}>
          <input
            type="checkbox"
            checked={showAllJobs}
            onChange={(e) => setShowAllJobs(e.target.checked)}
            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
          />
          <span>Show All Jobs</span>
        </label>
      </div>

      {/* Main layout: Map + Compact Tech List */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '12px', flex: 1, minHeight: 0 }}>

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
            top: '12px',
            left: '12px',
            backgroundColor: 'white',
            padding: '10px',
            borderRadius: '6px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            fontSize: '11px',
            zIndex: 1,
            maxWidth: '200px'
          }}>
            <div style={{ fontWeight: '600', marginBottom: '6px' }}>Job Types</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#8b5cf6' }}></div>
                <span>Install</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#ec4899' }}></div>
                <span>Demo</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#3b82f6' }}></div>
                <span>Service</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#10b981' }}></div>
                <span>Maint</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#06b6d4' }}></div>
                <span>Inspect</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#fbbf24' }}></div>
                <span>Building</span>
              </div>
            </div>
          </div>

          {/* Selected Tech Route on Map */}
          {selectedTech && routes[selectedTech] && routes[selectedTech].jobs?.length > 0 && (
            <div style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              backgroundColor: 'white',
              padding: '12px',
              borderRadius: '6px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              maxWidth: '250px',
              maxHeight: '400px',
              overflow: 'auto',
              zIndex: 1
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px',
                paddingBottom: '8px',
                borderBottom: '2px solid #e5e7eb'
              }}>
                <h4 style={{ margin: 0, fontSize: '13px' }}>
                  {routes[selectedTech].tech.name}
                </h4>
                <button
                  onClick={() => setSelectedTech(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px',
                    color: '#6b7280'
                  }}
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>
              {routes[selectedTech].jobs.map((job, idx) => (
                <div
                  key={job.id}
                  style={{
                    padding: '6px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '4px',
                    marginBottom: '4px',
                    borderLeft: `3px solid ${getJobTypeColor(job.jobType)}`,
                    fontSize: '11px'
                  }}
                >
                  <div style={{ fontWeight: '600', marginBottom: '2px' }}>
                    {idx + 1}. {job.customerName}
                  </div>
                  <div style={{ color: '#6b7280', fontSize: '10px' }}>
                    {job.jobType} • {job.duration}h
                    {job.requiresTwoTechs && (
                      <span style={{ color: '#f59e0b', marginLeft: '4px' }}>
                        <i className="fas fa-users"></i>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Compact Tech List Section */}
        <div className="card" style={{ padding: '12px', height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          <h4 style={{ margin: 0, marginBottom: '12px', fontSize: '14px' }}>
            <i className="fas fa-users"></i> Techs ({techs.length})
          </h4>

          <div style={{ flex: 1, overflow: 'auto' }}>
            {techs.map(tech => {
              const techRoute = routes[tech.id];
              const jobCount = techRoute?.jobs?.length || 0;
              const totalHours = techRoute?.jobs?.reduce((sum, j) => sum + j.duration, 0) || 0;
              const isSelected = selectedTech === tech.id;

              return (
                <div
                  key={tech.id}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDropOnTech(e, tech.id)}
                  onClick={() => handleTechClick(tech.id)}
                  style={{
                    marginBottom: '6px',
                    padding: '8px',
                    backgroundColor: isSelected ? '#dbeafe' : (jobCount > 0 ? '#eff6ff' : '#f9fafb'),
                    border: isSelected ? '2px solid #3b82f6' : '2px dashed #e5e7eb',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: jobCount > 0 ? '6px' : '0'
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontWeight: '600',
                        fontSize: '12px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {tech.name}
                      </div>
                      <div style={{ fontSize: '10px', color: '#6b7280' }}>
                        {offices[tech.office]?.shortName}
                      </div>
                    </div>
                    {jobCount > 0 && (
                      <div style={{
                        fontSize: '11px',
                        fontWeight: '600',
                        color: '#3b82f6',
                        textAlign: 'right',
                        marginLeft: '8px'
                      }}>
                        <div>{jobCount} job{jobCount !== 1 ? 's' : ''}</div>
                        <div style={{ fontSize: '10px' }}>{totalHours.toFixed(1)}h</div>
                      </div>
                    )}
                  </div>

                  {/* Job type indicators */}
                  {techRoute && techRoute.jobs && techRoute.jobs.length > 0 && (
                    <div
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        handleDragStart(e, techRoute.jobs, tech.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: 'flex',
                        gap: '3px',
                        flexWrap: 'wrap',
                        cursor: 'grab'
                      }}
                    >
                      {techRoute.jobs.map((job) => (
                        <div
                          key={job.id}
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: getJobTypeColor(job.jobType),
                            border: job.requiresTwoTechs ? '1px solid #f59e0b' : 'none'
                          }}
                          title={`${job.jobType} - ${job.duration}h`}
                        />
                      ))}
                    </div>
                  )}

                  {(!techRoute || !techRoute.jobs || techRoute.jobs.length === 0) && (
                    <div style={{
                      fontSize: '10px',
                      color: '#9ca3af',
                      fontStyle: 'italic',
                      textAlign: 'center',
                      marginTop: '4px'
                    }}>
                      Drop here
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManualMode;
