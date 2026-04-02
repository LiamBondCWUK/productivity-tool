$file = "C:\Users\liam.bond\Documents\Productivity Tool\commands\ticket.md"

$append = @"

---

## Sub-Command: ``/ticket epic "Title" --parent UKCAUD-xxx``

### E1: Validate Parent Initiative

Fetch the parent initiative key provided via ``--parent``. Confirm it is an Initiative type. If not, error and exit. If no ``--parent`` provided, query open initiatives and prompt selection:

``````
JQL: project = UKCAUD AND issuetype = Initiative AND status != Done ORDER BY updated DESC
``````

### E2: FY / Quarter Label Calculation

Caseware FY = April-March:

- Apr-Jun: FY26, Q1
- Jul-Sep: FY26, Q2
- Oct-Dec: FY26, Q3
- Jan-Mar: FY27, Q4

Add labels: FY{YY} + Q{N} (e.g. FY26, Q1)

### E3: Duplicate Check

``````
JQL: project = UKCAUD AND issuetype = Epic AND summary ~ "{keywords}" AND status != Done
``````

If matches found, warn the user and prompt confirmation before proceeding.

### E4: Component Mapping

Inherit component from parent initiative. If unset, query sibling epics for the most common component, or prompt if none found.

### E5: Confluence One-Pager

Create a one-pager (title: {Epic Title} -- Spec) under the parent initiative's Confluence space via Confluence MCP. Template: problem statement, scope, out of scope, success criteria. Link back to Jira epic after creation. Skip if Confluence MCP unavailable.

### E6: Create Epic

Create via Atlassian MCP: project = UKCAUD, issuetype = Epic, summary = title, labels = [FY, Q, inferred], component, parent = initiative key.

### E7: Post-Create Rovo Enricher Verify

Wait 10s then fetch the epic. If Rovo enricher has not populated description/custom fields after 30s, flag for manual check. Output summary:

``````
Created Epic: {key} -- "{title}"
|-- Parent: {initiative-key}
|-- Labels: [FY26, Q1, ...]
|-- Component: {component}
|-- Confluence: {page-url or "skipped"}
+-- Rovo enricher: {ok | pending | skipped}
``````

---

## Sub-Command: ``/ticket initiative "Title" [--target YYYY-QN]``

### I1: Determine Programme Context

Query open initiatives and suggest top 3 as sibling context. Initiatives are top-level in UKCAUD - no parent required.

### I2: FY / Quarter Label from Target Date

If ``--target YYYY-QN`` provided (e.g. ``--target 2026-Q2``), extract FY + Q labels. Otherwise calculate from today using the same logic as E2.

### I3: Confluence One-Pager

Create a Confluence page (title: {Initiative Title} -- Initiative Brief) under the UKCAUD product space. Sections: Problem, Users, Goals, Scope, Out of Scope, Dependencies, Timeline. Link back to Jira initiative. Skip if Confluence MCP unavailable.

### I4: Goal Link (Optional)

Query Atlassian Goals API (GET /gateway/api/goals/v1/goals?project=UKCAUD). Suggest up to 3 matching goals by keyword. If selected, link initiative to goal. If Goals API unavailable, skip and note.

### I5: Create Initiative

Create via Atlassian MCP: project = UKCAUD, issuetype = Initiative, summary = title, labels = [FY, Q].

### I6: Output

``````
Created Initiative: {key} -- "{title}"
|-- Labels: [FY26, Q2]
|-- Target: {YYYY-QN or "not set"}
|-- Confluence: {page-url or "skipped"}
+-- Goal link: {goal-title or "not linked"}
``````

---

## Sub-Command: ``/ticket split UKCAUD-xxx``

### S1: Fetch Initiative

Fetch the initiative and confirm type = Initiative. Fetch existing child epics:

``````
JQL: project = UKCAUD AND issuetype = Epic AND parent = UKCAUD-xxx
``````

Display current structure showing existing epics and their status.

### S2: Propose Split

Analyse the initiative summary and description to propose a wave/epic breakdown. For each proposed wave, show: title, scope summary, suggested component, suggested quarter. Prompt: [Create all] [Edit] [Cancel].

### S3: Create Epics

For each confirmed wave, run the full Epic creation flow (E2-E7) with:

- Parent = source initiative
- FY/Q labels inherited from the wave's target quarter
- Component from the initiative or wave-specific suggestion

Each epic is created sequentially; a failure on one wave does not block others.

### S4: Output

``````
Split complete: {initiative-key} -- "{title}"

Created {N} epics:
|-- {key}: "{Wave 1 Title}" -- {component}, {Q}
|-- {key}: "{Wave 2 Title}" -- {component}, {Q}
+-- {key}: "{Wave 3 Title}" -- {component}, {Q}
``````
"@

$existing = Get-Content $file -Raw
($existing.TrimEnd() + $append) | Set-Content $file -Encoding UTF8 -NoNewline
Write-Host "Appended sub-command sections to ticket.md"
