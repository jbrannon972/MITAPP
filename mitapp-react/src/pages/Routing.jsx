/**
 * Routing Page - Main routing and job assignment interface
 * Features: Company Meeting Mode for all-staff meetings at Conroe office
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Layout from '../components/common/Layout';
import ManualMode from '../components/routing/ManualMode';
import KanbanCalendar from '../components/routing/KanbanCalendar';
import ConfirmModal from '../components/routing/ConfirmModal';
import LoadingModal from '../components/routing/LoadingModal';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import firebaseService from '../services/firebaseService';
import { getMapboxService, initMapboxService } from '../services/mapboxService';
import { getCalculatedScheduleForDay } from '../utils/calendarManager';
import { debounce } from '../utils/routingHelpers';
import { validateJobs, sanitizeJob, formatValidationErrors } from '../utils/validators';
import {
  optimizeRoute,
  balanceWorkload,
  assignDemoTechs,
  getRoutingEligibleTechs,
  calculateRouteSummary
} from '../utils/routeOptimizer';
import { startTrace, measureOperation, TRACE_NAMES, perfLogger } from '../utils/performanceMonitor';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const Routing = () => {
  const { staffingData, unifiedTechnicianData } = useData();
  const { currentUser } = useAuth();
  const [activeView, setActiveView] = useState('routing');
  const [jobs, setJobs] = useState([]);
  const [routes, setRoutes] = useState({});
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showOptimizeModal, setShowOptimizeModal] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [mapboxToken, setMapboxToken] = useState(localStorage.getItem('mapboxToken') || 'pk.eyJ1IjoiamJyYW5ub245NzIiLCJhIjoiY204NXN2Z2w2Mms4ODJrb2tvemV2ZnlicyJ9.84JYhRSUAF5_-vvdebw-TA');
  const [selectedTech, setSelectedTech] = useState(null);
  const [activeUsers, setActiveUsers] = useState([]);
  const [scheduleForDay, setScheduleForDay] = useState(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [modal, setModal] = useState({ show: false, title: '', message: '', type: 'info', onConfirm: null, onCancel: null });
  const [techStartTimes, setTechStartTimes] = useState({}); // Store custom start times for techs (for late starts)
  const [companyMeetingMode, setCompanyMeetingMode] = useState(false); // All techs start at Conroe office at 9am
  const [loadingState, setLoadingState] = useState({
    isOpen: false,
    title: '',
    message: '',
    progress: 0,
    currentStep: '',
    totalSteps: 0,
    currentStepNumber: 0,
    showSteps: false
  });
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const sessionStartTime = useRef(Date.now());
  const listenerErrorCount = useRef(0);

  // Houston office locations
  const offices = {
    office_1: {
      name: 'Conroe Office',
      address: '10491 Fussel Rd, Conroe, TX 77303',
      shortName: 'Conroe'
    },
    office_2: {
      name: 'Katy Office',
      address: '5115 E 5th St, Katy, TX 77493',
      shortName: 'Katy'
    }
  };

  // Modal helper functions to replace alert/confirm
  const showAlert = (message, title = 'Notification', type = 'info') => {
    setModal({ show: true, title, message, type, onConfirm: null, onCancel: null });
  };

  const showConfirm = (message, title, onConfirm, type = 'question', onCancel = null) => {
    setModal({ show: true, title, message, type, onConfirm, onCancel });
  };

  const closeModal = () => {
    setModal({ show: false, title: '', message: '', type: 'info', onConfirm: null, onCancel: null });
  };

  // Session health monitoring - detect stale connections
  useEffect(() => {
    const SESSION_TIMEOUT = 2 * 60 * 60 * 1000; // 2 hours
    const CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes

    const healthCheckInterval = setInterval(() => {
      const sessionAge = Date.now() - sessionStartTime.current;

      // If session is > 2 hours old or multiple listener errors, suggest refresh
      if (sessionAge > SESSION_TIMEOUT || listenerErrorCount.current > 3) {
        console.warn('⚠️ Long-running session detected. Recommend refreshing to prevent connection issues.');
        console.log(`Session age: ${Math.round(sessionAge / 1000 / 60)} minutes, Errors: ${listenerErrorCount.current}`);

        // Show subtle notification (not blocking)
        if (listenerErrorCount.current > 3) {
          showAlert(
            'Connection issues detected. Please save your work and refresh the page to restore full functionality.',
            'Connection Warning',
            'warning'
          );
        }
      }
    }, CHECK_INTERVAL);

    return () => clearInterval(healthCheckInterval);
  }, []);

  // Real-time subscriptions for jobs and routes
  useEffect(() => {
    if (!currentUser) return;

    setLoading(true);

    // Error handler for Firestore listeners
    const handleListenerError = (error) => {
      listenerErrorCount.current += 1;
      console.error(`⚠️ Firestore listener error #${listenerErrorCount.current}:`, error.code);

      // If we get multiple errors quickly, suggest refresh
      if (listenerErrorCount.current >= 3) {
        console.warn('🔄 Multiple Firestore errors detected. Connection may be stale.');
      }
    };

    // Subscribe to real-time jobs updates with error handling
    const jobsUnsubscribe = firebaseService.subscribeToDocument(
      'hou_routing',
      `jobs_${selectedDate}`,
      (data) => {
        setJobs(data?.jobs || []);
        setCompanyMeetingMode(data?.companyMeetingMode || false);
        setLoading(false);
      },
      handleListenerError
    );

    // Subscribe to real-time routes updates with error handling
    const routesUnsubscribe = firebaseService.subscribeToDocument(
      'hou_routing',
      `routes_${selectedDate}`,
      (data) => {
        const loadedRoutes = data?.routes || {};
        const enrichedRoutes = enrichRoutesWithEmails(loadedRoutes);
        setRoutes(enrichedRoutes);
      },
      handleListenerError
    );

    // Set presence to show this user is viewing routes
    const user = {
      id: currentUser.uid,
      name: currentUser.displayName || currentUser.email,
      email: currentUser.email
    };
    firebaseService.setPresence('routing', selectedDate, user);

    // Subscribe to presence updates with error handling
    const presenceUnsubscribe = firebaseService.subscribeToPresence(
      'routing',
      selectedDate,
      (users) => {
        // Filter out current user and show others
        const otherUsers = users.filter(u => u.userId !== currentUser.uid);
        setActiveUsers(otherUsers);
      },
      handleListenerError
    );

    // Cleanup function
    return () => {
      jobsUnsubscribe();
      routesUnsubscribe();
      presenceUnsubscribe();
      firebaseService.removePresence('routing', selectedDate, currentUser.uid);

      // Reset error count when unmounting/changing date
      listenerErrorCount.current = 0;
    };
  }, [selectedDate, currentUser, staffingData]);

  // Periodic cleanup to prevent memory leaks from long sessions
  useEffect(() => {
    const CLEANUP_INTERVAL = 15 * 60 * 1000; // Every 15 minutes

    const cleanupInterval = setInterval(() => {
      console.log('🧹 Running periodic cleanup...');

      // Clear old map markers if they exist
      if (markersRef.current && markersRef.current.length > 100) {
        console.log(`⚠️ Cleaning up ${markersRef.current.length} accumulated map markers`);
        markersRef.current.forEach(marker => {
          try {
            if (marker && marker.remove) marker.remove();
          } catch (e) {
            // Marker already removed, ignore
          }
        });
        markersRef.current = [];
      }

      // Log session age for debugging
      const sessionMinutes = Math.round((Date.now() - sessionStartTime.current) / 1000 / 60);
      console.log(`📊 Session age: ${sessionMinutes} minutes, Listener errors: ${listenerErrorCount.current}`);
    }, CLEANUP_INTERVAL);

    return () => clearInterval(cleanupInterval);
  }, []);

  // Fetch schedule data for selected date
  useEffect(() => {
    const fetchSchedule = async () => {
      if (!unifiedTechnicianData || unifiedTechnicianData.length === 0) return;

      try {
        const dateObj = new Date(selectedDate + 'T12:00:00');
        const monthlySchedules = await firebaseService.getScheduleDataForMonth(
          dateObj.getFullYear(),
          dateObj.getMonth()
        );
        const schedule = getCalculatedScheduleForDay(dateObj, monthlySchedules, unifiedTechnicianData);
        setScheduleForDay(schedule);
      } catch (error) {
        console.error('Error fetching schedule:', error);
        setScheduleForDay(null);
      }
    };

    fetchSchedule();
  }, [selectedDate, unifiedTechnicianData]);

  // Re-enrich routes when staffing data changes (to add emails to existing routes)
  useEffect(() => {
    if (staffingData && Object.keys(routes).length > 0) {
      const enrichedRoutes = enrichRoutesWithEmails(routes);
      setRoutes(enrichedRoutes);
    }
  }, [staffingData]);

  // Removed loadJobs and loadRoutes - using real-time subscriptions instead

  // Enrich route tech objects with email from staffing data
  const enrichRoutesWithEmails = (routes) => {
    if (!staffingData?.zones) return routes;

    const enrichedRoutes = { ...routes };

    // For each route, find the tech in staffing data and add their email
    Object.keys(enrichedRoutes).forEach(techId => {
      const route = enrichedRoutes[techId];
      if (route && route.tech && !route.tech.email) {
        // Find this tech in staffing data
        let techWithEmail = null;

        for (const zone of staffingData.zones) {
          // Check zone lead
          if (zone.lead && zone.lead.id === techId) {
            techWithEmail = zone.lead;
            break;
          }
          // Check zone members
          const member = zone.members?.find(m => m.id === techId);
          if (member) {
            techWithEmail = member;
            break;
          }
        }

        // If found, add email to route tech object
        if (techWithEmail && techWithEmail.email) {
          console.log(`Enriching ${route.tech.name} with email: ${techWithEmail.email}`);
          enrichedRoutes[techId] = {
            ...route,
            tech: {
              ...route.tech,
              email: techWithEmail.email
            }
          };
        } else {
          console.warn(`Could not find email for tech: ${route.tech.name} (ID: ${techId})`);
        }
      }
    });

    return enrichedRoutes;
  };

  const handleCSVImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setShowImportModal(false);

    // Show loading modal
    setLoadingState({
      isOpen: true,
      title: 'Importing CSV',
      message: 'Reading file...',
      progress: 10,
      totalSteps: 3,
      currentStepNumber: 1,
      currentStep: 'Reading CSV file...',
      showSteps: true
    });

    const reader = new FileReader();
    reader.onload = async (event) => {
      // Start performance trace for CSV import
      const csvImportTrace = startTrace(TRACE_NAMES.CSV_IMPORT);
      perfLogger.startTimer('total_csv_import');

      try {
        // Step 1: Parse CSV
        setLoadingState(prev => ({
          ...prev,
          progress: 20,
          currentStepNumber: 1,
          currentStep: 'Parsing CSV data...',
          message: 'Processing job information'
        }));

        perfLogger.startTimer('csv_parsing');
        const text = event.target.result;
        const parsedJobs = parseCSV(text);
        const parsingDuration = perfLogger.endTimer('csv_parsing');
        csvImportTrace.putMetric('parsing_duration_ms', Math.round(parsingDuration));
        csvImportTrace.putMetric('jobs_parsed', parsedJobs.length);

        // Step 2: Sanitize and validate data
        setLoadingState(prev => ({
          ...prev,
          progress: 40,
          currentStepNumber: 2,
          currentStep: 'Validating job data...',
          message: `Checking ${parsedJobs.length} jobs for errors`
        }));

        perfLogger.startTimer('validation');
        // Sanitize all jobs first (fix common issues)
        const sanitizedJobs = parsedJobs.map(sanitizeJob);

        // Validate all jobs
        const { validJobs, invalidJobs, stats } = validateJobs(sanitizedJobs);
        const validationDuration = perfLogger.endTimer('validation');
        csvImportTrace.putMetric('validation_duration_ms', Math.round(validationDuration));
        csvImportTrace.putMetric('valid_jobs', validJobs.length);
        csvImportTrace.putMetric('invalid_jobs', invalidJobs.length);

        console.log('📊 Validation results:', stats);
        if (invalidJobs.length > 0) {
          console.warn('⚠️ Invalid jobs found:', invalidJobs);
        }

        // Step 3: Save valid jobs to Firebase
        setLoadingState(prev => ({
          ...prev,
          progress: 70,
          currentStepNumber: 3,
          currentStep: 'Saving jobs to database...',
          message: `Saving ${validJobs.length} valid jobs`
        }));

        setJobs(validJobs);
        await saveJobsNow(validJobs);

        // Complete
        setLoadingState(prev => ({
          ...prev,
          progress: 100,
          currentStep: 'Complete!',
          message: `Imported ${validJobs.length} jobs successfully`
        }));

        // Wait a moment to show 100% before closing
        await new Promise(resolve => setTimeout(resolve, 500));

        setLoadingState(prev => ({ ...prev, isOpen: false }));

        // Complete performance tracking
        const totalDuration = perfLogger.endTimer('total_csv_import');
        csvImportTrace.putMetric('total_duration_ms', Math.round(totalDuration));
        csvImportTrace.putAttribute('success', 'true');
        csvImportTrace.putAttribute('has_errors', invalidJobs.length > 0 ? 'true' : 'false');
        csvImportTrace.stop();

        // Log performance summary
        perfLogger.logSummary();

        // Show results with validation warnings if needed
        if (invalidJobs.length === 0) {
          showAlert(
            `✅ Successfully imported ${validJobs.length} jobs!\n\nAll jobs passed validation.`,
            'Import Complete',
            'success'
          );
        } else {
          const errorMessage = formatValidationErrors(invalidJobs);
          showAlert(
            `⚠️ Imported ${validJobs.length} of ${stats.total} jobs (${stats.successRate}% success)\n\n${errorMessage}\n\nValid jobs have been imported. Please fix the errors in your CSV and re-import if needed.`,
            'Import Complete with Warnings',
            'warning'
          );
        }
      } catch (error) {
        console.error('CSV import error:', error);
        setLoadingState(prev => ({ ...prev, isOpen: false }));

        // Track failure in performance monitoring
        csvImportTrace.putAttribute('success', 'false');
        csvImportTrace.putAttribute('error', error.message || 'Unknown error');
        csvImportTrace.stop();

        showAlert(`Error importing CSV: ${error.message}`, 'Import Failed', 'error');
      }
    };
    reader.readAsText(file);
  };

  // Proper CSV parser that handles commas inside quoted fields
  const parseCSVLine = (line) => {
    const values = [];
    let currentValue = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        // Handle double quotes ("") as escaped quotes
        if (insideQuotes && nextChar === '"') {
          currentValue += '"';
          i++; // Skip next quote
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        // End of field
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }

    // Add last value
    values.push(currentValue.trim());
    return values;
  };

  const cleanPhoneNumber = (phone) => {
    if (!phone) return '';
    // Remove tabs, extra spaces, and normalize
    return phone.replace(/\t/g, '').trim();
  };

  const parseCSV = (csvText) => {
    // Parse CSV properly handling newlines within quoted fields
    const rows = [];
    let currentRow = '';
    let insideQuotes = false;

    for (let i = 0; i < csvText.length; i++) {
      const char = csvText[i];
      const nextChar = csvText[i + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          currentRow += '"';
          i++; // Skip the next quote
        } else {
          insideQuotes = !insideQuotes;
        }
        currentRow += char;
      } else if (char === '\n' && !insideQuotes) {
        // Only split on newlines outside of quotes
        if (currentRow.trim()) {
          rows.push(currentRow);
        }
        currentRow = '';
      } else {
        currentRow += char;
      }
    }

    // Add last row
    if (currentRow.trim()) {
      rows.push(currentRow);
    }

    if (rows.length === 0) return [];

    const headers = parseCSVLine(rows[0]);

    const jobs = [];
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i].trim()) continue;

      const values = parseCSVLine(rows[i]);
      const job = {};

      headers.forEach((header, index) => {
        job[header] = values[index] || '';
      });

      // Parse route_title: "Customer Name | Job Number | Job Type | Zone"
      const titleParts = (job.route_title || '').split('|').map(p => p.trim());
      const customerName = titleParts[0] || '';
      const jobType = titleParts[2] || 'Other';
      const zone = titleParts[3] || 'Other'; // Extract zone from route_title (Z1, Z2, Z3, etc.)

      // Parse timeframe from route_description
      // Supports multiple formats:
      // - TF(09:00-13:00)
      // - TF: 9a-1p, TF: 9am-1pm
      // - TF: 9-1 (assumes AM to PM)
      let timeframeStart = '08:00';
      let timeframeEnd = '17:00';

      const description = job.route_description || '';

      // Try TF(HH:MM-HH:MM) format first
      const tfMatch = description.match(/TF\((\d+:\d+)-(\d+:\d+)\)/);
      if (tfMatch) {
        timeframeStart = tfMatch[1];
        timeframeEnd = tfMatch[2];
      } else {
        // Try TF: followed by flexible time formats
        // Match "TF:" or "TF :" followed by timeframe
        const tfFlexMatch = description.match(/TF\s*:\s*(\d{1,2})(?::(\d{2}))?(?:am?|a)?-(\d{1,2})(?::(\d{2}))?(?:pm?|p)?/i);
        if (tfFlexMatch) {
          let startHour = parseInt(tfFlexMatch[1]);
          const startMin = tfFlexMatch[2] || '00';
          let endHour = parseInt(tfFlexMatch[3]);
          const endMin = tfFlexMatch[4] || '00';

          // Check for explicit AM/PM markers
          const matchedText = tfFlexMatch[0].toLowerCase();
          const hasStartAM = matchedText.includes(`${startHour}a`) || matchedText.includes(`${startHour}am`);
          const hasEndPM = matchedText.includes(`-${endHour}p`) || matchedText.includes(`-${endHour}pm`);
          const hasEndAM = matchedText.includes(`-${endHour}a`) || matchedText.includes(`-${endHour}am`);

          // If no explicit AM/PM markers, assume single digit hours are: start=AM, end=PM
          if (!hasStartAM && !hasEndPM && !hasEndAM && startHour < 12 && endHour < 12) {
            // "TF: 9-1" -> assume 9 AM to 1 PM
            if (endHour < 12) endHour += 12;
          } else {
            // Handle explicit markers
            if (hasStartAM && startHour === 12) startHour = 0;
            if (hasEndPM && endHour < 12) endHour += 12;
          }

          timeframeStart = `${String(startHour).padStart(2, '0')}:${startMin}`;
          timeframeEnd = `${String(endHour).padStart(2, '0')}:${endMin}`;
        }
      }

      // Clean phone number and make it a tel: link
      const cleanPhone = cleanPhoneNumber(job.customer_phone);

      // Determine if 2 techs needed - check for DT(true) flag in description
      // DT(true) means "Demo Tech" is required (a second person)
      const requiresTwoTechs = (job.route_description || '').includes('DT(true)');

      jobs.push({
        id: job.text || `job_${Date.now()}_${i}`,
        customerName: customerName,
        address: job.customer_address || '',
        zone: zone,
        duration: parseFloat(job.duration) || 1,
        timeframeStart: timeframeStart,
        timeframeEnd: timeframeEnd,
        jobType: jobType,
        requiresTwoTechs: requiresTwoTechs,
        description: job.route_description || '',
        phone: cleanPhone,
        status: 'unassigned',
        route_title: job.route_title, // Add route_title to top level for Google Calendar
        originalData: {
          next_visit_date: job.next_visit_date,
          route_title: job.route_title,
          customer_address: job.customer_address,
          zone: zone,
          text: job.text
        }
      });
    }

    return jobs;
  };

  // Immediate save function (private)
  const saveJobsImmediate = async (jobsData) => {
    try {
      const stack = new Error().stack;
      console.log('📤 Saving jobs to Firebase...', jobsData.length, 'jobs');
      console.log('📍 Called from:', stack.split('\n')[2]);

      if (currentUser) {
        await firebaseService.saveWithMetadata(
          'hou_routing',
          `jobs_${selectedDate}`,
          {
            jobs: jobsData,
            date: selectedDate,
            companyMeetingMode: companyMeetingMode
          },
          {
            name: currentUser.displayName || currentUser.email,
            id: currentUser.uid
          }
        );
      } else {
        await firebaseService.saveDocument('hou_routing', `jobs_${selectedDate}`, {
          jobs: jobsData,
          date: selectedDate,
          companyMeetingMode: companyMeetingMode,
          lastUpdated: new Date().toISOString()
        });
      }
      console.log('✅ Jobs saved to Firebase');
    } catch (error) {
      console.error('Error saving jobs:', error);
      showAlert('Error saving jobs. Please try again.', 'Error', 'error');
    }
  };

  // Debounced save function (waits 1 second after last change)
  const saveJobsDebounced = useRef(
    debounce((jobsData) => {
      saveJobsImmediate(jobsData);
    }, 1000)
  ).current;

  // Public save function (uses debouncing for drag/drop operations)
  const saveJobs = (jobsData) => {
    console.log('⏳ Queuing jobs save (debounced)...');
    saveJobsDebounced(jobsData);
  };

  // Immediate save (for operations that need confirmation like CSV import, optimization)
  const saveJobsNow = async (jobsData) => {
    console.log('💾 Saving jobs immediately (no debounce)...');
    await saveJobsImmediate(jobsData);
  };

  // Memoized tech list calculation (performance optimization)
  const getTechList = useMemo(() => {
    if (!staffingData?.zones) return [];

    const allTechs = [];

    // Add zone members
    staffingData.zones.forEach(zone => {
      if (zone.lead) {
        allTechs.push({
          id: zone.lead.id,
          name: zone.lead.name,
          role: zone.lead.role,
          email: zone.lead.email, // Include email for calendar integration
          zone: zone.name,
          office: zone.lead.office || 'office_1',
          isDemoTech: false
        });
      }

      zone.members.forEach(member => {
        allTechs.push({
          id: member.id,
          name: member.name,
          role: member.role,
          email: member.email, // Include email for calendar integration
          zone: zone.name,
          office: member.office || 'office_1',
          isDemoTech: member.role === 'Demo Tech'
        });
      });
    });

    return allTechs;
  }, [staffingData?.zones]);

  // Memoized filtered tech lists (performance optimization)
  const getDemoTechs = useMemo(() => {
    return getTechList.filter(t => t.isDemoTech);
  }, [getTechList]);

  const getLeadTechs = useMemo(() => {
    return getRoutingEligibleTechs(getTechList);
  }, [getTechList]);

  // Memoized job filters (performance optimization)
  const unassignedJobs = useMemo(() => {
    return jobs.filter(j => !j.assignedTech);
  }, [jobs]);

  const assignedJobs = useMemo(() => {
    return jobs.filter(j => j.assignedTech);
  }, [jobs]);

  const assignJobToTech = async (jobId, techId) => {
    // Store original state for potential rollback (optimistic UI)
    const originalJobs = jobs;
    const originalRoutes = routes;

    try {
      // Step 1: Update UI immediately (optimistic)
      const updatedJobs = jobs.map(job => {
        if (job.id === jobId) {
          return { ...job, assignedTech: techId, status: 'assigned' };
        }
        return job;
      });

      setJobs(updatedJobs);

      // Update routes optimistically
      const tech = getTechList.find(t => t.id === techId);
      const job = updatedJobs.find(j => j.id === jobId);

      const updatedRoutes = { ...routes };
      if (!updatedRoutes[techId]) {
        updatedRoutes[techId] = {
          tech: tech,
          jobs: []
        };
      }
      updatedRoutes[techId].jobs.push(job);

      setRoutes(updatedRoutes);

      // Step 2: Save to Firebase in background (debounced)
      saveJobs(updatedJobs);
      saveRoutes(updatedRoutes);

      console.log(`✅ Job ${jobId} optimistically assigned to ${tech.name}`);
    } catch (error) {
      // Step 3: Rollback on error
      console.error('❌ Failed to assign job:', error);
      setJobs(originalJobs);
      setRoutes(originalRoutes);

      // Provide helpful error message based on error type
      let errorMessage = 'Failed to assign job. Your changes have been rolled back.\n\n';

      if (error.code === 'permission-denied') {
        errorMessage += 'Error: Permission denied. Please check your access rights.';
      } else if (error.message?.includes('network') || error.message?.includes('offline')) {
        errorMessage += 'Error: Network issue detected. Please check your internet connection and try again.';
      } else if (error.code === 'unavailable') {
        errorMessage += 'Error: Firebase service temporarily unavailable. Please try again in a moment.';
      } else {
        errorMessage += `Error: ${error.message || 'Unknown error occurred'}`;
      }

      showAlert(errorMessage, 'Assignment Failed - Changes Rolled Back', 'error');
    }
  };

  // Immediate save function (private)
  const saveRoutesImmediate = async (routesData) => {
    try {
      const stack = new Error().stack;
      console.log('📤 Saving routes to Firebase...', Object.keys(routesData).length, 'routes');
      console.log('📍 Called from:', stack.split('\n')[2]);

      if (currentUser) {
        await firebaseService.saveWithMetadata(
          'hou_routing',
          `routes_${selectedDate}`,
          {
            routes: routesData,
            date: selectedDate
          },
          {
            name: currentUser.displayName || currentUser.email,
            id: currentUser.uid
          }
        );
      } else {
        await firebaseService.saveDocument('hou_routing', `routes_${selectedDate}`, {
          routes: routesData,
          date: selectedDate,
          lastUpdated: new Date().toISOString()
        });
      }
      console.log('✅ Routes saved to Firebase');
    } catch (error) {
      console.error('Error saving routes:', error);
    }
  };

  // Debounced save function (waits 1 second after last change)
  const saveRoutesDebounced = useRef(
    debounce((routesData) => {
      saveRoutesImmediate(routesData);
    }, 1000)
  ).current;

  // Public save function (uses debouncing for drag/drop operations)
  const saveRoutes = (routesData) => {
    console.log('⏳ Queuing routes save (debounced)...');
    saveRoutesDebounced(routesData);
  };

  // Immediate save (for operations that need confirmation like optimization, calendar push)
  const saveRoutesNow = async (routesData) => {
    console.log('💾 Saving routes immediately (no debounce)...');
    await saveRoutesImmediate(routesData);
  };

  const unassignJob = async (jobId) => {
    // Store original state for potential rollback (optimistic UI)
    const originalJobs = jobs;
    const originalRoutes = routes;

    try {
      // Step 1: Update UI immediately (optimistic)
      const updatedJobs = jobs.map(job => {
        if (job.id === jobId) {
          return { ...job, assignedTech: null, status: 'unassigned' };
        }
        return job;
      });

      setJobs(updatedJobs);

      // Remove from routes optimistically
      const updatedRoutes = { ...routes };
      Object.keys(updatedRoutes).forEach(techId => {
        updatedRoutes[techId].jobs = updatedRoutes[techId].jobs.filter(j => j.id !== jobId);
      });

      setRoutes(updatedRoutes);

      // Step 2: Save to Firebase in background (debounced)
      saveJobs(updatedJobs);
      saveRoutes(updatedRoutes);

      console.log(`✅ Job ${jobId} optimistically unassigned`);
    } catch (error) {
      // Step 3: Rollback on error
      console.error('❌ Failed to unassign job:', error);
      setJobs(originalJobs);
      setRoutes(originalRoutes);

      // Provide helpful error message based on error type
      let errorMessage = 'Failed to unassign job. Your changes have been rolled back.\n\n';

      if (error.code === 'permission-denied') {
        errorMessage += 'Error: Permission denied. Please check your access rights.';
      } else if (error.message?.includes('network') || error.message?.includes('offline')) {
        errorMessage += 'Error: Network issue detected. Please check your internet connection and try again.';
      } else if (error.code === 'unavailable') {
        errorMessage += 'Error: Firebase service temporarily unavailable. Please try again in a moment.';
      } else {
        errorMessage += `Error: ${error.message || 'Unknown error occurred'}`;
      }

      showAlert(errorMessage, 'Unassign Failed - Changes Rolled Back', 'error');
    }
  };

  const handleAutoOptimize = async () => {
    if (!mapboxToken) {
      showAlert('Please enter a Mapbox API token in the optimization settings.', 'Mapbox Token Required', 'warning');
      return;
    }

    setOptimizing(true);
    setShowOptimizeModal(false);

    // Start performance trace for entire auto-optimize operation
    const autoOptimizeTrace = startTrace(TRACE_NAMES.AUTO_OPTIMIZE);
    perfLogger.startTimer('total_auto_optimize');

    try {
      // Using memoized getLeadTechs, getDemoTechs, and unassignedJobs

      if (unassignedJobs.length === 0) {
        showAlert('No unassigned jobs to optimize.', 'Nothing to Optimize', 'info');
        setOptimizing(false);
        autoOptimizeTrace.stop();
        return;
      }

      // Track metrics
      autoOptimizeTrace.putMetric('job_count', unassignedJobs.length);
      autoOptimizeTrace.putMetric('tech_count', getLeadTechs.length);

      // Initialize loading modal
      setLoadingState({
        isOpen: true,
        title: 'Optimizing Routes',
        message: 'Preparing to optimize routes...',
        progress: 0,
        totalSteps: 4,
        currentStepNumber: 1,
        currentStep: 'Geocoding job addresses...',
        showSteps: true
      });

      // Step 1: Geocode all job addresses using batch geocoding
      perfLogger.startTimer('geocoding');
      const mapbox = getMapboxService();

      // Collect all unique addresses
      const addresses = unassignedJobs.map(job => job.address);

      // Use batch geocoding (10 parallel requests at a time)
      const geocodeResults = await mapbox.batchGeocode(addresses, 10);
      const geocodingDuration = perfLogger.endTimer('geocoding');
      autoOptimizeTrace.putMetric('geocoding_duration_ms', Math.round(geocodingDuration));

      // Map results back to jobs
      const geocodedJobs = unassignedJobs.map(job => ({
        ...job,
        coordinates: geocodeResults[job.address] || null
      }));

      // Update progress
      setLoadingState(prev => ({
        ...prev,
        progress: 25,
        message: `Batch geocoded ${addresses.length} addresses`
      }));

      // Step 2: Balance workload across techs
      setLoadingState(prev => ({
        ...prev,
        progress: 25,
        currentStepNumber: 2,
        currentStep: 'Balancing workload across technicians...',
        message: `Assigning ${geocodedJobs.length} jobs to ${getLeadTechs.length} technicians`
      }));

      perfLogger.startTimer('workload_balancing');
      const balancedAssignments = balanceWorkload(geocodedJobs, getLeadTechs);
      const techsWithJobs = Object.entries(balancedAssignments).filter(([_, a]) => a.jobs.length > 0);
      const balancingDuration = perfLogger.endTimer('workload_balancing');
      autoOptimizeTrace.putMetric('balancing_duration_ms', Math.round(balancingDuration));

      // Step 3: Optimize each tech's route
      setLoadingState(prev => ({
        ...prev,
        progress: 30,
        currentStepNumber: 3,
        currentStep: `Optimizing routes for ${techsWithJobs.length} technicians...`,
        message: 'Calculating optimal route order'
      }));

      perfLogger.startTimer('route_optimization');
      const optimizedRoutes = {};
      let completedTechs = 0;

      for (const [techId, assignment] of techsWithJobs) {
        if (assignment.jobs.length === 0) continue;

        // Update progress for this tech
        setLoadingState(prev => ({
          ...prev,
          progress: 30 + (completedTechs / techsWithJobs.length * 60),
          message: `Optimizing route for ${assignment.tech.name} (${assignment.jobs.length} jobs)`
        }));

        // Get start location for this tech
        const startLocation = offices[assignment.tech.office].address;

        // Build distance matrix (if we have Mapbox token)
        let distanceMatrix = null;
        if (mapboxToken && assignment.jobs.length > 1) {
          const addresses = [
            startLocation,
            ...assignment.jobs.map(j => j.address)
          ];

          try {
            distanceMatrix = await mapbox.calculateDistanceMatrix(addresses);
          } catch (error) {
            console.error('Distance matrix error:', error);
          }
        }

        // Determine shift based on tech name or role
        const isSecondShift = assignment.tech.name?.toLowerCase().includes('second shift') ||
                             assignment.tech.name?.toLowerCase().includes('2nd shift');
        const shift = isSecondShift ? 'second' : 'first';

        // Optimize route order
        const optimized = await optimizeRoute(
          assignment.jobs,
          startLocation,
          distanceMatrix,
          shift
        );

        optimizedRoutes[techId] = {
          tech: assignment.tech,
          jobs: optimized.optimizedJobs,
          summary: {
            totalDuration: optimized.totalDuration,
            totalDistance: optimized.totalDistance
          }
        };

        completedTechs++;
      }

      const routeOptimizationDuration = perfLogger.endTimer('route_optimization');
      autoOptimizeTrace.putMetric('route_optimization_duration_ms', Math.round(routeOptimizationDuration));

      // Step 4: Auto-assign demo techs
      setLoadingState(prev => ({
        ...prev,
        progress: 90,
        currentStepNumber: 4,
        currentStep: 'Assigning demo technicians...',
        message: 'Finalizing route assignments'
      }));

      perfLogger.startTimer('demo_tech_assignment');
      const { routes: finalRoutes } = assignDemoTechs(optimizedRoutes, getDemoTechs);
      const demoAssignmentDuration = perfLogger.endTimer('demo_tech_assignment');
      autoOptimizeTrace.putMetric('demo_assignment_duration_ms', Math.round(demoAssignmentDuration));

      // Save to Firebase (immediate save for optimization completion)
      setLoadingState(prev => ({
        ...prev,
        progress: 95,
        message: 'Saving routes to database...'
      }));

      setRoutes(finalRoutes);
      await saveRoutesNow(finalRoutes);

      // Update jobs with assignments
      const updatedJobs = jobs.map(job => {
        for (const [techId, route] of Object.entries(finalRoutes)) {
          if (route.jobs.some(j => j.id === job.id)) {
            return { ...job, assignedTech: techId, status: 'assigned' };
          }
        }
        return job;
      });

      setJobs(updatedJobs);
      await saveJobsNow(updatedJobs);

      // Complete
      setLoadingState(prev => ({
        ...prev,
        progress: 100,
        currentStep: 'Complete!',
        message: `Optimized routes for ${Object.keys(finalRoutes).length} technicians`
      }));

      // Wait a moment to show 100% before closing
      await new Promise(resolve => setTimeout(resolve, 500));

      setLoadingState(prev => ({ ...prev, isOpen: false }));

      // Complete performance tracking
      const totalDuration = perfLogger.endTimer('total_auto_optimize');
      autoOptimizeTrace.putMetric('total_duration_ms', Math.round(totalDuration));
      autoOptimizeTrace.putMetric('techs_optimized', Object.keys(finalRoutes).length);
      autoOptimizeTrace.putAttribute('success', 'true');
      autoOptimizeTrace.stop();

      // Log performance summary
      perfLogger.logSummary();

      showAlert(`Successfully optimized routes for ${Object.keys(finalRoutes).length} technicians!`, 'Optimization Complete', 'success');
    } catch (error) {
      console.error('Optimization error:', error);
      setLoadingState(prev => ({ ...prev, isOpen: false }));

      // Track failure in performance monitoring
      autoOptimizeTrace.putAttribute('success', 'false');
      autoOptimizeTrace.putAttribute('error', error.message || 'Unknown error');
      autoOptimizeTrace.stop();

      showAlert('Error during optimization. Please try again.', 'Optimization Failed', 'error');
    } finally {
      setOptimizing(false);
    }
  };

  const handleSaveMapboxToken = () => {
    if (mapboxToken) {
      localStorage.setItem('mapboxToken', mapboxToken);
      // Reinitialize Mapbox service with new token
      initMapboxService(mapboxToken);
      showAlert('Mapbox token saved!', 'Settings Updated', 'success');
    }
  };

  const handleClearAllJobs = async () => {
    const confirmed = window.confirm(
      `⚠️ WARNING: This will DELETE ALL jobs and routes for ${selectedDate}.\n\n` +
      `This action cannot be undone.\n\n` +
      `Are you sure you want to continue?`
    );

    if (!confirmed) return;

    const doubleConfirm = window.confirm(
      `🚨 FINAL CONFIRMATION\n\n` +
      `You are about to permanently delete:\n` +
      `• ${jobs.length} jobs\n` +
      `• ${Object.keys(routes).length} routes\n\n` +
      `Type OK in the next dialog to proceed.`
    );

    if (!doubleConfirm) return;

    try {
      console.log('🗑️ Clearing all jobs and routes for', selectedDate);

      // Clear local state immediately
      setJobs([]);
      setRoutes({});

      // Clear in Firebase
      await firebaseService.saveDocument('hou_routing', `jobs_${selectedDate}`, {
        jobs: [],
        date: selectedDate,
        lastUpdated: new Date().toISOString(),
        clearedBy: currentUser?.displayName || currentUser?.email,
        clearedAt: new Date().toISOString()
      });

      await firebaseService.saveDocument('hou_routing', `routes_${selectedDate}`, {
        routes: {},
        date: selectedDate,
        lastUpdated: new Date().toISOString(),
        clearedBy: currentUser?.displayName || currentUser?.email,
        clearedAt: new Date().toISOString()
      });

      console.log('✅ All jobs and routes cleared successfully');
      showAlert(`All jobs and routes for ${selectedDate} have been deleted.\n\nYou can now import a fresh CSV file.`, 'Data Cleared', 'success');
    } catch (error) {
      console.error('❌ Error clearing jobs and routes:', error);
      showAlert('Error clearing data. Please try again.', 'Error', 'error');
    }
  };

  const toggleCompanyMeetingMode = async () => {
    const newMode = !companyMeetingMode;
    setCompanyMeetingMode(newMode);

    // Save the setting to Firebase
    try {
      if (currentUser) {
        await firebaseService.saveWithMetadata(
          'hou_routing',
          `jobs_${selectedDate}`,
          {
            jobs: jobs,
            date: selectedDate,
            companyMeetingMode: newMode
          },
          {
            name: currentUser.displayName || currentUser.email,
            id: currentUser.uid
          }
        );
      } else {
        await firebaseService.saveDocument('hou_routing', `jobs_${selectedDate}`, {
          jobs: jobs,
          date: selectedDate,
          companyMeetingMode: newMode,
          lastUpdated: new Date().toISOString()
        });
      }

      const modeText = newMode ? 'enabled' : 'disabled';
      console.log(`✅ Company Meeting Mode ${modeText}`);
      showAlert(
        newMode
          ? 'Company Meeting Mode is now ON.\n\nAll technicians will start from the Conroe office at 9:00 AM.'
          : 'Company Meeting Mode is now OFF.\n\nTechnicians will start from their assigned offices at 8:15 AM.',
        `Meeting Mode ${modeText.charAt(0).toUpperCase() + modeText.slice(1)}`,
        'success'
      );
    } catch (error) {
      console.error('Error toggling company meeting mode:', error);
      showAlert('Error updating meeting mode. Please try again.', 'Error', 'error');
      // Revert on error
      setCompanyMeetingMode(!newMode);
    }
  };

  const renderJobsView = () => {
    // Using memoized unassignedJobs and assignedJobs from component level

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>Daily Jobs - {selectedDate}</h3>
            <ViewSelector />
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
              {jobs.length} total | {unassignedJobs.length} unassigned | {assignedJobs.length} assigned
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {/* Date Navigation */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              backgroundColor: 'var(--surface-secondary)',
              borderRadius: '6px',
              border: '2px solid var(--primary-color)'
            }}>
              <button
                className="btn btn-secondary btn-small"
                onClick={() => {
                  const date = new Date(selectedDate + 'T12:00:00');
                  date.setDate(date.getDate() - 1);
                  setSelectedDate(date.toISOString().split('T')[0]);
                }}
                title="Previous day"
                style={{ padding: '4px 8px', minWidth: 'auto' }}
              >
                <i className="fas fa-chevron-left"></i>
              </button>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <label style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px', fontWeight: '600' }}>
                  SELECT DATE
                </label>
                <input
                  type="date"
                  className="form-control"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  style={{
                    width: '150px',
                    fontSize: '13px',
                    padding: '6px 8px',
                    fontWeight: '600',
                    textAlign: 'center'
                  }}
                />
              </div>
              <button
                className="btn btn-secondary btn-small"
                onClick={() => {
                  const date = new Date(selectedDate + 'T12:00:00');
                  date.setDate(date.getDate() + 1);
                  setSelectedDate(date.toISOString().split('T')[0]);
                }}
                title="Next day"
                style={{ padding: '4px 8px', minWidth: 'auto' }}
              >
                <i className="fas fa-chevron-right"></i>
              </button>
              <button
                className="btn btn-primary btn-small"
                onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                title="Go to today"
                style={{ padding: '4px 12px', marginLeft: '4px' }}
              >
                <i className="fas fa-calendar-day"></i> Today
              </button>
            </div>

            <button
              className="btn btn-success"
              onClick={() => setShowOptimizeModal(true)}
              disabled={optimizing || unassignedJobs.length === 0}
            >
              <i className="fas fa-magic"></i> {optimizing ? 'Optimizing...' : 'Auto-Optimize'}
            </button>
            <button className="btn btn-primary" onClick={() => setShowImportModal(true)}>
              <i className="fas fa-upload"></i> Import CSV
            </button>
            <button
              className={`btn ${companyMeetingMode ? 'btn-warning' : 'btn-secondary'}`}
              onClick={toggleCompanyMeetingMode}
              title={companyMeetingMode ? 'Meeting Mode: All techs start at Conroe at 9:00 AM' : 'Normal Mode: Techs start at their offices at 8:15 AM'}
              style={{
                fontWeight: companyMeetingMode ? '600' : 'normal',
                border: companyMeetingMode ? '2px solid var(--warning-color)' : 'none'
              }}
            >
              <i className={`fas ${companyMeetingMode ? 'fa-users' : 'fa-user-clock'}`}></i> {companyMeetingMode ? 'Meeting Mode ON' : 'Meeting Mode'}
            </button>
            <button
              className="btn btn-danger"
              onClick={handleClearAllJobs}
              disabled={jobs.length === 0}
              title="Delete all jobs and routes for this date"
            >
              <i className="fas fa-trash-alt"></i> Clear All
            </button>
          </div>
        </div>

        <div className="dashboard-grid" style={{ marginBottom: '24px' }}>
          <div className="metric-card">
            <div className="metric-header">
              <h3>Total Jobs</h3>
            </div>
            <div className="metric-value">{jobs.length}</div>
          </div>
          <div className="metric-card">
            <div className="metric-header">
              <h3>Unassigned</h3>
            </div>
            <div className="metric-value" style={{ color: 'var(--warning-color)' }}>{unassignedJobs.length}</div>
          </div>
          <div className="metric-card">
            <div className="metric-header">
              <h3>Assigned</h3>
            </div>
            <div className="metric-value" style={{ color: 'var(--success-color)' }}>{assignedJobs.length}</div>
          </div>
          <div className="metric-card">
            <div className="metric-header">
              <h3>Total Hours</h3>
            </div>
            <div className="metric-value">{jobs.reduce((sum, j) => sum + j.duration, 0).toFixed(1)}</div>
          </div>
        </div>

        {/* Unassigned Jobs */}
        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="card-header">
            <h3><i className="fas fa-clipboard-list"></i> Unassigned Jobs ({unassignedJobs.length})</h3>
          </div>
          <div className="table-container">
            {unassignedJobs.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Address</th>
                    <th>Zone</th>
                    <th>Type</th>
                    <th>Timeframe</th>
                    <th>Duration</th>
                    <th>2 Techs?</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {unassignedJobs.map((job) => (
                    <tr key={job.id}>
                      <td><strong>{job.customerName}</strong></td>
                      <td>{job.address}</td>
                      <td>
                        <span className="status-badge status-available">{job.zone}</span>
                      </td>
                      <td>{job.jobType}</td>
                      <td>{job.timeframeStart} - {job.timeframeEnd}</td>
                      <td>{job.duration}h</td>
                      <td>
                        {job.requiresTwoTechs ? (
                          <span style={{ color: 'var(--warning-color)' }}>
                            <i className="fas fa-users"></i> Yes
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)' }}>No</span>
                        )}
                      </td>
                      <td>
                        <select
                          className="form-control"
                          style={{ width: 'auto', padding: '4px 8px', fontSize: '14px' }}
                          onChange={(e) => {
                            if (e.target.value) {
                              assignJobToTech(job.id, e.target.value);
                              e.target.value = '';
                            }
                          }}
                          defaultValue=""
                        >
                          <option value="">Assign to...</option>
                          {getLeadTechs.map(tech => (
                            <option key={tech.id} value={tech.id}>
                              {tech.name} ({tech.zone}) - {offices[tech.office]?.shortName}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                All jobs have been assigned!
              </p>
            )}
          </div>
        </div>

        {/* Assigned Jobs */}
        {assignedJobs.length > 0 && (
          <div className="card">
            <div className="card-header">
              <h3><i className="fas fa-check-circle"></i> Assigned Jobs ({assignedJobs.length})</h3>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Zone</th>
                    <th>Type</th>
                    <th>Duration</th>
                    <th>Assigned To</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assignedJobs.map((job) => {
                    const tech = getTechList.find(t => t.id === job.assignedTech);
                    return (
                      <tr key={job.id}>
                        <td><strong>{job.customerName}</strong></td>
                        <td>{job.zone}</td>
                        <td>{job.jobType}</td>
                        <td>{job.duration}h</td>
                        <td>
                          <span style={{ color: 'var(--info-color)', fontWeight: '500' }}>
                            <i className="fas fa-user"></i> {tech?.name || 'Unknown'}
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn btn-secondary btn-small"
                            onClick={() => unassignJob(job.id)}
                          >
                            <i className="fas fa-times"></i> Unassign
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };


  const handleRefresh = () => {
    // No need to manually refresh - real-time sync handles updates
    showAlert('This page updates automatically! Changes from other users appear in real-time.', 'Real-time Updates', 'info');
  };

  // View selector component for consistency across all views
  const ViewSelector = () => (
    <select
      value={activeView}
      onChange={(e) => setActiveView(e.target.value)}
      style={{
        padding: '4px 24px 4px 8px',
        fontSize: '12px',
        fontWeight: '500',
        border: '1px solid #e5e7eb',
        borderRadius: '4px',
        backgroundColor: 'var(--surface-color)',
        cursor: 'pointer',
        appearance: 'none',
        backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'10\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%23666\' d=\'M6 9L1 4h10z\'/%3E%3C/svg%3E")',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 6px center',
        color: 'var(--text-secondary)'
      }}
    >
      <option value="routing">Routing</option>
      <option value="kanban">Kanban Calendar</option>
      <option value="jobs">Jobs</option>
    </select>
  );

  const renderRoutingView = () => {
    // Using memoized getLeadTechs and getDemoTechs
    const allTechs = [...getLeadTechs, ...getDemoTechs];

    return (
      <ManualMode
        jobs={jobs}
        routes={routes}
        techs={allTechs}
        offices={offices}
        mapboxToken={mapboxToken}
        onUpdateRoutes={saveRoutes}
        onUpdateJobs={saveJobs}
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        onImportCSV={() => setShowImportModal(true)}
        activeUsers={activeUsers}
        scheduleForDay={scheduleForDay}
        staffingData={staffingData}
        showAlert={showAlert}
        showConfirm={showConfirm}
        techStartTimes={techStartTimes}
        setTechStartTimes={setTechStartTimes}
        companyMeetingMode={companyMeetingMode}
        isFullScreen={isFullScreen}
        onToggleFullScreen={() => setIsFullScreen(!isFullScreen)}
        viewSelector={<ViewSelector />}
      />
    );
  };

  const renderKanbanView = () => {
    // Using memoized getLeadTechs and getDemoTechs
    const allTechs = [...getLeadTechs, ...getDemoTechs];

    return (
      <KanbanCalendar
        jobs={jobs}
        routes={routes}
        techs={allTechs}
        offices={offices}
        mapboxToken={mapboxToken}
        onUpdateRoutes={saveRoutes}
        onUpdateJobs={saveJobs}
        selectedDate={selectedDate}
        activeUsers={activeUsers}
        scheduleForDay={scheduleForDay}
        showAlert={showAlert}
        showConfirm={showConfirm}
        techStartTimes={techStartTimes}
        setTechStartTimes={setTechStartTimes}
        companyMeetingMode={companyMeetingMode}
        viewSelector={<ViewSelector />}
      />
    );
  };

  // Full-screen mode: Render without Layout
  if (isFullScreen) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'var(--surface-color)',
        zIndex: 9999,
        overflow: 'auto',
        padding: '16px'
      }}>
        {loading ? (
          <p>Loading...</p>
        ) : (
          <>
            {activeView === 'routing' && renderRoutingView()}
            {activeView === 'kanban' && renderKanbanView()}
            {activeView === 'jobs' && renderJobsView()}
          </>
        )}

        {/* CSV Import Modal */}
        {showImportModal && (
          <div className="modal-overlay active" onClick={() => setShowImportModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3><i className="fas fa-upload"></i> Import Daily Jobs</h3>
                <button className="modal-close" onClick={() => setShowImportModal(false)}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="modal-body">
                <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
                  Select your daily export CSV file. The file should include customer info, addresses, timeframes, durations, and zone assignments.
                </p>
                <div style={{ marginBottom: '20px' }}>
                  <label htmlFor="csvFile" className="btn btn-secondary" style={{ cursor: 'pointer', display: 'inline-block' }}>
                    <i className="fas fa-file-csv"></i> Choose CSV File
                  </label>
                  <input
                    type="file"
                    id="csvFile"
                    accept=".csv"
                    onChange={handleCSVImport}
                    style={{ display: 'none' }}
                  />
                </div>
                <div style={{ padding: '12px', backgroundColor: 'var(--active-bg)', borderRadius: '6px', fontSize: '14px' }}>
                  <strong>Houston Branch CSV Format:</strong>
                  <ul style={{ marginTop: '8px', marginBottom: 0, paddingLeft: '20px' }}>
                    <li>text (Job ID)</li>
                    <li>route_title (Customer Name | Job Type)</li>
                    <li>customer_address (Houston area)</li>
                    <li>Zone</li>
                    <li>duration (hours)</li>
                    <li>workers (assigned workers array)</li>
                    <li>route_description (includes TF(HH:MM-HH:MM))</li>
                  </ul>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowImportModal(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Auto-Optimize Modal */}
        {showOptimizeModal && (
          <div className="modal-overlay active" onClick={() => setShowOptimizeModal(false)}>
            <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3><i className="fas fa-magic"></i> Automatic Route Optimization</h3>
                <button className="modal-close" onClick={() => setShowOptimizeModal(false)}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="modal-body">
                <p style={{ marginBottom: '20px', color: 'var(--text-secondary)' }}>
                  The optimizer will automatically assign all unassigned jobs to technicians and optimize their routes.
                </p>

                <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: 'var(--surface-secondary)', borderRadius: '8px' }}>
                  <h4 style={{ margin: 0, marginBottom: '12px' }}>What the optimizer does:</h4>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px' }}>
                    <li>Balances workload across available technicians</li>
                    <li>Optimizes route order to minimize drive time</li>
                    <li>Respects job timeframe windows</li>
                    <li>Keeps techs in their zones when possible</li>
                    <li>Auto-assigns demo techs to 2-person jobs</li>
                    <li>Excludes Management (MIT Leads available for occasional assignments)</li>
                  </ul>
                </div>

                <div className="form-group">
                  <label htmlFor="mapboxToken">
                    Mapbox API Token
                    <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      (Required for drive time calculations)
                    </span>
                  </label>
                  <input
                    type="text"
                    id="mapboxToken"
                    className="form-control"
                    value={mapboxToken}
                    onChange={(e) => setMapboxToken(e.target.value)}
                    placeholder="pk.your-mapbox-token-here"
                  />
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Get a free token at{' '}
                    <a href="https://www.mapbox.com" target="_blank" rel="noopener noreferrer">
                      mapbox.com
                    </a>
                  </p>
                </div>

                {mapboxToken && (
                  <button
                    className="btn btn-secondary"
                    onClick={handleSaveMapboxToken}
                    style={{ marginBottom: '16px' }}
                  >
                    <i className="fas fa-save"></i> Save Token
                  </button>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowOptimizeModal(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-success"
                  onClick={handleAutoOptimize}
                  disabled={!mapboxToken}
                >
                  <i className="fas fa-magic"></i> Optimize Routes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    );
  }

  // Normal mode: Render with Layout (original structure)
  return (
    <Layout>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          {activeView === 'routing' && renderRoutingView()}
          {activeView === 'kanban' && renderKanbanView()}
          {activeView === 'jobs' && renderJobsView()}
        </>
      )}

        {/* CSV Import Modal */}
        {showImportModal && (
          <div className="modal-overlay active" onClick={() => setShowImportModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3><i className="fas fa-upload"></i> Import Daily Jobs</h3>
                <button className="modal-close" onClick={() => setShowImportModal(false)}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="modal-body">
                <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
                  Select your daily export CSV file. The file should include customer info, addresses, timeframes, durations, and zone assignments.
                </p>
                <div style={{ marginBottom: '20px' }}>
                  <label htmlFor="csvFile" className="btn btn-secondary" style={{ cursor: 'pointer', display: 'inline-block' }}>
                    <i className="fas fa-file-csv"></i> Choose CSV File
                  </label>
                  <input
                    type="file"
                    id="csvFile"
                    accept=".csv"
                    onChange={handleCSVImport}
                    style={{ display: 'none' }}
                  />
                </div>
                <div style={{ padding: '12px', backgroundColor: 'var(--active-bg)', borderRadius: '6px', fontSize: '14px' }}>
                  <strong>Houston Branch CSV Format:</strong>
                  <ul style={{ marginTop: '8px', marginBottom: 0, paddingLeft: '20px' }}>
                    <li>text (Job ID)</li>
                    <li>route_title (Customer Name | Job Type)</li>
                    <li>customer_address (Houston area)</li>
                    <li>Zone</li>
                    <li>duration (hours)</li>
                    <li>workers (assigned workers array)</li>
                    <li>route_description (includes TF(HH:MM-HH:MM))</li>
                  </ul>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowImportModal(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Auto-Optimize Modal */}
        {showOptimizeModal && (
          <div className="modal-overlay active" onClick={() => setShowOptimizeModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3><i className="fas fa-magic"></i> Auto-Optimize Routes</h3>
                <button className="modal-close" onClick={() => setShowOptimizeModal(false)}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="modal-body">
                <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
                  This will automatically optimize all routes using geographic proximity and drive times.
                </p>

                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label htmlFor="mapboxToken">
                    Mapbox API Token
                    <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      (Required for drive time calculations)
                    </span>
                  </label>
                  <input
                    type="text"
                    id="mapboxToken"
                    className="form-control"
                    value={mapboxToken}
                    onChange={(e) => setMapboxToken(e.target.value)}
                    placeholder="pk.your-mapbox-token-here"
                  />
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Get a free token at{' '}
                    <a href="https://www.mapbox.com" target="_blank" rel="noopener noreferrer">
                      mapbox.com
                    </a>
                  </p>
                </div>

                {mapboxToken && (
                  <button
                    className="btn btn-secondary"
                    onClick={handleSaveMapboxToken}
                    style={{ marginBottom: '16px' }}
                  >
                    <i className="fas fa-save"></i> Save Token
                  </button>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowOptimizeModal(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-success"
                  onClick={handleAutoOptimize}
                  disabled={!mapboxToken}
                >
                  <i className="fas fa-magic"></i> Optimize Routes
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation Modal */}
        <ConfirmModal
          show={modal.show}
          onClose={closeModal}
          onConfirm={modal.onConfirm}
          onCancel={modal.onCancel}
          title={modal.title}
          message={modal.message}
          type={modal.type}
        />

        {/* Loading Modal with Progress */}
        <LoadingModal
          isOpen={loadingState.isOpen}
          title={loadingState.title}
          message={loadingState.message}
          progress={loadingState.progress}
          currentStep={loadingState.currentStep}
          totalSteps={loadingState.totalSteps}
          currentStepNumber={loadingState.currentStepNumber}
          showSteps={loadingState.showSteps}
        />
      </div>
    </Layout>
  );
};

export default Routing;
