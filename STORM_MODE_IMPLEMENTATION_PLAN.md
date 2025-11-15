# Storm Mode - Full Implementation Plan

## Executive Summary
Transform Storm Mode from UI-only to fully functional emergency staff management system supporting up to 50 team members and 20 sub contractors for high-demand situations.

---

## 1. Core Requirements

### 1.1 Staff Capacity
- **Total Routing Capacity**: Up to 50 individual staff members
- **Sub Contractors**: Up to 20 separate sub crews
- **Combined Calendar Management**: 70 total calendars

### 1.2 Staff Categories & Capabilities

#### Project Managers (PMs)
- Can perform: Install, Sub Support, CS, Pull
- **Key Role**: Can start/supervise sub contractors
- Can be assigned independent jobs OR sub supervision
- Starting location: Conroe or Katy

#### EHQ Leaders
- Can perform: Install, Sub Support, CS, Pull
- **Key Role**: Can start/supervise sub contractors
- Higher authority than PMs for decision-making
- Starting location: Conroe or Katy

#### EHQ CS Staff
- **Default**: Check & Service jobs ONLY
- **Optional**: Some may have additional capabilities (Install, Pull, etc.)
- **Safety Check**: Warning dialog if assigned beyond capabilities
- Starting location: Conroe or Katy

#### Sub Contractors
- External crews with quantity (e.g., "ABC Crew - 5 workers")
- **Requirement**: MUST have PM or EHQ Leader to start them
- **Routing Behavior**: Creates TWO map markers:
  1. Sub crew location (actual job)
  2. "Starter Required" indicator
- Calendar shows: "Starting [Sub Crew Name]"

---

## 2. Data Structure Design

### 2.1 Firebase Schema

```javascript
// /stormMode/{date}/
{
  active: true,
  lastUpdated: timestamp,

  projectManagers: [
    {
      id: "pm_001",
      name: "John Smith",
      startingLocation: "office_1", // office_1 or office_2
      capabilities: {
        install: true,
        sub: true,
        cs: true,
        pull: true
      },
      status: "available", // available, assigned, off
      assignedToSub: null, // "sub_003" if supervising
      email: "john@company.com",
      phone: "555-0100"
    }
  ],

  ehqLeaders: [
    {
      id: "ehq_001",
      name: "Sarah Johnson",
      startingLocation: "office_2",
      capabilities: {
        install: true,
        sub: true,
        cs: true,
        pull: false
      },
      status: "available",
      assignedToSub: null,
      email: "sarah@company.com",
      phone: "555-0101"
    }
  ],

  ehqCSStaff: [
    {
      id: "cs_001",
      name: "Mike Davis",
      startingLocation: "office_1",
      capabilities: {
        install: false,
        sub: false,
        cs: true,  // Always true
        pull: false
      },
      status: "available",
      email: "mike@company.com",
      phone: "555-0102"
    }
  ],

  subContractors: [
    {
      id: "sub_001",
      name: "ABC Restoration Crew",
      quantity: 5,
      assignedStarter: null, // "pm_001" or "ehq_001"
      starterStatus: "needed", // needed, assigned, started
      contactName: "Bob Williams",
      contactPhone: "555-9000"
    }
  ]
}

// /routes/{date}/stormAssignments/
{
  "pm_001": {
    type: "projectManager",
    role: "supervisor", // supervisor or independent
    jobs: [...jobIds],
    supervisingSub: "sub_001" // if role is supervisor
  },
  "sub_001": {
    type: "subContractor",
    jobs: [...jobIds],
    starter: "pm_001",
    starterJobs: [...starterJobIds] // The "starter" jobs
  }
}
```

### 2.2 Job Assignment Structure

```javascript
// Enhanced job object for Storm Mode
{
  id: "job_123",
  assignedTo: "pm_001", // or "sub_001" or regular tech
  assignedToType: "projectManager", // tech, projectManager, ehqLeader, ehqCSStaff, subContractor

  // For sub contractor jobs
  requiresStarter: true,
  starterAssigned: "pm_001",
  starterType: "projectManager",

  // Job type validation
  jobType: "install", // install, check, service, pull, demo, etc.

  // Validation warnings
  capabilityOverride: false // true if assigned despite missing capability
}
```

