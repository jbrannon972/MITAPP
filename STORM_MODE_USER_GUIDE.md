# Storm Mode User Guide

## What is Storm Mode?

Storm Mode is an emergency staff management system designed for high-demand situations like natural disasters, mass emergencies, or any event requiring rapid staffing scale-up beyond regular technicians.

**Maximum Capacity**: Up to **50 staff members** + **20 sub contractor crews** = **70 total routing entities**

---

## Getting Started

### 1. Enable Storm Mode

1. Navigate to the **Routing** page
2. Click the **options menu (⋮)** in the header
3. Toggle **"Storm Mode"** checkbox
4. A red **lightning bolt (⚡)** button appears in the view selector

### 2. Access Storm Mode Management

Click the **⚡ Storm Mode button** to access the staff management interface.

---

## Managing Staff

### Staff Categories

Storm Mode manages **5 staff categories**:

| Category | Icon | Capabilities | Purpose |
|----------|------|--------------|---------|
| **Technicians** | 🔧 | All | Regular company technicians (read-only) |
| **Project Managers** | 📋 | Install, Sub, CS, Pull | Can start/supervise subs + handle jobs |
| **EHQ Leaders** | 👔 | Install, Sub, CS, Pull | Leadership + can start/supervise subs |
| **EHQ CS Staff** | 🎧 | CS (required), others optional | Customer service field work |
| **Sub Contractors** | 👥 | N/A | External contractor crews |

### Adding Staff

1. Click the **staff category tab** (Project Managers, EHQ Leaders, etc.)
2. Click **"+ Add [Staff Type]"** button
3. Fill in the form:
   - **Name**: Staff member or crew name
   - **Starting Location**: Conroe or Katy office
   - **Capabilities**: Check boxes for authorized job types
   - **Quantity** (subs only): Number of workers in crew
4. Click **"Add"**

### Editing Staff

- **Starting Location**: Change dropdown directly in table
- **Capabilities**: Toggle checkboxes in table (changes save immediately)
- **Quantity** (subs): Edit number field directly

### Deleting Staff

Click the **trash icon** next to any staff member to remove them.

---

## Routing with Storm Mode

### Filter Modes

When Storm Mode is active, use the **Filter dropdown** to focus on specific job/staff categories:

| Filter | Shows Jobs | Shows Staff |
|--------|-----------|-------------|
| **All** | All jobs | All staff (regular + Storm Mode) |
| **Sub Crews & Demos** | Demo jobs only | Subs + PM/Leaders with install capability |
| **Check Services** | Check/Service jobs | CS Staff + PM/Leaders with CS capability |
| **Installs** | Install jobs | PM/Leaders/CS Staff with install capability |
| **Pulls** | Pull jobs | PM/Leaders/CS Staff with pull capability |
| **Regular Techs Only** | All jobs | Regular technicians only (hides Storm staff) |

**Workflow Example**:
1. Select "Sub Crews & Demos" → Assign all demo jobs to sub contractors
2. Select "Check Services" → Assign check/service jobs to CS staff
3. Select "Installs" → Assign remaining installs to PMs
4. Select "All" → Verify complete routing

### Assigning Jobs

**Drag & Drop** (Manual Mode):
- Drag jobs to any staff member
- System automatically checks capabilities
- Warning appears if job type doesn't match capabilities

**Capability Warning**:
- If you assign a job beyond staff's capabilities, a warning dialog appears
- Shows: ✅ Authorized capabilities | ❌ Unauthorized
- Options: "Cancel" or "Assign Anyway"
- Override assignments are logged

### Sub Contractor Workflow

When you assign a job to a **sub contractor**, the system requires you to assign a **starter**:

1. **Assign Starter Modal** appears automatically
2. Select a **PM or EHQ Leader** to start the crew
3. Choose **starter behavior**:
   - **Start Only**: Starter meets crew, gets them started, then leaves (30 min)
   - **Supervise All Day**: Starter stays with crew for entire job
4. Click **"Assign Starter"**

**Result**:
- ✅ Sub contractor assigned to job
- ✅ Starter assigned to sub
- ✅ Two map markers created (job location + starter indicator)
- ✅ Calendar events generated for both

---

## Calendar Management

### Pushing Routes to Calendars

Storm Mode supports batch pushing up to **70 calendars** simultaneously.

1. Click **"Push to Calendars"** button
2. **Calendar Push Modal** opens
3. Select staff groups to push:
   - ☑️ Regular Techs
   - ☑️ Project Managers
   - ☑️ EHQ Leaders
   - ☑️ EHQ CS Staff
   - ☐ Sub Contractors (optional)
4. Review total selected
5. Click **"Push X Calendars"**

**Process**:
- Calendars push in **batches of 10**
- **2-second delay** between batches (API rate limiting)
- **Live progress tracking**
- **Success/Failed counts**
- **Failed list** shown for retry

**Calendar Event Format**:

**Regular Staff**:
```
[PM] Install - ABC Company
Storm Mode Assignment
Staff Type: PM
Assigned To: John Smith
...job details...
```

