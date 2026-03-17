# Morning Briefing

## Description

Start-of-day orientation: pulls data from Jira, Teams/Calendar (via Playwright), local workspace, Confluence milestones, and Atlassian Goals. Synthesizes into a unified daily brief with ranked priorities, blockers, meeting prep, and commitment tracking.

**Idempotent:** If a daily brief already exists for today, updates it rather than creating a duplicate.

**Graceful degradation:** If any data source is unavailable, continues with available sources and flags what was skipped.

Tone: **Brief, conversational** — quick grounding, not a status meeting.

## Trigger

Run when user says:
- `/gm`
- "good morning" / "start of day" / "morning briefing"
- "what's on my plate today"

## Workflow

### Step 0: Load Config

Read `workspace/config/system.json` and `workspace/config/projects.json`.

Extract: project keys, workspace paths, meeting name, commitment check day, Atlassian domain.

Determine today's date (`YYYY-MM-DD`) and day of week.

Check if `workspace/coordinator/daily-brief-{today}.md` already exists. If yes, set `isUpdate = true`.

### Step 1: Parallel Data Pulls

Run these 5 pulls in parallel. Each pull is independent. If any fails, capture the error and continue with remaining pulls.

#### 1a. Jira Pull (via Atlassian MCP)

For each project in `projects.json`:

**UKCAUD** (type: delivery):
```
JQL: project = UKCAUD AND assignee = currentUser() AND sprint in openSprints()
     ORDER BY priority DESC, status ASC
```
Categorize results by status: To Do, In Progress, Done, Blocked.

```
JQL: project = UKCAUD AND assignee = currentUser() AND due <= endOfWeek()
     AND status != Done ORDER BY due ASC
```
Flag tickets due this week not yet started.

**DIST** (type: escalation):
```
JQL: project = DIST AND (reporter = currentUser() OR reporter in membersOf("uk-audit"))
     AND status != Closed ORDER BY priority DESC
```

**UKCAS** (type: support):
```
JQL: project = UKCAS AND status != Closed ORDER BY priority DESC
```
Group by escalation label (L1/L2/L3). Flag L3 items needing triage.

**SLA/Aging alerts:**
- DIST escalations open >10 days: `project = DIST AND status != Closed AND created <= -10d`
- UKCAS L3 bugs without UKCAUD link: `project = UKCAS AND labels = "L3-Product/Dev" AND issueFunction not in linkedIssuesOf("project = UKCAUD")`

#### 1b. Local Workspace Pull

Read in parallel:
- `workspace/coordinator/weekly-plan.md` → extract "This Week: Top Priorities" and "Looking Ahead"
- `workspace/initiatives/ukcaud/weekly-todos.md` → current priorities + blocked items
- `workspace/initiatives/dist/weekly-todos.md` → current priorities
- `workspace/initiatives/ukcas/weekly-todos.md` → current priorities
- `workspace/coordinator/daily-log.md` → yesterday's evening entry (carryover items)

**Drift detection:** Compare local weekly-todos "In Progress" items against Jira ticket statuses. If a ticket is marked Done in Jira but listed as "In Progress" locally, flag it:
```
DRIFT: UKCAUD-456 is Done in Jira but still listed as In Progress in weekly-todos
```

#### 1c. Teams/Calendar Pull (via Playwright MCP — best effort)

Attempt to navigate to Teams/Outlook calendar for today's meetings:

1. Navigate to Outlook calendar (today's view)
2. Extract: meeting name, time, attendees (if visible), agenda (if present)
3. For each meeting, check if context exists in workspace:
   - Meeting name matches something in `workspace/coordinator/notes/`
   - Meeting relates to an initiative (keyword match against project names)
   - Extract 1-2 relevant context bullets from initiative context files

**If Playwright unavailable or fails:**
```
SKIPPED: Teams/Calendar data unavailable (Playwright not connected). Add meetings manually if needed.
```

#### 1d. Confluence Pull (via Atlassian MCP)

Search for milestones due within 4 weeks:
- Read `workspace/initiatives/*/milestones.md` for dates within next 28 days
- If Confluence page IDs are referenced, fetch page titles for context

#### 1e. Atlassian Goals Pull (via GraphQL — best effort)

```graphql
query {
  goals_search(filter: { ownerAri: "{userAri}" }, first: 20) {
    edges {
      node {
        name
        state
        score
        phase { value }
      }
    }
  }
}
```

**If Goals API unavailable:**
```
SKIPPED: Goals API unavailable. Goal progress not included.
```

### Step 2: Commitment Progress Check (Wednesday+)

**Only run if today is Wednesday, Thursday, or Friday** (configurable via `system.json` → sprintCadence.commitmentCheckDay).

1. Parse each item from weekly plan "This Week: Top Priorities" as a tracked commitment
2. Scan `workspace/coordinator/daily-log.md` for progress evidence
3. Cross-reference with Jira ticket statuses from Step 1a
4. Assign status per commitment:
   - ✅ Done — evidence of completion in log + Jira status Done
   - 🟢 On track — progress noted, no blockers
   - 🟡 In progress — some work done but not complete
   - 🔴 Not started — no mentions in daily log, Jira status unchanged
   - ⚠️ At risk — started but blocked, or deadline approaching with insufficient progress

### Step 3: Synthesize Daily Brief

Build `workspace/coordinator/daily-brief-{today}.md`:

```markdown
# Daily Brief — {today} ({day of week})

## Top 3 Priorities

1. [Highest impact/urgency item from all sources]
2. [Second priority]
3. [Third priority]

## Sprint Status (UKCAUD)

| Status | Count | Tickets |
|--------|-------|---------|
| To Do | N | UKCAUD-xxx, ... |
| In Progress | N | UKCAUD-xxx, ... |
| Done | N | ... |
| Blocked | N | ... |

## Escalations (DIST)

- [Open escalations with age]

## Support (UKCAS)

- L3 items needing triage: N
- [High priority items]

## SLA Alerts

- [DIST escalations >10 days]
- [UKCAS L3 without UKCAUD ticket]

## Meetings Today

| Time | Meeting | Context |
|------|---------|---------|
| HH:MM | Meeting Name | [relevant context bullets] |

## Commitment Check (Wed+)

[Only if Wednesday or later]
- **[Commitment]**: [status emoji] [brief explanation]

## Drift Detected

[Only if drift found between local files and Jira]

## Data Sources

- Jira: [PASS/FAIL per project]
- Teams/Calendar: [PASS/SKIPPED]
- Goals: [PASS/SKIPPED]
- Confluence: [PASS/SKIP]

---

*Generated by /gm at {timestamp}*
```

### Step 4: Inline Output

Print a condensed version to the conversation:

```
Good morning! Here's your brief for {today}:

🔥 Top 3:
1. [Priority 1]
2. [Priority 2]
3. [Priority 3]

📊 Sprint: X to do, Y in progress, Z done, W blocked
🔺 DIST: N open escalations (N aging >10d)
🐛 UKCAS: N open (N L3 needing triage)

📅 Meetings: [list or "none scheduled"]

{commitment check if Wed+}
{drift warnings if any}
{SLA alerts if any}

Full brief: workspace/coordinator/daily-brief-{today}.md
```

### Step 5: Log to Metrics

Append to `workspace/coordinator/system-metrics.md`:

```
| {date} | /gm | {sources used} | {fallbacks triggered} | — |
```

### Step 6: Append Morning Entry to Daily Log

Append to `workspace/coordinator/daily-log.md`:

```markdown
## {today} — Morning

**Focus areas:**
- [Top 3 priorities listed]

**Carryover from yesterday:**
- [Items carried forward, if any]

**Sprint status:** X to do, Y in progress, Z done, W blocked
```