---

## 3. UI/UX Enhancements

### 3.1 Storm Mode Staff Management Tab Improvements

#### Add/Remove Staff Buttons
```
[+ Add Project Manager]  [+ Add EHQ Leader]  [+ Add CS Staff]  [+ Add Sub Contractor]
```

#### Enhanced Staff Table
```
| Name            | Starting Location | Install | Sub | CS | Pull | Status    | Actions        |
|-----------------|-------------------|---------|-----|----|----- |-----------|----------------|
| John Smith      | [Conroe ▼]       | ☑       | ☑   | ☑  | ☑    | Available | [Edit] [Delete]|
| Sarah Johnson   | [Katy ▼]         | ☑       | ☐   | ☑  | ☑    | Assigned  | [Edit] [Delete]|
```

#### Sub Contractor Table Enhancement
```
| Crew Name           | Quantity | Starter        | Status          | Actions        |
|---------------------|----------|----------------|-----------------|----------------|
| ABC Restoration     | 5        | John Smith (PM)| Started 8:30 AM | [Edit] [Delete]|
| XYZ Contractors     | 3        | (Not Assigned) | Needs Starter   | [Assign Starter]|
```

### 3.2 Routing View Integration

#### Staff List (Manual/Kanban View)
- Show all available Storm Mode staff alongside regular techs
- **Visual Indicators**:
  - 🔧 Regular Tech (blue)
  - 📋 Project Manager (purple)
  - 👔 EHQ Leader (gold)
  - 🎧 EHQ CS Staff (teal)
  - 👥 Sub Contractor (orange)

#### Drag & Drop Behavior
1. **Drag job to PM/EHQ Leader/CS Staff**: Normal assignment
2. **Drag job to Sub Contractor**:
   - Assigns job to sub
   - Opens "Assign Starter" modal
   - Select PM or EHQ Leader to start them
   - Creates two calendar events

#### Map Markers
- **Regular Assignment**: Single marker (job location)
- **Sub Assignment**:
  - Primary marker: Job location (orange, sub icon)
  - Secondary marker: "Starter Required" badge
  - After starter assigned: Shows both names

#### Storm Mode Filtering (Manual/Kanban View)
**Purpose**: Focus on specific job/staff categories during routing

**Filter Options**:
```
[All Staff & Jobs ▼]
  ├─ All (Default) - Show everything
  ├─ Sub Crews & Demos - Only demos + sub contractors
  ├─ Check Services - Only check/service jobs + CS staff
  ├─ Installs - Only install jobs + capable staff
  ├─ Pulls - Only pull jobs + capable staff
  └─ Regular Techs Only - Hide all Storm Mode staff
```

**Filter Behavior**:
- **Jobs List**: Shows only jobs matching selected type
- **Staff List**: Shows only staff capable of that job type
- **Example**: Select "Check Services"
  - Jobs: Only Check/Service jobs visible
  - Staff: EHQ CS Staff + any PM/Leader with CS capability + regular techs
  - Hides: Sub contractors, staff without CS capability, Install/Demo/Pull jobs

**UI Position**: Dropdown in header next to view selector

**Benefits**:
- Route demos to subs first, then handle other job types
- Assign check services to CS staff without distraction
- Focus on one category at a time during high-stress situations
- Or route everything at once with "All"

### 3.3 Capability Validation Dialog

**Triggered When**: Assigning job type beyond staff capabilities

```
┌─────────────────────────────────────────────────┐
│  ⚠️  Capability Warning                         │
├─────────────────────────────────────────────────┤
│                                                 │
│  Mike Davis (EHQ CS Staff) is not authorized   │
│  for Install jobs.                              │
│                                                 │
│  Their capabilities:                            │
│  ✅ Check / Service                             │
│  ❌ Install                                     │
│  ❌ Pull                                        │
│  ❌ Demo                                        │
│                                                 │
│  Do you want to assign this job anyway?         │
│                                                 │
│  [Cancel]              [Assign Anyway]          │
└─────────────────────────────────────────────────┘
```

### 3.4 Sub Contractor Starter Assignment Modal

**Triggered When**: Job assigned to sub contractor

