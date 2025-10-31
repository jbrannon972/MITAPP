import { getMapboxService } from '../services/mapboxService';
import { OFF_STATUSES } from './routingConstants';

/**
 * Calculate match score for a tech to a job
 * @param {Object} tech - Technician object
 * @param {Object} job - Job object
 * @param {Object} routes - Current routes
 * @param {Object} scheduleForDay - Schedule for the day
 * @param {Object} options - Additional options (includeDistance, jobHistory, etc.)
 * @returns {Promise<Object>} - { score, reasons, driveTime, distance }
 */
export const calculateTechScore = async (tech, job, routes, scheduleForDay = null, options = {}) => {
  let score = 100;
  const reasons = [];
  let driveTime = null;
  let distance = null;

  // 1. Check if tech is off today (automatic disqualification)
  if (scheduleForDay?.staff) {
    const staffEntry = scheduleForDay.staff.find(s => s.id === tech.id);
    if (staffEntry && OFF_STATUSES.includes(staffEntry.status?.toLowerCase())) {
      return {
        score: 0,
        reasons: [`Off today (${staffEntry.status})`],
        driveTime: null,
        distance: null,
        disqualified: true
      };
    }
  }

  // 2. Check workload capacity
  const techRoute = routes[tech.id];
  const currentHours = techRoute?.jobs
    ? techRoute.jobs
        .filter(j => j.type !== 'secondTechAssignment')
        .reduce((sum, j) => sum + (j.duration || 0), 0)
    : 0;

  const totalHoursAfter = currentHours + (job.duration || 0);

  if (totalHoursAfter > 8.5) {
    score -= 50;
    reasons.push(`Would exceed capacity (${totalHoursAfter.toFixed(1)}/8 hrs)`);
  } else if (totalHoursAfter > 7.5) {
    score -= 20;
    reasons.push(`Near capacity (${currentHours.toFixed(1)}/8 hrs)`);
  } else if (currentHours < 4) {
    score += 10;
    reasons.push(`Good capacity (${currentHours.toFixed(1)}/8 hrs)`);
  }

  // 3. Zone matching
  if (job.zone && tech.zone) {
    if (job.zone === tech.zone) {
      score += 20;
      reasons.push(`Same zone (${tech.zone})`);
    } else {
      score -= 15;
      reasons.push(`Different zone (tech in ${tech.zone}, job in ${job.zone})`);
    }
  }

  // 4. Office proximity
  if (job.office && tech.office) {
    if (job.office === tech.office) {
      score += 10;
      reasons.push('Same office');
    } else {
      score -= 10;
      reasons.push('Different office');
    }
  }

  // 5. Calculate drive time/distance from tech's last job
  if (options.includeDistance !== false) {
    try {
      let startLocation = null;

      // Get tech's last job location or office
      if (techRoute?.jobs && techRoute.jobs.length > 0) {
        // Get the last job's address
        const sortedJobs = [...techRoute.jobs].sort((a, b) => {
          const aTime = a.endTime || a.timeframeEnd || '00:00';
          const bTime = b.endTime || b.timeframeEnd || '00:00';
          return aTime.localeCompare(bTime);
        });
        startLocation = sortedJobs[sortedJobs.length - 1].address;
      }

      if (startLocation && job.address) {
        const mapbox = getMapboxService();
        const result = await mapbox.getDrivingDistance(startLocation, job.address);

        driveTime = result.durationMinutes;
        distance = result.distanceMiles;

        if (driveTime <= 15) {
          score += 15;
          reasons.push(`Very close (${driveTime} min away)`);
        } else if (driveTime <= 25) {
          score += 5;
          reasons.push(`${driveTime} min away`);
        } else if (driveTime <= 40) {
          score -= 5;
          reasons.push(`${driveTime} min away`);
        } else {
          score -= 15;
          reasons.push(`Far away (${driveTime} min drive)`);
        }
      }
    } catch (error) {
      console.warn('Error calculating drive time:', error);
      // Don't penalize if we can't calculate
    }
  }

  // 6. Role/specialty matching
  if (job.jobType && tech.role) {
    const jobType = job.jobType.toLowerCase();
    const techRole = tech.role.toLowerCase();

    // Demo techs are better for demo jobs
    if (jobType.includes('demo') && techRole.includes('demo')) {
      score += 15;
      reasons.push('Specialty match (Demo Tech)');
    }

    // Lead techs are good for installs
    if (jobType.includes('install') && techRole.includes('lead')) {
      score += 10;
      reasons.push('Good fit (Lead Tech for install)');
    }

    // Service techs are good for service calls
    if (jobType.includes('service') && techRole.includes('service')) {
      score += 10;
      reasons.push('Specialty match (Service)');
    }
  }

  // 7. Job history (if provided)
  if (options.jobHistory) {
    const techHistory = options.jobHistory[tech.id] || {};
    const jobTypeHistory = techHistory[job.jobType] || { count: 0, avgDuration: 0 };

    if (jobTypeHistory.count > 5) {
      score += 10;
      reasons.push(`Experienced (${jobTypeHistory.count} similar jobs this month)`);
    } else if (jobTypeHistory.count > 2) {
      score += 5;
      reasons.push(`${jobTypeHistory.count} similar jobs this month`);
    }
  }

  // 8. Two-tech job handling
  if (job.requiresTwoTechs && !tech.isDemoTech && !tech.role?.toLowerCase().includes('demo')) {
    // Lead tech is needed for 2-person jobs
    score += 5;
    reasons.push('Can lead 2-person job');
  }

  // Clamp score between 0-100
  score = Math.max(0, Math.min(100, score));

  return {
    score: Math.round(score),
    reasons,
    driveTime,
    distance,
    disqualified: false,
    currentHours,
    totalHoursAfter
  };
};

/**
 * Get ranked tech recommendations for a job
 * @param {Object} job - Job object
 * @param {Array} techs - Array of all techs
 * @param {Object} routes - Current routes
 * @param {Object} scheduleForDay - Schedule for the day
 * @param {Object} options - Additional options
 * @returns {Promise<Array>} - Sorted array of { tech, score, reasons, driveTime, distance }
 */
export const getTechRecommendations = async (job, techs, routes, scheduleForDay = null, options = {}) => {
  const limit = options.limit || 5;

  // Score all techs in parallel
  const scoredTechs = await Promise.all(
    techs.map(async (tech) => {
      const result = await calculateTechScore(tech, job, routes, scheduleForDay, options);
      return {
        tech,
        ...result
      };
    })
  );

  // Filter out disqualified techs and sort by score
  const qualified = scoredTechs
    .filter(st => !st.disqualified && st.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return qualified;
};

/**
 * Build job history for scoring
 * @param {Object} routes - All routes (historical)
 * @returns {Object} - { techId: { jobType: { count, avgDuration } } }
 */
export const buildJobHistory = (routes) => {
  const history = {};

  // This would ideally pull from historical data
  // For now, we'll track current assignments
  Object.entries(routes).forEach(([techId, route]) => {
    if (!history[techId]) {
      history[techId] = {};
    }

    route.jobs?.forEach(job => {
      const jobType = job.jobType;
      if (!history[techId][jobType]) {
        history[techId][jobType] = { count: 0, totalDuration: 0, avgDuration: 0 };
      }

      history[techId][jobType].count += 1;
      history[techId][jobType].totalDuration += job.duration || 0;
      history[techId][jobType].avgDuration =
        history[techId][jobType].totalDuration / history[techId][jobType].count;
    });
  });

  return history;
};
