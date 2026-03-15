# Create Initiative Skill

## Description

Automates the creation of a new Jira Initiative issue with comprehensive validation and tracking. Guides the user through Confluence one-pager creation from template and links everything together.

## Usage

```bash
/create-initiative <initiative-name> "<initiative-title>"
```

**Parameters**:
- `<initiative-name>`: Initiative directory name (aida, dca, platform)
- `"<initiative-title>"`: Brief initiative title (will become Jira summary)

**Examples**:
```bash
/create-initiative aida "Agentic AiDA Beta"
/create-initiative dca "DCA Beta Release"
/create-initiative platform "Regional Localization Infrastructure"
```

## Workflow

### Step 1: Gather Information

Prompt user for:
1. **Initiative title** (passed as parameter or prompt)
2. **Problem statement** (brief, 1-2 sentences)
3. **Strategic alignment** (which input goal? e.g., CWP-10)
4. **Target date** (YYYY-MM-DD format)
5. **Parent issue** (default based on initiative):
   - AiDA: CWP-10
   - DCA: CWP-XX (prompt for which)
   - Platform: None (optional)
6. **Assignee** (optional, Jira account ID)

**Example prompts**:
```
Problem statement: What problem does this initiative solve?
> Users need better engagement tracking to measure AiDA adoption and effectiveness

Strategic alignment: Which input goal does this support? (e.g., CWP-10)
> CWP-10

Target date: When should this initiative launch? (YYYY-MM-DD)
> 2026-03-25

Parent issue: Link to parent goal? (default: CWP-10 for AiDA)
> CWP-10
```

### Step 2: Validation

Run these validation checks:

#### 2.1 Required Fields Check
```javascript
if (!title || !problemStatement || !targetDate) {
  throw new Error("Missing required fields: title, problem statement, and target date are required");
}
```

#### 2.2 Parent Exists Check
If parent provided:
```javascript
const parent = await mcp__atlassian__jira_get_issue({issueKey: parentKey});
if (!parent) {
  throw new Error(`Parent issue ${parentKey} does not exist`);
}
```

#### 2.3 Duplicate Check
```javascript
const duplicates = await mcp__atlassian__jira_search_issues({
  jql: `project = AI AND issuetype = Initiative AND summary ~ "${title}"`,
  maxResults: 5
});

if (duplicates.total > 0) {
  console.warn("⚠️  Potential duplicate initiatives found:");
  duplicates.issues.forEach(issue => {
    console.warn(`   - ${issue.key}: ${issue.fields.summary}`);
  });

  const proceed = await promptUser("Potential duplicates found. Proceed anyway? (yes/no)");
  if (proceed !== "yes") {
    throw new Error("Initiative creation cancelled by user");
  }
}
```

#### 2.4 Date Validation
```javascript
const targetDateObj = new Date(targetDate);
const today = new Date();

if (targetDateObj < today) {
  throw new Error("Target date cannot be in the past");
}

if (targetDateObj > new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000)) {
  console.warn("⚠️  Target date is more than 1 year away. Confirm this is correct.");
}
```

**If validation fails**: Prompt user to fix issues, then re-validate.

### Step 3: Create Jira Issue

#### 3.1 Build Payload

Determine labels based on initiative:
```javascript
const labelMap = {
  "aida": ["IntelligentAssistant", "AgenticList", "AiDA"],
  "dca": ["DisclosureChecklist", "AssuranceAgent"],
  "platform": ["Platform", "Infrastructure"]
};

const labels = labelMap[initiativeName] || [];
```

Build description (minimal - just placeholder for Confluence link):
```javascript
const description = {
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

**Note**: Jira description should be minimal - just the Confluence link. All content (problem statement, strategic alignment, value, etc.) belongs in the Confluence one-pager, not duplicated in Jira. See [Jira Formatting Guide](../guides/jira-formatting.md) for formatting patterns.

Create payload:
```javascript
const payload = {
  fields: {
    project: {key: "AI"},
    issuetype: {name: "Initiative"},
    summary: title,
    description: description,
    duedate: targetDate,                    // Standard due date field
    labels: labels,
    customfield_10015: targetDate,          // Start date (set to same as target for now)
    customfield_10022: targetDate,          // Target start (Advanced Roadmaps field)
    customfield_10023: targetDate           // Target end (Advanced Roadmaps field)
  }
};

