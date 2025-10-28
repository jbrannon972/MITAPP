import firebaseService from './firebaseService';
import { format, subDays, eachDayOfInterval } from 'date-fns';

/**
 * Get all missed huddles for techs in a zone
 * Returns a map of tech IDs to their missed huddles
 */
export const getMissedHuddlesForZone = async (zoneId, zoneName, techIds, lookbackDays = 30) => {
  try {
    const endDate = new Date();
    const startDate = subDays(endDate, lookbackDays);
    const days = eachDayOfInterval({ start: startDate, end: endDate });

    const missedHuddles = {};

    // Initialize missed huddles map for each tech
    techIds.forEach(techId => {
      missedHuddles[techId] = [];
    });

    // Check each day for attendance
    for (const day of days) {
      const dateStr = format(day, 'yyyy-MM-dd');
      const attendanceId = `${dateStr}_${zoneId}`;

      const [attendance, huddleContent] = await Promise.all([
        firebaseService.getDocument('hou_huddle_attendance', attendanceId),
        firebaseService.getDocument('hou_huddle_content', dateStr)
      ]);

      // Only process if there was huddle content for this day
      if (huddleContent && hasVisibleContent(huddleContent.categories)) {
        // Check which techs were absent
        techIds.forEach(techId => {
          const wasPresent = attendance && attendance.present && attendance.present.includes(techId);

          if (!wasPresent) {
            // This tech missed this huddle
            missedHuddles[techId].push({
              date: dateStr,
              dateFormatted: format(day, 'MMM d, yyyy'),
              categories: huddleContent.categories,
              topicsSummary: getTopicsSummary(huddleContent.categories)
            });
          }
        });
      }
    }

    return missedHuddles;
  } catch (error) {
    console.error('Error getting missed huddles:', error);
    return {};
  }
};

/**
 * Check if huddle content has any visible content
 */
const hasVisibleContent = (categories) => {
  if (!categories) return false;

  return Object.values(categories).some(category =>
    category.visible && category.content && category.content.trim()
  );
};

/**
 * Get a summary of topics covered in a huddle
 */
const getTopicsSummary = (categories) => {
  if (!categories) return [];

  const summaries = [];
  const categoryTitles = {
    announcements: 'Announcements',
    reminders: 'Reminders',
    trainingTopic: 'Training Topic',
    safetyTopic: 'Safety Topic',
    huddleTopic: 'Huddle Topic',
    weekendStaffing: 'Weekend Staffing'
  };

  Object.entries(categories).forEach(([key, category]) => {
    if (category.visible && category.content && category.content.trim()) {
      summaries.push({
        category: categoryTitles[key] || key,
        preview: category.content.substring(0, 100) + (category.content.length > 100 ? '...' : '')
      });
    }
  });

  return summaries;
};

/**
 * Mark a missed huddle as covered for a specific tech
 */
export const markHuddleCovered = async (techId, techName, date, zoneId, coveredBy) => {
  try {
    const coverageId = `${date}_${zoneId}_${techId}`;
    const coverageData = {
      techId,
      techName,
      date,
      zoneId,
      coveredBy,
      coveredAt: new Date().toISOString()
    };

    await firebaseService.saveDocument('hou_huddle_coverage', coverageId, coverageData);
    return true;
  } catch (error) {
    console.error('Error marking huddle as covered:', error);
    return false;
  }
};

/**
 * Get coverage records for a zone and date
 * Returns which missed huddles have been covered 1-on-1
 */
export const getCoverageRecords = async (zoneId, techIds, dateStr) => {
  try {
    const coveragePromises = techIds.map(techId => {
      const coverageId = `${dateStr}_${zoneId}_${techId}`;
      return firebaseService.getDocument('hou_huddle_coverage', coverageId);
    });

    const coverageResults = await Promise.all(coveragePromises);
    const coverageMap = {};

    techIds.forEach((techId, idx) => {
      if (coverageResults[idx]) {
        coverageMap[techId] = coverageResults[idx];
      }
    });

    return coverageMap;
  } catch (error) {
    console.error('Error getting coverage records:', error);
    return {};
  }
};

export default {
  getMissedHuddlesForZone,
  markHuddleCovered,
  getCoverageRecords
};
