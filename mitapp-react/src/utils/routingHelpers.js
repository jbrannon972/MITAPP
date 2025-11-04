import { JOB_TYPE_COLORS, ERROR_MESSAGES } from './routingConstants';

/**
 * Debounce function to limit how often a function can be called
 * @param {Function} func - The function to debounce
 * @param {number} wait - The delay in milliseconds
 * @returns {Function} - Debounced function
 */
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Throttle function to limit how often a function can be called
 * @param {Function} func - The function to throttle
 * @param {number} limit - The minimum time between calls in milliseconds
 * @returns {Function} - Throttled function
 */
export const throttle = (func, limit) => {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

/**
 * Get color for a job type
 * @param {string} jobType - The job type
 * @returns {string} - CSS color variable or hex color
 */
export const getJobTypeColor = (jobType) => {
  if (!jobType) return JOB_TYPE_COLORS.default;

  const type = jobType.toLowerCase();

  // Check exact matches first
  if (JOB_TYPE_COLORS[type]) {
    return JOB_TYPE_COLORS[type];
  }

  // Check partial matches
  if (type.includes('install')) return JOB_TYPE_COLORS.install;
  if (type.includes('demo prep') || type.includes('demo-prep')) return JOB_TYPE_COLORS['demo prep'];
  if (type.includes('demo') && !type.includes('prep') && !type.includes('check')) return JOB_TYPE_COLORS.demo;
  if (type.includes('check') || type.includes('service')) return JOB_TYPE_COLORS.service;
  if (type.includes('pull')) return JOB_TYPE_COLORS.pull;
  if (type.includes('fs visit') || type.includes('fs-visit')) return JOB_TYPE_COLORS['fs visit'];

  return JOB_TYPE_COLORS.default;
};

/**
 * Safely execute an async function with error handling
 * @param {Function} asyncFunc - The async function to execute
 * @param {string} errorMessage - Custom error message
 * @param {Function} onError - Optional error callback
 * @returns {Promise} - Result or null if error
 */
export const safeAsync = async (asyncFunc, errorMessage, onError = null) => {
  try {
    return await asyncFunc();
  } catch (error) {
    console.error(errorMessage, error);

    if (onError) {
      onError(error);
    } else {
      alert(`${errorMessage}\n\nDetails: ${error.message}`);
    }

    return null;
  }
};

/**
 * Safely access localStorage with error handling
 * @param {string} key - The localStorage key
 * @param {string} defaultValue - Default value if key doesn't exist or error
 * @returns {string} - The value or default
 */
export const safeGetLocalStorage = (key, defaultValue = '') => {
  try {
    return localStorage.getItem(key) || defaultValue;
  } catch (error) {
    console.error(`Error reading from localStorage (${key}):`, error);
    return defaultValue;
  }
};

/**
 * Safely set localStorage with error handling
 * @param {string} key - The localStorage key
 * @param {string} value - The value to store
 * @returns {boolean} - Success status
 */
export const safeSetLocalStorage = (key, value) => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (error.name === 'QuotaExceededError') {
      console.error('localStorage quota exceeded');
      alert('Storage quota exceeded. Please clear browser data and try again.');
    } else {
      console.error(`Error writing to localStorage (${key}):`, error);
    }
    return false;
  }
};

/**
 * Batch async operations with a concurrency limit
 * @param {Array} items - Items to process
 * @param {Function} asyncFunc - Async function to apply to each item
 * @param {number} concurrency - Max concurrent operations
 * @returns {Promise<Array>} - Array of results
 */
export const batchAsync = async (items, asyncFunc, concurrency = 5) => {
  const results = [];
  const executing = [];

  for (const [index, item] of items.entries()) {
    const promise = asyncFunc(item, index).then(result => {
      results[index] = result;
      executing.splice(executing.indexOf(promise), 1);
      return result;
    });

    executing.push(promise);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
};

/**
 * Retry an async operation with exponential backoff
 * @param {Function} asyncFunc - The async function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in milliseconds
 * @returns {Promise} - Result of the operation
 */
export const retryWithBackoff = async (asyncFunc, maxRetries = 3, baseDelay = 1000) => {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await asyncFunc();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
};

/**
 * Check if a tech is marked as off for the day
 * @param {string} techId - Tech ID
 * @param {object} scheduleForDay - Schedule data for the day
 * @returns {boolean} - True if tech is off
 */
export const isTechOff = (techId, scheduleForDay) => {
  if (!scheduleForDay || !scheduleForDay.staff) return false;

  const staffEntry = scheduleForDay.staff.find(s => s.id === techId);
  if (!staffEntry) return false;

  const offStatuses = ['off', 'vacation', 'sick', 'no-call-no-show'];
  return offStatuses.includes(staffEntry.status?.toLowerCase());
};

/**
 * Format time from minutes since midnight
 * @param {number} minutes - Minutes since midnight
 * @returns {string} - Formatted time HH:MM
 */
export const minutesToTime = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

/**
 * Parse time string to minutes since midnight
 * @param {string} timeStr - Time string HH:MM
 * @returns {number} - Minutes since midnight
 */
export const timeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

/**
 * Convert 24-hour time to 12-hour AM/PM format
 * @param {string} timeStr - Time string in HH:MM format (24-hour)
 * @returns {string} - Formatted time in 12-hour format (e.g., "5:30 PM")
 */
export const formatTimeAMPM = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return '';

  const [hours24, minutes] = timeStr.split(':').map(Number);

  if (isNaN(hours24) || isNaN(minutes)) return timeStr;

  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12; // Convert 0 to 12 for midnight
  const mins = String(minutes).padStart(2, '0');

  return `${hours12}:${mins} ${period}`;
};

