# Split Initiative Skill

## Description

Splits a large initiative into multiple smaller initiatives (waves, phases, or sub-initiatives). Validates source initiative, creates new initiatives with proper linking, and transitions source to Cancelled status with explanatory comments.

**Use when**: A single initiative is too large or complex and should be broken into multiple deliverable chunks (e.g., Wave 1 and Wave 2, or regional rollouts).

## Usage

```bash
/split-initiative <initiative-name> <source-issue-key>
```

**Parameters**:
- `<initiative-name>`: Initiative directory name (aida, dca, platform)
- `<source-issue-key>`: Original initiative to split (e.g., AI-931)

**Examples**:
```bash
/split-initiative dca AI-931
/split-initiative aida AI-607
/split-initiative platform AI-1234
```

## Workflow

### Step 1: Validate Source Initiative

Fetch source initiative and verify it exists:
```javascript
const sourceIssue = await mcp__atlassian__jira_get_issue({issueKey: sourceKey});

if (!sourceIssue) {
  throw new Error(`Source initiative ${sourceKey} does not exist`);
}

if (sourceIssue.fields.issuetype.name !== "Initiative") {
  throw new Error(`Source ${sourceKey} is type "${sourceIssue.fields.issuetype.name}", not "Initiative"`);
}

if (sourceIssue.fields.status.name === "Cancelled") {
  throw new Error(`Source ${sourceKey} is already cancelled`);
}

console.log(`✅ Validated source: ${sourceKey} (${sourceIssue.fields.summary})`);
```

### Step 2: Gather Split Information

Prompt user for split structure:
```
How many initiatives should ${sourceKey} be split into?
> 2

Initiative 1 title:
> DCA Global Release - Wave 1: UK/AU/CA Frameworks

Initiative 1 description (what's in this wave?):
> Expand DCA to English-speaking markets with FRS 102, AASB, and Canadian GAAP/ASPE framework support.

Initiative 1 target start date (YYYY-MM-DD):
> 2026-07-01

Initiative 1 target end date (YYYY-MM-DD):
> 2026-09-30

Initiative 2 title:
> DCA Global Release - Wave 2: DE/NL Frameworks with Localization

Initiative 2 description (what's in this wave?):
> Expand DCA to Germany and Netherlands with full localization support for HGB and NL GAAP frameworks.

Initiative 2 target start date (YYYY-MM-DD):
> 2026-10-01

Initiative 2 target end date (YYYY-MM-DD):
> 2026-12-31
```

**Validation**:
- Ensure dates don't overlap (wave 2 start >= wave 1 end)
- Ensure total timeline covers original initiative timeline
- Prompt user to confirm split makes sense

### Step 3: Create New Initiatives

For each new initiative:

#### 3.1 Determine Labels

```javascript
const labelMap = {
  "aida": ["IntelligentAssistant", "AgenticList", "AiDA"],
  "dca": ["DisclosureChecklist", "AssuranceAgent"],
  "platform": ["Platform", "Infrastructure"]
};

const labels = labelMap[initiativeName] || [];
```

#### 3.2 Build Minimal Description

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

#### 3.3 Create Initiative with All Four Date Fields

```javascript
const payload = {
  fields: {
    project: {key: "AI"},
    issuetype: {name: "Initiative"},
    summary: newTitle,
    description: description,
    parent: sourceIssue.fields.parent,  // Inherit parent from source
    duedate: targetEndDate,             // Standard due date field
    labels: labels,
    customfield_10015: targetStartDate, // Start date
    customfield_10022: targetStartDate, // Target start (Advanced Roadmaps)
    customfield_10023: targetEndDate    // Target end (Advanced Roadmaps)
  }
};

const result = await mcp__atlassian__jira_create_issue(payload);
console.log(`✅ Created initiative: ${result.key}`);
```

#### 3.4 Link to Source Initiative

Create "Work item split" link from new initiative to source:
```javascript
await mcp__atlassian__jira_create_issue_link({
  type: "Work item split",
  inwardIssue: result.key,    // New initiative
  outwardIssue: sourceKey     // Source initiative
});

console.log(`✅ Linked ${result.key} to ${sourceKey} (Work item split)`);
```

### Step 4: Transition Source to Cancelled

#### 4.1 Add Comment to Source

**Format**: Plain text with attribution (no markdown formatting)
```javascript
const commentLines = [
  `Split into ${newInitiativeKeys.length} initiatives:`,
  "",
  newInitiativeKeys.map((key, i) => `${i + 1}. ${key}: ${newTitles[i]}`).join("\n"),
  "",
  "---",
  "Co-authored with Claude Code"
];

await mcp__atlassian__jira_add_comment({
  issueKey: sourceKey,
  body: {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [{type: "text", text: commentLines.join("\n")}]
      }
    ]
  }
});

console.log(`✅ Added split comment to ${sourceKey}`);
```

