# AI Check-In Prep Skill

## Description

Generate a structured status update for the recurring AI check-in meeting. Organized by initiative (DCA first, then AiDA): last week's outcomes/wins, next week's goals, and critical blockers only.

Output is appended to the current daily brief file and printed inline for quick review before the meeting.

Tone: **Crisp, outcome-oriented** — this is what you'd say in a 5-minute standup, not a written report.

## Trigger

Run when user says:
- `/ai-checkin-prep`
- "prep the AI check-in" / "prepare for AI check-in"
- "status update for Andrew" / "weekly AI status"

## Workflow

### Step 1: Determine Time Window

Calculate the reporting window:
- **"Last week"** = the 7 days ending yesterday (inclusive)
- **"Next week"** = the 7 days starting today (inclusive)

Note today's date for file naming and log references.

### Step 2: Load Context (in parallel)

Read these files:
- `coordinator/weekly-plan.md` — extract "🔥 This Week: Top Priorities" (by initiative) and "🚀 Last Week: Wins & Impact"
- `coordinator/daily-log.md` — scan all entries within the last-week window for accomplishments, decisions, and IBP-notable items
- `initiatives/dca/weekly-todos.md` — completed items and current priorities
- `initiatives/aida/weekly-todos.md` — completed items and current priorities
- `initiatives/dca/milestones.md` — upcoming targets within 4 weeks
- `initiatives/aida/milestones.md` — upcoming targets within 4 weeks

### Step 3: Synthesize by Initiative

For each initiative (DCA first, then AiDA), build three sections:

#### Last Week (Outcomes & Wins)
- Pull from: daily log accomplishments + IBP-notable items + weekly todos completed section + last week wins in weekly plan
- **Include**: Concrete outcomes (shipped X, locked decision Y, unblocked Z). Name stakeholders involved.
- **Exclude**: Process work, internal tooling, things only you care about
- Target: 3-6 bullets per initiative

#### Next Week (Goals)
- Pull from: weekly plan priorities + weekly todos open items + milestone targets approaching
- **Include**: What you're driving toward, key deliverables, meetings that advance goals
- **Exclude**: Routine work, things that don't need visibility
- Target: 2-4 bullets per initiative

#### Blockers (Critical Only)
- Pull from: daily log blockers + weekly plan blockers/issues section
- **Only include** items that are: (a) blocking a milestone or commitment, AND (b) require escalation or cross-team action
- If no critical blockers: write "None" — don't invent concerns
- Target: 0-2 bullets per initiative

### Step 4: Write Output

#### To daily brief file

If `coordinator/daily-brief-YYYY-MM-DD.md` exists (from morning check-in), find the `### AI Check-in` section and replace it with the generated content. If no existing section, append under `## 📋 Meeting Prep`.

If no daily brief file exists, create the section in a new file.

Format:

```markdown
### AI Check-in (Status Update)

**DCA — Last Week**
- [bullet]
- [bullet]

**DCA — Next Week**
- [bullet]
- [bullet]

**DCA — Blockers**
- None

**AiDA — Last Week**
- [bullet]
- [bullet]

**AiDA — Next Week**
- [bullet]
- [bullet]

**AiDA — Blockers**
- [bullet, or None]
```

#### Inline output

Print the full check-in content inline so it can be reviewed and tweaked before the meeting. Preface with:

```
AI check-in prep ready — also written to coordinator/daily-brief-YYYY-MM-DD.md

---
```

Then print the full DCA + AiDA sections.

### Step 5: Offer Refinement

After printing, ask:

```
Anything to add, cut, or reframe before the meeting?
```

If the user provides edits, update the daily brief file and reprint the changed section. If they say "looks good" or similar, confirm and end.

## Notes

- DCA first, AiDA second — this is the user's preferred order for these check-ins
- "Last week" is relative to when the skill runs, not the calendar week boundary — if run on Thursday, it covers Thu-Wed; if run on Friday, it covers Fri-Thu
- Keep bullets outcome-oriented: "Shipped X" not "Worked on X"
- Name stakeholders where relevant — the audience cares about cross-functional alignment
- Don't include platform/infrastructure as a separate section unless there's a significant cross-cutting item worth surfacing (fold it into the relevant initiative)
- This skill is read-only against Jira/Confluence — it synthesizes from local files only, which should be current from daily log entries

---

**Last Updated**: 2026-03-05
**Version**: 1.0
