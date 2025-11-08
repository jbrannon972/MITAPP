/**
 * Data Validation Utilities
 * Comprehensive validation for routing data to prevent bugs and crashes
 */

/**
 * Convert AM/PM time format to 24-hour format
 * @param {string} timeStr - Time string (e.g., "12p", "6p", "12:00pm", "6:00AM")
 * @returns {string} - 24-hour format time (e.g., "12:00", "18:00") or original if not AM/PM
 */
export const convertAMPMTo24Hour = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return timeStr;

  const trimmed = timeStr.trim().toLowerCase();

  // Check for AM/PM indicators (a, p, am, pm)
  const ampmRegex = /^(\d{1,2})(?::(\d{2}))?\s*(a|p|am|pm)$/i;
  const match = trimmed.match(ampmRegex);

  if (!match) return timeStr; // Not AM/PM format, return as-is

  let hours = parseInt(match[1], 10);
  const minutes = match[2] || '00';
  const meridiem = match[3].toLowerCase();

  // Validate minutes
  const mins = parseInt(minutes, 10);
  if (mins < 0 || mins > 59) return timeStr;

  // Convert to 24-hour
  const isPM = meridiem === 'p' || meridiem === 'pm';
  const isAM = meridiem === 'a' || meridiem === 'am';

  if (isPM) {
    // 12pm stays 12, 1pm-11pm becomes 13-23
    if (hours !== 12) {
      hours += 12;
    }
  } else if (isAM) {
    // 12am becomes 00, 1am-11am stays 1-11
    if (hours === 12) {
      hours = 0;
    }
  }

  // Validate final hour range
  if (hours < 0 || hours > 23) return timeStr;

  return `${String(hours).padStart(2, '0')}:${minutes}`;
};

/**
 * Normalize time format from h:mm or hh:mm to HH:MM
 * Also handles AM/PM format conversion
 * @param {string} timeStr - Time string (e.g., "9:00", "09:00", "12p", "6:00pm")
 * @returns {string} - Normalized time in HH:MM format (e.g., "09:00")
 */
export const normalizeTimeFormat = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return timeStr;

  // First try to convert AM/PM format
  const converted = convertAMPMTo24Hour(timeStr);

  // If it was AM/PM and converted, return it
  if (converted !== timeStr) {
    return converted;
  }

  // Accept both h:mm and hh:mm formats
  const timeRegex = /^(\d{1,2}):([0-5]\d)$/;
  const match = converted.trim().match(timeRegex);

  if (!match) return converted; // Return as-is if invalid format

  const hours = parseInt(match[1], 10);
  const minutes = match[2];

  // Validate hour range
  if (hours < 0 || hours > 23) return converted;

  // Pad hours to 2 digits
  return `${String(hours).padStart(2, '0')}:${minutes}`;
};

/**
 * Parse a timeframe string (e.g., from TF() in CSV) with smart AM/PM inference
 * Handles cases like "12-6 PM", "12-6", "12p-6p", "8:00-17:00"
 * @param {string} tfContent - Content inside TF() (e.g., "12-6 PM", "8-5")
 * @returns {object} - { start: string, end: string } in HH:MM format, or { start: null, end: null } if invalid
 */
export const parseTimeframeString = (tfContent) => {
  if (!tfContent || typeof tfContent !== 'string') {
    return { start: null, end: null };
  }

  const trimmed = tfContent.trim();

  // Split on dash (handle spaces around dash)
  const parts = trimmed.split(/\s*-\s*/);
  if (parts.length !== 2) {
    return { start: null, end: null };
  }

  let [startPart, endPart] = parts;

  // Check if there's an AM/PM indicator on each part
  const ampmRegex = /\s*(am|pm|a|p)$/i;

  const endHasAMPM = ampmRegex.test(endPart);
  const startHasAMPM = ampmRegex.test(startPart);

  // Case 1: Neither has AM/PM - infer based on common work hours
  if (!startHasAMPM && !endHasAMPM) {
    // Extract numeric hours
    const startMatch = startPart.match(/^(\d{1,2}):?(\d{2})?$/);
    const endMatch = endPart.match(/^(\d{1,2}):?(\d{2})?$/);

    if (!startMatch || !endMatch) {
      return { start: null, end: null };
    }

    const startHour = parseInt(startMatch[1], 10);
    const startMin = startMatch[2] || '00';
    const endHour = parseInt(endMatch[1], 10);
    const endMin = endMatch[2] || '00';

    // Apply sensible defaults for common work hours
    if (startHour >= 7 && startHour <= 12 && endHour <= 6) {
      // Pattern: 8-5, 9-3, 12-6 → AM start, PM end (typical work day)
      startPart = `${startHour}:${startMin}`;
      endPart = `${endHour}:${endMin} PM`;
    } else if (startHour >= 1 && startHour <= 6 && endHour >= 1 && endHour <= 11) {
      // Pattern: 1-4, 2-5 → likely both PM (afternoon shift)
      startPart = `${startHour}:${startMin} PM`;
      endPart = `${endHour}:${endMin} PM`;
    } else {
      // Keep as-is, will be normalized to 24-hour
      startPart = `${startHour}:${startMin}`;
      endPart = `${endHour}:${endMin}`;
    }
  }
  // Case 2: Only end has AM/PM - apply to start based on logic
  else if (!startHasAMPM && endHasAMPM) {
    const endMeridiem = endPart.match(ampmRegex)[1];

    const startMatch = startPart.match(/^(\d{1,2}):?(\d{2})?$/);
    const endMatch = endPart.match(/^(\d{1,2}):?(\d{2})?/);

    if (!startMatch || !endMatch) {
      return { start: null, end: null };
    }

    const startHour = parseInt(startMatch[1], 10);
    const startMin = startMatch[2] || '00';
    const endHour = parseInt(endMatch[1], 10);

    // If start < end in clock terms, likely same period
    // Example: "12-6 PM" → 12pm-6pm
    if (startHour < endHour || (startHour === 12 && endHour < 12)) {
      startPart = `${startHour}:${startMin} ${endMeridiem}`;
    } else {
      // Different periods or same time - use same meridiem
      startPart = `${startHour}:${startMin} ${endMeridiem}`;
    }
  }
  // Case 3: Both have AM/PM - no inference needed, will be handled by normalizeTimeFormat

  // Now convert both parts using our existing normalization
  const start = normalizeTimeFormat(startPart);
  const end = normalizeTimeFormat(endPart);

  return { start, end };
};

