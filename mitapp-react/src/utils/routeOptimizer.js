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
 * Allows arrival up to 90 minutes early (techs can start immediately upon arrival)
 */
const isWithinTimeWindow = (arrivalTime, job) => {
  const startWindow = timeToMinutes(job.timeframeStart);
  const endWindow = timeToMinutes(job.timeframeEnd);
  const earlyArrivalBuffer = 90; // Can arrive up to 90 minutes early and start immediately
  return arrivalTime >= (startWindow - earlyArrivalBuffer) && arrivalTime <= endWindow;
};

/**
 * Calculate the score for assigning a job to a time slot
 * Lower score is better
 * Allows arrival up to 90 minutes before timeframe start for more flexibility
 */
const calculateJobScore = (currentTime, job, travelTime) => {
  const arrivalTime = currentTime + travelTime;
  const windowStart = timeToMinutes(job.timeframeStart);
  const windowEnd = timeToMinutes(job.timeframeEnd);
  const earlyArrivalBuffer = 90; // Can arrive up to 90 minutes early and start immediately

  // Can't arrive after window ends (still need to meet deadline)
  if (arrivalTime > windowEnd) {
    return Infinity;
  }

  // Can't arrive more than 90 minutes before window starts (reasonable limit)
  if (arrivalTime < (windowStart - earlyArrivalBuffer)) {
    return Infinity;
  }

  // Simple scoring: mainly based on travel time
  // Techs can start immediately upon arrival, so no wait time penalty
  // Small preference for not arriving too early (10% weight)
  const earlyArrival = Math.max(0, windowStart - arrivalTime);
  const earlyArrivalPenalty = earlyArrival * 0.1; // Small penalty for very early arrival

  // Total score (lower is better)
  return travelTime + earlyArrivalPenalty;
};

/**
 * Internal greedy nearest-neighbor route optimization
 * @param {Array} jobs - Jobs to optimize
 * @param {number} shiftStartTime - Start time in minutes
 * @param {Array} distanceMatrix - Matrix of travel times
 * @param {Map} jobToIndex - Job ID to index mapping
 * @param {string} strategy - Optimization strategy ('greedy', 'deadline-first')
 */
