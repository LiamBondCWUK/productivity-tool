# Ticket Hygiene & Mass Management

## Description

Audit and fix data quality issues across UKCAUD tickets. Covers missing epics, labels, components, fix versions, blocking links, dates, and goal linking. Also supports bulk editing and hierarchy relinking.

Each sub-command runs independently.

## Trigger

Run when user says:
- `/tickets fix-hygiene` — full audit + fix
- `/tickets bulk-edit <selector> --<operation>` — targeted bulk update
- `/tickets relink-epics` — hierarchy audit + fix
- `/tickets release-prep "version"` — release readiness check
- `/tickets resume` — finish interrupted transaction

## Sub-Commands

---

### `/tickets fix-hygiene`

Full audit of data quality across the current sprint and backlog.

#### Step 1: Run Hygiene Checks

Execute these JQL queries in parallel:

```
No epic:      project = UKCAUD AND sprint in openSprints() AND "Epic Link" is EMPTY
No labels:    project = UKCAUD AND sprint in openSprints() AND labels is EMPTY
No component: project = UKCAUD AND sprint in openSprints() AND component is EMPTY
No release:   project = UKCAUD AND sprint in openSprints() AND fixVersion is EMPTY
Blocked:      project = UKCAUD AND status = Blocked
```

#### Step 2: Analyse Each Category

**Tickets without epics:**
- For each, query its component and fix version
- Search for epics with matching component/version
- Suggest best-match epic

**Tickets without labels:**
- Infer from type + parent epic's labels
- Stories → UKCAUD_CONTENT/PEERREVIEW
- Bugs → UKCAUD_BUGS_DEV/QA + UKCAUD_DEVELOP (or UKCAUD_RELEASE)

**Tickets without component:**
- Infer from parent epic's component
- If no epic: infer from fix version name (often contains product name)

**Tickets without fix version:**
- Assign current active fix version
- If parent epic has a version, use that

**Blocking link audit:**
- For each bug with subtasks: verify Development blocks Manual Testing + Automated Testing
- Flag missing or reversed links

**Label consistency:**
- Check DEVELOP bugs have UKCAUD_DEVELOP label
- Check RELEASE bugs have UKCAUD_RELEASE label

**Initiative-Goal linking:**
- Query initiatives: `project = UKCAUD AND issuetype = Initiative`
- Check each for Atlassian Goal link
- Flag unlinked initiatives

#### Step 3: Present Report

```markdown
## Hygiene Report — {date}

### Summary
| Category | Issues Found | Auto-Fixable |
|----------|-------------|-------------|
| No epic | {N} | {N} |
| No labels | {N} | {N} |
| No component | {N} | {N} |
| No fix version | {N} | {N} |
| Missing blocking links | {N} | {N} |
| Label inconsistency | {N} | {N} |
| Initiative without Goal | {N} | Manual |

### Proposed Fixes
[Grouped by category, each with ticket key + proposed fix]

Apply all fixes? (all / review each / cancel)
```

#### Step 4: Apply Fixes (with confirmation)

- "all" → apply everything, generate summary
- "review each" → present each fix for y/n
- Write transaction log before applying
- Generate before/after report with JQL links

---

### `/tickets bulk-edit`

Targeted bulk update across a set of tickets.

#### Selector Options

```
# By ticket list
/tickets bulk-edit UKCAUD-100,UKCAUD-101 --add-label "Q1-2026"

# By JQL (natural language → JQL conversion)
/tickets bulk-edit "all bugs in current sprint" --set-component "Cloud Audit"

# By description match
/tickets bulk-edit "Ensure PMSD Shows On Opening" --add-checklist-item "Verify PMSD visibility"
```

#### Operations

| Operation | Example |
|-----------|---------|
| `--add-label "label"` | Add label to all matched tickets |
| `--remove-label "label"` | Remove label from all matched |
| `--set-component "name"` | Set component |
| `--set-fix-version "name"` | Set fix version |
| `--set-priority "High"` | Set priority |
| `--add-checklist-item "text"` | Add checklist item to subtasks |
| `--link-epic UKCAUD-XXX` | Link all to specified epic |

#### Flow

1. Resolve target set (JQL, ticket list, or NL → JQL)
2. Expand to include all subtasks of matched tickets
3. Show preview: "This will update {N} tickets. Changes: [{list}]. Proceed?"
4. Apply, generate summary report

---

### `/tickets relink-epics`

Audit the ticket hierarchy and fix orphaned tickets.

#### Flow

1. Query all tickets in current sprint without epic link
2. For each: suggest parent epic based on component, fix version, title keywords
3. Query all epics without parent initiative
4. For each: suggest parent initiative
5. Present as actionable list
6. Apply with confirmation

---

### `/tickets release-prep "version"`

Release readiness check for a specific fix version.

#### Flow

1. Query all tickets with the specified fix version:
   ```
   JQL: project = UKCAUD AND fixVersion = "{version}" ORDER BY issuetype ASC, priority DESC
   ```
2. Group by epic
3. For each ticket: check subtask completeness (all subtasks done?)
4. Check: labels present, component set, blocking links correct
5. Flag: any ticket not in Done status

```markdown
## Release Readiness — {version}

| Status | Count |
|--------|-------|
| Done | {N} |
| In Progress | {N} |
| To Do | {N} |
| Blocked | {N} |

### By Epic
| Epic | Total | Done | Remaining |
|------|-------|------|-----------|

### Issues
- {N} tickets with incomplete subtasks
- {N} tickets missing labels
- {N} tickets missing component

### Verdict
{READY / NOT READY — {N} items remaining}
```

---

### `/tickets resume`

Resume an interrupted transaction from the transaction log.

#### Flow

1. Scan `workspace/coordinator/notes/` for `*-transaction-*.md` files
2. Find any with unchecked items (Status: IN_PROGRESS)
3. Present: "Found interrupted transaction from {date}: {description}. Resume? (y/n)"
4. Continue executing remaining unchecked actions
5. Mark transaction as COMPLETED when done
