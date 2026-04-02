# Intake — Mid-Day Re-Prioritise

## Description

On-demand inbox refresh. Same data pull as `/gm` but without opening the browser. Use mid-day to catch new escalations, updated Jira statuses, or Teams messages that arrived since morning.

Updates `dashboard-data.json` → dashboard reflects within 5 seconds.

## Trigger

Run when user says:

- `/intake`
- "re-prioritise" / "reprioritise"
- "what's come in" / "anything new"
- "refresh my inbox"

---

## Workflow

Follow the same steps as `/gm` (Steps 0–3, 6–7), with these differences:

1. **Skip Step 5** — do NOT open `localhost:3000` (browser stays as-is)
2. **Step 4 output** — use compact diff format instead of full morning brief:

```
Inbox refreshed at {time}

Changes since morning:
  🔴 +{n} new urgent items
  🟡 +{n} new today items
  ✅ {n} items completed

New urgent:
  - [ticket or message summary]

Dashboard updated.
```

If nothing changed since the last run:

```
No changes since {last-run-time}. Inbox is current.
```

---

## Notes

- Idempotent: safe to run multiple times per day
- Preserves `standingBacklog` from existing `dashboard-data.json` — does not reset it
- Does not append to daily log (morning entry is sufficient; use `/log` for notable items)
