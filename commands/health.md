# System Health Check

## Description

Validates that all components of the PM Operating System are correctly configured and accessible. Run this after initial setup, when switching machines, or when something feels broken.

## Trigger

Run when user says:
- `/health`
- "check system health" / "is everything working" / "validate setup"

## Workflow

### Step 1: Load System Config

Read `workspace/config/system.json` and `workspace/config/projects.json`.

If either file is missing, report immediately:

```
FAIL: workspace/config/system.json not found — run setup first
```

Extract: Atlassian domain, Confluence space, project keys, workspace paths.

### Step 2: Validate Workspace Structure

Check that all required directories and files exist:

```
workspace/
├── coordinator/
│   ├── weekly-plan.md
│   ├── daily-log.md
│   ├── decision-log.md
│   ├── cross-cutting-concerns.md
│   ├── system-metrics.md
│   ├── notes/
│   └── archive/
├── initiatives/
│   ├── ukcaud/ (weekly-todos.md, milestones.md, context.md, epics.md, archive/)
│   ├── dist/   (weekly-todos.md, milestones.md, context.md, epics.md, archive/)
│   └── ukcas/  (weekly-todos.md, milestones.md, context.md, epics.md, archive/)
├── strategy/
│   ├── product-strategy.md
│   └── key-customers.md
└── config/
    ├── projects.json
    ├── system.json
    └── teams-channels.json
```

For each item: PASS if exists, FAIL if missing.

### Step 3: Validate Atlassian MCP Connection

Attempt a lightweight Jira query for each project defined in `projects.json`:

```
For each project in projects.json:
  → Search Jira: project = {key} AND status != Closed ORDER BY updated DESC (maxResults: 1)
  → PASS if response received, FAIL if error/timeout
```

Then check Confluence access:

```
→ Get page by ID: {confluenceParentPageId}
→ PASS if page accessible, FAIL if not
```

### Step 4: Validate Playwright MCP (Teams/Calendar)

Check if the Playwright MCP is available:

```
→ Attempt browser_snapshot or equivalent
→ PASS if Playwright responds, WARN if unavailable
```

Note: Playwright is best-effort. WARN (not FAIL) if unavailable — system degrades gracefully.

### Step 5: Validate Goals API

Attempt a simple GraphQL query to the Goals endpoint:

```
POST https://{domain}/gateway/api/graphql
Query: { goals_search(first: 1) { edges { node { name } } } }
→ PASS if response, FAIL if error
```

### Step 6: Validate Local Tools

Check for required CLI tools:

```
→ pandoc --version → PASS/FAIL (required for /pdf)
→ typst --version → PASS/FAIL (required for /pdf)
→ git --version → PASS/FAIL (required for workspace management)
```

### Step 7: Check Teams Channel Config

Read `workspace/config/teams-channels.json`:

```
→ If any channel still has "[TODO:" prefix → WARN: unconfigured channels
→ If file missing → WARN: escalation routing not configured
```

### Step 8: Report

Output a summary table:

```markdown
## System Health Report — {date}

| Component | Status | Details |
|-----------|--------|---------|
| Workspace structure | PASS/FAIL | {N}/{total} files present |
| Jira — UKCAUD | PASS/FAIL | {detail} |
| Jira — DIST | PASS/FAIL | {detail} |
| Jira — UKCAS | PASS/FAIL | {detail} |
| Jira — UKJPD | PASS/FAIL | {detail} |
| Confluence | PASS/FAIL | {detail} |
| Playwright (Teams) | PASS/WARN | {detail} |
| Goals API | PASS/FAIL | {detail} |
| pandoc | PASS/FAIL | {version or "not found"} |
| typst | PASS/FAIL | {version or "not found"} |
| git | PASS/FAIL | {version} |
| Teams channels | PASS/WARN | {detail} |

### Summary
- {N} PASS, {N} WARN, {N} FAIL
- {Actionable next steps for any FAIL/WARN items}
```

### Step 9: Log to Metrics

Append to `workspace/coordinator/system-metrics.md`:

```
| {date} | /health | Workspace, Jira, Confluence, Playwright, Goals, Tools | {any fallbacks} | {pass/warn/fail counts} |
```
