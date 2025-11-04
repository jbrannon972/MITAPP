import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { format, addDays, getDay, nextSaturday, nextSunday } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import firebaseService from '../../services/firebaseService';
import { getCalculatedScheduleForDay } from '../../utils/calendarManager';
import { downloadCsvTemplate, parseCsvFile } from '../../utils/huddleCsvUtils';

const HuddleManager = () => {
  const { currentUser } = useAuth();
  const { unifiedTechnicianData } = useData();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [huddleContent, setHuddleContent] = useState({
    announcements: { content: '', visible: true },
    reminders: { content: '', visible: true },
    trainingTopic: { content: '', visible: true },
    safetyTopic: { content: '', visible: true },
    huddleTopic: { content: '', visible: true },
    weekendStaffing: { content: '', visible: true }
  });
  const [referenceLinks, setReferenceLinks] = useState([]);
  const [activePreviewTab, setActivePreviewTab] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [importing, setImporting] = useState(false);
  const [showWeekendScheduleModal, setShowWeekendScheduleModal] = useState(false);
  const [weekendSchedule, setWeekendSchedule] = useState({
    saturday: { staff: [], notes: '' },
    sunday: { staff: [], notes: '' }
  });
  const fileInputRef = useRef(null);

  const dateStr = format(selectedDate, 'yyyy-MM-dd');

  // Check if the selected date is Thursday
  const isThursday = () => {
    return getDay(selectedDate) === 4; // 4 = Thursday
  };

  // Get the upcoming weekend dates (Saturday and Sunday)
  const getUpcomingWeekend = () => {
    const saturday = nextSaturday(selectedDate);
    const sunday = nextSunday(selectedDate);
    return { saturday, sunday };
  };

  // Format weekend schedule as markdown
  const formatWeekendSchedule = (schedule, weekend) => {
    let content = `## Weekend Schedule\n\n`;
    content += `📅 ${format(weekend.saturday, 'EEEE, MMMM d, yyyy')}\n\n`;

    if (schedule.saturday.staff && schedule.saturday.staff.length > 0) {
      content += `**Staff on duty:**\n`;
      schedule.saturday.staff.forEach(person => {
        // Build the staff line with name, zone tag, and hours
        let line = `- ${person.name}`;

        // Add zone tag in parentheses
        if (person.zone) {
          line += ` (${person.zone})`;
        }

        // Add hours if available
        if (person.hours) {
          line += ` - ${person.hours}`;
        }

        content += `${line}\n`;
      });
    } else {
      content += `*No staff scheduled*\n`;
    }

    if (schedule.saturday.notes) {
      content += `\n**Notes:** ${schedule.saturday.notes}\n`;
    }

    content += `\n---\n\n`;
    content += `📅 ${format(weekend.sunday, 'EEEE, MMMM d, yyyy')}\n\n`;

    if (schedule.sunday.staff && schedule.sunday.staff.length > 0) {
      content += `**Staff on duty:**\n`;
      schedule.sunday.staff.forEach(person => {
        // Build the staff line with name, zone tag, and hours
        let line = `- ${person.name}`;

        // Add zone tag in parentheses
        if (person.zone) {
          line += ` (${person.zone})`;
        }

        // Add hours if available
        if (person.hours) {
          line += ` - ${person.hours}`;
        }

        content += `${line}\n`;
      });
    } else {
      content += `*No staff scheduled*\n`;
    }

    if (schedule.sunday.notes) {
      content += `\n**Notes:** ${schedule.sunday.notes}\n`;
    }

    return content;
  };

  // Load weekend schedule from calendar data
  const loadWeekendSchedule = async (weekend) => {
    try {
      console.log('🔍 Loading weekend schedule from calendar...');

      // Get month/year for Saturday
      const saturdayMonth = weekend.saturday.getMonth();
      const saturdayYear = weekend.saturday.getFullYear();

      // Get month/year for Sunday (might be different month)
      const sundayMonth = weekend.sunday.getMonth();
      const sundayYear = weekend.sunday.getFullYear();

      // Load schedule data for both months
      const saturdayMonthSchedules = await firebaseService.getScheduleDataForMonth(saturdayYear, saturdayMonth);
      const sundayMonthSchedules = saturdayMonth === sundayMonth
        ? saturdayMonthSchedules
        : await firebaseService.getScheduleDataForMonth(sundayYear, sundayMonth);

      console.log('📅 Loaded schedule data for months');

      // Get calculated schedule for Saturday
      const saturdaySchedule = getCalculatedScheduleForDay(weekend.saturday, saturdayMonthSchedules, unifiedTechnicianData);
      const saturdayWorking = saturdaySchedule.staff.filter(s =>
        s.status === 'on' || (s.hours && s.hours.trim() !== '')
      ).map(s => ({
        name: s.name,
        hours: s.hours || '',
        zone: s.zone || '',
        office: s.office || ''
      }));

      console.log('🗓️ Saturday working:', saturdayWorking);

      // Get calculated schedule for Sunday
      const sundaySchedule = getCalculatedScheduleForDay(weekend.sunday, sundayMonthSchedules, unifiedTechnicianData);
      const sundayWorking = sundaySchedule.staff.filter(s =>
        s.status === 'on' || (s.hours && s.hours.trim() !== '')
      ).map(s => ({
        name: s.name,
        hours: s.hours || '',
        zone: s.zone || '',
        office: s.office || ''
      }));

      console.log('🗓️ Sunday working:', sundayWorking);

      const schedule = {
        saturday: {
          staff: saturdayWorking,
          notes: saturdaySchedule.notes || ''
        },
        sunday: {
          staff: sundayWorking,
          notes: sundaySchedule.notes || ''
        }
      };

      setWeekendSchedule(schedule);
      return schedule;
    } catch (error) {
      console.error('Error loading weekend schedule:', error);
      return {
        saturday: { staff: [], notes: '' },
        sunday: { staff: [], notes: '' }
      };
    }
  };

  // Save weekend schedule to Firebase
  const saveWeekendSchedule = async () => {
    try {
      const weekend = getUpcomingWeekend();
      const saturdayStr = format(weekend.saturday, 'yyyy-MM-dd');

      await firebaseService.saveDocument('hou_weekend_schedule', saturdayStr, {
        weekendStart: saturdayStr,
        schedule: weekendSchedule,
        updatedBy: currentUser.userId,
        updatedByName: currentUser.username,
        updatedAt: new Date().toISOString()
      });

      // Auto-populate the weekend staffing content
      const formattedContent = formatWeekendSchedule(weekendSchedule, weekend);
      updateContent('weekendStaffing', formattedContent);

      setShowWeekendScheduleModal(false);
      alert('Weekend schedule saved successfully!');
    } catch (error) {
      console.error('Error saving weekend schedule:', error);
      alert('Error saving weekend schedule. Please try again.');
    }
  };

  // Load huddle content when date changes
  useEffect(() => {
    loadHuddleContent();
  }, [dateStr]);

  const loadHuddleContent = async () => {
    setLoading(true);
    try {
      console.log('🔄 Loading huddle content for date:', dateStr, 'Selected date object:', selectedDate);
      const content = await firebaseService.getDocument('hou_huddle_content', dateStr);

      if (content && content.categories) {
        setHuddleContent(content.categories);
        setReferenceLinks(content.referenceLinks || []);
      } else {
        // Reset to default empty content
        setHuddleContent({
          announcements: { content: '', visible: true },
          reminders: { content: '', visible: true },
          trainingTopic: { content: '', visible: true },
          safetyTopic: { content: '', visible: true },
          huddleTopic: { content: '', visible: true },
          weekendStaffing: { content: '', visible: true }
        });
        setReferenceLinks([]);
      }

      // RECURRING TOPIC: Auto-populate weekend schedule on Thursdays
      const isThursdayCheck = isThursday();
      console.log('📅 Is Thursday check:', isThursdayCheck, 'Day of week:', getDay(selectedDate));

      if (isThursdayCheck) {
        console.log('✅ Detected Thursday, loading weekend schedule...');
        const weekend = getUpcomingWeekend();
        console.log('📆 Upcoming weekend:', {
          saturday: format(weekend.saturday, 'yyyy-MM-dd'),
          sunday: format(weekend.sunday, 'yyyy-MM-dd')
        });

        const schedule = await loadWeekendSchedule(weekend);
        console.log('📦 Loaded weekend schedule:', schedule);

        // Only auto-populate if there's no existing content or if the content is empty
        const hasExistingContent = content?.categories?.weekendStaffing?.content && content.categories.weekendStaffing.content.trim() !== '';
        console.log('📝 Has existing weekend content:', hasExistingContent);

        if (!hasExistingContent) {
          console.log('🎯 Auto-populating weekend schedule...');
          const formattedContent = formatWeekendSchedule(schedule, weekend);
          console.log('✍️ Formatted content:', formattedContent);

          setHuddleContent(prev => ({
            ...prev,
            weekendStaffing: {
              ...prev.weekendStaffing,
              content: formattedContent
            }
          }));
          console.log('✅ Weekend schedule populated!');
        } else {
          console.log('⏭️ Skipping auto-populate - existing content found');
        }
      } else {
        console.log('⏭️ Not Thursday, skipping weekend schedule auto-populate');
      }
    } catch (error) {
      console.error('Error loading huddle content:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateContent = (category, value) => {
    setHuddleContent(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        content: value
      }
    }));
  };

  const toggleVisibility = (category) => {
    setHuddleContent(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        visible: !prev[category].visible
      }
    }));
  };

  const saveHuddleContent = async () => {
    setSaving(true);
    try {
      const huddleData = {
        date: dateStr,
        categories: huddleContent,
        referenceLinks: referenceLinks,
        createdBy: currentUser.userId,
        createdByName: currentUser.username,
        updatedAt: new Date().toISOString()
      };

      await firebaseService.saveDocument('hou_huddle_content', dateStr, huddleData);
      setLastSaved(new Date());
      alert('Huddle content saved successfully!');
    } catch (error) {
      console.error('Error saving huddle content:', error);
      alert('Error saving huddle content. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const copyFromPreviousDay = async () => {
    const previousDate = addDays(selectedDate, -1);
    const previousDateStr = format(previousDate, 'yyyy-MM-dd');

    setLoading(true);
    try {
      const previousContent = await firebaseService.getDocument('hou_huddle_content', previousDateStr);

      if (previousContent && previousContent.categories) {
        setHuddleContent(previousContent.categories);
        setReferenceLinks(previousContent.referenceLinks || []);
        alert(`Content copied from ${format(previousDate, 'MMMM d, yyyy')}`);
      } else {
        alert('No content found for the previous day.');
      }
    } catch (error) {
      console.error('Error copying from previous day:', error);
      alert('Error copying content from previous day.');
    } finally {
      setLoading(false);
    }
  };

  const clearAllContent = () => {
    if (confirm('Are you sure you want to clear all content? This will not be saved until you click Save.')) {
      setHuddleContent({
        announcements: { content: '', visible: true },
        reminders: { content: '', visible: true },
        trainingTopic: { content: '', visible: true },
        safetyTopic: { content: '', visible: true },
        huddleTopic: { content: '', visible: true },
        weekendStaffing: { content: '', visible: true }
      });
      setReferenceLinks([]);
    }
  };

  // Reference Links Functions
  const addReferenceLink = () => {
    setReferenceLinks([...referenceLinks, { title: '', url: '' }]);
  };

  const updateReferenceLink = (index, field, value) => {
    const updated = [...referenceLinks];
    updated[index][field] = value;
    setReferenceLinks(updated);
  };

  const removeReferenceLink = (index) => {
    setReferenceLinks(referenceLinks.filter((_, i) => i !== index));
  };

  // Weekend Schedule Management Functions
  const addStaffMember = (day) => {
    setWeekendSchedule(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        staff: [...prev[day].staff, '']
      }
    }));
  };

  const updateStaffMember = (day, index, value) => {
    setWeekendSchedule(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        staff: prev[day].staff.map((s, i) => i === index ? value : s)
      }
    }));
  };

  const removeStaffMember = (day, index) => {
    setWeekendSchedule(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        staff: prev[day].staff.filter((_, i) => i !== index)
      }
    }));
  };

  const updateNotes = (day, value) => {
    setWeekendSchedule(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        notes: value
      }
    }));
  };

  const openWeekendScheduleModal = async () => {
    const weekend = getUpcomingWeekend();
    await loadWeekendSchedule(weekend);
    setShowWeekendScheduleModal(true);
  };

  // CSV Import Functions
  const handleCsvImport = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setImporting(true);
    try {
      const fileContent = await file.text();
      const huddleDataArray = parseCsvFile(fileContent);

      if (huddleDataArray.length === 0) {
        alert('No valid data found in CSV file.');
        return;
      }

      // Save all imported huddles to Firestore
      let successCount = 0;
      let errorCount = 0;

      for (const huddleData of huddleDataArray) {
        try {
          await firebaseService.saveDocument('hou_huddle_content', huddleData.date, {
            date: huddleData.date,
            categories: huddleData.categories,
            referenceLinks: huddleData.referenceLinks || [],
            createdBy: currentUser.userId,
            createdByName: currentUser.username,
            updatedAt: new Date().toISOString(),
            importedAt: new Date().toISOString()
          });
          successCount++;
        } catch (error) {
          console.error(`Error saving huddle for ${huddleData.date}:`, error);
          errorCount++;
        }
      }

      alert(`CSV Import Complete!\n\nSuccessfully imported: ${successCount} huddles\nErrors: ${errorCount}`);

      // Reload current date if it was in the import
      loadHuddleContent();
    } catch (error) {
      console.error('Error importing CSV:', error);
      alert(`Error importing CSV: ${error.message}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const categories = [
    { key: 'announcements', label: 'Announcements', icon: '📢' },
    { key: 'reminders', label: 'Reminders', icon: '🔔' },
    { key: 'trainingTopic', label: 'Training Topic', icon: '📚' },
    { key: 'safetyTopic', label: 'Safety Topic', icon: '⚠️' },
    { key: 'huddleTopic', label: 'Huddle Topic', icon: '💬' },
    { key: 'weekendStaffing', label: 'Weekend Staffing', icon: '📅' }
  ];

  return (
    <div className="huddle-manager">
      <div className="huddle-manager-header">
        <div className="header-left">
          <h2>Manage Huddle Information</h2>
          <p className="subtitle">
            Pre-fill huddle content for supervisors. Supports <strong>Markdown</strong> formatting (bullet points, bold, links, etc.)
          </p>
        </div>
        <div className="header-actions">
          <button
            className="btn btn-primary"
            onClick={openWeekendScheduleModal}
            title="Manage weekend staffing schedule"
          >
            <i className="fas fa-calendar-week"></i> Manage Weekend Schedule
          </button>
          <button
            className="btn btn-secondary"
            onClick={downloadCsvTemplate}
            title="Download CSV template for bulk import"
          >
            <i className="fas fa-download"></i> Download Template
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            title="Import huddles from CSV"
          >
            <i className="fas fa-upload"></i> {importing ? 'Importing...' : 'Import CSV'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleCsvImport}
            style={{ display: 'none' }}
          />
          <button
            className="btn btn-secondary"
            onClick={copyFromPreviousDay}
            disabled={loading}
          >
            Copy from Previous Day
          </button>
          <button
            className="btn btn-secondary"
            onClick={clearAllContent}
            disabled={loading}
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Date Picker */}
      <div className="date-picker-section">
        <label htmlFor="huddle-date">Select Date:</label>
        <input
          id="huddle-date"
          type="date"
          value={dateStr}
          onChange={(e) => setSelectedDate(new Date(e.target.value + 'T00:00:00'))}
          className="date-input"
        />
        <span className="selected-date-display">
          {format(selectedDate, 'EEEE, MMMM d, yyyy')}
        </span>
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <>
          {/* Categories */}
          <div className="huddle-categories">
            {categories.map(({ key, label, icon }) => (
              <div key={key} className="huddle-category-editor">
                <div className="category-header">
                  <div className="category-title">
                    <span className="category-icon">{icon}</span>
                    <h3>{label}</h3>
                  </div>
                  <div className="category-controls">
                    <button
                      className={`btn btn-sm ${activePreviewTab === key ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setActivePreviewTab(activePreviewTab === key ? null : key)}
                    >
                      {activePreviewTab === key ? 'Hide Preview' : 'Show Preview'}
                    </button>
                    <label className="visibility-toggle">
                      <input
                        type="checkbox"
                        checked={huddleContent[key]?.visible ?? true}
                        onChange={() => toggleVisibility(key)}
                      />
                      <span>Visible to Supervisors</span>
                    </label>
                  </div>
                </div>

                <textarea
                  value={huddleContent[key]?.content ?? ''}
                  onChange={(e) => updateContent(key, e.target.value)}
                  placeholder={`Enter ${label.toLowerCase()}...\n\nMarkdown supported:\n- Bullet points\n- **Bold text**\n- [Link text](https://example.com)`}
                  className="category-textarea"
                  rows="4"
                />

                {activePreviewTab === key && huddleContent[key]?.content && (
                  <div className="markdown-preview">
                    <h4>Preview:</h4>
                    <div className="markdown-content">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {huddleContent[key].content}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Reference Links Section */}
          <div className="reference-links-section">
            <div className="section-header">
              <h3>
                <i className="fas fa-link"></i> Reference Links
              </h3>
              <button className="btn btn-secondary btn-sm" onClick={addReferenceLink}>
                <i className="fas fa-plus"></i> Add Link
              </button>
            </div>

            {referenceLinks.length === 0 ? (
              <p className="no-links-message">
                No reference links added. Click "Add Link" to include documents or resources.
              </p>
            ) : (
              <div className="reference-links-list">
                {referenceLinks.map((link, index) => (
                  <div key={index} className="reference-link-item">
                    <input
                      type="text"
                      placeholder="Link Title (e.g., Safety Document)"
                      value={link.title}
                      onChange={(e) => updateReferenceLink(index, 'title', e.target.value)}
                      className="link-title-input"
                    />
                    <input
                      type="url"
                      placeholder="URL (e.g., https://example.com/doc.pdf)"
                      value={link.url}
                      onChange={(e) => updateReferenceLink(index, 'url', e.target.value)}
                      className="link-url-input"
                    />
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => removeReferenceLink(index)}
                      title="Remove link"
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Save Section */}
          <div className="save-section">
            {lastSaved && (
              <span className="last-saved">
                Last saved: {format(lastSaved, 'h:mm a')}
              </span>
            )}
            <button
              className="btn btn-primary btn-lg"
              onClick={saveHuddleContent}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Huddle Content'}
            </button>
          </div>
        </>
      )}

      {/* Weekend Schedule Modal */}
      {showWeekendScheduleModal && (
        <div className="modal-overlay" onClick={() => setShowWeekendScheduleModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h2><i className="fas fa-calendar-week"></i> Manage Weekend Schedule</h2>
              <button className="modal-close" onClick={() => setShowWeekendScheduleModal(false)}>×</button>
            </div>

            <div className="modal-body">
              <p style={{ marginBottom: '20px', color: 'var(--text-secondary)' }}>
                Set the staff schedule for the upcoming weekend. This will automatically populate the "Weekend Staffing" section in Thursday huddles.
              </p>

              {(() => {
                const weekend = getUpcomingWeekend();
                return (
                  <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '20px', padding: '12px', backgroundColor: 'var(--background-secondary)', borderRadius: '8px' }}>
                    <i className="fas fa-info-circle"></i> Upcoming Weekend: {format(weekend.saturday, 'MMM d')} - {format(weekend.sunday, 'MMM d, yyyy')}
                  </div>
                );
              })()}

              {/* Saturday Schedule */}
              <div style={{ marginBottom: '30px', padding: '20px', border: '2px solid var(--border-color)', borderRadius: '8px' }}>
                <h3 style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fas fa-calendar-day" style={{ color: 'var(--primary-color)' }}></i>
                  Saturday - {format(getUpcomingWeekend().saturday, 'MMMM d, yyyy')}
                </h3>

                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                    Staff on Duty:
                  </label>
                  {weekendSchedule.saturday.staff.map((staff, index) => (
                    <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <input
                        type="text"
                        value={staff}
                        onChange={(e) => updateStaffMember('saturday', index, e.target.value)}
                        placeholder="Enter staff name"
                        style={{ flex: 1, padding: '8px', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                      />
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => removeStaffMember('saturday', index)}
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </div>
                  ))}
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => addStaffMember('saturday')}
                    style={{ marginTop: '8px' }}
                  >
                    <i className="fas fa-plus"></i> Add Staff Member
                  </button>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                    Notes:
                  </label>
                  <textarea
                    value={weekendSchedule.saturday.notes}
                    onChange={(e) => updateNotes('saturday', e.target.value)}
                    placeholder="Add any notes or special instructions for Saturday..."
                    style={{ width: '100%', padding: '8px', border: '1px solid var(--border-color)', borderRadius: '4px', minHeight: '60px' }}
                  />
                </div>
              </div>

              {/* Sunday Schedule */}
              <div style={{ marginBottom: '20px', padding: '20px', border: '2px solid var(--border-color)', borderRadius: '8px' }}>
                <h3 style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fas fa-calendar-day" style={{ color: 'var(--primary-color)' }}></i>
                  Sunday - {format(getUpcomingWeekend().sunday, 'MMMM d, yyyy')}
                </h3>

                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                    Staff on Duty:
                  </label>
                  {weekendSchedule.sunday.staff.map((staff, index) => (
                    <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <input
                        type="text"
                        value={staff}
                        onChange={(e) => updateStaffMember('sunday', index, e.target.value)}
                        placeholder="Enter staff name"
                        style={{ flex: 1, padding: '8px', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                      />
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => removeStaffMember('sunday', index)}
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </div>
                  ))}
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => addStaffMember('sunday')}
                    style={{ marginTop: '8px' }}
                  >
                    <i className="fas fa-plus"></i> Add Staff Member
                  </button>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                    Notes:
                  </label>
                  <textarea
                    value={weekendSchedule.sunday.notes}
                    onChange={(e) => updateNotes('sunday', e.target.value)}
                    placeholder="Add any notes or special instructions for Sunday..."
                    style={{ width: '100%', padding: '8px', border: '1px solid var(--border-color)', borderRadius: '4px', minHeight: '60px' }}
                  />
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowWeekendScheduleModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={saveWeekendSchedule}
              >
                <i className="fas fa-save"></i> Save Weekend Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HuddleManager;
