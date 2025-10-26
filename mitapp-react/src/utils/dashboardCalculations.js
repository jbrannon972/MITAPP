// Dashboard calculation utilities

export const getTechsOnRouteToday = async (date, staffingData, firebaseService, calendarManager, unifiedTechnicianData) => {
  const monthlySchedules = await firebaseService.getScheduleDataForMonth(date.getFullYear(), date.getMonth());
  const allTechs = unifiedTechnicianData || getAllTechnicians(staffingData);
  const schedule = calendarManager.getCalculatedScheduleForDay(date, monthlySchedules, allTechs);

  // Get all route runners (MIT Techs and 2nd Shift Lead)
  const routeRunners = allTechs.filter(s => {
    if (!s) return false;

    const isSecondShiftLead = s.role === 'MIT Lead' && staffingData.zones.some(z => z.name === '2nd Shift' && z.lead?.id === s.id);
    const isMitTech = s.role === 'MIT Tech' && !s.inTraining;

    return isMitTech || isSecondShiftLead;
  });

  let staffedToday = 0;
  routeRunners.forEach(staffMember => {
    const staffEntry = schedule.staff.find(s => s.id === staffMember.id);
    if (staffEntry && staffEntry.status === 'on') {
      staffedToday++;
    }
  });

  return staffedToday;
};

export const getSubTeamsToday = async (date, staffingData, firebaseService, calendarManager, unifiedTechnicianData) => {
  const monthlySchedules = await firebaseService.getScheduleDataForMonth(date.getFullYear(), date.getMonth());
  const allTechs = unifiedTechnicianData || getAllTechnicians(staffingData);
  const schedule = calendarManager.getCalculatedScheduleForDay(date, monthlySchedules, allTechs);

  // Get all demo techs
  const demoTechs = allTechs.filter(s => s && s.role === 'Demo Tech');

  let demoTechsWorking = 0;
  demoTechs.forEach(dt => {
    const staffEntry = schedule.staff.find(s => s.id === dt.id);
    if (staffEntry && staffEntry.status === 'on') {
      demoTechsWorking++;
    }
  });

  return Math.floor(demoTechsWorking / 2);
};

export const getDailyHoursData = async (date, monthlyData, staffingData, firebaseService, calendarManager, unifiedTechnicianData) => {
  const month = date.getMonth();
  const monthDataForMonth = monthlyData[month];

  if (!monthDataForMonth) {
    return {
      totalTechHours: 0,
      totalLaborHours: 0,
      dtHours: 0,
      hoursAvailable: 0,
      dtHoursAvailable: 0,
      subHours: 0,
      availableHoursGoal: 0,
      potentialNewJobs: 0,
      inefficientDemoHours: 0
    };
  }

  // Get daily stats from Firebase (from job analyzer)
  const dateString = formatDateString(date);
  const stats = await firebaseService.getDailyStats(dateString);

  // Calculate sub team prep time and hours
  const subTeamCount = stats ? stats.subTeamCount || 0 : 0;
  const subPrepTime = subTeamCount * 1.5;
  let totalLaborHours = (stats ? stats.totalLaborHours || 0 : 0) + subPrepTime;

  const totalTechHours = (stats ? stats.totalTechHours || 0 : 0) + subPrepTime;
  const dtHours = stats ? stats.dtLaborHours || 0 : 0; // Total DT hours requested

  // Get schedule for the day
  const monthlySchedules = await firebaseService.getScheduleDataForMonth(date.getFullYear(), date.getMonth());
  const allTechs = unifiedTechnicianData || getAllTechnicians(staffingData);
  const schedule = calendarManager.getCalculatedScheduleForDay(date, monthlySchedules, allTechs);

  // Calculate techs on route today
  const techsOnRoute = await getTechsOnRouteToday(date, staffingData, firebaseService, calendarManager, unifiedTechnicianData);
  const demoTechs = allTechs.filter(t => t && t.role === 'Demo Tech');

  let demoTechsOnRoute = 0;
  demoTechs.forEach(tech => {
    const entry = schedule.staff.find(s => s.id === tech.id);
    if (entry && entry.status === 'on') demoTechsOnRoute++;
  });

  // Calculate available hours
  const driveTime = monthDataForMonth.averageDriveTime || 0;
  const otHours = monthDataForMonth.otHoursPerTechPerDay || 0;
  const hoursPerTech = (8 - driveTime + otHours);

  const hoursAvailable = techsOnRoute * hoursPerTech;
  const dtHoursAvailable = demoTechsOnRoute * hoursPerTech;

  // Calculate sub hours handled
  const subHours = stats && stats.subContractorJobs
    ? stats.subContractorJobs.reduce((acc, job) => acc + (job.demoHours || 0), 0)
    : 0;

  // Calculate new jobs forecasted today
  const dayOfWeek = date.getDay();
  let newJobsToday = 0;

  // Simple forecast based on day of week - you can enhance this with actual forecast calculations
  if (dayOfWeek >= 1 && dayOfWeek <= 5) newJobsToday = 3; // Weekday default
  else if (dayOfWeek === 6) newJobsToday = 1; // Saturday default
  else if (dayOfWeek === 0) newJobsToday = 0; // Sunday default

  // Calculate available hours goal
  const avgInstallDuration = monthDataForMonth.hoursPerAppointment || 4;
  const totalRequestedHours = totalLaborHours + dtHours;
  const availableHoursGoal = totalRequestedHours + (newJobsToday * avgInstallDuration);

  // Calculate potential new jobs
  const baseWorkSurplus = hoursAvailable - totalLaborHours;
  const surplusHoursForNewInstalls = baseWorkSurplus;

  let potentialNewJobs = 0;
  if (surplusHoursForNewInstalls > 0 && avgInstallDuration > 0) {
    potentialNewJobs = Math.floor(surplusHoursForNewInstalls / avgInstallDuration);
  }

  // Calculate inefficient demo hours
  const internalDemoHoursNeeded = Math.max(0, dtHours - subHours);
  const inefficientDemoHours = Math.max(0, dtHoursAvailable - internalDemoHoursNeeded);

  return {
    totalTechHours,
    totalLaborHours,
    dtHours,
    hoursAvailable,
    dtHoursAvailable,
    subHours,
    availableHoursGoal,
    potentialNewJobs,
    inefficientDemoHours
  };
};

export const getAllTechnicians = (staffingData) => {
  if (!staffingData || !staffingData.zones) return [];

  const technicians = [];
  staffingData.zones.forEach(zone => {
    if (zone.lead) {
      technicians.push({ ...zone.lead, zoneName: zone.name, isLead: true });
    }
    if (zone.members) {
      zone.members.forEach(member => {
        technicians.push({ ...member, zoneName: zone.name, isLead: false });
      });
    }
  });

  return technicians;
};

export const formatDateString = (date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
