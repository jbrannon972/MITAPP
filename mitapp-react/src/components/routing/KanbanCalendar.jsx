import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getMapboxService } from '../../services/mapboxService';
import { debounce, safeAsync, formatTimeAMPM } from '../../utils/routingHelpers';
import { DEFAULT_TRAVEL_TIME, OFF_STATUSES } from '../../utils/routingConstants';
import { detectConflicts, autoFixConflicts } from '../../utils/conflictDetection';
import { smartFillTechDay, optimizeJobSelection } from '../../utils/smartAssignment';
import ConflictPanel from './ConflictPanel';
import TechRecommendationTooltip from './TechRecommendationTooltip';

const KanbanCalendar = ({
  jobs: initialJobs,
  routes: initialRoutes,
  techs,
  offices,
  mapboxToken,
  onUpdateRoutes,
  onUpdateJobs,
  selectedDate,
  scheduleForDay,
  showAlert,
  showConfirm,
  techStartTimes,
  setTechStartTimes,
  companyMeetingMode
}) => {
  // Local state for instant UI updates
  // Initialize once and NEVER sync from props again - child is authoritative
  const [localJobs, setLocalJobs] = useState(initialJobs);
  const [localRoutes, setLocalRoutes] = useState(initialRoutes);
  const hasInitialized = useRef(false);
  const [draggedJob, setDraggedJob] = useState(null);
  const [draggedTech, setDraggedTech] = useState(null);
  const [dragOverTech, setDragOverTech] = useState(null);
  const [showMapModal, setShowMapModal] = useState(false);
  const [selectedTechForMap, setSelectedTechForMap] = useState(null);
  const [showJobModal, setShowJobModal] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [isCalculatingDrive, setIsCalculatingDrive] = useState(false);
  const [returnToOfficeTimes, setReturnToOfficeTimes] = useState({});
  const scrollContainerRef = useRef(null);
  const columnRefs = useRef({});
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const isUpdatingRef = useRef(false);
  const updateTimeoutRef = useRef(null);

  // Multi-select state
  const [selectedJobs, setSelectedJobs] = useState(new Set());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);

  // Conflict detection state
  const [conflicts, setConflicts] = useState([]);

  // Tech recommendation tooltip state
  const [techRecommendation, setTechRecommendation] = useState(null);

  // Hide Off techs toggle state
  const [hideOffTechs, setHideOffTechs] = useState(() => {
    const saved = localStorage.getItem('hideOffTechs');
    return saved ? JSON.parse(saved) : false;
  });

  // Get all techs including demo techs for second tech assignment
  const allTechs = [...techs];
  const demoTechs = techs.filter(t => t.isDemoTech || t.role?.toLowerCase().includes('demo'));

  // Helper function to format tech names (First Name + Last Initial)
  const formatTechName = (fullName) => {
    if (!fullName) return '';
    const parts = fullName.trim().split(' ');
    if (parts.length < 2) return fullName;
    const firstName = parts[0];
    const lastInitial = parts[parts.length - 1][0];
    return `${firstName} ${lastInitial}.`;
  };

  // Removed deepEqual - not currently used in the component

  // Initialize from props ONLY on first mount or when date changes
  // Child component is the authoritative source of truth during a session
  useEffect(() => {
    if (!hasInitialized.current) {
      console.log('🎬 Initial load - setting state from props');
      setLocalJobs(initialJobs);
      setLocalRoutes(initialRoutes);
      hasInitialized.current = true;
    } else {
      console.log('⏭️ Ignoring prop changes - child state is authoritative');
    }
  }, [initialJobs, initialRoutes]);

  // Reset when date changes
  useEffect(() => {
    console.log('📅 Date changed, resetting state');
    setLocalJobs(initialJobs);
    setLocalRoutes(initialRoutes);
    hasInitialized.current = true;
  }, [selectedDate]);

  // Save hideOffTechs preference to localStorage
  useEffect(() => {
    localStorage.setItem('hideOffTechs', JSON.stringify(hideOffTechs));
  }, [hideOffTechs]);

  // Calculate return to office times - debounced to avoid excessive API calls
  useEffect(() => {
    const calculateReturnTimes = async () => {
      const newReturnTimes = {};

      for (const tech of techs) {
        const techRoute = localRoutes[tech.id];
        const techJobs = techRoute?.jobs || [];

        if (techJobs.length === 0) {
          newReturnTimes[tech.id] = null;
          continue;
        }

        // Sort jobs by start time to find the actual last job
        const sortedJobs = [...techJobs].sort((a, b) => {
          const aTime = timeToMinutes(a.startTime || a.timeframeStart);
          const bTime = timeToMinutes(b.startTime || b.timeframeStart);
          return aTime - bTime;
        });

        const lastJob = sortedJobs[sortedJobs.length - 1];
        const lastJobEndTime = lastJob.endTime || lastJob.timeframeEnd;

        // Get office address - ALWAYS use tech's home office for return
        // Even in Company Meeting Mode, techs return to their home office
        const officeKey = tech.office;
        const officeAddress = offices[officeKey]?.address;
        const officeName = offices[officeKey]?.name || 'Office';

        console.log(`🏠 Return calculation for ${tech.name}:`, {
          homeOffice: officeName,
          lastJob: lastJob.customerName,
          companyMeetingMode
        });

        if (!officeAddress || !lastJob.address) {
          // Fallback: use default travel time
          const endMinutes = timeToMinutes(lastJobEndTime);
          newReturnTimes[tech.id] = {
            time: minutesToTime(endMinutes + DEFAULT_TRAVEL_TIME),
            driveTime: DEFAULT_TRAVEL_TIME,
            isEstimate: true
          };
          continue;
        }

        // Use safeAsync for error handling with traffic-aware routing
        const result = await safeAsync(
          async () => {
            const mapboxService = getMapboxService();

            // Create departure time for traffic-aware routing (when last job ends)
            const [hours, minutes] = lastJobEndTime.split(':').map(Number);
            const departureTime = new Date(selectedDate + 'T00:00:00');
            departureTime.setHours(hours, minutes, 0, 0);

            return await mapboxService.getDrivingDistance(lastJob.address, officeAddress, departureTime);
          },
          'Error calculating return time',
          () => null // Return null on error
        );

        const driveMinutes = result?.durationMinutes || DEFAULT_TRAVEL_TIME;
        const endMinutes = timeToMinutes(lastJobEndTime);
        const returnTime = minutesToTime(endMinutes + driveMinutes);

        if (result?.trafficAware) {
          console.log(`🚦 Traffic-aware return time for ${tech.name}: ${driveMinutes}m (departure: ${lastJobEndTime})`);
        }

        newReturnTimes[tech.id] = {
          time: returnTime,
          driveTime: driveMinutes,
          isEstimate: !result
        };
      }

      setReturnToOfficeTimes(newReturnTimes);
    };

    // Debounce the calculation to avoid hammering the API
    const debouncedCalculate = debounce(calculateReturnTimes, 500);
    debouncedCalculate();

    return () => {
      // Cleanup function if needed
    };
  }, [localRoutes, techs, offices]);

  // Recalculate drive times on initial load to fix any default/estimated times
  // This ensures routes from auto-optimizer get real Mapbox drive times
  useEffect(() => {
    const recalculateAllDriveTimes = async () => {
      let needsUpdate = false;
      const updatedRoutes = { ...localRoutes };

      for (const tech of techs) {
        const techRoute = updatedRoutes[tech.id];
        if (!techRoute || !techRoute.jobs || techRoute.jobs.length === 0) continue;

        // Check if any jobs have missing or default (20 min) travel times
        const hasDefaultTimes = techRoute.jobs.some(
          j => !j.travelTime || j.travelTime === 20
        );

        if (hasDefaultTimes) {
          console.log(`🔄 Recalculating drive times for ${tech.name}...`);
          updatedRoutes[tech.id] = await recalculateRouteTimings(tech.id, updatedRoutes);
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        console.log('✅ Drive times recalculated with real Mapbox data');
        setLocalRoutes(updatedRoutes);
        await onUpdateRoutes(updatedRoutes);
      }
    };

    // Only run once on initial load, with a small delay to let other initializations finish
    if (hasInitialized.current && Object.keys(localRoutes).length > 0) {
      const timer = setTimeout(() => {
        recalculateAllDriveTimes();
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, []); // Empty deps - run only once on mount

  // Initialize map when modal opens
  useEffect(() => {
    if (!showMapModal || !mapContainerRef.current || mapInstanceRef.current) return;

    const mapboxToken = localStorage.getItem('mapboxToken') ||
                        'pk.eyJ1IjoiamJyYW5ub245NzIiLCJhIjoiY204NXN2Z2w2Mms4ODJrb2tvemV2ZnlicyJ9.84JYhRSUAF5_-vvdebw-TA';

    mapboxgl.accessToken = mapboxToken;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-95.5698, 30.1945],
      zoom: 10
    });

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Wait for map to load before rendering route
    map.on('load', () => {
      mapInstanceRef.current = map;
      renderRouteOnMap();
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [showMapModal]);

  // Conflict detection - runs whenever routes or jobs change
  useEffect(() => {
    const detectedConflicts = detectConflicts(localRoutes, localJobs, scheduleForDay, techs);
    setConflicts(detectedConflicts);
  }, [localRoutes, localJobs, scheduleForDay, techs]);

  // Auto-fix conflicts handler
  const handleAutoFix = useCallback(async (conflictsToFix) => {
    const result = autoFixConflicts(conflictsToFix, localRoutes, localJobs, techs);

    if (result.fixedConflicts.length > 0) {
      // Update local state
      setLocalRoutes(result.routes);
      setLocalJobs(result.jobs);

      // Update parent
      await onUpdateRoutes(result.routes);
      await onUpdateJobs(result.jobs);

      // Show summary
      showAlert(
        `Fixed ${result.fixedConflicts.length} conflicts!\n\n` +
        `${result.unfixedConflicts.length > 0
          ? `⚠️ ${result.unfixedConflicts.length} conflicts require manual intervention.`
          : 'All conflicts resolved!'}`,
        'Conflicts Resolved',
        result.unfixedConflicts.length > 0 ? 'warning' : 'success'
      );
    } else {
      showAlert('Could not automatically fix these conflicts. Please resolve them manually.', 'Manual Intervention Required', 'warning');
    }
  }, [localRoutes, localJobs, techs, onUpdateRoutes, onUpdateJobs]);

  // Smart Fill Day handler
  const handleSmartFillDay = useCallback(async (tech) => {
    const unassignedJobs = localJobs.filter(j => !j.assignedTech);

    if (unassignedJobs.length === 0) {
      showAlert('No unassigned jobs available.', 'No Jobs', 'info');
      return;
    }

    try {
      const result = await smartFillTechDay(tech, unassignedJobs, localRoutes, scheduleForDay, {
        targetHours: 8,
        offices
      });

      if (result.selectedJobs.length === 0) {
        showAlert(`No suitable jobs found for ${tech.name}.`, 'No Jobs Found', 'info');
        return;
      }

      // Show preview
      showConfirm(
        `Smart Fill for ${tech.name}\n\n` +
        `Selected ${result.selectedJobs.length} jobs (${result.addedHours.toFixed(1)} hrs)\n` +
        `Total: ${result.totalHours.toFixed(1)}/8 hrs\n\n` +
        `Jobs:\n${result.selectedJobs.map(j => `• ${j.customerName} (${j.duration}h)`).join('\n')}\n\n` +
        `Continue?`,
        'Smart Fill Preview',
        async () => {

      // Optimize job order
      // Company Meeting Mode: All techs start at 9:00 AM
      const customStartTime = companyMeetingMode
        ? "09:00"
        : techStartTimes[tech.id];
      const optimized = await optimizeJobSelection(result.selectedJobs, tech, localRoutes, {
        offices,
        shift: tech.name?.toLowerCase().includes('second') ? 'second' : 'first',
        customStartTime: customStartTime,
        companyMeetingMode: companyMeetingMode
      });

      // Assign jobs
      const updatedRoutes = { ...localRoutes };
      if (!updatedRoutes[tech.id]) {
        updatedRoutes[tech.id] = { tech, jobs: [] };
      }
      updatedRoutes[tech.id].jobs = [
        ...updatedRoutes[tech.id].jobs,
        ...optimized.optimizedJobs
      ];

      const updatedJobs = localJobs.map(j =>
        result.selectedJobs.find(sj => sj.id === j.id)
          ? { ...j, assignedTech: tech.id, status: 'assigned' }
          : j
      );

      setLocalRoutes(updatedRoutes);
      setLocalJobs(updatedJobs);
      await onUpdateRoutes(updatedRoutes);
      await onUpdateJobs(updatedJobs);

      showAlert(`Successfully assigned ${result.selectedJobs.length} jobs to ${tech.name}!`, 'Smart Fill Complete', 'success');
        },
        'question'
      );
    } catch (error) {
      console.error('Error in smart fill:', error);
      showAlert(`Error filling day: ${error.message}`, 'Error', 'error');
    }
  }, [localJobs, localRoutes, scheduleForDay, offices, techs, onUpdateRoutes, onUpdateJobs]);

  // Multi-select handlers
  const handleJobClick = useCallback((job, event) => {
    if (event.shiftKey || event.ctrlKey || event.metaKey || isMultiSelectMode) {
      // Multi-select mode
      const newSelected = new Set(selectedJobs);
      if (newSelected.has(job.id)) {
        newSelected.delete(job.id);
      } else {
        newSelected.add(job.id);
      }
      setSelectedJobs(newSelected);
      setIsMultiSelectMode(newSelected.size > 0);
    } else if (!job.assignedTech) {
      // Single select unassigned job - show tech recommendations
      const rect = event.currentTarget.getBoundingClientRect();
      setTechRecommendation({
        job,
        position: {
          x: rect.right + 10,
          y: rect.top
        }
      });
    } else {
      // Assigned job - open modal for editing
      setSelectedJob({...job});
      setShowJobModal(true);
    }
  }, [isMultiSelectMode, selectedJobs]);

  const handleAssignSelectedJobs = useCallback(async (techId) => {
    if (selectedJobs.size === 0) return;

    const tech = techs.find(t => t.id === techId);
    if (!tech) return;

    const jobsToAssign = localJobs.filter(j => selectedJobs.has(j.id));

    // Optimize job order
    // Company Meeting Mode: All techs start at 9:00 AM
    const customStartTime = companyMeetingMode
      ? "09:00"
      : techStartTimes[tech.id];
    const optimized = await optimizeJobSelection(jobsToAssign, tech, localRoutes, {
      offices,
      shift: tech.name?.toLowerCase().includes('second') ? 'second' : 'first',
      customStartTime: customStartTime,
      companyMeetingMode: companyMeetingMode
    });

    // Update routes
    const updatedRoutes = { ...localRoutes };
    if (!updatedRoutes[techId]) {
      updatedRoutes[techId] = { tech, jobs: [] };
    }
    updatedRoutes[techId].jobs = [...updatedRoutes[techId].jobs, ...optimized.optimizedJobs];

    // Update jobs
    const updatedJobs = localJobs.map(j =>
      selectedJobs.has(j.id)
        ? { ...j, assignedTech: techId, status: 'assigned' }
        : j
    );

    setLocalRoutes(updatedRoutes);
    setLocalJobs(updatedJobs);
    await onUpdateRoutes(updatedRoutes);
    await onUpdateJobs(updatedJobs);

    // Clear selection
    setSelectedJobs(new Set());
    setIsMultiSelectMode(false);
  }, [selectedJobs, techs, localJobs, localRoutes, offices, techStartTimes, companyMeetingMode, onUpdateRoutes, onUpdateJobs]);

  // Render route on map
  const renderRouteOnMap = () => {
    if (!mapInstanceRef.current || !selectedTechForMap) return;

    const map = mapInstanceRef.current;
    const techRoute = localRoutes[selectedTechForMap];

    if (!techRoute || !techRoute.jobs || techRoute.jobs.length === 0) {
      console.log('No jobs to display on map');
      return;
    }

    // Clear existing markers and layers
    const markers = document.getElementsByClassName('mapboxgl-marker');
    while(markers[0]) {
      markers[0].remove();
    }

    if (map.getLayer('route')) map.removeLayer('route');
    if (map.getSource('route')) map.removeSource('route');

    // Get START office coordinates - use Conroe during Company Meeting Mode
    const startOfficeKey = companyMeetingMode ? 'office_1' : techRoute.tech.office;
    const startOfficeCoords = startOfficeKey === 'office_1'
      ? { lng: -95.4559, lat: 30.3119 } // Conroe
      : { lng: -95.6508, lat: 29.7858 }; // Katy

    // Get RETURN office coordinates - always use tech's home office
    const returnOfficeKey = techRoute.tech.office;
    const returnOfficeCoords = returnOfficeKey === 'office_1'
      ? { lng: -95.4559, lat: 30.3119 } // Conroe
      : { lng: -95.6508, lat: 29.7858 }; // Katy

    const coordinates = [[startOfficeCoords.lng, startOfficeCoords.lat]];

    // Add START office marker
    const startOfficeEl = document.createElement('div');
    startOfficeEl.innerHTML = `<div style="background-color: var(--success-color); color: var(--surface-color); width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px; border: 3px solid var(--surface-color); box-shadow: 0 2px 8px rgba(0,0,0,0.3);"><i class="fas fa-home"></i></div>`;
    new mapboxgl.Marker(startOfficeEl)
      .setLngLat([startOfficeCoords.lng, startOfficeCoords.lat])
      .setPopup(new mapboxgl.Popup({ offset: 25 })
        .setHTML(`<div style="padding: 8px;"><strong>${offices[startOfficeKey]?.name}</strong><br/>Start Point</div>`))
      .addTo(map);

    // Add job markers and build route
    techRoute.jobs.forEach((job, idx) => {
      if (job.coordinates && job.coordinates.lng && job.coordinates.lat) {
        coordinates.push([job.coordinates.lng, job.coordinates.lat]);

        const el = document.createElement('div');
        el.innerHTML = `<div style="background-color: var(--info-color); color: var(--surface-color); width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; border: 3px solid var(--surface-color); box-shadow: 0 2px 8px rgba(0,0,0,0.3); cursor: pointer;">${idx + 1}</div>`;

        new mapboxgl.Marker(el)
          .setLngLat([job.coordinates.lng, job.coordinates.lat])
          .setPopup(new mapboxgl.Popup({ offset: 25 })
            .setHTML(`<div style="padding: 8px;"><strong>${idx + 1}. ${job.customerName}</strong><br/>${job.address}<br/>${formatTimeAMPM(job.startTime || job.timeframeStart)} - ${formatTimeAMPM(job.endTime || job.timeframeEnd)}<br/>${job.duration}h</div>`))
          .addTo(map);
      }
    });

    // Return to tech's home office
    coordinates.push([returnOfficeCoords.lng, returnOfficeCoords.lat]);

    // Add RETURN office marker (only if different from start)
    if (startOfficeKey !== returnOfficeKey) {
      const returnOfficeEl = document.createElement('div');
      returnOfficeEl.innerHTML = `<div style="background-color: var(--warning-color); color: var(--surface-color); width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px; border: 3px solid var(--surface-color); box-shadow: 0 2px 8px rgba(0,0,0,0.3);"><i class="fas fa-flag-checkered"></i></div>`;
      new mapboxgl.Marker(returnOfficeEl)
        .setLngLat([returnOfficeCoords.lng, returnOfficeCoords.lat])
        .setPopup(new mapboxgl.Popup({ offset: 25 })
          .setHTML(`<div style="padding: 8px;"><strong>${offices[returnOfficeKey]?.name}</strong><br/>End Point</div>`))
        .addTo(map);
    }

    // Fetch actual driving routes from Mapbox Directions API
    if (coordinates.length > 2) {
      // Build Mapbox Directions API request
      const coordinatesString = coordinates.map(coord => `${coord[0]},${coord[1]}`).join(';');
      const directionsUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinatesString}?geometries=geojson&overview=full&access_token=${mapboxToken}`;

      fetch(directionsUrl)
        .then(response => response.json())
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
                'line-color': '#3b82f6', // Blue
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

            const bounds = coordinates.reduce(
              (bounds, coord) => bounds.extend(coord),
              new mapboxgl.LngLatBounds(coordinates[0], coordinates[0])
            );
            map.fitBounds(bounds, { padding: 50 });
          }
        })
        .catch(error => {
          console.error('Error fetching directions:', error);
          // Fallback to straight lines on error
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

          const bounds = coordinates.reduce(
            (bounds, coord) => bounds.extend(coord),
            new mapboxgl.LngLatBounds(coordinates[0], coordinates[0])
          );
          map.fitBounds(bounds, { padding: 50 });
        });
    }
  };

  // Re-render route when tech or routes change
  useEffect(() => {
    if (showMapModal && mapInstanceRef.current) {
      renderRouteOnMap();
    }
  }, [selectedTechForMap, localRoutes, showMapModal]);

  // Time configuration
  const startHour = 7;
  const endHour = 20;
  const pixelsPerHour = 80;
  const totalHours = endHour - startHour;
  const timelineHeight = totalHours * pixelsPerHour;

  const timeSlots = Array.from({ length: totalHours + 1 }, (_, i) => {
    const hour = startHour + i;
    return `${String(hour).padStart(2, '0')}:00`;
  });

  // Debug: log time configuration on first render
  useEffect(() => {
    console.log('📊 Time Configuration:', {
      startHour,
      endHour,
      totalHours,
      pixelsPerHour,
      timelineHeight,
      timeSlotsCount: timeSlots.length,
      firstSlot: timeSlots[0],
      lastSlot: timeSlots[timeSlots.length - 1]
    });
  }, []);

  // Recalculate all routes when Company Meeting Mode is toggled or on initial mount if meeting mode is ON
  useEffect(() => {
    // On initial mount, only recalculate if meeting mode is ON
    // On subsequent changes, always recalculate
    const isInitialMount = !hasInitialized.current;
    if (isInitialMount && !companyMeetingMode) {
      return; // Skip initial mount if meeting mode is OFF
    }

    console.log('🔄 Company Meeting Mode:', companyMeetingMode ? 'ON' : 'OFF', isInitialMount ? '(initial mount)' : '(toggled)');

    // Recalculate all tech routes
    const recalculateAllRoutes = async () => {
      const updatedRoutes = { ...localRoutes };
      let hasChanges = false;

      for (const techId in updatedRoutes) {
        if (updatedRoutes[techId]?.jobs?.length > 0) {
          console.log(`♻️ Recalculating route for tech ${techId}`);
          updatedRoutes[techId] = await recalculateRouteTimings(techId, updatedRoutes);
          hasChanges = true;
        }
      }

      if (hasChanges) {
        console.log('✅ All routes recalculated for meeting mode:', companyMeetingMode ? 'ON' : 'OFF');
        setLocalRoutes(updatedRoutes);
        await onUpdateRoutes(updatedRoutes);
      }
    };

    recalculateAllRoutes();
  }, [companyMeetingMode]);

  const getJobTypeColor = (jobType) => {
    const type = jobType.toLowerCase();
    if (type.includes('install')) return 'var(--purple-color)';
    if (type.includes('demo prep') || type.includes('demo-prep')) return 'var(--warning-color)';
    if (type.includes('demo') && !type.includes('check')) return '#ec4899';
    if (type.includes('service') || type.includes('repair')) return 'var(--info-color)';
    if (type.includes('maintenance') || type.includes('maint')) return 'var(--success-color)';
    if (type.includes('inspection') || type.includes('check')) return '#06b6d4';
    return 'var(--text-secondary)';
  };

  const timeToMinutes = (timeStr) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const minutesToTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  };

  const getYPosition = (timeStr) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const minutesFromStart = (hours - startHour) * 60 + minutes;
    const yPos = (minutesFromStart / 60) * pixelsPerHour;

    // Debug logging to help identify timezone issues
    console.log(`📍 getYPosition: ${timeStr} → ${hours}h ${minutes}m → ${minutesFromStart}min from ${startHour}:00 → ${yPos}px`);

    return yPos;
  };

  const getTimeFromY = (yPos) => {
    const minutesFromStart = Math.round((yPos / pixelsPerHour) * 60);
    const totalMinutes = startHour * 60 + minutesFromStart;
    const roundedMinutes = Math.round(totalMinutes / 15) * 15;
    return minutesToTime(roundedMinutes);
  };

  // Check if job arrival is outside its timeframe window
  const isOutsideTimeframe = (job) => {
    // Don't show badge for second tech assignments or jobs without timeframes
    if (job.type === 'secondTechAssignment') {
      return false;
    }

    // Must have all three fields to check
    if (!job.timeframeStart || !job.timeframeEnd || !job.startTime) {
      return false;
    }

    try {
      const startMinutes = timeToMinutes(job.startTime);
      const windowStart = timeToMinutes(job.timeframeStart);
      const windowEnd = timeToMinutes(job.timeframeEnd);

      return startMinutes < windowStart || startMinutes > windowEnd;
    } catch (error) {
      // If there's any error parsing times, don't show badge
      return false;
    }
  };

  // Check if a tech is marked as off for the day - memoized
  const isTechOff = useCallback((techId) => {
    if (!scheduleForDay || !scheduleForDay.staff) return false;

    const staffEntry = scheduleForDay.staff.find(s => s.id === techId);
    if (!staffEntry) return false;

    // Use constant for off statuses
    return OFF_STATUSES.includes(staffEntry.status?.toLowerCase());
  }, [scheduleForDay]);

  // Calculate optimal start time based on drive time (ignoring drag position)
  const calculateOptimalStartTime = async (job, targetTechId) => {
    const techRoute = localRoutes[targetTechId];
    const techJobs = techRoute?.jobs || [];
    const targetTech = techs.find(t => t.id === targetTechId);

    // Get tech's start time (respect custom start times, company meeting mode, and second shift)
    const defaultStartTime = targetTech?.shift === 'second' ? '13:15' : '08:15';
    const shiftStart = companyMeetingMode
      ? "09:00"
      : (techStartTimes[targetTechId] || defaultStartTime);

    // If no jobs, start from office + drive time to first job
    // Company Meeting Mode: All techs start at Conroe office
    if (techJobs.length === 0) {
      const officeKey = companyMeetingMode ? 'office_1' : (targetTech?.office || 'office_1');
      const officeAddress = offices[officeKey]?.address;

      if (!officeAddress || !job.address) {
        // No office address or job address, just use shift start time
        return shiftStart;
      }

      // Calculate drive time from office to job with traffic-aware routing
      setIsCalculatingDrive(true);
      try {
        const mapboxService = getMapboxService();

        // Create departure time for traffic-aware routing
        const [hours, minutes] = shiftStart.split(':').map(Number);
        const departureTime = new Date(selectedDate + 'T00:00:00');
        departureTime.setHours(hours, minutes, 0, 0);

        const result = await mapboxService.getDrivingDistance(officeAddress, job.address, departureTime);
        const driveMinutes = Math.ceil(result.durationMinutes || 20);

        if (result.trafficAware) {
          console.log(`🚦 Traffic-aware drive time for new job: ${driveMinutes}m (departure: ${shiftStart})`);
        }

        const shiftMinutes = timeToMinutes(shiftStart);
        const calculatedStartMinutes = shiftMinutes + driveMinutes;

        setIsCalculatingDrive(false);
        return minutesToTime(calculatedStartMinutes);
      } catch (error) {
        console.error('Drive time error:', error);
        setIsCalculatingDrive(false);
        return minutesToTime(timeToMinutes(shiftStart) + 20);
      }
    }

    // If jobs exist, ALWAYS add to the end (after the last job chronologically)
    const sortedJobs = [...techJobs].sort((a, b) => {
      const aTime = timeToMinutes(a.startTime || a.timeframeStart);
      const bTime = timeToMinutes(b.startTime || b.timeframeStart);
      return aTime - bTime;
    });

    const lastJob = sortedJobs[sortedJobs.length - 1];

    // Calculate drive time from last job to new job with traffic-aware routing
    setIsCalculatingDrive(true);
    try {
      const mapboxService = getMapboxService();

      // Create departure time for traffic-aware routing (when last job ends)
      const lastJobEndTime = lastJob.endTime || lastJob.timeframeEnd;
      const [hours, minutes] = lastJobEndTime.split(':').map(Number);
      const departureTime = new Date(selectedDate + 'T00:00:00');
      departureTime.setHours(hours, minutes, 0, 0);

      const result = await mapboxService.getDrivingDistance(lastJob.address, job.address, departureTime);
      const driveMinutes = Math.ceil(result.durationMinutes || 20);

      if (result.trafficAware) {
        console.log(`🚦 Traffic-aware drive time after last job: ${driveMinutes}m (departure: ${lastJobEndTime})`);
      }

      const lastJobEndMinutes = timeToMinutes(lastJobEndTime);
      const calculatedStartMinutes = lastJobEndMinutes + driveMinutes;

      setIsCalculatingDrive(false);
      return minutesToTime(calculatedStartMinutes);
    } catch (error) {
      console.error('Drive time error:', error);
      setIsCalculatingDrive(false);
      const lastJobEndMinutes = timeToMinutes(lastJob.endTime || lastJob.timeframeEnd);
      return minutesToTime(lastJobEndMinutes + 20);
    }
  };

  /**
   * Recalculate all job timings for a tech's route
   * IMPORTANT: Respects the current order of jobs in the array - does NOT sort!
   * This allows arrow buttons to reorder jobs by swapping array positions.
   */
  const recalculateRouteTimings = async (techId, routes) => {
    const techRoute = routes[techId];
    if (!techRoute || !techRoute.jobs || techRoute.jobs.length === 0) {
      return techRoute;
    }

    const tech = techs.find(t => t.id === techId);
    // Company Meeting Mode: All techs start at Conroe office
    const officeKey = companyMeetingMode ? 'office_1' : (tech?.office || 'office_1');
    const officeAddress = offices[officeKey]?.address;
    const mapboxService = getMapboxService();

    // Get tech's start time (respect company meeting mode, custom start times, and second shift)
    const defaultStartTime = tech?.shift === 'second' ? '13:15' : '08:15';
    const shiftStart = companyMeetingMode
      ? "09:00"
      : (techStartTimes[techId] || defaultStartTime);

    // Use jobs in their CURRENT order - do NOT sort!
    // The order has been set by arrow buttons or drag-drop
    const jobsInOrder = [...techRoute.jobs];

    const recalculatedJobs = [];

    // Helper to create departure time Date object for traffic-aware routing
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

    for (let i = 0; i < jobsInOrder.length; i++) {
      const job = jobsInOrder[i];
      let startTime;
      let driveMinutes = 0;

      if (i === 0) {
        // First job: calculate from office with traffic at shift start time
        if (officeAddress && job.address) {
          try {
            const departureTime = createDepartureTime(shiftStart);
            const result = await mapboxService.getDrivingDistance(officeAddress, job.address, departureTime);
            driveMinutes = Math.ceil(result.durationMinutes || 20);

            if (result.trafficAware) {
              console.log(`🚦 Traffic-aware drive time to first job: ${driveMinutes}m (departure: ${shiftStart})`);
            }
          } catch (error) {
            driveMinutes = 20;
          }
        }
        startTime = minutesToTime(timeToMinutes(shiftStart) + driveMinutes);
      } else {
        // Subsequent jobs: calculate from previous job with traffic at departure time
        const prevJob = recalculatedJobs[i - 1];
        if (prevJob.address && job.address) {
          try {
            // Departure time is when the previous job ends
            const departureTime = createDepartureTime(prevJob.endTime);
            const result = await mapboxService.getDrivingDistance(prevJob.address, job.address, departureTime);
            driveMinutes = Math.ceil(result.durationMinutes || 20);

            if (result.trafficAware) {
              console.log(`🚦 Traffic-aware drive time from job ${i} to ${i+1}: ${driveMinutes}m (departure: ${prevJob.endTime})`);
            }
          } catch (error) {
            driveMinutes = 20;
          }
        }
        const prevEndMinutes = timeToMinutes(prevJob.endTime);
        startTime = minutesToTime(prevEndMinutes + driveMinutes);
      }

      const startMinutes = timeToMinutes(startTime);
      const endMinutes = startMinutes + (job.duration * 60);
      const endTime = minutesToTime(endMinutes);

      recalculatedJobs.push({
        ...job,
        startTime,
        endTime,
        travelTime: driveMinutes
      });
    }

    return {
      ...techRoute,
      jobs: recalculatedJobs
    };
  };

  const handleJobDragStart = (e, job, sourceTechId) => {
    setDraggedJob({ job, sourceTechId });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
  };

  const handleTechDragStart = (e, techId) => {
    setDraggedTech(techId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (techId) => {
    setDragOverTech(techId);
  };

  const handleDragLeave = () => {
    setDragOverTech(null);
  };

  const handleJobDrop = async (e, targetTechId) => {
    e.preventDefault();
    setDragOverTech(null);

    if (!draggedJob) return;

    const { job, sourceTechId } = draggedJob;

    if (sourceTechId === targetTechId && !targetTechId) {
      setDraggedJob(null);
      return;
    }

    // Don't allow reordering within same tech via drag - use arrows instead
    if (sourceTechId === targetTechId && sourceTechId) {
      setDraggedJob(null);
      return;
    }

    // Set flag to prevent useEffect syncs during update
    isUpdatingRef.current = true;

    try {
      const updatedRoutes = { ...localRoutes };

      // Calculate start time based on drive time
      const startTime = targetTechId
        ? await calculateOptimalStartTime(job, targetTechId)
        : (job.startTime || job.timeframeStart);

      const startMinutes = timeToMinutes(startTime);
      const endMinutes = startMinutes + (job.duration * 60);
      const endTime = minutesToTime(endMinutes);

      const updatedJob = {
        ...job,
        startTime,
        endTime,
        assignedTech: targetTechId,
        status: targetTechId ? 'assigned' : 'unassigned'
      };

      if (sourceTechId) {
        // Remove job from source tech
        updatedRoutes[sourceTechId] = {
          ...updatedRoutes[sourceTechId],
          jobs: updatedRoutes[sourceTechId].jobs.filter(j => j.id !== job.id)
        };

        // Recalculate remaining jobs' timings to shift them up
        updatedRoutes[sourceTechId] = await recalculateRouteTimings(sourceTechId, updatedRoutes);

        // If job is being removed (not just reassigned), clean up second tech assignments
        if (!targetTechId && job.type !== 'secondTechAssignment') {
          // Remove any second tech assignments linked to this primary job
          Object.keys(updatedRoutes).forEach(techId => {
            if (updatedRoutes[techId]?.jobs) {
              updatedRoutes[techId].jobs = updatedRoutes[techId].jobs.filter(
                j => !(j.type === 'secondTechAssignment' && j.primaryJobId === job.id)
              );
            }
          });
        }
      }

      // Handle second tech assignment being dragged
      if (job.type === 'secondTechAssignment') {
        // Second tech assignments can be moved but stay linked to primary
        if (targetTechId) {
          const targetTech = techs.find(t => t.id === targetTechId);
          if (!updatedRoutes[targetTechId]) {
            updatedRoutes[targetTechId] = {
              tech: targetTech,
              jobs: []
            };
          }
          updatedRoutes[targetTechId].jobs.push(updatedJob);
        }
      } else {
        // Regular job being assigned
        if (targetTechId) {
          const targetTech = techs.find(t => t.id === targetTechId);
          if (!updatedRoutes[targetTechId]) {
            updatedRoutes[targetTechId] = {
              tech: targetTech,
              jobs: []
            };
          }
          updatedRoutes[targetTechId].jobs.push(updatedJob);
        }
      }

      // Update the global jobs list with recalculated times
      const updatedJobs = localJobs.map(j => {
        // If this is the job being moved/unassigned, use the updated version
        if (j.id === job.id) {
          return updatedJob;
        }
        // For source tech: use recalculated job if it exists
        if (sourceTechId && updatedRoutes[sourceTechId]) {
          const recalculatedJob = updatedRoutes[sourceTechId].jobs.find(rj => rj.id === j.id && rj.type !== 'secondTechAssignment');
          if (recalculatedJob) {
            return recalculatedJob;
          }
        }
        // For target tech: use the updated job if it exists
        if (targetTechId && updatedRoutes[targetTechId]) {
          const movedJob = updatedRoutes[targetTechId].jobs.find(rj => rj.id === j.id && rj.type !== 'secondTechAssignment');
          if (movedJob) {
            return movedJob;
          }
        }
        return j;
      });

      setLocalRoutes(updatedRoutes);
      setLocalJobs(updatedJobs);
      setDraggedJob(null);

      await onUpdateRoutes(updatedRoutes);
      await onUpdateJobs(updatedJobs);
    } finally {
      // Clear flag after a brief delay to allow Firebase sync to complete
      setTimeout(() => {
        isUpdatingRef.current = false;
      }, 100);
    }
  };

  const handleRouteSwap = async (e, targetTechId) => {
    e.preventDefault();
    setDragOverTech(null);

    if (!draggedTech || draggedTech === targetTechId) {
      setDraggedTech(null);
      return;
    }

    // Set flag to prevent useEffect syncs during update
    isUpdatingRef.current = true;

    try {
      const updatedRoutes = { ...localRoutes };
      const draggedJobs = updatedRoutes[draggedTech]?.jobs || [];
      const targetJobs = updatedRoutes[targetTechId]?.jobs || [];

      const temp = { ...updatedRoutes[draggedTech] };
      updatedRoutes[draggedTech] = {
        ...(updatedRoutes[targetTechId] || { jobs: [] }),
        tech: temp.tech
      };
      updatedRoutes[targetTechId] = {
        ...temp,
        tech: updatedRoutes[targetTechId]?.tech || techs.find(t => t.id === targetTechId)
      };

      const updatedJobs = localJobs.map(job => {
        if (draggedJobs.some(j => j.id === job.id)) {
          return { ...job, assignedTech: draggedTech };
        }
        if (targetJobs.some(j => j.id === job.id)) {
          return { ...job, assignedTech: targetTechId };
        }
        return job;
      });

      setLocalRoutes(updatedRoutes);
      setLocalJobs(updatedJobs);
      setDraggedTech(null);

      await onUpdateRoutes(updatedRoutes);
      await onUpdateJobs(updatedJobs);
    } finally {
      // Clear any existing timeout
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }

      // Keep flag set for longer to prevent rapid-fire updates
      updateTimeoutRef.current = setTimeout(() => {
        isUpdatingRef.current = false;
      }, 500);
    }
  };

  const handleTechClick = (techId) => {
    setSelectedTechForMap(techId);
    setShowMapModal(true);
  };

  // Move job up in the sequence (earlier in the day)
  const handleMoveJobUp = async (job, techId) => {
    console.log('⬆️ handleMoveJobUp called', { jobId: job.id, techId });

    const updatedRoutes = { ...localRoutes };
    if (!updatedRoutes[techId]) return;

    // Get jobs sorted by time
    const jobs = [...updatedRoutes[techId].jobs].sort((a, b) => {
      const aTime = timeToMinutes(a.startTime || a.timeframeStart);
      const bTime = timeToMinutes(b.startTime || b.timeframeStart);
      return aTime - bTime;
    });

    const currentIndex = jobs.findIndex(j => j.id === job.id);
    console.log('📍 Current index:', currentIndex, 'of', jobs.length);

    if (currentIndex <= 0) {
      console.log('⚠️ Already at top, returning');
      return; // Already at top
    }

    // Set flag to prevent useEffect syncs during update
    isUpdatingRef.current = true;
    console.log('🚩 Set isUpdatingRef = true');

    try {
      // Swap with previous job
      const temp = jobs[currentIndex];
      jobs[currentIndex] = jobs[currentIndex - 1];
      jobs[currentIndex - 1] = temp;
      console.log('🔄 Swapped jobs');

      // Update route with new order
      updatedRoutes[techId].jobs = jobs;

      // Recalculate all job timings
      console.log('⏱️ Recalculating route timings...');
      updatedRoutes[techId] = await recalculateRouteTimings(techId, updatedRoutes);

      // Update global jobs list
      const updatedJobs = localJobs.map(j => {
        const recalculatedJob = updatedRoutes[techId].jobs.find(rj => rj.id === j.id && rj.type !== 'secondTechAssignment');
        return recalculatedJob || j;
      });

      console.log('💾 Setting local state...');
      setLocalRoutes(updatedRoutes);
      setLocalJobs(updatedJobs);

      console.log('☁️ Calling parent update functions...');
      await onUpdateRoutes(updatedRoutes);
      await onUpdateJobs(updatedJobs);
      console.log('✅ Move up complete');
    } catch (error) {
      console.error('❌ Error in handleMoveJobUp:', error);
    } finally {
      // Clear any existing timeout
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }

      // Keep flag set for longer to prevent rapid-fire updates
      updateTimeoutRef.current = setTimeout(() => {
        isUpdatingRef.current = false;
        console.log('🏁 Cleared isUpdatingRef after 500ms');
      }, 500);
    }
  };

  // Move job down in the sequence (later in the day)
  const handleMoveJobDown = async (job, techId) => {
    console.log('⬇️ handleMoveJobDown called', { jobId: job.id, techId });

    const updatedRoutes = { ...localRoutes };
    if (!updatedRoutes[techId]) return;

    // Get jobs sorted by time
    const jobs = [...updatedRoutes[techId].jobs].sort((a, b) => {
      const aTime = timeToMinutes(a.startTime || a.timeframeStart);
      const bTime = timeToMinutes(b.startTime || b.timeframeStart);
      return aTime - bTime;
    });

    const currentIndex = jobs.findIndex(j => j.id === job.id);
    console.log('📍 Current index:', currentIndex, 'of', jobs.length);

    if (currentIndex === -1 || currentIndex >= jobs.length - 1) {
      console.log('⚠️ Already at bottom, returning');
      return; // Already at bottom
    }

    // Set flag to prevent useEffect syncs during update
    isUpdatingRef.current = true;
    console.log('🚩 Set isUpdatingRef = true');

    try {
      // Swap with next job
      const temp = jobs[currentIndex];
      jobs[currentIndex] = jobs[currentIndex + 1];
      jobs[currentIndex + 1] = temp;
      console.log('🔄 Swapped jobs');

      // Update route with new order
      updatedRoutes[techId].jobs = jobs;

      // Recalculate all job timings
      console.log('⏱️ Recalculating route timings...');
      updatedRoutes[techId] = await recalculateRouteTimings(techId, updatedRoutes);

      // Update global jobs list
      const updatedJobs = localJobs.map(j => {
        const recalculatedJob = updatedRoutes[techId].jobs.find(rj => rj.id === j.id && rj.type !== 'secondTechAssignment');
        return recalculatedJob || j;
      });

      console.log('💾 Setting local state...');
      setLocalRoutes(updatedRoutes);
      setLocalJobs(updatedJobs);

      console.log('☁️ Calling parent update functions...');
      await onUpdateRoutes(updatedRoutes);
      await onUpdateJobs(updatedJobs);
      console.log('✅ Move down complete');
    } catch (error) {
      console.error('❌ Error in handleMoveJobDown:', error);
    } finally {
      // Clear any existing timeout
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }

      // Keep flag set for longer to prevent rapid-fire updates
      updateTimeoutRef.current = setTimeout(() => {
        isUpdatingRef.current = false;
        console.log('🏁 Cleared isUpdatingRef after 500ms');
      }, 500);
    }
  };

  const handleSaveJobDetails = async () => {
    if (!selectedJob) return;

    // Track if second tech changed
    const originalJob = localJobs.find(j => j.id === selectedJob.id);
    const secondTechChanged = originalJob?.demoTech !== selectedJob.demoTech;
    const requiresTwoTechsChanged = originalJob?.requiresTwoTechs !== selectedJob.requiresTwoTechs;
    const durationChanged = originalJob?.duration !== selectedJob.duration;
    const notesChanged = (originalJob?.notes || '') !== (selectedJob.notes || '');
    const oldSecondTech = originalJob?.demoTech;
    const newSecondTech = selectedJob.demoTech;

    console.log('💾 Saving job details:', {
      jobId: selectedJob.id,
      customerName: selectedJob.customerName,
      durationChanged,
      notesChanged,
      secondTechChanged,
      assignedTech: selectedJob.assignedTech
    });

    // Set flag to prevent useEffect syncs during update
    isUpdatingRef.current = true;

    try {
      const updatedJobs = localJobs.map(j => {
        if (j.id === selectedJob.id) {
          return selectedJob;
        }
        return j;
      });

      let updatedRoutes = { ...localRoutes };

      // Update primary job in primary tech's route
      if (selectedJob.assignedTech && updatedRoutes[selectedJob.assignedTech]) {
        updatedRoutes[selectedJob.assignedTech].jobs = updatedRoutes[selectedJob.assignedTech].jobs.map(j => {
          if (j.id === selectedJob.id) {
            return selectedJob;
          }
          return j;
        });
      }

      // Handle second tech assignment changes
      if (secondTechChanged || requiresTwoTechsChanged) {
        // Remove old second tech assignment if it exists
        if (oldSecondTech) {
          const oldSecondTechObj = techs.find(t => t.name === oldSecondTech);
          if (oldSecondTechObj && updatedRoutes[oldSecondTechObj.id]) {
            updatedRoutes[oldSecondTechObj.id].jobs = updatedRoutes[oldSecondTechObj.id].jobs.filter(
              j => !(j.type === 'secondTechAssignment' && j.primaryJobId === selectedJob.id)
            );
          }
        }

        // Also remove from all routes in case tech name changed
        Object.keys(updatedRoutes).forEach(techId => {
          if (updatedRoutes[techId]?.jobs) {
            updatedRoutes[techId].jobs = updatedRoutes[techId].jobs.filter(
              j => !(j.type === 'secondTechAssignment' && j.primaryJobId === selectedJob.id)
            );
          }
        });

        // Add new second tech assignment ONLY if requiresTwoTechs is checked AND tech is selected
        if (newSecondTech && selectedJob.requiresTwoTechs) {
          const newSecondTechObj = techs.find(t => t.name === newSecondTech);
          if (newSecondTechObj) {
            if (!updatedRoutes[newSecondTechObj.id]) {
              updatedRoutes[newSecondTechObj.id] = {
                tech: newSecondTechObj,
                jobs: []
              };
            }

            // Calculate second tech's time window
            let duration = selectedJob.duration;
            if (selectedJob.secondTechDuration === 'partial' && selectedJob.secondTechHours) {
              duration = selectedJob.secondTechHours;
            }

            // Create second tech assignment (defaults to same start time as primary, but can be dragged)
            const secondTechAssignment = {
              id: `${selectedJob.id}_secondtech_${Date.now()}`,
              type: 'secondTechAssignment',
              primaryJobId: selectedJob.id,
              primaryTechId: selectedJob.assignedTech,
              primaryTechName: techs.find(t => t.id === selectedJob.assignedTech)?.name || 'Unknown',
              customerName: selectedJob.customerName,
              address: selectedJob.address,
              jobType: selectedJob.jobType,
              startTime: selectedJob.startTime,
              endTime: minutesToTime(timeToMinutes(selectedJob.startTime) + (duration * 60)),
              duration: duration,
              isPartial: selectedJob.secondTechDuration === 'partial',
              assignedTech: newSecondTechObj.id,
              status: 'assigned'
            };

            updatedRoutes[newSecondTechObj.id].jobs.push(secondTechAssignment);
          }
        }
      }

      // If duration changed, recalculate the tech's route to adjust subsequent job timings
      if ((durationChanged || notesChanged) && selectedJob.assignedTech && updatedRoutes[selectedJob.assignedTech]) {
        console.log('⏱️ Duration or notes changed, recalculating route for tech:', selectedJob.assignedTech);
        updatedRoutes[selectedJob.assignedTech] = await recalculateRouteTimings(
          selectedJob.assignedTech,
          updatedRoutes
        );

        // Update jobs with new timings
        const recalculatedJobs = updatedJobs.map(j => {
          const recalculatedJob = updatedRoutes[selectedJob.assignedTech].jobs.find(
            rj => rj.id === j.id && rj.type !== 'secondTechAssignment'
          );
          return recalculatedJob || j;
        });

        console.log('✅ Route recalculated successfully');
        setLocalJobs(recalculatedJobs);
        setLocalRoutes(updatedRoutes);
        setShowJobModal(false);

        await onUpdateJobs(recalculatedJobs);
        await onUpdateRoutes(updatedRoutes);
      } else {
        setLocalJobs(updatedJobs);
        setLocalRoutes(updatedRoutes);
        setShowJobModal(false);

        await onUpdateJobs(updatedJobs);
        await onUpdateRoutes(updatedRoutes);
      }
    } finally {
      // Clear any existing timeout
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }

      // Keep flag set for longer to prevent rapid-fire updates
      updateTimeoutRef.current = setTimeout(() => {
        isUpdatingRef.current = false;
      }, 500);
    }
  };

  const unassignedJobs = localJobs.filter(j => !j.assignedTech);

  return (
    <div style={{ height: 'calc(100vh - 140px)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        marginBottom: '8px',
        padding: '8px 12px',
        backgroundColor: 'var(--surface-secondary)',
        borderRadius: '6px',
        border: '1px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0
      }}>
        <div>
          <h3 style={{ margin: 0, marginBottom: '2px', fontSize: '14px', fontWeight: '600' }}>
            <i className="fas fa-calendar-day"></i> Timeline - {selectedDate}
          </h3>
          <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)' }}>
            Drop jobs to auto-schedule • Click job to edit • Click tech name for map
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Average Drive Time */}
          {(() => {
            const techsWithRoutes = techs.filter(t => {
              // Exclude MIT Leads from counts
              if (t.role === 'MIT Lead') return false;
              const route = localRoutes[t.id];
              return route && route.jobs && route.jobs.length > 0;
            });

            if (techsWithRoutes.length > 0) {
              const totalDrive = techsWithRoutes.reduce((sum, tech) => {
                const jobs = localRoutes[tech.id]?.jobs || [];
                const jobDriveTime = jobs.reduce((s, j) => s + (j.travelTime || 0), 0);
                const returnTime = returnToOfficeTimes[tech.id]?.driveTime || 0;
                return sum + jobDriveTime + returnTime;
              }, 0);

              const avgDrive = Math.round(totalDrive / techsWithRoutes.length);

              // Calculate average return time
              const techsWithReturnTimes = techsWithRoutes.filter(tech => returnToOfficeTimes[tech.id]?.time);
              let avgReturnTime = null;

              if (techsWithReturnTimes.length > 0) {
                const totalMinutes = techsWithReturnTimes.reduce((sum, tech) => {
                  const timeStr = returnToOfficeTimes[tech.id].time;
                  const [hours, minutes] = timeStr.split(':').map(Number);
                  return sum + (hours * 60) + minutes;
                }, 0);

                const avgMinutes = Math.round(totalMinutes / techsWithReturnTimes.length);
                const avgHours = Math.floor(avgMinutes / 60);
                const avgMins = avgMinutes % 60;
                avgReturnTime = `${avgHours}:${String(avgMins).padStart(2, '0')}`;
              }

              return (
                <>
                  <div style={{
                    backgroundColor: 'var(--warning-bg)',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: 'var(--warning-color)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <i className="fas fa-car"></i>
                    Avg Drive: {avgDrive}m
                  </div>
                  {avgReturnTime && (
                    <div style={{
                      backgroundColor: 'var(--success-bg)',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: '600',
                      color: 'var(--success-color)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <i className="fas fa-clock"></i>
                      Avg Return: {formatTimeAMPM(avgReturnTime)}
                    </div>
                  )}
                </>
              );
            }
            return null;
          })()}
          {isCalculatingDrive && (
            <span style={{ fontSize: '11px', color: 'var(--warning-color)' }}>
              <i className="fas fa-spinner fa-spin"></i> Calculating...
            </span>
          )}
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
            padding: '4px 8px',
            backgroundColor: 'var(--surface-color)',
            borderRadius: '4px',
            border: '1px solid #e5e7eb',
            fontSize: '11px',
            fontWeight: '500'
          }}>
            <input
              type="checkbox"
              checked={hideOffTechs}
              onChange={(e) => setHideOffTechs(e.target.checked)}
              style={{ width: '14px', height: '14px', cursor: 'pointer' }}
            />
            <span>Hide Off</span>
          </label>
          <div style={{ fontSize: '12px', fontWeight: '500', color: 'var(--info-color)' }}>
            {localJobs.filter(j => j.assignedTech).length} / {localJobs.length} assigned
          </div>
        </div>
      </div>

      {/* Calendar Grid - Single Unified Scroll */}
      <div
        ref={scrollContainerRef}
        style={{
          flex: 1,
          overflow: 'auto',
          position: 'relative',
          backgroundColor: 'var(--surface-secondary)'
        }}
      >
        <div style={{
          display: 'flex',
          gap: '6px',
          minHeight: `${timelineHeight + 100}px`,
          padding: '0 8px 8px 8px'
        }}>
          {/* Unassigned Column - Sticky */}
          <div
            style={{
              width: '140px',
              flexShrink: 0,
              position: 'sticky',
              left: '8px',
              zIndex: 9,
              backgroundColor: dragOverTech === 'unassigned' ? 'var(--status-pending-bg)' : 'var(--surface-color)',
              border: dragOverTech === 'unassigned' ? '2px solid var(--warning-color)' : '1px solid #e5e7eb',
              borderRadius: '8px',
              transition: 'all 0.15s ease',
              boxShadow: dragOverTech === 'unassigned' ? '0 4px 12px rgba(245, 158, 11, 0.2)' : 'none',
              height: 'fit-content'
            }}
            onDragOver={handleDragOver}
            onDragEnter={() => handleDragEnter('unassigned')}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleJobDrop(e, null)}
          >
            <div style={{
              padding: '8px',
              borderBottom: '2px solid #e5e7eb',
              backgroundColor: 'var(--surface-secondary)',
              position: 'sticky',
              top: 0,
              height: '60px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center'
            }}>
              <h4 style={{ margin: 0, fontSize: '12px', fontWeight: '600', marginBottom: '2px' }}>
                <i className="fas fa-inbox"></i> Unassigned
              </h4>
              <p style={{ margin: 0, fontSize: '10px', color: 'var(--text-secondary)' }}>
                {unassignedJobs.length} jobs
              </p>
            </div>

            <div style={{ padding: '6px' }}>
              {unassignedJobs.map(job => (
                <div
                  key={job.id}
                  draggable
                  onDragStart={(e) => handleJobDragStart(e, job, null)}
                  onClick={(e) => handleJobClick(job, e)}
                  style={{
                    marginBottom: '4px',
                    padding: '6px',
                    backgroundColor: 'var(--surface-color)',
                    border: `2px solid ${getJobTypeColor(job.jobType)}`,
                    borderRadius: '6px',
                    cursor: 'grab',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 3px 6px rgba(0,0,0,0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
                  }}
                >
                  <div style={{ fontWeight: '600', fontSize: '11px', marginBottom: '2px' }}>
                    {job.customerName}
                  </div>
                  <div style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>
                    <div>{job.jobType}</div>
                    <div style={{ marginTop: '2px' }}>{job.duration}h</div>
                    {job.requiresTwoTechs && (
                      <div style={{ color: 'var(--warning-color)', marginTop: '2px', fontWeight: '500' }}>
                        <i className="fas fa-users"></i> 2 Techs
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tech Columns */}
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
            const techRoute = localRoutes[tech.id];

            // Get all jobs assigned to this tech (both primary jobs and second tech assignments)
            const techJobs = techRoute?.jobs || [];

            // Calculate total hours (only primary jobs, not second tech assignments)
            const totalHours = techJobs.filter(j => j.type !== 'secondTechAssignment').reduce((sum, j) => sum + j.duration, 0);

            // Calculate total drive time (in minutes)
            const totalDriveTime = techJobs.reduce((sum, j) => sum + (j.travelTime || 0), 0) +
                                   (returnToOfficeTimes[tech.id]?.driveTime || 0);

            const isDragOver = dragOverTech === tech.id;
            const isDragging = draggedTech === tech.id;
            const isOff = isTechOff(tech.id);

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
                style={{
                  width: '180px',
                  flexShrink: 0,
                  backgroundColor: isOff
                    ? 'rgba(239, 68, 68, 0.1)'
                    : (isDragOver ? 'var(--status-in-progress-bg)' : 'var(--surface-color)'),
                  border: isOff
                    ? '2px solid var(--danger-color)'
                    : (isDragging ? '2px solid var(--warning-color)' : (isDragOver ? '2px solid var(--info-color)' : '1px solid #e5e7eb')),
                  borderRadius: '8px',
                  opacity: isDragging ? 0.5 : (isOff ? 0.7 : 1),
                  transition: 'all 0.15s ease',
                  boxShadow: isOff
                    ? '0 2px 8px rgba(239, 68, 68, 0.2)'
                    : (isDragOver ? '0 4px 12px rgba(59, 130, 246, 0.2)' : 'none'),
                  height: 'fit-content',
                  minHeight: `${timelineHeight + 90}px`
                }}
                onDragOver={handleDragOver}
                onDragEnter={() => handleDragEnter(tech.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => {
                  if (draggedJob) {
                    handleJobDrop(e, tech.id);
                  } else if (draggedTech) {
                    handleRouteSwap(e, tech.id);
                  }
                }}
              >
                {/* Tech Header */}
                <div
                  draggable
                  onDragStart={(e) => handleTechDragStart(e, tech.id)}
                  onClick={() => handleTechClick(tech.id)}
                  style={{
                    padding: '8px',
                    borderBottom: '2px solid #e5e7eb',
                    cursor: 'pointer',
                    backgroundColor: 'var(--surface-secondary)',
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                    height: '60px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center'
                  }}
                  title="Click to view route map"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                    <i className="fas fa-grip-vertical" style={{ color: 'var(--text-muted)', fontSize: '9px' }}></i>
                    {zonePrefix && (
                      <span style={{
                        backgroundColor: 'var(--info-color)',
                        color: 'white',
                        padding: '2px 4px',
                        borderRadius: '3px',
                        fontSize: '8px',
                        fontWeight: '700',
                        flexShrink: 0
                      }}>
                        {zonePrefix}
                      </span>
                    )}
                    <h4 style={{ margin: 0, fontSize: '11px', fontWeight: '600', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>{formatTechName(tech.name)}</span>
                      {!isOff && (
                        <span
                          title={techStartTimes[tech.id] ? `Custom start: ${techStartTimes[tech.id]}` : "Set start time"}
                          style={{
                            cursor: 'pointer',
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
                    </h4>
                    {isOff && (
                      <span style={{
                        backgroundColor: 'var(--danger-color)',
                        color: 'white',
                        padding: '2px 4px',
                        borderRadius: '3px',
                        fontSize: '8px',
                        fontWeight: '700'
                      }}>
                        OFF
                      </span>
                    )}
                    <i className="fas fa-map-marked-alt" style={{ color: 'var(--info-color)', fontSize: '10px' }}></i>
                  </div>
                  <div style={{ marginTop: '4px', display: 'flex', gap: '6px', fontSize: '9px', fontWeight: '500', flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--info-color)' }}>{techJobs.length}j</span>
                    <span style={{ color: 'var(--success-color)' }}>{totalHours.toFixed(1)}h</span>
                    {totalDriveTime > 0 && (
                      <span
                        style={{ color: 'var(--warning-color)' }}
                        title={`Total drive time: ${Math.floor(totalDriveTime / 60)}h ${totalDriveTime % 60}m (includes office to first job, between jobs, and return to office)`}
                      >
                        <i className="fas fa-car"></i> {totalDriveTime}m
                      </span>
                    )}
                    {returnToOfficeTimes[tech.id]?.time && (
                      <span
                        style={{ color: 'var(--text-secondary)' }}
                        title={`Return to office time (${returnToOfficeTimes[tech.id].driveTime}m drive)`}
                      >
                        <i className="fas fa-home"></i> {formatTimeAMPM(returnToOfficeTimes[tech.id].time)}
                      </span>
                    )}
                    {techRoute?.demoTech && (
                      <span style={{ color: 'var(--warning-color)' }} title={`Demo Tech: ${techRoute.demoTech}`}>
                        <i className="fas fa-user-plus"></i>
                      </span>
                    )}
                  </div>
                </div>

                {/* Demo Tech Selector & Smart Fill */}
                <div style={{ padding: '4px 8px', borderBottom: '1px solid #e5e7eb', backgroundColor: 'var(--surface-color)' }}>
                  <select
                    className="form-control"
                    style={{ fontSize: '9px', padding: '2px 4px', width: '100%', marginBottom: '4px' }}
                    value={techRoute?.demoTech || ''}
                    onChange={(e) => {
                      e.stopPropagation();
                      const updatedRoutes = { ...localRoutes };
                      if (!updatedRoutes[tech.id]) {
                        updatedRoutes[tech.id] = { tech, jobs: [] };
                      }
                      updatedRoutes[tech.id] = {
                        ...updatedRoutes[tech.id],
                        demoTech: e.target.value || null
                      };
                      setLocalRoutes(updatedRoutes);
                      onUpdateRoutes(updatedRoutes);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <option value="">Demo Tech...</option>
                    {demoTechs.map(dt => {
                      // Check if demo tech is already assigned to another route
                      const isAssigned = Object.entries(localRoutes).some(
                        ([techId, route]) => techId !== tech.id && route.demoTech === dt.name
                      );
                      return (
                        <option key={dt.id} value={dt.name} disabled={isAssigned}>
                          {dt.name} {isAssigned ? '(✓)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Timeline */}
                <div
                  ref={el => columnRefs.current[tech.id] = el}
                  style={{
                    position: 'relative',
                    minHeight: `${timelineHeight}px`
                  }}
                >
                  {/* Grid lines */}
                  {timeSlots.map((time, idx) => (
                    <div
                      key={time}
                      style={{
                        position: 'absolute',
                        top: `${idx * pixelsPerHour}px`,
                        left: 0,
                        right: 0,
                        height: `${pixelsPerHour}px`,
                        borderTop: idx === 0 ? 'none' : '1px solid #f3f4f6',
                        pointerEvents: 'none'
                      }}
                    >
                      {/* Debug: Show time on grid line */}
                      <span style={{
                        position: 'absolute',
                        top: '-8px',
                        left: '2px',
                        fontSize: '8px',
                        color: '#999',
                        backgroundColor: 'rgba(255,255,255,0.8)',
                        padding: '0 2px'
                      }}>
                        {time}
                      </span>
                    </div>
                  ))}

                  {/* Jobs */}
                  {techJobs.map((job, jobIndex) => {
                    const yPos = job.startTime ? getYPosition(job.startTime) : 0;
                    const height = job.duration * pixelsPerHour;

                    // Debug log for first job to help identify timezone issue
                    if (jobIndex === 0) {
                      console.log(`🔍 First job for ${tech.name}: startTime=${job.startTime}, yPos=${yPos}px, formatted=${formatTimeAMPM(job.startTime)}`);
                    }

                    // Get sorted primary jobs (exclude second tech assignments) for arrow display
                    const primaryJobs = techJobs.filter(j => j.type !== 'secondTechAssignment')
                      .sort((a, b) => {
                        const aTime = timeToMinutes(a.startTime || a.timeframeStart);
                        const bTime = timeToMinutes(b.startTime || b.timeframeStart);
                        return aTime - bTime;
                      });
                    const jobPositionIndex = primaryJobs.findIndex(j => j.id === job.id);
                    const isFirstJob = jobPositionIndex === 0;
                    const isLastJob = jobPositionIndex === primaryJobs.length - 1;
                    const showArrows = job.type !== 'secondTechAssignment' && primaryJobs.length > 1;

                    return (
                      <div
                        key={job.id}
                        draggable={true}
                        onDragStart={(e) => handleJobDragStart(e, job, tech.id)}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (job.type !== 'secondTechAssignment') {
                            // Jobs in tech columns are assigned - open edit modal directly
                            setSelectedJob({...job, assignedTech: tech.id}); // Ensure assignedTech is set
                            setShowJobModal(true);
                          }
                        }}
                        style={{
                          position: 'absolute',
                          top: `${yPos}px`,
                          left: '4px',
                          right: '4px',
                          minHeight: `${Math.max(height, 40)}px`,
                          padding: '6px',
                          backgroundColor: job.type === 'secondTechAssignment' ? 'var(--status-pending-bg)' : 'var(--surface-color)',
                          border: job.type === 'secondTechAssignment' ? '2px dashed var(--purple-color)' : `2px solid ${getJobTypeColor(job.jobType)}`,
                          borderLeft: job.type === 'secondTechAssignment' ? '4px solid var(--purple-color)' : `4px solid ${getJobTypeColor(job.jobType)}`,
                          borderRadius: '4px',
                          cursor: 'grab',
                          transition: 'all 0.15s ease',
                          boxShadow: job.type === 'secondTechAssignment' ? '0 2px 4px rgba(0,0,0,0.15)' : '0 1px 2px rgba(0,0,0,0.1)',
                          overflow: 'hidden',
                          opacity: job.type === 'secondTechAssignment' ? 0.9 : 1
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateX(2px)';
                          e.currentTarget.style.boxShadow = '0 3px 6px rgba(0,0,0,0.15)';
                          e.currentTarget.style.zIndex = '10';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateX(0)';
                          e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
                          e.currentTarget.style.zIndex = '1';
                        }}
                      >
                        {job.type === 'secondTechAssignment' ? (
                          // Second tech assignment display
                          <>
                            <div style={{ fontWeight: '600', fontSize: '10px', marginBottom: '4px', color: 'var(--purple-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>
                                <i className="fas fa-handshake"></i> Meeting {job.primaryTechName}
                              </span>
                            </div>
                            <div style={{ fontSize: '9px', color: 'var(--text-secondary)', marginBottom: '3px' }}>
                              <strong>{job.customerName}</strong>
                            </div>
                            <div style={{ fontSize: '8px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                              {job.address}
                            </div>
                            <div style={{ fontSize: '9px', color: 'var(--success-color)', fontWeight: '600' }}>
                              <i className="fas fa-clock"></i> {formatTimeAMPM(job.startTime)} - {formatTimeAMPM(job.endTime)} ({job.duration}h)
                            </div>
                            {job.isPartial && (
                              <div style={{ fontSize: '8px', color: 'var(--warning-color)', marginTop: '2px', fontStyle: 'italic' }}>
                                Heavy lifting only
                              </div>
                            )}
                          </>
                        ) : (
                          // Primary job display
                          <>
                            <div style={{ fontWeight: '600', fontSize: '10px', marginBottom: '2px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                {job.customerName}
                              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginLeft: '4px' }}>
                                {showArrows && (
                                  <div style={{ display: 'flex', gap: '1px' }}>
                                    {!isFirstJob && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleMoveJobUp(job, tech.id);
                                        }}
                                        style={{
                                          background: 'var(--info-color)',
                                          border: 'none',
                                          color: 'white',
                                          padding: '2px 4px',
                                          borderRadius: '3px',
                                          cursor: 'pointer',
                                          fontSize: '8px',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          lineHeight: '1'
                                        }}
                                        title="Move job earlier"
                                      >
                                        <i className="fas fa-chevron-up"></i>
                                      </button>
                                    )}
                                    {!isLastJob && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleMoveJobDown(job, tech.id);
                                        }}
                                        style={{
                                          background: 'var(--info-color)',
                                          border: 'none',
                                          color: 'white',
                                          padding: '2px 4px',
                                          borderRadius: '3px',
                                          cursor: 'pointer',
                                          fontSize: '8px',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          lineHeight: '1'
                                        }}
                                        title="Move job later"
                                      >
                                        <i className="fas fa-chevron-down"></i>
                                      </button>
                                    )}
                                  </div>
                                )}
                                {isOutsideTimeframe(job) && (
                                  <span
                                    style={{
                                      backgroundColor: 'var(--danger-color)',
                                      color: 'white',
                                      padding: '1px 4px',
                                      borderRadius: '3px',
                                      fontSize: '8px',
                                      fontWeight: '700',
                                      flexShrink: 0
                                    }}
                                    title={`Timeframe Conflict!\nRequested: ${formatTimeAMPM(job.timeframeStart)} - ${formatTimeAMPM(job.timeframeEnd)}\nScheduled Arrival: ${formatTimeAMPM(job.startTime)}`}
                                  >
                                    ⚠
                                  </span>
                                )}
                              </div>
                            </div>
                            <div style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>
                              {job.startTime && job.endTime && (
                                <div style={{ color: isOutsideTimeframe(job) ? 'var(--danger-color)' : 'var(--success-color)', fontWeight: '600', marginBottom: '2px' }}>
                                  <i className="fas fa-clock"></i> {formatTimeAMPM(job.startTime)} - {formatTimeAMPM(job.endTime)}
                                </div>
                              )}
                              {job.timeframeStart && job.timeframeEnd && (
                                <div style={{ fontSize: '8px', color: 'var(--text-muted)', marginBottom: '2px', fontStyle: 'italic' }}>
                                  <i className="fas fa-calendar-check"></i> Requested: {formatTimeAMPM(job.timeframeStart)} - {formatTimeAMPM(job.timeframeEnd)}
                                </div>
                              )}
                              <div>{job.duration}h{job.travelTime > 0 && ` • ${job.travelTime}m`}</div>
                              {job.requiresTwoTechs && (
                                <div style={{ color: 'var(--warning-color)', marginTop: '2px', fontWeight: '500' }}>
                                  <i className="fas fa-users"></i> 2
                                </div>
                              )}
                              {job.demoTech && (
                                <div style={{ color: 'var(--purple-color)', fontSize: '8px', marginTop: '1px' }}>
                                  + {job.demoTech}
                                  {job.secondTechDuration === 'partial' && ` (${job.secondTechHours || 1}h)`}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}

                  {/* Return to Office */}
                  {returnToOfficeTimes[tech.id] && (
                    <div
                      style={{
                        position: 'absolute',
                        top: `${getYPosition(returnToOfficeTimes[tech.id].time)}px`,
                        left: '4px',
                        right: '4px',
                        minHeight: '50px',
                        padding: '8px',
                        backgroundColor: 'var(--success-bg)',
                        border: '2px solid var(--success-color)',
                        borderLeft: '4px solid var(--success-color)',
                        borderRadius: '4px',
                        boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)',
                        pointerEvents: 'none'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}>
                        <i className="fas fa-home" style={{ color: 'var(--success-color)', fontSize: '10px' }}></i>
                        <div style={{ fontWeight: '600', fontSize: '10px', color: 'var(--success-color)' }}>
                          Return to Office
                        </div>
                      </div>
                      <div style={{ fontSize: '9px', color: 'var(--success-color)' }}>
                        <div style={{ fontWeight: '600', marginBottom: '2px' }}>
                          <i className="fas fa-clock"></i> {formatTimeAMPM(returnToOfficeTimes[tech.id].time)}
                        </div>
                        <div>
                          <i className="fas fa-car"></i> {returnToOfficeTimes[tech.id].driveTime}m
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Job Details Modal */}
      {showJobModal && selectedJob && (
        <div
          className="modal-overlay active"
          onClick={() => setShowJobModal(false)}
          style={{ zIndex: 1000 }}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '500px' }}
          >
            <div className="modal-header">
              <h3>
                <i className="fas fa-edit"></i> Edit Job Details
              </h3>
              <button className="modal-close" onClick={() => setShowJobModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gap: '16px' }}>
                <div>
                  <strong style={{ fontSize: '14px' }}>{selectedJob.customerName}</strong>
                  <p style={{ margin: '4px 0', fontSize: '12px', color: 'var(--text-secondary)' }}>{selectedJob.address}</p>
                </div>

                <div className="form-group">
                  <label>Duration (hours)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={selectedJob.duration}
                    onChange={(e) => setSelectedJob({...selectedJob, duration: parseFloat(e.target.value) || 1})}
                    min="0.5"
                    step="0.5"
                  />
                </div>

                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedJob.requiresTwoTechs || false}
                      onChange={(e) => setSelectedJob({...selectedJob, requiresTwoTechs: e.target.checked})}
                      style={{ marginRight: '8px' }}
                    />
                    Requires 2 Technicians
                  </label>
                </div>

                {selectedJob.requiresTwoTechs && (
                  <>
                    <div className="form-group">
                      <label>Second Technician</label>
                      <select
                        className="form-control"
                        value={selectedJob.demoTech || ''}
                        onChange={(e) => setSelectedJob({...selectedJob, demoTech: e.target.value})}
                      >
                        <option value="">Select Tech...</option>
                        {allTechs.map(dt => (
                          <option key={dt.id} value={dt.name}>{dt.name} - {dt.role}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Second Tech Time</label>
                      <select
                        className="form-control"
                        value={selectedJob.secondTechDuration || 'full'}
                        onChange={(e) => setSelectedJob({...selectedJob, secondTechDuration: e.target.value})}
                      >
                        <option value="full">Full Job Duration</option>
                        <option value="partial">Partial - Heavy Lifting Only</option>
                      </select>
                    </div>

                    {selectedJob.secondTechDuration === 'partial' && (
                      <div className="form-group">
                        <label>Partial Time (hours)</label>
                        <input
                          type="number"
                          className="form-control"
                          value={selectedJob.secondTechHours || 1}
                          onChange={(e) => setSelectedJob({...selectedJob, secondTechHours: parseFloat(e.target.value) || 1})}
                          min="0.5"
                          max={selectedJob.duration}
                          step="0.5"
                        />
                        <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          Second tech will be on job for {selectedJob.secondTechHours || 1} of {selectedJob.duration} hours
                        </p>
                      </div>
                    )}
                  </>
                )}

                <div className="form-group">
                  <label>Job Type</label>
                  <select
                    className="form-control"
                    value={selectedJob.jobType}
                    onChange={(e) => setSelectedJob({...selectedJob, jobType: e.target.value})}
                  >
                    <option>Install</option>
                    <option>Demo</option>
                    <option>Demo Prep</option>
                    <option>Service</option>
                    <option>Maintenance</option>
                    <option>Inspection</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Job Notes</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    value={selectedJob.notes || ''}
                    onChange={(e) => setSelectedJob({...selectedJob, notes: e.target.value})}
                    placeholder="Add any additional notes about this job..."
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowJobModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSaveJobDetails}>
                <i className="fas fa-save"></i> Save & Recalculate Route
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Route Map Modal */}
      {showMapModal && (
        <div
          className="modal-overlay active"
          onClick={() => setShowMapModal(false)}
          style={{ zIndex: 1000 }}
        >
          <div
            className="modal modal-lg"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '900px', height: '80vh' }}
          >
            <div className="modal-header">
              <h3>
                <i className="fas fa-map-marked-alt"></i> {selectedTechForMap && localRoutes[selectedTechForMap]?.tech?.name}'s Route
              </h3>
              <button className="modal-close" onClick={() => setShowMapModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body" style={{ padding: 0, height: 'calc(100% - 60px)' }}>
              <div
                ref={mapContainerRef}
                style={{ width: '100%', height: '100%', borderRadius: '0 0 8px 8px' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Conflict Detection Panel */}
      <ConflictPanel
        conflicts={conflicts}
        onAutoFix={handleAutoFix}
        onDismiss={() => {}}
      />

      {/* Tech Recommendation Tooltip */}
      {techRecommendation && (
        <TechRecommendationTooltip
          job={techRecommendation.job}
          techs={techs}
          routes={localRoutes}
          scheduleForDay={scheduleForDay}
          position={techRecommendation.position}
          onAssignTech={async (jobId, techId) => {
            const job = localJobs.find(j => j.id === jobId);
            const tech = techs.find(t => t.id === techId);
            if (!job || !tech) return;

            const updatedRoutes = { ...localRoutes };
            if (!updatedRoutes[techId]) {
              updatedRoutes[techId] = { tech, jobs: [] };
            }
            updatedRoutes[techId].jobs.push(job);

            const updatedJobs = localJobs.map(j =>
              j.id === jobId
                ? { ...j, assignedTech: techId, status: 'assigned' }
                : j
            );

            setLocalRoutes(updatedRoutes);
            setLocalJobs(updatedJobs);
            await onUpdateRoutes(updatedRoutes);
            await onUpdateJobs(updatedJobs);
          }}
          onClose={() => setTechRecommendation(null)}
        />
      )}

      {/* Multi-select toolbar */}
      {isMultiSelectMode && selectedJobs.size > 0 && (
        <div style={{
          position: 'fixed',
          bottom: '80px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--info-color)',
          color: 'white',
          padding: '12px 20px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: '16px'
        }}>
          <span style={{ fontWeight: '600', fontSize: '14px' }}>
            {selectedJobs.size} jobs selected
          </span>
          <button
            className="btn btn-secondary btn-small"
            onClick={() => {
              setSelectedJobs(new Set());
              setIsMultiSelectMode(false);
            }}
            style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }}
          >
            Clear
          </button>
          <div style={{ fontSize: '12px', opacity: 0.9 }}>
            Drag selected jobs to a tech or click tech to assign
          </div>
        </div>
      )}
    </div>
  );
};

export default KanbanCalendar;
