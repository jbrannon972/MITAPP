import { useState, useEffect } from 'react';

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

  // Sync with parent when props change
  useEffect(() => {
    setLocalJobs(initialJobs);
  }, [initialJobs]);

  useEffect(() => {
    setLocalRoutes(initialRoutes);
  }, [initialRoutes]);

  // Time slots for calendar view (8 AM to 8 PM)
  const timeSlots = [
    '08:00', '09:00', '10:00', '11:00', '12:00',
    '13:00', '14:00', '15:00', '16:00', '17:00',
    '18:00', '19:00', '20:00'
  ];

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

  const handleJobDragStart = (e, job, sourceTechId) => {
    setDraggedJob({ job, sourceTechId });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ''); // For Firefox
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

    // Don't do anything if dropping on same tech
    if (sourceTechId === targetTechId) {
      setDraggedJob(null);
      return;
    }

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
    const targetTech = techs.find(t => t.id === targetTechId);
    if (!updatedRoutes[targetTechId]) {
      updatedRoutes[targetTechId] = {
        tech: targetTech,
        jobs: []
      };
    }
    updatedRoutes[targetTechId].jobs.push(job);

    // Update jobs assignment
    const updatedJobs = localJobs.map(j => {
      if (j.id === job.id) {
        return { ...j, assignedTech: targetTechId, status: 'assigned' };
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
      tech: temp.tech // Keep original tech info
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

  const getJobPosition = (job) => {
    if (!job.startTime) return null;

    const [hours, minutes] = job.startTime.split(':').map(Number);
    const startHour = 8; // 8 AM
    const position = (hours - startHour) * 60 + minutes;
    const duration = job.duration * 60; // Convert to minutes

    return { top: position, height: duration };
  };

  const unassignedJobs = localJobs.filter(j => !j.assignedTech);

  return (
    <div style={{ height: 'calc(100vh - 140px)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        marginBottom: '12px',
        padding: '10px 16px',
        backgroundColor: '#f9fafb',
        borderRadius: '6px',
        border: '1px solid #e5e7eb'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, marginBottom: '4px', fontSize: '15px', fontWeight: '600' }}>
              <i className="fas fa-calendar-day"></i> Kanban Calendar - {selectedDate}
            </h3>
            <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>
              Drag jobs between techs • Drag tech name to swap entire routes
            </p>
          </div>
          <div style={{ fontSize: '13px', fontWeight: '500', color: '#3b82f6' }}>
            {localJobs.filter(j => j.assignedTech).length} / {localJobs.length} jobs assigned
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `60px 180px repeat(${techs.length}, 200px)`,
        gap: '8px',
        flex: 1,
        minHeight: 0,
        overflowX: 'auto',
        overflowY: 'hidden',
        paddingBottom: '8px'
      }}>
        {/* Time Column */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '6px',
          padding: '8px 4px',
          display: 'flex',
          flexDirection: 'column',
          fontSize: '11px',
          color: '#6b7280',
          fontWeight: '500'
        }}>
          <div style={{ height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            TIME
          </div>
          {timeSlots.map(time => (
            <div key={time} style={{
              height: '60px',
              display: 'flex',
              alignItems: 'flex-start',
              paddingTop: '2px',
              borderTop: time === '08:00' ? 'none' : '1px solid #f3f4f6'
            }}>
              {time}
            </div>
          ))}
        </div>

        {/* Unassigned Jobs Column */}
        <div
          style={{
            backgroundColor: dragOverTech === 'unassigned' ? '#fef3c7' : '#ffffff',
            border: dragOverTech === 'unassigned' ? '2px solid #f59e0b' : '2px dashed #e5e7eb',
            borderRadius: '8px',
            padding: '10px',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            transition: 'all 0.15s ease',
            boxShadow: dragOverTech === 'unassigned' ? '0 4px 12px rgba(245, 158, 11, 0.2)' : 'none'
          }}
          onDragOver={handleDragOver}
          onDragEnter={() => handleDragEnter('unassigned')}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleJobDrop(e, null)}
        >
          <div style={{
            marginBottom: '10px',
            paddingBottom: '8px',
            borderBottom: '2px solid #e5e7eb'
          }}>
            <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>
              <i className="fas fa-inbox"></i> Unassigned
            </h4>
            <p style={{ margin: 0, fontSize: '11px', color: '#6b7280' }}>
              {unassignedJobs.length} jobs
            </p>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {unassignedJobs.map(job => (
              <div
                key={job.id}
                draggable
                onDragStart={(e) => handleJobDragStart(e, job, null)}
                style={{
                  marginBottom: '6px',
                  padding: '8px',
                  backgroundColor: '#ffffff',
                  border: `2px solid ${getJobTypeColor(job.jobType)}`,
                  borderRadius: '6px',
                  cursor: 'grab',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                }}
                onMouseDown={(e) => e.currentTarget.style.cursor = 'grabbing'}
                onMouseUp={(e) => e.currentTarget.style.cursor = 'grab'}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                }}
              >
                <div style={{ fontWeight: '600', fontSize: '12px', marginBottom: '3px' }}>
                  {job.customerName}
                </div>
                <div style={{ fontSize: '10px', color: '#6b7280' }}>
                  <div style={{ marginBottom: '2px' }}>{job.jobType}</div>
                  <div>{job.duration}h • {job.timeframeStart}-{job.timeframeEnd}</div>
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
                padding: '20px',
                textAlign: 'center',
                color: '#9ca3af',
                fontSize: '11px',
                fontStyle: 'italic'
              }}>
                All jobs assigned!
              </div>
            )}
          </div>
        </div>

        {/* Tech Columns */}
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
                backgroundColor: isDragOver ? '#dbeafe' : '#ffffff',
                border: isDragging ? '2px solid #f59e0b' : (isDragOver ? '2px solid #3b82f6' : '2px solid #e5e7eb'),
                borderRadius: '8px',
                padding: '10px',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                opacity: isDragging ? 0.6 : 1,
                transition: 'all 0.15s ease',
                boxShadow: isDragOver ? '0 4px 12px rgba(59, 130, 246, 0.2)' : 'none'
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
                  marginBottom: '10px',
                  paddingBottom: '8px',
                  borderBottom: '2px solid #e5e7eb',
                  cursor: 'grab'
                }}
                onMouseDown={(e) => e.currentTarget.style.cursor = 'grabbing'}
                onMouseUp={(e) => e.currentTarget.style.cursor = 'grab'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                  <i className="fas fa-grip-vertical" style={{ color: '#9ca3af', fontSize: '10px' }}></i>
                  <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '600', flex: 1 }}>
                    {tech.name}
                  </h4>
                </div>
                <p style={{ margin: '2px 0', fontSize: '10px', color: '#6b7280' }}>
                  {offices[tech.office]?.shortName}
                </p>
                <div style={{ marginTop: '6px', display: 'flex', gap: '8px', fontSize: '11px', fontWeight: '500' }}>
                  <span style={{ color: '#3b82f6' }}>
                    {techJobs.length} jobs
                  </span>
                  <span style={{ color: '#10b981' }}>
                    {totalHours.toFixed(1)}h
                  </span>
                </div>
              </div>

              {/* Timeline Jobs */}
              <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
                {techJobs.length === 0 && (
                  <div style={{
                    padding: '40px 10px',
                    textAlign: 'center',
                    color: '#9ca3af',
                    fontSize: '11px',
                    fontStyle: 'italic'
                  }}>
                    Drop jobs here
                  </div>
                )}

                {techJobs.map((job, idx) => {
                  const position = getJobPosition(job);
                  const isTimelineBased = position !== null;

                  return (
                    <div
                      key={job.id}
                      draggable
                      onDragStart={(e) => handleJobDragStart(e, job, tech.id)}
                      style={{
                        marginBottom: isTimelineBased ? '0' : '6px',
                        padding: '8px',
                        backgroundColor: '#ffffff',
                        border: `2px solid ${getJobTypeColor(job.jobType)}`,
                        borderLeft: `4px solid ${getJobTypeColor(job.jobType)}`,
                        borderRadius: '6px',
                        cursor: 'grab',
                        transition: 'all 0.15s ease',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        ...(isTimelineBased && {
                          position: 'absolute',
                          top: `${position.top}px`,
                          minHeight: `${Math.max(position.height, 40)}px`,
                          left: 0,
                          right: 0,
                          marginRight: '8px'
                        })
                      }}
                      onMouseDown={(e) => e.currentTarget.style.cursor = 'grabbing'}
                      onMouseUp={(e) => e.currentTarget.style.cursor = 'grab'}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateX(2px)';
                        e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateX(0)';
                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                      }}
                    >
                      <div style={{ fontWeight: '600', fontSize: '12px', marginBottom: '3px' }}>
                        {!isTimelineBased && `${idx + 1}. `}{job.customerName}
                      </div>
                      <div style={{ fontSize: '10px', color: '#6b7280' }}>
                        {job.startTime && (
                          <div style={{ color: '#059669', fontWeight: '600', marginBottom: '2px' }}>
                            <i className="fas fa-clock"></i> {job.startTime} - {job.endTime}
                          </div>
                        )}
                        <div>{job.duration}h{job.travelTime > 0 && ` • ${job.travelTime}min drive`}</div>
                        {job.requiresTwoTechs && (
                          <div style={{ color: '#f59e0b', marginTop: '2px', fontWeight: '500' }}>
                            <i className="fas fa-users"></i> 2 Techs
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
  );
};

export default KanbanCalendar;
