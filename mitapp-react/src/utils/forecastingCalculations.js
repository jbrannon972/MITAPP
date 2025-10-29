/**
 * Forecasting Calculations Utility
 * Ported from vanilla JS calculations.js
 */

/**
 * Get default monthly data for a given month
 */
export const getDefaultMonthlyData = (month) => {
  const now = new Date();
  const currentMonth = now.getMonth();
  const isHistorical = month < currentMonth;

  return {
    daysInMonth: [23, 19, 21, 22, 21, 20, 22, 21, 21, 22, 18, 22][month],
    leadsPercentGoal: isHistorical ? [0.828, 0.902, 0.873, 0.78, 0.76, 0.89][month] || 0.85 : 0.85,
    leadsTarget: [401, 366, 361, 391, 500, 505, 510, 515, 431, 416, 406, 396][month],
    bookingRate: isHistorical ? [0.852, 0.833, 0.857, 0.83, 0.847, 0.805][month] || 0.85 : 0.85,
    wtrInsClosingRate: isHistorical ? [0.4382, 0.4873, 0.4074, 0.4173, 0.4068, 0.378][month] || 0.43 : 0.43,
    wtrCashClosingRate: isHistorical ? [0.212, 0.1527, 0.1618, 0.2008, 0.2516, 0.218][month] || 0.175 : 0.175,
    mitAvgDaysOnsite: 5,
    hoursPerAppointment: 4,
    otHoursPerTechPerDay: month === 7 ? 1.5 : 0,
    teamMembersOffPerDay: 3,
    averageDriveTime: 1.0
  };
};

/**
 * Get default wage settings
 */
export const getDefaultWageSettings = () => {
  return {
    avgHourlyBaseWage: 19.52,
    avgOTWage: 29.28,
    fieldSupervisorWage: 64000,
    fieldSupervisorBonus: 500,
    foremanWage: 59000,
    assistantMitManagerWage: 78000,
    mitManagerWage: 100000
  };
};

/**
 * Get MIT Tech count for a specific month
 * Counts MIT Techs who are not in training and active in the given month
 * Also includes 2nd Shift Lead
 */
export const getMITTechCount = (staffingData, month, year) => {
  if (!staffingData || !staffingData.zones) return 0;

  let routeRunningTechs = 0;
  const referenceDate = new Date(year, month + 1, 0); // Last day of the month

  const isEligible = (person) => {
    if (!person) return false;
    const endDate = person.endDate ? new Date(person.endDate) : null;
    const trainingEndDate = person.trainingEndDate ? new Date(person.trainingEndDate) : null;

    const isActive = !endDate || endDate > referenceDate;
    const isDoneTraining = !person.inTraining || (trainingEndDate && trainingEndDate <= referenceDate);

    return isActive && isDoneTraining;
  };

  staffingData.zones.forEach(zone => {
    // Count MIT Tech members
    zone.members.forEach(member => {
      if (member.role === 'MIT Tech' && isEligible(member)) {
        routeRunningTechs++;
      }
    });

    // Include 2nd Shift Lead
    if (zone.name === '2nd Shift' && zone.lead && isEligible(zone.lead)) {
      routeRunningTechs++;
    }
  });

  return routeRunningTechs;
};

/**
 * Calculate staffing needs and costs for a single month
 */
