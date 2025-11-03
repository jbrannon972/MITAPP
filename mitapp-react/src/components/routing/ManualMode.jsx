import { useState, useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getMapboxService } from '../../services/mapboxService';
import { optimizeRoute } from '../../utils/routeOptimizer';
import googleCalendarService from '../../services/googleCalendarService';
import TwoTechAssignmentModal from './TwoTechAssignmentModal';
import { GOOGLE_CLIENT_ID } from '../../config/firebase';
import { formatTimeAMPM } from '../../utils/routingHelpers';

const ManualMode = ({
  jobs: initialJobs,
  routes: initialRoutes,
  techs,
  offices,
  mapboxToken,
  onUpdateRoutes,
  onUpdateJobs,
  onRefresh,
  selectedDate,
  onImportCSV,
  scheduleForDay,
  staffingData,
  showAlert,
  showConfirm,
  techStartTimes,
  setTechStartTimes,
  companyMeetingMode
}) => {
  const [jobs, setJobs] = useState(initialJobs);
  const [routes, setRoutes] = useState(initialRoutes);
  const [buildingRoute, setBuildingRoute] = useState([]);
  const [showAllJobs, setShowAllJobs] = useState(false);
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

  // Update local state when props change
  useEffect(() => {
    setJobs(initialJobs);
  }, [initialJobs]);

  useEffect(() => {
    setRoutes(initialRoutes);
  }, [initialRoutes]);

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

        const el = document.createElement('div');
        el.style.cursor = 'pointer';
        el.innerHTML = `
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
            border: 3px solid var(--surface-color);
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            transition: transform 0.2s;
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
        const officeCoords = officeCoordinates[techRoute.tech.office];

        if (!officeCoords || !officeCoords.lng || !officeCoords.lat) {
          console.warn('Office coordinates not available for route drawing');
          return;
        }

        const coordinates = [[officeCoords.lng, officeCoords.lat]];

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

        // Return to office at end
        coordinates.push([officeCoords.lng, officeCoords.lat]);

        // Draw route line if we have coordinates
        if (coordinates.length > 2) {
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
              'line-color': '#3b82f6', // Blue - Mapbox doesn't support CSS variables
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
        }
      }
    };

    renderJobMarkers();
  }, [jobs, showAllJobs, buildingRoute, selectedTech, routes, officeCoordinates]);

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
  const continueRouteAssignment = async (routeJobs, helperJobs, targetTechId, targetTech, shift, startLocation, fromTechId) => {
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

      // If distance matrix failed, calculate real drive times now
      if (!distanceMatrix && optimized.optimizedJobs.length > 0) {
        console.log('⚠️ Distance matrix unavailable, calculating real drive times...');
        try {
          let prevAddress = startLocation;
          for (let i = 0; i < optimized.optimizedJobs.length; i++) {
            const job = optimized.optimizedJobs[i];
            if (job.address && prevAddress) {
              try {
                const result = await mapbox.getDrivingDistance(prevAddress, job.address);
                job.travelTime = Math.ceil(result.durationMinutes || 20);
                console.log(`  ✓ ${job.customerName}: ${job.travelTime}m drive`);
              } catch (err) {
                console.warn(`  ⚠️ ${job.customerName}: Using default 20m (API error)`);
                job.travelTime = 20;
              }
              prevAddress = job.address;
            }
          }
          console.log('✅ Real drive times calculated');
        } catch (error) {
          console.error('Error calculating drive times:', error);
        }
      }

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
            `${v.customerName}: Arrives ${v.arrivalTime} but window closes at ${v.timeframeEnd}`
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
          const unassignableNames = optimized.unassignableJobs.map(j => `• ${j.customerName} (${j.timeframeStart}-${j.timeframeEnd})`).join('\n');
          const assignableJobCount = optimized.optimizedJobs.length;

          console.log(`⚠️ ${optimized.unassignableJobs.length} jobs couldn't fit in timeframes, assigning ${assignableJobCount} jobs that did fit`);

          // Finalize route with only the jobs that fit
          await finalizeRouteAssignment();

          // Show feedback about skipped jobs (non-blocking alert)
          showAlert(
            `Route created with ${assignableJobCount} job(s).\n\n` +
            `${optimized.unassignableJobs.length} job(s) couldn't fit in their timeframe windows and were left unassigned:\n` +
            unassignableNames +
            `\n\nThese jobs remain on the map. You can:\n` +
            `• Try assigning them to a different tech\n` +
            `• Adjust their timeframes\n` +
            `• Manually drag them to this route later`,
            'Some Jobs Skipped',
            'warning'
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
      const startLocation = companyMeetingMode
        ? offices.office_1.address
        : offices[targetTech.office].address;

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

      // No two-tech jobs - proceed with normal assignment
      await continueRouteAssignment(routeJobs, [], targetTechId, targetTech, shift, startLocation, fromTechId);
      setDraggedRoute(null);

    } catch (error) {
      console.error('Error assigning route:', error);
      showAlert('Error assigning route. Please try again.', 'Error', 'error');
      setDraggedRoute(null);
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

  const reorderJobsInRoute = (techId, startIndex, endIndex) => {
    const updatedRoutes = { ...routes };
    const techJobs = [...updatedRoutes[techId].jobs];
    const [removed] = techJobs.splice(startIndex, 1);
    techJobs.splice(endIndex, 0, removed);

    updatedRoutes[techId] = {
      ...updatedRoutes[techId],
      jobs: techJobs
    };

    onUpdateRoutes(updatedRoutes);
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
          // Push all routes (already signed in at this point)
          const summary = await googleCalendarService.pushAllRoutes(routes, selectedDate);

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

  return (
    <div style={{ height: 'calc(100vh - 140px)', display: 'flex', flexDirection: 'column' }}>
      {/* Compact Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
        padding: '12px 16px',
        backgroundColor: 'var(--surface-secondary)',
        borderRadius: '6px',
        border: '1px solid #e5e7eb'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '16px' }}>Manual Route Builder</h3>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            <span style={{ fontWeight: '600', color: 'var(--success-color)' }}>{unassignedCount}</span> unassigned •
            <span style={{ fontWeight: '600', color: 'var(--info-color)', marginLeft: '4px' }}>{assignedCount}</span> assigned
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {onImportCSV && (
            <button
              onClick={onImportCSV}
              className="btn btn-primary btn-small"
              style={{
                padding: '6px 12px',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <i className="fas fa-upload"></i> Import CSV
            </button>
          )}

          <button
            onClick={handlePushToCalendars}
            disabled={pushingToCalendar || Object.values(routes).filter(r => r.jobs?.length > 0).length === 0}
            className="btn btn-success btn-small"
            style={{
              padding: '6px 12px',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <i className={pushingToCalendar ? "fas fa-spinner fa-spin" : "fas fa-calendar-plus"}></i>
            {pushingToCalendar ? 'Pushing...' : 'Push to Calendars'}
          </button>

          <button
            onClick={() => setShowGoogleSetup(true)}
            className="btn btn-secondary btn-small"
            style={{
              padding: '6px 12px',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            title="Configure Google Calendar"
          >
            <i className="fas fa-cog"></i>
          </button>

          {onRefresh && (
            <button
              onClick={onRefresh}
              className="btn btn-secondary btn-small"
              style={{
                padding: '6px 12px',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <i className="fas fa-sync-alt"></i> Refresh
            </button>
          )}

          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            padding: '6px 12px',
            backgroundColor: 'var(--surface-color)',
            borderRadius: '4px',
            border: '2px solid #e5e7eb',
            fontSize: '13px',
            fontWeight: '500'
          }}>
            <input
              type="checkbox"
              checked={showAllJobs}
              onChange={(e) => setShowAllJobs(e.target.checked)}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            <span>Show All Jobs</span>
          </label>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            padding: '6px 12px',
            backgroundColor: 'var(--surface-color)',
            borderRadius: '4px',
            border: '2px solid #e5e7eb',
            fontSize: '13px',
            fontWeight: '500'
          }}>
            <input
              type="checkbox"
              checked={hideOffTechs}
              onChange={(e) => setHideOffTechs(e.target.checked)}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            <span>Hide Off</span>
          </label>
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
          {hoveredJob && !selectedTech && (
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
              <div style={{ fontWeight: '600', marginBottom: '6px', fontSize: '13px', color: 'var(--text-primary)' }}>
                {hoveredJob.customerName}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                <i className="fas fa-map-marker-alt"></i> {hoveredJob.address}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                <strong>{hoveredJob.jobType}</strong> • {hoveredJob.duration}h
              </div>
              <div style={{ fontSize: '11px', color: 'var(--success-color)', fontWeight: '600', marginBottom: '4px' }}>
                <i className="fas fa-clock"></i> Timeframe: {hoveredJob.timeframeStart} - {hoveredJob.timeframeEnd}
              </div>
              {hoveredJob.phone && (
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  <i className="fas fa-phone"></i> {hoveredJob.phone}
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
                  style={{
                    padding: '6px',
                    backgroundColor: 'var(--surface-secondary)',
                    borderRadius: '4px',
                    marginBottom: '4px',
                    borderLeft: `3px solid ${getJobTypeColor(job.jobType)}`,
                    fontSize: '11px',
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
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
                        <span>{formatTechName(tech.name)}</span>
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
    </div>
  );
};

export default ManualMode;
