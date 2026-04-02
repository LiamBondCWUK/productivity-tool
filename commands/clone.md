# Clone Ticket

## Description

Clone a UKCAUD/UKJPD ticket into UKCAUD with full validation, field mapping, and optional bulk expansion across variants.

Absorbs the logic from `clone-jpd-to-ukcaud.prompt.md`. Supports `--bulk` for creating multiple clones from a variants CSV, and `--preset` for loading a pre-configured clone template from `workspace/config/clone-presets.json`.

## Trigger

Run when user says:

- `/clone UKCAUD-xxx`
- `/clone UKJPD-xxx`
- `/clone UKCAUD-xxx --bulk "Variant A, Variant B, Variant C"`
- `/clone --preset lead-schedule`
- `/clone UKCAUD-xxx --dry-run`

## Arguments

- `sourceKey` (required unless `--preset` used): UKCAUD or UKJPD ticket key to clone
- `--bulk "V1, V2, V3"` (optional): comma-separated list of variant names; creates one clone per variant
- `--preset <name>` (optional): load source key and variant list from `clone-presets.json`
- `--dry-run` (optional): preview only, no Jira writes

---

## Workflow

### Step 0: Load Source

**If `--preset <name>` provided:**

Read `workspace/config/clone-presets.json`. Find the entry matching `<name>`. Extract:

- `sourceKey`: the template UKCAUD ticket key
- `variants`: list of variant names (overrides `--bulk` if both provided)
- `fieldOverrides`: any field values to apply to all clones

**If `sourceKey` provided directly:**

Fetch the ticket via Atlassian MCP:

```
GET /rest/api/3/issue/{sourceKey}
```

Capture all fields: summary, issuetype, labels, components, fixVersions, parent (epic), description, subtasks.

### Step 1: Validate Source

Run JPD-to-UKCAUD validation checks (inherited from `clone-jpd-to-ukcaud.prompt.md`):

- Confirm source exists and is readable
- Check for `Cloners` link — if already cloned, warn:

```
Warning: {sourceKey} has an existing clone link (Cloners relationship).
Clone again anyway? (y/n)
```

- Check destination project doesn't already have a matching summary:

```
JQL: project = UKCAUD AND summary ~ "{source summary keywords}" AND issuetype = {type}
```

If duplicates found, show and confirm before proceeding.

### Step 2: Build Clone Template

Map fields from source to UKCAUD format:

| Source field  | UKCAUD field  | Mapping logic                                              |
| ------------- | ------------- | ---------------------------------------------------------- |
| summary       | summary       | Copy as-is (or variant suffix if --bulk)                   |
| issuetype     | issuetype     | Copy; Epic maps to Epic, Story maps to Story               |
| labels        | labels        | Copy UKCAUD-compatible labels; strip UKJPD-specific labels |
| components    | components    | Inherit if compatible; else prompt                         |
| fixVersions   | fixVersions   | Inherit if fix version exists in UKCAUD; else prompt       |
| parent (epic) | parent (epic) | Carry forward epic link if epic exists in UKCAUD           |
| description   | description   | Copy                                                       |

Present the mapped template for confirmation:

```
Clone template:

Source: {sourceKey} -- "{source summary}"
Target project: UKCAUD
Summary: {mapped summary}
Type: {type}
Labels: [{labels}]
Component: {component}
Fix Version: {fixVersion or "needs selection"}
Parent Epic: {epic key or "none"}

Confirm? (y/edit/cancel)
```

### Step 3: Bulk Expansion (if --bulk or preset variants)

For each variant in the list, create a clone with the summary adjusted:

- Default pattern: `{source summary} - {Variant}`
- If preset defines a `summaryTemplate`, use it: e.g. `"Lead Schedules - {Variant} - Implementation"`

Show expansion preview:

```
Bulk expansion ({N} clones):

1. "{summary} - Variant A"
2. "{summary} - Variant B"
3. "{summary} - Variant C"

Create all? (y/edit/cancel)
```

### Step 4: Dry-Run Output (if --dry-run)

```markdown
## Dry Run -- Clone Preview

**Source:** {sourceKey} -- "{title}"

**Would create ({N} tickets):**

1. **{type}:** "{mapped summary}"
   - Labels: [{labels}]
   - Component: {component}
   - Fix Version: {version}
   - Parent Epic: {epic key or "none"}
   - Clone link: "is cloned from" {sourceKey}

{Additional variants if --bulk}

No Jira changes made. Run without --dry-run to create.
```

### Step 5: Create Clones (if NOT dry-run)

For each clone (single or bulk):

1. Create ticket via Atlassian MCP
2. Add "is cloned from" link to source
3. Copy subtasks (if source has subtasks and type = Story/Bug):
   - Recreate each subtask under the new parent
   - Preserve subtask type names and blocking links

After each creation, log:

```
Created {key}: "{summary}"
```

### Step 6: Post-Create Rovo Enricher Check

For each created ticket, wait 10s then verify Rovo enricher has run (if applicable). Flag if not populated after 30s.

### Step 7: Output

```
Cloned {N} ticket(s) from {sourceKey}:

|-- {key}: "{summary}" (component: {c}, version: {v})
|-- {key}: "{summary}" (component: {c}, version: {v})
+-- {key}: "{summary}" (component: {c}, version: {v})

Clone links: all tickets linked "is cloned from" {sourceKey}
```

### Step 8: Save Preset (if new combination)

If the user ran a new bulk clone pattern not already in `clone-presets.json`, offer to save it:

```
Save this as a preset for next time? (y/n)
Preset name: [suggested-name]
```

If yes, append to `workspace/config/clone-presets.json`.

### Step 9: Log to Metrics

```
| {date} | /clone | Jira | -- | {sourceKey}, {N} clones, {dry-run flag} |
```
