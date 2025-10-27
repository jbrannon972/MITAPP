/**
 * Google Calendar Service
 * Handles integration with Google Calendar API for pushing routes to technician calendars
 * Updated to use Google Identity Services (GIS) - the new authentication library
 */

const CALENDAR_API_URL = 'https://www.googleapis.com/calendar/v3';

class GoogleCalendarService {
  constructor() {
    this.accessToken = null;
    this.isInitialized = false;
    this.tokenClient = null;
    this.clientId = null;
  }

  /**
   * Initialize the Google API client with new Google Identity Services
   * This should be called when the app loads
   */
  async initialize(clientId) {
    if (this.isInitialized) return;

    if (!clientId || clientId.trim() === '') {
      throw new Error('Google Client ID is required. Please configure it in the routing tab.');
    }

    this.clientId = clientId;

    return new Promise((resolve, reject) => {
      // Load both the GIS library and gapi client library
      const loadGIS = new Promise((res, rej) => {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.onload = res;
        script.onerror = () => rej(new Error('Failed to load Google Identity Services script'));
        document.head.appendChild(script);
      });

      const loadGAPI = new Promise((res, rej) => {
        const script = document.createElement('script');
        script.src = 'https://apis.google.com/js/api.js';
        script.onload = () => {
          window.gapi.load('client', res);
        };
        script.onerror = () => rej(new Error('Failed to load Google API script'));
        document.head.appendChild(script);
      });

      Promise.all([loadGIS, loadGAPI])
        .then(async () => {
          try {
            // Initialize gapi client for Calendar API
            await window.gapi.client.init({
              apiKey: '', // API key not needed for OAuth
              discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest']
            });

            // Initialize the token client for OAuth
            this.tokenClient = window.google.accounts.oauth2.initTokenClient({
              client_id: clientId,
              scope: 'https://www.googleapis.com/auth/calendar.events',
              callback: '', // Will be set dynamically when requesting token
            });

            this.isInitialized = true;
            console.log('Google Calendar API initialized successfully with GIS');
            resolve();
          } catch (error) {
            console.error('Error initializing Google API:', error);
            let errorMessage = 'Failed to initialize Google Calendar API. ';

            if (error.details) {
              errorMessage += error.details;
            } else if (error.error) {
              errorMessage += error.error;
            } else {
              errorMessage += 'Please check your Client ID configuration in Google Cloud Console.';
            }

            reject(new Error(errorMessage));
          }
        })
        .catch(reject);
    });
  }

  /**
   * Request access token using new GIS flow
   */
  async signIn() {
    if (!this.isInitialized) {
      throw new Error('Google Calendar service not initialized');
    }

    return new Promise((resolve, reject) => {
      try {
        // Set the callback for when we receive the token
        this.tokenClient.callback = (response) => {
          if (response.error) {
            reject(new Error(response.error));
            return;
          }

          this.accessToken = response.access_token;
          console.log('Successfully obtained access token');
          resolve(response);
        };

        // Request the token - this will show Google's OAuth popup
        this.tokenClient.requestAccessToken({ prompt: 'consent' });
      } catch (error) {
        console.error('Error signing in to Google:', error);
        reject(error);
      }
    });
  }

  /**
   * Check if user has a valid access token
   */
  isSignedIn() {
    return !!this.accessToken;
  }

  /**
   * Clear the access token (sign out)
   */
  async signOut() {
    if (this.accessToken) {
      // Revoke the token
      window.google.accounts.oauth2.revoke(this.accessToken, () => {
        console.log('Access token revoked');
      });
      this.accessToken = null;
    }
  }

