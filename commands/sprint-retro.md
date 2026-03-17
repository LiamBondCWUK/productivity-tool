# Sprint Retrospective

## Description

Sprint close-off ceremony. Generates a focused retrospective Confluence page covering sprint metrics, wins & impact, commitment tracking, blockers, data quality, and goal alignment. Also posts cascading updates to Atlassian Goals and Projects.

Supports `--preview` flag for mid-sprint drafts (no archival, no Goal updates).

**Separated from planning.** Use `/sprint-plan` for the forward-looking planning ceremony.

## Trigger

Run when user says:
- `/sprint-retro`
- `/sprint-retro --preview` (mid-sprint draft)
- "sprint retrospective" / "close the sprint" / "sprint close-off"

## Workflow

### Step 0: Load Config + Determine Sprint

Read `workspace/config/system.json` and `workspace/config/projects.json`.

Query Jira for the current/most recent sprint:
```
Board API: GET /rest/agile/1.0/board/{boardId}/sprint?state=active,closed&maxResults=2
```

Determine:
- Sprint name and number
- Sprint start/end dates
- Whether `--preview` flag is set (mid-sprint draft vs final close-off)

### Step 1: Sprint Metrics (via Atlassian MCP)

**Completed this sprint:**
```
JQL: project = UKCAUD AND sprint = {sprintId} AND status = Done
```

**Carried over (not done):**
```
JQL: project = UKCAUD AND sprint = {sprintId} AND status != Done
```

**Blocked:**
```
JQL: project = UKCAUD AND status = Blocked
```

Calculate:
- **Completion rate:** done / total
- **Carry-over ratio:** carried / total
- **Velocity:** story points completed (if tracked)
- **Avg cycle time:** average days from In Progress → Done

**Trend vs last 3 sprints** (if historical data available from dashboards):
- Compare velocity, completion rate, carry-over ratio
- Note improvements or regressions

### Step 2: Wins & Impact (IBP Format)

Pull from:
- `workspace/coordinator/daily-log.md` — all `[IBP]` tagged items within sprint dates
- Jira: tickets completed this sprint, grouped by epic → initiative

Synthesize into narrative bullets grouped by initiative:

```markdown
### Wins & Impact

**UKCAUD:**
- [Outcome-focused bullets — what was shipped/decided/unblocked]

**DIST:**
- [Resolutions, escalations closed]

**UKCAS:**
- [Customer issues resolved]
```

### Step 3: Commitment Tracking

Read `workspace/coordinator/weekly-plan.md` (and archived weeks within sprint).

For each commitment:
- Status: Completed / Carried / Dropped
- If carried: reason and new target

```markdown
### Commitment Tracking

- Committed: {N} items
- Completed: {N} ({X}%)
- Carried: {N}
- Dropped: {N}
```

### Step 4: Carry-Forward Items

List uncompleted tickets with context:

```markdown
### Carry-Forward Items

| Ticket | Summary | Status | Reason | Target |
|--------|---------|--------|--------|--------|

[JQL link: project = UKCAUD AND sprint = {sprintId} AND status != Done]
```

### Step 5: Blockers & Escalations

```markdown
### Blockers & Escalations

**Active Blockers:**
| Ticket | Blocker | Owner | Age (Days) |
|--------|---------|-------|------------|

**DIST Escalation Status:**
| DIST Ticket | UKCAUD Link | Status | Age |
|-------------|-------------|--------|-----|
```

### Step 6: Data Quality Flags

Run hygiene checks:

```
No epic linked: project = UKCAUD AND sprint = {sprintId} AND "Epic Link" is EMPTY
Missing labels: project = UKCAUD AND sprint = {sprintId} AND labels is EMPTY
Missing component: project = UKCAUD AND sprint = {sprintId} AND component is EMPTY
Missing fix version: project = UKCAUD AND sprint = {sprintId} AND fixVersion is EMPTY
```

```markdown
### Data Quality Flags

| Issue | Missing | Suggested Fix |
|-------|---------|---------------|

[JQL links for each category]
```

### Step 7: SLA/Aging Alerts

```markdown
### SLA Alerts

- DIST escalations open >10 days: {N} — {list}
- UKCAS L3 bugs without UKCAUD ticket: {N} — {list}
- Tickets with "Awaiting" fix versions: {N}
```

### Step 8: Goal Alignment (via GraphQL — best effort)

For each linked goal:

```markdown
### Goal Alignment

| Goal | Linked Initiatives | Progress | Status |
|------|-------------------|----------|--------|
```

**If NOT --preview** (final close-off only):
- Post learnings via `goals_createLearning`
- Post decisions via `goals_createDecision`
- Update project status via `projects_createUpdate` (on_track/at_risk/off_track)
- Update goal progress via `goals_createUpdate`

### Step 9: Dashboard Insights

Reference existing dashboards:
- **UKCAUD - Sprint(s) Review** (live)
- **UKCAUD Scorecard** (sandbox)
- **Sprint Stats Review** page

Include stats if accessible. Suggest improvements when patterns spotted.

### Step 10: Generate Confluence Page

**If NOT --preview:**

Create Confluence page in personal space:
- Title: `Sprint Retrospective Q1 2026 Sprint {N}`
- Parent: `{confluenceParentPageId}`
- Content: assembled from Steps 1-9

**If --preview:**
- Write to local file: `workspace/coordinator/notes/{today}-sprint-retro-preview.md`
- Do NOT create Confluence page
- Do NOT post to Goals
- Do NOT archive local files

### Step 11: Archive Local Files (final only)

**If NOT --preview:**
1. Copy current week's files to `workspace/coordinator/archive/week-{date}/`
2. Copy `workspace/initiatives/*/weekly-todos.md` to respective `archive/` dirs
3. Do NOT reset files — that's `/sprint-plan`'s job

### Step 12: Inline Output

```
Sprint {N} Retrospective {preview ? "(PREVIEW — not published)" : "published to Confluence"}:

📊 Completion: {done}/{total} ({X}%) | Carried: {N}
🏆 Wins: {top 2-3 wins}
🚧 Blockers: {N active}
🔍 Data quality: {N tickets with issues}
🎯 Goals: {updated/skipped}

{link to Confluence page or local file}
```

### Step 13: Log to Metrics

```
| {date} | /sprint-retro | {sources used} | {fallbacks} | {preview flag} |
```