if (parentKey) {
  payload.fields.parent = {key: parentKey};
}

if (assigneeId) {
  payload.fields.assignee = {accountId: assigneeId};
}
```

#### 3.2 Create Issue

```javascript
const result = await mcp__atlassian__jira_create_issue(payload);
const issueKey = result.key;

console.log(`✅ Created Jira initiative: ${issueKey}`);
console.log(`   View: https://caseware.atlassian.net/browse/${issueKey}`);
```

### Step 4: Create Confluence Page Automatically

#### 4.1 Build Page Title and Content

```javascript
const pageTitle = `[${issueKey}] - ${title} - Initiative One-Pager`;

// Build initial Confluence page content in storage format (HTML-like)
const pageBody = `
<h2>📋 Overview</h2>
<table>
  <tr>
    <th>Jira Issue</th>
    <td><a href="https://caseware.atlassian.net/browse/${issueKey}">${issueKey}</a></td>
  </tr>
  <tr>
    <th>Target Date</th>
    <td>${targetDate}</td>
  </tr>
  <tr>
    <th>Status</th>
    <td>To Do</td>
  </tr>
</table>

<h2>❓ Problem Statement</h2>
<p>${problemStatement}</p>

<h2>🎯 Strategic Alignment</h2>
<p>${strategicAlignment}</p>
${parentKey ? `<p>Parent Goal: <a href="https://caseware.atlassian.net/browse/${parentKey}">${parentKey}</a></p>` : ''}

<h2>💡 Value &amp; Differentiation</h2>
<p><em>To be filled in</em></p>

<h2>📋 DACI</h2>
<table>
  <tr>
    <th>Role</th>
    <th>Person/Team</th>
  </tr>
  <tr>
    <td><strong>Driver</strong></td>
    <td></td>
  </tr>
  <tr>
    <td><strong>Approver</strong></td>
    <td></td>
  </tr>
  <tr>
    <td><strong>Contributors</strong></td>
    <td></td>
  </tr>
  <tr>
    <td><strong>Informed</strong></td>
    <td></td>
  </tr>
</table>

<h2>🎯 Success Metrics</h2>
<p><em>To be filled in</em></p>

<h2>🗂️ Key Epics</h2>
<p><em>Epics will be added as they are created</em></p>

<h2>📅 Timeline &amp; Milestones</h2>
<ul>
  <li>Target Launch: ${targetDate}</li>
</ul>

<h2>🚧 Risks &amp; Mitigations</h2>
<p><em>To be filled in</em></p>
`;
```

#### 4.2 Create Confluence Page

```javascript
const confluencePage = await mcp__atlassian__confluence_create_page({
  spaceId: "PM",  // PM space ID
  title: pageTitle,
  body: pageBody,
  parentId: "1724679265"  // Initiatives parent page
});

const pageId = confluencePage.id;
const confluenceUrl = `https://caseware.atlassian.net/wiki/spaces/PM/pages/${pageId}`;

console.log(`✅ Created Confluence page: ${pageId}`);
console.log(`   View: ${confluenceUrl}`);
```

**Note**: The page is created with initial structure. User can edit in Confluence to fill in remaining sections (Value, DACI details, Success Metrics, Risks).

### Step 5: Link Jira and Confluence

#### 5.1 Update Jira Description with Confluence Link

```javascript
const confluenceUrl = `https://caseware.atlassian.net/wiki/spaces/PM/pages/${pageId}`;

// Minimal description - just the Confluence link
const updatedDescription = {
  type: "doc",
  version: 1,
  content: [
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
  fields: {
    description: updatedDescription
  }
});

console.log(`✅ Updated Jira issue with Confluence link`);
```

**Best practice**: Keep Jira description minimal - only the Confluence link. All initiative details (problem statement, strategic alignment, value, DACI, success metrics, risks) should live in Confluence, not duplicated in Jira.

#### 5.2 Optionally Update Confluence with Jira Macro

Display instructions (manual for now):

```
Optional: Add Jira macro to Confluence page

1. Edit the Confluence page
2. Type "/jira" to insert Jira macro
3. Select "Jira Issue" macro
4. Enter issue key: ${issueKey}
5. Save the page