**Important**: Use plain text (no `**bold**` markdown - doesn't render in Jira comments)

#### 4.2 Get Available Transitions

```javascript
const transitions = await mcp__atlassian__jira_get_transitions({issueKey: sourceKey});

const cancelTransition = transitions.transitions.find(t =>
  t.name === "Cancelled" || t.name === "Cancel" || t.to.name === "Cancelled"
);

if (!cancelTransition) {
  console.warn("⚠️  'Cancelled' transition not available for ${sourceKey}");
  console.warn("   Available transitions:");
  transitions.transitions.forEach(t => console.warn(`   - ${t.name}`));
  throw new Error("Cannot transition to Cancelled status");
}
```

#### 4.3 Transition to Cancelled

```javascript
await mcp__atlassian__jira_transition_issue({
  issueKey: sourceKey,
  transitionId: cancelTransition.id,
  comment: "Split into multiple initiatives - see linked issues"
});

console.log(`✅ Transitioned ${sourceKey} to Cancelled`);
```

### Step 5: Create Confluence Pages

For each new initiative, guide user to create Confluence one-pager:

```
📄 Create Confluence One-Pager for ${newKey}

1. Navigate to Confluence PM space:
   https://caseware.atlassian.net/wiki/spaces/PM/

2. Click "Create" → "From template"

3. Select template: Initiative One-Pager (Template ID: 1727561734)

4. Set page title:
   [${newKey}] - ${newTitle} - Initiative One-Pager

5. Set parent page: 1724679265 (Initiatives parent)

6. Fill in content based on split description

7. Save and publish the page

Enter Confluence page ID (or 'skip' to do later):
```

If user provides page ID:
```javascript
const confluenceUrl = `https://caseware.atlassian.net/wiki/spaces/PM/pages/${pageId}`;

// Update Jira description with Confluence link (minimal)
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
  issueKey: newKey,
  fields: {description: updatedDescription}
});

console.log(`✅ Updated ${newKey} with Confluence link`);
```

### Step 6: Update Tracking Files

#### 6.1 Update milestones.md

Add rows for each new initiative:
```javascript
const milestonesPath = `/Users/quinn.daneyko/Documents/claude-experiments/my-work-agents/initiatives/${initiativeName}/milestones.md`;

newInitiatives.forEach(init => {
  const newRow = `| ${init.key} | ${init.title} | ${init.targetEnd} | To Do | [${init.pageId || 'TBD'}](${init.confluenceUrl || '#'}) |`;
  // Append to table
});

console.log(`✅ Updated ${initiativeName}/milestones.md`);
```

#### 6.2 Log in context.md

```javascript
const contextPath = `/Users/quinn.daneyko/Documents/claude-experiments/my-work-agents/initiatives/${initiativeName}/context.md`;

const decision = `
## ${new Date().toISOString().split('T')[0]}: Split Initiative ${sourceKey}

**Source**: ${sourceKey} - ${sourceIssue.fields.summary}
**Reason**: [User provides reason - too large, phased approach, etc.]

**New Initiatives**:
${newInitiatives.map(i => `- ${i.key}: ${i.title} (${i.targetStart} to ${i.targetEnd})`).join('\n')}

**Outcome**: Source ${sourceKey} transitioned to Cancelled, new initiatives created with proper linking.

**Next Steps**:
- Complete Confluence one-pagers for each initiative
- Break down each initiative into epics
- Update weekly todos
`;

// Append to Recent Decisions section

console.log(`✅ Logged decision in ${initiativeName}/context.md`);
```

### Step 7: Verify and Summarize

Run verification:
```javascript
// Verify all new initiatives created
newKeys.forEach(async key => {
  const issue = await mcp__atlassian__jira_get_issue({issueKey: key});
  if (!issue.fields.parent) {
    console.warn(`⚠️  ${key} missing parent field`);
  }
  if (!issue.fields.duedate) {
    console.warn(`⚠️  ${key} missing duedate`);
  }
  if (!issue.fields.customfield_10015) {
    console.warn(`⚠️  ${key} missing start date (customfield_10015)`);
  }
});

// Verify source cancelled
const verifySource = await mcp__atlassian__jira_get_issue({issueKey: sourceKey});
if (verifySource.fields.status.name !== "Cancelled") {
  console.warn(`⚠️  Source ${sourceKey} not transitioned to Cancelled`);
}
```

Display summary:
```
✅ Initiative Split Complete!

**Source**:
- ${sourceKey}: ${sourceIssue.fields.summary}
  Status: Cancelled
  View: https://caseware.atlassian.net/browse/${sourceKey}

