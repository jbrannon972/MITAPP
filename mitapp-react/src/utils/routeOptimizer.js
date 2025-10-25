/**
 * Route Optimization Utility
 * Implements greedy nearest-neighbor algorithm with time windows
 */

/**
 * Convert time string (HH:MM) to minutes from midnight
 */
const timeToMinutes = (timeStr) => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

/**
 * Convert minutes from midnight to time string (HH:MM)
 */
const minutesToTime = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

/**
 * Check if arrival time is within job's time window
 */
const isWithinTimeWindow = (arrivalTime, job) => {
  const startWindow = timeToMinutes(job.timeframeStart);
  const endWindow = timeToMinutes(job.timeframeEnd);
  return arrivalTime >= startWindow && arrivalTime <= endWindow;
};

/**
 * Calculate the score for assigning a job to a time slot
 * Lower score is better
 */
const calculateJobScore = (currentTime, job, travelTime) => {
  const arrivalTime = currentTime + travelTime;
  const windowStart = timeToMinutes(job.timeframeStart);
  const windowEnd = timeToMinutes(job.timeframeEnd);

  // Can't arrive after window ends
  if (arrivalTime > windowEnd) {
    return Infinity;
  }

  // Wait time if we arrive early
  const waitTime = Math.max(0, windowStart - arrivalTime);

  // Preference for arriving closer to window start
  const timeWindowScore = Math.abs(arrivalTime + waitTime - windowStart);

  // Total score (lower is better)
  return travelTime + waitTime * 0.5 + timeWindowScore * 0.3;
};

/**
 * Greedy nearest-neighbor route optimization
 */
export const optimizeRoute = async (jobs, startLocation, distanceMatrix) => {
  if (!jobs || jobs.length === 0) {
    return {
      optimizedJobs: [],
      totalDuration: 0,
      totalDistance: 0,
      unassignableJobs: []
    };
  }

  const unassigned = [...jobs];
  const route = [];
  let currentTime = 8 * 60; // Start at 8:00 AM
  let currentLocationIndex = 0; // Start location index
  const unassignableJobs = [];

  // Map jobs to their indices for distance lookup
  const jobToIndex = new Map();
  jobs.forEach((job, idx) => {
    jobToIndex.set(job.id, idx + 1); // +1 because index 0 is start location
  });

  while (unassigned.length > 0) {
    let bestJob = null;
    let bestScore = Infinity;
    let bestTravelTime = 0;

    // Find best next job using greedy approach
    for (const job of unassigned) {
      const jobIndex = jobToIndex.get(job.id);
      const travelTime = distanceMatrix
        ? distanceMatrix[currentLocationIndex][jobIndex]
        : 20; // Default 20 min if no matrix

      const score = calculateJobScore(currentTime, job, travelTime);

      if (score < bestScore) {
        bestScore = score;
        bestJob = job;
        bestTravelTime = travelTime;
      }
    }

    // If no valid job found, mark remaining as unassignable
    if (bestScore === Infinity) {
      unassignableJobs.push(...unassigned);
      break;
    }

    // Add best job to route
    const arrivalTime = currentTime + bestTravelTime;
    const windowStart = timeToMinutes(bestJob.timeframeStart);
    const actualStartTime = Math.max(arrivalTime, windowStart);
    const endTime = actualStartTime + (bestJob.duration * 60);

    route.push({
      ...bestJob,
      arrivalTime: minutesToTime(arrivalTime),
      startTime: minutesToTime(actualStartTime),
      endTime: minutesToTime(endTime),
      travelTime: bestTravelTime,
      waitTime: Math.max(0, windowStart - arrivalTime)
    });

    // Update current position and time
    currentLocationIndex = jobToIndex.get(bestJob.id);
    currentTime = endTime;

    // Remove from unassigned
    const index = unassigned.findIndex(j => j.id === bestJob.id);
    if (index !== -1) {
      unassigned.splice(index, 1);
    }
  }

  // Calculate totals
  const totalDuration = route.reduce((sum, job) => sum + job.travelTime + (job.duration * 60), 0);
  const totalDistance = route.reduce((sum, job) => sum + job.travelTime * 0.5, 0); // Rough estimate

  return {
    optimizedJobs: route,
    totalDuration: Math.round(totalDuration),
    totalDistance: Math.round(totalDistance),
    unassignableJobs
  };
};

/**
 * Balance workload across multiple techs
 * Distributes jobs to minimize variance in work hours
 */
