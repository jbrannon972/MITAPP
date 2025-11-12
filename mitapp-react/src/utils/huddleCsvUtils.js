import { format, parse } from 'date-fns';

/**
 * Generate CSV template for bulk huddle import
 */
export const downloadCsvTemplate = () => {
  const headers = [
    'Date (YYYY-MM-DD)',
    'Announcements',
    'Reminders',
    'Training Topic',
    'Safety Topic',
    'Huddle Topic',
    'Weekend Staffing',
    'Reference Links (JSON format)'
  ];

  const exampleRow = [
    format(new Date(), 'yyyy-MM-dd'),
    '- First announcement\n- Second announcement',
    '- Remember to clock in\n- Check your routes',
    'Customer service excellence',
    'Ladder safety review',
    'Q4 goals discussion',
    'Saturday: John, Mike\nSunday: Sarah, Lisa',
    '[{"title":"Safety Document","url":"https://example.com/doc"}]'
  ];

  // Create CSV content
  const csvContent = [
    headers.join(','),
    exampleRow.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')
  ].join('\n');

  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', `huddle_template_${format(new Date(), 'yyyy-MM-dd')}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Parse CSV file content into huddle data array
 */
export const parseCsvFile = (fileContent) => {
  const lines = [];
  let currentLine = '';
  let insideQuotes = false;

  // Parse CSV handling quoted fields with newlines
  for (let i = 0; i < fileContent.length; i++) {
    const char = fileContent[i];
    const nextChar = fileContent[i + 1];

    if (char === '"' && nextChar === '"' && insideQuotes) {
      currentLine += '"';
      i++; // Skip next quote
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === '\n' && !insideQuotes) {
      if (currentLine.trim()) {
        lines.push(currentLine);
      }
      currentLine = '';
    } else {
      currentLine += char;
    }
  }

  if (currentLine.trim()) {
    lines.push(currentLine);
  }

  if (lines.length < 2) {
    throw new Error('CSV file must contain headers and at least one data row');
  }

  // Remove header row
  const dataRows = lines.slice(1);

  const huddleData = [];

  dataRows.forEach((line, index) => {
    const fields = parseCsvLine(line);

    if (fields.length < 7) {
      console.warn(`Row ${index + 2} has insufficient fields, skipping`);
      return;
    }

    const [dateStr, announcements, reminders, trainingTopic, safetyTopic, huddleTopic, weekendStaffing, referenceLinkJson] = fields;

    // Parse date
    let date;
    try {
      date = parse(dateStr.trim(), 'yyyy-MM-dd', new Date());
      if (isNaN(date.getTime())) {
        throw new Error('Invalid date');
      }
    } catch (error) {
      console.warn(`Row ${index + 2} has invalid date: ${dateStr}, skipping`);
      return;
    }

    // Parse reference links if provided
    let referenceLinks = [];
    if (referenceLinkJson && referenceLinkJson.trim()) {
      try {
        referenceLinks = JSON.parse(referenceLinkJson.trim());
        if (!Array.isArray(referenceLinks)) {
          referenceLinks = [];
        }
      } catch (error) {
        console.warn(`Row ${index + 2} has invalid reference links JSON, using empty array`);
        referenceLinks = [];
      }
    }

    huddleData.push({
      date: format(date, 'yyyy-MM-dd'),
      categories: {
        announcements: { content: announcements.trim(), visible: true },
        reminders: { content: reminders.trim(), visible: true },
        trainingTopic: { content: trainingTopic.trim(), visible: true },
        safetyTopic: { content: safetyTopic.trim(), visible: true },
        huddleTopic: { content: huddleTopic.trim(), visible: true },
        weekendStaffing: { content: weekendStaffing.trim(), visible: true }
      },
      referenceLinks: referenceLinks
    });
  });

  return huddleData;
};

/**
 * Parse a single CSV line handling quoted fields
 */
const parseCsvLine = (line) => {
  const fields = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"' && nextChar === '"' && insideQuotes) {
      currentField += '"';
      i++; // Skip next quote
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === ',' && !insideQuotes) {
      fields.push(currentField);
      currentField = '';
    } else {
      currentField += char;
    }
  }

  fields.push(currentField);
  return fields;
};

/**
 * Export huddle data to CSV
 */
export const exportHuddleDataToCsv = (huddleDataArray) => {
  const headers = [
    'Date (YYYY-MM-DD)',
    'Announcements',
    'Reminders',
    'Training Topic',
    'Safety Topic',
    'Huddle Topic',
    'Weekend Staffing',
    'Reference Links (JSON format)'
  ];

  const rows = huddleDataArray.map(huddle => {
    const referenceLinksJson = huddle.referenceLinks && huddle.referenceLinks.length > 0
      ? JSON.stringify(huddle.referenceLinks)
      : '';

    return [
      huddle.date,
      huddle.categories.announcements?.content || '',
      huddle.categories.reminders?.content || '',
      huddle.categories.trainingTopic?.content || '',
      huddle.categories.safetyTopic?.content || '',
      huddle.categories.huddleTopic?.content || '',
      huddle.categories.weekendStaffing?.content || '',
      referenceLinksJson
    ].map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', `huddle_export_${format(new Date(), 'yyyy-MM-dd')}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
