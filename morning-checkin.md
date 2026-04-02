# Morning Check-In Skill

## Description

Start-of-day orientation: surface this week's priorities, catch up on yesterday's carryover, and write a structured daily brief to disk. Grounds you in today, this week, this month, recent insights, and things not to forget.

Tone: **Brief, conversational** — this is a quick grounding, not a status meeting.

## Trigger

Run when user says:

- `/morning-checkin`
- "good morning" / "start of day" / "morning check-in"
- "what's on my plate today"

## Workflow

### Step 1: Load Context

Read these files in parallel:

- `coordinator/weekly-plan.md` → extract "🔥 This Week: Top Priorities" and "🔮 Looking Ahead" sections
- `coordinator/daily-log.md` → find yesterday's evening entry (if any); also scan for any Meeting Pre-load entry for today
- `initiatives/ukcaud/weekly-todos.md` → extract `Week Start:` metadata line
- `initiatives/ukcas/weekly-todos.md` → extract `Week Start:` metadata line

Parse the weekly plan priorities by initiative (Cross-Cutting, UKCAUD, UKCAS, DIST).

### Step 1b: Load Monthly Context

From the "🔮 Looking Ahead" section already loaded, extract any dates within the next 4 weeks (relative to today). Format as: `DATE — Initiative: Event`.

Also scan `initiatives/ukcaud/milestones.md`, `initiatives/ukcas/milestones.md`, and `initiatives/dist/milestones.md` for upcoming milestone targets within 4 weeks.

Hold these as a dated list for the brief.

### Step 1c: Load Recent Insights

Glob `coordinator/notes/` for the 3 most recently dated files (YYYY-MM-DD-\*.md pattern). Read each and extract anything flagged as IBP-notable, a major decision, or a resolved risk.

Also scan `coordinator/daily-log.md` for any IBP-notable flags in the last 3 days.

Hold as 1-2 bullets for the brief. Skip if nothing stands out.

### Step 1d: Load Meeting Prep Context

