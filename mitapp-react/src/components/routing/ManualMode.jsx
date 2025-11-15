import { useState, useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getMapboxService } from '../../services/mapboxService';
import { optimizeRoute, calculateRouteQuality } from '../../utils/routeOptimizer';
import googleCalendarService from '../../services/googleCalendarService';
import TwoTechAssignmentModal from './TwoTechAssignmentModal';
import LoadingModal from './LoadingModal';
import RouteQualityTooltip from './RouteQualityTooltip';
import { GOOGLE_CLIENT_ID } from '../../config/firebase';
import { formatTimeAMPM, sanitizeRouteData } from '../../utils/routingHelpers';

const ManualMode = ({
  jobs: initialJobs,
  routes: initialRoutes,
  techs,
  offices,
  mapboxToken,
  onUpdateRoutes,
  onUpdateJobs,
  selectedDate,
  onDateChange,
  onImportCSV,
  activeUsers = [],
  scheduleForDay,
  staffingData,
  showAlert,
  showConfirm,
  techStartTimes,
  setTechStartTimes,
  companyMeetingMode,
  onToggleCompanyMeetingMode,
  isFullScreen,
  onToggleFullScreen,
  actionButtons,
  viewSelector
}) => {
  const [jobs, setJobs] = useState(initialJobs);
  const [routes, setRoutes] = useState(initialRoutes);
  const [buildingRoute, setBuildingRoute] = useState([]);
  const [showAllJobs, setShowAllJobs] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [hideOffTechs, setHideOffTechs] = useState(() => {
    const saved = localStorage.getItem('hideOffTechs');
    return saved ? JSON.parse(saved) : false;
  });
  const [hoveredJob, setHoveredJob] = useState(null);
  const [draggedRoute, setDraggedRoute] = useState(null);
  const [selectedJobOnMap, setSelectedJobOnMap] = useState(null);
  const [selectedTech, setSelectedTech] = useState(null);
  const [pushingToCalendar, setPushingToCalendar] = useState(false);
  const hoverTimeoutRef = useRef(null);
  const [googleClientId, setGoogleClientId] = useState(
    localStorage.getItem('googleClientId') || GOOGLE_CLIENT_ID
  );
  const [showGoogleSetup, setShowGoogleSetup] = useState(false);
  const [showTwoTechModal, setShowTwoTechModal] = useState(false);
  const [pendingRouteDropData, setPendingRouteDropData] = useState(null);
  const [officeCoordinates, setOfficeCoordinates] = useState({});
  const [optimizingTechs, setOptimizingTechs] = useState(new Set()); // Track techs with routes being optimized
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
  const officesGeocodedRef = useRef(false);

  // Helper function to format tech names (First Name + Last Initial)
  const formatTechName = (fullName) => {
    if (!fullName) return '';
    const parts = fullName.trim().split(' ');
    if (parts.length < 2) return fullName;
    const firstName = parts[0];
    const lastInitial = parts[parts.length - 1][0];
    return `${firstName} ${lastInitial}.`;
  };

  /**
   * Sanitize route data to fix inconsistencies from old/corrupted data
   * - Ensures jobs in routes have assignedTech set on the job objects
   * - Removes jobs from routes if they no longer exist
   * - Prevents duplicate jobs in unassigned and assigned
   */
  // Geocode office addresses once on mount
  useEffect(() => {
    const geocodeOffices = async () => {
      // Only geocode once per session
      if (officesGeocodedRef.current) {
        return;
      }

      const mapbox = getMapboxService();
      const coords = {};

      for (const [key, office] of Object.entries(offices)) {
        if (office.address) {
          try {
            const coordinates = await mapbox.geocodeAddress(office.address);
            coords[key] = { ...coordinates, name: office.name };
            console.log(`📍 Geocoded ${office.name}:`, coordinates);
          } catch (error) {
            console.error(`Error geocoding ${office.name}:`, error);
          }
        }
      }

      setOfficeCoordinates(coords);
      officesGeocodedRef.current = true;
    };

    if (offices && Object.keys(offices).length > 0 && !officesGeocodedRef.current) {
      geocodeOffices();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Update local state when props change (with sanitization)
  useEffect(() => {
    const { sanitizedJobs, sanitizedRoutes } = sanitizeRouteData(initialJobs, initialRoutes);
    setJobs(sanitizedJobs);
    setRoutes(sanitizedRoutes);
  }, [initialJobs, initialRoutes]);

  // Save hideOffTechs preference to localStorage
  useEffect(() => {
    localStorage.setItem('hideOffTechs', JSON.stringify(hideOffTechs));
  }, [hideOffTechs]);

  // Cleanup hover timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  // Color mapping for different job types
  const getJobTypeColor = (jobType) => {
    const type = jobType.toLowerCase();
    if (type.includes('install')) return 'var(--purple-color)'; // Purple
    if (type.includes('demo prep') || type.includes('demo-prep')) return 'var(--warning-color)'; // Orange
    if (type.includes('demo') && !type.includes('prep') && !type.includes('check')) return 'var(--danger-color)'; // Red/Pink
    if (type.includes('check') || type.includes('service')) return 'var(--info-color)'; // Blue
    if (type.includes('pull')) return 'var(--success-color)'; // Green
    if (type.includes('fs visit') || type.includes('fs-visit')) return '#14b8a6'; // Teal
    return 'var(--text-secondary)'; // Gray for other/unknown
  };

  // Check if a tech is marked as off for the day
  const isTechOff = (techId) => {
    if (!scheduleForDay || !scheduleForDay.staff) return false;

    const staffEntry = scheduleForDay.staff.find(s => s.id === techId);
    if (!staffEntry) return false;

    // Consider tech "off" if status is off, vacation, sick, or no-call-no-show
    const offStatuses = ['off', 'vacation', 'sick', 'no-call-no-show'];
    return offStatuses.includes(staffEntry.status?.toLowerCase());
  };

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    mapboxgl.accessToken = mapboxToken;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-95.5698, 30.1945], // Houston center
      zoom: 10
    });

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [mapboxToken]);

  // Update markers and routes when jobs, filter, or selected tech changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const renderJobMarkers = async () => {
      // Clear existing markers
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];

      const map = mapInstanceRef.current;

      // Remove existing route layers
      if (map.getLayer('route')) map.removeLayer('route');
      if (map.getSource('route')) map.removeSource('route');

      // Add office markers using geocoded coordinates
      Object.values(officeCoordinates).forEach(office => {
        if (!office.lng || !office.lat) return;

        const el = document.createElement('div');
        el.innerHTML = `<div style="background-color: var(--info-color); color: var(--surface-color); padding: 6px 10px; border-radius: 4px; font-weight: bold; font-size: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"><i class="fas fa-building"></i> ${office.name}</div>`;

        const marker = new mapboxgl.Marker(el)
          .setLngLat([office.lng, office.lat])
          .addTo(map);

        markersRef.current.push(marker);
      });

      // Filter jobs based on toggle
      const visibleJobs = showAllJobs
        ? jobs
        : jobs.filter(j => !j.assignedTech);

      // Debug: Check for any job ID duplicates
      const jobIds = jobs.map(j => j.id);
      const duplicateIds = jobIds.filter((id, index) => jobIds.indexOf(id) !== index);
      if (duplicateIds.length > 0) {
        console.error('🚨 DUPLICATE JOB IDS DETECTED:', duplicateIds);
        console.error('Jobs with duplicate IDs:', jobs.filter(j => duplicateIds.includes(j.id)));
      }

      console.log('🗺️ Map render:', {
        totalJobs: jobs.length,
        visibleJobs: visibleJobs.length,
        assignedJobs: jobs.filter(j => j.assignedTech).length,
        unassignedJobs: jobs.filter(j => !j.assignedTech).length,
        showAllJobs
      });

      // Geocode and add job markers
      const mapbox = getMapboxService();

      for (const job of visibleJobs) {
        // Use cached coordinates or geocode
        let coords = job.coordinates;
        if (!coords && job.address) {
          try {
            coords = await mapbox.geocodeAddress(job.address);
            // Update job with coordinates (optimization for future renders)
            job.coordinates = coords;
          } catch (error) {
            console.error('Geocoding error:', error);
            continue;
          }
        }

        if (!coords || !coords.lng || !coords.lat) continue;

        // Determine marker color based on job type and status
        let markerColor = getJobTypeColor(job.jobType);

        // Override with status colors
        if (buildingRoute.some(j => j.id === job.id)) {
          markerColor = '#FFD700'; // Bright yellow for selected jobs in building route
        } else if (job.assignedTech && !showAllJobs) {
          continue; // Skip assigned jobs if not showing all
        } else if (job.assignedTech) {
          // Dim the color for assigned jobs
          markerColor = markerColor + '80'; // Add transparency
        }

        // For requested tech jobs: bold border and pulsing animation
        const borderWidth = job.requestedTech ? '5px' : '3px';
        const borderColor = job.requestedTech ? '#ff9800' : 'var(--surface-color)'; // Orange for requested
        const pulseAnimation = job.requestedTech ? 'pulse-marker 2s ease-in-out infinite' : 'none';

        const el = document.createElement('div');
        el.style.cursor = 'pointer';
        el.innerHTML = `
          <style>
            @keyframes pulse-marker {
              0%, 100% {
                box-shadow: 0 2px 8px rgba(0,0,0,0.3), 0 0 0 0 rgba(255, 152, 0, 0.7);
              }
              50% {
                box-shadow: 0 2px 8px rgba(0,0,0,0.3), 0 0 0 8px rgba(255, 152, 0, 0);
              }
            }
          </style>
          <div class="job-marker" style="
            background-color: ${markerColor};
            color: var(--surface-color);
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 14px;
            border: ${borderWidth} solid ${borderColor};
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            transition: transform 0.2s;
            animation: ${pulseAnimation};
          ">
            ${job.requiresTwoTechs ? '<i class="fas fa-users" style="font-size: 12px;"></i>' : '<i class="fas fa-map-pin" style="font-size: 12px;"></i>'}
          </div>
        `;

        const marker = new mapboxgl.Marker(el)
          .setLngLat([coords.lng, coords.lat])
          .addTo(map);

        // Show centered popup on hover
        el.addEventListener('mouseenter', () => {
          // Clear any pending hide timeout
          if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
          }
          el.querySelector('.job-marker').style.transform = 'scale(1.2)';
          setHoveredJob(job);
        });

        el.addEventListener('mouseleave', () => {
          el.querySelector('.job-marker').style.transform = 'scale(1)';
          // Delay hiding to allow mouse to move to popup
          hoverTimeoutRef.current = setTimeout(() => {
            setHoveredJob(null);
          }, 100);
        });

        // Click to add to building route
        el.addEventListener('click', () => {
          handleJobClick(job);
        });

        markersRef.current.push(marker);
      }

      // Draw selected tech's route on the map
      if (selectedTech && routes[selectedTech]) {
        const techRoute = routes[selectedTech];
        // Use Conroe office for START during Company Meeting Mode
        const startOfficeKey = companyMeetingMode ? 'office_1' : techRoute.tech.office;
        const startOfficeCoords = officeCoordinates[startOfficeKey];

        // Always return to tech's home office at END
        const returnOfficeKey = techRoute.tech.office;
        const returnOfficeCoords = officeCoordinates[returnOfficeKey];

        if (!startOfficeCoords || !startOfficeCoords.lng || !startOfficeCoords.lat) {
          console.warn('Office coordinates not available for route drawing');
          return;
        }

        const coordinates = [[startOfficeCoords.lng, startOfficeCoords.lat]];

        // Add route job markers
        for (let idx = 0; idx < (techRoute.jobs?.length || 0); idx++) {
          const job = techRoute.jobs[idx];

          if (job.coordinates && job.coordinates.lng && job.coordinates.lat) {
            coordinates.push([job.coordinates.lng, job.coordinates.lat]);

            // Add numbered markers for route jobs
            const el = document.createElement('div');
            el.innerHTML = `
              <div style="
                background-color: ${getJobTypeColor(job.jobType)};
                color: var(--surface-color);
                width: 32px;
                height: 32px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                font-size: 14px;
                border: 3px solid var(--surface-color);
                box-shadow: 0 2px 8px rgba(0,0,0,0.4);
              ">${idx + 1}</div>
            `;

            const marker = new mapboxgl.Marker(el)
              .setLngLat([job.coordinates.lng, job.coordinates.lat])
              .setPopup(new mapboxgl.Popup({ offset: 25 })
                .setHTML(`
                  <div style="padding: 8px;">
                    <strong>${idx + 1}. ${job.customerName}</strong><br/>
                    ${job.address}<br/>
                    ${job.jobType} • ${job.duration}h
                    ${job.travelTime ? `<br/>${job.travelTime}min drive` : ''}
                  </div>
                `))
              .addTo(map);

            markersRef.current.push(marker);
          }
        }

        // Return to tech's home office at end
        coordinates.push([returnOfficeCoords.lng, returnOfficeCoords.lat]);

        // Fetch actual driving routes from Mapbox Directions API
        if (coordinates.length > 2 && mapboxToken) {
          // Build Mapbox Directions API request
          const coordinatesString = coordinates.map(coord => `${coord[0]},${coord[1]}`).join(';');
          const directionsUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinatesString}?geometries=geojson&overview=full&access_token=${mapboxToken}`;

          // Create AbortController for timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

          fetch(directionsUrl, { signal: controller.signal })
            .then(response => {
              clearTimeout(timeoutId);
              if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
              }
              return response.json();
            })
            .then(data => {
              if (data.routes && data.routes.length > 0) {
                const route = data.routes[0];

                // Add route layer with actual driving geometry
                map.addSource('route', {
                  type: 'geojson',
                  data: {
                    type: 'Feature',
                    properties: {},
                    geometry: route.geometry
                  }
                });

                map.addLayer({
                  id: 'route',
                  type: 'line',
                  source: 'route',
                  layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                  },
                  paint: {
                    'line-color': '#3b82f6',
                    'line-width': 4,
                    'line-opacity': 0.75
                  }
                });

                // Fit map to show entire route
                const bounds = coordinates.reduce(
                  (bounds, coord) => bounds.extend(coord),
                  new mapboxgl.LngLatBounds(coordinates[0], coordinates[0])
                );
                map.fitBounds(bounds, { padding: 50 });
              } else {
                // Fallback to straight lines if API fails
                console.warn('No route found from Directions API, using straight lines');
                drawStraightLineRoute(map, coordinates);
              }
            })
            .catch(error => {
              clearTimeout(timeoutId);
              if (error.name === 'AbortError') {
                console.warn('Directions API request timed out, using straight lines');
              } else {
                console.error('Error fetching directions:', error);
              }
              drawStraightLineRoute(map, coordinates);
            });
        } else if (coordinates.length > 2) {
          // No mapbox token, use straight lines
          drawStraightLineRoute(map, coordinates);
        }
      }
    };

    // Helper function to draw straight line route (fallback)
    const drawStraightLineRoute = (map, coordinates) => {
      map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: coordinates
          }
        }
      });

      map.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#3b82f6',
          'line-width': 4,
          'line-opacity': 0.75
        }
      });

      // Fit map to show entire route
      const bounds = coordinates.reduce(
        (bounds, coord) => bounds.extend(coord),
        new mapboxgl.LngLatBounds(coordinates[0], coordinates[0])
      );
      map.fitBounds(bounds, { padding: 50 });
    };

    renderJobMarkers();
  }, [jobs, showAllJobs, buildingRoute, selectedTech, routes, officeCoordinates, mapboxToken, companyMeetingMode]);

  const handleJobClick = (job) => {
    // Don't add assigned jobs to building route unless showing all
    if (job.assignedTech && !showAllJobs) return;

    // Check if already in building route
    const existingIndex = buildingRoute.findIndex(j => j.id === job.id);

    if (existingIndex >= 0) {
      // Remove from building route
      setBuildingRoute(buildingRoute.filter(j => j.id !== job.id));
    } else {
      // Add to building route
      setBuildingRoute([...buildingRoute, job]);
    }
  };

  const handleDragStart = (e, routeJobs, techId = null) => {
    setDraggedRoute({ jobs: routeJobs, fromTechId: techId });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // Get available demo techs for assignment
  const getAvailableDemoTechs = (targetTech) => {
    if (!staffingData || !staffingData.zones) return [];

    const demoTechs = [];

    staffingData.zones.forEach(zone => {
      // Get all members with Demo Tech role
      const zoneDemoTechs = zone.members?.filter(member =>
        member.role === 'Demo Tech' &&
        (member.office === targetTech.office || !member.office)  // Same office OR no office set (backward compatibility)
      ) || [];

      demoTechs.push(...zoneDemoTechs);
    });

    // Filter out demo techs already assigned to routes
    const assignedDemoTechIds = new Set();
    Object.values(routes).forEach(route => {
      route.jobs?.forEach(job => {
        if (job.assignedDemoTech) {
          assignedDemoTechIds.add(job.assignedDemoTech.id);
        }
      });
    });

    return demoTechs.filter(dt => !assignedDemoTechIds.has(dt.id));
  };

  // Create helper job for second tech assignment
  const createHelperJob = (originalJob, hours, primaryTechName) => {
    return {
      ...originalJob,
      id: `helper_${originalJob.id}_${Date.now()}`,
      duration: hours,
      isHelperJob: true,
      primaryJobId: originalJob.id,
      primaryTechName: primaryTechName,
      customerName: `[HELP] ${originalJob.customerName}`,
      jobType: `Help ${primaryTechName}`,
      status: 'unassigned',
      assignedTech: null,
      description: `Help ${primaryTechName} with: ${originalJob.description || originalJob.jobType}`
    };
  };

  // Handle two-tech modal completion
  const completeTwoTechRouteAssignment = async (assignments) => {
    if (!pendingRouteDropData) return;

    const { routeJobs, targetTechId, targetTech, shift, startLocation, fromTechId } = pendingRouteDropData;

    console.log('📋 Two-tech modal completed:', {
      totalRouteJobs: routeJobs.length,
      assignments: Object.keys(assignments).length,
      assignmentTypes: Object.values(assignments).map(a => a.type),
      assignmentDetails: assignments
    });

    try {
      // Process assignments and update jobs
      const updatedRouteJobs = [...routeJobs];
      const helperJobsToCreate = [];

      Object.entries(assignments).forEach(([jobId, assignment]) => {
        const jobIndex = updatedRouteJobs.findIndex(j => j.id === jobId);
        if (jobIndex === -1) {
          console.warn('⚠️ Job ID not found in route:', jobId);
          return;
        }

        const job = updatedRouteJobs[jobIndex];
        console.log(`🔧 Processing assignment for ${job.customerName}:`, assignment);

        if (assignment.type === 'demo-tech') {
          // Assign demo tech to job
          console.log(`  ✅ Assigning demo tech ${assignment.demoTech.name} to ${job.customerName}`);
          updatedRouteJobs[jobIndex] = {
            ...job,
            assignedDemoTech: assignment.demoTech,
            demoTechDuration: assignment.wholeDuration ? job.duration : assignment.hours
          };
        } else if (assignment.type === 'second-tech') {
          // Create helper job
          console.log(`  ➕ Creating helper job for ${job.customerName} (${assignment.hours}h)`);
          const helperJob = createHelperJob(job, assignment.hours, targetTech.name);
          console.log(`  📝 Helper job created:`, helperJob.id, helperJob.customerName);
          helperJobsToCreate.push(helperJob);
        } else if (assignment.type === 'no-dt') {
          // Remove DT requirement
          console.log(`  ❌ Removing DT requirement from ${job.customerName}`);
          updatedRouteJobs[jobIndex] = {
            ...job,
            requiresTwoTechs: false
          };
        } else if (assignment.type === 'subcontractor') {
          // Using subcontractors - shorten to 1 hour and remove two-tech requirement
          console.log(`  🏗️ Using subcontractors for ${job.customerName} - shortening to 1hr`);
          updatedRouteJobs[jobIndex] = {
            ...job,
            duration: 1,
            requiresTwoTechs: false,
            usingSubcontractors: true,
            notes: `${job.notes || ''}\n[Using Subcontractors - Meeting time only]`.trim()
          };
        }
      });

      console.log('📤 Sending to route assignment:', {
        updatedRouteJobs: updatedRouteJobs.length,
        helperJobs: helperJobsToCreate.length,
        helperJobNames: helperJobsToCreate.map(h => h.customerName),
        jobsWithDT: updatedRouteJobs.filter(j => j.assignedDemoTech).length
      });

      // Continue with normal route assignment flow
      await continueRouteAssignment(updatedRouteJobs, helperJobsToCreate, targetTechId, targetTech, shift, startLocation, fromTechId);

      // Clear pending data
      setPendingRouteDropData(null);
    } catch (error) {
      console.error('Error completing two-tech assignment:', error);
      showAlert('Error assigning route. Please try again.', 'Error', 'error');
      setPendingRouteDropData(null);
    }
  };

  // Continue route assignment after two-tech modal (or directly if no two-tech jobs)
  const continueRouteAssignment = async (routeJobs, helperJobs, targetTechId, targetTech, shift, startLocation, fromTechId, isOptimistic = false) => {
    try {
      // Geocode jobs that need coordinates
      const mapbox = getMapboxService();
      const geocodedJobs = await Promise.all(
        routeJobs.map(async (job) => {
          if (job.coordinates) return job;
          const coords = await mapbox.geocodeAddress(job.address);
          return { ...job, coordinates: coords };
        })
      );

      // Geocode helper jobs too (they need coordinates to show on map)
      const geocodedHelperJobs = await Promise.all(
        (helperJobs || []).map(async (job) => {
          if (job.coordinates) return job;
          const coords = await mapbox.geocodeAddress(job.address);
          return { ...job, coordinates: coords };
        })
      );

      console.log('📍 Geocoded helper jobs:', geocodedHelperJobs.length);

      // Get existing jobs for this tech
      let existingJobs = [];
      if (routes[targetTechId] && routes[targetTechId].jobs) {
        existingJobs = routes[targetTechId].jobs.filter(
          j => !routeJobs.some(rj => rj.id === j.id)
        );
      }

      // Combine existing and new jobs
      const allJobsForTech = [...existingJobs, ...geocodedJobs];

      // Build distance matrix for optimization
      let distanceMatrix = null;
      if (allJobsForTech.length > 1) {
        const addresses = [
          startLocation,
          ...allJobsForTech.map(j => j.address)
        ];

        try {
          distanceMatrix = await mapbox.calculateDistanceMatrix(addresses);
        } catch (error) {
          console.error('Distance matrix error:', error);
        }
      }

      // Optimize the route
      // Company Meeting Mode: All techs start at 9:00 AM
      const customStartTime = companyMeetingMode
        ? "09:00"
        : (techStartTimes[targetTechId] || null);
      const optimized = await optimizeRoute(
        allJobsForTech,
        startLocation,
        distanceMatrix,
        shift,
        customStartTime
      );

      console.log('🔍 Route optimization results:', {
        inputJobs: allJobsForTech.length,
        optimizedJobs: optimized.optimizedJobs.length,
        unassignableJobs: optimized.unassignableJobs?.length || 0
      });

      // If distance matrix failed, calculate real drive times now with traffic awareness
      if (!distanceMatrix && optimized.optimizedJobs.length > 0) {
        console.log('⚠️ Distance matrix unavailable, calculating traffic-aware drive times...');
        try {
          let prevAddress = startLocation;
          let currentTime = shift === 'second' ? '13:15' : '08:15';

          // Helper to create departure time
          const createDepartureTime = (timeString) => {
            const [hours, minutes] = timeString.split(':').map(Number);
            const departureDate = new Date(selectedDate + 'T00:00:00');
            departureDate.setHours(hours, minutes, 0, 0);

            // Mapbox requires departure time to be in the future and within 12 hours
            const now = new Date();
            const timeDiffMs = departureDate.getTime() - now.getTime();
            const timeDiffHours = timeDiffMs / (1000 * 60 * 60);

            // Only use traffic data if time is in the future and within 12 hours
            if (timeDiffMs <= 0 || timeDiffHours > 12) {
              return null; // Use current traffic instead
            }

            return departureDate;
          };

          for (let i = 0; i < optimized.optimizedJobs.length; i++) {
            const job = optimized.optimizedJobs[i];
            if (job.address && prevAddress) {
              try {
                // Use traffic-aware routing with departure time
                const departureTime = createDepartureTime(currentTime);
                const result = await mapbox.getDrivingDistance(prevAddress, job.address, departureTime);
                job.travelTime = Math.ceil(result.durationMinutes || 20);

                if (result.trafficAware) {
                  console.log(`  🚦 ${job.customerName}: ${job.travelTime}m drive (traffic-aware, depart: ${currentTime})`);
                } else {
                  console.log(`  ✓ ${job.customerName}: ${job.travelTime}m drive`);
                }

                // Update current time for next leg (arrival time + job duration)
                const arrivalMinutes = timeToMinutes(currentTime) + job.travelTime;
                const endMinutes = arrivalMinutes + (job.duration * 60);
                currentTime = minutesToTime(endMinutes);
              } catch (err) {
                console.warn(`  ⚠️ ${job.customerName}: Using default 20m (API error)`);
                job.travelTime = 20;
                const endMinutes = timeToMinutes(currentTime) + 20 + (job.duration * 60);
                currentTime = minutesToTime(endMinutes);
              }
              prevAddress = job.address;
            }
          }
          console.log('✅ Traffic-aware drive times calculated');
        } catch (error) {
          console.error('Error calculating drive times:', error);
        }
      }

      // Helper function for time conversion (if not already defined)
      const timeToMinutes = (timeStr) => {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
      };

      const minutesToTime = (minutes) => {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
      };

      // Function to finalize route assignment (called after user confirms or if no unassignable jobs)
      const finalizeRouteAssignment = async () => {
        // Check for timeframe violations (exclude manually added jobs since user approved them)
        const violations = optimized.optimizedJobs.filter(job => {
          // Skip jobs that were manually added after being unassignable
          if (job.wasUnassignable) return false;

          const startMinutes = parseInt(job.timeframeStart.split(':')[0]) * 60 + parseInt(job.timeframeStart.split(':')[1]);
          const endMinutes = parseInt(job.timeframeEnd.split(':')[0]) * 60 + parseInt(job.timeframeEnd.split(':')[1]);
          const arrivalMinutes = parseInt(job.arrivalTime.split(':')[0]) * 60 + parseInt(job.arrivalTime.split(':')[1]);
          return arrivalMinutes > endMinutes;
        });

        if (violations.length > 0) {
          const violationMessages = violations.map(v =>
            `${v.customerName}: Arrives ${formatTimeAMPM(v.arrivalTime)} but window closes at ${formatTimeAMPM(v.timeframeEnd)}`
          ).join('\n');

          showAlert(`TIMEFRAME VIOLATIONS DETECTED:\n\n${violationMessages}\n\nThese jobs cannot be completed within their timeframe windows. Please adjust the route or reassign jobs.`, 'Timeframe Conflict', 'warning');
          return;
        }

        // Update routes
        const updatedRoutes = { ...routes };

        // Remove from source tech if applicable
        if (fromTechId) {
          updatedRoutes[fromTechId] = {
            ...updatedRoutes[fromTechId],
            jobs: updatedRoutes[fromTechId].jobs.filter(
              j => !routeJobs.some(rj => rj.id === j.id)
            )
          };
        }

        // Add optimized jobs to target tech
        if (!updatedRoutes[targetTechId]) {
          updatedRoutes[targetTechId] = {
            tech: targetTech,
            jobs: []
          };
        }

        // Determine route-level demo tech based on job assignments
        // If all jobs with assigned demo techs have the same DT, set it at route level
        const jobsWithDT = optimized.optimizedJobs.filter(j => j.assignedDemoTech);
        let routeLevelDemoTech = null;

        if (jobsWithDT.length > 0) {
          const uniqueDTs = [...new Set(jobsWithDT.map(j => j.assignedDemoTech.name))];
          if (uniqueDTs.length === 1) {
            // All jobs have same DT - set at route level
            routeLevelDemoTech = uniqueDTs[0];
            console.log(`✅ Setting route-level DT: ${routeLevelDemoTech} (${jobsWithDT.length} jobs)`);
          } else {
            // Multiple DTs - use most common one or leave null
            console.log(`⚠️ Multiple DTs on route: ${uniqueDTs.join(', ')}`);
          }
        }

        updatedRoutes[targetTechId] = {
          ...updatedRoutes[targetTechId],
          jobs: optimized.optimizedJobs,
          demoTech: routeLevelDemoTech, // Set route-level DT for Kanban display
          summary: {
            totalDuration: optimized.totalDuration,
            totalDistance: optimized.totalDistance
          }
        };

        // Update jobs with new assignments
        let updatedJobs = jobs.map(job => {
          const optimizedJob = optimized.optimizedJobs.find(oj => oj.id === job.id);
          if (optimizedJob) {
            console.log(`✅ Marking job as assigned: ${job.customerName} -> Tech ${targetTechId}`);
            return {
              ...job,
              ...optimizedJob,
              assignedTech: targetTechId,
              status: 'assigned'
            };
          }
          // Update existing jobs
          const existingJob = existingJobs.find(ej => ej.id === job.id);
          if (existingJob) {
            const reoptimizedJob = optimized.optimizedJobs.find(oj => oj.id === job.id);
            if (reoptimizedJob) {
              return { ...job, ...reoptimizedJob };
            }
          }
          return job;
        });

        console.log('📊 Job assignment summary:', {
          totalJobs: updatedJobs.length,
          assignedToTech: updatedJobs.filter(j => j.assignedTech === targetTechId).length,
          unassigned: updatedJobs.filter(j => !j.assignedTech).length
        });

        // Add helper jobs to jobs list (use geocoded version)
        if (geocodedHelperJobs && geocodedHelperJobs.length > 0) {
          console.log('➕ Adding helper jobs to job list:', geocodedHelperJobs.map(j => `${j.customerName} (${j.id})`));
          updatedJobs = [...updatedJobs, ...geocodedHelperJobs];

          console.log('📊 After adding helper jobs:', {
            totalJobs: updatedJobs.length,
            helperJobs: updatedJobs.filter(j => j.isHelperJob).length,
            unassigned: updatedJobs.filter(j => !j.assignedTech).length
          });
        }

        // Clear building route if it was dragged
        if (!fromTechId) {
          setBuildingRoute([]);
        }

        // Update state
        setRoutes(updatedRoutes);
        setJobs(updatedJobs);

        // Save to Firebase
        await onUpdateRoutes(updatedRoutes);
        await onUpdateJobs(updatedJobs);
      };

      // Check if any jobs were lost during optimization
      if (optimized.optimizedJobs.length < allJobsForTech.length) {
        const lostJobs = allJobsForTech.filter(j =>
          !optimized.optimizedJobs.find(oj => oj.id === j.id)
        );
        console.warn('⚠️ Jobs lost during optimization:', lostJobs.map(j => j.customerName));

        if (optimized.unassignableJobs && optimized.unassignableJobs.length > 0) {
          // Build detailed message with timing information
          const unassignableDetails = optimized.unassignableJobs.map(j => {
            const timing = j.timingConflict;
            if (timing && timing.wouldArriveLate) {
              const hours = Math.floor(timing.minutesLate / 60);
              const mins = timing.minutesLate % 60;
              const lateBy = hours > 0
                ? `${hours}h ${mins}m`
                : `${mins} minutes`;

              return `• ${j.customerName} (${formatTimeAMPM(j.timeframeStart)}-${formatTimeAMPM(j.timeframeEnd)})\n  ⏰ Would arrive at ${formatTimeAMPM(timing.estimatedArrival)}, ${lateBy} past deadline`;
            }
            return `• ${j.customerName} (${formatTimeAMPM(j.timeframeStart)}-${formatTimeAMPM(j.timeframeEnd)})`;
          }).join('\n');

          const assignableJobCount = optimized.optimizedJobs.length;

          console.log(`⚠️ ${optimized.unassignableJobs.length} jobs couldn't fit in timeframes, assigning ${assignableJobCount} jobs that did fit`);

          // Finalize route with only the jobs that fit
          await finalizeRouteAssignment();

          // Function to force-add the skipped jobs with re-optimization
          const forceAddSkippedJobs = async () => {
            console.log('🔧 Force-adding skipped jobs and re-optimizing route...');

            try {
              // Combine ALL jobs (optimized + unassignable) for re-optimization
              const allJobsIncludingSkipped = [...optimized.optimizedJobs, ...optimized.unassignableJobs];

              console.log(`🔄 Re-optimizing route with ${allJobsIncludingSkipped.length} jobs (${optimized.optimizedJobs.length} + ${optimized.unassignableJobs.length} forced)`);

              // Build distance matrix for ALL jobs
              let distanceMatrix = null;
              if (allJobsIncludingSkipped.length > 1) {
                const addresses = [
                  startLocation,
                  ...allJobsIncludingSkipped.map(j => j.address)
                ];

                try {
                  distanceMatrix = await mapbox.calculateDistanceMatrix(addresses);
                } catch (error) {
                  console.error('Distance matrix error:', error);
                }
              }

              // Re-optimize with ALL jobs
              const reoptimized = await optimizeRoute(
                allJobsIncludingSkipped,
                startLocation,
                distanceMatrix,
                shift,
                customStartTime
              );

              console.log('✅ Re-optimization complete:', {
                totalJobs: reoptimized.optimizedJobs.length,
                newUnassignable: reoptimized.unassignableJobs?.length || 0
              });

              // Update routes with re-optimized jobs (include ALL jobs, even if late)
              setRoutes(currentRoutes => {
                const updatedRoutes = { ...currentRoutes };

                // Mark forced jobs
                const finalJobs = reoptimized.optimizedJobs.map(job => {
                  const wasUnassignable = optimized.unassignableJobs.find(uj => uj.id === job.id);
                  if (wasUnassignable) {
                    return { ...job, forcedAssignment: true, timingConflict: wasUnassignable.timingConflict };
                  }
                  return job;
                });

                // Add any jobs that STILL can't fit with proper sequential times
                if (reoptimized.unassignableJobs && reoptimized.unassignableJobs.length > 0) {
                  console.warn(`⚠️ ${reoptimized.unassignableJobs.length} jobs still unassignable after forcing, calculating sequential times`);

                  // Calculate sequential times for still-unassignable jobs
                  let currentTime = finalJobs.length > 0
                    ? finalJobs[finalJobs.length - 1].endTime
                    : customStartTime || (shift === 'second' ? '13:15' : '08:15');

                  // Convert HH:MM to minutes
                  const timeToMinutes = (timeStr) => {
                    const [hours, minutes] = timeStr.split(':').map(Number);
                    return hours * 60 + minutes;
                  };

                  // Convert minutes to HH:MM
                  const minutesToTime = (minutes) => {
                    const hours = Math.floor(minutes / 60);
                    const mins = minutes % 60;
                    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
                  };

                  let currentTimeMinutes = timeToMinutes(currentTime);

                  reoptimized.unassignableJobs.forEach(uj => {
                    // Use timingConflict travel time if available, otherwise default
                    const travelTime = uj.timingConflict?.travelTime || 20;
                    const arrivalTimeMinutes = currentTimeMinutes + travelTime;
                    const startTimeMinutes = arrivalTimeMinutes;
                    const endTimeMinutes = startTimeMinutes + (uj.duration * 60);

                    finalJobs.push({
                      ...uj,
                      arrivalTime: minutesToTime(arrivalTimeMinutes),
                      startTime: minutesToTime(startTimeMinutes),
                      endTime: minutesToTime(endTimeMinutes),
                      travelTime: travelTime,
                      waitTime: 0,
                      forcedAssignment: true,
                      timingConflict: uj.timingConflict
                    });

                    // Update current time for next job
                    currentTimeMinutes = endTimeMinutes;
                  });
                }

                updatedRoutes[targetTechId] = {
                  ...updatedRoutes[targetTechId],
                  jobs: finalJobs,
                  summary: {
                    totalDuration: reoptimized.totalDuration,
                    totalDistance: reoptimized.totalDistance
                  }
                };

                // Save to Firebase
                onUpdateRoutes(updatedRoutes);

                return updatedRoutes;
              });

              // Update job assignments
              setJobs(currentJobs => {
                const updatedJobs = currentJobs.map(job => {
                  // Check if this job is in the re-optimized route
                  const reoptimizedJob = reoptimized.optimizedJobs.find(oj => oj.id === job.id);
                  const unassignableJob = reoptimized.unassignableJobs?.find(uj => uj.id === job.id);

                  if (reoptimizedJob || unassignableJob) {
                    const jobData = reoptimizedJob || unassignableJob;
                    return {
                      ...job,
                      ...jobData,
                      assignedTech: targetTechId,
                      status: 'assigned',
                      forcedAssignment: true
                    };
                  }
                  return job;
                });

                // Save to Firebase
                onUpdateJobs(updatedJobs);

                return updatedJobs;
              });

              showAlert(
                `✅ Re-optimized route with all ${allJobsIncludingSkipped.length} job(s).\n\n` +
                `⚠️ Note: ${optimized.unassignableJobs.length} job(s) were forced into the route and may arrive outside their timeframe windows. ` +
                `Please coordinate with customers or adjust the schedule.`,
                'Route Re-optimized',
                'success'
              );
            } catch (error) {
              console.error('❌ Error re-optimizing route:', error);
              showAlert('Error re-optimizing route. Please try again.', 'Error', 'error');
            }
          };

          // Show confirmation dialog with "Add Anyway" button
          showConfirm(
            `Route created with ${assignableJobCount} job(s).\n\n` +
            `${optimized.unassignableJobs.length} job(s) couldn't fit in their timeframe windows and were left unassigned:\n\n` +
            unassignableDetails +
            `\n\n` +
            `These jobs remain unassigned. What would you like to do?\n\n` +
            `• Click "Add Anyway" to force-add them to this route (they'll be late)\n` +
            `• Click "Skip" to leave them unassigned\n\n` +
            `You can also manually drag them to routes later or assign to a different tech.`,
            'Some Jobs Skipped',
            forceAddSkippedJobs, // onConfirm callback
            'question',
            null, // onCancel
            'Add Anyway', // confirmText
            'Skip' // cancelText
          );

          return; // Already finalized, don't proceed to the next finalizeRouteAssignment
        }
      }

      // No unassignable jobs, proceed directly
      await finalizeRouteAssignment();

    } catch (error) {
      console.error('Error in route assignment:', error);
      showAlert('Error optimizing route. Please try again.', 'Error', 'error');
    }
  };

  const handleDropOnTech = async (e, targetTechId) => {
    e.preventDefault();

    if (!draggedRoute) return;

    const { jobs: routeJobs, fromTechId } = draggedRoute;

    try {
      // Get target tech info
      const targetTech = techs.find(t => t.id === targetTechId);
      const isSecondShift = targetTech.name?.toLowerCase().includes('second shift') ||
                           targetTech.name?.toLowerCase().includes('2nd shift');
      const shift = isSecondShift ? 'second' : 'first';

      // Company Meeting Mode: All techs start at Conroe office
      const officeKey = companyMeetingMode ? 'office_1' : (targetTech?.office || 'office_1');
      const office = offices[officeKey];
      if (!office && !companyMeetingMode) {
        console.warn(`⚠️ Office ${officeKey} not found for tech ${targetTech?.name}, falling back to office_1`);
      }
      const startLocation = office?.address || offices.office_1.address;

      // Check if route has two-tech jobs
      const twoTechJobs = routeJobs.filter(j => j.requiresTwoTechs);
      if (twoTechJobs.length > 0) {
        // Store pending data and show modal
        setPendingRouteDropData({
          routeJobs,
          targetTechId,
          targetTech,
          shift,
          startLocation,
          fromTechId
        });
        setShowTwoTechModal(true);
        setDraggedRoute(null);  // Clear dragged route
        return;  // Wait for modal completion
      }

      // Clear dragged route and show loading indicator
      setDraggedRoute(null);

      // Mark tech as optimizing (shows spinner)
      setOptimizingTechs(prev => new Set(prev).add(targetTechId));

      // Run route assignment (this will update state when complete)
      await continueRouteAssignment(routeJobs, [], targetTechId, targetTech, shift, startLocation, fromTechId);

      // Remove from optimizing set
      setOptimizingTechs(prev => {
        const newSet = new Set(prev);
        newSet.delete(targetTechId);
        return newSet;
      });

    } catch (error) {
      console.error('Error assigning route:', error);
      showAlert('Error assigning route. Please try again.', 'Error', 'error');
      setDraggedRoute(null);

      // Remove from optimizing set on error
      setOptimizingTechs(prev => {
        const newSet = new Set(prev);
        newSet.delete(targetTechId);
        return newSet;
      });
    }
  };

  const removeJobFromBuildingRoute = (jobId) => {
    setBuildingRoute(buildingRoute.filter(j => j.id !== jobId));
  };

  const clearBuildingRoute = () => {
    setBuildingRoute([]);
  };

  const removeJobFromTech = async (jobId, techId) => {
    const updatedRoutes = { ...routes };
    updatedRoutes[techId] = {
      ...updatedRoutes[techId],
      jobs: updatedRoutes[techId].jobs.filter(j => j.id !== jobId)
    };

    const updatedJobs = jobs.map(job => {
      if (job.id === jobId) {
        return { ...job, assignedTech: null, status: 'unassigned' };
      }
      return job;
    });

    // Update local state immediately
    setRoutes(updatedRoutes);
    setJobs(updatedJobs);

    await onUpdateRoutes(updatedRoutes);
    await onUpdateJobs(updatedJobs);
  };

  const reorderJobsInRoute = async (techId, startIndex, endIndex) => {
    const updatedRoutes = { ...routes };
    const techJobs = [...updatedRoutes[techId].jobs];
    const [removed] = techJobs.splice(startIndex, 1);
    techJobs.splice(endIndex, 0, removed);

    // Recalculate times for the reordered route
    const tech = updatedRoutes[techId].tech;
    const recalculatedJobs = await recalculateRouteTimes(techJobs, tech);

    updatedRoutes[techId] = {
      ...updatedRoutes[techId],
      jobs: recalculatedJobs
    };

    setRoutes(updatedRoutes);
    onUpdateRoutes(updatedRoutes);
  };

  // Recalculate arrival, start, end times for jobs in current order
  const recalculateRouteTimes = async (jobs, tech) => {
    if (!jobs || jobs.length === 0) return [];

    const mapboxService = getMapboxService();

    // Get shift start time
    const shiftStartTime = techStartTimes[tech.id] || (tech.shift === 'second' ? '13:00' : '07:00');
    let currentTimeMinutes = parseInt(shiftStartTime.split(':')[0]) * 60 + parseInt(shiftStartTime.split(':')[1]);

    // Get start office coordinates
    const startOfficeKey = companyMeetingMode ? 'office_1' : tech.office;
    const startOfficeCoords = officeCoordinates[startOfficeKey];

    const recalculatedJobs = [];
    let previousCoords = startOfficeCoords;

    for (const job of jobs) {
      const jobCoords = await mapboxService.geocodeAddress(job.address);

      if (!jobCoords) {
        // If geocoding fails, use fallback times
        recalculatedJobs.push({
          ...job,
          arrivalTime: minutesToTime(currentTimeMinutes),
          startTime: minutesToTime(currentTimeMinutes),
          endTime: minutesToTime(currentTimeMinutes + (job.duration * 60))
        });
        currentTimeMinutes += (job.duration * 60) + 30; // Assume 30 min drive
        continue;
      }

      // Calculate drive time from previous location
      let driveTimeMinutes = 15; // Default fallback
      try {
        const driveTime = await mapboxService.getDrivingRoute(previousCoords, jobCoords);
        driveTimeMinutes = driveTime ? Math.ceil(driveTime / 60) : 15;
      } catch (error) {
        console.warn('Drive time calculation failed, using fallback:', error);
      }

      // Calculate arrival and times
      const arrivalTimeMinutes = currentTimeMinutes + driveTimeMinutes;
      const windowStartMinutes = parseInt(job.timeframeStart.split(':')[0]) * 60 + parseInt(job.timeframeStart.split(':')[1]);
      const startTimeMinutes = Math.max(arrivalTimeMinutes, windowStartMinutes);
      const endTimeMinutes = startTimeMinutes + (job.duration * 60);

      recalculatedJobs.push({
        ...job,
        arrivalTime: minutesToTime(arrivalTimeMinutes),
        startTime: minutesToTime(startTimeMinutes),
        endTime: minutesToTime(endTimeMinutes),
        driveTime: driveTimeMinutes
      });

      currentTimeMinutes = endTimeMinutes;
      previousCoords = jobCoords;
    }

    return recalculatedJobs;
  };

  const minutesToTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  };

  const moveJobInRoute = (techId, jobIndex, direction) => {
    const newIndex = direction === 'up' ? jobIndex - 1 : jobIndex + 1;
    if (newIndex < 0 || newIndex >= routes[techId].jobs.length) return;
    reorderJobsInRoute(techId, jobIndex, newIndex);
  };

  const unassignedCount = jobs.filter(j => !j.assignedTech).length;
  const assignedCount = jobs.filter(j => j.assignedTech).length;

  const handleTechClick = (techId) => {
    setSelectedTech(selectedTech === techId ? null : techId);
  };

  const handleSaveGoogleClientId = () => {
    if (googleClientId) {
      localStorage.setItem('googleClientId', googleClientId);
      showAlert('Google Client ID saved! You can now push routes to calendars.', 'Settings Saved', 'success');
      setShowGoogleSetup(false);
    }
  };

  const handlePushToCalendars = async () => {
    // Check if we have routes to push
    const routesWithJobs = Object.values(routes).filter(r => r.jobs && r.jobs.length > 0);

    if (routesWithJobs.length === 0) {
      showAlert('No routes to push. Please assign jobs to technicians first.', 'No Routes', 'info');
      return;
    }

    // Check if Google Client ID is configured
    if (!googleClientId) {
      showConfirm(
        'Google Calendar integration is not set up. Would you like to configure it now?',
        'Setup Required',
        () => setShowGoogleSetup(true),
        'question'
      );
      return;
    }

    // Initialize and sign in to Google FIRST (before confirmation)
    try {
      setPushingToCalendar(true);

      // Initialize Google Calendar service if needed
      if (!googleCalendarService.isInitialized) {
        await googleCalendarService.initialize(googleClientId);
      }

      // Sign in if not already signed in - This will show Google login popup
      if (!googleCalendarService.isSignedIn()) {
        await googleCalendarService.signIn();
      }

      setPushingToCalendar(false);

      // Now that we're signed in, show confirmation
      const totalJobs = routesWithJobs.reduce((sum, r) => sum + r.jobs.length, 0);
      const confirmMessage = `Push ${totalJobs} jobs to ${routesWithJobs.length} technician calendars?\n\n` +
        `This will create Google Calendar events for all assigned routes on ${selectedDate}.`;

      showConfirm(confirmMessage, 'Push to Calendar', async () => {

        setPushingToCalendar(true);

        try {
          // Get routes with jobs
          const routesToPush = Object.entries(routes).filter(([_, r]) => r.jobs && r.jobs.length > 0);
          const totalTechs = routesToPush.length;
          const totalJobs = routesToPush.reduce((sum, [_, r]) => sum + r.jobs.length, 0);

          // Show loading modal
          setLoadingState({
            isOpen: true,
            title: 'Pushing to Google Calendar',
            message: 'Creating calendar events for all technicians',
            progress: 0,
            totalSteps: totalTechs,
            currentStepNumber: 0,
            currentStep: 'Initializing...',
            showSteps: true
          });

          let completedTechs = 0;
          let completedJobs = 0;
          const summary = {
            totalTechs: 0,
            totalJobs: 0,
            successfulJobs: 0,
            failedJobs: 0,
            techResults: []
          };

          // Push routes one by one to show progress
          for (const [techId, route] of routesToPush) {
            if (!route.jobs || route.jobs.length === 0) continue;

            summary.totalTechs++;
            summary.totalJobs += route.jobs.length;

            // Update progress
            setLoadingState(prev => ({
              ...prev,
              currentStepNumber: completedTechs + 1,
              currentStep: `Pushing ${route.jobs.length} jobs to ${route.tech.name}...`,
              progress: (completedTechs / totalTechs) * 100
            }));

            const techResult = {
              techName: route.tech.name,
              email: route.tech.email,
              jobCount: route.jobs.length,
              success: 0,
              failed: 0,
              errors: []
            };

            try {
              const results = await googleCalendarService.pushTechRoute(route.tech, route.jobs, selectedDate);
              techResult.success = results.success;
              techResult.failed = results.failed;
              techResult.errors = results.errors;

              summary.successfulJobs += results.success;
              summary.failedJobs += results.failed;
              completedJobs += results.success;
            } catch (error) {
              techResult.failed = route.jobs.length;
              techResult.errors.push({ error: error.message });
              summary.failedJobs += route.jobs.length;
            }

            summary.techResults.push(techResult);
            completedTechs++;

            // Update progress
            setLoadingState(prev => ({
              ...prev,
              progress: (completedTechs / totalTechs) * 100,
              message: `${completedJobs} of ${totalJobs} jobs pushed`
            }));
          }

          // Complete
          setLoadingState(prev => ({
            ...prev,
            progress: 100,
            currentStep: 'Complete!',
            message: `Successfully pushed ${summary.successfulJobs} jobs`
          }));

          // Wait a moment to show 100% before closing
          await new Promise(resolve => setTimeout(resolve, 500));

          // Close loading modal
          setLoadingState(prev => ({ ...prev, isOpen: false }));

          // Show detailed results
          let resultMessage = `✅ Calendar Push Complete!\n\n`;
          resultMessage += `Total Techs: ${summary.totalTechs}\n`;
          resultMessage += `Jobs Pushed: ${summary.successfulJobs} / ${summary.totalJobs}\n`;

          if (summary.failedJobs > 0) {
            resultMessage += `\n⚠️ Failed: ${summary.failedJobs}\n\n`;
            resultMessage += `Details:\n`;
            summary.techResults.forEach(tr => {
              if (tr.failed > 0) {
                resultMessage += `\n${tr.techName}:\n`;
                if (!tr.email) {
                  resultMessage += `  ❌ No email configured\n`;
                }
                tr.errors.forEach(err => {
                  resultMessage += `  ❌ ${err.job || 'Error'}: ${err.error}\n`;
                });
              }
            });
          } else {
            resultMessage += `\n✨ All routes successfully pushed to Google Calendar!`;
          }

          showAlert(resultMessage, 'Calendar Push Complete', summary.failedJobs > 0 ? 'warning' : 'success');

        } catch (error) {
          console.error('Error pushing to calendars:', error);
          setLoadingState(prev => ({ ...prev, isOpen: false }));
          showAlert(`Error pushing to calendars: ${error.message}\n\nPlease check your Google Calendar permissions and try again.`, 'Error', 'error');
        } finally {
          setPushingToCalendar(false);
        }
      }, 'question');

    } catch (error) {
      console.error('Error with Google sign-in:', error);
      setPushingToCalendar(false);

      // User cancelled or error occurred during sign-in
      if (error.message && error.message.includes('popup_closed_by_user')) {
        showAlert('Google sign-in was cancelled. Please try again when ready.', 'Sign-in Cancelled', 'info');
      } else if (error.message && (error.message.includes('redirect_uri') || error.message.includes('invalid'))) {
        // Specific error for redirect_uri_mismatch
        const currentUrl = window.location.origin;
        showAlert(
          `Google OAuth Configuration Error!\n\n` +
          `The app URL needs to be added to Google Cloud Console.\n\n` +
          `Current URL: ${currentUrl}\n\n` +
          `TO FIX:\n` +
          `1. Go to: console.cloud.google.com/apis/credentials\n` +
          `2. Edit the OAuth Client ID\n` +
          `3. Add "${currentUrl}" to Authorized JavaScript Origins\n` +
          `4. Save and wait 5 minutes\n\n` +
          `See GOOGLE_CALENDAR_SETUP.md for detailed instructions.`,
          'OAuth Configuration Required',
          'error'
        );
      } else {
        showAlert(`Error signing in to Google: ${error.message}\n\nPlease check your Google Client ID configuration.`, 'Sign-in Error', 'error');
      }
      return;
    }
  };

  // Handle clearing all routes - resets jobs to unassigned state
  const handleClearAllRoutes = async () => {
    const assignedJobsCount = jobs.filter(j => j.assignedTech).length;

    if (assignedJobsCount === 0) {
      showAlert('No routes to clear. All jobs are already unassigned.', 'Nothing to Clear', 'info');
      return;
    }

    showConfirm(
      `Clear all routes and unassign all jobs?\n\n` +
      `This will:\n` +
      `• Unassign ${assignedJobsCount} job(s)\n` +
      `• Clear all tech routes\n` +
      `• Reset to the state after CSV import\n\n` +
      `This action can be undone by re-optimizing or manually assigning jobs.`,
      'Clear All Routes',
      async () => {
        console.log('🗑️ Clearing all routes...');

        // Unassign all jobs and remove forced assignment flags
        const clearedJobs = jobs.map(job => {
          const { forcedAssignment, timingConflict, ...jobWithoutFlags } = job;
          return {
            ...jobWithoutFlags,
            assignedTech: null,
            status: 'unassigned'
          };
        });

        // Clear all routes
        const clearedRoutes = {};

        // Update state
        setJobs(clearedJobs);
        setRoutes(clearedRoutes);

        // Save to Firebase
        await onUpdateJobs(clearedJobs);
        await onUpdateRoutes(clearedRoutes);

        showAlert(
          `✅ Cleared all routes!\n\n${assignedJobsCount} job(s) have been unassigned and are ready to be routed.`,
          'Routes Cleared',
          'success'
        );

        console.log('✅ All routes cleared successfully');
      },
      'warning'
    );
  };

  // Handle date change
  const handlePreviousDay = () => {
    if (onDateChange) {
      const date = new Date(selectedDate + 'T12:00:00');
      date.setDate(date.getDate() - 1);
      onDateChange(date.toISOString().split('T')[0]);
    }
  };

  const handleNextDay = () => {
    if (onDateChange) {
      const date = new Date(selectedDate + 'T12:00:00');
      date.setDate(date.getDate() + 1);
      onDateChange(date.toISOString().split('T')[0]);
    }
  };

  const handleToday = () => {
    if (onDateChange) {
      onDateChange(new Date().toISOString().split('T')[0]);
    }
  };

  return (
    <div style={{ height: 'calc(100vh - 140px)', display: 'flex', flexDirection: 'column' }}>
      {/* Compact Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '8px',
        padding: '8px 12px',
        backgroundColor: 'var(--surface-secondary)',
        borderRadius: '6px',
        border: '1px solid #e5e7eb'
      }}>
        {/* Left: Title, Date, Job Counts */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>Manual Route Builder</h3>

          {/* Compact Date Picker */}
          {onDateChange && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <button
                onClick={handlePreviousDay}
                className="btn btn-secondary btn-small"
                style={{
                  padding: '2px 6px',
                  fontSize: '11px',
                  minWidth: 'unset',
                  lineHeight: '1'
                }}
                title="Previous day"
              >
                <i className="fas fa-chevron-left"></i>
              </button>

              <input
                type="date"
                value={selectedDate}
                onChange={(e) => onDateChange(e.target.value)}
                className="form-control"
                style={{
                  width: '110px',
                  fontSize: '11px',
                  padding: '2px 6px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '4px'
                }}
              />

              <button
                onClick={handleNextDay}
                className="btn btn-secondary btn-small"
                style={{
                  padding: '2px 6px',
                  fontSize: '11px',
                  minWidth: 'unset',
                  lineHeight: '1'
                }}
                title="Next day"
              >
                <i className="fas fa-chevron-right"></i>
              </button>

              <button
                onClick={handleToday}
                className="btn btn-primary btn-small"
                style={{
                  padding: '2px 8px',
                  fontSize: '11px'
                }}
                title="Go to today"
              >
                Today
              </button>
            </div>
          )}

          {/* Job Counts - Smaller */}
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            <span style={{ fontWeight: '600', color: 'var(--success-color)' }}>{unassignedCount}</span> unassigned •
            <span style={{ fontWeight: '600', color: 'var(--info-color)', marginLeft: '3px' }}>{assignedCount}</span> assigned
          </div>

          {/* Active Users - Presence Indicators */}
          {activeUsers && activeUsers.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 8px',
              backgroundColor: 'var(--info-bg)',
              borderRadius: '4px',
              fontSize: '11px',
              border: '1px solid var(--info-color)',
              color: 'var(--text-primary)'
            }}>
              <i className="fas fa-users" style={{ color: 'var(--info-color)', fontSize: '10px' }}></i>
              <span style={{ fontWeight: '500' }}>
                {activeUsers.length} {activeUsers.length === 1 ? 'other user' : 'others'} viewing
              </span>
              <div style={{ display: 'flex', gap: '4px', marginLeft: '4px' }}>
                {activeUsers.slice(0, 3).map((user, idx) => (
                  <div
                    key={idx}
                    title={user.userName || 'Anonymous'}
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--info-color)',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '9px',
                      fontWeight: '600',
                      textTransform: 'uppercase',
                      border: '2px solid white'
                    }}
                  >
                    {(user.userName || 'A').charAt(0)}
                  </div>
                ))}
                {activeUsers.length > 3 && (
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      backgroundColor: '#6b7280',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '8px',
                      fontWeight: '600',
                      border: '2px solid white'
                    }}
                    title={`${activeUsers.length - 3} more users`}
                  >
                    +{activeUsers.length - 3}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: Standardized Action Buttons, Push to Calendars, View Selector, Options Menu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {actionButtons}

          {/* Push to Calendars - Manual Mode specific */}
          <button
            onClick={handlePushToCalendars}
            disabled={pushingToCalendar || Object.values(routes).filter(r => r.jobs?.length > 0).length === 0}
            className="btn btn-success btn-small"
            style={{
              padding: '4px 12px',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <i className={pushingToCalendar ? "fas fa-spinner fa-spin" : "fas fa-calendar-plus"}></i>
            {pushingToCalendar ? 'Pushing...' : 'Push to Calendars'}
          </button>

          {viewSelector}

          {/* Options Menu Button - Far Right */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowOptionsMenu(!showOptionsMenu)}
              className="btn btn-secondary btn-small"
              style={{
                padding: '4px 8px',
                fontSize: '12px',
                minWidth: 'unset'
              }}
              title="More options"
            >
              <i className="fas fa-ellipsis-v"></i>
            </button>

            {/* Dropdown Menu */}
            {showOptionsMenu && (
              <>
                {/* Backdrop to close menu */}
                <div
                  style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 998
                  }}
                  onClick={() => setShowOptionsMenu(false)}
                />

                {/* Menu */}
                <div style={{
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  marginTop: '4px',
                  backgroundColor: 'var(--surface-color)',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  minWidth: '200px',
                  zIndex: 999,
                  overflow: 'hidden'
                }}>
                  {/* Show All Jobs */}
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 12px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    borderBottom: '1px solid #e5e7eb',
                    margin: 0
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-secondary)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <input
                      type="checkbox"
                      checked={showAllJobs}
                      onChange={(e) => setShowAllJobs(e.target.checked)}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <span>Show All Jobs</span>
                  </label>

                  {/* Hide Off Techs */}
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 12px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    borderBottom: '1px solid #e5e7eb',
                    margin: 0
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-secondary)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <input
                      type="checkbox"
                      checked={hideOffTechs}
                      onChange={(e) => setHideOffTechs(e.target.checked)}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <span>Hide Off</span>
                  </label>

                  {/* Meeting Mode Toggle */}
                  {onToggleCompanyMeetingMode && (
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 12px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      borderBottom: '1px solid #e5e7eb',
                      margin: 0,
                      backgroundColor: companyMeetingMode ? 'var(--warning-bg)' : 'transparent'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = companyMeetingMode ? 'var(--warning-bg)' : 'var(--surface-secondary)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = companyMeetingMode ? 'var(--warning-bg)' : 'transparent'}
                    title={companyMeetingMode ? 'All techs start at Conroe at 9:00 AM' : 'Techs start at their offices at 8:15 AM'}
                    >
                      <input
                        type="checkbox"
                        checked={companyMeetingMode}
                        onChange={(e) => {
                          setShowOptionsMenu(false);
                          onToggleCompanyMeetingMode();
                        }}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <span style={{ fontWeight: companyMeetingMode ? '600' : 'normal' }}>
                        <i className={`fas ${companyMeetingMode ? 'fa-users' : 'fa-user-clock'}`}></i> Meeting Mode
                      </span>
                    </label>
                  )}

                  {/* Clear All Routes */}
                  <button
                    onClick={() => {
                      setShowOptionsMenu(false);
                      handleClearAllRoutes();
                    }}
                    disabled={jobs.filter(j => j.assignedTech).length === 0}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 12px',
                      border: 'none',
                      backgroundColor: 'transparent',
                      cursor: jobs.filter(j => j.assignedTech).length === 0 ? 'not-allowed' : 'pointer',
                      fontSize: '13px',
                      color: jobs.filter(j => j.assignedTech).length === 0 ? 'var(--text-disabled)' : 'var(--danger-color)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontWeight: '500'
                    }}
                    onMouseEnter={(e) => {
                      if (jobs.filter(j => j.assignedTech).length > 0) {
                        e.currentTarget.style.backgroundColor = 'var(--surface-secondary)';
                      }
                    }}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <i className="fas fa-trash-alt"></i>
                    <span>Clear All Routes</span>
                  </button>

                  {/* Full Screen Toggle */}
                  {onToggleFullScreen && (
                    <button
                      onClick={() => {
                        setShowOptionsMenu(false);
                        onToggleFullScreen();
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '10px 12px',
                        border: 'none',
                        backgroundColor: 'transparent',
                        cursor: 'pointer',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        borderTop: '1px solid #e5e7eb'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-secondary)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <i className={`fas ${isFullScreen ? 'fa-compress' : 'fa-expand'}`}></i>
                      <span>{isFullScreen ? 'Exit Full Screen' : 'Full Screen'}</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main layout: Map + Compact Tech List */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 230px', gap: '12px', flex: 1, minHeight: 0 }}>

        {/* Map Section */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', position: 'relative', height: '100%' }}>
          <div
            ref={mapContainerRef}
            style={{ width: '100%', height: '100%' }}
          />

          {/* Building Route Overlay - Bottom Right */}
          {buildingRoute.length > 0 && (
            <div style={{
              position: 'absolute',
              bottom: '16px',
              right: '16px',
              backgroundColor: 'var(--surface-color)',
              padding: '12px',
              borderRadius: '6px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              width: '240px',
              maxHeight: '600px',
              overflow: 'auto',
              zIndex: 1
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px',
                paddingBottom: '8px',
                borderBottom: '2px solid #e5e7eb'
              }}>
                <h4 style={{ margin: 0, fontSize: '12px', color: '#FFD700' }}>
                  <i className="fas fa-route"></i> Building Route ({buildingRoute.length})
                </h4>
                <button
                  onClick={clearBuildingRoute}
                  className="btn btn-secondary btn-small"
                  style={{ padding: '2px 6px', fontSize: '10px' }}
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              <div
                draggable
                onDragStart={(e) => handleDragStart(e, buildingRoute)}
                style={{
                  cursor: 'grab',
                  padding: '6px',
                  backgroundColor: '#fff9e6',
                  borderRadius: '4px',
                  marginBottom: '6px',
                  border: '2px dashed #FFD700',
                  textAlign: 'center'
                }}
              >
                <div style={{ fontSize: '10px', color: '#d4a200', fontWeight: '600' }}>
                  <i className="fas fa-hand-paper"></i> Drag to Tech
                </div>
              </div>

              {buildingRoute.map((job, idx) => (
                <div
                  key={job.id}
                  style={{
                    padding: '6px',
                    backgroundColor: 'var(--surface-secondary)',
                    borderRadius: '4px',
                    marginBottom: '4px',
                    borderLeft: '3px solid #FFD700',
                    fontSize: '10px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600', fontSize: '11px', marginBottom: '2px' }}>
                        {idx + 1}. {job.customerName}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                        {job.jobType} • {job.duration}h
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--success-color)', fontWeight: '600' }}>
                        <i className="fas fa-clock"></i> {formatTimeAMPM(job.timeframeStart)}-{formatTimeAMPM(job.timeframeEnd)}
                      </div>
                      {job.requiresTwoTechs && (
                        <div style={{ fontSize: '9px', color: 'var(--warning-color)', marginTop: '2px', fontWeight: '600' }}>
                          <i className="fas fa-users"></i> 2 Techs
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => removeJobFromBuildingRoute(job.id)}
                      className="btn btn-secondary btn-small"
                      style={{ padding: '2px 4px', fontSize: '9px' }}
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  </div>
                </div>
              ))}

              <div style={{
                marginTop: '12px',
                paddingTop: '12px',
                borderTop: '1px solid #e5e7eb',
                fontSize: '12px',
                color: 'var(--text-secondary)'
              }}>
                Total: {buildingRoute.reduce((sum, j) => sum + j.duration, 0).toFixed(1)}h
              </div>
            </div>
          )}

          {/* Legend */}
          <div style={{
            position: 'absolute',
            top: '12px',
            left: '12px',
            backgroundColor: 'var(--surface-color)',
            padding: '10px',
            borderRadius: '6px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            fontSize: '10px',
            zIndex: 1,
            maxWidth: '220px'
          }}>
            <div style={{ fontWeight: '600', marginBottom: '6px', fontSize: '11px' }}>Job Types</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--purple-color)' }}></div>
                <span>Install</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--danger-color)' }}></div>
                <span>Demo</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--warning-color)' }}></div>
                <span>Demo Prep</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--info-color)' }}></div>
                <span>Check/Service</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--success-color)' }}></div>
                <span>Pull</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#14b8a6' }}></div>
                <span>FS Visit</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#FFD700' }}></div>
                <span>Selected</span>
              </div>
            </div>
          </div>

          {/* Job Hover Popup - Bottom Left */}
          {hoveredJob && (
            <div
              onMouseEnter={() => {
                // Clear hide timeout when hovering over popup
                if (hoverTimeoutRef.current) {
                  clearTimeout(hoverTimeoutRef.current);
                  hoverTimeoutRef.current = null;
                }
              }}
              onMouseLeave={() => {
                // Hide popup when leaving popup area
                setHoveredJob(null);
              }}
              style={{
                position: 'absolute',
                bottom: '16px',
                left: '12px',
                backgroundColor: 'var(--surface-color)',
                padding: '12px',
                borderRadius: '6px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                maxWidth: '280px',
                maxHeight: '500px',
                overflow: 'auto',
                zIndex: 1000,
                border: '2px solid var(--info-color)',
                pointerEvents: 'auto',
                fontSize: '11px'
              }}
            >
              <div style={{
                fontWeight: '600',
                marginBottom: '6px',
                fontSize: '13px',
                color: 'var(--text-primary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span>{hoveredJob.customerName}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '500' }}>
                  {hoveredJob.id}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                <i className="fas fa-map-marker-alt"></i> {hoveredJob.address}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                <strong>{hoveredJob.jobType}</strong> • {hoveredJob.duration}h
              </div>
              <div style={{ fontSize: '11px', color: 'var(--success-color)', fontWeight: '600', marginBottom: '4px' }}>
                <i className="fas fa-clock"></i> Timeframe: {formatTimeAMPM(hoveredJob.timeframeStart)} - {formatTimeAMPM(hoveredJob.timeframeEnd)}
              </div>
              {hoveredJob.requestedTech && (
                <div style={{ fontSize: '11px', color: 'var(--warning-color)', marginBottom: '4px', fontWeight: 'bold' }}>
                  <i className="fas fa-user-tag"></i> Req: {hoveredJob.requestedTech}
                </div>
              )}
              {hoveredJob.description && (
                <div style={{ marginTop: '6px', padding: '6px', backgroundColor: 'var(--surface-secondary)', borderRadius: '4px', fontSize: '10px', borderLeft: '3px solid var(--info-color)' }}>
                  <strong>Notes:</strong> {hoveredJob.description}
                </div>
              )}
              {hoveredJob.requiresTwoTechs && (
                <div style={{ marginTop: '6px', padding: '4px', backgroundColor: 'var(--warning-color)', color: 'white', borderRadius: '4px', fontSize: '10px', textAlign: 'center', fontWeight: '600' }}>
                  <i className="fas fa-users"></i> Requires 2 Technicians
                </div>
              )}
            </div>
          )}

          {/* Selected Tech Route - Top Right Above Nav Controls */}
          {selectedTech && routes[selectedTech] && routes[selectedTech].jobs?.length > 0 && (
            <div style={{
              position: 'absolute',
              top: '12px',
              right: '50px',
              backgroundColor: 'var(--surface-color)',
              padding: '12px',
              borderRadius: '6px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              maxWidth: '250px',
              maxHeight: '400px',
              overflow: 'auto',
              zIndex: 1
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px',
                paddingBottom: '8px',
                borderBottom: '2px solid #e5e7eb'
              }}>
                <h4 style={{ margin: 0, fontSize: '13px' }}>
                  {routes[selectedTech].tech.name}
                </h4>
                <button
                  onClick={() => setSelectedTech(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px',
                    color: 'var(--text-secondary)'
                  }}
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              {/* Demo Tech Assignment */}
              <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #e5e7eb' }}>
                <label style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Demo Tech (Optional):
                </label>
                <select
                  className="form-control"
                  style={{ fontSize: '11px', padding: '4px', width: '100%' }}
                  value={routes[selectedTech].demoTech || ''}
                  onChange={(e) => {
                    const updatedRoutes = { ...routes };
                    updatedRoutes[selectedTech] = {
                      ...updatedRoutes[selectedTech],
                      demoTech: e.target.value || null
                    };
                    setRoutes(updatedRoutes);
                    onUpdateRoutes(updatedRoutes);
                  }}
                >
                  <option value="">None</option>
                  {techs.filter(t => t.isDemoTech).map(dt => {
                    // Check if demo tech is already assigned to another route
                    const isAssigned = Object.entries(routes).some(
                      ([techId, route]) => techId !== selectedTech && route.demoTech === dt.name
                    );
                    return (
                      <option key={dt.id} value={dt.name} disabled={isAssigned}>
                        {dt.name} {isAssigned ? '(Already assigned)' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              {routes[selectedTech].jobs.map((job, idx) => (
                <div
                  key={job.id}
                  onMouseEnter={() => setHoveredJob(job)}
                  onMouseLeave={() => setHoveredJob(null)}
                  style={{
                    padding: '6px',
                    backgroundColor: 'var(--surface-secondary)',
                    borderRadius: '4px',
                    marginBottom: '4px',
                    borderLeft: `3px solid ${getJobTypeColor(job.jobType)}`,
                    fontSize: '11px',
                    position: 'relative',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '4px' }}>
                    {/* Up/Down Arrows */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginRight: '2px' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          moveJobInRoute(selectedTech, idx, 'up');
                        }}
                        disabled={idx === 0}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: idx === 0 ? 'not-allowed' : 'pointer',
                          padding: '0',
                          color: idx === 0 ? 'var(--text-disabled)' : 'var(--primary-color)',
                          fontSize: '10px',
                          opacity: idx === 0 ? 0.3 : 1
                        }}
                        title="Move up"
                      >
                        <i className="fas fa-chevron-up"></i>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          moveJobInRoute(selectedTech, idx, 'down');
                        }}
                        disabled={idx === routes[selectedTech].jobs.length - 1}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: idx === routes[selectedTech].jobs.length - 1 ? 'not-allowed' : 'pointer',
                          padding: '0',
                          color: idx === routes[selectedTech].jobs.length - 1 ? 'var(--text-disabled)' : 'var(--primary-color)',
                          fontSize: '10px',
                          opacity: idx === routes[selectedTech].jobs.length - 1 ? 0.3 : 1
                        }}
                        title="Move down"
                      >
                        <i className="fas fa-chevron-down"></i>
                      </button>
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600', marginBottom: '2px' }}>
                        {idx + 1}. {job.customerName}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>
                        {job.startTime && (
                          <div style={{ marginBottom: '2px', color: 'var(--success-color)', fontWeight: '600' }}>
                            <i className="fas fa-clock"></i> {formatTimeAMPM(job.startTime)} - {formatTimeAMPM(job.endTime)}
                            {job.arrivalTime && job.arrivalTime !== job.startTime && (
                              <span style={{ fontSize: '8px', color: 'var(--info-color)', marginLeft: '4px' }}>
                                (arrive {formatTimeAMPM(job.arrivalTime)})
                              </span>
                            )}
                          </div>
                        )}
                        <div>
                          {job.jobType} • {job.duration}h
                          {job.requiresTwoTechs && (
                            <span style={{ color: 'var(--warning-color)', marginLeft: '4px' }}>
                              <i className="fas fa-users"></i>
                            </span>
                          )}
                        </div>
                        {job.travelTime > 0 && (
                          <div style={{ color: 'var(--warning-color)', fontSize: '9px', marginTop: '2px' }}>
                            <i className="fas fa-car"></i> {job.travelTime}min drive
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeJobFromTech(job.id, selectedTech);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '2px 4px',
                        color: 'var(--danger-color)',
                        fontSize: '10px'
                      }}
                      title="Unassign job"
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Compact Tech List Section */}
        <div className="card" style={{ padding: '12px', height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          <h4 style={{ margin: 0, marginBottom: '12px', fontSize: '14px' }}>
            <i className="fas fa-users"></i> Techs ({techs.filter(tech => !hideOffTechs || !isTechOff(tech.id)).length})
          </h4>

          <div style={{ flex: 1, overflow: 'auto' }}>
            {/* Filter and sort techs by zone, MIT Leads at end */}
            {[...techs]
              .filter(tech => !hideOffTechs || !isTechOff(tech.id))
              .sort((a, b) => {
              const aIsLead = a.role === 'MIT Lead';
              const bIsLead = b.role === 'MIT Lead';

              // Check if MIT Lead is 2nd shift - check both zone and name
              const aIs2ndShiftLead = aIsLead && (
                (a.zone && (String(a.zone).toLowerCase().includes('2nd') || String(a.zone).toLowerCase().includes('second'))) ||
                (a.name && (String(a.name).toLowerCase().includes('2nd shift') || String(a.name).toLowerCase().includes('second shift')))
              );
              const bIs2ndShiftLead = bIsLead && (
                (b.zone && (String(b.zone).toLowerCase().includes('2nd') || String(b.zone).toLowerCase().includes('second'))) ||
                (b.name && (String(b.name).toLowerCase().includes('2nd shift') || String(b.name).toLowerCase().includes('second shift')))
              );

              // For sorting, treat 2nd shift MIT Lead as a regular tech with zone order 100
              // Other MIT Leads get zone order 1000 (at the end)
              const getZoneOrder = (tech, isMITLead, is2ndShiftLead) => {
                // 2nd shift MIT Lead sorts with 2nd shift techs
                if (is2ndShiftLead) return 100;

                // Other MIT Leads go to the very end
                if (isMITLead) return 1000;

                // Regular techs sort by zone
                const zone = tech.zone;
                if (!zone) return 999;
                const zoneStr = String(zone).toLowerCase();
                if (zoneStr.includes('2nd') || zoneStr.includes('second')) return 100;
                const match = zoneStr.match(/\d+/);
                return match ? parseInt(match[0]) : 999;
              };

              return getZoneOrder(a, aIsLead, aIs2ndShiftLead) - getZoneOrder(b, bIsLead, bIs2ndShiftLead);
            }).map(tech => {
              const techRoute = routes[tech.id];
              const jobCount = techRoute?.jobs?.length || 0;
              const totalHours = techRoute?.jobs?.reduce((sum, j) => sum + j.duration, 0) || 0;
              const isSelected = selectedTech === tech.id;
              const isOff = isTechOff(tech.id);

              // Calculate route quality
              const routeQuality = calculateRouteQuality(techRoute);

              // Format zone prefix (Z1, Z2, or 2nd)
              const getZonePrefix = (zone) => {
                if (!zone) return '';
                const zoneStr = String(zone).toLowerCase();
                if (zoneStr.includes('2nd') || zoneStr.includes('second')) return '2nd';
                if (zoneStr.includes('zone')) {
                  const match = zoneStr.match(/\d+/);
                  return match ? `Z${match[0]}` : '';
                }
                return zone;
              };
              const zonePrefix = getZonePrefix(tech.zone);

              return (
                <div
                  key={tech.id}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDropOnTech(e, tech.id)}
                  onClick={() => handleTechClick(tech.id)}
                  style={{
                    marginBottom: '6px',
                    padding: '8px',
                    backgroundColor: isOff
                      ? 'rgba(239, 68, 68, 0.15)'
                      : (isSelected ? 'var(--status-in-progress-bg)' : (jobCount > 0 ? 'var(--active-bg)' : 'var(--surface-secondary)')),
                    border: isOff
                      ? '2px solid var(--danger-color)'
                      : (isSelected ? '2px solid var(--info-color)' : '2px dashed #e5e7eb'),
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    opacity: isOff ? 0.8 : 1
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: jobCount > 0 ? '6px' : '0'
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontWeight: '600',
                        fontSize: '12px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        {zonePrefix && (
                          <span style={{
                            backgroundColor: 'var(--info-color)',
                            color: 'white',
                            padding: '2px 4px',
                            borderRadius: '3px',
                            fontSize: '9px',
                            fontWeight: '700',
                            flexShrink: 0
                          }}>
                            {zonePrefix}
                          </span>
                        )}
                        {/* Route Quality Indicator */}
                        {!isOff && jobCount > 0 && (
                          <RouteQualityTooltip
                            routeQuality={routeQuality}
                            size="8px"
                            direction="left"
                            onDotClick={(e) => e.stopPropagation()}
                          />
                        )}
                        <span>{formatTechName(tech.name)}</span>
                        {optimizingTechs.has(tech.id) && (
                          <i className="fas fa-spinner fa-spin" style={{ marginLeft: '4px', color: 'var(--info-color)', fontSize: '10px' }} title="Optimizing route..."></i>
                        )}
                        {!isOff && (
                          <span
                            title={techStartTimes[tech.id] ? `Custom start: ${techStartTimes[tech.id]}` : "Set start time"}
                            style={{
                              cursor: 'pointer',
                              marginLeft: '4px',
                              fontSize: '10px',
                              color: techStartTimes[tech.id] ? 'var(--success-color)' : 'var(--text-muted)',
                              flexShrink: 0
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              const currentTime = techStartTimes[tech.id] || (tech.shift === 'second' ? '13:15' : '08:15');
                              const newTime = prompt(`Set start time for ${tech.name}:`, currentTime);
                              if (newTime && /^\d{1,2}:\d{2}$/.test(newTime)) {
                                setTechStartTimes({ ...techStartTimes, [tech.id]: newTime });
                              } else if (newTime === '' || newTime === null) {
                                // Clear custom time
                                const updated = { ...techStartTimes };
                                delete updated[tech.id];
                                setTechStartTimes(updated);
                              }
                            }}
                          >
                            <i className="fas fa-clock"></i>
                          </span>
                        )}
                        {isOff && (
                          <span style={{
                            backgroundColor: 'var(--danger-color)',
                            color: 'white',
                            padding: '1px 4px',
                            borderRadius: '3px',
                            fontSize: '8px',
                            fontWeight: '700',
                            flexShrink: 0
                          }}>
                            OFF
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                        {offices[tech.office]?.shortName}
                      </div>
                    </div>
                    {jobCount > 0 && (
                      <div style={{
                        fontSize: '10px',
                        fontWeight: '600',
                        color: 'var(--info-color)',
                        textAlign: 'right',
                        marginLeft: '8px'
                      }}>
                        <div style={{ fontSize: '11px' }}>{jobCount} job{jobCount !== 1 ? 's' : ''}</div>
                        <div>{totalHours.toFixed(1)}h work</div>
                        {(() => {
                          const assignedDTs = new Set();
                          let jobsWithDT = 0;
                          techRoute.jobs.forEach(job => {
                            if (job.assignedDemoTech) {
                              assignedDTs.add(job.assignedDemoTech.name);
                              jobsWithDT++;
                            }
                          });
                          if (assignedDTs.size > 0) {
                            return (
                              <div style={{ fontSize: '9px', color: 'var(--warning-color)', marginTop: '2px' }}>
                                <i className="fas fa-user-plus"></i> DT ({jobsWithDT}): {Array.from(assignedDTs).join(', ')}
                              </div>
                            );
                          }
                        })()}
                        {techRoute.jobs.length > 0 && techRoute.jobs[techRoute.jobs.length - 1].endTime && (
                          <div style={{ fontSize: '9px', color: 'var(--success-color)', marginTop: '2px' }}>
                            Return: {(() => {
                              const lastJob = techRoute.jobs[techRoute.jobs.length - 1];
                              const endMinutes = parseInt(lastJob.endTime.split(':')[0]) * 60 + parseInt(lastJob.endTime.split(':')[1]);
                              const returnMinutes = endMinutes + 30; // Add 30 min return drive
                              const hours = Math.floor(returnMinutes / 60);
                              const mins = returnMinutes % 60;
                              return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
                            })()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Job type indicators */}
                  {techRoute && techRoute.jobs && techRoute.jobs.length > 0 && (
                    <div
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        handleDragStart(e, techRoute.jobs, tech.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: 'flex',
                        gap: '3px',
                        flexWrap: 'wrap',
                        cursor: 'grab'
                      }}
                    >
                      {techRoute.jobs.map((job) => (
                        <div
                          key={job.id}
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: getJobTypeColor(job.jobType),
                            border: job.requiresTwoTechs ? '1px solid var(--warning-color)' : 'none'
                          }}
                          title={`${job.customerName}\n${job.jobType} - ${job.duration}h${job.assignedDemoTech ? `\nDemo Tech: ${job.assignedDemoTech.name}` : ''}${job.isHelperJob ? `\nHelping: ${job.primaryTechName}` : ''}`}
                        />
                      ))}
                    </div>
                  )}

                  {(!techRoute || !techRoute.jobs || techRoute.jobs.length === 0) && (
                    <div style={{
                      fontSize: '10px',
                      color: 'var(--text-muted)',
                      fontStyle: 'italic',
                      textAlign: 'center',
                      marginTop: '4px'
                    }}>
                      Drop here
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Google Calendar Setup Modal */}
      {showGoogleSetup && (
        <div className="modal-overlay active" onClick={() => setShowGoogleSetup(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h3><i className="fas fa-calendar"></i> Google Calendar Setup</h3>
              <button className="modal-close" onClick={() => setShowGoogleSetup(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ marginTop: 0 }}>Step 1: Get Google Client ID</h4>
                <ol style={{ paddingLeft: '20px', fontSize: '14px', lineHeight: '1.6' }}>
                  <li>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer">Google Cloud Console</a></li>
                  <li>Create a new project or select an existing one</li>
                  <li>Enable the Google Calendar API</li>
                  <li>Go to "Credentials" and create an OAuth 2.0 Client ID</li>
                  <li>Set application type to "Web application"</li>
                  <li>Add your app URL to "Authorized JavaScript origins"</li>
                  <li>Copy the Client ID</li>
                </ol>
              </div>

              <div className="form-group">
                <label htmlFor="googleClientId">
                  Google OAuth Client ID
                  <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--success-color)' }}>
                    ✓ Default configured
                  </span>
                </label>
                <input
                  type="text"
                  id="googleClientId"
                  className="form-control"
                  value={googleClientId}
                  onChange={(e) => setGoogleClientId(e.target.value)}
                  placeholder="123456789-abcdefg.apps.googleusercontent.com"
                  style={{ fontFamily: 'monospace', fontSize: '13px' }}
                />
                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  A default Client ID is already configured. Only change this if you need to use a different Google Cloud project.
                </div>
              </div>

              <div style={{ padding: '12px', backgroundColor: 'var(--active-bg)', borderRadius: '6px', fontSize: '13px', marginTop: '16px' }}>
                <strong>Step 2: Configure Tech Emails</strong>
                <p style={{ margin: '8px 0 0 0', color: 'var(--text-secondary)' }}>
                  Make sure each technician in the Team section has their Gmail address configured.
                  This is used to push events to their Google Calendar.
                </p>
              </div>

              <div style={{ padding: '12px', backgroundColor: 'var(--status-pending-bg)', borderRadius: '6px', fontSize: '13px', marginTop: '12px' }}>
                <strong>⚠️ Important:</strong>
                <p style={{ margin: '8px 0 0 0', color: 'var(--warning-color)' }}>
                  Users will need to authorize access to their Google Calendar the first time you push routes.
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowGoogleSetup(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSaveGoogleClientId}
                disabled={!googleClientId}
              >
                <i className="fas fa-save"></i> Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Two-Tech Assignment Modal */}
      {pendingRouteDropData && (
        <TwoTechAssignmentModal
          isOpen={showTwoTechModal}
          onClose={() => {
            setShowTwoTechModal(false);
            setPendingRouteDropData(null);
          }}
          routeJobs={pendingRouteDropData.routeJobs}
          targetTech={pendingRouteDropData.targetTech}
          availableDemoTechs={getAvailableDemoTechs(pendingRouteDropData.targetTech)}
          onComplete={completeTwoTechRouteAssignment}
        />
      )}

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
  );
};

export default ManualMode;
