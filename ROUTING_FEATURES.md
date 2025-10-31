# Intelligent Routing Features Documentation

## Overview
Three powerful features that make routing 10x faster and smarter.

---

## 1. Conflict Detection Panel 🚨

### What It Does
Automatically detects and fixes routing conflicts in real-time.

### Detected Conflicts
1. **Overtime** - Tech scheduled >8 hours
2. **Off with Jobs** - Tech marked as off but has jobs assigned
3. **Timeframe Violations** - Job arrives after window closes
4. **Overlapping Jobs** - Two jobs scheduled at same time
5. **Missing Demo Tech** - 2-person job without demo tech
6. **Duplicate Assignments** - Same job assigned to multiple techs

### Auto-Fix Capabilities
- Redistributes overtime to available techs
- Unassigns jobs from techs marked as off
- Reorders jobs to fix timeframe issues
- Removes duplicate assignments

### How to Use
1. Panel appears automatically when conflicts exist
2. Click "Auto-Fix All" to resolve all fixable conflicts
3. Review summary of what was fixed
4. Manually resolve remaining conflicts

---

## 2. Smart Tech Recommendations 💡

### What It Does
Shows AI-powered tech recommendations when hovering over unassigned jobs.

### Scoring Factors
- **Workload Capacity** - Prefers techs with availability
- **Zone Matching** - +20 points for same zone
- **Drive Distance** - Calculated via Mapbox from last job
- **Role/Specialty** - Demo Tech for demo jobs, etc.
- **Experience** - Tracks similar jobs completed
- **Office Proximity** - Same office bonus

### Recommendation Display
- Top 5 best matches ranked 0-100%
- Drive time from tech's last job
- Current workload (X/8 hrs)
- 2 most important reasons per tech
- Color-coded scores:
  - Green (80-100%): Excellent match
  - Blue (60-79%): Good match
  - Orange (40-59%): Fair match
  - Red (0-39%): Poor match

### How to Use
1. Click any unassigned job in the kanban view
2. Tooltip appears with ranked recommendations
3. Click a tech's name to instantly assign
4. Job is automatically added to tech's route

---

## 3. Smart Fill Day & Multi-Select ⚡

### Smart Fill Day

#### What It Does
Auto-fills a tech's day with optimal jobs up to 8 hours.

#### How It Works
1. Analyzes all unassigned jobs
2. Scores each job for the specific tech
3. Selects best jobs up to target hours (default 8)
4. Prioritizes zone matching and timeframes
5. Auto-optimizes job order for minimal drive time
6. Shows preview before assigning

#### How to Use
1. Click "Fill Day" button in tech column header
2. Button appears when tech has <7.5 hours scheduled
3. Review preview of selected jobs
4. Confirm to auto-assign and optimize

### Multi-Select

#### What It Does
Select multiple jobs at once for bulk assignment.

#### How to Use
1. **Select Jobs**:
   - Hold Shift/Ctrl/Cmd and click jobs
   - Selected jobs highlight
   - Selection toolbar appears at bottom

2. **Assign Jobs**:
   - Drag selected jobs to any tech column
   - System auto-optimizes order
   - All jobs assigned at once

3. **Clear Selection**:
   - Click "Clear" button in toolbar
   - Or click without modifier key

---

## Technical Details

### Files Created

**Components:**
- `ConflictPanel.jsx` - Floating conflict detection panel
- `TechRecommendationTooltip.jsx` - Smart recommendation tooltip

**Utilities:**
- `conflictDetection.js` - Conflict detection and auto-fix logic
- `techScoring.js` - AI scoring algorithm
- `smartAssignment.js` - Smart fill and bulk assignment

**Styles:**
- `conflict-panel.css` - Conflict panel styling
- `tech-recommendation.css` - Recommendation tooltip styling

### Integration Points

**KanbanCalendar.jsx:**
- Conflict detection runs on every route/job change
- Smart Fill button in each tech column header
- Tech recommendation tooltip on job click
- Multi-select state management

**Routing.jsx:**
- Provides context data (techs, routes, jobs, schedule)
- Handles route/job updates from children

### Performance Optimizations