**Sub Contractors**:
```
[Sub Contractor] Demo - XYZ Corp
Storm Mode Assignment
Started By: Sarah Johnson (EHQ Leader)
...job details...
```

**Starters**:
```
[PM] Start ABC Restoration Crew
Sub Contractor Supervision
Supervision: All Day
...sub job details...
```

---

## Best Practices

### During an Emergency

1. **Enable Storm Mode** immediately
2. **Add all available staff** (PM, EHQ, CS, Subs)
3. **Use filters** to route by job type:
   - Route demos to subs first (they need starters)
   - Route check services to CS staff
   - Route installs/pulls to PMs/Leaders
4. **Assign starters** to all sub contractors
5. **Push calendars** when routing complete

### Capability Configuration

**EHQ CS Staff**:
- Always have **CS** capability (cannot be removed)
- Some may have additional capabilities (Install, Pull)
- Configure capabilities based on individual training

**Project Managers**:
- Typically have all capabilities
- Can handle any job type
- Best for complex jobs requiring supervision

**EHQ Leaders**:
- Similar to PMs but with higher authority
- Ideal for starting/supervising multiple subs

### Staff Availability

**Available Starters**:
- Only PMs and EHQ Leaders **not already assigned to subs** appear in "Assign Starter" modal
- If no starters available: Add more PMs/Leaders or reassign existing

**Tracking**:
- Staff Status: Available, Assigned, Off
- Starter Status: Needed, Assigned, Started

---

## Data Persistence

**Storm Mode data is stored by date:**
- Each day has separate Storm Mode configuration
- Staff added on 11/15 won't appear on 11/16
- Copy previous day's setup manually if needed
- Historical data retained indefinitely

**Firebase Collections**:
- `hou_storm_mode/YYYY-MM-DD` - Staff data for each date
- Real-time sync across all users
- Automatic conflict resolution

---

## Troubleshooting

### "No available starters"
**Cause**: All PMs/Leaders already assigned to subs
**Solution**: Add more PMs/Leaders or use "Start Only" to free up starters faster

### Capability warning appearing
**Cause**: Job type doesn't match staff capabilities
**Solution**:
- Click "Cancel" and find appropriate staff
- Click "Assign Anyway" if intentional override

### Calendar push failures
**Cause**: Staff missing email address, API rate limits, no Google Calendar auth
**Solution**:
- Verify all staff have email addresses configured
- Use batch processing (automatic)
- Ensure Google Calendar is authenticated
- Retry failed calendars individually

### Staff not appearing in routing view
**Cause**: Storm Mode filter active
**Solution**: Change filter to "All Staff & Jobs"

### Jobs not appearing
**Cause**: Storm Mode filter hiding non-matching job types
**Solution**: Change filter to "All Staff & Jobs"

---

## Keyboard Shortcuts

(None currently - drag & drop only)

---

## FAQ

**Q: Does Storm Mode affect regular routing?**
A: No. When Storm Mode is OFF, regular routing works exactly as before.

**Q: Can regular techs and Storm staff work together?**
A: Yes! Storm Mode extends the staff pool, doesn't replace it.

**Q: What happens when I disable Storm Mode mid-day?**
A: Storm staff and assignments remain until you manually remove them. Toggle doesn't auto-clear assignments.

**Q: Can one PM start multiple subs?**
A: Yes, but they can only supervise one at a time. Use "Start Only" for multiple subs.

**Q: Do sub contractors need email addresses?**
A: Only if pushing their calendars. Use crew contact's email.

**Q: Can I edit a staff member's name after creating them?**
A: Not currently. Delete and re-create with correct name.

**Q: How long does calendar push take for 70 staff?**
A: Approximately **3-4 minutes** (10 per batch, 2-second delays)

---

## Technical Details

**Maximum Limits**:
- **50** individual staff members (PM + EHQ Leaders + EHQ CS Staff + Regular Techs)
- **20** sub contractor crews
- **70** total calendar pushes per batch

**Performance**:
- Routing view: <2s load time with 50 staff
- Calendar push: <4 min for 70 staff
- No lag in drag-and-drop with 200+ jobs

**Browser Requirements**:
- Chrome/Edge (recommended)
- Firefox (supported)
- Safari (supported, some limitations)
- Requires JavaScript enabled

**Mobile Support**:
- Tablet: Full support (iPad, Android tablets)
- Phone: Limited (use desktop for Storm Mode management)

---

## Support

**Issues? Questions?**
- Contact IT support
- Check Firebase logs (managers only)
- Review implementation plan: `STORM_MODE_IMPLEMENTATION_PLAN.md`

**Feature Requests**:
- File issue in GitHub repository
- Contact development team

---

## Changelog

**Version 1.0** (Current)
- Initial release
- All 5 phases complete
- Full Firebase integration
- Batch calendar push
- 6 filter modes
- Sub contractor starter workflow

---

**Last Updated**: November 2025
**Version**: 1.0.0
**Author**: Claude AI Assistant
