# Sprint Planning

## Description

Structured sprint planning ceremony. Pulls the backlog, checks capacity against velocity, proposes a scoped sprint with tickets ranked by value/urgency/dependencies, and drafts an outcome-based sprint goal. Produces a Confluence page section and local sprint plan.

**Separated from retrospective.** Use `/sprint-retro` for the backward-looking close-off ceremony.

## Trigger

Run when user says:
- `/sprint-plan`
- "sprint planning" / "plan the sprint" / "scope next sprint"

## Workflow

### Step 0: Load Config + Determine Sprint Context

Read `workspace/config/system.json` and `workspace/config/projects.json`.

Query Jira for sprint information:
```
Active sprint: GET /rest/agile/1.0/board/{boardId}/sprint?state=active
Future sprints: GET /rest/agile/1.0/board/{boardId}/sprint?state=future
```

Determine:
- Current sprint name, number, and end date
- Next sprint name, number, and start/end dates
- Sprint duration (typically 2 weeks)

### Step 1: Carry-Forward Assessment

Pull uncompleted tickets from current/closing sprint:
```
JQL: project = UKCAUD AND sprint in openSprints() AND status != Done
     ORDER BY priority DESC
```

For each:
- Current status and why it wasn't completed
- Should it carry forward or return to backlog?
- Story points (if tracked)

### Step 2: Backlog Pull (via Atlassian MCP)

**Next sprint (already assigned):**
```
JQL: project = UKCAUD AND sprint = {nextSprintId}
     ORDER BY priority DESC, status ASC
```
Group by epic.

**Backlog (prioritized, unassigned to sprint):**
```
JQL: project = UKCAUD AND sprint is EMPTY AND status != Done
     AND fixVersion != EMPTY ORDER BY priority DESC, rank ASC
```
Top 30 items only.

**Tickets with upcoming fix version deadlines:**
```
JQL: project = UKCAUD AND fixVersion in releasedVersions() = false
     AND fixVersion != EMPTY ORDER BY fixVersion ASC
```
Extract release dates from fix versions.

**Future-dated tickets:**
```
JQL: project = UKCAUD AND sprint in futureSprints() AND fixVersion != EMPTY
     ORDER BY due ASC
```
Exclude generic product-name sprints (filter to sprints with actual dates).

### Step 3: Capacity Check

**Velocity calculation:**
- Query last 3 completed sprints for story points completed
- Calculate average velocity
- If story points not used: count tickets completed per sprint as proxy

**Team availability:**
- Check `workspace/config/system.json` for any noted absences
- Default: full capacity unless noted

**Capacity vs proposed scope:**
```
Available capacity: {avg velocity} story points (or {N} tickets)
Proposed scope: {sum of next sprint tickets + carry-forward}
Buffer: 80% of capacity to account for unplanned work
```

Flag if proposed scope exceeds 80% capacity:
```
⚠️ Proposed scope ({N} pts) exceeds recommended capacity ({80% of velocity} pts).
Consider deferring {N} lower-priority items.
```

### Step 4: Scope Proposal

Rank all candidate tickets (carry-forward + next sprint + top backlog):

**Ranking criteria:**
1. **Value/Impact** — does this ticket advance a goal or initiative?
2. **Urgency** — due date, fix version deadline, SLA
3. **Dependencies** — is something else blocked by this?
4. **Effort** — story points or relative size

Group by epic with subtask completeness check:
```markdown
### Proposed Sprint Scope

**Epic: {Epic Name} (UKCAUD-XXX)**
- [ ] UKCAUD-123: {Summary} [P1, {pts} pts, due {date}]
  - Subtasks: Development ✅, Manual Testing ⬜, Peer Review ⬜
- [ ] UKCAUD-124: {Summary} [P2, {pts} pts]

**Epic: {Epic Name} (UKCAUD-YYY)**
- [ ] UKCAUD-125: {Summary} [P1, {pts} pts]

**Unlinked to Epic** ⚠️
- [ ] UKCAUD-126: {Summary} [P3] — suggest linking to {epic}
```

Flag tickets missing:
- Story point estimates
- Epic link
- Component
- Fix version

### Step 5: Dependency Tracking

