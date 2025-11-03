/**
 * Routing Page - Main routing and job assignment interface
 * Features: Company Meeting Mode for all-staff meetings at Conroe office
 */
import { useState, useEffect, useRef } from 'react';
import Layout from '../components/common/Layout';
import ManualMode from '../components/routing/ManualMode';
import KanbanCalendar from '../components/routing/KanbanCalendar';
import ConfirmModal from '../components/routing/ConfirmModal';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import firebaseService from '../services/firebaseService';
import { getMapboxService, initMapboxService } from '../services/mapboxService';
import { getCalculatedScheduleForDay } from '../utils/calendarManager';
import {
  optimizeRoute,
  balanceWorkload,
  assignDemoTechs,
  getRoutingEligibleTechs,
  calculateRouteSummary
} from '../utils/routeOptimizer';
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
  const [modal, setModal] = useState({ show: false, title: '', message: '', type: 'info', onConfirm: null });
  const [techStartTimes, setTechStartTimes] = useState({}); // Store custom start times for techs (for late starts)
  const [companyMeetingMode, setCompanyMeetingMode] = useState(false); // All techs start at Conroe office at 9am
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

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
    setModal({ show: true, title, message, type, onConfirm: null });
  };

  const showConfirm = (message, title, onConfirm, type = 'question') => {
    setModal({ show: true, title, message, type, onConfirm });
  };

  const closeModal = () => {
    setModal({ show: false, title: '', message: '', type: 'info', onConfirm: null });
  };

  // Real-time subscriptions for jobs and routes
  useEffect(() => {
    if (!currentUser) return;

    setLoading(true);

    // Subscribe to real-time jobs updates
    const jobsUnsubscribe = firebaseService.subscribeToDocument(
      'hou_routing',
      `jobs_${selectedDate}`,
      (data) => {
        setJobs(data?.jobs || []);
        setCompanyMeetingMode(data?.companyMeetingMode || false);
        setLoading(false);
      }
    );

    // Subscribe to real-time routes updates
    const routesUnsubscribe = firebaseService.subscribeToDocument(
      'hou_routing',
      `routes_${selectedDate}`,
      (data) => {
        const loadedRoutes = data?.routes || {};
        const enrichedRoutes = enrichRoutesWithEmails(loadedRoutes);
        setRoutes(enrichedRoutes);
      }
    );

    // Set presence to show this user is viewing routes
    const user = {
      id: currentUser.uid,
      name: currentUser.displayName || currentUser.email,
      email: currentUser.email
    };
    firebaseService.setPresence('routing', selectedDate, user);

    // Subscribe to presence updates
    const presenceUnsubscribe = firebaseService.subscribeToPresence(
      'routing',
      selectedDate,
      (users) => {
        // Filter out current user and show others
        const otherUsers = users.filter(u => u.userId !== currentUser.uid);
        setActiveUsers(otherUsers);
      }
    );

    // Cleanup function
    return () => {
      jobsUnsubscribe();
      routesUnsubscribe();
      presenceUnsubscribe();
      firebaseService.removePresence('routing', selectedDate, currentUser.uid);
    };
  }, [selectedDate, currentUser, staffingData]);

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

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const parsedJobs = parseCSV(text);
      setJobs(parsedJobs);
      saveJobs(parsedJobs);
      setShowImportModal(false);
      showAlert(`Successfully imported ${parsedJobs.length} jobs!`, 'Import Complete', 'success');
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

  const saveJobs = async (jobsData) => {
    try {
      // Don't do optimistic update - let Firebase subscription handle it
      // This prevents race conditions with child component's local state
      const stack = new Error().stack;
      console.log('📤 Saving jobs to Firebase...', jobsData.length, 'jobs');
      console.log('📍 Called from:', stack.split('\n')[2]);

      // Save to Firebase with metadata for conflict tracking
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

  const getTechList = () => {
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
  };

  const getDemoTechs = () => {
    return getTechList().filter(t => t.isDemoTech);
  };

  const getLeadTechs = () => {
    const allTechs = getTechList();
    return getRoutingEligibleTechs(allTechs);
  };

  const assignJobToTech = async (jobId, techId) => {
    const updatedJobs = jobs.map(job => {
      if (job.id === jobId) {
        return { ...job, assignedTech: techId, status: 'assigned' };
      }
      return job;
    });

    setJobs(updatedJobs);
    await saveJobs(updatedJobs);

    // Update routes
    const tech = getTechList().find(t => t.id === techId);
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
    await saveRoutes(updatedRoutes);
  };

  const saveRoutes = async (routesData) => {
    try {
      // Don't do optimistic update - let Firebase subscription handle it
      // This prevents race conditions with child component's local state
      const stack = new Error().stack;
      console.log('📤 Saving routes to Firebase...', Object.keys(routesData).length, 'routes');
      console.log('📍 Called from:', stack.split('\n')[2]);

      // Save to Firebase with metadata for conflict tracking
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

  const unassignJob = async (jobId) => {
    const updatedJobs = jobs.map(job => {
      if (job.id === jobId) {
        return { ...job, assignedTech: null, status: 'unassigned' };
      }
      return job;
    });

    setJobs(updatedJobs);
    await saveJobs(updatedJobs);

    // Remove from routes
    const updatedRoutes = { ...routes };
    Object.keys(updatedRoutes).forEach(techId => {
      updatedRoutes[techId].jobs = updatedRoutes[techId].jobs.filter(j => j.id !== jobId);
    });

    setRoutes(updatedRoutes);
    await saveRoutes(updatedRoutes);
  };

  const handleAutoOptimize = async () => {
    if (!mapboxToken) {
      showAlert('Please enter a Mapbox API token in the optimization settings.', 'Mapbox Token Required', 'warning');
      return;
    }

    setOptimizing(true);
    setShowOptimizeModal(false);

    try {
      const leadTechs = getLeadTechs();
      const demoTechs = getDemoTechs();
      const unassignedJobs = jobs.filter(j => !j.assignedTech);

      if (unassignedJobs.length === 0) {
        showAlert('No unassigned jobs to optimize.', 'Nothing to Optimize', 'info');
        setOptimizing(false);
        return;
      }

      // Step 2: Geocode all job addresses
      const mapbox = getMapboxService();
      const geocodedJobs = await Promise.all(
        unassignedJobs.map(async (job) => {
          const coords = await mapbox.geocodeAddress(job.address);
          return { ...job, coordinates: coords };
        })
      );

      // Step 3: Balance workload across techs with geocoded jobs
      const balancedAssignments = balanceWorkload(geocodedJobs, leadTechs);

      // Step 4: Optimize each tech's route with Mapbox
      const optimizedRoutes = {};

      for (const [techId, assignment] of Object.entries(balancedAssignments)) {
        if (assignment.jobs.length === 0) continue;

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
      }

      // Step 5: Auto-assign demo techs (keep them with same tech all day)
      const { routes: finalRoutes } = assignDemoTechs(optimizedRoutes, demoTechs);

      // Update state
      setRoutes(finalRoutes);
      await saveRoutes(finalRoutes);

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
      await saveJobs(updatedJobs);

      showAlert(`Successfully optimized routes for ${Object.keys(finalRoutes).length} technicians!`, 'Optimization Complete', 'success');
    } catch (error) {
      console.error('Optimization error:', error);
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
    const unassignedJobs = jobs.filter(j => !j.assignedTech);
    const assignedJobs = jobs.filter(j => j.assignedTech);

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h3 style={{ margin: 0, marginBottom: '8px' }}>Daily Jobs - {selectedDate}</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
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
                          {getLeadTechs().map(tech => (
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
                    const tech = getTechList().find(t => t.id === job.assignedTech);
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

  const renderRoutingView = () => {
    const leadTechs = getLeadTechs();
    const demoTechs = getDemoTechs();
    const allTechs = [...leadTechs, ...demoTechs];

    return (
      <ManualMode
        jobs={jobs}
        routes={routes}
        techs={allTechs}
        offices={offices}
        mapboxToken={mapboxToken}
        onUpdateRoutes={saveRoutes}
        onUpdateJobs={saveJobs}
        onRefresh={handleRefresh}
        selectedDate={selectedDate}
        onImportCSV={() => setShowImportModal(true)}
        activeUsers={activeUsers}
        scheduleForDay={scheduleForDay}
        staffingData={staffingData}
        showAlert={showAlert}
        showConfirm={showConfirm}
        techStartTimes={techStartTimes}
        setTechStartTimes={setTechStartTimes}
        companyMeetingMode={companyMeetingMode}
      />
    );
  };

  const renderKanbanView = () => {
    const leadTechs = getLeadTechs();
    const demoTechs = getDemoTechs();
    const allTechs = [...leadTechs, ...demoTechs];

    return (
      <KanbanCalendar
        jobs={jobs}
        routes={routes}
        techs={allTechs}
        offices={offices}
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
        <div className="tab-content active">
        <div className="tab-controls" style={{ marginBottom: '16px' }}>
          <div className="sub-nav">
            <button
              className={`sub-nav-btn ${activeView === 'routing' ? 'active' : ''}`}
              onClick={() => setActiveView('routing')}
            >
              <i className="fas fa-route"></i> Routing
            </button>
            <button
              className={`sub-nav-btn ${activeView === 'kanban' ? 'active' : ''}`}
              onClick={() => setActiveView('kanban')}
            >
              <i className="fas fa-columns"></i> Kanban Calendar
            </button>
            <button
              className={`sub-nav-btn ${activeView === 'jobs' ? 'active' : ''}`}
              onClick={() => setActiveView('jobs')}
            >
              <i className="fas fa-clipboard-list"></i> Jobs
            </button>
            <button
              className="sub-nav-btn"
              onClick={() => setIsFullScreen(!isFullScreen)}
              style={{
                marginLeft: 'auto',
                backgroundColor: isFullScreen ? 'var(--info-color)' : undefined,
                color: isFullScreen ? 'white' : undefined
              }}
              title={isFullScreen ? 'Exit Full Screen' : 'Enter Full Screen'}
            >
              <i className={`fas ${isFullScreen ? 'fa-compress' : 'fa-expand'}`}></i> {isFullScreen ? 'Exit' : 'Full Screen'}
            </button>
          </div>

          {/* Active Users Indicator */}
          {activeUsers.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              backgroundColor: 'var(--status-in-progress-bg)',
              borderRadius: '6px',
              fontSize: '12px',
              marginBottom: '12px'
            }}>
              <i className="fas fa-users" style={{ color: 'var(--success-color)' }}></i>
              <span style={{ fontWeight: '600', color: 'var(--success-color)' }}>
                {activeUsers.length} {activeUsers.length === 1 ? 'person' : 'people'} viewing:
              </span>
              {activeUsers.map((user, idx) => (
                <span key={idx} style={{
                  padding: '2px 8px',
                  backgroundColor: 'var(--success-color)',
                  color: 'white',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: '600'
                }}>
                  {user.userName}
                </span>
              ))}
              <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontStyle: 'italic', marginLeft: 'auto' }}>
                Live updates enabled
              </span>
            </div>
          )}
        </div>

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
                    <li>Excludes Management and MIT Leads (except 2nd shift)</li>
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
      <div className="tab-content active">
        <div className="tab-controls" style={{ marginBottom: '16px' }}>
          <div className="sub-nav">
            <button
              className={`sub-nav-btn ${activeView === 'routing' ? 'active' : ''}`}
              onClick={() => setActiveView('routing')}
            >
              <i className="fas fa-route"></i> Routing
            </button>
            <button
              className={`sub-nav-btn ${activeView === 'kanban' ? 'active' : ''}`}
              onClick={() => setActiveView('kanban')}
            >
              <i className="fas fa-columns"></i> Kanban Calendar
            </button>
            <button
              className={`sub-nav-btn ${activeView === 'jobs' ? 'active' : ''}`}
              onClick={() => setActiveView('jobs')}
            >
              <i className="fas fa-clipboard-list"></i> Jobs
            </button>
            <button
              className="sub-nav-btn"
              onClick={() => setIsFullScreen(!isFullScreen)}
              style={{
                marginLeft: 'auto'
              }}
              title="Enter Full Screen"
            >
              <i className="fas fa-expand"></i> Full Screen
            </button>
          </div>

          {/* Active Users Indicator */}
          {activeUsers.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              backgroundColor: 'var(--status-in-progress-bg)',
              borderRadius: '6px',
              fontSize: '12px',
              marginBottom: '12px'
            }}>
              <i className="fas fa-users" style={{ color: 'var(--success-color)' }}></i>
              <span style={{ fontWeight: '600', color: 'var(--success-color)' }}>
                {activeUsers.length} {activeUsers.length === 1 ? 'person' : 'people'} viewing:
              </span>
              {activeUsers.map((user, idx) => (
                <span key={idx} style={{
                  padding: '2px 8px',
                  backgroundColor: 'var(--success-color)',
                  color: 'white',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: '600'
                }}>
                  {user.userName}
                </span>
              ))}
              <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontStyle: 'italic', marginLeft: 'auto' }}>
                Live updates enabled
              </span>
            </div>
          )}
        </div>

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
          title={modal.title}
          message={modal.message}
          type={modal.type}
        />
      </div>
    </Layout>
  );
};

export default Routing;