/**
 * Validate time format (HH:MM or H:MM)
 * @param {string} timeStr - Time string to validate
 * @returns {boolean} - True if valid
 */
export const isValidTimeFormat = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return false;

  // Accept both h:mm (e.g., "9:00") and hh:mm (e.g., "09:00")
  const timeRegex = /^(\d{1,2}):([0-5]\d)$/;
  const match = timeStr.trim().match(timeRegex);

  if (!match) return false;

  const hours = parseInt(match[1], 10);
  return hours >= 0 && hours <= 23;
};

/**
 * Validate that start time is before end time
 * @param {string} startTime - Start time HH:MM
 * @param {string} endTime - End time HH:MM
 * @returns {boolean} - True if start is before end
 */
export const isStartBeforeEnd = (startTime, endTime) => {
  if (!isValidTimeFormat(startTime) || !isValidTimeFormat(endTime)) return false;

  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);

  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  return startMinutes < endMinutes;
};

/**
 * Validate a complete job object
 * @param {object} job - Job object to validate
 * @returns {object} - { isValid: boolean, errors: string[] }
 */
export const validateJob = (job) => {
  const errors = [];

  // Required fields
  if (!job.id || job.id.trim() === '') {
    errors.push('Job ID is required');
  }

  if (!job.customerName || job.customerName.trim() === '') {
    errors.push('Customer name is required');
  }

  if (!job.address || job.address.trim() === '') {
    errors.push('Address is required');
  }

  // Time validation
  if (!job.timeframeStart) {
    errors.push('Start time is required');
  } else if (!isValidTimeFormat(job.timeframeStart)) {
    errors.push(`Invalid start time format: "${job.timeframeStart}" (expected HH:MM)`);
  }

  if (!job.timeframeEnd) {
    errors.push('End time is required');
  } else if (!isValidTimeFormat(job.timeframeEnd)) {
    errors.push(`Invalid end time format: "${job.timeframeEnd}" (expected HH:MM)`);
  }

  // Check time logic
  if (job.timeframeStart && job.timeframeEnd &&
      isValidTimeFormat(job.timeframeStart) && isValidTimeFormat(job.timeframeEnd)) {
    if (!isStartBeforeEnd(job.timeframeStart, job.timeframeEnd)) {
      errors.push(`Start time (${job.timeframeStart}) must be before end time (${job.timeframeEnd})`);
    }
  }

  // Duration validation
  if (job.duration !== undefined && job.duration !== null) {
    const duration = Number(job.duration);
    if (isNaN(duration)) {
      errors.push(`Invalid duration: "${job.duration}" (must be a number)`);
    } else if (duration <= 0) {
      errors.push(`Duration must be positive (got ${duration})`);
    } else if (duration > 24) {
      errors.push(`Duration seems unrealistic: ${duration} hours`);
    }
  }

  // Job type validation
  if (!job.jobType || job.jobType.trim() === '') {
    errors.push('Job type is required');
  }

  // Zone validation (optional but should be string if provided)
  if (job.zone !== undefined && job.zone !== null && typeof job.zone !== 'string') {
    errors.push(`Invalid zone type: ${typeof job.zone} (expected string)`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate multiple jobs and separate valid/invalid
 * @param {Array} jobs - Array of job objects
 * @returns {object} - { validJobs: [], invalidJobs: [{job, errors}], stats: {} }
 */
export const validateJobs = (jobs) => {
  const validJobs = [];
  const invalidJobs = [];

  jobs.forEach((job, index) => {
    const { isValid, errors } = validateJob(job);

    if (isValid) {
      validJobs.push(job);
    } else {
      invalidJobs.push({
        job,
        errors,
        index,
        id: job.id || `row_${index + 1}`
      });
    }
  });

  return {
    validJobs,
    invalidJobs,
    stats: {
      total: jobs.length,
      valid: validJobs.length,
      invalid: invalidJobs.length,
      successRate: jobs.length > 0 ? (validJobs.length / jobs.length * 100).toFixed(1) : 0
    }
  };
};

/**
 * Validate route data structure
 * @param {object} route - Route object to validate
 * @returns {object} - { isValid: boolean, errors: string[] }
 */
export const validateRoute = (route) => {
  const errors = [];

  if (!route.tech) {
    errors.push('Route must have a tech assigned');
  } else {
    if (!route.tech.id) errors.push('Tech must have an ID');
    if (!route.tech.name) errors.push('Tech must have a name');
  }

  if (!route.jobs || !Array.isArray(route.jobs)) {
    errors.push('Route must have a jobs array');
  } else {
    // Validate each job in the route
    route.jobs.forEach((job, index) => {
      const { errors: jobErrors } = validateJob(job);
      if (jobErrors.length > 0) {
        errors.push(`Job ${index + 1} (${job.id}): ${jobErrors.join(', ')}`);
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Sanitize job data (fix common issues)
 * @param {object} job - Job object to sanitize
 * @returns {object} - Sanitized job
 */
export const sanitizeJob = (job) => {
  return {
    ...job,
    id: job.id?.toString().trim() || '',
    customerName: job.customerName?.toString().trim() || '',
    address: job.address?.toString().trim() || '',
    timeframeStart: normalizeTimeFormat(job.timeframeStart?.toString().trim() || ''),
    timeframeEnd: normalizeTimeFormat(job.timeframeEnd?.toString().trim() || ''),
    duration: Number(job.duration) || 1,
    jobType: job.jobType?.toString().trim() || 'Other',
    zone: job.zone?.toString().trim() || '',
    description: job.description?.toString().trim() || '',
    phone: job.phone?.toString().trim() || '',
    requiresTwoTechs: Boolean(job.requiresTwoTechs),
    status: job.status || 'unassigned',
    assignedTech: job.assignedTech || null
  };
};

/**
 * Format validation errors for display
 * @param {Array} invalidJobs - Array of invalid job objects with errors
 * @returns {string} - Formatted error message
 */
export const formatValidationErrors = (invalidJobs) => {
  if (invalidJobs.length === 0) return '';

  let message = `Found ${invalidJobs.length} invalid job(s):\n\n`;

  invalidJobs.slice(0, 5).forEach(({ id, errors }) => {
    message += `❌ ${id}:\n`;
    errors.forEach(error => {
      message += `   • ${error}\n`;
    });
    message += '\n';
  });

  if (invalidJobs.length > 5) {
    message += `... and ${invalidJobs.length - 5} more errors\n`;
  }

  return message;
};

/**
 * Check if job data has potentially dangerous values
 * @param {object} job - Job object
 * @returns {object} - { isSafe: boolean, warnings: string[] }
 */
export const checkJobSafety = (job) => {
  const warnings = [];

  // Check for SQL injection attempts
  const sqlPatterns = ['DROP TABLE', 'DELETE FROM', 'INSERT INTO', '--', ';--'];
  const checkSQLInjection = (str) => {
    if (!str) return false;
    return sqlPatterns.some(pattern =>
      str.toUpperCase().includes(pattern)
    );
  };

  if (checkSQLInjection(job.id)) warnings.push('Suspicious ID pattern detected');
  if (checkSQLInjection(job.customerName)) warnings.push('Suspicious name pattern detected');
  if (checkSQLInjection(job.address)) warnings.push('Suspicious address pattern detected');

  // Check for extremely long strings (potential DoS)
  if (job.customerName?.length > 200) warnings.push('Customer name is unusually long');
  if (job.address?.length > 500) warnings.push('Address is unusually long');
  if (job.description?.length > 5000) warnings.push('Description is unusually long');

  // Check for script injection
  const scriptPattern = /<script|javascript:|onerror=/i;
  if (scriptPattern.test(job.customerName)) warnings.push('Script detected in customer name');
  if (scriptPattern.test(job.description)) warnings.push('Script detected in description');

  return {
    isSafe: warnings.length === 0,
    warnings
  };
};

export default {
  validateJob,
  validateJobs,
  validateRoute,
  sanitizeJob,
  isValidTimeFormat,
  normalizeTimeFormat,
  convertAMPMTo24Hour,
  parseTimeframeString,
  isStartBeforeEnd,
  formatValidationErrors,
  checkJobSafety
};