  /**
   * Create a calendar event for a job
   * @param {string} calendarId - Email/ID of the calendar (tech's email)
   * @param {object} job - Job details
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {object} techInfo - Technician information
   * @returns {Promise} Created event
   */
  async createJobEvent(calendarId, job, date, techInfo) {
    if (!this.isSignedIn()) {
      throw new Error('Not signed in to Google Calendar');
    }

    const startDateTime = `${date}T${job.startTime || job.timeframeStart}:00`;
    const endDateTime = `${date}T${job.endTime || job.timeframeEnd}:00`;

    const event = {
      summary: `${job.jobType} - ${job.customerName}`,
      location: job.address,
      description: this.buildEventDescription(job, techInfo),
      start: {
        dateTime: startDateTime,
        timeZone: 'America/Chicago' // Houston timezone
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'America/Chicago'
      },
      colorId: this.getEventColorForJobType(job.jobType),
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 30 },
          { method: 'popup', minutes: 10 }
        ]
      },
      extendedProperties: {
        private: {
          jobId: job.id,
          jobType: job.jobType,
          duration: job.duration.toString(),
          requiresTwoTechs: job.requiresTwoTechs ? 'true' : 'false'
        }
      }
    };

    try {
      const response = await window.gapi.client.calendar.events.insert({
        calendarId: calendarId,
        resource: event,
        sendUpdates: 'all'
      });

      return response.result;
    } catch (error) {
      console.error('Error creating calendar event:', error);
      throw error;
    }
  }

  /**
   * Build detailed event description
   */
  buildEventDescription(job, techInfo) {
    let description = `Job Details:\n\n`;
    description += `Customer: ${job.customerName}\n`;
    description += `Address: ${job.address}\n`;
    description += `Job Type: ${job.jobType}\n`;
    description += `Duration: ${job.duration} hours\n`;

    if (job.timeframeStart && job.timeframeEnd) {
      description += `Timeframe Window: ${job.timeframeStart} - ${job.timeframeEnd}\n`;
    }

    if (job.requiresTwoTechs) {
      description += `⚠️ Requires 2 Technicians\n`;
    }

    if (job.demoTech) {
      description += `Demo Tech: ${job.demoTech}\n`;
    }

    if (job.travelTime) {
      description += `\nDrive Time: ${job.travelTime} minutes\n`;
    }

    if (job.phone) {
      description += `\nCustomer Phone: ${job.phone}\n`;
    }

    if (job.description) {
      description += `\nNotes: ${job.description}\n`;
    }

    description += `\n---\nAssigned to: ${techInfo.name}\n`;
    description += `Zone: ${techInfo.zone}\n`;

    return description;
  }

  /**
   * Get Google Calendar color ID for job type
   * https://developers.google.com/calendar/api/v3/reference/colors
   */
  getEventColorForJobType(jobType) {
    const type = jobType.toLowerCase();
    if (type.includes('install')) return '9'; // Blue
    if (type.includes('demo prep')) return '6'; // Orange
    if (type.includes('demo')) return '11'; // Red
    if (type.includes('service') || type.includes('repair')) return '7'; // Cyan
    if (type.includes('maintenance')) return '10'; // Green
    if (type.includes('inspection')) return '5'; // Yellow
    return '8'; // Gray default
  }

  /**
   * Push all jobs for a tech to their calendar
   * @param {object} tech - Technician info with calendar email
   * @param {array} jobs - Array of jobs to add
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<{success: number, failed: number, errors: array}>}
   */
  async pushTechRoute(tech, jobs, date) {
    if (!tech.email) {
      throw new Error(`No email configured for ${tech.name}`);
    }

    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    for (const job of jobs) {
      try {
        await this.createJobEvent(tech.email, job, date, tech);
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          job: job.customerName,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Push all routes to all techs' calendars
   * @param {object} routes - Routes object with tech IDs as keys
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<object>} Summary of push results
   */
  async pushAllRoutes(routes, date) {
    if (!this.isSignedIn()) {
      await this.signIn();
    }

    const summary = {
      totalTechs: 0,
      totalJobs: 0,
      successfulJobs: 0,
      failedJobs: 0,
      techResults: []
    };

    for (const [techId, route] of Object.entries(routes)) {
      if (!route.jobs || route.jobs.length === 0) continue;

      summary.totalTechs++;
      summary.totalJobs += route.jobs.length;

      const techResult = {
        techName: route.tech.name,
        email: route.tech.email,
        jobCount: route.jobs.length,
        success: 0,
        failed: 0,
        errors: []
      };

      try {
        const results = await this.pushTechRoute(route.tech, route.jobs, date);
        techResult.success = results.success;
        techResult.failed = results.failed;
        techResult.errors = results.errors;

        summary.successfulJobs += results.success;
        summary.failedJobs += results.failed;
      } catch (error) {
        techResult.failed = route.jobs.length;
        techResult.errors.push({ error: error.message });
        summary.failedJobs += route.jobs.length;
      }

      summary.techResults.push(techResult);
    }

    return summary;
  }

  /**
   * Delete all events for a specific date (cleanup function)
   * @param {string} calendarId - Calendar to clean
   * @param {string} date - Date in YYYY-MM-DD format
   */
  async deleteEventsForDate(calendarId, date) {
    if (!this.isSignedIn()) {
      throw new Error('Not signed in to Google Calendar');
    }

    const timeMin = `${date}T00:00:00-06:00`;
    const timeMax = `${date}T23:59:59-06:00`;

    try {
      const response = await window.gapi.client.calendar.events.list({
        calendarId: calendarId,
        timeMin: timeMin,
        timeMax: timeMax,
        singleEvents: true,
        orderBy: 'startTime'
      });

      const events = response.result.items || [];
      const deletePromises = events.map(event =>
        window.gapi.client.calendar.events.delete({
          calendarId: calendarId,
          eventId: event.id
        })
      );

      await Promise.all(deletePromises);
      return events.length;
    } catch (error) {
      console.error('Error deleting events:', error);
      throw error;
    }
  }
}

// Create singleton instance
const googleCalendarService = new GoogleCalendarService();

export default googleCalendarService;
