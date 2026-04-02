# Quick Log Entry

## Description

Quick capture to `workspace/coordinator/daily-log.md`. Use throughout the day to record notable moments, decisions, blockers, or IBP-relevant items without running a full EOD.

## Trigger

Run when user says:

- `/log [tag] <note>`
- `/log <note>`
- "log this" / "note this" / "quick note"

## Arguments

- `[tag]` (optional) — one of: `ibp`, `blocker`, `decision`, `win`, `meeting`
- `<note>` — free text

## Examples

```
/log ibp Delivered Q2 roadmap to stakeholders — unblocked 3 key decisions
/log blocker DIST admin access still missing — Rule 3 deployment blocked
/log decision Agreed to defer mobile notifications to Phase 7
/log Spoke to Kirsten about UKCAS escalation process — she'll loop in eng
```

---

## Workflow

### Step 1: Determine Tag

If no tag provided, infer from content:

- Mentions of deliverables, metrics, stakeholders → `ibp`
- Mentions of blocked, waiting, can't proceed → `blocker`
- "decided", "agreed", "going with" → `decision`
- "shipped", "deployed", "closed", "done" → `win`
- Explicit meeting name or time → `meeting`
- Default: no tag (plain note)

### Step 2: Format Entry

```markdown
<!-- {tag}: {note} -->
```

Tag mapping to comment format:

- `ibp` → `<!-- IBP-notable: {note} -->`
- `blocker` → `<!-- blocker: {note} -->`
- `decision` → `<!-- decision: {note} -->`
- `win` → `<!-- win: {note} -->`
- `meeting` → `<!-- meeting: {note} -->`
- no tag → `<!-- note: {note} -->`

### Step 3: Append to Daily Log

Find or create today's section in `workspace/coordinator/daily-log.md`:

- If a `## {today}` section exists, append to its `### Notes` subsection
- If no section for today exists, append a minimal section:

```markdown
## {today} ({day of week})

### Notes

<!-- {tag}: {note} -->
```

### Step 4: Confirm

Print one line:

```
✓ Logged [{tag}]: {note}
```
