import { timeToMinutes } from './routingHelpers';
import { OFF_STATUSES } from './routingConstants';

/**
 * Detect all routing conflicts
 * @param {Object} routes - Current routes object
 * @param {Array} jobs - All jobs array
 * @param {Object} scheduleForDay - Schedule data for the day
 * @param {Array} techs - All technicians
 * @returns {Array} - Array of conflict objects
 */
export const detectConflicts = (routes, jobs, scheduleForDay, techs) => {
  const conflicts = [];

  // Check each route for conflicts
  Object.entries(routes).forEach(([techId, route]) => {
    if (!route || !route.tech) return;

    const techJobs = route.jobs || [];
    const techName = route.tech.name;

    // 1. Check for overtime (> 8 hours)
    const totalHours = techJobs
      .filter(j => j.type !== 'secondTechAssignment')
      .reduce((sum, j) => sum + (j.duration || 0), 0);

    if (totalHours > 8.5) {
      conflicts.push({
        id: `overtime-${techId}`,
        type: 'overtime',
        severity: 'high',
        techId,
        techName,
        message: `${techName}: ${totalHours.toFixed(1)} hrs scheduled (over 8hr limit)`,
        data: { hours: totalHours }
      });
    }

    // 2. Check if tech is marked as off
    if (scheduleForDay?.staff) {
      const staffEntry = scheduleForDay.staff.find(s => s.id === techId);
      if (staffEntry && OFF_STATUSES.includes(staffEntry.status?.toLowerCase())) {
        if (techJobs.length > 0) {
          conflicts.push({
            id: `off-with-jobs-${techId}`,
            type: 'off-with-jobs',
            severity: 'critical',
            techId,
            techName,
            message: `${techName}: Off today but has ${techJobs.length} jobs assigned`,
            data: { status: staffEntry.status, jobCount: techJobs.length }
          });
        }
      }
    }

    // 3. Check for timeframe violations
    techJobs.forEach((job, index) => {
      if (job.type === 'secondTechAssignment') return;

      if (job.startTime && job.timeframeStart && job.timeframeEnd) {
        const startMinutes = timeToMinutes(job.startTime);
        const windowStart = timeToMinutes(job.timeframeStart);
        const windowEnd = timeToMinutes(job.timeframeEnd);

        if (startMinutes < windowStart) {
          conflicts.push({
            id: `early-${job.id}`,
            type: 'timeframe-early',
            severity: 'medium',
            techId,
            techName,
            jobId: job.id,
            message: `Job "${job.customerName}": Arrives at ${job.startTime}, window opens at ${job.timeframeStart}`,
            data: { job, arrivalTime: job.startTime, windowStart: job.timeframeStart }
          });
        } else if (startMinutes > windowEnd) {
          conflicts.push({
            id: `late-${job.id}`,
            type: 'timeframe-late',
            severity: 'high',
            techId,
            techName,
            jobId: job.id,
            message: `Job "${job.customerName}": Arrives at ${job.startTime}, window closes at ${job.timeframeEnd}`,
            data: { job, arrivalTime: job.startTime, windowEnd: job.timeframeEnd }
          });
        }
      }
    });

    // 4. Check for overlapping time slots
    for (let i = 0; i < techJobs.length; i++) {
      for (let j = i + 1; j < techJobs.length; j++) {
        const job1 = techJobs[i];
        const job2 = techJobs[j];

        if (!job1.startTime || !job1.endTime || !job2.startTime || !job2.endTime) continue;

        const job1Start = timeToMinutes(job1.startTime);
        const job1End = timeToMinutes(job1.endTime);
        const job2Start = timeToMinutes(job2.startTime);
        const job2End = timeToMinutes(job2.endTime);

        // Check for overlap
        if (job1Start < job2End && job2Start < job1End) {
          conflicts.push({
            id: `overlap-${job1.id}-${job2.id}`,
            type: 'overlap',
            severity: 'critical',
            techId,
            techName,
            message: `${techName}: Job "${job1.customerName}" (${job1.startTime}-${job1.endTime}) overlaps with "${job2.customerName}" (${job2.startTime}-${job2.endTime})`,
            data: { job1, job2 }
          });
        }
      }
    }

    // 5. Check for missing demo tech assignments
    const jobsNeedingDemoTech = techJobs.filter(j =>
      j.requiresTwoTechs &&
      j.type !== 'secondTechAssignment' &&
      !j.demoTech &&
      !j.assignedDemoTech
    );

    if (jobsNeedingDemoTech.length > 0) {
      conflicts.push({
        id: `missing-demo-${techId}`,
        type: 'missing-demo-tech',
        severity: 'medium',
        techId,
        techName,
        message: `${techName}: ${jobsNeedingDemoTech.length} job(s) need demo tech but none assigned`,
        data: { jobs: jobsNeedingDemoTech }
      });
    }
  });

  // 6. Check for duplicate job assignments (same job assigned to multiple techs)
  const jobAssignments = new Map();
  Object.entries(routes).forEach(([techId, route]) => {
    route.jobs?.forEach(job => {
      if (job.type === 'secondTechAssignment') return;

      if (jobAssignments.has(job.id)) {
        const firstTech = jobAssignments.get(job.id);
        conflicts.push({
          id: `duplicate-${job.id}`,
          type: 'duplicate-assignment',
          severity: 'critical',
          message: `Job "${job.customerName}" assigned to both ${firstTech} and ${route.tech.name}`,
          data: { job, tech1: firstTech, tech2: route.tech.name }
        });
      } else {
        jobAssignments.set(job.id, route.tech.name);
      }
    });
  });

  // Sort by severity (critical > high > medium > low)
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  conflicts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return conflicts;
};

