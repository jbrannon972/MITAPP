// Time constants (in minutes)
export const DEFAULT_TRAVEL_TIME = 30;
export const FALLBACK_TRAVEL_TIME = 20;
export const SHIFT_START_TIME = '08:15';
export const FIRST_SHIFT_START_HOUR = 8;
export const SECOND_SHIFT_START_HOUR = 14;
export const OFFICE_RETURN_BUFFER = 30;

// Map configuration
export const HOUSTON_CENTER = [-95.5698, 30.1945];
export const DEFAULT_MAP_ZOOM = 10;

// Office coordinates (fallback if geocoding fails)
export const OFFICE_COORDINATES = {
  office_1: { lng: -95.4559, lat: 30.3119, name: 'Conroe Office' }, // Conroe
  office_2: { lng: -95.6508, lat: 29.7858, name: 'Katy Office' }     // Katy
};

// Status types
export const OFF_STATUSES = ['off', 'vacation', 'sick', 'no-call-no-show'];

// Job type colors
export const JOB_TYPE_COLORS = {
  install: 'var(--purple-color)',
  'demo prep': 'var(--warning-color)',
  'demo-prep': 'var(--warning-color)',
  demo: 'var(--danger-color)',
  check: 'var(--info-color)',
  service: 'var(--info-color)',
  pull: 'var(--success-color)',
  'fs visit': '#14b8a6',
  'fs-visit': '#14b8a6',
  default: 'var(--text-secondary)'
};

// Time formats
export const TIME_SLOT_INTERVAL_MINUTES = 15; // Round times to 15-minute intervals
export const TIMELINE_START_HOUR = 7;
export const TIMELINE_END_HOUR = 20;
export const PIXELS_PER_HOUR = 80;

// Debounce delays (in milliseconds)
export const GEOCODE_DEBOUNCE_DELAY = 300;
export const ROUTE_CALCULATION_DEBOUNCE_DELAY = 500;
export const STATE_UPDATE_DEBOUNCE_DELAY = 100;

// API limits
export const MAX_CONCURRENT_GEOCODE_REQUESTS = 5;
export const MAX_MAPBOX_ADDRESSES_PER_REQUEST = 25;

// Error messages
export const ERROR_MESSAGES = {
  GEOCODE_FAILED: 'Unable to find address location. Please verify the address is correct.',
  MAPBOX_TOKEN_MISSING: 'Mapbox API token is required. Please configure it in settings.',
  OPTIMIZATION_FAILED: 'Route optimization failed. Please try again or assign routes manually.',
  TIMEFRAME_VIOLATION: 'Job cannot be completed within its timeframe window.',
  NO_JOBS_TO_OPTIMIZE: 'No unassigned jobs to optimize.',
  SAVE_FAILED: 'Failed to save changes. Please check your connection and try again.',
  CALENDAR_PUSH_FAILED: 'Failed to push routes to calendar. Please check permissions and try again.'
};

// Success messages
export const SUCCESS_MESSAGES = {
  ROUTES_OPTIMIZED: 'Routes successfully optimized!',
  CALENDAR_PUSHED: 'Routes successfully pushed to Google Calendar!',
  JOBS_IMPORTED: 'Jobs successfully imported!',
  TOKEN_SAVED: 'Token saved successfully!'
};