This embeds the Jira issue card in the Confluence page.
```

### Step 6: Update Tracking Files

#### 6.1 Update milestones.md

```javascript
const milestonesPath = `/Users/quinn.daneyko/Documents/claude-experiments/my-work-agents/initiatives/${initiativeName}/milestones.md`;

const newRow = `| ${issueKey} | ${title} | ${targetDate} | To Do | [${pageId}](${confluenceUrl}) |`;

// Read existing file
const existingContent = await Read({file_path: milestonesPath});

// Find table and add row
const lines = existingContent.split('\n');
const tableIndex = lines.findIndex(line => line.startsWith('| Jira Issue'));
if (tableIndex !== -1) {
  // Insert after header and separator
  lines.splice(tableIndex + 2, 0, newRow);
  await Write({
    file_path: milestonesPath,
    content: lines.join('\n')
  });
} else {
  console.warn("⚠️  Milestones table not found, please add manually");
}

console.log(`✅ Updated ${initiativeName}/milestones.md`);
```

#### 6.2 Log in context.md

```javascript
const contextPath = `/Users/quinn.daneyko/Documents/claude-experiments/my-work-agents/initiatives/${initiativeName}/context.md`;

const decision = `
## ${new Date().toISOString().split('T')[0]}: Created Initiative ${issueKey}

**Initiative**: ${title}
**Target**: ${targetDate}
**Jira**: ${issueKey}
**Confluence**: ${pageId}
**Confluence URL**: ${confluenceUrl}

**Problem Statement**: ${problemStatement}
**Strategic Alignment**: ${strategicAlignment}

**Next Steps**:
- Fill in remaining Confluence sections (DACI details, Value, Success Metrics, Risks)
- Identify and create child epics
- Set up tracking in weekly-todos.md
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
} else {
  console.warn("⚠️  Recent Decisions section not found, please add manually");
}

console.log(`✅ Logged decision in ${initiativeName}/context.md`);
```

### Step 7: Summary and Next Steps

Display success summary:

```
✅ Initiative Creation Complete!

**Created**:
- Jira Initiative: ${issueKey}
  View: https://caseware.atlassian.net/browse/${issueKey}
- Confluence One-Pager: ${pageId}
  View: ${confluenceUrl}

**Updated**:
- initiatives/${initiativeName}/milestones.md
- initiatives/${initiativeName}/context.md

**Next Steps**:
1. Edit Confluence page to fill in remaining sections (DACI details, Value, Success Metrics, Risks)
2. Identify child epics needed to deliver this initiative
3. Create epics using /create-epic skill
4. Set up weekly todos in initiatives/${initiativeName}/weekly-todos.md
5. Coordinate with stakeholders:
   ${initiativeName === 'aida' ? '- Peter (UX/design), PY (platform), Citrin (GA requirements)' : ''}
   ${initiativeName === 'dca' ? '- Peter (Figma review), Citrin (prod GA), PY (platform)' : ''}
   ${initiativeName === 'platform' ? '- PY (architecture), AiDA/DCA agents (dependencies)' : ''}

Run /weekly-todo-review to track progress.
```

## Error Handling

### Error: Parent Issue Not Found
```
❌ Error: Parent issue ${parentKey} does not exist

Please verify the parent issue key and try again. For AiDA initiatives, use CWP-10.
```

### Error: Duplicate Initiative Found
```
⚠️  Potential duplicate initiatives found:
   - AI-909: Engagement Intelligence - CWX Launch
   - AI-536: AiDA Engagement Intelligence Alpha

Creating duplicate initiatives can cause confusion. Consider:
1. Update existing initiative instead
2. Create as child epic if scope is smaller
3. Proceed anyway if this is intentionally different

Proceed with creation? (yes/no)
```

### Error: Invalid Date Format
```
❌ Error: Invalid target date format: ${targetDate}

Please use YYYY-MM-DD format (e.g., 2026-03-25)
```

### Error: Jira API Failure
```
❌ Error creating Jira issue: ${error.message}

Please check:
1. Jira permissions (can you create initiatives in AI project?)
2. Required fields are valid
3. Network connectivity to caseware.atlassian.net

Retry? (yes/no)
```

## Validation Checklist