```
┌─────────────────────────────────────────────────┐
│  👥 Assign Starter for Sub Contractor           │
├─────────────────────────────────────────────────┤
│                                                 │
│  Sub Contractor: ABC Restoration Crew (5)      │
│  Job: Install - 123 Main St                    │
│  Time: 8:00 AM - 12:00 PM                      │
│                                                 │
│  Select who will start this crew:              │
│                                                 │
│  ○ John Smith (PM) - Available                 │
│  ○ Sarah Johnson (EHQ Leader) - Available      │
│  ○ Tom Brown (PM) - Already supervising XYZ    │
│                                                 │
│  Starter Behavior:                              │
│  ○ Start only (leave after job begins)         │
│  ○ Supervise all day (stay with crew)          │
│                                                 │
│  [Cancel]                    [Assign]           │
└─────────────────────────────────────────────────┘
```

---

## 4. Calendar Management System

### 4.1 Challenge: Managing 70+ Calendars

#### Approach A: Batch Calendar Push (Recommended)
- **UI**: "Push All Storm Mode Routes" button
- **Process**:
  1. Show progress modal with percentage
  2. Push calendars in batches of 10
  3. 2-second delay between batches (API rate limiting)
  4. Show success/failure for each staff member

#### Approach B: Individual Calendar Management
- **UI**: Checkbox next to each staff member
- **Select All** / **Deselect All** buttons
- **Push Selected** button

#### Recommended: Hybrid Approach
```
┌─────────────────────────────────────────────────┐
│  📅 Push Routes to Calendars                    │
├─────────────────────────────────────────────────┤
│                                                 │
│  Regular Techs (15)        [☑] Select All      │
│  Project Managers (8)      [☑] Select All      │
│  EHQ Leaders (4)           [☑] Select All      │
│  EHQ CS Staff (6)          [☑] Select All      │
│  Sub Contractors (12)      [☐] Select All      │
│                                                 │
│  Total: 45 calendars selected                  │
│                                                 │
│  [Cancel]    [Push Selected Calendars]         │
└─────────────────────────────────────────────────┘

Progress:
[████████████████░░░░░░░░░░] 62% (28/45)
Currently pushing: Sarah Johnson (EHQ Leader)
```

### 4.2 Calendar Event Format

#### Regular Storm Mode Staff Event
```
[8:00 AM - 12:00 PM] Install - 123 Main St
📋 PM Assignment (Storm Mode)
📞 (555) 123-4567
📍 Zone: North Houston
```

#### Starter/Supervisor Event
```
[8:00 AM - 8:30 AM] Start ABC Restoration Crew
👥 Sub Contractor Supervision
📍 456 Oak Ave, Houston, TX
Then: Install - 123 Main St

OR (if supervising all day):

[8:00 AM - 5:00 PM] Supervise ABC Restoration Crew
👥 Sub Contractor Supervision
Jobs:
• 8:00 AM - Install - 456 Oak Ave
• 12:00 PM - Demo - 789 Pine St
• 3:00 PM - Pull - 321 Elm Dr
```

---

## 5. Implementation Phases

### Phase 1: Data Infrastructure (Week 1)
**Goal**: Firebase integration and data persistence

- [ ] Create Firebase schema for Storm Mode staff
- [ ] Add/Edit/Delete functions for all staff categories
- [ ] Load Storm Mode staff on date selection
- [ ] Persist capability settings
- [ ] Create Storm Mode toggle persistence

**Files to modify**:
- `firebaseService.js`: Add Storm Mode CRUD functions
- `StormMode.jsx`: Replace mock data with Firebase
- `Routing.jsx`: Load/save Storm Mode state

### Phase 2: Routing Integration (Week 2)
**Goal**: Make Storm Mode staff assignable in routing views

- [ ] Add Storm Mode staff to routing staff lists
- [ ] Implement staff type visual indicators
- [ ] Enable drag-and-drop for all staff types
- [ ] Add job assignment validation
- [ ] Create capability warning dialog
- [ ] Store assignments in Firebase
- [ ] Implement Storm Mode filtering system (All/Sub Crews/Check Services/Installs/Pulls/Regular Only)
- [ ] Filter jobs list based on selected filter
- [ ] Filter staff list based on capabilities and filter type

