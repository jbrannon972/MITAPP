import { useState, useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getMapboxService } from '../../services/mapboxService';

const KanbanCalendar = ({
  jobs: initialJobs,
  routes: initialRoutes,
  techs,
  offices,
  onUpdateRoutes,
  onUpdateJobs,
  selectedDate
}) => {
  // Local state for instant UI updates
  const [localJobs, setLocalJobs] = useState(initialJobs);
  const [localRoutes, setLocalRoutes] = useState(initialRoutes);
  const [draggedJob, setDraggedJob] = useState(null);
  const [draggedTech, setDraggedTech] = useState(null);
  const [dragOverTech, setDragOverTech] = useState(null);
  const [showMapModal, setShowMapModal] = useState(false);
  const [selectedTechForMap, setSelectedTechForMap] = useState(null);
  const [isCalculatingDrive, setIsCalculatingDrive] = useState(false);
  const columnRefs = useRef({});
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);

  // Sync with parent when props change
  useEffect(() => {
    setLocalJobs(initialJobs);
  }, [initialJobs]);

  useEffect(() => {
    setLocalRoutes(initialRoutes);
  }, [initialRoutes]);

  // Initialize map when modal opens
  useEffect(() => {
    if (!showMapModal || !mapContainerRef.current || mapInstanceRef.current) return;

    const mapboxToken = localStorage.getItem('mapboxToken') ||
                        'pk.eyJ1IjoiamJyYW5ub245NzIiLCJhIjoiY204NXN2Z2w2Mms4ODJrb2tvemV2ZnlicyJ9.84JYhRSUAF5_-vvdebw-TA';

    mapboxgl.accessToken = mapboxToken;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-95.5698, 30.1945], // Houston
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
  }, [showMapModal]);

  // Render route on map when tech is selected
  useEffect(() => {
    if (!mapInstanceRef.current || !selectedTechForMap) return;

    const map = mapInstanceRef.current;
    const techRoute = localRoutes[selectedTechForMap];
    if (!techRoute || !techRoute.jobs || techRoute.jobs.length === 0) return;

    // Clear existing layers
    if (map.getLayer('route')) map.removeLayer('route');
    if (map.getSource('route')) map.removeSource('route');

    // Get office coordinates
    const officeKey = techRoute.tech.office;
    const officeCoords = officeKey === 'office_1'
      ? { lng: -95.4559, lat: 30.3119 } // Conroe
      : { lng: -95.6508, lat: 29.7858 }; // Katy

    const coordinates = [[officeCoords.lng, officeCoords.lat]];

    // Add job markers and build route
    techRoute.jobs.forEach((job, idx) => {
      if (job.coordinates && job.coordinates.lng && job.coordinates.lat) {
        coordinates.push([job.coordinates.lng, job.coordinates.lat]);

        // Add marker
        const el = document.createElement('div');
        el.innerHTML = `<div style="background-color: #3b82f6; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); cursor: pointer;">${idx + 1}</div>`;

        new mapboxgl.Marker(el)
          .setLngLat([job.coordinates.lng, job.coordinates.lat])
          .setPopup(new mapboxgl.Popup({ offset: 25 })
            .setHTML(`<div style="padding: 8px;"><strong>${idx + 1}. ${job.customerName}</strong><br/>${job.startTime || job.timeframeStart} - ${job.endTime || job.timeframeEnd}<br/>${job.duration}h</div>`))
          .addTo(map);
      }
    });

    // Return to office
    coordinates.push([officeCoords.lng, officeCoords.lat]);

    // Draw route line
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

      // Fit map to route
      const bounds = coordinates.reduce(
        (bounds, coord) => bounds.extend(coord),
        new mapboxgl.LngLatBounds(coordinates[0], coordinates[0])
      );
      map.fitBounds(bounds, { padding: 50 });
    }
  }, [selectedTechForMap, localRoutes]);

  // Time configuration (7 AM to 8 PM, each hour = 80px)
  const startHour = 7;
  const endHour = 20;
  const pixelsPerHour = 80;
  const totalHours = endHour - startHour;

  // Generate time slots
  const timeSlots = Array.from({ length: totalHours + 1 }, (_, i) => {
    const hour = startHour + i;
    return `${String(hour).padStart(2, '0')}:00`;
  });

  // Color mapping for job types
  const getJobTypeColor = (jobType) => {
    const type = jobType.toLowerCase();
    if (type.includes('install')) return '#8b5cf6';
    if (type.includes('demo prep') || type.includes('demo-prep')) return '#f59e0b';
    if (type.includes('demo') && !type.includes('check')) return '#ec4899';
    if (type.includes('service') || type.includes('repair')) return '#3b82f6';
    if (type.includes('maintenance') || type.includes('maint')) return '#10b981';
    if (type.includes('inspection') || type.includes('check')) return '#06b6d4';
    return '#6b7280';
  };

  // Convert time string to minutes from start of day
  const timeToMinutes = (timeStr) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  };

  // Convert minutes to time string
  const minutesToTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  };

  // Calculate Y position based on time
  const getYPosition = (timeStr) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const minutesFromStart = (hours - startHour) * 60 + minutes;
    return (minutesFromStart / 60) * pixelsPerHour;
  };

  // Calculate time from Y position (for drop)
  const getTimeFromY = (yPos) => {
    const minutesFromStart = Math.round((yPos / pixelsPerHour) * 60);
    const totalMinutes = startHour * 60 + minutesFromStart;
    // Round to nearest 15 minutes
    const roundedMinutes = Math.round(totalMinutes / 15) * 15;
    return minutesToTime(roundedMinutes);
  };

  // Calculate optimal start time based on previous job + drive time
  const calculateOptimalStartTime = async (job, targetTechId, droppedYPos) => {
    const techRoute = localRoutes[targetTechId];
    const techJobs = techRoute?.jobs || [];

    if (techJobs.length === 0) {
      // First job - use office location and start at shift start or dropped time
      const officeKey = techs.find(t => t.id === targetTechId)?.office;
      const shiftStart = '08:15'; // Default shift start
      const droppedTime = getTimeFromY(droppedYPos);

      // Use whichever is later
      const shiftMinutes = timeToMinutes(shiftStart);
      const droppedMinutes = timeToMinutes(droppedTime);
      return minutesToTime(Math.max(shiftMinutes, droppedMinutes));
    }

    // Find where this job should go in the sequence
    const droppedTime = getTimeFromY(droppedYPos);
    const droppedMinutes = timeToMinutes(droppedTime);

    // Sort jobs by start time
    const sortedJobs = [...techJobs].sort((a, b) => {
      const aTime = timeToMinutes(a.startTime || a.timeframeStart);
      const bTime = timeToMinutes(b.startTime || b.timeframeStart);
      return aTime - bTime;
    });

    // Find the job that should come before this one
    let previousJob = null;
    for (let i = sortedJobs.length - 1; i >= 0; i--) {
      const jobEndMinutes = timeToMinutes(sortedJobs[i].endTime || sortedJobs[i].timeframeEnd);
      if (jobEndMinutes <= droppedMinutes) {
        previousJob = sortedJobs[i];
        break;
      }
    }

    if (!previousJob) {
      // No previous job, use shift start
      return minutesToTime(Math.max(timeToMinutes('08:15'), droppedMinutes));
    }

    // Calculate drive time from previous job
    setIsCalculatingDrive(true);
    try {
      const mapboxService = getMapboxService();
      const prevAddress = previousJob.address;
      const newAddress = job.address;

      const result = await mapboxService.getDrivingDistance(prevAddress, newAddress);
      const driveMinutes = result.durationMinutes || 20; // Default 20 min

      // Start time = previous job end + drive time
      const prevEndMinutes = timeToMinutes(previousJob.endTime);
      const calculatedStartMinutes = prevEndMinutes + driveMinutes;

      // Use the later of calculated time or dropped time
      const finalStartMinutes = Math.max(calculatedStartMinutes, droppedMinutes);

      setIsCalculatingDrive(false);
      return minutesToTime(finalStartMinutes);
    } catch (error) {
      console.error('Drive time calculation error:', error);
      setIsCalculatingDrive(false);
      // Fallback to dropped time + default buffer
      return minutesToTime(droppedMinutes);
    }
  };

  const handleJobDragStart = (e, job, sourceTechId) => {
    setDraggedJob({ job, sourceTechId });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
  };

  const handleTechDragStart = (e, techId) => {
    setDraggedTech(techId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (techId) => {
    setDragOverTech(techId);
  };

  const handleDragLeave = () => {
    setDragOverTech(null);
  };

  const handleJobDrop = async (e, targetTechId) => {
    e.preventDefault();
    setDragOverTech(null);

    if (!draggedJob) return;

    const { job, sourceTechId } = draggedJob;

    // Don't do anything if dropping on same tech without moving
    if (sourceTechId === targetTechId && !targetTechId) {
      setDraggedJob(null);
      return;
    }

    // Calculate drop position
    let yPos = 0;
    if (targetTechId && columnRefs.current[targetTechId]) {
      const column = columnRefs.current[targetTechId];
      const rect = column.getBoundingClientRect();
      yPos = e.clientY - rect.top + column.scrollTop;
    }

    // Calculate optimal start time with drive time
    const startTime = targetTechId
      ? await calculateOptimalStartTime(job, targetTechId, yPos)
      : (job.startTime || job.timeframeStart);

    // Calculate end time
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = startMinutes + (job.duration * 60);
    const endTime = minutesToTime(endMinutes);

    // Update job with new times
    const updatedJob = {
      ...job,
      startTime,
      endTime,
      assignedTech: targetTechId,
      status: targetTechId ? 'assigned' : 'unassigned'
    };

    // Update local state IMMEDIATELY for instant UI feedback
    const updatedRoutes = { ...localRoutes };

    // Remove from source tech
    if (sourceTechId) {
      updatedRoutes[sourceTechId] = {
        ...updatedRoutes[sourceTechId],
        jobs: updatedRoutes[sourceTechId].jobs.filter(j => j.id !== job.id)
      };
    }

    // Add to target tech
    if (targetTechId) {
      const targetTech = techs.find(t => t.id === targetTechId);
      if (!updatedRoutes[targetTechId]) {
        updatedRoutes[targetTechId] = {
          tech: targetTech,
          jobs: []
        };
      }
      updatedRoutes[targetTechId].jobs.push(updatedJob);
    }

    // Update jobs assignment
    const updatedJobs = localJobs.map(j => {
      if (j.id === job.id) {
        return updatedJob;
      }
      return j;
    });

    // Update local state FIRST for instant UI
    setLocalRoutes(updatedRoutes);
    setLocalJobs(updatedJobs);
    setDraggedJob(null);

    // Then persist to parent/Firebase
    await onUpdateRoutes(updatedRoutes);
    await onUpdateJobs(updatedJobs);
  };

  const handleRouteSwap = async (e, targetTechId) => {
    e.preventDefault();
    setDragOverTech(null);

    if (!draggedTech || draggedTech === targetTechId) {
      setDraggedTech(null);
      return;
    }

    const updatedRoutes = { ...localRoutes };

    // Get jobs before swap
    const draggedJobs = updatedRoutes[draggedTech]?.jobs || [];
    const targetJobs = updatedRoutes[targetTechId]?.jobs || [];

    // Swap the entire routes
    const temp = { ...updatedRoutes[draggedTech] };
    updatedRoutes[draggedTech] = {
      ...(updatedRoutes[targetTechId] || { jobs: [] }),
      tech: temp.tech
    };
    updatedRoutes[targetTechId] = {
      ...temp,
      tech: updatedRoutes[targetTechId]?.tech || techs.find(t => t.id === targetTechId)
    };

    // Update all jobs with new tech assignments
    const updatedJobs = localJobs.map(job => {
      if (draggedJobs.some(j => j.id === job.id)) {
        return { ...job, assignedTech: draggedTech };
      }
      if (targetJobs.some(j => j.id === job.id)) {
        return { ...job, assignedTech: targetTechId };
      }
      return job;
    });

    // Update local state FIRST for instant UI
    setLocalRoutes(updatedRoutes);
    setLocalJobs(updatedJobs);
    setDraggedTech(null);

    // Then persist to parent/Firebase
    await onUpdateRoutes(updatedRoutes);
    await onUpdateJobs(updatedJobs);
  };

  const handleTechClick = (techId) => {
    setSelectedTechForMap(techId);
    setShowMapModal(true);
  };

  const unassignedJobs = localJobs.filter(j => !j.assignedTech);

  return (
    <div style={{ height: 'calc(100vh - 140px)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        marginBottom: '8px',
        padding: '8px 12px',
        backgroundColor: '#f9fafb',
        borderRadius: '6px',
        border: '1px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0
      }}>
        <div>
          <h3 style={{ margin: 0, marginBottom: '2px', fontSize: '14px', fontWeight: '600' }}>
            <i className="fas fa-calendar-day"></i> Timeline - {selectedDate}
          </h3>
          <p style={{ margin: 0, fontSize: '11px', color: '#6b7280' }}>
            Drop jobs to auto-schedule • Click tech name for route map
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isCalculatingDrive && (
            <span style={{ fontSize: '11px', color: '#f59e0b' }}>
              <i className="fas fa-spinner fa-spin"></i> Calculating drive time...
            </span>
          )}
          <div style={{ fontSize: '12px', fontWeight: '500', color: '#3b82f6' }}>
            {localJobs.filter(j => j.assignedTech).length} / {localJobs.length} assigned
          </div>
        </div>
      </div>

      {/* Calendar Grid - Single Scroll Container */}
      <div style={{
        display: 'flex',
        gap: '6px',
        flex: 1,
        minHeight: 0,
        overflow: 'auto', // Single scroll for entire container
        position: 'relative'
      }}>
        {/* Time Column - Sticky */}
        <div style={{
          width: '50px',
          flexShrink: 0,
          position: 'sticky',
          left: 0,
          zIndex: 10,
          backgroundColor: '#ffffff',
          borderRadius: '6px',
          border: '1px solid #e5e7eb',
          display: 'flex',
          flexDirection: 'column',
          height: 'fit-content'
        }}>
          <div style={{
            height: '60px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: '2px solid #e5e7eb',
            fontSize: '10px',
            fontWeight: '600',
            color: '#6b7280',
            position: 'sticky',
            top: 0,
            backgroundColor: '#ffffff',
            zIndex: 1
          }}>
            TIME
          </div>
          <div>
            {timeSlots.map((time, idx) => (
              <div key={time} style={{
                height: `${pixelsPerHour}px`,
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                paddingTop: '2px',
                borderTop: idx === 0 ? 'none' : '1px solid #f3f4f6',
                fontSize: '10px',
                color: '#6b7280',
                fontWeight: '500'
              }}>
                {time}
              </div>
            ))}
          </div>
        </div>

        {/* Unassigned Jobs Column - Sticky */}
        <div
          style={{
            width: '140px',
            flexShrink: 0,
            position: 'sticky',
            left: '56px',
            zIndex: 9,
            backgroundColor: dragOverTech === 'unassigned' ? '#fef3c7' : '#ffffff',
            border: dragOverTech === 'unassigned' ? '2px solid #f59e0b' : '1px solid #e5e7eb',
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            transition: 'all 0.15s ease',
            boxShadow: dragOverTech === 'unassigned' ? '0 4px 12px rgba(245, 158, 11, 0.2)' : 'none',
            height: 'fit-content',
            maxHeight: '100%'
          }}
          onDragOver={handleDragOver}
          onDragEnter={() => handleDragEnter('unassigned')}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleJobDrop(e, null)}
        >
          <div style={{
            padding: '8px',
            borderBottom: '2px solid #e5e7eb',
            backgroundColor: '#f9fafb',
            position: 'sticky',
            top: 0,
            zIndex: 1
          }}>
            <h4 style={{ margin: 0, fontSize: '12px', fontWeight: '600', marginBottom: '2px' }}>
              <i className="fas fa-inbox"></i> Unassigned
            </h4>
            <p style={{ margin: 0, fontSize: '10px', color: '#6b7280' }}>
              {unassignedJobs.length} jobs
            </p>
          </div>

          <div style={{ padding: '6px' }}>
            {unassignedJobs.map(job => (
              <div
                key={job.id}
                draggable
                onDragStart={(e) => handleJobDragStart(e, job, null)}
                style={{
                  marginBottom: '4px',
                  padding: '6px',
                  backgroundColor: '#ffffff',
                  border: `2px solid ${getJobTypeColor(job.jobType)}`,
                  borderRadius: '6px',
                  cursor: 'grab',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 3px 6px rgba(0,0,0,0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
                }}
              >
                <div style={{ fontWeight: '600', fontSize: '11px', marginBottom: '2px' }}>
                  {job.customerName}
                </div>
                <div style={{ fontSize: '9px', color: '#6b7280' }}>
                  <div>{job.jobType}</div>
                  <div style={{ marginTop: '2px' }}>{job.duration}h</div>
                  {job.requiresTwoTechs && (
                    <div style={{ color: '#f59e0b', marginTop: '2px', fontWeight: '500' }}>
                      <i className="fas fa-users"></i> 2 Techs
                    </div>
                  )}
                </div>
              </div>
            ))}
            {unassignedJobs.length === 0 && (
              <div style={{
                padding: '20px 10px',
                textAlign: 'center',
                color: '#9ca3af',
                fontSize: '10px',
                fontStyle: 'italic'
              }}>
                All assigned!
              </div>
            )}
          </div>
        </div>

        {/* Tech Columns */}
        <div style={{ display: 'flex', gap: '6px', height: 'fit-content' }}>
          {techs.map(tech => {
            const techRoute = localRoutes[tech.id];
            const techJobs = techRoute?.jobs || [];
            const totalHours = techJobs.reduce((sum, j) => sum + j.duration, 0);
            const isDragOver = dragOverTech === tech.id;
            const isDragging = draggedTech === tech.id;

            return (
              <div
                key={tech.id}
                style={{
                  width: '150px',
                  flexShrink: 0,
                  backgroundColor: isDragOver ? '#dbeafe' : '#ffffff',
                  border: isDragging ? '2px solid #f59e0b' : (isDragOver ? '2px solid #3b82f6' : '1px solid #e5e7eb'),
                  borderRadius: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  opacity: isDragging ? 0.5 : 1,
                  transition: 'all 0.15s ease',
                  boxShadow: isDragOver ? '0 4px 12px rgba(59, 130, 246, 0.2)' : 'none',
                  height: 'fit-content'
                }}
                onDragOver={handleDragOver}
                onDragEnter={() => handleDragEnter(tech.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => {
                  if (draggedJob) {
                    handleJobDrop(e, tech.id);
                  } else if (draggedTech) {
                    handleRouteSwap(e, tech.id);
                  }
                }}
              >
                {/* Tech Header - Draggable & Clickable */}
                <div
                  draggable
                  onDragStart={(e) => handleTechDragStart(e, tech.id)}
                  onClick={() => handleTechClick(tech.id)}
                  style={{
                    padding: '8px',
                    borderBottom: '2px solid #e5e7eb',
                    cursor: 'pointer',
                    backgroundColor: '#f9fafb',
                    position: 'sticky',
                    top: 0,
                    zIndex: 1
                  }}
                  title="Click to view route map"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                    <i className="fas fa-grip-vertical" style={{ color: '#9ca3af', fontSize: '9px' }}></i>
                    <h4 style={{ margin: 0, fontSize: '11px', fontWeight: '600', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tech.name}
                    </h4>
                    <i className="fas fa-map-marked-alt" style={{ color: '#3b82f6', fontSize: '10px' }}></i>
                  </div>
                  <p style={{ margin: '2px 0 0 0', fontSize: '9px', color: '#6b7280' }}>
                    {offices[tech.office]?.shortName}
                  </p>
                  <div style={{ marginTop: '4px', display: 'flex', gap: '6px', fontSize: '9px', fontWeight: '500' }}>
                    <span style={{ color: '#3b82f6' }}>
                      {techJobs.length}j
                    </span>
                    <span style={{ color: '#10b981' }}>
                      {totalHours.toFixed(1)}h
                    </span>
                  </div>
                </div>

                {/* Timeline Jobs */}
                <div
                  ref={el => columnRefs.current[tech.id] = el}
                  style={{
                    position: 'relative',
                    minHeight: `${(totalHours + 1) * pixelsPerHour}px`
                  }}
                >
                  {/* Time grid lines */}
                  {timeSlots.map((time, idx) => (
                    <div
                      key={time}
                      style={{
                        position: 'absolute',
                        top: `${idx * pixelsPerHour}px`,
                        left: 0,
                        right: 0,
                        height: `${pixelsPerHour}px`,
                        borderTop: idx === 0 ? 'none' : '1px solid #f3f4f6',
                        pointerEvents: 'none'
                      }}
                    />
                  ))}

                  {techJobs.length === 0 && (
                    <div style={{
                      padding: '40px 10px',
                      textAlign: 'center',
                      color: '#9ca3af',
                      fontSize: '10px',
                      fontStyle: 'italic',
                      position: 'relative'
                    }}>
                      Drop here
                    </div>
                  )}

                  {techJobs.map((job) => {
                    const yPos = job.startTime ? getYPosition(job.startTime) : 0;
                    const height = job.duration * pixelsPerHour;

                    return (
                      <div
                        key={job.id}
                        draggable
                        onDragStart={(e) => handleJobDragStart(e, job, tech.id)}
                        style={{
                          position: 'absolute',
                          top: `${yPos}px`,
                          left: '4px',
                          right: '4px',
                          minHeight: `${Math.max(height, 40)}px`,
                          padding: '6px',
                          backgroundColor: '#ffffff',
                          border: `2px solid ${getJobTypeColor(job.jobType)}`,
                          borderLeft: `4px solid ${getJobTypeColor(job.jobType)}`,
                          borderRadius: '4px',
                          cursor: 'grab',
                          transition: 'all 0.15s ease',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                          overflow: 'hidden'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateX(2px)';
                          e.currentTarget.style.boxShadow = '0 3px 6px rgba(0,0,0,0.15)';
                          e.currentTarget.style.zIndex = '10';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateX(0)';
                          e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
                          e.currentTarget.style.zIndex = '1';
                        }}
                      >
                        <div style={{ fontWeight: '600', fontSize: '10px', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {job.customerName}
                        </div>
                        <div style={{ fontSize: '9px', color: '#6b7280' }}>
                          {job.startTime && job.endTime && (
                            <div style={{ color: '#059669', fontWeight: '600', marginBottom: '2px' }}>
                              <i className="fas fa-clock"></i> {job.startTime} - {job.endTime}
                            </div>
                          )}
                          <div>{job.duration}h{job.travelTime > 0 && ` • ${job.travelTime}m drive`}</div>
                          {job.requiresTwoTechs && (
                            <div style={{ color: '#f59e0b', marginTop: '2px', fontWeight: '500' }}>
                              <i className="fas fa-users"></i> 2
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Route Map Modal */}
      {showMapModal && (
        <div
          className="modal-overlay active"
          onClick={() => setShowMapModal(false)}
          style={{ zIndex: 1000 }}
        >
          <div
            className="modal modal-lg"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '900px', height: '80vh' }}
          >
            <div className="modal-header">
              <h3>
                <i className="fas fa-map-marked-alt"></i> {selectedTechForMap && localRoutes[selectedTechForMap]?.tech?.name}'s Route
              </h3>
              <button className="modal-close" onClick={() => setShowMapModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body" style={{ padding: 0, height: 'calc(100% - 60px)' }}>
              <div
                ref={mapContainerRef}
                style={{ width: '100%', height: '100%', borderRadius: '0 0 8px 8px' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KanbanCalendar;