const greedyOptimize = (jobs, shiftStartTime, distanceMatrix, jobToIndex, strategy = 'greedy') => {
  // Sort jobs based on strategy
  let sortedJobs = [...jobs];
  if (strategy === 'deadline-first') {
    sortedJobs.sort((a, b) => {
      const aEnd = timeToMinutes(a.timeframeEnd);
      const bEnd = timeToMinutes(b.timeframeEnd);
      return aEnd - bEnd; // Earlier deadlines first
    });
  }

  const unassigned = [...sortedJobs]; // Make a copy so we can modify
  const route = [];
  let currentTime = shiftStartTime;
  let currentLocationIndex = 0; // Start location index
  const unassignableJobs = [];

  while (unassigned.length > 0) {
    let bestJob = null;
    let bestScore = Infinity;
    let bestTravelTime = 0;

    // Find best next job using improved greedy approach with urgency weighting
    for (const job of unassigned) {
      const jobIndex = jobToIndex.get(job.id);
      const travelTime = distanceMatrix
        ? distanceMatrix[currentLocationIndex][jobIndex]
        : 20; // Default 20 min if no matrix

      let score = calculateJobScore(currentTime, job, travelTime);

      // Add urgency factor only for greedy strategy
      // (deadline-first already sorted by deadline)
      if (strategy === 'greedy' && score !== Infinity) {
        const arrivalTime = currentTime + travelTime;
        const windowEnd = timeToMinutes(job.timeframeEnd);
        const timeUntilDeadline = windowEnd - arrivalTime;

        // If deadline is within 2 hours, heavily prioritize this job
        if (timeUntilDeadline < 120) {
          score = score * 0.5; // Make urgent jobs much more attractive
        }
        // If deadline is within 3 hours, moderately prioritize
        else if (timeUntilDeadline < 180) {
          score = score * 0.7;
        }
      }

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
    // Techs can start immediately upon arrival (even before timeframe window opens)
    const actualStartTime = arrivalTime;
    const endTime = actualStartTime + (bestJob.duration * 60);

    route.push({
      ...bestJob,
      arrivalTime: minutesToTime(arrivalTime),
      startTime: minutesToTime(actualStartTime),
      endTime: minutesToTime(endTime),
      travelTime: bestTravelTime,
      waitTime: 0 // Techs start immediately upon arrival, no waiting
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
 * Route optimization with multiple retry strategies
 * Tries different approaches to minimize unassignable jobs
 * @param {Array} jobs - Jobs to optimize
 * @param {string} startLocation - Starting location address
 * @param {Array} distanceMatrix - Matrix of travel times
 * @param {string} shift - 'first' or 'second' shift
 * @param {string} customStartTime - Optional custom start time in HH:MM format (e.g., "09:30")
 */
export const optimizeRoute = async (jobs, startLocation, distanceMatrix, shift = 'first', customStartTime = null) => {
  if (!jobs || jobs.length === 0) {
    return {
      optimizedJobs: [],
      totalDuration: 0,
      totalDistance: 0,
      unassignableJobs: []
    };
  }

  // Determine start time
  let shiftStartTime;
  if (customStartTime) {
    shiftStartTime = timeToMinutes(customStartTime);
  } else {
    shiftStartTime = shift === 'second' ? 13 * 60 + 15 : 8 * 60 + 15; // 1:15 PM or 8:15 AM
  }

  // Map jobs to their indices for distance lookup
  const jobToIndex = new Map();
  jobs.forEach((job, idx) => {
    jobToIndex.set(job.id, idx + 1); // +1 because index 0 is start location
  });

  // Strategy 1: Try standard greedy with urgency weighting
  console.log('🔄 Optimization attempt 1: Greedy with urgency weighting');
  let result = greedyOptimize(jobs, shiftStartTime, distanceMatrix, jobToIndex, 'greedy');

  // If there are unassignable jobs, try alternate strategies
  if (result.unassignableJobs.length > 0) {
    console.log(`⚠️ ${result.unassignableJobs.length} unassignable jobs, trying deadline-first strategy...`);

    // Strategy 2: Sort by deadline first, then optimize
    const deadlineResult = greedyOptimize(jobs, shiftStartTime, distanceMatrix, jobToIndex, 'deadline-first');

    // Use deadline-first result if it has fewer unassignable jobs
    if (deadlineResult.unassignableJobs.length < result.unassignableJobs.length) {
      console.log(`✅ Deadline-first strategy better: ${deadlineResult.unassignableJobs.length} unassignable (was ${result.unassignableJobs.length})`);
      result = deadlineResult;
    } else {
      console.log(`📊 Deadline-first strategy no better: ${deadlineResult.unassignableJobs.length} unassignable (keeping ${result.unassignableJobs.length})`);
    }

    // Strategy 3: If still have unassignable jobs, try with extra time buffer
    if (result.unassignableJobs.length > 0) {
      console.log(`⚠️ Still ${result.unassignableJobs.length} unassignable, trying earlier start time...`);
      // Try starting 15 minutes earlier
      const earlyResult = greedyOptimize(jobs, shiftStartTime - 15, distanceMatrix, jobToIndex, 'deadline-first');

      if (earlyResult.unassignableJobs.length < result.unassignableJobs.length) {
        console.log(`✅ Early start strategy better: ${earlyResult.unassignableJobs.length} unassignable (was ${result.unassignableJobs.length})`);
        result = earlyResult;
      } else {
        console.log(`📊 Early start strategy no better: ${earlyResult.unassignableJobs.length} unassignable (keeping ${result.unassignableJobs.length})`);
      }
    }
  } else {
    console.log('✅ All jobs assigned on first attempt!');
  }

  return result;
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
 * Keeps demo techs with same lead tech all day when possible
 */
export const assignDemoTechs = (routes, demoTechs) => {
  const enhancedRoutes = {};
  const demoTechAssignments = {}; // Track which demo tech is assigned to which lead tech

  // Initialize demo tech tracking
  demoTechs.forEach(dt => {
    demoTechAssignments[dt.id] = {
      tech: dt,
      assignedToLeadTech: null, // Which lead tech they're with for the day
      totalHours: 0,
      jobs: []
    };
  });

  // First pass: Calculate how many 2-tech jobs each lead has
  const leadTechScores = {};
  for (const [techId, route] of Object.entries(routes)) {
    const twoTechJobs = route.jobs.filter(j => j.requiresTwoTechs);
    leadTechScores[techId] = {
      tech: route.tech,
      twoTechJobCount: twoTechJobs.length,
      totalTwoTechHours: twoTechJobs.reduce((sum, j) => sum + j.duration, 0)
    };
  }

  // Sort lead techs by number of 2-tech jobs (prefer demo-heavy routes)
  const sortedLeadTechs = Object.entries(leadTechScores)
    .sort((a, b) => b[1].twoTechJobCount - a[1].twoTechJobCount);

  // Assign demo techs to lead techs (one demo tech per lead tech for the day)
  for (const [techId, score] of sortedLeadTechs) {
    if (score.twoTechJobCount === 0) continue;

    // Find an available demo tech from the same office
    const availableDemoTech = demoTechs.find(dt => {
      return dt.office === score.tech.office &&
             !demoTechAssignments[dt.id].assignedToLeadTech;
    });

    if (availableDemoTech) {
      demoTechAssignments[availableDemoTech.id].assignedToLeadTech = techId;
    }
  }

  // Second pass: Apply demo tech assignments to jobs
  for (const [techId, route] of Object.entries(routes)) {
    const enhancedJobs = [];

    // Find if this lead tech has a demo tech assigned for the day
    const assignedDemoTech = demoTechs.find(dt =>
      demoTechAssignments[dt.id].assignedToLeadTech === techId
    );

    for (const job of route.jobs) {
      const enhancedJob = { ...job };

      // If job requires 2 techs and we have an assigned demo tech, use them
      if (job.requiresTwoTechs) {
        if (assignedDemoTech) {
          enhancedJob.demoTech = assignedDemoTech.name;
          enhancedJob.demoTechId = assignedDemoTech.id;
          demoTechAssignments[assignedDemoTech.id].totalHours += job.duration;
          demoTechAssignments[assignedDemoTech.id].jobs.push(job.id);
        } else {
          // No demo tech assigned for this route
          enhancedJob.demoTechWarning = 'No demo tech available - may need to assign manually';
        }
      }

      enhancedJobs.push(enhancedJob);
    }

    enhancedRoutes[techId] = {
      ...route,
      jobs: enhancedJobs,
      assignedDemoTech: assignedDemoTech ? assignedDemoTech.name : null
    };
  }

  return {
    routes: enhancedRoutes,
    demoTechUtilization: demoTechAssignments
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
