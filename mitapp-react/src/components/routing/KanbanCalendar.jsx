import { useState, useEffect, useRef } from 'react';

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
  const columnRefs = useRef({});

  // Sync with parent when props change
  useEffect(() => {
    setLocalJobs(initialJobs);
  }, [initialJobs]);

  useEffect(() => {
    setLocalRoutes(initialRoutes);
  }, [initialRoutes]);

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

    // Calculate drop time based on Y position
    let startTime = job.startTime || job.timeframeStart;

    if (targetTechId && columnRefs.current[targetTechId]) {
      const column = columnRefs.current[targetTechId];
      const rect = column.getBoundingClientRect();
      const yPos = e.clientY - rect.top + column.scrollTop;
      startTime = getTimeFromY(yPos);
    }

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
        alignItems: 'center'
      }}>
        <div>
          <h3 style={{ margin: 0, marginBottom: '2px', fontSize: '14px', fontWeight: '600' }}>
            <i className="fas fa-calendar-day"></i> Timeline - {selectedDate}
          </h3>
          <p style={{ margin: 0, fontSize: '11px', color: '#6b7280' }}>
            Drop jobs on timeline to schedule • Drag tech name to swap routes
          </p>
        </div>
        <div style={{ fontSize: '12px', fontWeight: '500', color: '#3b82f6' }}>
          {localJobs.filter(j => j.assignedTech).length} / {localJobs.length} assigned
        </div>
      </div>

      {/* Calendar Grid */}
      <div style={{
        display: 'flex',
        gap: '6px',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden'
      }}>
        {/* Time Column */}
        <div style={{
          width: '50px',
          flexShrink: 0,
          backgroundColor: '#ffffff',
          borderRadius: '6px',
          border: '1px solid #e5e7eb',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            height: '60px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: '2px solid #e5e7eb',
            fontSize: '10px',
            fontWeight: '600',
            color: '#6b7280'
          }}>
            TIME
          </div>
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
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

        {/* Unassigned Jobs Column */}
        <div
          style={{
            width: '140px',
            flexShrink: 0,
            backgroundColor: dragOverTech === 'unassigned' ? '#fef3c7' : '#ffffff',
            border: dragOverTech === 'unassigned' ? '2px solid #f59e0b' : '1px solid #e5e7eb',
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            transition: 'all 0.15s ease',
            boxShadow: dragOverTech === 'unassigned' ? '0 4px 12px rgba(245, 158, 11, 0.2)' : 'none',
            overflow: 'hidden'
          }}
          onDragOver={handleDragOver}
          onDragEnter={() => handleDragEnter('unassigned')}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleJobDrop(e, null)}
        >
          <div style={{
            padding: '8px',
            borderBottom: '2px solid #e5e7eb',
            backgroundColor: '#f9fafb'
          }}>
            <h4 style={{ margin: 0, fontSize: '12px', fontWeight: '600', marginBottom: '2px' }}>
              <i className="fas fa-inbox"></i> Unassigned
            </h4>
            <p style={{ margin: 0, fontSize: '10px', color: '#6b7280' }}>
              {unassignedJobs.length} jobs
            </p>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
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

        {/* Tech Columns Container - Scrollable */}
        <div style={{
          flex: 1,
          overflowX: 'auto',
          overflowY: 'hidden',
          display: 'flex',
          gap: '6px'
        }}>
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
                  overflow: 'hidden'
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
                {/* Tech Header - Draggable */}
                <div
                  draggable
                  onDragStart={(e) => handleTechDragStart(e, tech.id)}
                  style={{
                    padding: '8px',
                    borderBottom: '2px solid #e5e7eb',
                    cursor: 'grab',
                    backgroundColor: '#f9fafb'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                    <i className="fas fa-grip-vertical" style={{ color: '#9ca3af', fontSize: '9px' }}></i>
                    <h4 style={{ margin: 0, fontSize: '11px', fontWeight: '600', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tech.name}
                    </h4>
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
                    flex: 1,
                    overflowY: 'auto',
                    position: 'relative',
                    minHeight: `${totalHours * pixelsPerHour}px`
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
                      fontStyle: 'italic'
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
                          <div>{job.duration}h{job.travelTime > 0 && ` • ${job.travelTime}m`}</div>
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
    </div>
  );
};

export default KanbanCalendar;
