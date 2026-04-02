# Focus Block

## Description

Create a focused work block in Outlook calendar via Microsoft Graph API. Finds the next available slot of the requested duration, creates a Busy calendar event, and updates the dashboard calendar panel.

Supports quick scheduling without leaving the terminal.

## Trigger

Run when user says:

- `/focus <ticket> <duration>`
- `/focus UKCAUD-789 90m`
- `/focus "UKJPD triage" 45m`
- `/focus <ticket> <duration> --at HH:MM` (specific time today)
- `/focus <ticket> <duration> --tomorrow`

## Arguments

- `task` (required): Jira ticket key or free-form label (quoted string)
- `duration` (required): time in minutes with `m` suffix, or hours with `h` suffix (e.g. `90m`, `2h`)
- `--at HH:MM` (optional): schedule at a specific time today instead of next available slot
- `--tomorrow` (optional): schedule in tomorrow's calendar instead of today

---

## Workflow

### Step 0: Load Token

Read `workspace/config/graph-token.json`. If file does not exist or token is expired:

```
Graph token not found. Run: /focus setup
```

Exit.

### Step 1: Resolve Task Label

If `task` is a Jira key (matches `[A-Z]+-\d+`):

- Fetch ticket via Atlassian MCP to get summary
- Label format: `[Focus] {key}: {summary truncated to 50 chars}`

Otherwise use the free-form label as-is:

- Label format: `[Focus] {label}`

### Step 2: Fetch Calendar Availability

Call Microsoft Graph:

```
GET /me/calendarView?startDateTime={today}T08:00:00&endDateTime={today}T19:00:00
```

(Use tomorrow's date if `--tomorrow` flag set.)

Build a list of busy slots from existing events. Working hours assumed 08:00–19:00.

### Step 3: Find Next Available Slot

Walk forward through the day in `{duration}` increments from now (or from 08:00 if `--tomorrow`).

Skip:

- Slots that overlap existing calendar events
- Slots before current time (for today)
- Lunch window 12:30–13:30 (skip if duration > 30min)

If `--at HH:MM` specified: use that time directly. Warn if it conflicts with an existing event but allow override.

First available slot found: present it for confirmation:

```
Schedule focus block:
  Task:  [Focus] UKCAUD-789: Implement Lead Schedule validation
  Start: Today 14:00
  End:   Today 15:30 (90min)
  Status: Busy

Create? (y/edit/cancel)
```

If no slot available for today: offer tomorrow.

### Step 4: Create Calendar Event

On confirmation, call Microsoft Graph:

```
POST /me/events
{
  "subject": "[Focus] {label}",
  "start": { "dateTime": "{start}", "timeZone": "Europe/London" },
  "end":   { "dateTime": "{end}",   "timeZone": "Europe/London" },
  "showAs": "busy",
  "reminderMinutesBeforeStart": 5,
  "body": {
    "contentType": "text",
    "content": "Focus block created by Claude Code productivity tool."
  }
}
```

Capture the returned event `id` for dashboard update.

### Step 5: Update Dashboard

Append the new event to `workspace/coordinator/dashboard-data.json` under `calendar.focusBlocks`:

```json
{
  "id": "{event-id}",
  "label": "{label}",
  "start": "{ISO datetime}",
  "end": "{ISO datetime}",
  "ticketKey": "{key or null}"
}
```

Trigger dashboard refresh (the dashboard polls `dashboard-data.json` every 5min via SSE).

### Step 6: Output

```
Focus block created:

  [Focus] UKCAUD-789: Implement Lead Schedule validation
  Today 14:00 — 15:30 (90min) · Busy

Calendar updated. Dashboard will refresh within 5 minutes.
```

---

## Sub-Command: `/focus setup`

Run once to configure Microsoft Graph OAuth2 access.

```
Focus block setup — this runs the Graph token setup script.
Run in a separate terminal:

  powershell -File "scripts/setup-graph-token.ps1"

Follow the device code login prompt, then re-run /focus.
```

---

## Sub-Command: `/focus list`

Show today's focus blocks and total focused time:

```
Today's focus blocks:

  09:00 — 10:30  [Focus] UKJPD triage (90min)
  14:00 — 15:30  [Focus] UKCAUD-789 (90min)

Total focused time today: 3h 0m
```

Reads from calendar API (or falls back to `dashboard-data.json` if token unavailable).

---

## Error Handling

| Error                 | Response                                                                     |
| --------------------- | ---------------------------------------------------------------------------- |
| Token expired         | "Graph token expired. Run: powershell -File scripts/setup-graph-token.ps1"   |
| No slots available    | "No {duration}min slot available today. Schedule for tomorrow? (y/n)"        |
| Conflict at --at time | "Warning: {HH:MM} conflicts with '{existing event}'. Schedule anyway? (y/n)" |
| Graph API unavailable | "Graph API unreachable. Add focus block manually in Outlook."                |

---

## Log to Metrics

```
| {date} | /focus | Graph API | -- | {task}, {duration}min, {start time} |
```
