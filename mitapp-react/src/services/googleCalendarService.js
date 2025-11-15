/**
 * Google Calendar Service
 * Handles integration with Google Calendar API for pushing routes to technician calendars
 * Updated to use Google Identity Services (GIS) - the new authentication library
 */

import { getMapboxService } from './mapboxService';

const CALENDAR_API_URL = 'https://www.googleapis.com/calendar/v3';

// Houston office locations
const OFFICES = {
  office_1: {
    name: 'Conroe Office',
    address: '10491 Fussel Rd, Conroe, TX 77303'
  },
  office_2: {
    name: 'Katy Office',
    address: '5115 E 5th St, Katy, TX 77493'
  }
};

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

    // Parse route_title to create formatted calendar title
    // route_title format: "Customer Name | 25-12369-hou-vip-williams-villageplumbing | Demo | Z3"
    // Desired format: "Z3 | Demo | 25-12369-hou-vip-williams-villageplumbing"
    let eventTitle;
    if (job.route_title) {
      console.log(`📋 Parsing route_title: "${job.route_title}"`);
      const parts = job.route_title.split(' | ').map(p => p.trim());
      console.log(`📋 Split into ${parts.length} parts:`, parts);

      if (parts.length >= 4) {
        // parts[0] = Customer Name (skip)
        // parts[1] = Full job string (25-12369-hou-vip-williams-villageplumbing)
        // parts[2] = Job Type (Demo)
        // parts[3] = Zone (Z3)
        const fullString = parts[1];
        const jobType = parts[2];
        const zone = parts[3];
        eventTitle = `${zone} | ${jobType} | ${fullString}`;
        console.log(`✅ Created formatted title: "${eventTitle}"`);
      } else {
        // Fallback if route_title format is unexpected
        console.warn(`⚠️ Unexpected route_title format (${parts.length} parts), using as-is`);
        eventTitle = job.route_title;
      }
    } else {
      // Fallback to old format if route_title doesn't exist
      console.warn('⚠️ No route_title found, using fallback format');
      const zonePrefix = job.zone ? `[${job.zone}] ` : '';
      eventTitle = `${zonePrefix}${job.jobType} - ${job.customerName}`;
      console.log(`📋 Fallback title: "${eventTitle}"`);
    }

    const event = {
      summary: eventTitle,
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
      // Use default calendar color (tech's calendar color)
      reminders: {
        useDefault: false,
        overrides: [] // No reminders
      },
      extendedProperties: {
        private: {
          jobId: job.id,
          jobType: job.jobType,
          duration: job.duration.toString(),
          requiresTwoTechs: job.requiresTwoTechs ? 'true' : 'false',
          zone: job.zone || ''
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
   * Robust phone number formatter - converts phone numbers to clickable HTML links
   * Handles various formats including:
   * - (123) 456-7890
   * - 123-456-7890
   * - 123.456.7890
   * - 123 456 7890
   * - 1234567890
   * - +1 (123) 456-7890
   * - 1-123-456-7890
   * - And many more variations
   */
  formatPhoneNumbersToLinks(text) {
    if (!text) return text;

    // Comprehensive pattern to match various US phone number formats
    // Matches optional country code, area code with or without parens, and number with various separators
    const phonePattern = /(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?)(\d{3}[-.\s]?)(\d{4})\b/g;

    return text.replace(phonePattern, (match) => {
      // Extract only digits for the tel: link
      const digitsOnly = match.replace(/\D/g, '');

      // Ensure we have a valid phone number (10 or 11 digits)
      if (digitsOnly.length === 10 || digitsOnly.length === 11) {
        // Use the last 10 digits for the tel: link, add +1 country code
        const phoneNumber = digitsOnly.slice(-10);
        // Preserve original formatting in the display text
        return `<a href="tel:+1${phoneNumber}" style="color: #1a73e8; text-decoration: underline;">${match}</a>`;
      }

      return match; // Return unchanged if not a valid phone number
    });
  }

  /**
   * Build detailed event description with HTML formatting
   */
  buildEventDescription(job, techInfo) {
    let description = `<strong>Job Details:</strong><br><br>`;
    description += `<strong>Customer:</strong> ${job.customerName}<br>`;
    description += `<strong>Address:</strong> ${job.address}<br>`;
    description += `<strong>Job Type:</strong> ${job.jobType}<br>`;
    description += `<strong>Duration:</strong> ${job.duration} hours<br>`;

    if (job.timeframeStart && job.timeframeEnd) {
      description += `<strong>Timeframe Window:</strong> ${job.timeframeStart} - ${job.timeframeEnd}<br>`;
    }

    if (job.requiresTwoTechs) {
      description += `<br>⚠️ <strong>Requires 2 Technicians</strong><br>`;
    }

    if (job.demoTech) {
      description += `<strong>Demo Tech:</strong> ${job.demoTech}<br>`;
    }

    if (job.travelTime) {
      description += `<br><strong>Drive Time:</strong> ${job.travelTime} minutes<br>`;
    }

    if (job.phone) {
      // Create clickable phone link with robust formatting
      const phoneDigits = job.phone.replace(/\D/g, ''); // Extract only digits
      if (phoneDigits.length >= 10) {
        const formattedPhone = this.formatPhoneNumbersToLinks(job.phone);
        description += `<br><strong>Customer Phone:</strong> ${formattedPhone}<br>`;
      } else {
        description += `<br><strong>Customer Phone:</strong> ${job.phone}<br>`;
      }
    }

    if (job.description) {
      // Also format any phone numbers in the description/notes field
      const notesWithLinks = this.formatPhoneNumbersToLinks(job.description);
      description += `<br><strong>Notes:</strong> ${notesWithLinks}<br>`;
    }

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
   * Create a "Return to Office" calendar event
   * @param {string} calendarId - Email/ID of the calendar (tech's email)
   * @param {object} lastJob - The last job in the route
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {object} techInfo - Technician information including office
   * @returns {Promise} Created event
   */
  async createReturnToOfficeEvent(calendarId, lastJob, date, techInfo) {
    if (!this.isSignedIn()) {
      throw new Error('Not signed in to Google Calendar');
    }

    try {
      // Get office address
      const officeInfo = OFFICES[techInfo.office || 'office_1'];
      if (!officeInfo) {
        console.warn('Office info not found, skipping return to office event');
        return null;
      }

      // Calculate travel time from last job to office
      const mapbox = getMapboxService();
      const travelInfo = await mapbox.getDrivingDistance(lastJob.address, officeInfo.address);

      // Calculate return time
      const lastJobEndTime = lastJob.endTime || lastJob.timeframeEnd;
      const [endHour, endMinute] = lastJobEndTime.split(':').map(Number);

      // Add travel time to end time
      const returnDate = new Date(date);
      returnDate.setHours(endHour, endMinute, 0);
      returnDate.setMinutes(returnDate.getMinutes() + travelInfo.durationMinutes);

      // Format times for calendar event
      const returnHour = returnDate.getHours().toString().padStart(2, '0');
      const returnMinute = returnDate.getMinutes().toString().padStart(2, '0');
      const returnTime = `${returnHour}:${returnMinute}`;

      // Event duration is 30 minutes (time to return + park)
      const endDate = new Date(returnDate);
      endDate.setMinutes(endDate.getMinutes() + 30);
      const eventEndHour = endDate.getHours().toString().padStart(2, '0');
      const eventEndMinute = endDate.getMinutes().toString().padStart(2, '0');
      const eventEndTime = `${eventEndHour}:${eventEndMinute}`;

      const startDateTime = `${date}T${returnTime}:00`;
      const endDateTime = `${date}T${eventEndTime}:00`;

      const event = {
        summary: `Return to ${officeInfo.name}`,
        location: officeInfo.address,
        description: `<strong>Drive back to office from last job</strong><br><br>` +
                     `<strong>Last Job:</strong> ${lastJob.customerName}<br>` +
                     `<strong>From:</strong> ${lastJob.address}<br>` +
                     `<strong>To:</strong> ${officeInfo.address}<br><br>` +
                     `<strong>Estimated Drive Time:</strong> ${travelInfo.durationMinutes} minutes<br>` +
                     `<strong>Distance:</strong> ${travelInfo.distanceMiles} miles<br><br>` +
                     `<strong>Expected Arrival:</strong> ${returnTime}`,
        start: {
          dateTime: startDateTime,
          timeZone: 'America/Chicago'
        },
        end: {
          dateTime: endDateTime,
          timeZone: 'America/Chicago'
        },
        // Use default calendar color (tech's calendar color)
        reminders: {
          useDefault: false,
          overrides: [] // No reminders
        },
        extendedProperties: {
          private: {
            eventType: 'return_to_office',
            travelTime: travelInfo.durationMinutes.toString(),
            distance: travelInfo.distanceMiles
          }
        }
      };

      const response = await window.gapi.client.calendar.events.insert({
        calendarId: calendarId,
        resource: event,
        sendUpdates: 'all'
      });

      console.log(`✅ Created return to office event for ${techInfo.name} at ${returnTime}`);
      return response.result;
    } catch (error) {
      console.error('Error creating return to office event:', error);
      // Don't throw - this is a nice-to-have feature, not critical
      return null;
    }
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

    // Create job events
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

    // Create "Return to Office" event after last job
    if (jobs.length > 0) {
      try {
        const lastJob = jobs[jobs.length - 1];
        await this.createReturnToOfficeEvent(tech.email, lastJob, date, tech);
        console.log(`✅ Added return to office event for ${tech.name}`);
      } catch (error) {
        console.warn(`Could not create return to office event for ${tech.name}:`, error.message);
        // Don't count this as a failure since it's not critical
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

  /**
   * Push route to calendar for Storm Mode staff (PM, EHQ Leaders, CS Staff, Subs)
   * @param {Object} route - Route object with jobs
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {Object} staff - Staff object with type, name, email
   * @returns {Promise<object>} Result summary
   */
  async pushRouteToCalendar(route, date, staff) {
    if (!this.isSignedIn()) {
      await this.signIn();
    }

    if (!staff.email) {
      throw new Error(`${staff.name} does not have an email address configured`);
    }

    // Get staff type label
    const staffTypeLabel = staff.type === 'projectManager' ? 'PM' :
                          staff.type === 'ehqLeader' ? 'EHQ Leader' :
                          staff.type === 'ehqCSStaff' ? 'EHQ CS Staff' :
                          staff.type === 'subContractor' ? 'Sub Contractor' :
                          'Tech';

    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    // Delete existing events for this date
    try {
      await this.deleteEventsForDate(staff.email, date);
    } catch (error) {
      console.warn(`Could not delete existing events for ${staff.name}:`, error);
    }

    // Create events for each job
    for (const job of route.jobs) {
      try {
        // Build event title with staff type
        const eventTitle = `[${staffTypeLabel}] ${job.jobType} - ${job.customerName}`;

        // Enhanced description for Storm Mode staff
        let description = `<strong>Storm Mode Assignment</strong><br><br>`;
        description += `<strong>Staff Type:</strong> ${staffTypeLabel}<br>`;
        description += `<strong>Assigned To:</strong> ${staff.name}<br><br>`;
        description += `<strong>Job Details:</strong><br>`;
        description += `<strong>Customer:</strong> ${job.customerName}<br>`;
        description += `<strong>Address:</strong> ${job.address}<br>`;
        description += `<strong>Job Type:</strong> ${job.jobType}<br>`;
        description += `<strong>Duration:</strong> ${job.duration} hours<br>`;

        if (job.phone) {
          description += `<strong>Phone:</strong> ${this.formatPhoneNumbersToLinks(job.phone)}<br>`;
        }

        if (job.zone) {
          description += `<strong>Zone:</strong> ${job.zone}<br>`;
        }

        // Add sub contractor specific info
        if (staff.type === 'subContractor' && job.starter) {
          description += `<br><strong>Started By:</strong> ${job.starter.name} (${job.starter.type === 'projectManager' ? 'PM' : 'EHQ Leader'})<br>`;
        }

        // Add starter specific info
        if ((staff.type === 'projectManager' || staff.type === 'ehqLeader') && job.isStarterJob) {
          description += `<br><strong>Starting Sub Contractor:</strong> ${job.subContractorName}<br>`;
          description += `<strong>Supervision:</strong> ${job.supervisionType === 'supervise' ? 'All Day' : 'Start Only (30 min)'}<br>`;
        }

        const startDateTime = `${date}T${job.startTime}:00`;
        const endDateTime = `${date}T${job.endTime}:00`;

        const event = {
          summary: eventTitle,
          location: job.address,
          description: description,
          start: {
            dateTime: startDateTime,
            timeZone: 'America/Chicago'
          },
          end: {
            dateTime: endDateTime,
            timeZone: 'America/Chicago'
          },
          reminders: {
            useDefault: false,
            overrides: []
          },
          extendedProperties: {
            private: {
              jobId: job.id,
              jobType: job.jobType,
              staffType: staff.type,
              stormMode: 'true',
              zone: job.zone || ''
            }
          }
        };

        await window.gapi.client.calendar.events.insert({
          calendarId: staff.email,
          resource: event,
          sendUpdates: 'all'
        });

        results.success++;
      } catch (error) {
        console.error(`Error creating event for ${staff.name}:`, error);
        results.failed++;
        results.errors.push({
          job: job.customerName,
          error: error.message
        });
      }
    }

    return results;
  }
}

// Create singleton instance
const googleCalendarService = new GoogleCalendarService();

export default googleCalendarService;