Check the daily log for a Meeting Pre-load entry for today (written by the previous evening's check-in). If found, extract tomorrow's meetings list.

The user may also provide meetings in their morning response. For any named meeting (e.g., "UKCAUD sync", "DIST arch planning"), surface 1-2 relevant context bullets from:

- `coordinator/weekly-plan.md` (this week's priorities)
- `initiatives/ukcaud/context.md`, `initiatives/ukcas/context.md`, or `initiatives/dist/context.md` if topic is UKCAUD/UKCAS/DIST

Load meeting context lazily — only look up what's actually listed. Skip this step if no named meetings are available yet (user can add them in their morning response and context will be captured in the log).

### Step 1e: Commitment Progress Check (Wednesday+)

**Only run this step if today is Wednesday or later in the week (Wed/Thu/Fri).**

After loading the weekly plan (Step 1):

1. Parse each item from "🔥 This Week: Top Priorities" as a tracked commitment. Extract commitment names by finding all `**bold text**` items under each initiative subsection.
2. Scan `coordinator/daily-log.md` for evidence of progress on each commitment — look for mentions, related accomplishments in evening entries, and ad-hoc notes.
3. Assign each commitment a status:
   - ✅ Done — clear evidence of completion in the log
   - 🟢 On track — progress noted, no blockers
   - 🟡 In progress — some work done but not complete
   - 🔴 Not started — no mentions in the daily log
   - ⚠️ At risk — started but blocked, or deadline approaching with insufficient progress
4. Include a commitment status section in the daily brief file (after "🔥 This Week (Top 3)"):

```markdown
## 📊 Commitment Check (Wed+)

[For each weekly priority: one-line status]

- **[Commitment name]**: [status emoji] [brief explanation]
- **[Commitment name]**: [status emoji] [brief explanation]
  ...
```

5. If any items are 🔴 or ⚠️, flag them in the inline output:

```
⚠️  At-risk commitments: [list names] — see daily brief for details
```

**On Monday/Tuesday**: Skip this step entirely. The daily brief surfaces the top 3 from the weekly plan as today's context (current behavior in Step 3).

### Step 1f: Tool Factory Proposals

Check if `~/.claude/homunculus/proposals-queue.md` exists and contains any proposals with **Status: ⏳ pending**.

**If pending proposals exist**, surface them before moving on:

```
🏭 Tool Factory found N new tool proposals from yesterday's sessions:

1. [S] auto-property-report (high) — Automates report generation you ran 4x this week
2. [M] jira-bulk-update (medium) — Batch ticket updates instead of one-by-one

For each: approve / reject / defer?
```

Wait for user response. For each proposal:

- **approve**: Run `sed` or edit to change status from `⏳ pending` to `✅ approved` in proposals-queue.md
- **reject**: Change status to `❌ rejected`
- **defer**: Leave as `⏳ pending` (will surface again tomorrow)
- **"approve all"**: Approve all pending proposals at once
- **"skip"**: Proceed without reviewing (will surface again tomorrow)

After processing responses, if any proposals were approved:

```
✅ Approved N proposals. Run /tool-factory build <name> when ready to build.
```

**If no pending proposals**: Skip this step silently (no output).

### Step 1.5: Stale Todos Check

Compare the `Week Start:` date from each initiative's todos against the current Monday's date.

**If any file is from a previous week**, surface a warning before the morning summary:

```
⚠️  Initiative todos are out of date:
- initiatives/ukcaud/weekly-todos.md → Week of YYYY-MM-DD (current week: YYYY-MM-DD)
- initiatives/ukcas/weekly-todos.md → Week of YYYY-MM-DD (current week: YYYY-MM-DD)
- initiatives/dist/weekly-todos.md → Week of YYYY-MM-DD (current week: YYYY-MM-DD)

Looks like /weekly-todo-review was missed last Friday. Options:
1. Run /weekly-todo-review now to archive and reset (recommended, ~5 min)
2. Say "skip" to proceed with morning check-in anyway

What would you like to do?
```

- If user runs `/weekly-todo-review`: execute that skill, then continue with morning check-in
- If user says "skip": log a process note in `coordinator/daily-log.md` and proceed normally
- If todos are current: proceed silently to Step 2 (no output needed)

### Step 2: Identify Yesterday's Carryover

Scan `daily-log.md` for the most recent evening entry (format: `## YYYY-MM-DD — Evening`).

If found, extract:

- What was accomplished
- Any open items or blockers mentioned
- Anything flagged as needing follow-up today

If no evening entry found: skip carryover section.

### Step 3: Write Daily Brief and Surface Summary

Write a structured daily brief file to `coordinator/daily-brief-YYYY-MM-DD.md` (use today's actual date).

**File content** (write to disk):

```markdown
# Daily Brief — YYYY-MM-DD

## 📅 Today

**Meetings**: [list each meeting with time, from pre-load or user input]
**Focus**: [1-3 focus areas from user's stated priorities or weekly plan top items]

## 🔥 This Week (Top 3)

[Top 3 items from weekly plan "This Week" section — one line each]

## 🗓️ This Month (Key Dates)

[Upcoming dates within 4 weeks: DATE — Initiative: Event]

## 💡 Recent Insights

[1-2 bullets from IBP-notable items in recent daily log or coordinator notes]

## 🧠 Don't Forget

[Open blockers, pending follow-ups, carryover items from yesterday's evening entry]

## 📋 Meeting Prep

[Only if named meetings present: per-meeting context, 1-2 bullets each. Omit section if no named meetings.]
```

**Inline output** (what you print in the conversation — intentionally short):

```
Daily brief written → coordinator/daily-brief-YYYY-MM-DD.md
Open: code coordinator/daily-brief-YYYY-MM-DD.md

🔥 [Single most important item from weekly plan, one line]
⚠️  [Any urgent flag or open blocker, if applicable — omit if none]
```

The inline output is 2-4 lines max. The full brief is in the file — don't repeat it inline.

If the "Focus" and "Don't Forget" sections aren't fully known yet (user hasn't responded), write what's available from context and leave a `<!-- TODO: update after user response -->` placeholder. Update the file after Step 5.

### Step 4: Guided Prompt

Instead of a generic "What's your focus?", provide a **time-aware, directive prompt** that helps the user start their day productively. This replaces the old open-ended question.

**How to build the prompt:**

1. **Note the current time** and scan today's meetings from the pre-load (Step 1d). Calculate time blocks: how long until the first meeting? Any long gaps between meetings? When is the biggest focus block?

2. **Identify 2-3 options** from this week's commitments, carryover items, and blockers — ranked by a mix of urgency, quick-win potential, and strategic value:
   - **Quick win** (10-20 min): Something small that unblocks other work or lets the user walk into a meeting with progress. Look for: items blocking others, lightweight follow-ups, messages that need sending.
   - **Medium lift** (30-60 min): Substantive progress on a weekly commitment. Look for: items that are 🟡 or 🔴 on the commitment check, approaching deadlines.
   - **Deep focus** (1-2+ hrs): Strategic or creative work best saved for the largest uninterrupted block. Look for: 🔴 not-started commitments, planning/scoping work, items flagged as "needs alignment."

3. **Frame with time context**, e.g.:

   ```
   It's 8:20 AM — you've got [meeting] at [time], so here's how to use the next [N] minutes:

   **Quick win (N min):** [action] — [why now]
   **Medium lift (N min):** [action] — [why it matters]
   **Deep focus (save for [time block]):** [action] — [context]

   What sounds right?
   ```

**Principles:**

- Lead with the time and the constraint ("you have X at Y")
- Be specific about actions, not categories ("assemble the participant list" not "work on AiDA stuff")
- Explain why each option matters right now
- Position the deep focus option for the right time block, don't suggest it if there's only 20 minutes
- If there's an obvious P0 (e.g., a hard deadline today), lead with that directly rather than offering choices
- Accept free-form response — the user may pick an option, combine them, or go a different direction entirely

### Step 5: Append to Daily Log

Append a timestamped morning entry to `coordinator/daily-log.md`:

```markdown
## YYYY-MM-DD — Morning

**Focus today:**
[User's stated focus, 1-3 items]

**Meetings today:**
[List of today's meetings with times, from user input or pre-load]

**Carryover/context:**
[Any carryover from yesterday, or "None" if first day]

**Blockers/surprises:**
[User-mentioned blockers, or "None"]
```

Also update `coordinator/daily-brief-YYYY-MM-DD.md` with the user's stated focus and meetings if they weren't available in Step 3.

Use today's actual date. Keep entries concise — this is a log, not a report.

### Step 6: Confirm

Brief confirmation:

```
Logged. Have a good day — let me know if anything changes.
```

No need for lengthy output after logging.

## Error Handling

### No weekly-plan.md found

```
⚠️  Can't find coordinator/weekly-plan.md. Proceeding without weekly context.
What are you focusing on today?
```

### daily-log.md doesn't exist

Create it with the blank template before appending:

```markdown
# Daily Log - Week of YYYY-MM-DD

Week: YYYY-MM-DD → YYYY-MM-DD

---
```

### coordinator/notes/ is empty or has no recent files

Skip Step 1c silently — omit the "Recent Insights" section from the brief.

## Notes

- This skill is intentionally lightweight — under 2 minutes to run
- Don't ask follow-up questions after the user responds; just log and confirm
- If the user's response is very short ("just DCA stuff"), that's fine — log what they said
- Ad-hoc log captures during the day don't require this skill (see CLAUDE.md for pattern)
- The daily brief file is the primary output — the inline summary is just a quick pointer

---

**Last Updated**: 2026-03-05
**Version**: 1.3 (Step 4: replaced generic "What's your focus?" with time-aware guided prompt)