export const calculateMonth = (monthData, staffingData, wageSettings, month, year) => {
  if (!monthData) return null;

  const data = { ...monthData };
  const currentTechCount = getMITTechCount(staffingData, month, year);
  data.currentStaffingLevel = currentTechCount;

  // Calculate sales funnel
  data.actualLeads = Math.round(data.leadsPercentGoal * data.leadsTarget);
  data.salesOps = Math.round(data.actualLeads * data.bookingRate);
  data.projectedWTRJobs = Math.round(
    (data.salesOps * data.wtrInsClosingRate) +
    (data.salesOps * data.wtrCashClosingRate)
  );

  // Calculate staffing needs
  data.activeJobsPerDay = (data.projectedWTRJobs / (data.daysInMonth || 22)) * data.mitAvgDaysOnsite;
  data.hoursNeededPerDay = data.activeJobsPerDay * data.hoursPerAppointment;

  const driveTime = data.averageDriveTime || 0;
  const effectiveWorkHours = (8 - driveTime) + data.otHoursPerTechPerDay;

  data.techsForemenNeeded = effectiveWorkHours > 0
    ? Math.ceil(data.hoursNeededPerDay / effectiveWorkHours)
    : 0;

  data.staffingNeed = data.techsForemenNeeded + data.teamMembersOffPerDay;
  data.staffingDelta = data.currentStaffingLevel - data.staffingNeed;

  // Calculate labor costs
  if (wageSettings) {
    const regularHours = data.techsForemenNeeded * 8 * (data.daysInMonth || 22);
    const overtimeHours = data.techsForemenNeeded * data.otHoursPerTechPerDay * (data.daysInMonth || 22);
    data.mitTechLaborCost = (regularHours * wageSettings.avgHourlyBaseWage) +
                           (overtimeHours * wageSettings.avgOTWage);

    const numForeman = staffingData?.zones ? staffingData.zones.length : 0;
    const numFieldSupervisors = 2;

    const monthlySalaries =
      ((wageSettings.fieldSupervisorWage / 12) * numFieldSupervisors) +
      (wageSettings.foremanWage / 12 * numForeman) +
      (wageSettings.assistantMitManagerWage / 12) +
      (wageSettings.mitManagerWage / 12) +
      (wageSettings.fieldSupervisorBonus * numFieldSupervisors);

    data.fixedLaborCost = monthlySalaries;
    data.totalLaborSpend = data.mitTechLaborCost + data.fixedLaborCost;
    data.costPerWTRJob = data.projectedWTRJobs > 0
      ? data.totalLaborSpend / data.projectedWTRJobs
      : 0;
  }

  return data;
};

/**
 * Calculate monthly forecast - daily routes needed vs staffing
 */
export const calculateMonthlyForecast = async (monthData, month, year, getActualStaffingFn) => {
  if (!monthData) {
    return {
      dailyRoutesNeeded: [],
      actualStaffing: [],
      newJobs: { weekday: 0, saturday: 0, sunday: 0 }
    };
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const projectedJobs = monthData.projectedWTRJobs || 0;
  const driveTime = monthData.averageDriveTime || 0;
  const otHoursPerTechPerDay = monthData.otHoursPerTechPerDay || 0;
  const hoursPerRoute = (8 - driveTime) + otHoursPerTechPerDay;

  // Count weekdays, saturdays, sundays
  let weekdays = 0, saturdays = 0, sundays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dayOfWeek = new Date(year, month, d).getDay();
    if (dayOfWeek > 0 && dayOfWeek < 6) weekdays++;
    else if (dayOfWeek === 6) saturdays++;
    else sundays++;
  }

  // Calculate new jobs per day type
  const weekdayJobs = projectedJobs > 0
    ? projectedJobs / (weekdays + (saturdays * 0.5) + (sundays * 0.25))
    : 0;
  const newJobs = {
    weekday: weekdayJobs,
    saturday: weekdayJobs / 2,
    sunday: weekdayJobs / 4
  };

  // Calculate daily routes needed
  const dailyRoutesNeeded = [];
  const baseDailyHoursNeeded = monthData.activeJobsPerDay * monthData.hoursPerAppointment;

  for (let d = 1; d <= daysInMonth; d++) {
    const dayOfWeek = new Date(year, month, d).getDay();
    let dailyHoursNeeded = baseDailyHoursNeeded;

    if (dayOfWeek === 6) {
      dailyHoursNeeded *= 0.5;
    } else if (dayOfWeek === 0) {
      dailyHoursNeeded *= 0.25;
    }

    const routesNeeded = hoursPerRoute > 0 ? dailyHoursNeeded / hoursPerRoute : 0;
    dailyRoutesNeeded.push(routesNeeded);
  }

  // Get actual staffing from calendar if function provided
  const actualStaffing = getActualStaffingFn
    ? await getActualStaffingFn(month, year)
    : Array(daysInMonth).fill(0);

  return { dailyRoutesNeeded, actualStaffing, newJobs };
};

/**
 * Format currency
 */
export const formatCurrency = (value) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

/**
 * Format number with commas
 */
export const formatNumber = (value, decimals = 0) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
};
