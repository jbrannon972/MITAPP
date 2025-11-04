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
  const [showRecurringRemindersModal, setShowRecurringRemindersModal] = useState(false);
  const [recurringReminders, setRecurringReminders] = useState([]);
  const [editingReminder, setEditingReminder] = useState(null);
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

      return schedule;
    } catch (error) {
      console.error('Error loading weekend schedule:', error);
      return {
        saturday: { staff: [], notes: '' },
        sunday: { staff: [], notes: '' }
      };
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

      // Load recurring reminders first and get them
      const remindersDoc = await firebaseService.getDocument('hou_recurring_reminders', 'config');
      const loadedReminders = remindersDoc?.reminders || [];
      setRecurringReminders(loadedReminders);

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

      // Auto-populate recurring reminders if not already set
      const applicableReminders = loadedReminders
        .filter(reminder => shouldShowReminder(reminder, selectedDate))
        .map(reminder => reminder.text)
        .join('\n\n');

      if (applicableReminders && (!content || !content.categories?.reminders?.content)) {
        setHuddleContent(prev => ({
          ...prev,
          reminders: {
            ...prev.reminders,
            content: applicableReminders
          }
        }));
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

  // Recurring Reminders Management Functions
  const loadRecurringReminders = async () => {
    try {
      const reminders = await firebaseService.getDocument('hou_recurring_reminders', 'config');
      if (reminders && reminders.reminders) {
        setRecurringReminders(reminders.reminders);
      }
    } catch (error) {
      console.error('Error loading recurring reminders:', error);
    }
  };

  const saveRecurringReminders = async () => {
    try {
      await firebaseService.saveDocument('hou_recurring_reminders', 'config', {
        reminders: recurringReminders,
        updatedBy: currentUser.userId,
        updatedByName: currentUser.username,
        updatedAt: new Date().toISOString()
      });
      alert('Recurring reminders saved successfully!');
      setShowRecurringRemindersModal(false);
      setEditingReminder(null);
      // Reload huddle content to apply new reminders
      loadHuddleContent();
    } catch (error) {
      console.error('Error saving recurring reminders:', error);
      alert('Error saving recurring reminders. Please try again.');
    }
  };

  const addRecurringReminder = () => {
    setEditingReminder({
      id: Date.now().toString(),
      text: '',
      dayOfWeek: 1, // Monday
      frequency: 'weekly', // weekly or monthly
      dayOfMonth: 1, // For monthly reminders
      active: true
    });
  };

  const saveEditingReminder = () => {
    if (!editingReminder.text.trim()) {
      alert('Please enter reminder text');
      return;
    }

    const existingIndex = recurringReminders.findIndex(r => r.id === editingReminder.id);
    if (existingIndex >= 0) {
      // Update existing
      setRecurringReminders(prev =>
        prev.map(r => r.id === editingReminder.id ? editingReminder : r)
      );
    } else {
      // Add new
      setRecurringReminders(prev => [...prev, editingReminder]);
    }
    setEditingReminder(null);
  };

  const deleteRecurringReminder = async (reminderId) => {
    if (!confirm('This will remove this reminder from all future huddles. Are you sure?')) {
      return;
    }

    setRecurringReminders(prev => prev.filter(r => r.id !== reminderId));
  };

  const shouldShowReminder = (reminder, date) => {
    if (!reminder.active) return false;

    const dayOfWeek = getDay(date);

    if (reminder.frequency === 'weekly') {
      return dayOfWeek === reminder.dayOfWeek;
    } else if (reminder.frequency === 'monthly') {
      const dayOfMonth = date.getDate();
      return dayOfMonth === reminder.dayOfMonth;
    }

    return false;
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
            onClick={() => setShowRecurringRemindersModal(true)}
            title="Manage recurring reminders"
          >
            <i className="fas fa-bell"></i> Recurring Reminders
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

      {/* Recurring Reminders Modal */}
      {showRecurringRemindersModal && (
        <div className="modal-overlay active" onClick={() => setShowRecurringRemindersModal(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2><i className="fas fa-bell"></i> Manage Recurring Reminders</h2>
              <button className="modal-close" onClick={() => setShowRecurringRemindersModal(false)}>×</button>
            </div>

            <div className="modal-body">
              <p style={{ marginBottom: '20px', color: 'var(--text-secondary)' }}>
                Create reminders that automatically appear in huddles on specific days. Reminders can be set to repeat weekly or monthly.
              </p>

              {/* List of Recurring Reminders */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ margin: 0 }}>Active Reminders</h3>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={addRecurringReminder}
                  >
                    <i className="fas fa-plus"></i> Add Reminder
                  </button>
                </div>

                {recurringReminders.length === 0 ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center', background: 'var(--surface-secondary)', borderRadius: '8px' }}>
                    <i className="fas fa-bell-slash" style={{ fontSize: '48px', color: 'var(--text-secondary)', marginBottom: '16px' }}></i>
                    <p style={{ color: 'var(--text-secondary)' }}>No recurring reminders set up yet. Click "Add Reminder" to create one.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {recurringReminders.map((reminder) => (
                      <div
                        key={reminder.id}
                        style={{
                          padding: '16px',
                          background: 'white',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start'
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '600', marginBottom: '8px' }}>{reminder.text}</div>
                          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                            <i className="fas fa-calendar"></i>{' '}
                            {reminder.frequency === 'weekly' ? (
                              <>Every {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][reminder.dayOfWeek]}</>
                            ) : (
                              <>Monthly on day {reminder.dayOfMonth}</>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setEditingReminder(reminder)}
                            title="Edit reminder"
                          >
                            <i className="fas fa-edit"></i>
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => deleteRecurringReminder(reminder.id)}
                            title="Delete reminder"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Edit/Add Reminder Form */}
              {editingReminder && (
                <div style={{ padding: '20px', background: 'var(--surface-secondary)', borderRadius: '8px', border: '2px solid var(--primary-color)' }}>
                  <h3 style={{ marginBottom: '16px' }}>
                    {recurringReminders.find(r => r.id === editingReminder.id) ? 'Edit' : 'Add'} Reminder
                  </h3>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                      Reminder Text:
                    </label>
                    <textarea
                      value={editingReminder.text}
                      onChange={(e) => setEditingReminder({ ...editingReminder, text: e.target.value })}
                      placeholder="Enter reminder text...\n\nMarkdown supported:\n- Bullet points\n- **Bold text**\n- [Link text](https://example.com)"
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        minHeight: '100px',
                        fontFamily: 'inherit'
                      }}
                    />
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      💡 Tip: Use Markdown formatting - it will render nicely in the huddle reminders section
                    </div>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                      Frequency:
                    </label>
                    <select
                      value={editingReminder.frequency}
                      onChange={(e) => setEditingReminder({ ...editingReminder, frequency: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px'
                      }}
                    >
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>

                  {editingReminder.frequency === 'weekly' ? (
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                        Day of Week:
                      </label>
                      <select
                        value={editingReminder.dayOfWeek}
                        onChange={(e) => setEditingReminder({ ...editingReminder, dayOfWeek: parseInt(e.target.value) })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '1px solid var(--border-color)',
                          borderRadius: '4px'
                        }}
                      >
                        <option value={0}>Sunday</option>
                        <option value={1}>Monday</option>
                        <option value={2}>Tuesday</option>
                        <option value={3}>Wednesday</option>
                        <option value={4}>Thursday</option>
                        <option value={5}>Friday</option>
                        <option value={6}>Saturday</option>
                      </select>
                    </div>
                  ) : (
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                        Day of Month (1-31):
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={editingReminder.dayOfMonth}
                        onChange={(e) => setEditingReminder({ ...editingReminder, dayOfMonth: parseInt(e.target.value) })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '1px solid var(--border-color)',
                          borderRadius: '4px'
                        }}
                      />
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => setEditingReminder(null)}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={saveEditingReminder}
                    >
                      <i className="fas fa-check"></i> Save Reminder
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowRecurringRemindersModal(false);
                  setEditingReminder(null);
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={saveRecurringReminders}
              >
                <i className="fas fa-save"></i> Save All Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HuddleManager;
