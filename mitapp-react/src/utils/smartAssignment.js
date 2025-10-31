import { getTechRecommendations } from './techScoring';
import { optimizeRoute } from './routeOptimizer';
import { timeToMinutes } from './routingHelpers';

/**
 * Smart fill a tech's day with optimal jobs
 * @param {Object} tech - Technician to fill
 * @param {Array} unassignedJobs - Available unassigned jobs
 * @param {Object} routes - Current routes
 * @param {Object} scheduleForDay - Schedule for the day
 * @param {Object} options - { targetHours, offices, mapboxService }
 * @returns {Promise<Object>} - { selectedJobs, totalHours, reasons }
 */
export const smartFillTechDay = async (
  tech,
  unassignedJobs,
  routes,
  scheduleForDay,
  options = {}
) => {
  const targetHours = options.targetHours || 8;
  const selectedJobs = [];
  let totalHours = 0;
  const reasons = [];

  // Get current hours
  const techRoute = routes[tech.id];
  const currentHours = techRoute?.jobs
    ? techRoute.jobs
        .filter(j => j.type !== 'secondTechAssignment')
        .reduce((sum, j) => sum + (j.duration || 0), 0)
    : 0;

  totalHours = currentHours;

  // Filter jobs that are suitable for this tech
  const eligibleJobs = unassignedJobs.filter(job => {
    // Skip if job would exceed target hours
    if (totalHours + job.duration > targetHours + 0.5) return false;

    // Prefer jobs in tech's zone
    if (job.zone && tech.zone && job.zone !== tech.zone) {
      // Only include if we don't have enough zone jobs
      return selectedJobs.length < 2;
    }

    return true;
  });

  // Score all eligible jobs for this tech
  const scoredJobs = await Promise.all(
    eligibleJobs.map(async (job) => {
      const recs = await getTechRecommendations(
        job,
        [tech],
        routes,
        scheduleForDay,
        { includeDistance: true, limit: 1 }
      );

      const score = recs[0]?.score || 0;
      return { job, score, rec: recs[0] };
    })
  );

  // Sort by score (highest first) and timeframe start time
  scoredJobs.sort((a, b) => {
    // Prioritize by score
    if (Math.abs(a.score - b.score) > 10) {
      return b.score - a.score;
    }
    // If scores are similar, prioritize earlier timeframes
    const aTime = timeToMinutes(a.job.timeframeStart || '08:00');
    const bTime = timeToMinutes(b.job.timeframeStart || '08:00');
    return aTime - bTime;
  });

  // Select jobs until we hit target hours
  for (const { job, score, rec } of scoredJobs) {
    if (totalHours + job.duration <= targetHours + 0.5 && score > 40) {
      selectedJobs.push(job);
      totalHours += job.duration;

      // Add reason for selection
      if (rec?.reasons && rec.reasons.length > 0) {
        reasons.push(`${job.customerName}: ${rec.reasons[0]}`);
      }

      // Stop if we're close to target
      if (totalHours >= targetHours - 0.5) {
        break;
      }
    }
  }

  return {
    selectedJobs,
    totalHours,
    currentHours,
    addedHours: totalHours - currentHours,
    reasons
  };
};

/**
 * Optimize order of multiple selected jobs before assignment
 * @param {Array} jobs - Jobs to optimize
 * @param {Object} tech - Target technician
 * @param {Object} routes - Current routes
 * @param {Object} options - { offices, mapboxService, shift }
 * @returns {Promise<Object>} - { optimizedJobs, preview }
 */
