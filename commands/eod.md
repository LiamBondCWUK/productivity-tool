# Evening Wrap

## Description

End-of-day capture: synthesizes accomplishments from Jira activity, Office file edits, Teams messages, and the day's log entries. Writes a structured `daily-log.md` entry in the new standard format, appends time totals to `time-log.json`, and updates `dashboard-data.json`.

**Idempotent:** If an evening entry already exists for today, updates it rather than appending a duplicate.

**Context-aware:** If the daily log already has entries for today (from `/gm`, `/log`, or sub-agent handoffs), synthesizes from those first. Only prompts if the log is empty.

Tone: **Reflective, brief** — capture what's worth remembering.

## Trigger

Run when user says:

- `/eod`
- "end of day" / "wrapping up" / "evening check-in"
- "that's a wrap" / "signing off"

---

## Workflow

### Step 0: Load Config + Scan Existing Log

Read `workspace/config/projects.json`.

Read `workspace/coordinator/daily-log.md` and check for entries with today's date.

If entries exist (from `/gm`, `/log`, or handoff files): synthesize directly — no questions needed.

If log is empty for today: ask one open question:

```
Wrapping up — what happened today? Accomplishments, decisions, blockers?
```

### Step 1: Pull Jira Activity (via Atlassian MCP)

Query tickets updated today:

```
JQL: (assignee = currentUser() OR reporter = currentUser() OR comment ~ "Liam Bond")
     AND updated >= startOfDay() ORDER BY updated DESC
```

For each ticket: capture key, summary, status transition (if any), and story points.

Cross-reference with morning brief's priority inbox to see what was accomplished vs planned.

### Step 2: Scan Office Files Modified Today

Run via PowerShell (best-effort):

```powershell
Get-ChildItem "$env:USERPROFILE\Documents" -Recurse -Include *.xlsx,*.docx,*.pptx |
  Where-Object { $_.LastWriteTime -ge (Get-Date).Date } |
  Select-Object Name, LastWriteTime, FullName |
  Sort-Object LastWriteTime -Descending
```

For each modified file:

- Flag as `[NOTABLE]` if the filename suggests strategic work (roadmap, schedule, spec, plan, strategy, OKR)
- Estimate time spent (default: 30min unless multiple saves suggest longer)

### Step 3: Pull Teams Activity (via Playwright — best effort)

Attempt to navigate to Teams and capture:

- Unread messages received (count and senders)
- Messages posted by the user today (channel, content summary)
- Any @mentions or direct messages

**If Playwright unavailable:**

```
SKIPPED: Teams data unavailable. Add notable conversations manually via /log.
```

### Step 4: Pull Calendar (via Microsoft Graph API or Playwright)

Fetch today's completed meetings:

- Meeting title, time, duration
- Flag as `[NOTABLE]` if > 30min or matches strategic keywords (strategy, OKR, roadmap, stakeholder, retro)

Tomorrow's meetings (for carry-forward):

- List tomorrow's events from calendar for pre-load section

**If calendar unavailable:** Skip and log.

### Step 5: Synthesize and Present Draft Entry

Present a structured draft for review/confirmation:

```
EOD Summary for {today}:

Jira Activity ({n} tickets):
  - [UKCAUD-xxx] Transitioned "..." -> Done
  - [UKCAS-xxx] Triaged, labelled L3-Product/Dev

Office Files ({n} files):
  - CW_Q2_Roadmap_2026.pptx [NOTABLE] ~45min
  - Lead_Schedule_Spec_v3.xlsx ~30min

Meetings ({n}):
  - 09:30 Sprint standup (15min)
  - 14:00 Product strategy review (60min) [NOTABLE]

Teams: {n} messages sent, {n} received

Notes from /log today:
  - [any /log entries from daily-log.md for today]

Confirm? (y/edit/cancel)
```

### Step 6: Write Daily Log Entry (New Standard Format)

Find or create today's section in `workspace/coordinator/daily-log.md`.

If a `## {today}` section exists: update it. Otherwise append:

```markdown
## {YYYY-MM-DD} ({Day of Week})

### Jira Activity

- [{key}] Transitioned "{summary}" -> {status} ({SP} SP)
- [{key}] Created {type}: "{summary}"
- [{key}] Triaged -> labelled {label}, created {linked-key}

### Meetings

- {HH:MM} {Meeting Title} ({duration}min) [{NOTABLE if flagged}]

### Documents

- {filename} — edited ~{time}min [{NOTABLE if flagged}]

### Teams Activity

- {summary of posts/receives}

### Time Log

- {ticket or task}: {Hh MMm} (from time tracker or estimate)
- Meeting overhead: {Hh MMm}
- Total: {Hh MMm}

### Notes

{any <!-- tag: note --> entries from /log today}

### Tomorrow's Priorities

- [ ] {carry-forward item 1}
- [ ] {carry-forward item 2}
```

### Step 7: Update time-log.json

Append today's session summary to `workspace/coordinator/time-log.json`:

```json
{
  "date": "{YYYY-MM-DD}",
  "sessions": [
    {
      "label": "{ticket or task}",
      "durationMinutes": {n},
      "source": "tracker|estimate"
    }
  ],
  "totalMinutes": {n},
  "meetingMinutes": {n},
  "notableItems": ["{IBP-notable items}"]
}
```

### Step 8: Update dashboard-data.json

Write the EOD summary to `workspace/coordinator/dashboard-data.json`:

```json
{
  "lastEod": {
    "date": "{today}",
    "completedCount": {n},
    "jiraActivity": [{key, summary, transition}],
    "standingBacklogProgress": {notes},
    "tomorrowPriorities": [{label}]
  }
}
```

### Step 9: Output

```
EOD logged for {today}.

Done ({n}): {key list}
Notable: {flagged items}
Time: {today total}h | This week: {week total}h

Tomorrow: {n} meetings, {n} carry-forward items.
Logged to: workspace/coordinator/daily-log.md + time-log.json
```

### Step 10: Log to Metrics

```
| {date} | /eod | {sources: jira+office+teams+cal} | {fallbacks triggered} | -- |
```