**New Initiatives**:
${newInitiatives.map(i => `
- ${i.key}: ${i.title}
  Dates: ${i.targetStart} to ${i.targetEnd}
  View: https://caseware.atlassian.net/browse/${i.key}
  ${i.confluenceUrl ? `Confluence: ${i.confluenceUrl}` : 'Confluence: [To be created]'}
`).join('\n')}

**Updated**:
- initiatives/${initiativeName}/milestones.md
- initiatives/${initiativeName}/context.md

**Next Steps**:
1. ${newInitiatives.some(i => !i.pageId) ? 'Create remaining Confluence one-pagers from template 1727561734' : 'Fill in Confluence one-pagers'}
2. Break down each new initiative into epics using /create-epic
3. Update weekly todos in initiatives/${initiativeName}/weekly-todos.md
4. Coordinate with stakeholders on new timeline
```

## Validation Checklist

Before splitting, skill verifies:
- [ ] Source initiative exists and is type Initiative
- [ ] Source initiative is not already Cancelled
- [ ] New initiative titles are unique
- [ ] New initiative dates don't overlap
- [ ] New initiative dates cover original timeline
- [ ] All new initiatives have all 4 date fields set
- [ ] All new initiatives linked to source with "Work item split" link
- [ ] Source has comment explaining split
- [ ] Source transitioned to Cancelled status

## Date Field Requirements

**CRITICAL**: Always set ALL FOUR date fields for each new initiative:

```javascript
{
  duedate: targetEndDate,              // Standard due date field
  customfield_10015: targetStartDate,  // Start date
  customfield_10022: targetStartDate,  // Target start (Advanced Roadmaps)
  customfield_10023: targetEndDate     // Target end (Advanced Roadmaps)
}
```

## Comment Formatting

See [Jira Formatting Guide](../guides/jira-formatting.md) for complete formatting reference.

**Format**: Plain text with attribution
```
Split into 2 initiatives:

1. AI-1108: DCA Global Release - Wave 1: UK/AU/CA Frameworks
2. AI-1109: DCA Global Release - Wave 2: DE/NL Frameworks with Localization

---
Co-authored with Claude Code
```

**Do NOT use**:
- Markdown `**bold**` formatting (doesn't render in Jira comments)
- Complex formatting

## Error Handling

### Error: Source Not Found
```
❌ Error: Source initiative ${sourceKey} does not exist

Please verify the issue key and try again.
```

### Error: Source Already Cancelled
```
❌ Error: Source initiative ${sourceKey} is already Cancelled

Cannot split a cancelled initiative. If this was cancelled in error, reopen it first.
```

### Error: Overlapping Dates
```
⚠️  Warning: Initiative 2 starts before Initiative 1 ends
   Initiative 1: ${start1} to ${end1}
   Initiative 2: ${start2} to ${end2}

Proceed anyway? (yes/no)
```

## Notes

- **Work item split link type**: Use "Work item split" (inward: "split from", outward: "split to")
- **Inherit parent**: New initiatives should have same parent as source
- **Minimal descriptions**: Only Confluence link in Jira; all content in Confluence
- **All four date fields**: Set both standard (duedate, customfield_10015) and roadmap fields (10022, 10023)
- **Plain text comments**: No markdown formatting in Jira comments
- **Attribution footer**: Always add "Co-authored with Claude Code"
- **Cancelled status**: Source must be transitioned to Cancelled, not just closed

## Related Skills

- `/create-initiative` - For creating single initiatives from scratch
- `/create-epic` - For breaking down new initiatives into epics
- `/update-milestone` - For updating initiative details after creation

## Examples

### Example: Split DCA Global Release

```bash
/split-initiative dca AI-931

How many initiatives should AI-931 be split into?
> 2

Initiative 1 title:
> DCA Global Release - Wave 1: UK/AU/CA Frameworks

Initiative 1 target start: 2026-07-01
Initiative 1 target end: 2026-09-30

Initiative 2 title:
> DCA Global Release - Wave 2: DE/NL Frameworks with Localization

Initiative 2 target start: 2026-10-01
Initiative 2 target end: 2026-12-31

✅ Created AI-1108: DCA Global Release - Wave 1: UK/AU/CA Frameworks
✅ Created AI-1109: DCA Global Release - Wave 2: DE/NL Frameworks with Localization
✅ Linked AI-1108 to AI-931 (Work item split)
✅ Linked AI-1109 to AI-931 (Work item split)
✅ Added split comment to AI-931
✅ Transitioned AI-931 to Cancelled
✅ Updated initiatives/dca/milestones.md
✅ Logged decision in initiatives/dca/context.md

Next: Create Confluence one-pagers for AI-1108 and AI-1109
```

---

**Last Updated**: 2026-02-10
**Version**: 1.0 (Initial skill with all improvements from AI-931 split learnings)
