# Meeting Prep

## Description

Generates a crisp meeting-ready status block by querying Jira directly for real-time sprint/board status across all projects and goal progress. Output is ready to paste or present at "Liam's AI Check-in" or any stakeholder meeting.

Tone: **Crisp, outcome-oriented** — what you'd say in a 5-minute standup, not a written report.

## Trigger

Run when user says:
- `/prep`
- "prep for meeting" / "meeting prep" / "status update"
- "prep the AI check-in" / "prepare for check-in"

## Workflow

### Step 0: Load Config

Read `workspace/config/system.json` and `workspace/config/projects.json`.

Determine the reporting window:
- **"Last week"** = 7 days ending yesterday (inclusive)
- **"This sprint"** = current open sprint in UKCAUD

### Step 1: UKCAUD Sprint Status (via Atlassian MCP)

```
JQL: project = UKCAUD AND sprint in openSprints() ORDER BY status ASC, priority DESC
```

Categorize:
- **To Do / In Progress / Done / Blocked** counts
- **Sprint health:** compare done% against expected progress (days elapsed / total sprint days)
  - Ahead: done% > expected%
  - On track: within 10%
  - Behind: done% < expected% by >10%
- **At-risk tickets:** In Progress with due date within 2 days of sprint end
- **Velocity context:** If available from Jira, average story points from last 3 sprints

### Step 2: DIST Escalation Status (via Atlassian MCP)

```
JQL: project = DIST AND (reporter = currentUser() OR labels = "Audit_Squad")
     AND status != Closed ORDER BY priority DESC
```

Group by:
- Open (new this week)
- Waiting on platform (in progress, assigned to platform team)
- Resolved this week: `project = DIST AND status = Closed AND resolved >= -7d`

**Aging alert:** Flag any open >10 days.

### Step 3: UKCAS Board Status (via Atlassian MCP)

```
JQL: project = UKCAS AND status != Closed ORDER BY priority DESC
```

Group by:
- Priority (Critical / High / Medium / Low)
- Aging: flag any open >14 days
- Recently resolved: `project = UKCAS AND status = Closed AND resolved >= -7d`
- L3 items without UKCAUD ticket linked

### Step 4: Goal Progress (via GraphQL — best effort)

For each linked goal, calculate progress based on linked initiatives/epics completion percentage.

```graphql
query {
  goals_search(filter: { ownerAri: "{userAri}" }, first: 20) {
    edges {
      node {
        name
        score
        phase { value }
        workItems { edges { node { key status } } }
      }
    }
  }
}
```

**If unavailable:** Skip with note.

### Step 5: Wins & Impact (Last Week)

Pull from:
- `workspace/coordinator/daily-log.md` — scan last 7 days for `[IBP]` flagged items + accomplishments
- `workspace/coordinator/weekly-plan.md` — "Last Week: Wins & Impact" section
- Jira: tickets moved to Done in last 7 days per project

Synthesize into narrative bullets grouped by initiative.

### Step 6: Coming Up (Next Week)

Pull from:
- `workspace/coordinator/weekly-plan.md` — "This Week: Top Priorities" (if mid-week) or "Looking Ahead"
- `workspace/initiatives/*/weekly-todos.md` — open priorities
- Jira: tickets in next sprint, upcoming due dates

### Step 7: Output

Write status block to daily brief and print inline:

```markdown
## Status Update — {date}

### UKCAUD Sprint Status
- **Sprint health:** {On track / Behind / Ahead} ({done%} done, {expected%} expected)
- To Do: {N} | In Progress: {N} | Done: {N} | Blocked: {N}
- At-risk: {list tickets nearing sprint end}

### DIST Escalations
- Open: {N} ({N} new this week)
- Waiting on platform: {N}
- Resolved this week: {N}
- ⚠️ Aging >10d: {list if any}

### UKCAS Support
- Open: {N} (Critical: {N}, High: {N})
- L3 needing triage: {N}
- Resolved this week: {N}

### Last Week — Wins & Impact
**UKCAUD:**
- [Narrative bullets]

**DIST:**
- [Narrative bullets]

**UKCAS:**
- [Narrative bullets]

### Coming Up
**UKCAUD:**
- [Key priorities]

**DIST:**
- [Key priorities]

### Blockers (Critical Only)
- [Only items blocking milestones or requiring escalation]
- None if nothing critical

### Goal Progress
| Goal | Progress | Phase | Status |
|------|----------|-------|--------|
```

If a daily brief exists for today, append under `## Meeting Prep`. Otherwise create the section in a new brief file.

### Step 8: Log to Metrics

Append to `workspace/coordinator/system-metrics.md`:
```
| {date} | /prep | {sources used} | {fallbacks triggered} | — |
```
