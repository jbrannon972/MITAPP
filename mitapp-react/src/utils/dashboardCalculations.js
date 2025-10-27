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
  const monthData = monthlyData[month];

  if (!monthData) {
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

  // Get daily stats from Firebase (from analyzer CSV upload)
  const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const stats = await firebaseService.getDailyStats(dateString);

  // Calculate sub team prep hours
  const subTeamCount = stats ? stats.subTeamCount || 0 : 0;
  const subPrepTime = subTeamCount * 1.5;
  let totalLaborHours = (stats ? stats.totalLaborHours || 0 : 0) + subPrepTime;
  const totalTechHours = (stats ? stats.totalTechHours || 0 : 0) + subPrepTime;
  const dtHours = stats ? stats.dtLaborHours || 0 : 0; // Total DT hours requested

  // Get techs working today
  const techsOnRoute = await getTechsOnRouteToday(date, staffingData, firebaseService, calendarManager, unifiedTechnicianData);
  const demoTechsOnRoute = await getDemoTechsOnRouteToday(date, staffingData, firebaseService, calendarManager, unifiedTechnicianData);

  const driveTime = monthData.averageDriveTime || 0;
  const otHours = monthData.otHoursPerTechPerDay || 0;

  const hoursPerTech = (8 - driveTime + otHours);
  const hoursAvailable = techsOnRoute * hoursPerTech;
  const dtHoursAvailable = demoTechsOnRoute * hoursPerTech; // Total available from our DTs

  // Get sub-contractor hours
  const subHours = stats && stats.subContractorJobs
    ? stats.subContractorJobs.reduce((acc, job) => acc + (job.demoHours || 0), 0)
    : 0;

  // Calculate forecast for new jobs
  const dayOfWeek = date.getDay();
  let newJobsToday = 0;

  // Get average install duration (using hoursPerAppointment or default to 3.5)
  const avgInstallDuration = monthData.hoursPerAppointment || 3.5;

  const totalRequestedHours = totalLaborHours + dtHours;
  const availableHoursGoal = totalRequestedHours + (newJobsToday * avgInstallDuration);

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

// Helper function to get demo techs working today
export const getDemoTechsOnRouteToday = async (date, staffingData, firebaseService, calendarManager, unifiedTechnicianData) => {
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

  return demoTechsWorking;
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
