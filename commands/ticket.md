# Create Ticket

## Description

Direct UKCAUD ticket creation with structure inference from existing tickets. Queries similar tickets in UKCAUD to learn the most common patterns (subtasks, labels, components, checklists) and presents an inferred template for confirmation before creating.

Supports `--dry-run` flag to preview without touching Jira.

Handles the full cascading creation: ticket â†’ subtasks â†’ labels â†’ component â†’ release â†’ blocking links â†’ epic/initiative linking â†’ goal linking.

## Trigger

Run when user says:

- `/ticket story "Title"`
- `/ticket epic "Title" --parent UKCAUD-xxx`
- `/ticket initiative "Title" [--target YYYY-QN]`
- `/ticket split UKCAUD-xxx` â€” split initiative into epics/waves
- `/ticket bug "Title" [source-key]`
- `/ticket bug "Title" --products "UK Company, UK LLP"`
- `/ticket --dry-run story "Title"`

## Arguments

- `type` (required): story, bug, epic, initiative
- `title` (required): ticket summary
- `sourceKey` (optional): UKCAUD/UKCAS/DIST key to link as source
- `--products "P1, P2, P3"` (optional): multi-product stamping for bugs
- `--dry-run` (optional): preview only, no Jira writes

## Workflow

### Step 0: Load Config + Parse Args

Read `workspace/config/projects.json` for UKCAUD ticket patterns.

Parse arguments: type, title, sourceKey, products list, dry-run flag.

### Step 1: Inference Engine

Query existing tickets of the same type in UKCAUD to identify the most common pattern:

**For stories:**

```
JQL: project = UKCAUD AND issuetype = Story AND created >= -90d ORDER BY created DESC
```

Top 10 results. Analyse:

- Most common subtask types â†’ expect Content + Peer Review
- Most common labels â†’ expect UKCAUD_CONTENT/PEERREVIEW, UKCAUD_CONTENT/QA
- Most common component patterns
- Fix version patterns

**For bugs:**

```
JQL: project = UKCAUD AND issuetype = Bug AND created >= -90d
     AND summary ~ "DEVELOP" ORDER BY created DESC
```

Top 10 results. Analyse:

- Subtask types â†’ expect Development + Manual Testing
- Label patterns â†’ expect UKCAUD_BUGS_DEV/QA + UKCAUD_DEVELOP/RELEASE
- Component patterns
- Fix version patterns (develop vs release)
- Naming pattern: `{DEVELOP|RELEASE} - {Product} - {Description}`

**For epics:**

```
JQL: project = UKCAUD AND issuetype = Epic AND created >= -90d ORDER BY created DESC
```

Present inferred template:

```
Inferred structure for {type} "{title}":

Summary: {title}
Type: {type}
Labels: [{inferred labels}]
Component: [{inferred component or "needs selection"}]
Fix Version: [{inferred or "needs selection"}]
Subtasks:
  1. {subtask type 1} â€” "{title}" (blocks: [{blocking targets}])
  2. {subtask type 2} â€” "{title}"
Parent Epic: [{suggested epic or "needs selection"}]

Confirm? (y/edit/cancel)
```

### Step 2: Epic + Initiative Linking (Mandatory)

**Search existing epics:**

```
JQL: project = UKCAUD AND issuetype = Epic AND status != Done ORDER BY updated DESC
```

Find best match by: component overlap, fix version match, keyword similarity.

Suggest top 3 matches:

```
Suggested parent epic:
1. UKCAUD-100: "Epic Title" (component: same, fix version: same) â† recommended
2. UKCAUD-200: "Epic Title" (component: same)
3. UKCAUD-300: "Epic Title" (keyword match)
4. [Create new epic]
5. [Skip â€” handle later]
```

If epic has no parent initiative, flag:

```
âš ï¸ Epic UKCAUD-100 has no parent Initiative. Create or link one?
```

If initiative has no linked Goal, flag:

```
âš ï¸ Initiative UKCAUD-50 is not linked to an Atlassian Goal.
```

### Step 3: Bug-Specific Flow â€” Hotfix / Multi-Product

**Always asked when creating bugs:**