/**
 * Format time from minutes since midnight to 12-hour AM/PM format
 * @param {number} minutes - Minutes since midnight
 * @returns {string} - Formatted time in 12-hour format (e.g., "5:30 PM")
 */
export const minutesToTimeAMPM = (minutes) => {
  const time24 = minutesToTime(minutes);
  return formatTimeAMPM(time24);
};

/**
 * Validate CSV file before parsing
 * @param {File} file - The file to validate
 * @returns {object} - { valid: boolean, error: string }
 */
export const validateCSVFile = (file) => {
  if (!file) {
    return { valid: false, error: 'No file selected' };
  }

  if (!file.name.endsWith('.csv')) {
    return { valid: false, error: 'File must be a CSV (.csv extension)' };
  }

  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    return { valid: false, error: 'File size exceeds 10MB limit' };
  }

  return { valid: true, error: null };
};

/**
 * Deep comparison of two objects (non-recursive for safety)
 * @param {any} obj1 - First object
 * @param {any} obj2 - Second object
 * @returns {boolean} - True if equal
 */
export const shallowEqual = (obj1, obj2) => {
  if (obj1 === obj2) return true;
  if (obj1 == null || obj2 == null) return false;
  if (typeof obj1 !== 'object' || typeof obj2 !== 'object') return obj1 === obj2;

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) return false;

  for (const key of keys1) {
    if (obj1[key] !== obj2[key]) return false;
  }

  return true;
};

/**
 * Create a stable key for memoization based on objects
 * @param {...any} args - Arguments to create key from
 * @returns {string} - Stable key
 */
export const createMemoKey = (...args) => {
  return JSON.stringify(args.map(arg => {
    if (typeof arg === 'object' && arg !== null) {
      // Sort object keys for stable stringification
      const sorted = {};
      Object.keys(arg).sort().forEach(key => {
        sorted[key] = arg[key];
      });
      return sorted;
    }
    return arg;
  }));
};

/**
 * Calculate route summary statistics
 * @param {Array} jobs - Array of job objects
 * @returns {object} - { totalDuration, totalJobs, requiresTwoTechsCount }
 */
export const calculateRouteSummary = (jobs = []) => {
  return jobs.reduce((acc, job) => {
    acc.totalDuration += job.duration || 0;
    acc.totalJobs += 1;
    if (job.requiresTwoTechs) {
      acc.requiresTwoTechsCount += 1;
    }
    return acc;
  }, { totalDuration: 0, totalJobs: 0, requiresTwoTechsCount: 0 });
};

/**
 * Sanitize route data to ensure consistency between jobs and routes
 * Removes orphaned jobs from routes and syncs assignedTech fields
 * @param {Array} jobs - Array of job objects
 * @param {object} routes - Routes object keyed by techId
 * @returns {object} - { sanitizedJobs, sanitizedRoutes }
 */
export const sanitizeRouteData = (jobs, routes) => {
  console.log('🧹 Sanitizing route data...');
  const jobMap = new Map(jobs.map(j => [j.id, j]));
  const sanitizedJobs = [...jobs];
  const sanitizedRoutes = { ...routes };

  // First pass: update assignedTech on jobs and clean up routes
  for (const techId in sanitizedRoutes) {
    const route = sanitizedRoutes[techId];
    if (!route?.jobs) continue;

    // Filter out jobs that don't exist anymore and update assignedTech
    const validJobs = route.jobs.filter(routeJob => {
      const job = jobMap.get(routeJob.id);
      if (!job) {
        console.log(`⚠️ Removing orphaned job ${routeJob.id} from route ${techId}`);
        return false;
      }

      // Update assignedTech on the job object
      const jobIndex = sanitizedJobs.findIndex(j => j.id === job.id);
      if (jobIndex !== -1 && sanitizedJobs[jobIndex].assignedTech !== techId) {
        console.log(`✓ Syncing job ${job.id} assignment to tech ${techId}`);
        sanitizedJobs[jobIndex] = { ...sanitizedJobs[jobIndex], assignedTech: techId };
      }

      return true;
    });

    sanitizedRoutes[techId] = { ...route, jobs: validJobs };
  }

  // CRITICAL FIX: Build jobsInRoutes Set AFTER filtering orphaned jobs
  // This ensures deleted jobs are not considered "in routes"
  const jobsInRoutes = new Set();
  for (const techId in sanitizedRoutes) {
    const route = sanitizedRoutes[techId];
    if (route?.jobs) {
      route.jobs.forEach(job => jobsInRoutes.add(job.id));
    }
  }

  // Second pass: clear assignedTech from jobs not in any route
  for (let i = 0; i < sanitizedJobs.length; i++) {
    const job = sanitizedJobs[i];
    if (job.assignedTech && !jobsInRoutes.has(job.id)) {
      console.log(`⚠️ Clearing stale assignment for job ${job.id}`);
      sanitizedJobs[i] = { ...job, assignedTech: null };
    }
  }

  console.log('✅ Data sanitization complete');
  return { sanitizedJobs, sanitizedRoutes };
};