Before creating initiative, skill verifies:
- [ ] Title provided and < 255 characters
- [ ] Problem statement provided and not empty
- [ ] Strategic alignment specified
- [ ] Target date provided and in valid format (YYYY-MM-DD)
- [ ] Target date is not in the past
- [ ] Parent issue exists (if provided)
- [ ] No duplicate initiatives found (or user confirms override)
- [ ] Initiative name is valid (aida, dca, platform)
- [ ] Tracking files exist (milestones.md, context.md)

## Comment Formatting Guidelines

When adding comments to Jira issues (manually or via API):

**Format**: Plain text with attribution
```
Wave 1 (UK/AU/CA frameworks) split from AI-931

---
Co-authored with Claude Code
```

**Do NOT use**:
- Markdown formatting (`**bold**` doesn't render in Jira comments)
- Complex formatting (stick to plain text)

**Attribution**: Always add "Co-authored with Claude Code" footer for transparency

## Date Field Requirements

**CRITICAL**: Always set ALL FOUR date fields when creating initiatives:

```javascript
{
  duedate: "2026-09-30",              // Standard due date field
  customfield_10015: "2026-07-01",    // Start date
  customfield_10022: "2026-07-01",    // Target start (Advanced Roadmaps)
  customfield_10023: "2026-09-30"     // Target end (Advanced Roadmaps)
}
```

**Why all four?**
- Jira UI shows "Start date: None" and "Due date: None" if standard fields not set
- Advanced Roadmaps uses custom fields (10022, 10023)
- Both field sets must be synchronized for proper display

**Field mapping**:
- `customfield_10015`: Start date (standard custom field)
- `customfield_10022`: Target start (Advanced Roadmaps)
- `customfield_10023`: Target end (Advanced Roadmaps)
- `duedate`: Due date (standard Jira field)

## Notes

- **No stakeholder check for creation**: User is intentionally creating, so no need to check with Peter/PY/Citrin
- **Stakeholder checks for updates**: Use /update-milestone skill for updates, which includes stakeholder checks
- **Confluence page creation is manual**: Uses native Confluence template system for consistency
- **Tracking files updated automatically**: Ensures workspace stays in sync
- **Incomplete creation tracked**: If user skips Confluence page, log in context.md for follow-up
- **Minimal Jira descriptions**: Only Confluence link in Jira; all content lives in Confluence one-pager
- **All four date fields required**: Set both standard (duedate, customfield_10015) and custom roadmap fields (10022, 10023)

## Related Documents

- [Initiative Template Guide](../initiatives/templates/initiative-template-guide.md)
- [Jira Initiative Fields Reference](../initiatives/templates/jira-initiative-fields.md)
- [Best Practices Guide](../initiatives/templates/best-practices.md)

## Examples

### Example 1: AiDA Initiative with Parent

```bash
/create-initiative aida "Agentic AiDA Beta"

Problem statement: Users need planning and execution capabilities in AiDA for complex workflows
Strategic alignment: CWP-10
Target date: 2026-03-25
Parent issue: CWP-10
Assignee: [leave empty]

✅ Created Jira initiative: AI-1234
✅ Updated initiatives/aida/milestones.md
✅ Logged decision in initiatives/aida/context.md

Next: Create Confluence one-pager from template 1727561734
```

### Example 2: DCA Initiative

```bash
/create-initiative dca "DCA Beta Release"

Problem statement: Beta testing with Citrin for production GA validation
Strategic alignment: CWP-XX (DCA goal)
Target date: 2026-03-25
Parent issue: [leave empty or specify DCA parent goal]
Assignee: [leave empty]

✅ Created Jira initiative: AI-1235
✅ Updated initiatives/dca/milestones.md
✅ Logged decision in initiatives/dca/context.md

Next: Create Confluence one-pager from template 1727561734
```

### Example 3: Platform Epic (Localization)

```bash
/create-initiative platform "Regional Localization Infrastructure"

Problem statement: Need shared infrastructure for EMEA, APAC, AMER localization
Strategic alignment: Supports AiDA regional rollout (AI-607)
Target date: 2026-06-01
Parent issue: AI-607 (optional link to AiDA regional rollout)
Assignee: [leave empty]

✅ Created Jira initiative: AI-1236
✅ Updated initiatives/platform/milestones.md
✅ Logged decision in initiatives/platform/context.md

Next: Create Confluence one-pager from template 1727561734
```

---

**Last Updated**: 2026-02-09
**Version**: 1.0 (Initial skill)