Surface cross-project dependencies:

```markdown
### Dependencies

| UKCAUD Ticket | Depends On | Status | Age (Days) | Risk |
|---------------|-----------|--------|------------|------|
| UKCAUD-456 | DIST-789 | Open | 14 | ⚠️ Aging |
| UKCAUD-460 | UKCAUD-455 | In Progress | 3 | 🟢 |
```

Check blocking links within proposed scope:
- Development should block Manual Testing and Automated Testing
- Flag any missing blocking links

### Step 6: Sprint Goal Draft

Draft an outcome-based sprint goal from the top priorities:

```markdown
### Sprint Goal

**"[Outcome statement — what will be true at the end of this sprint]"**

Key results:
- [ ] {Measurable outcome 1}
- [ ] {Measurable outcome 2}
- [ ] {Measurable outcome 3}

Linked goals: {Atlassian Goal names if applicable}
```

### Step 7: DIST/UKCAS Planning Context

**DIST priorities for next sprint:**
```
JQL: project = DIST AND (reporter = currentUser() OR labels = "Audit_Squad")
     AND status != Closed ORDER BY priority DESC
```

**UKCAS priorities:**
```
JQL: project = UKCAS AND labels = "L3-Product/Dev" AND status != Closed
     ORDER BY priority DESC
```

```markdown
### DIST — Active Escalations
- {N} open, {N} aging >10d
- Key items: {top 3}

### UKCAS — L3 Triage Queue
- {N} L3 items needing attention
- Key items: {top 3}
```

### Step 8: Key Dates & Milestones

Pull from:
- `workspace/initiatives/*/milestones.md` — dates within next sprint + 2 weeks
- Fix version release dates from Jira
- `workspace/coordinator/weekly-plan.md` — "Looking Ahead"

```markdown
### Key Dates & Milestones

| Date | Event | Initiative | Source |
|------|-------|-----------|--------|
```

### Step 9: JQL Quick Links

Generate sprint-specific JQL links:

```markdown
### JQL Quick Links

| Filter | JQL |
|--------|-----|
| Next sprint scope | `project = UKCAUD AND sprint = {nextSprintId}` |
| Carry-forward | `project = UKCAUD AND sprint = {currentSprintId} AND status != Done` |
| Missing epic | `project = UKCAUD AND sprint = {nextSprintId} AND "Epic Link" is EMPTY` |
| Missing estimates | `project = UKCAUD AND sprint = {nextSprintId} AND story_points is EMPTY` |
| Blocked | `project = UKCAUD AND status = Blocked` |
| My DIST open | `project = DIST AND reporter = currentUser() AND status != Closed` |
```

### Step 10: Generate Confluence Page

Create Confluence page in personal space:
- Title: `Planning Q1 2026 Sprint {N}`
- Parent: `{confluenceParentPageId}`
- Content: assembled from Steps 1-9

Also write local copy: `workspace/coordinator/notes/{today}-sprint-plan.md`

### Step 11: Reset Local Files for New Sprint

1. Update `workspace/coordinator/weekly-plan.md`:
   - Move current "This Week: Top Priorities" to "Last Week: Wins & Impact"
   - Create empty "This Week: Top Priorities" sections from proposed scope
   - Update week dates

2. Reset `workspace/initiatives/*/weekly-todos.md`:
   - Move "Completed" items to archive
   - Carry forward "In Progress" and "Blocked" items
   - Add new items from proposed scope
   - Update week dates

### Step 12: Inline Output

```
Sprint {N} Planning:

📊 Capacity: {velocity} pts avg | Proposed scope: {N} pts ({tickets} tickets)
{capacity warning if over 80%}

🎯 Sprint Goal: "{goal statement}"

📋 Scope ({N} tickets across {N} epics):
- {Epic 1}: {N} tickets
- {Epic 2}: {N} tickets
- Unlinked: {N} tickets ⚠️

🔗 Dependencies: {N} cross-project ({N} aging)
📅 Key dates: {upcoming milestones}

{link to Confluence page}
```

### Step 13: Log to Metrics

```
| {date} | /sprint-plan | {sources used} | {fallbacks} | — |
```
