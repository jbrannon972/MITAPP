import { useState, useEffect } from 'react';
import Layout from '../components/common/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import firebaseService from '../services/firebaseService';
import { getCalculatedScheduleForDay, getHolidayName, formatNameCompact, getDefaultStatusForPerson } from '../utils/calendarManager';
import { collection, getDocs, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import '../styles/calendar-styles.css';

const Calendar = () => {
  const { currentUser } = useAuth();
  const { unifiedTechnicianData, loading: dataLoading } = useData();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState('month');
  const [monthlySchedules, setMonthlySchedules] = useState({ specific: {} });
  const [loading, setLoading] = useState(true);
  const [selectedDaySchedule, setSelectedDaySchedule] = useState(null);
  const [isCalendarAdmin, setIsCalendarAdmin] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [editingDate, setEditingDate] = useState(null);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [recurringModalView, setRecurringModalView] = useState('list'); // 'list' or 'edit'
  const [selectedTechForRecurring, setSelectedTechForRecurring] = useState(null);
  const [recurringRules, setRecurringRules] = useState([]);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ total: 0, current: 0, status: '', migrated: [], errors: [] });
  const [weekendReportModalOpen, setWeekendReportModalOpen] = useState(false);
  const [weekendReportData, setWeekendReportData] = useState(null);
  const [ripplingModalOpen, setRipplingModalOpen] = useState(false);
  const [ripplingStatus, setRipplingStatus] = useState({ loading: false, message: '', log: '' });

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  useEffect(() => {
    // Check if user has calendar admin access
    const calAdminStatus = localStorage.getItem('calendarAdmin') === 'true';
    setIsCalendarAdmin(calAdminStatus);
  }, []);

  useEffect(() => {
    if (unifiedTechnicianData && unifiedTechnicianData.length > 0) {
      loadMonthSchedules();
    }
  }, [currentDate, unifiedTechnicianData]);

  const loadMonthSchedules = async () => {
    try {
      setLoading(true);
      const schedules = await firebaseService.getScheduleDataForMonth(
        currentDate.getFullYear(),
        currentDate.getMonth()
      );
      setMonthlySchedules(schedules);
    } catch (error) {
      console.error('Error loading schedules:', error);
    } finally {
      setLoading(false);
    }
  };

  const navigate = (direction) => {
    const newDate = new Date(currentDate);
    if (currentView === 'month') {
      newDate.setMonth(newDate.getMonth() + direction);
    } else if (currentView === 'week') {
      newDate.setDate(newDate.getDate() + (7 * direction));
    } else {
      newDate.setDate(newDate.getDate() + direction);
    }
    setCurrentDate(newDate);
  };

  const switchView = (view) => {
    setCurrentView(view);
  };

  const handleAdminLogin = () => {
    if (adminPassword === 'Entrusted1') {
      setIsCalendarAdmin(true);
      localStorage.setItem('calendarAdmin', 'true');
      setShowAdminModal(false);
      setAdminPassword('');
      alert('Calendar admin access granted!');
    } else {
      alert('Incorrect password');
    }
  };

  const handleAdminLogout = () => {
    setIsCalendarAdmin(false);
    localStorage.removeItem('calendarAdmin');
    alert('Logged out from calendar admin');
  };

  /**
   * Sync with Rippling - Import vacation/PTO data from Rippling calendar
   */
  const handleSyncWithRippling = async () => {
    if (!isCalendarAdmin) {
      alert('Admin access required');
      return;
    }

    const iCalUrl = 'webcal://app.rippling.com/api/feed/calendar/pto/all-reports/mpddmgvrmobo67mp/fae7526ebae71b747bb3a68129033095c76027f0ba187a62915ca80d3ae8def0/calendar.ics?company=685d9aa96419b55f758d812c';
    const proxyUrl = 'https://cors-anywhere.herokuapp.com/';
    const fetchUrl = `${proxyUrl}${iCalUrl.replace("webcal://", "https://")}`;

    setRipplingModalOpen(true);
    setRipplingStatus({ loading: true, message: 'Fetching time-off data from Rippling...', log: '' });

    try {
      const allStaff = unifiedTechnicianData;
      if (!allStaff || allStaff.length === 0) {
        throw new Error("Could not load staff list to match names.");
      }

      const response = await fetch(fetchUrl);
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error(`CORS Anywhere proxy requires activation. Please visit ${proxyUrl} in a new tab, request temporary access, then try syncing again.`);
        }
        throw new Error(`Failed to fetch calendar data. Status: ${response.status}`);
      }

      const iCalData = await response.text();

      // Use ICAL library to parse (assuming it's loaded globally)
      if (typeof window.ICAL === 'undefined') {
        throw new Error('ICAL library not loaded. Please ensure ical.js is included in your page.');
      }

      const jcalData = window.ICAL.parse(iCalData);
      const vcalendar = new window.ICAL.Component(jcalData);
      const vevents = vcalendar.getAllSubcomponents('vevent');

      let updatesStaged = 0;
      let logHtml = '<h4>Sync Log:</h4>';

      for (const event of vevents) {
        const summary = event.getFirstPropertyValue('summary');
        if (!summary) continue;

        const employeeName = summary.split(' on ')[0].trim();

        let staffMember = allStaff.find(s => s.name && s.name.toLowerCase() === employeeName.toLowerCase());

        if (staffMember) {
          const startDate = event.getFirstPropertyValue('dtstart').toJSDate();
          const endDate = event.getFirstPropertyValue('dtend').toJSDate();

          for (let d = new Date(startDate); d < endDate; d.setDate(d.getDate() + 1)) {
            const dateString = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

            // Check if vacation entry already exists
            const docRef = doc(db, 'hou_schedules', dateString);
            const docSnap = await getDocs(collection(db, 'hou_schedules'));
            const existingDoc = docSnap.docs.find(doc => doc.id === dateString);
            const existingData = existingDoc ? existingDoc.data() : {};
            const staffEntry = existingData.staff?.find(s => s.id === staffMember.id && s.status === 'vacation');

            if (!staffEntry) {
              logHtml += `<p>Staging update for <strong>${staffMember.name}</strong> on ${dateString}.</p>`;
              updatesStaged++;

              // Update document with vacation status
              const updatedStaff = existingData.staff || [];
              updatedStaff.push({ id: staffMember.id, status: 'vacation', hours: '', source: 'Rippling' });

              await updateDoc(docRef, {
                date: Timestamp.fromDate(new Date(d)),
                staff: updatedStaff
              });
            }
          }
        }
      }

      if (updatesStaged > 0) {
        logHtml += `<p class="success-text">✅ Successfully committed ${updatesStaged} new schedule updates.</p>`;
      } else {
        logHtml += '<p>No new time-off events found to sync.</p>';
      }

      setRipplingStatus({ loading: false, message: 'Sync Complete!', log: logHtml });

    } catch (error) {
      console.error("Sync failed:", error);
      setRipplingStatus({
        loading: false,
        message: 'Sync Failed',
        log: `<p class="error-text">An error occurred during the sync process:</p><p>${error.message}</p>`
      });
    }
  };

  /**
   * ONE-TIME SYNC: Migrate React format data to Vanilla JS format
   */
  const runDataMigration = async () => {
    setSyncProgress({ total: 0, current: 0, status: 'Starting migration...', migrated: [], errors: [] });
    setSyncModalOpen(true);

    try {
      // Load all schedule documents
      setSyncProgress(prev => ({ ...prev, status: 'Loading schedule data...' }));
      const snapshot = await getDocs(collection(db, 'hou_schedules'));
      const docs = [];
      snapshot.forEach(doc => docs.push({ id: doc.id, data: doc.data() }));

      setSyncProgress(prev => ({ ...prev, total: docs.length, status: 'Analyzing documents...' }));

      // Analyze and migrate each document
      const migrated = [];
      const errors = [];
      let current = 0;

      for (const { id, data } of docs) {
        current++;
        setSyncProgress(prev => ({ ...prev, current, status: `Processing document ${current}/${docs.length}...` }));

        try {
          let needsMigration = false;
          const updates = {};

          // Check if date needs conversion
          if (!data.date || !(data.date instanceof Timestamp)) {
            if (typeof data.date === 'string') {
              const [year, month, day] = data.date.split('-').map(Number);
              updates.date = Timestamp.fromDate(new Date(year, month - 1, day));
              needsMigration = true;
            } else if (/^\d{4}-\d{2}-\d{2}$/.test(id)) {
              // Parse from document ID
              const [year, month, day] = id.split('-').map(Number);
              updates.date = Timestamp.fromDate(new Date(year, month - 1, day));
              needsMigration = true;
            }
          }

          // Check if staffList needs to be renamed to staff
          if (data.staffList && !data.staff) {
            updates.staff = data.staffList;
            needsMigration = true;
          }

          // Check if status values need to be lowercased
          const staffArray = updates.staff || data.staff || [];
          if (staffArray.length > 0) {
            const hasCapitalizedStatus = staffArray.some(s => s.status && /^[A-Z]/.test(s.status));
            if (hasCapitalizedStatus) {
              updates.staff = staffArray.map(s => ({
                ...s,
                status: s.status ? s.status.toLowerCase() : 'off'
              }));
              needsMigration = true;
            }
          }

          // Ensure notes field exists
          if (!data.notes && !updates.notes) {
            updates.notes = '';
            needsMigration = true;
          }

          // Perform migration if needed
          if (needsMigration) {
            const docRef = doc(db, 'hou_schedules', id);
            await updateDoc(docRef, updates);
            migrated.push({ id, changes: Object.keys(updates) });
          }

        } catch (error) {
          errors.push({ id, error: error.message });
        }
      }

      setSyncProgress({
        total: docs.length,
        current: docs.length,
        status: 'Migration complete!',
        migrated,
        errors
      });

    } catch (error) {
      setSyncProgress(prev => ({
        ...prev,
        status: `Error: ${error.message}`,
        errors: [{ id: 'global', error: error.message }]
      }));
    }
  };

  const handleManageRecurring = () => {
    if (!isCalendarAdmin) {
      alert('Admin access required');
      return;
    }
    setRecurringModalView('list');
    setShowRecurringModal(true);
  };

  const handleAddNewRecurringTech = () => {
    // Show tech selector
    const tech = unifiedTechnicianData[0]; // For now, just use first tech - we'll improve this
    if (tech) {
      openEditRecurringForTech(tech.id);
    }
  };

  const openEditRecurringForTech = (techId) => {
    const tech = unifiedTechnicianData.find(t => t.id === techId);
    if (!tech) return;

    setSelectedTechForRecurring(tech);
    setRecurringRules(tech.recurringRules || []);
    setRecurringModalView('edit');
  };

  const addNewRule = () => {
    const newRule = {
      id: `new_${Date.now()}`,
      days: [],
      status: 'off',
      hours: '',
      frequency: 'every',
      weekAnchor: 1
    };
    setRecurringRules([...recurringRules, newRule]);
  };

  const deleteRule = (ruleId) => {
    if (confirm('Are you sure you want to delete this rule?')) {
      setRecurringRules(recurringRules.filter(r => r.id !== ruleId));
    }
  };

  const updateRule = (ruleId, field, value) => {
    setRecurringRules(recurringRules.map(rule =>
      rule.id === ruleId ? { ...rule, [field]: value } : rule
    ));
  };

  const toggleDay = (ruleId, day) => {
    setRecurringRules(recurringRules.map(rule => {
      if (rule.id === ruleId) {
        const days = Array.isArray(rule.days) ? [...rule.days] : [];
        const index = days.indexOf(day);
        if (index > -1) {
          days.splice(index, 1);
        } else {
          days.push(day);
        }
        return { ...rule, days };
      }
      return rule;
    }));
  };

  const saveRecurringRules = async () => {
    if (!selectedTechForRecurring) return;

    try {
      // Clean up rules - remove the 'id' field and ensure proper structure
      const cleanedRules = recurringRules.map(rule => {
        const cleaned = { ...rule };
        if (cleaned.id && cleaned.id.startsWith('new_')) {
          delete cleaned.id;
        }
        return cleaned;
      });

      await firebaseService.saveRecurringRules(selectedTechForRecurring.id, cleanedRules);
      alert('Recurring rules saved successfully!');

      // Reload data to refresh the calendar
      window.location.reload();
    } catch (error) {
      console.error('Error saving recurring rules:', error);
      alert('Error saving recurring rules. Please try again.');
    }
  };

  const closeRecurringModal = () => {
    setShowRecurringModal(false);
    setRecurringModalView('list');
    setSelectedTechForRecurring(null);
    setRecurringRules([]);
  };

  /**
   * Generate Weekend Report - Show upcoming 4 weekends with staff schedules
   */
  const handleWeekendReport = async () => {
    const today = new Date();
    let currentDay = new Date(today);
    const weekends = [];

    // Find next 4 weekends
    while (weekends.length < 4) {
      if (currentDay.getDay() === 6) { // Saturday
        const saturday = new Date(currentDay);
        const sunday = new Date(currentDay);
        sunday.setDate(sunday.getDate() + 1);
        weekends.push({ saturday, sunday });
      }
      currentDay.setDate(currentDay.getDate() + 1);
    }

    const weekendData = [];

    for (const weekend of weekends) {
      const satSchedules = await firebaseService.getScheduleDataForMonth(
        weekend.saturday.getFullYear(),
        weekend.saturday.getMonth()
      );
      const sunSchedules = await firebaseService.getScheduleDataForMonth(
        weekend.sunday.getFullYear(),
        weekend.sunday.getMonth()
      );

      const satSchedule = await getCalculatedScheduleForDay(weekend.saturday, satSchedules);
      const sunSchedule = await getCalculatedScheduleForDay(weekend.sunday, sunSchedules);

      const workingOnSat = satSchedule.staff.filter(s => s.status === 'on' || s.hours);
      const workingOnSun = sunSchedule.staff.filter(s => s.status === 'on' || s.hours);

      weekendData.push({
        saturday: weekend.saturday,
        sunday: weekend.sunday,
        workingOnSat,
        workingOnSun,
        satNotes: satSchedule.notes,
        sunNotes: sunSchedule.notes
      });
    }

    setWeekendReportData(weekendData);
    setWeekendReportModalOpen(true);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDayClick = (dateObject) => {
    const schedule = getCalculatedScheduleForDay(dateObject, monthlySchedules, unifiedTechnicianData);

    if (isCalendarAdmin) {
      setEditingDate(dateObject);
      setSelectedDaySchedule({ date: dateObject, schedule });
    } else {
      setSelectedDaySchedule({ date: dateObject, schedule });
    }
  };

  const handleSaveSchedule = async () => {
    if (!editingDate) return;

    try {
      // Get notes from textarea
      const notes = document.getElementById('calNotes')?.value?.trim() || '';

      // Get staff data from the form - ONLY save actual overrides
      const staffData = [];

      console.log('🔍 SAVE DEBUG: Starting to process staff items');

      document.querySelectorAll('.staff-item-edit').forEach(item => {
        const staffId = item.dataset.staffId;
        const status = item.querySelector('.status-select')?.value;
        const hours = item.querySelector('.hours-input')?.value?.trim() || '';

        // Find the original staff member from when we opened the modal
        const originalStaff = selectedDaySchedule.schedule.staff.find(s => s.id === staffId);

        if (originalStaff) {
          // Get what the status would be WITHOUT any specific override for this day
          // We need to recalculate from scratch, ignoring the specific override
          const { status: baseStatus, hours: baseHours, source: baseSource } =
            getDefaultStatusForPerson(originalStaff, editingDate);

          console.log(`👤 ${originalStaff.name}:`, {
            formStatus: status,
            formHours: hours,
            baseStatus,
            baseHours,
            baseSource,
            currentStatus: originalStaff.status,
            currentSource: originalStaff.source
          });

          // Only save if the form values differ from the base (non-override) values
          // This allows overriding recurring rules while not saving unnecessary data
          const statusDiffersFromBase = status !== baseStatus;
          const hoursDiffersFromBase = hours !== (baseHours || '');

          if (statusDiffersFromBase || hoursDiffersFromBase) {
            console.log(`✅ SAVING override for ${originalStaff.name}`);
            staffData.push({
              id: staffId,
              status: status,
              hours: hours
            });
          } else {
            console.log(`⏭️  SKIPPING ${originalStaff.name} (matches base)`);
          }
        }
      });

      console.log('💾 Total staff to save:', staffData.length, staffData);

      const scheduleData = {
        date: editingDate,
        staff: staffData,
        notes: notes
      };

      await firebaseService.saveSchedule(scheduleData);
      alert('Schedule saved successfully!');
      loadMonthSchedules();
      closeModal();
    } catch (error) {
      console.error('Error saving schedule:', error);
      alert('Error saving schedule. Please try again.');
    }
  };

  const closeModal = () => {
    setSelectedDaySchedule(null);
    setEditingDate(null);
  };

  const renderMonthView = () => {
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
    const daysInCurrentMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const totalWeeks = Math.ceil((firstDayOfMonth + daysInCurrentMonth) / 7);

    const weeks = [];
    let dayCounter = 1;

    for (let week = 0; week < totalWeeks; week++) {
      const days = [];
      for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
        if ((week === 0 && dayOfWeek < firstDayOfMonth) || dayCounter > daysInCurrentMonth) {
          days.push(<td key={dayOfWeek} className="other-month"></td>);
        } else {
          const cellDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), dayCounter);
          days.push(renderDayCell(cellDate, dayCounter));
          dayCounter++;
        }
      }
      weeks.push(<tr key={week}>{days}</tr>);
    }

    return (
      <table className="calendar-table">
        <thead>
          <tr>
            <th>Sun</th>
            <th>Mon</th>
            <th>Tue</th>
            <th>Wed</th>
            <th>Thu</th>
            <th>Fri</th>
            <th>Sat</th>
          </tr>
        </thead>
        <tbody>{weeks}</tbody>
      </table>
    );
  };

  const renderDayCell = (dateObject, dayOfMonth) => {
    const dayKey = dateObject.getDay();
    const isWeekend = dayKey === 0 || dayKey === 6;
    const isToday = dateObject.toDateString() === new Date().toDateString();
    const holidayName = getHolidayName(dateObject);

    const schedule = getCalculatedScheduleForDay(dateObject, monthlySchedules, unifiedTechnicianData);

    const offStatuses = ['off', 'sick', 'vacation', 'no-call-no-show'];
    const staffToDisplay = schedule.staff.filter(s => {
      if (isWeekend) {
        return s.status === 'on' || s.hours;
      } else {
        return offStatuses.includes(s.status) || s.hours;
      }
    });

    let cellClasses = '';
    if (isToday) cellClasses += ' today';
    if (isWeekend) cellClasses += ' weekend';
    if (holidayName) cellClasses += ' holiday';

    return (
      <td
        key={dayOfMonth}
        className={cellClasses}
        onClick={() => handleDayClick(dateObject)}
        style={{ cursor: 'pointer' }}
      >
        <div className="date-header">
          <div className="date-number">{dayOfMonth}</div>
          {holidayName && <div className="holiday-label">{holidayName}</div>}
        </div>

        {staffToDisplay.length > 0 && (
          <div className="staff-grid">
            {staffToDisplay.slice(0, 4).map((staffEntry, idx) => (
              <div
                key={idx}
                className={`staff-compact staff-${staffEntry.status.replace(' ', '-')} ${staffEntry.hours ? 'staff-custom-hours' : ''}`}
              >
                <div className="staff-name">{formatNameCompact(staffEntry.name)}</div>
                {staffEntry.hours && <div className="staff-shift-info staff-shift-custom">{staffEntry.hours}</div>}
                {!staffEntry.hours && staffEntry.status !== 'on' && staffEntry.status !== 'off' && (
                  <div className="staff-shift-info">{staffEntry.status.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}</div>
                )}
              </div>
            ))}
            {staffToDisplay.length > 4 && (
              <div className="more-indicator">+{staffToDisplay.length - 4} more</div>
            )}
          </div>
        )}

        {schedule.notes && (
          <div className="direct-note-display" title={schedule.notes}>
            {schedule.notes}
          </div>
        )}
      </td>
    );
  };

  const renderScheduleModal = () => {
    if (!selectedDaySchedule) return null;

    const { date, schedule } = selectedDaySchedule;
    const dateString = `${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    const isWeekend = [0, 6].includes(date.getDay());
    const offStatuses = ['off', 'sick', 'vacation', 'no-call-no-show'];

    const formatStatus = (s) => {
      let statusText = s.status.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      if (s.hours) statusText += ` (${s.hours})`;
      return statusText;
    };

    // If admin and editing, show edit modal
    if (isCalendarAdmin && editingDate) {
      // Sort staff: priority to those with special statuses or custom hours
      const sortedStaff = [...schedule.staff].sort((a, b) => {
        const aIsPriority = offStatuses.includes(a.status) || a.source === 'Recurring Rule' || a.hours;
        const bIsPriority = offStatuses.includes(b.status) || b.source === 'Recurring Rule' || b.hours;

        if (aIsPriority && !bIsPriority) return -1;
        if (!aIsPriority && bIsPriority) return 1;
        return a.name.localeCompare(b.name);
      });

      return (
        <div className="modal-overlay active" onClick={closeModal}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Schedule for {dateString}</h3>
              <button className="modal-close" onClick={closeModal}>
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="modal-body">
              <div className="edit-modal-layout-stacked">
                <div className="form-group">
                  <label htmlFor="staffSearchInput">Search Staff (Overrides for this day)</label>
                  <input
                    type="text"
                    id="staffSearchInput"
                    className="form-control"
                    placeholder="Start typing a name..."
                    onChange={(e) => {
                      const searchTerm = e.target.value.toLowerCase();
                      document.querySelectorAll('.staff-item-edit').forEach(item => {
                        const staffName = item.querySelector('.staff-name-container').textContent.toLowerCase();
                        item.style.display = staffName.includes(searchTerm) ? 'flex' : 'none';
                      });
                    }}
                  />
                </div>

                <div className="staff-list-section">
                  {sortedStaff.map((staff, idx) => (
                    <div key={staff.id || idx} className="staff-item-edit" data-staff-id={staff.id}>
                      <span className="staff-name-container">
                        {staff.name}
                        {staff.source && (
                          <span className={`status-source-badge source-${(staff.source || '').toLowerCase().replace(/ /g, '-')}`}>
                            {staff.source}
                          </span>
                        )}
                      </span>
                      <div className="staff-controls">
                        <input
                          type="text"
                          className="hours-input"
                          placeholder="Notes..."
                          defaultValue={staff.hours || ''}
                          autoComplete="off"
                        />
                        <select className="status-select" defaultValue={staff.status}>
                          <option value="on">On</option>
                          <option value="off">Off</option>
                          <option value="sick">Sick</option>
                          <option value="vacation">Vacation</option>
                          <option value="no-call-no-show">No Call No Show</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="form-group notes-section-stacked">
                  <label htmlFor="calNotes">Notes for this day:</label>
                  <textarea
                    id="calNotes"
                    className="form-control"
                    defaultValue={schedule.notes || ''}
                    rows="4"
                  />
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeModal}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSaveSchedule}>
                <i className="fas fa-save"></i> Save Schedule
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Otherwise show view-only modal
    const primaryHeaderText = isWeekend ? "Working Today" : "Scheduled Off / Custom";
    const secondaryHeaderText = isWeekend ? "Scheduled Off" : "Working Today";

    const primaryList = schedule.staff.filter(s =>
      isWeekend ? (s.status === 'on' || s.hours) : (offStatuses.includes(s.status) || s.hours)
    );
    const secondaryList = schedule.staff.filter(s =>
      isWeekend ? (offStatuses.includes(s.status) && !s.hours) : (s.status === 'on' && !s.hours)
    );

    return (
      <div className="modal-overlay active" onClick={closeModal}>
        <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>{dateString}</h3>
            <button className="modal-close" onClick={closeModal}>
              <i className="fas fa-times"></i>
            </button>
          </div>

          <div className="modal-body">
            <div className="view-content">
              <h3>Notes:</h3>
              <div className="view-notes">
                {schedule.notes || 'No notes for this day.'}
              </div>

              <h3>{primaryHeaderText}</h3>
              <div className="view-staff-list">
                {primaryList.length > 0 ? (
                  primaryList.map((s, idx) => (
                    <div key={idx} className={`view-staff-item status-${s.status}`}>
                      <strong>{s.name}:</strong> {formatStatus(s)}
                    </div>
                  ))
                ) : (
                  <p className="no-entries">None</p>
                )}
              </div>

              <h3>{secondaryHeaderText}</h3>
              <div className="view-staff-list">
                {secondaryList.length > 0 ? (
                  secondaryList.map((s, idx) => (
                    <div key={idx} className={`view-staff-item status-${s.status}`}>
                      <strong>{s.name}:</strong> {formatStatus(s)}
                    </div>
                  ))
                ) : (
                  <p className="no-entries">None</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderRecurringModal = () => {
    if (!showRecurringModal) return null;

    if (recurringModalView === 'list') {
      // Show list of techs with recurring rules
      const techsWithRules = unifiedTechnicianData.filter(tech =>
        tech.recurringRules && tech.recurringRules.length > 0
      );

      return (
        <div className="modal-overlay active" onClick={closeRecurringModal}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Manage Recurring Schedules</h3>
              <button className="modal-close" onClick={closeRecurringModal}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="recurring-tech-list">
                {techsWithRules.length > 0 ? (
                  techsWithRules.map(tech => (
                    <div
                      key={tech.id}
                      className="recurring-tech-item"
                      onClick={() => openEditRecurringForTech(tech.id)}
                      style={{ cursor: 'pointer', padding: '12px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      <span style={{ fontWeight: '600' }}>{tech.name}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        {tech.recurringRules.length} active rule(s) <i className="fas fa-chevron-right"></i>
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="no-entries">No custom recurring schedules found.</p>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeRecurringModal}>
                Close
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  // Show tech selector - for now show a simple prompt
                  const techName = prompt('Enter technician name to add recurring schedule:');
                  if (techName) {
                    const tech = unifiedTechnicianData.find(t =>
                      t.name.toLowerCase().includes(techName.toLowerCase())
                    );
                    if (tech) {
                      openEditRecurringForTech(tech.id);
                    } else {
                      alert('Technician not found');
                    }
                  }
                }}
              >
                <i className="fas fa-plus"></i> Add New
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Edit view for specific tech
    if (recurringModalView === 'edit' && selectedTechForRecurring) {
      const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

      return (
        <div className="modal-overlay active" onClick={closeRecurringModal}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px' }}>
            <div className="modal-header">
              <h3>Recurring Schedule for {selectedTechForRecurring.name}</h3>
              <button className="modal-close" onClick={closeRecurringModal}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <div id="recurring-rules-container">
                {recurringRules.map((rule, index) => (
                  <div key={rule.id || index} className="rule-item" style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '16px',
                    marginBottom: '16px',
                    backgroundColor: 'var(--card-bg)'
                  }}>
                    <div className="rule-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
                      <span style={{ fontWeight: '600' }}>Rule {index + 1}</span>
                      <button
                        className="btn btn-danger btn-small"
                        onClick={() => deleteRule(rule.id)}
                        style={{ padding: '4px 8px', fontSize: '0.85rem' }}
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </div>
                    <div className="rule-body">
                      <div className="form-group" style={{ marginBottom: '12px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>For these days:</label>
                        <div className="day-selector" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {daysOfWeek.map((day, i) => (
                            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', padding: '6px 12px', border: '1px solid var(--border-color)', borderRadius: '4px', backgroundColor: rule.days?.includes(i) ? 'var(--primary-color)' : 'white', color: rule.days?.includes(i) ? 'white' : 'inherit' }}>
                              <input
                                type="checkbox"
                                checked={rule.days?.includes(i) || false}
                                onChange={() => toggleDay(rule.id, i)}
                                style={{ margin: 0 }}
                              />
                              {day}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                        <div className="form-group">
                          <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600' }}>Set Status to:</label>
                          <select
                            className="form-control"
                            value={rule.status}
                            onChange={(e) => updateRule(rule.id, 'status', e.target.value)}
                          >
                            <option value="on">On</option>
                            <option value="off">Off</option>
                            <option value="sick">Sick</option>
                            <option value="vacation">Vacation</option>
                            <option value="no-call-no-show">No Call No Show</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600' }}>With Hours (optional):</label>
                          <input
                            type="text"
                            className="form-control"
                            placeholder="e.g., 9-5"
                            value={rule.hours || ''}
                            onChange={(e) => updateRule(rule.id, 'hours', e.target.value)}
                          />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div className="form-group">
                          <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600' }}>Frequency:</label>
                          <select
                            className="form-control"
                            value={rule.frequency}
                            onChange={(e) => updateRule(rule.id, 'frequency', e.target.value)}
                          >
                            <option value="every">Every Week</option>
                            <option value="every-other">Every Other Week</option>
                          </select>
                        </div>
                        {rule.frequency === 'every-other' && (
                          <div className="form-group">
                            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600' }}>Starting on:</label>
                            <select
                              className="form-control"
                              value={rule.weekAnchor || 1}
                              onChange={(e) => updateRule(rule.id, 'weekAnchor', parseInt(e.target.value))}
                            >
                              <option value="1">Week 1 (Odd)</option>
                              <option value="2">Week 2 (Even)</option>
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  className="btn btn-outline"
                  onClick={addNewRule}
                  style={{ width: '100%' }}
                >
                  <i className="fas fa-plus"></i> Add New Rule
                </button>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setRecurringModalView('list')}>
                <i className="fas fa-arrow-left"></i> Back to List
              </button>
              <button className="btn btn-primary" onClick={saveRecurringRules}>
                <i className="fas fa-save"></i> Save Changes
              </button>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  if (dataLoading || loading) {
    return (
      <Layout>
        <div className="tab-content active">
          <div className="loading">
            <i className="fas fa-spinner fa-spin"></i> Loading calendar...
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="tab-content active">
        {/* Top Action Buttons */}
        <div className="tab-header">
          <div className="tab-controls">
            <div className="calendar-actions">
              <button
                className="btn btn-success"
                onClick={handleSyncWithRippling}
                disabled={!isCalendarAdmin}
                title={!isCalendarAdmin ? 'Admin access required' : 'Sync schedule with Rippling'}
              >
                <i className="fas fa-sync"></i> Sync with Rippling
              </button>
              <button
                className="btn btn-primary"
                onClick={runDataMigration}
                style={{ backgroundColor: '#4CAF50', borderColor: '#4CAF50' }}
                title="ONE-TIME: Sync React format to Vanilla JS format (migrates all schedule data)"
              >
                <i className="fas fa-database"></i> Sync Calendar Data
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleManageRecurring}
                disabled={!isCalendarAdmin}
                title={!isCalendarAdmin ? 'Admin access required' : 'Manage recurring schedules'}
              >
                <i className="fas fa-sync-alt"></i> Manage Recurring
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleWeekendReport}
              >
                <i className="fas fa-file-alt"></i> Weekend Report
              </button>
              <button
                className="btn btn-primary"
                onClick={handlePrint}
              >
                <i className="fas fa-print"></i> Print
              </button>
            </div>
            <div className="calendar-auth-container">
              {!isCalendarAdmin ? (
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowAdminModal(true)}
                >
                  <i className="fas fa-lock"></i> Admin Login
                </button>
              ) : (
                <button
                  className="btn btn-secondary"
                  onClick={handleAdminLogout}
                >
                  <i className="fas fa-sign-out-alt"></i> Logout
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Calendar Controls */}
        <div className="tab-header">
          <div className="calendar-controls">
            <button className="btn btn-secondary" onClick={() => navigate(-1)}>
              <i className="fas fa-chevron-left"></i> Prev
            </button>
            <h2 id="calCurrentDate">
              {currentView === 'month' && `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`}
              {currentView === 'week' && currentDate.toLocaleDateString()}
              {currentView === 'day' && currentDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </h2>
            <button className="btn btn-secondary" onClick={() => navigate(1)}>
              Next <i className="fas fa-chevron-right"></i>
            </button>
          </div>
          <div className="calendar-view-switcher">
            <button
              className={`btn btn-small ${currentView === 'day' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => switchView('day')}
            >
              Day
            </button>
            <button
              className={`btn btn-small ${currentView === 'week' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => switchView('week')}
            >
              Week
            </button>
            <button
              className={`btn btn-small ${currentView === 'month' ? 'btn-primary active' : 'btn-secondary'}`}
              onClick={() => switchView('month')}
            >
              Month
            </button>
          </div>
        </div>

        {/* Admin Status Indicator */}
        {isCalendarAdmin && (
          <div className="card" style={{ marginBottom: '16px', backgroundColor: 'var(--status-resolved-bg)', borderLeft: '4px solid var(--success-color)' }}>
            <div style={{ padding: '12px 16px' }}>
              <i className="fas fa-user-shield" style={{ color: 'var(--success-color)', marginRight: '8px' }}></i>
              <strong>Calendar Admin Mode Active</strong> - Click on any day to edit schedules
            </div>
          </div>
        )}

        {/* Calendar Display */}
        <div id="calendarContainer" className="calendar-container">
          {currentView === 'month' && renderMonthView()}
          {currentView === 'week' && (
            <div className="week-view-container">
              <p className="no-entries">Week view coming soon - will show detailed daily schedules for the selected week.</p>
            </div>
          )}
          {currentView === 'day' && (
            <div className="day-view-container">
              <p className="no-entries">Day view coming soon - will show hourly breakdown and detailed staff assignments.</p>
            </div>
          )}
        </div>

        {/* Schedule Modal */}
        {renderScheduleModal()}

        {/* Recurring Schedules Modal */}
        {renderRecurringModal()}

        {/* Admin Login Modal */}
        {showAdminModal && (
          <div className="modal-overlay active" onClick={() => setShowAdminModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Calendar Admin Login</h3>
                <button className="modal-close" onClick={() => setShowAdminModal(false)}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="calPassword">Password:</label>
                  <input
                    type="password"
                    id="calPassword"
                    className="form-control"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAdminLogin()}
                    placeholder="Enter admin password"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowAdminModal(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleAdminLogin}>
                  <i className="fas fa-sign-in-alt"></i> Login
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sync Data Modal */}
        {syncModalOpen && (
          <div className="modal-overlay active" style={{ zIndex: 9999 }}>
            <div className="modal" style={{ maxWidth: '600px', maxHeight: '80vh', overflow: 'auto' }}>
              <div className="modal-header">
                <h3><i className="fas fa-database"></i> Calendar Data Sync</h3>
                <button className="modal-close" onClick={() => setSyncModalOpen(false)}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="modal-body">
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ marginBottom: '10px' }}>Status: {syncProgress.status}</h4>
                  {syncProgress.total > 0 && (
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                        <span>Progress:</span>
                        <span>{syncProgress.current} / {syncProgress.total}</span>
                      </div>
                      <div style={{ width: '100%', backgroundColor: '#e0e0e0', borderRadius: '4px', height: '20px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${(syncProgress.current / syncProgress.total) * 100}%`,
                            backgroundColor: '#4CAF50',
                            height: '100%',
                            transition: 'width 0.3s'
                          }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>

                {syncProgress.migrated.length > 0 && (
                  <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#e8f5e9', borderRadius: '4px', border: '1px solid #4CAF50' }}>
                    <h4 style={{ color: '#2e7d32', marginBottom: '10px' }}>
                      <i className="fas fa-check-circle"></i> Successfully Migrated: {syncProgress.migrated.length}
                    </h4>
                    <div style={{ maxHeight: '200px', overflow: 'auto', fontSize: '12px' }}>
                      {syncProgress.migrated.map((item, idx) => (
                        <div key={idx} style={{ padding: '5px', borderBottom: '1px solid #c8e6c9' }}>
                          <strong>{item.id}</strong>: {item.changes.join(', ')}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {syncProgress.errors.length > 0 && (
                  <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#ffebee', borderRadius: '4px', border: '1px solid #f44336' }}>
                    <h4 style={{ color: '#c62828', marginBottom: '10px' }}>
                      <i className="fas fa-exclamation-triangle"></i> Errors: {syncProgress.errors.length}
                    </h4>
                    <div style={{ maxHeight: '200px', overflow: 'auto', fontSize: '12px' }}>
                      {syncProgress.errors.map((item, idx) => (
                        <div key={idx} style={{ padding: '5px', borderBottom: '1px solid #ffcdd2' }}>
                          <strong>{item.id}</strong>: {item.error}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {syncProgress.status === 'Migration complete!' && (
                  <div style={{ textAlign: 'center', padding: '20px', backgroundColor: '#e8f5e9', borderRadius: '4px', border: '1px solid #4CAF50' }}>
                    <i className="fas fa-check-circle" style={{ fontSize: '48px', color: '#4CAF50', marginBottom: '10px' }}></i>
                    <h3 style={{ color: '#2e7d32' }}>Sync Complete!</h3>
                    <p>Your calendar data has been synchronized with the Vanilla JS format.</p>
                    <p style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
                      <strong>What was synced:</strong><br />
                      • Status values converted to lowercase<br />
                      • Date fields converted to Firebase Timestamps<br />
                      • Field names standardized<br />
                      • Missing notes fields added
                    </p>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                {syncProgress.status === 'Migration complete!' ? (
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setSyncModalOpen(false);
                      window.location.reload();
                    }}
                  >
                    <i className="fas fa-check"></i> Close & Reload
                  </button>
                ) : (
                  <button
                    className="btn btn-secondary"
                    onClick={() => setSyncModalOpen(false)}
                    disabled={syncProgress.status !== 'Migration complete!' && syncProgress.total > 0}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Weekend Report Modal */}
        {weekendReportModalOpen && weekendReportData && (
          <div className="modal-overlay active" style={{ zIndex: 9999 }}>
            <div className="modal" style={{ maxWidth: '800px', maxHeight: '80vh', overflow: 'auto' }}>
              <div className="modal-header">
                <h3><i className="fas fa-file-alt"></i> Weekend Report</h3>
                <button className="modal-close" onClick={() => setWeekendReportModalOpen(false)}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="modal-body">
                <div className="weekend-report-container">
                  <div className="report-header" style={{ marginBottom: '20px', borderBottom: '2px solid #ddd', paddingBottom: '10px' }}>
                    <h2 style={{ margin: '0 0 10px 0' }}>Upcoming Weekend Schedule</h2>
                    <p className="date-range" style={{ color: '#666', margin: 0 }}>
                      For the period of {weekendReportData[0].saturday.toLocaleDateString()} to {weekendReportData[weekendReportData.length - 1].sunday.toLocaleDateString()}
                    </p>
                  </div>

                  {weekendReportData.map((weekend, idx) => (
                    <div key={idx} className="weekend-group" style={{ marginBottom: '30px', padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        <div className="day-group" style={{ padding: '10px', backgroundColor: 'white', borderRadius: '4px' }}>
                          <h4 style={{ marginTop: 0, color: '#333', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>
                            Saturday, {weekend.saturday.toLocaleDateString()}
                          </h4>
                          {weekend.workingOnSat.length > 0 ? (
                            weekend.workingOnSat.map((s, i) => (
                              <p key={i} style={{ margin: '5px 0', padding: '5px', backgroundColor: '#e3f2fd', borderRadius: '3px' }}>
                                <strong>{s.name}</strong> {s.hours ? `(${s.hours})` : ''}
                              </p>
                            ))
                          ) : (
                            <p style={{ color: '#999', fontStyle: 'italic' }}>No one scheduled.</p>
                          )}
                          {weekend.satNotes && (
                            <p className="notes" style={{ marginTop: '10px', padding: '8px', backgroundColor: '#fff9c4', borderRadius: '3px', fontSize: '14px' }}>
                              <strong>Notes:</strong> {weekend.satNotes}
                            </p>
                          )}
                        </div>

                        <div className="day-group" style={{ padding: '10px', backgroundColor: 'white', borderRadius: '4px' }}>
                          <h4 style={{ marginTop: 0, color: '#333', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>
                            Sunday, {weekend.sunday.toLocaleDateString()}
                          </h4>
                          {weekend.workingOnSun.length > 0 ? (
                            weekend.workingOnSun.map((s, i) => (
                              <p key={i} style={{ margin: '5px 0', padding: '5px', backgroundColor: '#e3f2fd', borderRadius: '3px' }}>
                                <strong>{s.name}</strong> {s.hours ? `(${s.hours})` : ''}
                              </p>
                            ))
                          ) : (
                            <p style={{ color: '#999', fontStyle: 'italic' }}>No one scheduled.</p>
                          )}
                          {weekend.sunNotes && (
                            <p className="notes" style={{ marginTop: '10px', padding: '8px', backgroundColor: '#fff9c4', borderRadius: '3px', fontSize: '14px' }}>
                              <strong>Notes:</strong> {weekend.sunNotes}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-primary" onClick={() => window.print()}>
                  <i className="fas fa-print"></i> Print
                </button>
                <button className="btn btn-secondary" onClick={() => setWeekendReportModalOpen(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Rippling Sync Modal */}
        {ripplingModalOpen && (
          <div className="modal-overlay active" style={{ zIndex: 9999 }}>
            <div className="modal" style={{ maxWidth: '600px', maxHeight: '80vh', overflow: 'auto' }}>
              <div className="modal-header">
                <h3><i className="fas fa-sync"></i> {ripplingStatus.message}</h3>
                <button className="modal-close" onClick={() => setRipplingModalOpen(false)}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="modal-body">
                {ripplingStatus.loading && (
                  <div style={{ textAlign: 'center', padding: '20px' }}>
                    <i className="fas fa-spinner fa-spin" style={{ fontSize: '48px', color: '#2196F3', marginBottom: '10px' }}></i>
                    <p>{ripplingStatus.message}</p>
                  </div>
                )}

                {!ripplingStatus.loading && ripplingStatus.log && (
                  <div dangerouslySetInnerHTML={{ __html: ripplingStatus.log }} />
                )}
              </div>
              <div className="modal-footer">
                {!ripplingStatus.loading && (
                  <>
                    {ripplingStatus.message === 'Sync Complete!' && (
                      <button
                        className="btn btn-primary"
                        onClick={() => {
                          setRipplingModalOpen(false);
                          window.location.reload();
                        }}
                      >
                        <i className="fas fa-check"></i> Close & Reload
                      </button>
                    )}
                    <button
                      className="btn btn-secondary"
                      onClick={() => setRipplingModalOpen(false)}
                    >
                      Close
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Calendar;
