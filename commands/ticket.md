# Create Ticket

## Description

Direct UKCAUD ticket creation with structure inference from existing tickets. Queries similar tickets in UKCAUD to learn the most common patterns (subtasks, labels, components, checklists) and presents an inferred template for confirmation before creating.

Supports `--dry-run` flag to preview without touching Jira.

Handles the full cascading creation: ticket → subtasks → labels → component → release → blocking links → epic/initiative linking → goal linking.

## Trigger

Run when user says:
- `/ticket story "Title"`
- `/ticket epic "Title"`
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
- Most common subtask types → expect Content + Peer Review
- Most common labels → expect UKCAUD_CONTENT/PEERREVIEW, UKCAUD_CONTENT/QA
- Most common component patterns
- Fix version patterns

**For bugs:**
```
JQL: project = UKCAUD AND issuetype = Bug AND created >= -90d
     AND summary ~ "DEVELOP" ORDER BY created DESC
```
Top 10 results. Analyse:
- Subtask types → expect Development + Manual Testing
- Label patterns → expect UKCAUD_BUGS_DEV/QA + UKCAUD_DEVELOP/RELEASE
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
  1. {subtask type 1} — "{title}" (blocks: [{blocking targets}])
  2. {subtask type 2} — "{title}"
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
1. UKCAUD-100: "Epic Title" (component: same, fix version: same) ← recommended
2. UKCAUD-200: "Epic Title" (component: same)
3. UKCAUD-300: "Epic Title" (keyword match)
4. [Create new epic]
5. [Skip — handle later]
```

If epic has no parent initiative, flag:
```
⚠️ Epic UKCAUD-100 has no parent Initiative. Create or link one?
```

If initiative has no linked Goal, flag:
```
⚠️ Initiative UKCAUD-50 is not linked to an Atlassian Goal.
```

### Step 3: Bug-Specific Flow — Hotfix / Multi-Product

**Always asked when creating bugs:**

1. "Is this a hotfix?"
   - If no → create single DEVELOP ticket
   - If yes → continue:

2. "DEVELOP and RELEASE tickets needed?"
   - Both (default)
   - Just DEVELOP
   - Just RELEASE

3. "How many products?" (if `--products` not specified)
   - Single product → create 1 set
   - Multiple → list products or "same as last time"
   - "Same as last time" → read from `workspace/config/last-products.json`

**Multi-product stamping (if --products specified or multiple selected):**

For each product:
```
├── {DEVELOP} - {Product} - {Description}
│   ├── Development (blocks →)
│   └── Manual Testing
├── {RELEASE} - {Product} - {Description}
│   ├── Development (blocks →)
│   └── Manual Testing

Labels:
- DEVELOP: UKCAUD_BUGS_DEV/QA + UKCAUD_DEVELOP
- RELEASE: UKCAUD_BUGS_DEV/QA + UKCAUD_RELEASE

Fix versions:
- DEVELOP: product's develop release
- RELEASE: RELEASE - product hotfix release

Links:
- DEVELOP ↔ RELEASE: "relates to"
- All linked to parent epic
- If sourceKey provided: "is caused by" link
```

Save product list to `workspace/config/last-products.json` for "same as last time" feature.

### Step 4: Dry-Run Output (if --dry-run)

```markdown
## Dry Run — Ticket Creation Preview

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

{Multi-product expansion if applicable — shows all N tickets}

**Links:**
- {epic link}
- {source link if applicable}
- {DEVELOP ↔ RELEASE link if applicable}

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

1. Create parent ticket → capture key (e.g., UKCAUD-500)
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
- 8/10 similar bugs also have an Automated Testing subtask — add one? (y/n)
- 6/10 similar stories have a QA checklist on the Content subtask — add? (y/n)
- Blocking link direction inconsistency found in 3 tickets — want to fix? (y/n)
```

Accepted improvements update the inferred template for next time.

### Step 8: Output

```
Created {type}: {key} — "{title}"
├── {subtask key}: {subtask type}
├── {subtask key}: {subtask type}
├── Epic: {epic key}
├── Labels: [{labels}]
├── Component: {component}
└── Fix Version: {version}

{multi-product summary if applicable}
```

### Step 9: Log to Metrics

```
| {date} | /ticket | Jira | — | {type}, {N} subtasks, {dry-run flag} |
```