1. "Is this a hotfix?"
   - If no â†’ create single DEVELOP ticket
   - If yes â†’ continue:

2. "DEVELOP and RELEASE tickets needed?"
   - Both (default)
   - Just DEVELOP
   - Just RELEASE

3. "How many products?" (if `--products` not specified)
   - Single product â†’ create 1 set
   - Multiple â†’ list products or "same as last time"
   - "Same as last time" â†’ read from `workspace/config/last-products.json`

**Multi-product stamping (if --products specified or multiple selected):**

For each product:

```
â”œâ”€â”€ {DEVELOP} - {Product} - {Description}
â”‚   â”œâ”€â”€ Development (blocks â†’)
â”‚   â””â”€â”€ Manual Testing
â”œâ”€â”€ {RELEASE} - {Product} - {Description}
â”‚   â”œâ”€â”€ Development (blocks â†’)
â”‚   â””â”€â”€ Manual Testing

Labels:
- DEVELOP: UKCAUD_BUGS_DEV/QA + UKCAUD_DEVELOP
- RELEASE: UKCAUD_BUGS_DEV/QA + UKCAUD_RELEASE

Fix versions:
- DEVELOP: product's develop release
- RELEASE: RELEASE - product hotfix release

Links:
- DEVELOP â†” RELEASE: "relates to"
- All linked to parent epic
- If sourceKey provided: "is caused by" link
```

Save product list to `workspace/config/last-products.json` for "same as last time" feature.

### Step 4: Dry-Run Output (if --dry-run)

```markdown
## Dry Run â€” Ticket Creation Preview

**Would create:**

1. **{type}:** {title}
   - Project: UKCAUD
   - Labels: [{labels}]
   - Component: {component}
   - Fix Version: {version}
   - Parent Epic: {epic key}

2. **Subtask (Development):** {title}
   - Blocks: Manual Testing, Automated Testing

3. **Subtask (Manual Testing):** {title}

{Multi-product expansion if applicable â€” shows all N tickets}

**Links:**

- {epic link}
- {source link if applicable}
- {DEVELOP â†” RELEASE link if applicable}

**Total tickets to create:** {N}

No Jira changes made. Run without --dry-run to create.
```

### Step 5: Transaction Log (if NOT dry-run)

Before creating anything, write intent to local transaction log:

```markdown
## Transaction: {timestamp}

Intent: Create {type} "{title}" with {N} subtasks
Status: IN_PROGRESS

### Planned Actions:

- [ ] Create parent ticket
- [ ] Create subtask 1: Development
- [ ] Create subtask 2: Manual Testing
- [ ] Add labels
- [ ] Set component
- [ ] Set fix version
- [ ] Create blocking links
- [ ] Link to epic
```

Write to `workspace/coordinator/notes/{today}-transaction-{timestamp}.md`.

### Step 6: Create in Jira (via Atlassian MCP)

Execute each action from the transaction log:

1. Create parent ticket â†’ capture key (e.g., UKCAUD-500)
2. Create each subtask with parent = UKCAUD-500
3. Add labels to parent
4. Set component on parent
5. Set fix version on parent
6. Create blocking links: Development blocks Manual Testing
7. Link to parent epic
8. If sourceKey: create "is caused by" link
9. If multi-product: create "relates to" links between DEVELOP and RELEASE

After each action, tick off the transaction log entry.

### Step 7: Continuous Improvement Check

After creation, analyse existing similar tickets for pattern deviations:

```
Scanned {N} similar recent tickets. Observations:
- 8/10 similar bugs also have an Automated Testing subtask â€” add one? (y/n)
- 6/10 similar stories have a QA checklist on the Content subtask â€” add? (y/n)
- Blocking link direction inconsistency found in 3 tickets â€” want to fix? (y/n)
```

Accepted improvements update the inferred template for next time.

### Step 8: Output

```
Created {type}: {key} â€” "{title}"
â”œâ”€â”€ {subtask key}: {subtask type}
â”œâ”€â”€ {subtask key}: {subtask type}
â”œâ”€â”€ Epic: {epic key}
â”œâ”€â”€ Labels: [{labels}]
â”œâ”€â”€ Component: {component}
â””â”€â”€ Fix Version: {version}

{multi-product summary if applicable}
```