export const balanceWorkload = (jobs, techs, distanceMatrix) => {
  const assignments = {};

  // Initialize empty routes for each tech
  techs.forEach(tech => {
    assignments[tech.id] = {
      tech: tech,
      jobs: [],
      totalHours: 0,
      totalJobs: 0
    };
  });

  // Sort jobs by time window start (earliest first)
  const sortedJobs = [...jobs].sort((a, b) => {
    const aStart = timeToMinutes(a.timeframeStart);
    const bStart = timeToMinutes(b.timeframeStart);
    return aStart - bStart;
  });

  // Assign jobs one by one to tech with least work
  for (const job of sortedJobs) {
    // Find tech with least work in appropriate zone
    let bestTech = null;
    let minHours = Infinity;

    for (const tech of techs) {
      // Skip if tech is in wrong zone (prefer zone matching but allow others)
      const zoneMatch = tech.zone === job.zone;
      const hours = assignments[tech.id].totalHours;

      // Prefer zone match, but consider all techs
      const adjustedHours = zoneMatch ? hours : hours + 2; // Penalty for wrong zone

      if (adjustedHours < minHours) {
        minHours = adjustedHours;
        bestTech = tech;
      }
    }

    if (bestTech) {
      assignments[bestTech.id].jobs.push(job);
      assignments[bestTech.id].totalHours += job.duration;
      assignments[bestTech.id].totalJobs += 1;
    }
  }

  return assignments;
};

/**
 * Auto-assign demo techs to jobs requiring 2 people
 */
export const assignDemoTechs = (routes, demoTechs) => {
  const enhancedRoutes = {};
  const demoTechAvailability = {};

  // Initialize demo tech availability tracking
  demoTechs.forEach(dt => {
    demoTechAvailability[dt.id] = {
      tech: dt,
      schedule: [], // Array of {start, end, job} time blocks
      totalHours: 0
    };
  });

  // Process each tech's route
  for (const [techId, route] of Object.entries(routes)) {
    const enhancedJobs = [];

    for (const job of route.jobs) {
      const enhancedJob = { ...job };

      // If job requires 2 techs, find available demo tech
      if (job.requiresTwoTechs) {
        const jobStart = timeToMinutes(job.startTime || job.timeframeStart);
        const jobEnd = jobStart + (job.duration * 60);

        // Find demo tech from same office with availability
        const availableDemoTech = demoTechs.find(dt => {
          // Must be from same office
          if (dt.office !== route.tech.office) return false;

          // Check if demo tech is available during this time
          const schedule = demoTechAvailability[dt.id].schedule;
          const hasConflict = schedule.some(block => {
            return (jobStart < block.end && jobEnd > block.start);
          });

          return !hasConflict;
        });

        if (availableDemoTech) {
          enhancedJob.demoTech = availableDemoTech.name;
          enhancedJob.demoTechId = availableDemoTech.id;

          // Block this time for the demo tech
          demoTechAvailability[availableDemoTech.id].schedule.push({
            start: jobStart,
            end: jobEnd,
            job: job.id
          });
          demoTechAvailability[availableDemoTech.id].totalHours += job.duration;
        } else {
          enhancedJob.demoTechWarning = 'No demo tech available';
        }
      }

      enhancedJobs.push(enhancedJob);
    }

    enhancedRoutes[techId] = {
      ...route,
      jobs: enhancedJobs
    };
  }

  return {
    routes: enhancedRoutes,
    demoTechUtilization: demoTechAvailability
  };
};

/**
 * Filter techs eligible for routing
 * Excludes Management and MIT Leads (except 2nd shift MIT Lead)
 */
export const getRoutingEligibleTechs = (allTechs) => {
  return allTechs.filter(tech => {
    // Exclude Management roles
    if (tech.role === 'Manager' || tech.role === 'Supervisor') {
      return false;
    }

    // Exclude MIT Leads EXCEPT for 2nd shift
    if (tech.role === 'MIT Lead' && !tech.name?.toLowerCase().includes('second shift')) {
      return false;
    }

    // Exclude Demo Techs from lead routing
    if (tech.isDemoTech) {
      return false;
    }

    return true;
  });
};

/**
 * Calculate route summary statistics
 */
export const calculateRouteSummary = (route) => {
  if (!route || !route.jobs || route.jobs.length === 0) {
    return {
      totalJobs: 0,
      totalHours: 0,
      totalDriveTime: 0,
      zones: [],
      firstJob: null,
      lastJob: null,
      efficiency: 0
    };
  }

  const totalJobs = route.jobs.length;
  const totalHours = route.jobs.reduce((sum, job) => sum + job.duration, 0);
  const totalDriveTime = route.jobs.reduce((sum, job) => sum + (job.travelTime || 0), 0);
  const zones = [...new Set(route.jobs.map(j => j.zone))];
  const firstJob = route.jobs[0];
  const lastJob = route.jobs[route.jobs.length - 1];

  // Efficiency = work time / (work time + drive time)
  const workMinutes = totalHours * 60;
  const efficiency = workMinutes / (workMinutes + totalDriveTime);

  return {
    totalJobs,
    totalHours: Math.round(totalHours * 10) / 10,
    totalDriveTime: Math.round(totalDriveTime),
    totalDriveHours: Math.round((totalDriveTime / 60) * 10) / 10,
    zones,
    firstJob,
    lastJob,
    efficiency: Math.round(efficiency * 100)
  };
};

export default {
  optimizeRoute,
  balanceWorkload,
  assignDemoTechs,
  getRoutingEligibleTechs,
  calculateRouteSummary
};
