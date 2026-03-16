# Create Epic Skill

## Description

Automates the creation of a new Jira Epic issue under a parent initiative with comprehensive validation. Guides the user through Confluence epic one-pager creation from template and links everything together.

**CRITICAL**: Always validates parent exists and is Initiative type before creating epic.

## Usage

```bash
/create-epic <initiative-name> "<epic-title>" <parent-issue-key>
```

**Parameters**:
- `<initiative-name>`: Initiative directory name (aida, dca, platform)
- `"<epic-title>"`: Brief epic title (will become Jira summary)
- `<parent-issue-key>`: Parent initiative key (e.g., AI-909)

**Examples**:
```bash
/create-epic aida "User Onboarding Workflows" AI-909
/create-epic dca "Checklist Automation Engine" AI-920
/create-epic platform "EMEA Localization Testing" AI-607
```

## Workflow

### Step 1: Gather Information

Prompt user for:
1. **Epic title** (passed as parameter or prompt)
2. **Parent initiative key** (passed as parameter or prompt) - **REQUIRED**
3. **Brief description** (what's being built, 2-3 sentences)
4. **Target date** (YYYY-MM-DD format)
5. **Assignee** (optional, Jira account ID)

**Example prompts**:
```
Epic title: What capability does this epic deliver?
> User Onboarding Workflows

Parent initiative: Which initiative does this epic support? (provide key, e.g., AI-909)
> AI-909

Description: What's being built? (2-3 sentences)
> Build guided workflows for first-time AiDA users. Includes onboarding checklist, tutorial mode, and contextual help. Reduces time to first successful query from 10 minutes to 2 minutes.

Target date: When should this epic complete? (YYYY-MM-DD)
> 2026-04-15
```

### Step 2: Validation

Run these validation checks in order:

#### 2.1 Required Fields Check
```javascript
if (!title || !parentKey || !description) {
  throw new Error("Missing required fields: title, parent key, and description are required");
}

if (!parentKey.startsWith('AI-')) {
  throw new Error("Parent key must be a valid Jira issue key (e.g., AI-909)");
}
```

#### 2.2 Parent Exists and Type Check (**CRITICAL**)
```javascript
const parent = await mcp__atlassian__jira_get_issue({issueKey: parentKey});

if (!parent) {
  throw new Error(`❌ Parent issue ${parentKey} does not exist. Please verify the issue key and try again.`);
}

if (parent.fields.issuetype.name !== "Initiative") {
  throw new Error(`❌ Parent ${parentKey} is type "${parent.fields.issuetype.name}", not "Initiative". Epics must have Initiative parents.`);
}

console.log(`✅ Validated parent: ${parentKey} (${parent.fields.summary})`);
```

**If parent validation fails**: Stop immediately and prompt user to fix parent key.

#### 2.3 Check Parent is in Same Project
```javascript
if (parent.fields.project.key !== "AI") {
  throw new Error(`Parent ${parentKey} is in project ${parent.fields.project.key}, not AI. Epics must be in same project as parent.`);
}
```

#### 2.4 Duplicate Check
```javascript
const duplicates = await mcp__atlassian__jira_search_issues({
  jql: `project = AI AND issuetype = Epic AND parent = ${parentKey} AND summary ~ "${title}"`,
  maxResults: 5
});

if (duplicates.total > 0) {
  console.warn("⚠️  Potential duplicate epics found under parent:");
  duplicates.issues.forEach(issue => {
    console.warn(`   - ${issue.key}: ${issue.fields.summary}`);
  });

  const proceed = await promptUser("Potential duplicates found. Proceed anyway? (yes/no)");
  if (proceed !== "yes") {
    throw new Error("Epic creation cancelled by user");
  }
}
```

#### 2.5 Date Validation
```javascript
const targetDateObj = new Date(targetDate);
const today = new Date();

if (targetDateObj < today) {
  throw new Error("Target date cannot be in the past");
}

// Check epic date falls within parent initiative dates
if (parent.fields.duedate) {
  const parentDueDate = new Date(parent.fields.duedate);
  if (targetDateObj > parentDueDate) {
    console.warn(`⚠️  Epic target date (${targetDate}) is after parent initiative due date (${parent.fields.duedate})`);
    const proceed = await promptUser("Epic date extends beyond parent. Proceed anyway? (yes/no)");
    if (proceed !== "yes") {
      throw new Error("Epic creation cancelled by user");
    }
  }
}
```

**If validation fails**: Prompt user to fix issues, then re-validate.

### Step 3: Create Jira Epic

#### 3.1 Build Payload

Determine labels based on initiative:
```javascript
const labelMap = {
  "aida": ["IntelligentAssistant", "AgenticList", "AI_-_Epic_-_Definition_of_Ready"],
  "dca": ["DisclosureChecklist", "AssuranceAgent", "AI_-_Epic_-_Definition_of_Ready"],
  "platform": ["Platform", "Infrastructure", "AI_-_Epic_-_Definition_of_Ready"]
};

const labels = labelMap[initiativeName] || ["AI_-_Epic_-_Definition_of_Ready"];
```

Build description (minimal - just placeholder for Confluence link):
```javascript
const descriptionDoc = {
  type: "doc",
  version: 1,
  content: [
    {
      type: "paragraph",
      content: [
        {type: "text", text: "Confluence One-Pager: [To be added after page creation]"}
      ]
    }
  ]
};
```

**Note**: Jira description should be minimal - just the Confluence link. All epic details (description, acceptance criteria, parent initiative context, etc.) belong in the Confluence epic one-pager, not duplicated in Jira. See [Jira Formatting Guide](../guides/jira-formatting.md) for formatting patterns.

Create payload:
```javascript
const payload = {
  fields: {
    project: {key: "AI"},
    issuetype: {name: "Epic"},
    summary: title,
    description: descriptionDoc,
    parent: {key: parentKey},  // CRITICAL: Always set parent
    duedate: targetDate,                    // Standard due date field
    labels: labels,
    customfield_10015: targetDate,          // Start date (set to same as target for now)
    customfield_10022: targetDate,          // Target start (Advanced Roadmaps field)
    customfield_10023: targetDate           // Target end (Advanced Roadmaps field)
  }
};

if (assigneeId) {
  payload.fields.assignee = {accountId: assigneeId};
}
```

#### 3.2 Create Issue

```javascript
const result = await mcp__atlassian__jira_create_issue(payload);
const issueKey = result.key;

console.log(`✅ Created Jira epic: ${issueKey}`);
console.log(`   View: https://caseware.atlassian.net/browse/${issueKey}`);
```

#### 3.3 Verify Parent Linkage

**CRITICAL**: Immediately verify parent field is set correctly:

```javascript
const createdEpic = await mcp__atlassian__jira_get_issue({issueKey: issueKey});

if (!createdEpic.fields.parent || createdEpic.fields.parent.key !== parentKey) {
  console.error(`❌ WARNING: Parent field not set correctly!`);
  console.error(`   Expected: ${parentKey}`);
  console.error(`   Actual: ${createdEpic.fields.parent?.key || 'null'}`);
  console.error(`   You may need to manually set parent in Jira UI`);
} else {
  console.log(`✅ Verified parent linkage: ${issueKey} → ${parentKey}`);
}
```

### Step 4: Create Confluence Page Automatically

#### 4.1 Get Parent Confluence Page ID

Extract parent initiative's Confluence page ID from its description:

```javascript
// Extract Confluence link from parent description
const parentDesc = parent.fields.description;
let parentPageId = null;

if (parentDesc && parentDesc.content) {
  // Search for Confluence URL in description
  const confluenceUrlPattern = /pages\/(\d+)/;
  const match = JSON.stringify(parentDesc).match(confluenceUrlPattern);
  if (match) {
    parentPageId = match[1];
  }
}

if (!parentPageId) {
  console.warn("⚠️  Could not find parent Confluence page ID from Jira description");
  console.warn("   Epic page will be created under Initiatives parent instead");
  parentPageId = "1724679265";  // Fallback to Initiatives parent
}

console.log(`✅ Parent Confluence page ID: ${parentPageId}`);
```

#### 4.2 Build Page Title and Content

```javascript
const pageTitle = `[${issueKey}] - ${title} - Epic One-Pager`;

// Build initial Confluence page content in storage format (HTML-like)
const pageBody = `
<table>
  <tr>
    <th>Jira Epic</th>
    <td><a href="https://caseware.atlassian.net/browse/${issueKey}">${issueKey}</a></td>
    <th>Parent Initiative</th>
    <td><a href="https://caseware.atlassian.net/browse/${parentKey}">${parentKey}</a></td>
    <th>Target Date</th>
    <td>${targetDate}</td>
    <th>Status</th>
    <td>To Do</td>
  </tr>
</table>

<h2>Summary</h2>
<p>${description}</p>

<h2>Narrative</h2>
<p><em>To be filled in: describe the problem and walk through step-by-step how the feature works from the user or engineer perspective.</em></p>

<h2>Acceptance Criteria</h2>
<p><em>To be filled in with named subsections per capability area. Each subsection should contain bullet-point criteria.</em></p>

<h2>Out of Scope</h2>
<ul>
  <li><em>To be filled in: list what is explicitly not covered by this epic.</em></li>
</ul>

<h2>Open Items</h2>
<ac:structured-macro ac:name="warning">
  <ac:parameter ac:name="title">Must be resolved before development begins</ac:parameter>
  <ac:rich-text-body>
    <ol>
      <li><em>To be filled in: list open questions, blockers, or decisions required before implementation can start.</em></li>
    </ol>
  </ac:rich-text-body>
</ac:structured-macro>
`;
```

#### 4.3 Create Confluence Page

```javascript
const confluencePage = await mcp__atlassian__confluence_create_page({
  spaceId: "PM",  // PM space ID
  title: pageTitle,
  body: pageBody,
  parentId: parentPageId  // Parent initiative's Confluence page
});

const pageId = confluencePage.id;
const confluenceUrl = `https://caseware.atlassian.net/wiki/spaces/PM/pages/${pageId}`;

console.log(`✅ Created Confluence page: ${pageId}`);
console.log(`   View: ${confluenceUrl}`);
```

**Note**: The page is created with initial structure. User can edit in Confluence to fill in remaining sections (Goals, Technical Approach, User Stories, Dependencies, Testing, Risks).

### Step 5: Link Jira and Confluence

#### 5.1 Update Jira Description with Confluence Link

```javascript
const confluenceUrl = `https://caseware.atlassian.net/wiki/spaces/PM/pages/${pageId}`;

const updatedDescription = {
  type: "doc",
  version: 1,
  content: [
    {
      type: "paragraph",
      content: [
        {type: "text", text: description}
      ]
    },
    {
      type: "paragraph",
      content: [
        {type: "text", text: `Parent Initiative: `},
        {
          type: "text",
          text: `${parentKey}`,
          marks: [{type: "link", attrs: {href: `https://caseware.atlassian.net/browse/${parentKey}`}}]
        }
      ]
    },
    {
      type: "paragraph",
      content: [
        {type: "text", text: "Confluence One-Pager: "},
        {type: "inlineCard", attrs: {url: confluenceUrl}}
      ]
    }
  ]
};

await mcp__atlassian__jira_update_issue({
  issueKey: issueKey,
  description: updatedDescription
});

console.log(`✅ Updated Jira epic with Confluence link`);
```

#### 5.2 Optionally Update Confluence with Jira Macro

Display instructions (manual for now):

```
Optional: Add Jira macro to Confluence epic page

1. Edit the Confluence page
2. Type "/jira" to insert Jira macro
3. Select "Jira Issue" macro
4. Enter issue key: ${issueKey}
5. Save the page

This embeds the Jira epic card in the Confluence page.
```

#### 5.3 Remind User to Update Parent Initiative Page

```
Optional: Add epic to parent initiative's "Key Epics" section

1. Navigate to parent initiative page: ${parentPageId ? confluenceUrl.replace(pageId, parentPageId) : '[parent page]'}
2. Edit the page
3. Find "🗂️ Key Epics" section
4. Add a new row:
   - **[${issueKey}] ${title}**
     - ${description}
     - Target: ${targetDate}
     - Status: To Do
     - Link: ${confluenceUrl}
5. Save the page
```

### Step 6: Update Tracking Files

#### 6.1 Create or Update epics.md

```javascript
const epicsPath = `/Users/quinn.daneyko/Documents/claude-experiments/my-work-agents/initiatives/${initiativeName}/epics.md`;

// Check if epics.md exists
let epicsContent;
try {
  epicsContent = await Read({file_path: epicsPath});
} catch (error) {
  // Create new epics.md
  epicsContent = `# ${initiativeName.toUpperCase()} Epics

## Active Epics

| Jira Issue | Epic Title | Target Date | Status | Confluence Page |
|------------|-----------|-------------|--------|-----------------|
`;
}

const newRow = `| ${issueKey} | ${title} | ${targetDate} | To Do | [${pageId}](${confluenceUrl}) |`;

// Add row to table
const lines = epicsContent.split('\n');
const tableIndex = lines.findIndex(line => line.startsWith('| Jira Issue'));
if (tableIndex !== -1) {
  lines.splice(tableIndex + 2, 0, newRow);
  await Write({
    file_path: epicsPath,
    content: lines.join('\n')
  });
  console.log(`✅ Updated ${initiativeName}/epics.md`);
} else {
  console.warn("⚠️  Epics table not found, please add manually");
}
```

#### 6.2 Log in context.md

```javascript
const contextPath = `/Users/quinn.daneyko/Documents/claude-experiments/my-work-agents/initiatives/${initiativeName}/context.md`;

const decision = `
## ${new Date().toISOString().split('T')[0]}: Created Epic ${issueKey}

**Epic**: ${title}
**Parent**: ${parentKey} (${parent.fields.summary})
**Target**: ${targetDate}
**Jira**: ${issueKey}
**Confluence**: ${pageId}
**Confluence URL**: ${confluenceUrl}

**Description**: ${description}

**Next Steps**:
- Fill in remaining Confluence sections (Goals, Technical Approach, User Stories, Testing, Risks)
- Break down into user stories
- Identify dependencies and blockers
- Add to weekly-todos.md
- Coordinate with stakeholders if needed
`;

// Read existing content
const existingContext = await Read({file_path: contextPath});

// Find Recent Decisions section and append
const contextLines = existingContext.split('\n');
const decisionsIndex = contextLines.findIndex(line => line.includes('## Recent Decisions'));
if (decisionsIndex !== -1) {
  contextLines.splice(decisionsIndex + 1, 0, decision);
  await Write({
    file_path: contextPath,
    content: contextLines.join('\n')
  });
  console.log(`✅ Logged decision in ${initiativeName}/context.md`);
} else {
  console.warn("⚠️  Recent Decisions section not found, please add manually");
}
```

### Step 7: Verify Hierarchy

Run reverse lookup script to verify epic appears under parent:

```bash
node scripts/analyze-epic-hierarchy.mjs
```

Display result:

```
🔍 Verifying epic hierarchy...

Run: node scripts/analyze-epic-hierarchy.mjs

Expected output:
  ${parentKey}: ${parent.fields.summary}
    ├── ${issueKey}: ${title}
    └── [other epics...]

If ${issueKey} does not appear under ${parentKey}, the parent field was not set correctly.
Contact Jira admin or manually set parent field in Jira UI.
```

### Step 8: Summary and Next Steps

Display success summary:

```
✅ Epic Creation Complete!

**Created**:
- Jira Epic: ${issueKey}
  View: https://caseware.atlassian.net/browse/${issueKey}
  Parent: ${parentKey}
- Confluence Epic One-Pager: ${pageId}
  View: ${confluenceUrl}
  Parent Page: ${parentPageId}

**Updated**:
- initiatives/${initiativeName}/epics.md
- initiatives/${initiativeName}/context.md

**Verified**:
✅ Parent field set: ${issueKey} → ${parentKey}

**Next Steps**:
1. Edit Confluence page to fill in remaining sections (Goals, Technical Approach, User Stories, Testing, Risks)
2. Add epic to parent initiative's "Key Epics" section in Confluence page ${parentPageId}
3. Break down epic into user stories (create Story issues with parent=${issueKey})
4. Identify dependencies:
   - What blocks this epic?
   - What does this epic block?
5. Add to weekly todos: initiatives/${initiativeName}/weekly-todos.md
6. Coordinate with stakeholders if needed:
   ${initiativeName === 'aida' ? '- Peter (UX/design), PY (platform)' : ''}
   ${initiativeName === 'dca' ? '- Peter (Figma review), Citrin (beta testing)' : ''}
   ${initiativeName === 'platform' ? '- PY (architecture), AiDA/DCA agents (notify of dependencies)' : ''}

Run: node scripts/analyze-epic-hierarchy.mjs
To verify epic appears in hierarchy under ${parentKey}
```

## Error Handling

### Error: Parent Issue Not Found
```
❌ Error: Parent issue ${parentKey} does not exist

Please verify the parent issue key and try again.
You can search for initiatives with:
  JQL: project = AI AND issuetype = Initiative

Or check initiatives/${initiativeName}/milestones.md for valid parent keys.
```

### Error: Parent is Wrong Type
```
❌ Error: Parent ${parentKey} is type "${parent.fields.issuetype.name}", not "Initiative"

Epics must have Initiative parents, not ${parent.fields.issuetype.name}.

If you intended to create a Story under an Epic, use:
  project.key = "AI"
  issuetype = "Story"
  parent = ${parentKey}

Otherwise, provide a valid Initiative key (e.g., AI-909, AI-920).
```

### Error: Duplicate Epic Found
```
⚠️  Potential duplicate epics found under ${parentKey}:
   - AI-897: User Feedback Trace Logging & Engagement Quality
   - AI-606: AiDA Engagement Intelligence Alpha

Creating duplicate epics can cause confusion and duplicate work. Consider:
1. Check if existing epic covers your scope
2. Update existing epic instead
3. Proceed anyway if this is intentionally different

Proceed with creation? (yes/no)
```

### Error: Epic Date After Parent Date
```
⚠️  Epic target date (${targetDate}) is after parent initiative due date (${parent.fields.duedate})

This means the epic extends beyond the initiative's timeline. Consider:
1. Adjust epic target date to fall within initiative timeline
2. Update parent initiative due date if needed
3. Proceed anyway if epic will complete after initiative launches

Proceed with creation? (yes/no)
```

### Error: Parent Field Not Set After Creation
```
❌ WARNING: Parent field not set correctly after creation!

Expected: ${parentKey}
Actual: ${createdEpic.fields.parent?.key || 'null'}

This is a critical error. The epic ${issueKey} will not appear in the parent initiative's child list.

Actions:
1. Manually set parent field in Jira UI:
   - Edit ${issueKey}
   - Set "Parent" field to ${parentKey}
   - Save

2. Contact Jira admin to ensure "Parent" field is on Epic create/edit screen

3. Run: node scripts/analyze-epic-hierarchy.mjs
   To verify epic appears under parent after manual fix
```

## Validation Checklist

Before creating epic, skill verifies:
- [ ] Title provided and < 255 characters
- [ ] Parent key provided and in format AI-XXX
- [ ] Description provided and not empty
- [ ] Target date provided and in valid format (YYYY-MM-DD)
- [ ] **Parent issue exists** (fetch via jira_get_issue)
- [ ] **Parent issue is Initiative type** (not Epic, Story, etc.)
- [ ] Parent issue is in AI project
- [ ] Target date is not in the past
- [ ] Target date falls within parent initiative dates (or user confirms override)
- [ ] No duplicate epics found under same parent (or user confirms override)
- [ ] Initiative name is valid (aida, dca, platform)
- [ ] Tracking files exist (context.md, epics.md if already created)

After creating epic, skill verifies:
- [ ] Epic issue key returned from API
- [ ] **Parent field set correctly** (fetch and verify fields.parent.key)
- [ ] Confluence page created (if user provides page ID)
- [ ] Tracking files updated
- [ ] Decision logged

## Notes

- **No stakeholder check for creation**: User is intentionally creating, so no need to check with Peter/PY/Citrin
- **Stakeholder checks for updates**: Use /update-milestone skill for updates, which includes stakeholder checks
- **Confluence page creation is manual**: Uses native Confluence template system for consistency
- **Parent field is CRITICAL**: Without it, epic is orphaned and undiscoverable
- **Immediate verification**: Fetch epic after creation to confirm parent field is set
- **Reverse lookup recommended**: Run analyze-epic-hierarchy.mjs monthly to verify all epics have parents

## Related Documents

- [Epic Template Guide](../initiatives/templates/epic-template-guide.md)
- [Jira Epic Fields Reference](../initiatives/templates/jira-epic-fields.md)
- [Best Practices Guide](../initiatives/templates/best-practices.md)

## Examples

### Example 1: AiDA Epic Under AI-909

```bash
/create-epic aida "User Feedback Trace Logging" AI-909

Description: Build feedback infrastructure for engagement quality tracking. Users provide feedback on AiDA responses with full conversation trace.
Target date: 2026-03-15

✅ Validated parent: AI-909 (Engagement Intelligence - CWX Launch)
✅ Created Jira epic: AI-1237
✅ Verified parent linkage: AI-1237 → AI-909
✅ Updated initiatives/aida/epics.md
✅ Logged decision in initiatives/aida/context.md

Next: Create Confluence epic one-pager from template 1727561847
```

### Example 2: DCA Epic Under AI-920

```bash
/create-epic dca "Checklist Automation Engine" AI-920

Description: Core automation engine for disclosure checklist processing. Handles checklist parsing, rule evaluation, and recommendation generation.
Target date: 2026-02-28

✅ Validated parent: AI-920 (DCA Alpha)
✅ Created Jira epic: AI-1238
✅ Verified parent linkage: AI-1238 → AI-920
✅ Updated initiatives/dca/epics.md
✅ Logged decision in initiatives/dca/context.md

Next: Create Confluence epic one-pager from template 1727561847
```

### Example 3: Platform Epic Under AI-607

```bash
/create-epic platform "EMEA Localization Testing" AI-607

Description: Build testing infrastructure for EMEA region localization. Includes embeddings localization, AiDA chat regional testing, and compliance validation.
Target date: 2026-06-01

✅ Validated parent: AI-607 (US AiDA Regional Rollout)
✅ Created Jira epic: AI-1239
✅ Verified parent linkage: AI-1239 → AI-607
✅ Updated initiatives/platform/epics.md
✅ Logged decision in initiatives/platform/context.md

Next: Create Confluence epic one-pager from template 1727561847
```

---

**Last Updated**: 2026-02-09
**Version**: 1.0 (Initial skill)
