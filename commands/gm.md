# Good Morning — AI Priority Inbox

## Description

Start-of-day command that pulls all incoming work from Jira, Teams, and calendar, merges it with overnight AI suggestions, and writes a curated priority inbox to `dashboard-data.json`. Opens the dashboard at `localhost:3000` when complete.

**Output:** Updates `dashboard-data.json` → dashboard reflects within 5 seconds.

**Graceful degradation:** Any source failure is skipped and flagged; the inbox still populates from available sources.

## Trigger

Run when user says:

- `/gm`
- "good morning" / "start of day"
- "what's on my plate today"

---

## Workflow

### Step 0: Load Config and Context

Read `workspace/config/system.json` and `workspace/config/projects.json`.

Determine today's date (`YYYY-MM-DD`) and day of week.

Read `workspace/coordinator/dashboard-data.json` — extract:

- `overnightAnalysis.projects` — AI suggestions from last night's run
- `overnightAnalysis.topPriorityAction` — the top recommended action
- `priorityInbox.standingBacklog` — persistent items that never go away until done

Read `workspace/config/personal-projects.json` — the personal AI projects list.

---

### Step 1: Parallel Data Pulls

Run all pulls in parallel. Capture errors gracefully.

#### 1a. Jira Inbox (via Atlassian MCP)

**Primary inbox JQL** — everything assigned to, reported by, or commented on by Liam today:

```
(assignee = currentUser() OR reporter = currentUser() OR comment ~ "Liam Bond")
AND updated >= startOfDay()
ORDER BY priority DESC, updated DESC
```

**Open sprint work:**

```
project = UKCAUD AND assignee = currentUser() AND sprint in openSprints()
AND status != Done ORDER BY priority DESC
```

**Escalations:**

```
project = DIST AND (reporter = currentUser() OR reporter in membersOf("uk-audit"))
AND status != Closed ORDER BY priority DESC
```

**Support:**

```
project = UKCAS AND status != Closed ORDER BY priority DESC
```

**SLA breach alerts:**

- DIST open >10 days: `project = DIST AND status != Closed AND created <= -10d`
- UKCAS L3 without UKCAUD link: `project = UKCAS AND labels = "L3-Product/Dev" AND issueFunction not in linkedIssuesOf("project = UKCAUD")`

For each ticket, capture: key, summary, priority, status, due date, project, age in days.

#### 1b. Teams Unread (via Playwright MCP — best effort)

Navigate to Microsoft Teams. Extract unread messages and @mentions from:

- Direct messages
- `#uk-team` channel (or any channels with @mentions)
- Any messages requiring a reply

Capture: sender, channel, message preview, timestamp.

**If Playwright unavailable:** flag as SKIPPED.

#### 1c. Calendar (via Microsoft Graph API or Playwright)

If `workspace/coordinator/graph-token.json` exists:

- Call `GET /me/calendarView?startDateTime={today}T00:00:00&endDateTime={today}T23:59:59`
- Extract: meeting name, start time, duration, attendees, online link

Else fall back to Playwright on Outlook Web Calendar.

Extract today's meetings and next 5 upcoming days for "week ahead".

For each meeting: check if it matches an initiative name or ticket (context linking).

**If both unavailable:** flag as SKIPPED.

---

### Step 2: AI Curation — Build Priority Inbox

With all gathered data, use AI reasoning to classify every item into one of four buckets:

**URGENT** — needs action today, SLA risk, or escalation:

- Any SLA breach (DIST >10d, UKCAS L3 without ticket)
- Tickets overdue or due today
- Teams @mentions requiring a reply within the day
- Items with `priority = Highest` or `Blocker`

**AI SUGGESTED** — recommendations from overnight analysis:

- Extract items from `overnightAnalysis.topPriorityAction`
- Extract HIGH priority suggestions from `overnightAnalysis.projects.*`
- Format as actionable cards with effort estimate and rationale

**TODAY** — planned work for today:

- Open sprint tickets In Progress
- Meetings scheduled today
- Teams messages needing same-day response (non-urgent)
- Tickets due end of week not yet started

**BACKLOG** — not today, but on radar:

