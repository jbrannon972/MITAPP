// Calculation utilities for labor forecasting and metrics

export const calculateMonth = (monthData, staffingData, wageSettings, currentYear) => {
  if (!monthData || !staffingData || !wageSettings) return monthData;

  const data = { ...monthData };
  const currentTechCount = getMITTechCount(staffingData, data.month, currentYear);

  data.currentStaffingLevel = currentTechCount;
  data.actualLeads = Math.round(data.leadsPercentGoal * data.leadsTarget);
  data.salesOps = Math.round(data.actualLeads * data.bookingRate);
  data.projectedWTRJobs = Math.round(
    (data.salesOps * data.wtrInsClosingRate) + (data.salesOps * data.wtrCashClosingRate)
  );
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
  const regularHours = data.techsForemenNeeded * 8 * (data.daysInMonth || 22);
  const overtimeHours = data.techsForemenNeeded * data.otHoursPerTechPerDay * (data.daysInMonth || 22);
  data.mitTechLaborCost =
    (regularHours * wageSettings.avgHourlyBaseWage) +
    (overtimeHours * wageSettings.avgOTWage);

  const numForeman = staffingData.zones ? staffingData.zones.length : 0;
  const numFieldSupervisors = 2;

  const monthlySalaries =
    ((wageSettings.fieldSupervisorWage / 12) * numFieldSupervisors) +
    (wageSettings.foremanWage / 12 * numForeman) +
    (wageSettings.assistantMitManagerWage / 12) +
    (wageSettings.mitManagerWage / 12) +
    (wageSettings.fieldSupervisorBonus * numFieldSupervisors);

  data.fixedLaborCost = monthlySalaries;
  data.totalLaborSpend = data.mitTechLaborCost + data.fixedLaborCost;
  data.costPerWTRJob = data.projectedWTRJobs > 0 ? data.totalLaborSpend / data.projectedWTRJobs : 0;

  return data;
};

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

export const getTotalStaff = (staffingData) => {
  if (!staffingData || !staffingData.zones) return 0;
  let total = 0;
  staffingData.zones.forEach(zone => {
    total += 1 + zone.members.length; // Lead + members
  });
  return total;
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

export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};

export const formatNumber = (number, decimals = 0) => {
  return number.toFixed(decimals);
};

export const getMonthName = (month) => {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[month];
};
