// Calendar manager utilities for schedule calculations

/**
 * Get week number of the year for a given date
 */
export const getWeekNumber = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return weekNo;
};

/**
 * Get default status for a person on a given date based on recurring rules
 */
export const getDefaultStatusForPerson = (person, dateObject) => {
  const dayKey = dateObject.getDay();
  const isWeekend = dayKey === 0 || dayKey === 6;
  const weekNumber = getWeekNumber(dateObject);

  let status = isWeekend ? 'off' : 'on';
  let hours = '';
  let source = isWeekend ? 'Weekend Default' : 'Weekday Default';

  const personRules = person.recurringRules || [];

  if (personRules.length > 0) {
    for (const rule of personRules) {
      const ruleStartDate = rule.startDate ? new Date(rule.startDate) : null;
      const ruleEndDate = rule.endDate ? new Date(rule.endDate) : null;

      if ((!ruleStartDate || dateObject >= ruleStartDate) && (!ruleEndDate || dateObject <= ruleEndDate)) {
        const ruleDays = Array.isArray(rule.days) ? rule.days : [rule.days];

        if (ruleDays.includes(dayKey)) {
          let appliesThisWeek = true;

          if (rule.frequency === 'every-other') {
            const weekAnchorParity = parseInt(rule.weekAnchor, 10) % 2;
            const weekNumberParity = weekNumber % 2;
            appliesThisWeek = weekNumberParity === weekAnchorParity;
          }

          if (appliesThisWeek) {
            status = rule.status;
            hours = rule.hours || '';
            source = 'Recurring Rule';
            break;
          }
        }
      }
    }
  }

  return { status, hours, source };
};

/**
 * Get calculated schedule for a specific day
 * Combines default status, recurring rules, and specific overrides
 */
export const getCalculatedScheduleForDay = (dateObject, monthlySchedules, unifiedTechnicianData) => {
  const specificDaySchedule = monthlySchedules.specific[dateObject.getDate()];
  const allStaff = unifiedTechnicianData;

  const calculatedSchedule = {
    notes: specificDaySchedule?.notes || '',
    staff: []
  };

  for (const staffMember of allStaff) {
    if (!staffMember) continue;

    const { status: defaultStatus, hours: defaultHours, source: defaultSource } = getDefaultStatusForPerson(staffMember, dateObject);

    let personSchedule = {
      ...staffMember,
      status: defaultStatus,
      hours: defaultHours,
      source: defaultSource
    };

    // Check for specific override for this day
    const specificEntry = specificDaySchedule?.staff?.find(s => s.id === staffMember.id);
    if (specificEntry) {
      personSchedule.status = specificEntry.status;
      personSchedule.hours = specificEntry.hours || '';
      personSchedule.source = 'Specific Override';
    }

    calculatedSchedule.staff.push(personSchedule);
  }

  calculatedSchedule.staff.sort((a, b) => a.name.localeCompare(b.name));
  return calculatedSchedule;
};

/**
 * Get actual staffing for a specific month (day-by-day array)
 */
export const getActualStaffingForMonth = async (month, year, monthlySchedules, allMitTechs, unifiedTechnicianData) => {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const staffing = [];

  for (let day = 1; day <= daysInMonth; day++) {
    let staffedToday = 0;
    const currentDate = new Date(year, month, day);
    const scheduleForDay = getCalculatedScheduleForDay(currentDate, monthlySchedules, unifiedTechnicianData);

    allMitTechs.forEach(tech => {
      const endDate = tech.endDate ? new Date(tech.endDate) : null;
      const trainingEndDate = tech.trainingEndDate ? new Date(tech.trainingEndDate) : null;

      const isActive = !endDate || endDate > currentDate;
      const isDoneTraining = !tech.inTraining || (trainingEndDate && trainingEndDate <= currentDate);

      if (isActive && isDoneTraining) {
        const staffEntry = scheduleForDay.staff.find(s => s.id === tech.id);
        if (staffEntry && staffEntry.status === 'on') {
          staffedToday++;
        }
      }
    });

    staffing.push(staffedToday);
  }

  return staffing;
};

/**
 * Format name to compact version (First L.)
 */
export const formatNameCompact = (fullName) => {
  if (!fullName) return '';
  const parts = fullName.split(' ');
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1].charAt(0)}.` : parts[0];
};

/**
 * Get holiday name for a given date
 */
export const getHolidayName = (date) => {
  const M = date.getMonth();
  const D = date.getDate();
  const dayOfWeek = date.getDay();

  if (M === 0 && D === 1) return "New Year's Day";
  if (M === 6 && D === 4) return "Independence Day";
  if (M === 11 && D === 25) return "Christmas Day";
  if (M === 4 && dayOfWeek === 1 && D > 24) return "Memorial Day";
  if (M === 8 && dayOfWeek === 1 && D <= 7) return "Labor Day";
  if (M === 10 && dayOfWeek === 4 && D >= 22 && D <= 28) return "Thanksgiving";

  return null;
};
