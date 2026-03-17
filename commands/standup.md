# Quick Standup

## Description

30-second standup format: yesterday, today, blockers. The fast version of `/gm` for when you just need to fire off a quick status in Teams or a standup chat.

No file I/O beyond reading the daily log. No Jira queries. Pure synthesis from local context.

Tone: **Minimal, direct** — three sections, done.

## Trigger

Run when user says:
- `/standup`
- "quick standup" / "standup update" / "daily standup"

## Workflow

### Step 1: Load Context

Read these files (no Jira, no Playwright):
- `workspace/coordinator/daily-log.md` → yesterday's evening entry
- `workspace/coordinator/weekly-plan.md` → this week's priorities
- `workspace/coordinator/daily-brief-{today}.md` → today's brief if it exists (from `/gm`)

### Step 2: Generate Standup

```
**Yesterday:**
- [2-3 bullets from yesterday's evening log accomplishments]

**Today:**
- [2-3 bullets from today's brief or weekly plan priorities]

**Blockers:**
- [Active blockers from evening log or "None"]
```

### Step 3: Output

Print inline only — no files created, no daily brief updated.

Ready to copy-paste into Teams/Slack/standup channel.