export const optimizeJobSelection = async (jobs, tech, routes, options = {}) => {
  const { offices, shift } = options;

  // Get office start location
  const officeKey = tech.office || 'office_1';
  const startLocation = offices?.[officeKey]?.address;

  if (!startLocation) {
    // Can't optimize without start location, return in current order
    return {
      optimizedJobs: jobs,
      preview: {
        totalDuration: jobs.reduce((sum, j) => sum + j.duration, 0),
        message: 'Using current order (office location not found)'
      }
    };
  }

  try {
    // Get existing jobs for this tech
    const existingJobs = routes[tech.id]?.jobs || [];

    // Combine existing and new jobs
    const allJobs = [...existingJobs, ...jobs];

    // Use the route optimizer
    const optimized = await optimizeRoute(
      allJobs,
      startLocation,
      null, // distance matrix will be calculated
      shift || 'first'
    );

    // Extract only the newly added jobs in their optimized order
    const newJobIds = new Set(jobs.map(j => j.id));
    const optimizedNewJobs = optimized.optimizedJobs.filter(j => newJobIds.has(j.id));

    return {
      optimizedJobs: optimizedNewJobs,
      preview: {
        totalDuration: optimized.totalDuration,
        totalDistance: optimized.totalDistance,
        message: `Optimized for ${optimized.totalDistance?.toFixed(1) || '?'} mi route`
      },
      fullRoute: optimized.optimizedJobs
    };
  } catch (error) {
    console.error('Error optimizing job selection:', error);

    // Return jobs in timeframe order as fallback
    const sortedJobs = [...jobs].sort((a, b) => {
      const aTime = timeToMinutes(a.timeframeStart || '08:00');
      const bTime = timeToMinutes(b.timeframeStart || '08:00');
      return aTime - bTime;
    });

    return {
      optimizedJobs: sortedJobs,
      preview: {
        totalDuration: jobs.reduce((sum, j) => sum + j.duration, 0),
        message: 'Sorted by timeframe (optimization failed)'
      }
    };
  }
};

/**
 * Suggest best tech for multiple jobs at once
 * @param {Array} jobs - Jobs to assign
 * @param {Array} techs - Available techs
 * @param {Object} routes - Current routes
 * @param {Object} scheduleForDay - Schedule for the day
 * @returns {Promise<Object>} - { suggestions: [{ tech, jobs, score }] }
 */
export const suggestBulkAssignment = async (jobs, techs, routes, scheduleForDay) => {
  // Group jobs by zone
  const jobsByZone = {};
  jobs.forEach(job => {
    const zone = job.zone || 'unzoned';
    if (!jobsByZone[zone]) {
      jobsByZone[zone] = [];
    }
    jobsByZone[zone].push(job);
  });

  const suggestions = [];

  // For each zone, find the best tech
  for (const [zone, zoneJobs] of Object.entries(jobsByZone)) {
    // Filter techs by zone
    const zoneTechs = techs.filter(t => t.zone === zone || zone === 'unzoned');

    if (zoneTechs.length === 0) {
      continue; // No techs available for this zone
    }

    // Score each tech for this group of jobs
    const techScores = await Promise.all(
      zoneTechs.map(async (tech) => {
        let totalScore = 0;
        let canFit = true;

        const techRoute = routes[tech.id];
        let currentHours = techRoute?.jobs
          ? techRoute.jobs.reduce((sum, j) => sum + j.duration, 0)
          : 0;

        for (const job of zoneJobs) {
          // Check if adding this job would exceed capacity
          if (currentHours + job.duration > 8.5) {
            canFit = false;
            break;
          }

          const recs = await getTechRecommendations(
            job,
            [tech],
            routes,
            scheduleForDay,
            { includeDistance: false, limit: 1 }
          );

          const score = recs[0]?.score || 0;
          totalScore += score;
          currentHours += job.duration;
        }

        return {
          tech,
          totalScore,
          avgScore: totalScore / zoneJobs.length,
          canFit
        };
      })
    );

    // Find best tech that can fit all jobs
    const bestMatch = techScores
      .filter(ts => ts.canFit)
      .sort((a, b) => b.avgScore - a.avgScore)[0];

    if (bestMatch) {
      suggestions.push({
        tech: bestMatch.tech,
        jobs: zoneJobs,
        score: Math.round(bestMatch.avgScore),
        zone
      });
    }
  }

  return { suggestions };
};