/**
 * Auto-fix conflicts (best effort)
 * @param {Array} conflicts - Conflicts to fix
 * @param {Object} routes - Current routes
 * @param {Array} jobs - All jobs
 * @param {Array} techs - All technicians
 * @returns {Object} - { routes, jobs, fixedConflicts, unfixedConflicts }
 */
export const autoFixConflicts = (conflicts, routes, jobs, techs) => {
  let updatedRoutes = { ...routes };
  let updatedJobs = [...jobs];
  const fixedConflicts = [];
  const unfixedConflicts = [];

  conflicts.forEach(conflict => {
    let fixed = false;

    switch (conflict.type) {
      case 'overtime': {
        // Find the tech's jobs and try to redistribute some
        const techRoute = updatedRoutes[conflict.techId];
        if (!techRoute) break;

        const techJobs = techRoute.jobs.filter(j => j.type !== 'secondTechAssignment');

        // Find other techs with capacity
        const availableTechs = techs.filter(t => {
          const tRoute = updatedRoutes[t.id];
          if (!tRoute) return true; // Empty route = available

          const tHours = tRoute.jobs
            .filter(j => j.type !== 'secondTechAssignment')
            .reduce((sum, j) => sum + j.duration, 0);
          return tHours < 7; // Has capacity
        });

        if (availableTechs.length > 0 && techJobs.length > 1) {
          // Move last job to available tech
          const jobToMove = techJobs[techJobs.length - 1];
          const targetTech = availableTechs[0];

          // Remove from current tech
          updatedRoutes[conflict.techId] = {
            ...updatedRoutes[conflict.techId],
            jobs: updatedRoutes[conflict.techId].jobs.filter(j => j.id !== jobToMove.id)
          };

          // Add to target tech
          if (!updatedRoutes[targetTech.id]) {
            updatedRoutes[targetTech.id] = { tech: targetTech, jobs: [jobToMove] };
          } else {
            updatedRoutes[targetTech.id] = {
              ...updatedRoutes[targetTech.id],
              jobs: [...updatedRoutes[targetTech.id].jobs, jobToMove]
            };
          }

          // Update job assignment
          updatedJobs = updatedJobs.map(j =>
            j.id === jobToMove.id
              ? { ...j, assignedTech: targetTech.id, status: 'assigned' }
              : j
          );

          fixed = true;
        }
        break;
      }

      case 'off-with-jobs': {
        // Unassign all jobs from this tech
        const techRoute = updatedRoutes[conflict.techId];
        if (techRoute) {
          const jobIds = techRoute.jobs.map(j => j.id);

          // Remove route
          delete updatedRoutes[conflict.techId];

          // Unassign jobs
          updatedJobs = updatedJobs.map(j =>
            jobIds.includes(j.id)
              ? { ...j, assignedTech: null, status: 'unassigned' }
              : j
          );

          fixed = true;
        }
        break;
      }

      case 'timeframe-late': {
        // Try to move job earlier in the route
        const techRoute = updatedRoutes[conflict.techId];
        if (techRoute) {
          const jobIndex = techRoute.jobs.findIndex(j => j.id === conflict.jobId);
          if (jobIndex > 0) {
            // Swap with previous job (create new array to avoid mutation)
            const newJobs = [...techRoute.jobs];
            const temp = newJobs[jobIndex];
            newJobs[jobIndex] = newJobs[jobIndex - 1];
            newJobs[jobIndex - 1] = temp;
            updatedRoutes[conflict.techId] = {
              ...techRoute,
              jobs: newJobs
            };
            fixed = true;
          }
        }
        break;
      }

      case 'duplicate-assignment': {
        // Remove from the second tech (keep first assignment)
        for (const [techId, route] of Object.entries(updatedRoutes)) {
          if (route.tech.name === conflict.data.tech2) {
            updatedRoutes[techId] = {
              ...route,
              jobs: route.jobs.filter(j => j.id !== conflict.data.job.id)
            };
            fixed = true;
            break;
          }
        }
        break;
      }

      default:
        // Can't auto-fix this type
        break;
    }

    if (fixed) {
      fixedConflicts.push(conflict);
    } else {
      unfixedConflicts.push(conflict);
    }
  });

  return {
    routes: updatedRoutes,
    jobs: updatedJobs,
    fixedConflicts,
    unfixedConflicts
  };
};