- Open sprint tickets To Do
- Teams messages that can wait
- Standing backlog items (from `standingBacklog` in current dashboard-data.json):
  1. UKJPD triage — 56 UPFR items
  2. UKPFR crossover — 82 ideas
  3. Teams channel config
  4. Jira Rules 1 + 2 deployment

For each item, include:

- `id` — unique identifier (ticket key, or generated slug)
- `type` — "jira" | "teams" | "ai-suggestion" | "standing-backlog" | "meeting"
- `label` — short display text (ticket key + summary, or meeting name)
- `detail` — one sentence of context
- `source` — where it came from
- `priority` — "URGENT" | "HIGH" | "MED" | "LOW"
- `effort` (AI suggestions only) — "S" | "M" | "L"
- `dueText` (optional) — "Due today", "SLA breach 2h", "Due Friday"
- `countdownMs` (URGENT only) — milliseconds until SLA deadline (for timer display)

---

### Step 3: Write to dashboard-data.json

Read the current `workspace/coordinator/dashboard-data.json`.

Update the `priorityInbox` section:

```json
{
  "priorityInbox": {
    "generatedAt": "<ISO timestamp>",
    "urgent": [ ...items ],
    "aiSuggested": [ ...items ],
    "today": [ ...items ],
    "backlog": [ ...items ],
    "standingBacklog": [
      { "id": "ukjpd-triage", "label": "UKJPD triage — 56 UPFR items", "type": "standing-backlog", "priority": "MED" },
      { "id": "ukpfr-crossover", "label": "UKPFR crossover — 82 ideas", "type": "standing-backlog", "priority": "MED" },
      { "id": "teams-config", "label": "Teams channel config (stubbed TODOs)", "type": "standing-backlog", "priority": "LOW" },
      { "id": "jira-rules", "label": "Jira Rules 1 + 2 — ready to deploy", "type": "standing-backlog", "priority": "HIGH" }
    ],
    "calendar": {
      "todayEvents": [ ...meetings ],
      "weekAhead": [ ...events ]
    },
    "dataSources": {
      "jira": "ok | failed | partial",
      "teams": "ok | skipped | failed",
      "calendar": "ok | skipped | failed"
    }
  }
}
```

Write the updated JSON back to `workspace/coordinator/dashboard-data.json`.

---

### Step 4: Inline Summary

Print a concise summary to the conversation:

```
Good morning! {day}, {date}

🔴 URGENT ({n} items)
  - [DIST-xxx] SLA breach: 2h remaining
  - [UKCAS-xxx] L3 without UKCAUD ticket (3 items)

🤖 AI SUGGESTED ({n} actions)
  - [HIGH/S] Deploy Jira Rule 1 — unblocked, 10min
  - [MED/M] Enhance /ticket epic sub-command

🟡 TODAY ({n} items)
  - [UKCAUD-xxx] [ticket summary] — In Progress
  - 09:30 Sprint standup (15min)
  - [UKCAUD-xxx] Due Friday, not started

🔵 BACKLOG ({n} items)
  + 4 standing backlog items

📅 Meetings today: [count] | Week ahead: [count]

Dashboard updated → opening localhost:3000
```

---

### Step 5: Open Dashboard

Execute in a background process:

```
start http://localhost:3000
```

If pm2 shows the dashboard is not running, notify:

```
⚠️ Dashboard not running. Start with: pm2 start "C:\Users\liam.bond\Documents\Productivity Tool\dashboard\ecosystem.config.js"
```

---

### Step 6: Append to Daily Log

Append morning entry to `workspace/coordinator/daily-log.md`:

```markdown
## {today} ({day of week}) — Morning

**Inbox snapshot:** {n} urgent, {n} today, {n} backlog
**Top AI suggestion:** {topPriorityAction}
**Meetings today:** {list or "none"}
**Sprint:** {x} to do, {y} in progress, {z} done
```

---

### Step 7: Log Metrics

Append to `workspace/coordinator/system-metrics.md`:

```
| {date} | /gm | jira:{ok/fail} teams:{ok/skip} cal:{ok/skip} | {n urgent} {n today} | — |
```
