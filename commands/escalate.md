# Escalate

## Description

Escalation workflow for UKCAS (customer bugs) or UKCAUD (delivery bugs) to DIST (platform) or UKCAUD (delivery fix). Reads the source ticket, determines the right target, triggers the appropriate creation flow, creates links, and posts to the relevant Teams channel via Playwright.

## Trigger

Run when user says:
- `/escalate UKCAS-123`
- `/escalate UKCAUD-456`
- "escalate this ticket" / "raise an escalation"

## Arguments

- `sourceKey` (required): UKCAS-XXX or UKCAUD-XXX ticket key

## Workflow

### Step 0: Load Config

Read `workspace/config/projects.json` and `workspace/config/teams-channels.json`.

### Step 1: Read Source Ticket (via Atlassian MCP)

Fetch the source ticket:
```
GET issue: {sourceKey}
Fields: summary, description, priority, labels, component, reporter, status
```

### Step 2: Determine Escalation Target

Ask user:
```
Escalating {sourceKey}: "{summary}"

Target:
1. UKCAUD — create bug for delivery fix
2. DIST — escalate to platform team
3. Both — UKCAUD bug + DIST escalation

Choice: (1/2/3)
```

### Step 3A: If UKCAUD Target

Trigger the `/ticket bug` flow:
- Title: copied from source
- Source key: linked with `is caused by`
- Runs the full hotfix/multi-product flow (Step 3 of `/ticket`)
- Component: inferred from source ticket labels (L2-Content → content component, L3-Product/Dev → dev component)

### Step 3B: If DIST Target

Create DIST ticket:
```
Project: DIST
Type: Issue (or Request/Question based on source)
Summary: {source summary}
Description: "Escalated from {sourceKey}\n\n{source description}"
Priority: {mapped from source priority}
Labels: ["Audit_Squad"]
Link: "is caused by" → {sourceKey}
```

### Step 3C: If Both

Execute Step 3A then Step 3B. Link all three tickets.

### Step 4: Teams Notification (via Playwright — best effort)

Determine the target Teams channel from `teams-channels.json`:

| Source Labels | Channel Config Key |
|--------------|-------------------|
| L3-Product/Dev | L3-Product/Dev |
| L2-Content | L2-Content |
| Audit_Squad (DIST target) | Audit_Squad |
| Default | DIST_General |

If Teams channels are configured (not [TODO]):
1. Navigate to the Teams channel via Playwright
2. Post notification:
   ```
   🔺 Escalation: {sourceKey} → {created ticket key(s)}
   Summary: {summary}
   Priority: {priority}
   Source: {UKCAS/UKCAUD}
   Linked: {links}
   ```

If Playwright unavailable or channels not configured:
```
SKIPPED: Teams notification not sent. Channel not configured or Playwright unavailable.
Copy this to post manually:
🔺 Escalation: {sourceKey} → {ticket key(s)} — "{summary}"
```

### Step 5: Output

```
Escalation complete:

Source: {sourceKey} — "{summary}"
Created:
├── {UKCAUD key}: "{title}" (bug for fix)
│   ├── Development
│   └── Manual Testing
└── {DIST key}: "{title}" (platform escalation)

Links: {sourceKey} → is caused by → {created keys}
Teams: {posted to channel / not sent}
```

### Step 6: Log to Metrics

```
| {date} | /escalate | Jira, {Playwright if used} | {fallbacks} | {source} → {targets} |
```
