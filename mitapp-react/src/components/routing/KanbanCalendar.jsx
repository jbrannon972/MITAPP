import { useState } from 'react';

const KanbanCalendar = ({
  jobs,
  routes,
  techs,
  offices,
  onUpdateRoutes,
  onUpdateJobs,
  selectedDate
}) => {
  const [draggedJob, setDraggedJob] = useState(null);
  const [draggedTech, setDraggedTech] = useState(null);
  const [dragOverTech, setDragOverTech] = useState(null);

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
  };

  const handleTechDragStart = (e, techId) => {
    setDraggedTech(techId);
    e.dataTransfer.effectAllowed = 'move';
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

    const updatedRoutes = { ...routes };

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

    // Update jobs
    const updatedJobs = jobs.map(j => {
      if (j.id === job.id) {
        return { ...j, assignedTech: targetTechId, status: 'assigned' };
      }
      return j;
    });

    await onUpdateRoutes(updatedRoutes);
    await onUpdateJobs(updatedJobs);
    setDraggedJob(null);
  };

  const handleRouteSwap = async (e, targetTechId) => {
    e.preventDefault();
    setDragOverTech(null);

    if (!draggedTech || draggedTech === targetTechId) {
      setDraggedTech(null);
      return;
    }

    const updatedRoutes = { ...routes };

    // Swap the entire routes
    const temp = updatedRoutes[draggedTech];
    updatedRoutes[draggedTech] = {
      ...updatedRoutes[targetTechId],
      tech: temp.tech // Keep original tech info
    };
    updatedRoutes[targetTechId] = {
      ...temp,
      tech: updatedRoutes[targetTechId].tech // Keep original tech info
    };

    // Update all jobs with new tech assignments
    const draggedJobs = updatedRoutes[draggedTech]?.jobs || [];
    const targetJobs = updatedRoutes[targetTechId]?.jobs || [];

    const updatedJobs = jobs.map(job => {
      if (draggedJobs.some(j => j.id === job.id)) {
        return { ...job, assignedTech: draggedTech };
      }
      if (targetJobs.some(j => j.id === job.id)) {
        return { ...job, assignedTech: targetTechId };
      }
      return job;
    });

    await onUpdateRoutes(updatedRoutes);
    await onUpdateJobs(updatedJobs);
    setDraggedTech(null);
  };

  const unassignedJobs = jobs.filter(j => !j.assignedTech);

  return (
    <div style={{ height: 'calc(100vh - 140px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        marginBottom: '16px',
        padding: '12px 16px',
        backgroundColor: '#f9fafb',
        borderRadius: '6px',
        border: '1px solid #e5e7eb'
      }}>
        <h3 style={{ margin: 0, marginBottom: '8px', fontSize: '16px' }}>
          Kanban Calendar - {selectedDate}
        </h3>
        <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
          Drag individual jobs between technicians or drag the tech header to swap entire routes
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${techs.length + 1}, minmax(280px, 1fr))`,
        gap: '16px',
        flex: 1,
        minHeight: 0,
        overflowX: 'auto',
        overflowY: 'hidden',
        paddingBottom: '8px'
      }}>
        {/* Unassigned Jobs Column */}
        <div
          style={{
            backgroundColor: dragOverTech === 'unassigned' ? '#fef3c7' : '#ffffff',
            border: '2px dashed #e5e7eb',
            borderRadius: '8px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            transition: 'all 0.2s'
          }}
          onDragOver={handleDragOver}
          onDragEnter={() => handleDragEnter('unassigned')}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleJobDrop(e, null)}
        >
          <div style={{
            marginBottom: '12px',
            paddingBottom: '12px',
            borderBottom: '2px solid #e5e7eb'
          }}>
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>
              <i className="fas fa-inbox"></i> Unassigned
            </h4>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
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
                  marginBottom: '8px',
                  padding: '10px',
                  backgroundColor: '#f9fafb',
                  border: `2px solid ${getJobTypeColor(job.jobType)}`,
                  borderRadius: '6px',
                  cursor: 'grab',
                  transition: 'all 0.2s'
                }}
                onMouseDown={(e) => e.currentTarget.style.cursor = 'grabbing'}
                onMouseUp={(e) => e.currentTarget.style.cursor = 'grab'}
              >
                <div style={{ fontWeight: '600', fontSize: '13px', marginBottom: '4px' }}>
                  {job.customerName}
                </div>
                <div style={{ fontSize: '11px', color: '#6b7280' }}>
                  <div>{job.jobType}</div>
                  <div>{job.duration}h • {job.timeframeStart}-{job.timeframeEnd}</div>
                  {job.requiresTwoTechs && (
                    <div style={{ color: '#f59e0b', marginTop: '2px' }}>
                      <i className="fas fa-users"></i> 2 Techs Required
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tech Columns */}
        {techs.map(tech => {
          const techRoute = routes[tech.id];
          const techJobs = techRoute?.jobs || [];
          const totalHours = techJobs.reduce((sum, j) => sum + j.duration, 0);
          const isDragOver = dragOverTech === tech.id;
          const isDragging = draggedTech === tech.id;

          return (
            <div
              key={tech.id}
              style={{
                backgroundColor: isDragOver ? '#dbeafe' : '#ffffff',
                border: isDragging ? '2px solid #f59e0b' : '2px solid #e5e7eb',
                borderRadius: '8px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                opacity: isDragging ? 0.5 : 1,
                transition: 'all 0.2s'
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
                  marginBottom: '12px',
                  paddingBottom: '12px',
                  borderBottom: '2px solid #e5e7eb',
                  cursor: 'grab'
                }}
                onMouseDown={(e) => e.currentTarget.style.cursor = 'grabbing'}
                onMouseUp={(e) => e.currentTarget.style.cursor = 'grab'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <i className="fas fa-grip-vertical" style={{ color: '#9ca3af', fontSize: '12px' }}></i>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '600', flex: 1 }}>
                    {tech.name}
                  </h4>
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#6b7280' }}>
                  {tech.role} • {offices[tech.office]?.shortName}
                </p>
                <div style={{ marginTop: '8px', display: 'flex', gap: '12px', fontSize: '12px' }}>
                  <span>
                    <strong>{techJobs.length}</strong> jobs
                  </span>
                  <span>
                    <strong>{totalHours.toFixed(1)}h</strong> work
                  </span>
                </div>
                <div style={{
                  marginTop: '6px',
                  padding: '4px 8px',
                  backgroundColor: '#fef3c7',
                  borderRadius: '4px',
                  fontSize: '10px',
                  color: '#92400e',
                  textAlign: 'center'
                }}>
                  <i className="fas fa-hand-paper"></i> Drag header to swap routes
                </div>
              </div>

              {/* Jobs List */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {techJobs.map((job, idx) => (
                  <div
                    key={job.id}
                    draggable
                    onDragStart={(e) => handleJobDragStart(e, job, tech.id)}
                    style={{
                      marginBottom: '8px',
                      padding: '10px',
                      backgroundColor: '#f9fafb',
                      border: `2px solid ${getJobTypeColor(job.jobType)}`,
                      borderLeft: `4px solid ${getJobTypeColor(job.jobType)}`,
                      borderRadius: '6px',
                      cursor: 'grab',
                      transition: 'all 0.2s'
                    }}
                    onMouseDown={(e) => e.currentTarget.style.cursor = 'grabbing'}
                    onMouseUp={(e) => e.currentTarget.style.cursor = 'grab'}
                  >
                    <div style={{ fontWeight: '600', fontSize: '13px', marginBottom: '4px' }}>
                      {idx + 1}. {job.customerName}
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280' }}>
                      <div>{job.jobType}</div>
                      {job.startTime && (
                        <div style={{ color: '#059669', fontWeight: '600', marginTop: '2px' }}>
                          <i className="fas fa-clock"></i> {job.startTime} - {job.endTime}
                        </div>
                      )}
                      <div>{job.duration}h</div>
                      {job.travelTime > 0 && (
                        <div style={{ color: '#f59e0b' }}>
                          <i className="fas fa-car"></i> {job.travelTime}min drive
                        </div>
                      )}
                      {job.requiresTwoTechs && (
                        <div style={{ color: '#f59e0b', marginTop: '2px' }}>
                          <i className="fas fa-users"></i> 2 Techs
                        </div>
                      )}
                      {job.demoTech && (
                        <div style={{ color: '#8b5cf6', marginTop: '2px' }}>
                          <i className="fas fa-user-plus"></i> {job.demoTech}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {techJobs.length === 0 && (
                  <div style={{
                    padding: '20px',
                    textAlign: 'center',
                    color: '#9ca3af',
                    fontSize: '12px',
                    fontStyle: 'italic'
                  }}>
                    Drop jobs here
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default KanbanCalendar;