**Files to modify**:
- `ManualMode.jsx`: Add Storm staff to tech list + filtering
- `KanbanCalendar.jsx`: Add Storm staff columns + filtering
- `Routing.jsx`: Merge Storm staff with regular techs + filter state
- New file: `CapabilityWarningModal.jsx`
- New file: `StormModeFilter.jsx` (filter dropdown component)

### Phase 3: Sub Contractor System (Week 2-3)
**Goal**: Full sub contractor assignment with starters

- [ ] Create "Assign Starter" modal
- [ ] Implement starter selection logic
- [ ] Create dual map markers for subs
- [ ] Generate starter calendar events
- [ ] Track starter status (needed/assigned/started)
- [ ] Show sub assignment in route display

**Files to create**:
- `AssignStarterModal.jsx`
- `SubContractorMarker.jsx` (map component)

**Files to modify**:
- `ManualMode.jsx`: Add sub marker rendering
- `KanbanCalendar.jsx`: Show starter assignments
- `firebaseService.js`: Sub contractor assignment functions

### Phase 4: Calendar Management (Week 3)
**Goal**: Batch calendar push for 70+ staff

- [ ] Create Calendar Push modal with selection
- [ ] Implement batch processing (10 at a time)
- [ ] Add progress tracking
- [ ] Handle API rate limiting
- [ ] Generate proper event formats for all staff types
- [ ] Error handling and retry logic

**Files to create**:
- `StormModeCalendarPush.jsx`

**Files to modify**:
- `googleCalendarService.js`: Add batch push function
- `Routing.jsx`: Integrate calendar push button

### Phase 5: UI Polish & Edge Cases (Week 4)
**Goal**: Production-ready feature

- [ ] Add bulk operations (assign multiple starters)
- [ ] Staff availability tracking
- [ ] Conflict detection (double-booking)
- [ ] Historical Storm Mode data
- [ ] Analytics (how many times used, staff utilization)
- [ ] Mobile responsiveness
- [ ] Dark mode compatibility
- [ ] Comprehensive error messages

---

## 6. Edge Cases & Validation

### 6.1 Validation Rules

| Scenario | Validation | Action |
|----------|-----------|--------|
| Assign Install to CS Staff without capability | Warn | Show capability dialog |
| Assign Sub without starter | Block | Force starter selection |
| Starter already supervising 3+ subs | Warn | "Are you sure? High workload" |
| PM/EHQ has independent jobs + sub supervision | Warn | "Will have limited availability" |
| Assign job outside staff's starting location zone | Info | "Long drive from [office]" |
| Storm Mode disabled mid-day | Confirm | "Remove all Storm assignments?" |
| Calendar push fails for some staff | Retry | Show failed list, allow retry |

### 6.2 Conflict Detection

**Scenario**: PM assigned independent job 9-12, asked to start sub at 8 AM
**Solution**:
- Show timeline conflict
- Options:
  1. Move independent job
  2. Choose different starter
  3. Delay sub start time

### 6.3 Data Cleanup

**When Storm Mode disabled**:
1. Confirm: "Remove all Storm Mode assignments?"
2. If Yes: Unassign all jobs, clear starter assignments
3. If No: Keep assignments but hide Storm UI

---

## 7. Key Technical Decisions

### 7.1 How to Store Storm Staff?
**Decision**: Separate Firebase collection by date
**Rationale**:
- Staff availability changes daily
- Historical tracking
- Easy to clear when storm ends

**Alternative Considered**: Global staff pool
**Rejected Because**: Harder to manage availability per day

### 7.2 Sub Contractor Starter Behavior
**Options**:
1. Start only (30 min event)
2. Supervise all day (full shift)
3. Check-in intervals (start, mid-day, end)

**Recommended**: Offer choice in UI (radio buttons)

### 7.3 Calendar Push Strategy
**Decision**: Batch with progress tracking
**Rationale**:
- Google API rate limits
- Better UX than 70 sequential requests
- Ability to cancel mid-process

### 7.4 Staff Integration with Regular Routing
**Decision**: Merge Storm staff into routing views as additional "techs"
**Rationale**:
- Unified routing experience
- No duplicate code
- Clear visual distinction via icons/colors

---

## 8. Testing Plan

