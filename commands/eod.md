# Evening Wrap

## Description

End-of-day capture: synthesizes accomplishments from the day's log, conversation context, and Jira activity. Maps progress to weekly commitments, flags IBP-notable items for Friday retro, pre-loads tomorrow's meetings, and appends to the daily log.

**Idempotent:** If an evening entry already exists for today, updates it rather than appending a duplicate.

**Context-aware:** If the daily log already has entries for today (from `/gm`, ad-hoc notes, or sub-agent handoffs), synthesizes directly without asking. Only prompts if the log is empty for today.

Tone: **Reflective, brief** — capture what's worth remembering, don't reconstruct the whole day.

## Trigger

Run when user says:
- `/eod`
- "end of day" / "wrapping up" / "evening check-in"
- "that's a wrap" / "signing off"

## Workflow

### Step 0: Load Config + Scan Handoff Files

Read `workspace/config/system.json` and `workspace/config/projects.json`.

Scan for today's sub-agent handoff files:
```
Glob: workspace/coordinator/notes/{today}-handoff-*.md
```

If handoff files exist:
1. Read each (they're typically 5-10 lines)
2. Extract task name, status, and created keys/IDs
3. Hold as pre-populated accomplishments for Step 2

### Step 1: Synthesize or Ask

Read `workspace/coordinator/daily-log.md` and check for entries with today's date.

**If entries exist for today** (morning entry, ad-hoc logs, handoff files):
- Synthesize directly from available context — no question needed
- Draw from: daily log entries, handoff files, conversation thread, daily brief

**If the log is empty for today** (fresh session, no prior entries):
- Ask one open question:
```
Wrapping up — what happened today? Accomplishments, decisions, or anything worth capturing?
```

If a morning focus entry was found, frame contextually:
```
Wrapping up — how did today go?

(You mentioned focusing on: [morning focus items from daily brief])

What got done, and anything worth capturing — decisions, blockers, surprises?
```

At most one follow-up question:
```
Anything blocking progress, or any decisions made today worth logging?
```

Skip follow-up if the user already covered blockers/decisions.

### Step 2: Pull Jira Activity (via Atlassian MCP)

Query for tickets updated today by the user:

```
JQL: project in (UKCAUD, DIST, UKCAS) AND updatedDate >= startOfDay()
     AND assignee = currentUser() ORDER BY updated DESC
```

Cross-reference with morning brief's "Top 3" to see what was accomplished vs planned.

### Step 3: Map to Weekly Commitments

Read `workspace/coordinator/weekly-plan.md` → "This Week: Top Priorities".

For each commitment, check:
- Daily log mentions → progress noted
- Jira activity → tickets moved forward
- Conversation context → decisions made

Flag items that advanced and items that didn't move.

### Step 4: IBP-Notable Flagging

Scan today's accomplishments for items worth surfacing at Friday's sprint retrospective:

**Flag as IBP-notable if:**
- A milestone was hit or a key deliverable shipped
- A strategic decision was made
- A cross-team dependency was resolved
- An escalation was resolved or a customer issue fixed
- Something surprised or shifted priorities significantly

Mark with `[IBP]` tag in the log entry.

### Step 5: Pre-load Tomorrow's Meetings (via Playwright — best effort)

Attempt to navigate to Outlook calendar for tomorrow:
1. Extract meeting names and times
2. Write a "Meeting Pre-load" section for tomorrow

**If Playwright unavailable:**
```
SKIPPED: Calendar data unavailable. Add tomorrow's meetings manually to daily log if needed.
```

### Step 6: Append Evening Entry to Daily Log

Check if an evening entry for today already exists in `workspace/coordinator/daily-log.md`.
- If yes: update the existing entry
- If no: append new entry

```markdown
## {today} — Evening

**Accomplished:**
- [Synthesized accomplishments — merged from handoff files, user input, Jira activity]
- [IBP] [IBP-notable items flagged]

**Decisions:**
- [Any strategic decisions made today]

**Blockers:**
- [Active blockers — new or ongoing]

**Commitment Progress:**
- [Commitment]: [status — advanced / no change / completed]

**Tomorrow:**
- Meetings: [list from calendar, or "check calendar"]
- Carry forward: [items not completed today]

---
```

### Step 7: Update Initiative Weekly-Todos

For each initiative directory in `workspace/initiatives/`:
- If an accomplishment relates to that initiative, move the relevant item from "In Progress" to "Completed" in the weekly-todos file
- If a new blocker was identified, add it to "Blocked"
- Update "Last Updated" timestamp

### Step 8: Inline Output

Print a condensed summary:

```
Evening wrap for {today}:

✅ Done:
- [Key accomplishments]

📌 Decisions:
- [Key decisions, if any]

🚧 Carry forward:
- [Items for tomorrow]

{IBP flags if any}
{Tomorrow's meetings if available}

Logged to: workspace/coordinator/daily-log.md
```

### Step 9: Log to Metrics

Append to `workspace/coordinator/system-metrics.md`:
```
| {date} | /eod | {sources used} | {fallbacks triggered} | — |
```
