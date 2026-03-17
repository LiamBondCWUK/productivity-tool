# Discover — JPD Discovery Item Creation

## Description

Creates discovery items in the UKJPD project using existing UKJPD Workflows automation. Triggers the appropriate template (Initiative, Solution/Epic, or Idea/Story) and Rovo AI enrichment.

## Trigger

Run when user says:
- `/discover initiative "Title"`
- `/discover epic "Title"`
- `/discover story "Title"`
- "create a discovery item" / "start discovery on"

## Arguments

- `type` (required): initiative, epic, story
- `title` (required): item title

## Workflow

### Step 0: Load Config

Read `workspace/config/system.json` for UKJPD workflows path.

Check if UKJPD Workflows automation is available at `{ukjpdWorkflowsPath}`.

### Step 1: Type Mapping

| Discover Type | UKJPD Issue Type | UKJPD Template |
|---------------|-----------------|----------------|
| initiative | Initiative | Initiative template |
| epic | Solution | Solution/Epic template |
| story | Idea | Idea/Story template |

### Step 2: Load Template

Read the relevant prompt from `{ukjpdWorkflowsPath}/prompts/`:
- `create-initiative.prompt.md` for initiatives
- `create-epic.prompt.md` for epics/solutions
- Idea template for stories

### Step 3: Create UKJPD Item (via Atlassian MCP)

Create the issue in UKJPD:
```
Project: UKJPD
Type: {mapped type}
Summary: {title}
```

Apply the template fields and trigger Rovo AI enrichment if available.

### Step 4: Create Confluence One-Pager

If the template specifies a Confluence page:
- Create page in the appropriate space
- Link to the UKJPD issue

### Step 5: Output

```
Discovery item created:
- {UKJPD key}: "{title}" ({type})
- Confluence: {page link if created}
- Next: `/clone {UKJPD key}` when ready for delivery
```

---

# Clone — JPD to UKCAUD

## Description

Clones a completed JPD discovery item to UKCAUD for delivery. Maps types (Idea → Story, Solution → Epic, Initiative → Initiative), carries Confluence page links, and creates "Cloners" relationships.

## Trigger

Run when user says:
- `/clone UKJPD-123`
- `/clone-ready` (batch mode — finds all items in "Ready for Delivery")
- "clone this to delivery" / "move to UKCAUD"

## Workflow

### Step 1: Read Source (via Atlassian MCP)

Fetch the UKJPD item:
```
GET issue: {UKJPD-key}
Fields: summary, description, status, issuetype, linked Confluence pages
```

Validate status = "Ready for Delivery" (or warn if not).

### Step 2: Type Mapping

Read `workspace/config/projects.json` → UKJPD → cloneMappings:
```
Idea → Story (in UKCAUD)
Solution → Epic (in UKCAUD)
Initiative → Initiative (in UKCAUD)
```

### Step 3: Create UKCAUD Item

Use `/ticket` flow for the mapped type:
- Summary: copied from UKJPD item
- Description: copied + link to UKJPD item
- Triggers full inference engine (subtasks, labels, epic linking)

### Step 4: Link

Create "Cloners" relationship: UKCAUD item clones UKJPD item.

If UKJPD item has a Confluence page, add it to the UKCAUD item description.

### Step 5: Output

```
Cloned: {UKJPD key} → {UKCAUD key}
Type mapping: {source type} → {target type}
Confluence: {linked page}
```

---

## `/clone-ready` — Batch Clone

1. Query: `project = UKJPD AND status = "Ready for Delivery" ORDER BY priority DESC`
2. Present list: "{N} items ready for delivery. Clone all?"
3. For each: execute clone flow
4. Summary report
