import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import firebaseService from '../../services/firebaseService';
import JobCard from './JobCard';
import '../../styles/tech-route.css';

const TechRoute = () => {
  const { currentUser } = useAuth();
  const { staffingData } = useData();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [routes, setRoutes] = useState({});
  const [jobs, setJobs] = useState([]);
  const [selectedTechId, setSelectedTechId] = useState(null);
  const [allTechs, setAllTechs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updateNotification, setUpdateNotification] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const previousRoutesRef = useRef(null);

  // Get all techs from staffing data
  useEffect(() => {
    if (!staffingData) return;

    const techs = [];
    if (staffingData.zones) {
      staffingData.zones.forEach(zone => {
        if (zone.lead) {
          techs.push({
            id: zone.lead.id,
            name: zone.lead.name,
            zone: zone.name,
            office: zone.lead.office || 'office_1',
            role: zone.lead.role || 'Technician'
          });
        }
        if (zone.members) {
          zone.members.forEach(member => {
            techs.push({
              id: member.id,
              name: member.name,
              zone: zone.name,
              office: member.office || 'office_1',
              role: member.role || 'Technician'
            });
          });
        }
      });
    }
    setAllTechs(techs);

    // Auto-select current user's tech ID if found
    if (currentUser && !selectedTechId) {
      const currentTech = techs.find(t =>
        t.name?.toLowerCase() === currentUser.username?.toLowerCase() ||
        t.id === currentUser.uid
      );
      if (currentTech) {
        setSelectedTechId(currentTech.id);
      } else if (techs.length > 0) {
        // Fallback to first tech if current user not found
        setSelectedTechId(techs[0].id);
      }
    }
  }, [staffingData, currentUser, selectedTechId]);

  // Real-time subscriptions for routes and jobs
  useEffect(() => {
    if (!selectedDate) return;

    setLoading(true);

    // Subscribe to real-time routes updates
    const routesUnsubscribe = firebaseService.subscribeToDocument(
      'hou_routing',
      `routes_${selectedDate}`,
      (data) => {
        const loadedRoutes = data?.routes || {};

        // Check if routes have changed (show notification)
        if (previousRoutesRef.current && JSON.stringify(previousRoutesRef.current) !== JSON.stringify(loadedRoutes)) {
          setUpdateNotification('Route updated by supervisor');
          setTimeout(() => setUpdateNotification(null), 5000);
        }

        previousRoutesRef.current = loadedRoutes;
        setRoutes(loadedRoutes);
        setLoading(false);
      }
    );

    // Subscribe to real-time jobs updates
    const jobsUnsubscribe = firebaseService.subscribeToDocument(
      'hou_routing',
      `jobs_${selectedDate}`,
      (data) => {
        setJobs(data?.jobs || []);
      }
    );

    // Cleanup
    return () => {
      routesUnsubscribe();
      jobsUnsubscribe();
    };
  }, [selectedDate]);

  // Get current tech's route
  const currentRoute = selectedTechId && routes[selectedTechId] ? routes[selectedTechId] : null;
  const currentTech = allTechs.find(t => t.id === selectedTechId);
  const routeJobs = currentRoute?.jobs || [];

  // Calculate stats
  const completedJobs = routeJobs.filter(j => j.status === 'complete').length;
  const inProgressJobs = routeJobs.filter(j => j.status === 'in_progress').length;
  const totalHours = routeJobs.reduce((sum, job) => sum + (job.duration || 0), 0);
  const completedHours = routeJobs
    .filter(j => j.status === 'complete')
    .reduce((sum, job) => sum + (job.duration || 0), 0);

  // Find current job (first in-progress or first not-started)
  const currentJobIndex = routeJobs.findIndex(j => j.status === 'in_progress') !== -1
    ? routeJobs.findIndex(j => j.status === 'in_progress')
    : routeJobs.findIndex(j => !j.status || j.status === 'not_started');

  // Update job status
  const handleStatusChange = async (jobId, newStatus) => {
    setSyncing(true);
    try {
      // Update local state immediately (optimistic update)
      const updatedRoutes = { ...routes };
      if (updatedRoutes[selectedTechId]) {
        updatedRoutes[selectedTechId] = {
          ...updatedRoutes[selectedTechId],
          jobs: updatedRoutes[selectedTechId].jobs.map(job => {
            if (job.id === jobId) {
              const updates = { status: newStatus };

              // Set timestamps
              if (newStatus === 'in_progress' && !job.actualStartTime) {
                updates.actualStartTime = new Date().toISOString();
              } else if (newStatus === 'complete' && !job.actualEndTime) {
                updates.actualEndTime = new Date().toISOString();
              }

              return { ...job, ...updates };
            }
            return job;
          })
        };
      }
      setRoutes(updatedRoutes);

      // Save to Firebase
      await firebaseService.saveDocument('hou_routing', `routes_${selectedDate}`, {
        routes: updatedRoutes
      });

      setSyncing(false);
    } catch (error) {
      console.error('Error updating job status:', error);
      setSyncing(false);
      // Revert on error
      setUpdateNotification('Failed to update job status');
      setTimeout(() => setUpdateNotification(null), 3000);
    }
  };

  // Sync to Google Calendar
  const handleSyncToCalendar = async () => {
    if (!currentRoute || !currentTech) return;

    try {
      setSyncing(true);
      // Import Google Calendar service
      const { pushRouteToGoogleCalendar } = await import('../../services/googleCalendarService');

      await pushRouteToGoogleCalendar(currentRoute, currentTech, selectedDate);

      setUpdateNotification('Synced to Google Calendar');
      setTimeout(() => setUpdateNotification(null), 3000);
    } catch (error) {
      console.error('Calendar sync error:', error);
      setUpdateNotification('Calendar sync failed');
      setTimeout(() => setUpdateNotification(null), 3000);
    } finally {
      setSyncing(false);
    }
  };

  // Navigate to address
  const handleNavigate = (address) => {
    const encodedAddress = encodeURIComponent(address);
    // Try to open in Google Maps app first, fallback to web
    window.location.href = `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`;
  };

  // Call customer
  const handleCall = (phone) => {
    if (phone) {
      window.location.href = `tel:${phone.replace(/\D/g, '')}`;
    }
  };

  if (loading) {
    return (
      <div className="tech-route-loading">
        <i className="fas fa-spinner fa-spin"></i>
        <p>Loading route...</p>
      </div>
    );
  }

  return (
    <div className="tech-route-container">
      {/* Update Notification Banner */}
      {updateNotification && (
        <div className="tech-route-notification">
          <i className="fas fa-info-circle"></i>
          <span>{updateNotification}</span>
        </div>
      )}

      {/* Syncing Indicator */}
      {syncing && (
        <div className="tech-route-syncing">
          <i className="fas fa-sync fa-spin"></i>
          <span>Syncing...</span>
        </div>
      )}

      {/* Header with Date and Tech Selector */}
      <div className="tech-route-header">
        <div className="tech-route-date-picker">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="tech-date-input"
          />
        </div>

        <div className="tech-route-tech-selector">
          <select
            value={selectedTechId || ''}
            onChange={(e) => setSelectedTechId(e.target.value)}
            className="tech-select-input"
          >
            <option value="">Select Tech...</option>
            {allTechs.map(tech => (
              <option key={tech.id} value={tech.id}>
                {tech.name} - {tech.zone}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats Summary */}
      {currentRoute && (
        <div className="tech-route-stats">
          <div className="tech-stat-card">
            <div className="tech-stat-value">{completedJobs}/{routeJobs.length}</div>
            <div className="tech-stat-label">Jobs Complete</div>
          </div>
          <div className="tech-stat-card">
            <div className="tech-stat-value">{completedHours.toFixed(1)}/{totalHours.toFixed(1)}</div>
            <div className="tech-stat-label">Hours</div>
          </div>
          <div className="tech-stat-card">
            <div className="tech-stat-value">{inProgressJobs}</div>
            <div className="tech-stat-label">In Progress</div>
          </div>
        </div>
      )}

      {/* Google Calendar Sync Button */}
      {currentRoute && (
        <div className="tech-route-actions">
          <button
            className="tech-sync-calendar-btn"
            onClick={handleSyncToCalendar}
            disabled={syncing}
          >
            <i className="fas fa-calendar-alt"></i>
            Sync to Google Calendar
          </button>
        </div>
      )}

      {/* Job List */}
      <div className="tech-route-jobs">
        {!currentRoute ? (
          <div className="tech-route-empty">
            <i className="fas fa-calendar-times"></i>
            <p>No route assigned for this date</p>
            <small>Select a different date or tech</small>
          </div>
        ) : routeJobs.length === 0 ? (
          <div className="tech-route-empty">
            <i className="fas fa-briefcase"></i>
            <p>No jobs assigned yet</p>
            <small>Check back later</small>
          </div>
        ) : (
          <>
            {routeJobs.map((job, index) => (
              <JobCard
                key={job.id}
                job={job}
                index={index}
                isCurrent={index === currentJobIndex}
                isNext={index === currentJobIndex + 1}
                onStatusChange={handleStatusChange}
                onNavigate={handleNavigate}
                onCall={handleCall}
              />
            ))}

            {/* Return to Office */}
            {currentRoute.returnToOfficeTime && (
              <div className="tech-route-return">
                <i className="fas fa-building"></i>
                <div className="tech-return-details">
                  <div className="tech-return-label">Return to Office</div>
                  <div className="tech-return-time">{currentRoute.returnToOfficeTime}</div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default TechRoute;
