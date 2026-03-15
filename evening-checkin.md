# Evening Check-In Skill

## Description

End-of-day capture: reflect on what happened, log accomplishments and decisions, and flag anything useful for the weekly IBP. Appends an evening entry to `coordinator/daily-log.md`.

Tone: **Reflective, brief** — capture what's worth remembering, don't reconstruct the whole day.

## Trigger

Run when user says:
- `/evening-checkin`
- "end of day" / "wrapping up" / "evening check-in"
- "that's a wrap" / "signing off"

## Workflow

### Step 0: Scan Handoff Files

Before asking the user anything, scan for today's sub-agent handoff files:

```
Glob: coordinator/notes/YYYY-MM-DD-handoff-*.md
```

(Replace `YYYY-MM-DD` with today's date.)

If handoff files exist:
1. Read each one (they're 5-10 lines each)
2. Extract task name, status, and created keys/IDs
3. Hold these as pre-populated accomplishments for Step 4

This ensures sub-agent work is captured even if the user forgets to mention it.

### Step 1: Synthesize or Ask (Context-Aware)

Read `coordinator/daily-log.md` and check for any entries for today (morning, ad-hoc, or prior evening entries — anything with today's date `YYYY-MM-DD`).

**If entries exist for today** (log already has content): synthesize directly from available context — no question needed. Draw from:
- All logged entries in `coordinator/daily-log.md` for today
- Handoff files found in Step 0
- Updates and decisions shared in the current conversation thread

Proceed directly to Step 2 (append entry).

**If the log is empty for today** (fresh session, no prior entries): ask one open question:

```
Wrapping up — what happened today? Accomplishments, decisions, or anything worth capturing for the week?
```

If a morning focus entry was found, frame it:

```
Wrapping up — how did today go?

(You mentioned focusing on: [morning focus items])

What got done, and anything worth capturing — decisions, blockers, surprises?
```

Keep it **one question**. If the response is very brief, you may ask one follow-up at most:

```
Anything new blocking progress, or any decisions made today worth logging?
```

Skip the follow-up if the user already covered blockers/decisions or if their response was detailed.

### Step 2: Append to Daily Log

Append a timestamped evening entry to `coordinator/daily-log.md`.

**Merge handoff results with user input**: If Step 0 found handoff files, include those accomplishments alongside what the user reported. Don't duplicate — if the user already mentioned a task that appears in a handoff file, use the handoff details (they have exact keys/IDs).

```markdown
## YYYY-MM-DD — Evening

**Accomplished:**
[What user did today — paraphrased or verbatim]
[Sub-agent completions from handoff files, e.g.: "Created AI-1233 (Page Context Awareness) — via sub-agent"]

**Decisions/context:**
[Any decisions, agreements, or context captured]

**Weekly commitment progress:**
[Map today's work back to weekly commitments. Only include commitments that were touched or are at risk.]
- [Commitment X]: advanced (describe how)
- [Commitment Y]: at risk (explain why)

**Blockers/open items:**
[Anything unresolved, or "None"]

**IBP-notable:**
[1-2 bullets worth surfacing in the weekly Wins & Impact, if anything stands out]
```

The "IBP-notable" field is optional. Only fill it when something is clearly worth including in the Friday synthesis — a shipped release, a significant decision, a milestone reached, or an important customer interaction.

**Commitment mapping guidelines**:
- Load the weekly plan's "🔥 This Week: Top Priorities" to identify commitments
- Only map commitments that were actually touched today — don't list every commitment
- "No change today" entries are optional — only include if the item is at risk
- Keep it lightweight: 2-4 lines max
- This feeds into the morning checkin's commitment progress check (Step 1e)

### Step 3: Append Process Notes

After the main evening entry, append a `## Process Notes` section to `coordinator/daily-log.md`:

```markdown
## Process Notes — YYYY-MM-DD

- [1-3 bullets: workflow friction observed, what worked well, optimization ideas]
```

Pull these from today's session — anything that felt awkward, slow, or worth fixing next time. If synthesis came from thread context, scan the conversation for friction points or process observations.

**Guidelines:**
- Keep it observational, not prescriptive (e.g., "Plan/approve cycles were frequent today for small edits" not "We should change the plan mode threshold")
- 1-3 bullets only — don't over-capture
- Skip this section if there's genuinely nothing to note (don't force it)
- This feeds into `/weekly-todo-review` to surface patterns across the week

### Step 4: Context Hygiene Note

If the current session appears large (multiple plan/execute cycles, long conversation, or a full coordinator day's worth of thread), append a brief note at the end of the evening entry:

```
**Session note**: Context window is large. Recommend starting a fresh session tomorrow — morning check-in will load only weekly plan + last evening entry.
```

**Detection heuristic**: Include this note if the conversation involved 3+ plan/approve cycles, or covered debugging + updates + reflection all in one thread. Skip it for short sessions.

### Step 5: Confirm (with IBP flag if applicable)

If IBP-notable was populated:
```
Logged. That [brief description of notable item] sounds worth including in this week's IBP summary — I'll pull it in on Friday.
```

Otherwise:
```
Logged. See you tomorrow.
```

## Error Handling

### daily-log.md doesn't exist
Create it with the blank template before appending (same as morning-checkin).

### User's response is very brief ("fine" / "okay" / "nothing special")
Accept it. Append a minimal entry:
```markdown
## YYYY-MM-DD — Evening

**Accomplished:**
[User's note, or "No details captured"]

**Decisions/context:**
None

**Blockers/open items:**
None
```

Don't push for more detail than the user wants to provide.

### Step 5.5: Tomorrow's Meeting Pre-populate (Optional)

After confirming, ask one optional question:

```
Before you go — any meetings tomorrow I should know about? I'll include them in tomorrow's brief.
(Say "skip" or just ignore to add them in the morning instead.)
```

If the user provides meetings, append a brief entry to `coordinator/daily-log.md`:

```markdown
## YYYY-MM-DD — Meeting Pre-load (for tomorrow YYYY-MM-DD)

**Tomorrow's meetings:**
- [list each meeting with time as provided]
```

Use tomorrow's actual date in the section header and the "for tomorrow" label. This pre-populates the morning brief without requiring the user to re-enter meetings.

If user says "skip" or doesn't respond with meetings, skip silently — no confirmation needed.

## Notes

- The IBP-notable field is a hint for `/weekly-todo-review` — it helps pre-populate the Wins & Impact draft
- Don't try to categorize everything by initiative — just capture what the user says naturally
- Ad-hoc notes during the day can be logged any time with "log this: [notes]" (no skill needed)
- Evening entries are most useful when they capture **outcomes**, not just activity

---

**Last Updated**: 2026-03-04
**Version**: 1.4 (Added weekly commitment mapping to evening log entries)