- Memoized conflict detection
- Debounced API calls
- Async scoring with error handling
- Batch processing for multi-select

---

## Usage Examples

### Example 1: Using Conflict Detection
```
Scenario: Mike has 10 hours scheduled (2 hours overtime)

1. Conflict panel appears showing:
   "⚠️ CONFLICTS (1)
    • Mike: 10.0 hrs scheduled (over 8hr limit)"

2. Click "Auto-Fix All"

3. System moves last job to Sarah (who has 6 hours)

4. Success message:
   "✅ Fixed 1 conflicts!
    All conflicts resolved!"
```

### Example 2: Using Tech Recommendations
```
Scenario: Assigning an Install job in Zone 2

1. Click unassigned Install job

2. Tooltip shows:
   "Best matches for Install job in Zone 2:
    1. Sarah (95% match) - 15 min away, 4 similar jobs
    2. Mike (87% match) - 25 min away, 2 similar jobs
    3. Tom (60% match) - 45 min away, different zone"

3. Click "Sarah" to assign instantly

4. Job added to Sarah's route optimally
```

### Example 3: Using Smart Fill Day
```
Scenario: Sarah has 3 hours, needs to fill rest of day

1. Click "Fill Day" button in Sarah's column

2. Preview shows:
   "Smart Fill for Sarah
    Selected 4 jobs (5.5 hrs)
    Total: 8.5/8 hrs

    Jobs:
    • Customer A (1.5h)
    • Customer B (2h)
    • Customer C (1h)
    • Customer D (1h)

    Continue?"

3. Click OK

4. Jobs auto-assigned and optimized for Sarah
```

### Example 4: Using Multi-Select
```
Scenario: Assigning 5 Zone 3 jobs to Tom

1. Hold Shift and click 5 jobs in Zone 3

2. Toolbar appears:
   "5 jobs selected [Clear]
    Drag selected jobs to a tech or click tech to assign"

3. Drag all 5 jobs to Tom's column

4. System:
   - Calculates optimal order
   - Minimizes drive time
   - Respects timeframes
   - Assigns all jobs at once
```

---

## Best Practices

### When to Use Smart Fill
- Tech has <6 hours scheduled
- Many unassigned jobs in tech's zone
- Want to balance workload quickly
- Trust AI to optimize

### When to Use Manual Assignment
- Complex multi-tech jobs
- Specific customer requests
- Special timing requirements
- Fine-tuning after Smart Fill

### When to Use Conflict Panel
- After bulk import
- Before finalizing routes
- After manual changes
- When warning indicators appear

### When to Use Tech Recommendations
- Assigning individual jobs
- Unsure which tech is best
- Want to see all options
- Learning tech capabilities

---

## Keyboard Shortcuts

- `Shift + Click` - Multi-select jobs
- `Ctrl/Cmd + Click` - Add to selection
- `Esc` - Clear selection (future)

---

## Troubleshooting

### Conflict Panel Not Showing
- Check if there are actual conflicts
- Panel auto-hides when no conflicts
- Click expand arrow if collapsed

### Tech Recommendations Not Appearing
- Only works on unassigned jobs
- Must click job (not drag)
- Check if job has required data
- Ensure Mapbox token is configured

### Smart Fill Returns No Jobs
- Check if there are unassigned jobs
- Verify tech is not marked as off
- Ensure tech has capacity (<8 hrs)
- Check zone availability

### Multi-Select Not Working
- Must use Shift/Ctrl/Cmd modifier
- Check if jobs are draggable
- Verify jobs are unassigned
- Clear browser cache if stuck

---

## Future Enhancements

Potential improvements:
- Machine learning from historical data
- Real-time traffic integration
- Customer preference tracking
- Skill-based matching
- Weather-aware routing
- Break time scheduling
- Lunch optimization
- Customer callback tracking

---

## API Dependencies

- **Mapbox API**: Drive time calculations
- **Firebase**: Data persistence
- **Browser APIs**: Drag & drop, local storage

---

## Support

For issues or questions:
1. Check console for error messages
2. Verify all dependencies are loaded
3. Ensure Mapbox token is configured
4. Check network connectivity
5. Review recent commits for changes