### Step 9: Log to Metrics

```
| {date} | /ticket | Jira | â€” | {type}, {N} subtasks, {dry-run flag} |
```
---

## Sub-Command: `/ticket epic "Title" --parent UKCAUD-xxx`

### E1: Validate Parent Initiative

Fetch the parent initiative key provided via `--parent`. Confirm it is an Initiative type. If not, error and exit. If no `--parent` provided, query open initiatives and prompt selection:

```
JQL: project = UKCAUD AND issuetype = Initiative AND status != Done ORDER BY updated DESC
```

### E2: FY / Quarter Label Calculation

Caseware FY = April-March:

- Apr-Jun: FY26, Q1
- Jul-Sep: FY26, Q2
- Oct-Dec: FY26, Q3
- Jan-Mar: FY27, Q4

Add labels: FY{YY} + Q{N} (e.g. FY26, Q1)

### E3: Duplicate Check

```
JQL: project = UKCAUD AND issuetype = Epic AND summary ~ "{keywords}" AND status != Done
```

If matches found, warn the user and prompt confirmation before proceeding.

### E4: Component Mapping

Inherit component from parent initiative. If unset, query sibling epics for the most common component, or prompt if none found.

### E5: Confluence One-Pager

Create a one-pager (title: {Epic Title} -- Spec) under the parent initiative's Confluence space via Confluence MCP. Template: problem statement, scope, out of scope, success criteria. Link back to Jira epic after creation. Skip if Confluence MCP unavailable.

### E6: Create Epic

Create via Atlassian MCP: project = UKCAUD, issuetype = Epic, summary = title, labels = [FY, Q, inferred], component, parent = initiative key.

### E7: Post-Create Rovo Enricher Verify

Wait 10s then fetch the epic. If Rovo enricher has not populated description/custom fields after 30s, flag for manual check. Output summary:

```
Created Epic: {key} -- "{title}"
|-- Parent: {initiative-key}
|-- Labels: [FY26, Q1, ...]
|-- Component: {component}
|-- Confluence: {page-url or "skipped"}
+-- Rovo enricher: {ok | pending | skipped}
```

---

## Sub-Command: `/ticket initiative "Title" [--target YYYY-QN]`

### I1: Determine Programme Context

Query open initiatives and suggest top 3 as sibling context. Initiatives are top-level in UKCAUD - no parent required.

### I2: FY / Quarter Label from Target Date

If `--target YYYY-QN` provided (e.g. `--target 2026-Q2`), extract FY + Q labels. Otherwise calculate from today using the same logic as E2.

### I3: Confluence One-Pager

Create a Confluence page (title: {Initiative Title} -- Initiative Brief) under the UKCAUD product space. Sections: Problem, Users, Goals, Scope, Out of Scope, Dependencies, Timeline. Link back to Jira initiative. Skip if Confluence MCP unavailable.

### I4: Goal Link (Optional)

Query Atlassian Goals API (GET /gateway/api/goals/v1/goals?project=UKCAUD). Suggest up to 3 matching goals by keyword. If selected, link initiative to goal. If Goals API unavailable, skip and note.

### I5: Create Initiative

Create via Atlassian MCP: project = UKCAUD, issuetype = Initiative, summary = title, labels = [FY, Q].

### I6: Output

```
Created Initiative: {key} -- "{title}"
|-- Labels: [FY26, Q2]
|-- Target: {YYYY-QN or "not set"}
|-- Confluence: {page-url or "skipped"}
+-- Goal link: {goal-title or "not linked"}
```

---

## Sub-Command: `/ticket split UKCAUD-xxx`

### S1: Fetch Initiative

Fetch the initiative and confirm type = Initiative. Fetch existing child epics:

```
JQL: project = UKCAUD AND issuetype = Epic AND parent = UKCAUD-xxx
```

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

```
Split complete: {initiative-key} -- "{title}"

Created {N} epics:
|-- {key}: "{Wave 1 Title}" -- {component}, {Q}
|-- {key}: "{Wave 2 Title}" -- {component}, {Q}
+-- {key}: "{Wave 3 Title}" -- {component}, {Q}
```