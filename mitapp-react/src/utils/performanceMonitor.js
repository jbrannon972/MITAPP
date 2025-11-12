/**
 * Performance Monitoring Utilities
 * Provides easy-to-use helpers for tracking performance of key operations
 */
import { trace } from 'firebase/performance';
import { perf } from '../config/firebase';

/**
 * Start a performance trace
 * @param {string} traceName - Name of the trace (e.g., 'csv_import', 'auto_optimize')
 * @returns {Object} Trace object with stop() and putMetric() methods
 */
export const startTrace = (traceName) => {
  try {
    const traceObj = trace(perf, traceName);
    traceObj.start();
    console.log(`⏱️ Started performance trace: ${traceName}`);
    return traceObj;
  } catch (error) {
    console.error('Failed to start trace:', error);
    // Return a mock trace object if Firebase Performance fails
    return {
      stop: () => {},
      putMetric: () => {},
      putAttribute: () => {}
    };
  }
};

/**
 * Measure the performance of an async operation
 * @param {string} traceName - Name of the trace
 * @param {Function} operation - Async function to measure
 * @param {Object} metrics - Optional custom metrics to track
 * @returns {Promise} Result of the operation
 */
export const measureOperation = async (traceName, operation, metrics = {}) => {
  const traceObj = startTrace(traceName);
  const startTime = performance.now();

  try {
    const result = await operation();
    const duration = performance.now() - startTime;

    // Add custom metrics
    Object.entries(metrics).forEach(([key, value]) => {
      traceObj.putMetric(key, value);
    });

    // Add duration metric
    traceObj.putMetric('duration_ms', Math.round(duration));

    console.log(`✅ ${traceName} completed in ${duration.toFixed(0)}ms`);

    traceObj.stop();
    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(`❌ ${traceName} failed after ${duration.toFixed(0)}ms:`, error);

    // Track failure
    traceObj.putMetric('duration_ms', Math.round(duration));
    traceObj.putAttribute('error', error.message || 'Unknown error');

    traceObj.stop();
    throw error;
  }
};

/**
 * Track a user interaction (click, drag, etc.)
 * @param {string} interactionName - Name of the interaction
 * @param {Function} handler - Function to execute
 */
export const trackInteraction = async (interactionName, handler) => {
  return measureOperation(`interaction_${interactionName}`, handler);
};

/**
 * Pre-defined trace names for common operations
 */
export const TRACE_NAMES = {
  // CSV Operations
  CSV_IMPORT: 'csv_import',
  CSV_PARSE: 'csv_parse',
  CSV_VALIDATE: 'csv_validate',

  // Route Optimization
  AUTO_OPTIMIZE: 'auto_optimize',
  ROUTE_OPTIMIZE: 'route_optimize_single_tech',
  GEOCODE_BATCH: 'geocode_batch',
  BALANCE_WORKLOAD: 'balance_workload',

  // Calendar Operations
  CALENDAR_PUSH: 'calendar_push_all',
  CALENDAR_PUSH_TECH: 'calendar_push_single_tech',

  // Job Operations
  ASSIGN_JOB: 'assign_job_to_tech',
  UNASSIGN_JOB: 'unassign_job',
  REORDER_JOBS: 'reorder_jobs',

  // Firebase Operations
  FIREBASE_SAVE_JOBS: 'firebase_save_jobs',
  FIREBASE_SAVE_ROUTES: 'firebase_save_routes',
  FIREBASE_LOAD_JOBS: 'firebase_load_jobs',
  FIREBASE_LOAD_ROUTES: 'firebase_load_routes',

  // Page Load
  PAGE_LOAD: 'routing_page_load',
  PAGE_INTERACTIVE: 'routing_page_interactive'
};

/**
 * Log custom performance metrics to console
 * Useful for debugging and development
 */
export class PerformanceLogger {
  constructor() {
    this.metrics = {};
  }

  startTimer(name) {
    this.metrics[name] = {
      start: performance.now(),
      end: null,
      duration: null
    };
  }

  endTimer(name) {
    if (this.metrics[name]) {
      this.metrics[name].end = performance.now();
      this.metrics[name].duration = this.metrics[name].end - this.metrics[name].start;
      console.log(`⏱️ ${name}: ${this.metrics[name].duration.toFixed(2)}ms`);
      return this.metrics[name].duration;
    }
    console.warn(`⚠️ Timer '${name}' was not started`);
    return 0;
  }

  getMetrics() {
    return this.metrics;
  }

  getSummary() {
    const summary = {};
    Object.entries(this.metrics).forEach(([name, data]) => {
      if (data.duration !== null) {
        summary[name] = `${data.duration.toFixed(2)}ms`;
      }
    });
    return summary;
  }

  reset() {
    this.metrics = {};
  }

  logSummary() {
    console.group('📊 Performance Summary');
    Object.entries(this.getSummary()).forEach(([name, duration]) => {
      console.log(`${name}: ${duration}`);
    });
    console.groupEnd();
  }
}

// Create a singleton instance for global use
export const perfLogger = new PerformanceLogger();
