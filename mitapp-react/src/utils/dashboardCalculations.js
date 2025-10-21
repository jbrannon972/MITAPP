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
  const data = monthlyData[month];

  if (!data) {
    return {
      potentialNewJobs: 0,
      inefficientDemoHours: 0,
      dailyHoursData: []
    };
  }

  const monthlySchedules = await firebaseService.getScheduleDataForMonth(date.getFullYear(), date.getMonth());
  const allTechs = unifiedTechnicianData || getAllTechnicians(staffingData);
  const schedule = calendarManager.getCalculatedScheduleForDay(date, monthlySchedules, allTechs);

  // Calculate techs working
  const mitTechs = allTechs.filter(t => t.role === 'MIT Tech' && !t.inTraining);
  const demoTechs = allTechs.filter(t => t.role === 'Demo Tech');

  let mitTechsWorking = 0;
  let demoTechsWorking = 0;

  mitTechs.forEach(tech => {
    const entry = schedule.staff.find(s => s.id === tech.id);
    if (entry && entry.status === 'on') mitTechsWorking++;
  });

  demoTechs.forEach(tech => {
    const entry = schedule.staff.find(s => s.id === tech.id);
    if (entry && entry.status === 'on') demoTechsWorking++;
  });

  const driveTime = data.averageDriveTime || 0;
  const otHours = data.otHoursPerTechPerDay || 0;
  const hoursPerRoute = (8 - driveTime) + otHours;

  const totalMitHours = mitTechsWorking * hoursPerRoute;
  const totalDemoHours = demoTechsWorking * 8;

  const hoursPerJob = data.hoursPerAppointment || 8;
  const potentialNewJobs = Math.floor(totalMitHours / hoursPerJob);

  // Calculate inefficient demo hours
  const demoPairs = Math.floor(demoTechsWorking / 2);
  const oddDemoTech = demoTechsWorking % 2;
  const inefficientDemoHours = oddDemoTech * 8;

  return {
    potentialNewJobs,
    inefficientDemoHours,
    totalMitHours,
    totalDemoHours,
    mitTechsWorking,
    demoTechsWorking,
    demoPairs
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