### 8.1 Unit Tests
- Capability validation logic
- Starter assignment validation
- Calendar event generation
- Batch processing logic

### 8.2 Integration Tests
- Firebase CRUD operations
- Google Calendar API calls
- Drag-and-drop assignments
- Modal workflows

### 8.3 Load Tests
- 50 staff members in routing view
- Batch push 70 calendars
- Rendering performance with 200+ jobs

### 8.4 User Acceptance Tests
- Manager assigns sub contractor
- Capability warning workflow
- Calendar push success/failure
- Storm Mode enable/disable

---

## 9. Success Metrics

### 9.1 Performance
- [ ] Routing view loads in <2s with 50 staff
- [ ] Calendar push completes in <3 min for 70 staff
- [ ] No UI lag when dragging jobs

### 9.2 Functionality
- [ ] 100% of Storm staff assignable
- [ ] 0% capability violations without warning
- [ ] 100% of subs have starters assigned
- [ ] Calendar accuracy: 99%+

### 9.3 Usability
- [ ] Users can add staff in <30 seconds
- [ ] Sub assignment takes <1 minute
- [ ] No training needed (intuitive UI)

---

## 10. Open Questions for Review

### 10.1 Business Logic
1. **Sub Contractor Limits**: Can one PM start multiple subs? (Proposed: Max 3)
2. **CS Staff Override**: Who can approve capability overrides? (Proposed: Warning only)
3. **Starter Time**: Fixed 30 min or configurable? (Proposed: Fixed)
4. **All-Day Supervision**: Does PM do no other work? (Proposed: Correct)

### 10.2 UX Decisions
1. **Staff Colors**: Approve proposed color scheme?
   - 🔧 Tech: Blue
   - 📋 PM: Purple
   - 👔 EHQ Leader: Gold
   - 🎧 CS Staff: Teal
   - 👥 Sub: Orange

2. **Calendar Push**: Batch size 10 or different? (API limits?)

3. **Sub Markers**: Show both markers always or toggle?

### 10.3 Technical
1. **Email Collection**: How to get emails for all Storm staff?
2. **Phone Numbers**: Required or optional?
3. **Historical Data**: How long to keep old Storm Mode data?
4. **Permissions**: Who can enable Storm Mode? (Proposed: Managers only)

---

## 11. Risks & Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Google Calendar API rate limits | High | Medium | Batch processing, delays, retry logic |
| 70 calendars cause performance issues | Medium | Low | Optimize React rendering, virtualization |
| Sub contractor no-show | High | Medium | Track starter confirmation, send reminders |
| Capability override abuse | Medium | Medium | Log all overrides, manager notifications |
| Data sync issues with 50+ staff | High | Medium | Optimistic updates, conflict resolution |

---

## 12. Future Enhancements (Post-Launch)

- [ ] SMS notifications for starters
- [ ] Sub contractor check-in via mobile app
- [ ] Real-time GPS tracking for subs
- [ ] Automated starter recommendations (AI)
- [ ] Integration with payroll (sub contractor hours)
- [ ] Multi-day Storm Mode events
- [ ] Staff certification tracking
- [ ] Equipment assignment for subs

---

## 13. Documentation Needs

- [ ] User guide: "How to use Storm Mode"
- [ ] Video tutorial: Sub contractor assignment
- [ ] Admin guide: Managing 70+ calendars
- [ ] API documentation: Firebase schema
- [ ] Troubleshooting guide: Common issues

---

## Summary & Next Steps

**Estimated Timeline**: 4 weeks for full implementation

**Critical Path**:
1. Week 1: Data infrastructure
2. Week 2: Routing integration + Sub system
3. Week 3: Calendar management
4. Week 4: Polish & testing

**First Milestone**: Phase 1 completion (Firebase integration)
**Success Criteria**: Add/edit Storm staff persists to database

**Recommended Approach**: Implement in phases, test each phase before moving forward.

---

## Approval Checklist

Before proceeding, please confirm:
- [ ] Firebase schema design approved
- [ ] UI/UX flows approved
- [ ] Staff color scheme approved
- [ ] Sub contractor starter behavior approved
- [ ] Calendar push strategy approved
- [ ] Open questions answered
- [ ] Timeline acceptable

**Ready to begin implementation?**
