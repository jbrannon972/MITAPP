import { useState, useEffect } from 'react';
import Layout from '../components/common/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import firebaseService from '../services/firebaseService';
import { getCalculatedScheduleForDay, getHolidayName, formatNameCompact, getDefaultStatusForPerson } from '../utils/calendarManager';
import { collection, getDocs, doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
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
  const [weekendReportModalOpen, setWeekendReportModalOpen] = useState(false);
  const [weekendReportData, setWeekendReportData] = useState(null);
  const [ripplingModalOpen, setRipplingModalOpen] = useState(false);
  const [ripplingStatus, setRipplingStatus] = useState({ loading: false, message: '', log: '' });
  const [sendReportModalOpen, setSendReportModalOpen] = useState(false);
  const [sendReportRecipients, setSendReportRecipients] = useState([]);
  const [sendReportStatus, setSendReportStatus] = useState({ loading: false, message: '', error: '' });
  const [availableRecipients, setAvailableRecipients] = useState([]);

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
      console.log('📥 Loaded schedules for month:', schedules);
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

      // Convert to array if needed and iterate
      const eventsArray = Array.isArray(vevents) ? vevents : Array.from(vevents || []);

      for (const event of eventsArray) {
        const summary = event.getFirstPropertyValue('summary');
        if (!summary) continue;

        const employeeName = summary.split(' on ')[0].trim();

        let staffMember = allStaff.find(s => s.name && s.name.toLowerCase() === employeeName.toLowerCase());

        if (staffMember) {
          const startDate = event.getFirstPropertyValue('dtstart').toJSDate();
          const endDate = event.getFirstPropertyValue('dtend').toJSDate();

          // Create a proper date loop to avoid mutation issues
          const currentDate = new Date(startDate);
          while (currentDate < endDate) {
            const dateString = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;

            // Check if vacation entry already exists
            const docRef = doc(db, 'hou_schedules', dateString);
            const docSnap = await getDoc(docRef);
            const existingData = docSnap.exists() ? docSnap.data() : {};
            const staffEntry = existingData.staff?.find(s => s.id === staffMember.id && s.status === 'vacation');

            if (!staffEntry) {
              logHtml += `<p>Staging update for <strong>${staffMember.name}</strong> on ${dateString}.</p>`;
              updatesStaged++;

              // Update document with vacation status
              const updatedStaff = existingData.staff || [];
              updatedStaff.push({ id: staffMember.id, status: 'vacation', hours: '', source: 'Rippling' });

              await setDoc(docRef, {
                date: Timestamp.fromDate(new Date(currentDate)),
                staff: updatedStaff,
                notes: existingData.notes || ''
              }, { merge: true });
            }

            // Move to next day
            currentDate.setDate(currentDate.getDate() + 1);
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

      const satSchedule = getCalculatedScheduleForDay(weekend.saturday, satSchedules, unifiedTechnicianData);
      const sunSchedule = getCalculatedScheduleForDay(weekend.sunday, sunSchedules, unifiedTechnicianData);

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
    document.body.classList.add('report-printing');
  };

  const closeWeekendReport = () => {
    setWeekendReportModalOpen(false);
    document.body.classList.remove('report-printing');
  };

  /**
   * Open Send Weekend Report Modal - allows selecting recipients
   */
  const handleOpenSendReportModal = () => {
    // Build list of available recipients from staffing data
    const recipients = [];

    // Add management
    unifiedTechnicianData.forEach(tech => {
      if (tech.email) {
        recipients.push({
          id: tech.id,
          name: tech.name,
          email: tech.email,
          selected: false
        });
      }
    });

    // Remove duplicates by email
    const uniqueRecipients = recipients.filter((r, index, self) =>
      index === self.findIndex(t => t.email.toLowerCase() === r.email.toLowerCase())
    );

    setAvailableRecipients(uniqueRecipients);
    setSendReportRecipients([]);
    setSendReportStatus({ loading: false, message: '', error: '' });
    setSendReportModalOpen(true);
  };

  const toggleRecipient = (email) => {
    setSendReportRecipients(prev => {
      if (prev.includes(email)) {
        return prev.filter(e => e !== email);
      } else {
        return [...prev, email];
      }
    });
  };

  const selectAllRecipients = () => {
    setSendReportRecipients(availableRecipients.map(r => r.email));
  };

  const deselectAllRecipients = () => {
    setSendReportRecipients([]);
  };

  const handleSendWeekendReport = async () => {
    if (sendReportRecipients.length === 0) {
      alert('Please select at least one recipient');
      return;
    }

    setSendReportStatus({ loading: true, message: 'Sending weekend report...', error: '' });

    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('You must be logged in to send reports');
      }

      const token = await user.getIdToken();

      const response = await fetch('https://us-central1-mit-foreasting.cloudfunctions.net/sendWeekendReportManual', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          recipients: sendReportRecipients
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send report');
      }

      setSendReportStatus({
        loading: false,
        message: `Weekend report sent successfully to ${result.recipientCount} recipient(s)!`,
        error: ''
      });
    } catch (error) {
      console.error('Error sending weekend report:', error);
      setSendReportStatus({
        loading: false,
        message: '',
        error: error.message
      });
    }
  };

  const closeSendReportModal = () => {
    setSendReportModalOpen(false);
    setSendReportStatus({ loading: false, message: '', error: '' });
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDayClick = (dateObject) => {
    console.log(`🖱️ Opening day: ${dateObject.toDateString()} (Day ${dateObject.getDate()})`);

    const specificDayData = monthlySchedules.specific[dateObject.getDate()];
    console.log(`  📂 Raw data from Firestore for day ${dateObject.getDate()}:`, specificDayData);
    if (specificDayData) {
      console.log(`    - Staff overrides in DB: ${specificDayData.staff?.length || 0}`);
      if (specificDayData.staff && specificDayData.staff.length > 0) {
        specificDayData.staff.forEach(s => {
          console.log(`      - ${s.id}: status=${s.status}, hours=${s.hours || 'none'}`);
        });
      }
      console.log(`    - Notes in DB: ${specificDayData.notes ? `"${specificDayData.notes}"` : 'none'}`);
    } else {
      console.log(`    - No specific data in DB for this day`);
    }

    const schedule = getCalculatedScheduleForDay(dateObject, monthlySchedules, unifiedTechnicianData);
    console.log(`  📊 Calculated schedule has ${schedule.staff.length} total staff members`);
    const overriddenStaff = schedule.staff.filter(s => s.source === 'Specific Override');
    console.log(`  ✏️ Of those, ${overriddenStaff.length} have specific overrides:`);
    overriddenStaff.forEach(s => {
      console.log(`      - ${s.name}: status=${s.status}, hours=${s.hours || 'none'}`);
    });

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

      // Collect ALL staff from the form whose status differs from their BASE status
      // This matches the vanilla JS behavior exactly:
      // - We iterate through all staff visible in the form
      // - For each, we compare the CURRENT dropdown value to the BASE (default) status
      // - If different, we include them in the save
      // - This correctly preserves existing overrides because:
      //   - The modal shows current status (including existing overrides)
      //   - So existing overrides will still differ from base and get re-saved
      const staffData = [];

      console.log('🔍 SAVE DEBUG: Processing all staff items from form');
      console.log('  editingDate:', editingDate.toDateString());

      const staffItems = document.querySelectorAll('.staff-item-edit');
      console.log(`  Found ${staffItems.length} staff items in DOM`);

      staffItems.forEach((item, index) => {
        const staffId = item.dataset.staffId;
        const statusSelect = item.querySelector('.status-select');
        const hoursInput = item.querySelector('.hours-input');

        if (!statusSelect) {
          console.log(`  ⚠️ Staff item ${index}: No status-select found!`);
          return;
        }

        const status = statusSelect.value;
        const hours = hoursInput?.value?.trim() || '';

        // Find the staff member from unifiedTechnicianData to get their recurring rules
        const technicianData = unifiedTechnicianData.find(t => t.id === staffId);

        if (!technicianData) {
          console.log(`  ⚠️ Staff ${staffId}: Not found in unifiedTechnicianData`);
          return;
        }

        // Get the BASE status (what this person would be WITHOUT any specific override)
        const { status: baseStatus, hours: baseHours } = getDefaultStatusForPerson(technicianData, editingDate);

        console.log(`  👤 ${technicianData.name}:`, {
          formStatus: status,
          formHours: hours,
          baseStatus,
          baseHours: baseHours || '(empty)'
        });

        // Only include if the form values differ from base
        // This is EXACTLY how vanilla JS does it
        if (status !== baseStatus || hours !== (baseHours || '')) {
          console.log(`    ✅ SAVING (differs from base)`);
          staffData.push({
            id: staffId,
            status: status,
            hours: hours
          });
        } else {
          console.log(`    ⏭️ SKIPPING (matches base)`);
        }
      });

      console.log(`💾 Total staff to save: ${staffData.length}`);
      staffData.forEach(s => console.log(`  - ${s.id}: ${s.status} ${s.hours ? `(${s.hours})` : ''}`));

      // Build the schedule payload - EXACTLY like vanilla JS does
      const schedulePayload = {
        date: editingDate,
        staff: staffData,  // Always include staff array, even if empty
        notes: notes
      };

      console.log('📤 Sending to firebaseService.saveSchedule:', schedulePayload);

      await firebaseService.saveSchedule(schedulePayload);
      console.log('🔄 Reloading month schedules...');
      await loadMonthSchedules();
      console.log('✅ Month schedules reloaded');
      alert('Schedule saved successfully!');
      closeModal();
    } catch (error) {
      console.error('Error saving schedule:', error);
      alert('Error saving schedule: ' + error.message);
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
                className="btn btn-info"
                onClick={handleOpenSendReportModal}
                disabled={!isCalendarAdmin}
                title={!isCalendarAdmin ? 'Admin access required' : 'Email weekend report to selected users'}
              >
                <i className="fas fa-envelope"></i> Send Report
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

        {/* Weekend Report Modal */}
        {weekendReportModalOpen && weekendReportData && (
          <div className="modal-overlay active" style={{ zIndex: 9999 }}>
            <div className="modal" style={{ maxWidth: '800px', maxHeight: '80vh', overflow: 'auto' }}>
              <div className="modal-header">
                <h3><i className="fas fa-file-alt"></i> Weekend Report</h3>
                <button className="modal-close" onClick={closeWeekendReport}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="modal-body">
                <div className="weekend-report-container">
                  <div className="report-header">
                    <h2>Upcoming Weekend Schedule</h2>
                    <p className="date-range">
                      For the period of {weekendReportData[0].saturday.toLocaleDateString()} to {weekendReportData[weekendReportData.length - 1].sunday.toLocaleDateString()}
                    </p>
                  </div>

                  {weekendReportData.map((weekend, idx) => (
                    <div key={idx} className="weekend-group">
                      <div className="day-group">
                        <h4>Saturday, {weekend.saturday.toLocaleDateString()}</h4>
                        {weekend.workingOnSat.length > 0 ? (
                          weekend.workingOnSat.map((s, i) => (
                            <p key={i}>{s.name} {s.hours ? `(${s.hours})` : ''}</p>
                          ))
                        ) : (
                          <p>No one scheduled.</p>
                        )}
                        {weekend.satNotes && (
                          <p className="notes">Notes: {weekend.satNotes}</p>
                        )}
                      </div>

                      <div className="day-group">
                        <h4>Sunday, {weekend.sunday.toLocaleDateString()}</h4>
                        {weekend.workingOnSun.length > 0 ? (
                          weekend.workingOnSun.map((s, i) => (
                            <p key={i}>{s.name} {s.hours ? `(${s.hours})` : ''}</p>
                          ))
                        ) : (
                          <p>No one scheduled.</p>
                        )}
                        {weekend.sunNotes && (
                          <p className="notes">Notes: {weekend.sunNotes}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-primary" onClick={() => window.print()}>
                  <i className="fas fa-print"></i> Print
                </button>
                <button className="btn btn-secondary" onClick={closeWeekendReport}>
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

        {/* Send Weekend Report Modal */}
        {sendReportModalOpen && (
          <div className="modal-overlay active" style={{ zIndex: 9999 }}>
            <div className="modal" style={{ maxWidth: '600px', maxHeight: '80vh', overflow: 'auto' }}>
              <div className="modal-header">
                <h3><i className="fas fa-envelope"></i> Send Weekend Report</h3>
                <button className="modal-close" onClick={closeSendReportModal}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="modal-body">
                {sendReportStatus.loading ? (
                  <div style={{ textAlign: 'center', padding: '20px' }}>
                    <i className="fas fa-spinner fa-spin" style={{ fontSize: '48px', color: '#2196F3', marginBottom: '10px' }}></i>
                    <p>{sendReportStatus.message}</p>
                  </div>
                ) : sendReportStatus.message ? (
                  <div style={{ textAlign: 'center', padding: '20px' }}>
                    <i className="fas fa-check-circle" style={{ fontSize: '48px', color: '#4CAF50', marginBottom: '10px' }}></i>
                    <p style={{ color: '#4CAF50', fontWeight: '600' }}>{sendReportStatus.message}</p>
                  </div>
                ) : sendReportStatus.error ? (
                  <div style={{ textAlign: 'center', padding: '20px' }}>
                    <i className="fas fa-exclamation-circle" style={{ fontSize: '48px', color: '#f44336', marginBottom: '10px' }}></i>
                    <p style={{ color: '#f44336', fontWeight: '600' }}>{sendReportStatus.error}</p>
                  </div>
                ) : (
                  <>
                    <p style={{ marginBottom: '16px', color: 'var(--text-muted)' }}>
                      Select the recipients who will receive the weekend schedule report via email.
                    </p>

                    <div style={{ marginBottom: '16px', display: 'flex', gap: '8px' }}>
                      <button className="btn btn-small btn-secondary" onClick={selectAllRecipients}>
                        Select All
                      </button>
                      <button className="btn btn-small btn-secondary" onClick={deselectAllRecipients}>
                        Deselect All
                      </button>
                      <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
                        {sendReportRecipients.length} selected
                      </span>
                    </div>

                    <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                      {availableRecipients.length > 0 ? (
                        availableRecipients.map((recipient) => (
                          <label
                            key={recipient.email}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              padding: '12px 16px',
                              borderBottom: '1px solid var(--border-color)',
                              cursor: 'pointer',
                              backgroundColor: sendReportRecipients.includes(recipient.email) ? 'var(--status-resolved-bg)' : 'transparent'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={sendReportRecipients.includes(recipient.email)}
                              onChange={() => toggleRecipient(recipient.email)}
                              style={{ marginRight: '12px' }}
                            />
                            <div>
                              <div style={{ fontWeight: '600' }}>{recipient.name}</div>
                              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{recipient.email}</div>
                            </div>
                          </label>
                        ))
                      ) : (
                        <p style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          No recipients with email addresses found.
                        </p>
                      )}
                    </div>

                    {/* Custom email input */}
                    <div style={{ marginTop: '16px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                        Or enter custom email:
                      </label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="email"
                          id="customEmailInput"
                          className="form-control"
                          placeholder="email@example.com"
                          style={{ flex: 1 }}
                        />
                        <button
                          className="btn btn-secondary"
                          onClick={() => {
                            const input = document.getElementById('customEmailInput');
                            const email = input.value.trim();
                            if (email && email.includes('@')) {
                              if (!sendReportRecipients.includes(email)) {
                                setSendReportRecipients(prev => [...prev, email]);
                              }
                              input.value = '';
                            }
                          }}
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="modal-footer">
                {!sendReportStatus.loading && !sendReportStatus.message && !sendReportStatus.error && (
                  <button
                    className="btn btn-primary"
                    onClick={handleSendWeekendReport}
                    disabled={sendReportRecipients.length === 0}
                  >
                    <i className="fas fa-paper-plane"></i> Send Report ({sendReportRecipients.length})
                  </button>
                )}
                <button className="btn btn-secondary" onClick={closeSendReportModal}>
                  {sendReportStatus.message ? 'Done' : 'Cancel'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Calendar;
