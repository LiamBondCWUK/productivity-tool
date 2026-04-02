# Create PRD Skill

## Description

Battle-tested PRD prompt embodying the full CWAS product playbook. Takes minimal input and cascades into the complete delivery structure: 5 Confluence pages + full UKCAUD Jira hierarchy, all linked together and back to the UKJPD discovery item.

**Use when**: Starting a new initiative or feature, whether from a UKJPD idea or off the cuff.

## Usage

```bash
/create-prd
```

Interactive workflow — the skill prompts for input, validates, then runs the full cascade.

---

## Minimal Input Required

The skill asks for these fields (auto-infers the rest):

```
Initiative name: [name]
Problem: [1-2 sentences describing the core issue]
Target users: [roles affected]
Key capabilities: [bullet list of what needs to be built]
Out of scope: [explicit exclusions for this iteration]
Success metrics: [how we measure success]
UKJPD parent key: [UKJPD-nnn] (or "none — off the cuff")
UKCAUD initiative key: [UKCAUD-nnn] (or "create new")
OKR / Input Goal link: [optional — link to active OKR or Input Goal key]
```

If UKJPD parent is "none", the skill creates a UKJPD Idea item first, then cascades.

---

## Workflow

### Step 0: Project Selection

If the user has not specified which project, ask:

```
Which project does this PRD relate to? (UKCAUD / UKJPD / UKCAS / DIST)
```

Default assumption: UKCAUD for delivery, UKJPD for discovery.

### Step 1: Gather Input

Prompt the user for the minimal input fields above. Accept natural language — don't require strict formatting.

For each field, suggest a default or example:

```
Initiative name: What should we call this initiative? (e.g., "Audit Trail for UKCAS")

Problem: What's broken, missing, or suboptimal? (1-2 sentences)
> e.g., "Support engineers can't trace what happened before a customer-reported bug, making triage slow and error-prone."

Target users: Who uses or is affected by this? (e.g., "Support engineers, Product managers")

Key capabilities: What needs to be built? (bullet list, e.g.):
> - Structured audit log per ticket
> - Timeline view in UKCAS UI
> - Export to CSV for external sharing

Out of scope (this iteration): What are we explicitly NOT doing?
> e.g., "Real-time alerting, cross-project audit rollup"

Success metrics: How will we know it worked?
> e.g., "Support triage time reduced by 30%; 90% of P1 bugs have an audit trail within 2 weeks of launch"

UKJPD parent key: Is there an existing discovery item? (UKJPD-nnn or "none")

UKCAUD initiative key: Create a new initiative or link to existing? (UKCAUD-nnn or "create new")

OKR / Input Goal link: Any active OKR or Input Goal this supports? (e.g., "Q2 2026 OKR: Improve support efficiency" or leave blank)
```

### Step 2: Validate Existing Items

```javascript
// Validate UKJPD parent (if provided)
if (ukjpdKey && ukjpdKey !== "none") {
  const ukjpdItem = await mcp__atlassian__jira_get_issue({
    issueKey: ukjpdKey,
  });
  if (!ukjpdItem) throw new Error(`UKJPD item ${ukjpdKey} not found`);
  console.log(`✅ UKJPD parent: ${ukjpdKey} — ${ukjpdItem.fields.summary}`);
}

// Validate existing UKCAUD initiative (if provided)
if (ukcaudKey && ukcaudKey !== "create new") {
  const initiative = await mcp__atlassian__jira_get_issue({
    issueKey: ukcaudKey,
  });
  if (!initiative) throw new Error(`UKCAUD initiative ${ukcaudKey} not found`);
  if (initiative.fields.issuetype.name !== "Initiative") {
    throw new Error(
      `${ukcaudKey} is type "${initiative.fields.issuetype.name}", not "Initiative"`,
    );
  }
  console.log(
    `✅ UKCAUD initiative: ${ukcaudKey} — ${initiative.fields.summary}`,
  );
}
```

### Step 3: Create UKJPD Item (if none provided)

If UKJPD parent is "none — off the cuff", create one first:

```javascript
const ukjpdPayload = {
  fields: {
    project: { key: "UKJPD" },
    issuetype: { name: "Idea" }, // ⚠️ Verify correct issue type name for UKJPD
    summary: initiativeName,
    description: {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: `Problem: ${problem}\n\nPRD to follow.` },
          ],
        },
      ],
    },
  },
};

const ukjpdResult = await mcp__atlassian__jira_create_issue(ukjpdPayload);
ukjpdKey = ukjpdResult.key;
console.log(`✅ Created UKJPD Idea: ${ukjpdKey}`);
```

### Step 4: Create UKCAUD Initiative (if "create new")

```javascript
const today = new Date().toISOString().split("T")[0];

const initiativePayload = {
  fields: {
    project: { key: "UKCAUD" },
    issuetype: { name: "Initiative" },
    summary: initiativeName,
    description: {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "PRD and Confluence pages: [To be added after page creation]",
            },
          ],
        },
      ],
    },
    duedate: today, // Will be updated after timeline is set
    customfield_10015: today, // Start date
    customfield_10022: today, // Target start (Advanced Roadmaps) — ⚠️ verify field IDs for your instance
    customfield_10023: today, // Target end (Advanced Roadmaps) — ⚠️ verify field IDs for your instance
  },
};

// Link to Input Goal / OKR if provided
if (okrKey) {
  initiativePayload.fields.parent = { key: okrKey };
}

const initiativeResult =
  await mcp__atlassian__jira_create_issue(initiativePayload);
ukcaudKey = initiativeResult.key;
console.log(`✅ Created UKCAUD Initiative: ${ukcaudKey}`);
```

### Step 5: Infer Delivery Structure

Before creating pages, infer the epic breakdown from the key capabilities:

**Grouping logic** (auto-infer, confirm with user if ambiguous):

- Group capabilities into 2-5 epics by theme or delivery phase
- Each epic should be ~1 sprint of work (adjust Fibonacci estimate)
- Flag if any capability suggests a non-UKCAUD project (e.g., a support change → UKCAS epic)

Present the proposed structure for quick confirmation:

```
Proposed epic breakdown for ${initiativeName}:

Epic 1: [Theme] — covers: [capabilities]
Epic 2: [Theme] — covers: [capabilities]
Epic 3: [Theme] — covers: [capabilities]

Confirm? (yes / adjust)
```

If user adjusts, update the structure. If "yes", proceed.

### Step 6: Build PRD Content

Build the full PRD document using the CWAS-aligned template:

```javascript
const prdContent = `
<h1>PRD: ${initiativeName}</h1>

<table>
  <tr>
    <th>UKJPD parent</th><td><a href="https://caseware.atlassian.net/browse/${ukjpdKey}">${ukjpdKey}</a></td>
    <th>UKCAUD Initiative</th><td><a href="https://caseware.atlassian.net/browse/${ukcaudKey}">${ukcaudKey}</a></td>
    <th>Input Goal</th><td>${okrKey || "TBD"}</td>
  </tr>
  <tr>
    <th>Author</th><td>Liam Bond</td>
    <th>Date</th><td>${new Date().toISOString().split("T")[0]}</td>
    <th>Status</th><td>Draft</td>
  </tr>
</table>

<h2>1. Problem Statement</h2>
<p>${problem}</p>
<p><em>Current workaround (if any): [To be filled in]</em></p>

<h2>2. Target Users</h2>
<table>
  <tr><th>User</th><th>Role</th><th>Pain level</th></tr>
  ${targetUsers
    .split(",")
    .map(
      (u) =>
        `<tr><td>${u.trim()}</td><td>[Role]</td><td>[High/Med/Low]</td></tr>`,
    )
    .join("")}
</table>

<h2>3. Success Metrics (OKR-aligned)</h2>
<table>
  <tr><th>Metric</th><th>Current</th><th>Target</th><th>OKR link</th></tr>
  ${successMetrics
    .split("\n")
    .filter((m) => m.trim())
    .map(
      (m) =>
        `<tr><td>${m.trim()}</td><td>TBD</td><td>TBD</td><td>${okrKey || "TBD"}</td></tr>`,
    )
    .join("")}
</table>

<h2>4. Proposed Solution</h2>
<p><em>To be filled in: approach, key design decisions, why this way.</em></p>

<h2>5. Scope (MoSCoW)</h2>

<h3>Must Have</h3>
<ul>
${keyCapabilities
  .split("\n")
  .filter((c) => c.trim())
  .map((c) => `  <li>${c.trim()}</li>`)
  .join("\n")}
</ul>

<h3>Should Have</h3>
<ul><li><em>To be filled in</em></li></ul>

<h3>Could Have</h3>
<ul><li><em>To be filled in</em></li></ul>

<h3>Won't Have (this iteration)</h3>
<ul>
${outOfScope
  .split("\n")
  .filter((o) => o.trim())
  .map((o) => `  <li>${o.trim()}</li>`)
  .join("\n")}
</ul>

<h2>6. Work Item Breakdown (CWAS Hierarchy)</h2>
<p>Initiative: <a href="https://caseware.atlassian.net/browse/${ukcaudKey}">${ukcaudKey}</a></p>
${epics
  .map(
    (epic) => `
<h3>${epic.key}: ${epic.title}</h3>
<ul>
  ${epic.stories.map((s) => `<li>${s}</li>`).join("\n  ")}
</ul>
`,
  )
  .join("")}
<p><em>Sprint allocation: 55% features / 20% tech debt / 10% defects / 15% interrupts</em></p>

<h2>7. Dependencies</h2>
<ul>
  <li><em>To be filled in: upstream/downstream teams, systems, API contracts, external stakeholders</em></li>
</ul>

<h2>8. Timeline &amp; Phases</h2>
<ul>
  <li><em>To be filled in: Fibonacci-based sprint estimates. Phase breakdown if multi-quarter.</em></li>
</ul>

<h2>9. Risks &amp; Mitigations</h2>
<table>
  <tr><th>Risk</th><th>Likelihood</th><th>Impact</th><th>Mitigation</th></tr>
  <tr><td><em>To be filled in</em></td><td></td><td></td><td></td></tr>
</table>

<h2>10. Open Questions</h2>
<ol>
  <li><em>To be filled in: blocking decisions, owner, target resolution date</em></li>
</ol>

<h2>11. Release Readiness Criteria</h2>
<ul>
  <li>GTM sign-off</li>
  <li>Security review complete</li>
  <li>Ops handover complete</li>
  <li>UAT passed (see UAT Test Plan)</li>
  <li><em>Additional criteria per CWAS Release Readiness checklist</em></li>
</ul>
`;
```

### Step 7: Create Confluence Pages

Create all 5 pages in sequence (each child page requires the parent's ID):

#### 7.1 PRD — Master Document

```javascript
const prdPage = await mcp__atlassian__confluence_create_page({
  spaceId: "UKCAUD", // ⚠️ Verify correct Confluence space key for UK team
  title: `[${ukcaudKey}] ${initiativeName} — PRD`,
  body: prdContent,
  parentId: "[VERIFY: Confluence Initiatives parent page ID for UK space]",
});
const prdPageId = prdPage.id;
const prdUrl = `https://caseware.atlassian.net/wiki/spaces/UKCAUD/pages/${prdPageId}`;
console.log(`✅ Created PRD: ${prdUrl}`);
```

#### 7.2 Initiative One-Pager (DACI, KPIs, Risks)

```javascript
const initiativePageBody = `
<h2>Overview</h2>
<table>
  <tr><th>PRD</th><td><a href="${prdUrl}">${prdPageId}</a></td></tr>
  <tr><th>Jira Initiative</th><td><a href="https://caseware.atlassian.net/browse/${ukcaudKey}">${ukcaudKey}</a></td></tr>
  <tr><th>UKJPD Parent</th><td><a href="https://caseware.atlassian.net/browse/${ukjpdKey}">${ukjpdKey}</a></td></tr>
</table>

<h2>DACI</h2>
<table>
  <tr><th>Role</th><th>Person/Team</th></tr>
  <tr><td><strong>Driver</strong></td><td>Liam Bond</td></tr>
  <tr><td><strong>Approver</strong></td><td>[To be filled in]</td></tr>
  <tr><td><strong>Contributors</strong></td><td>[To be filled in]</td></tr>
  <tr><td><strong>Informed</strong></td><td>[To be filled in]</td></tr>
</table>

<h2>KPIs</h2>
<p><em>Link to Plandek dashboard or OKR tracking. To be filled in.</em></p>

<h2>Risks</h2>
<table>
  <tr><th>Risk</th><th>Likelihood</th><th>Impact</th><th>Mitigation</th></tr>
  <tr><td><em>To be filled in</em></td><td></td><td></td><td></td></tr>
</table>
`;

const initiativePage = await mcp__atlassian__confluence_create_page({
  spaceId: "UKCAUD", // ⚠️ Verify correct Confluence space key
  title: `[${ukcaudKey}] ${initiativeName} — Initiative One-Pager`,
  body: initiativePageBody,
  parentId: prdPageId, // Child of PRD
});
console.log(`✅ Created Initiative One-Pager: ${initiativePage.id}`);
```

#### 7.3 Epic One-Pager(s) (one per major scope area)

For each epic in the delivery structure:

```javascript
for (const epic of epics) {
  const epicPageBody = `
<table>
  <tr>
    <th>Jira Epic</th><td><a href="https://caseware.atlassian.net/browse/${epic.key}">${epic.key}</a></td>
    <th>Parent Initiative</th><td><a href="https://caseware.atlassian.net/browse/${ukcaudKey}">${ukcaudKey}</a></td>
  </tr>
</table>

<h2>Summary</h2>
<p>${epic.description}</p>

<h2>Narrative</h2>
<p><em>To be filled in: describe the problem and walk through how the feature works from the user perspective.</em></p>

<h2>Acceptance Criteria</h2>
<p><em>To be filled in with Gherkin-format criteria (Given/When/Then).</em></p>

<h2>Out of Scope</h2>
<ul><li><em>To be filled in</em></li></ul>

<h2>Open Items</h2>
<ac:structured-macro ac:name="warning">
  <ac:parameter ac:name="title">Must be resolved before development begins</ac:parameter>
  <ac:rich-text-body>
    <ol><li><em>To be filled in: blockers, decisions needed, open questions</em></li></ol>
  </ac:rich-text-body>
</ac:structured-macro>
  `;

  const epicPage = await mcp__atlassian__confluence_create_page({
    spaceId: "UKCAUD", // ⚠️ Verify correct Confluence space key
    title: `[${epic.key}] ${epic.title} — Epic One-Pager`,
    body: epicPageBody,
    parentId: prdPageId, // Child of PRD
  });
  epic.confluencePageId = epicPage.id;
  console.log(`✅ Created Epic One-Pager (${epic.key}): ${epicPage.id}`);
}
```

#### 7.4 Technical Spec Stub

```javascript
const techSpecBody = `
<h2>Architecture Overview</h2>
<p><em>To be filled in: key components, system boundaries, data flow.</em></p>

<h2>Dependencies</h2>
<ul>
  <li><em>To be filled in: external services, APIs, internal systems</em></li>
</ul>

<h2>Technical Approach</h2>
<p><em>To be filled in: implementation decisions, patterns, tooling choices.</em></p>

<h2>Open Technical Questions</h2>
<ol>
  <li><em>To be filled in: technical blockers, unknowns, spike items</em></li>
</ol>

<h2>Security Considerations</h2>
<p><em>OWASP review pending. To be filled in before dev starts.</em></p>
`;

const techSpecPage = await mcp__atlassian__confluence_create_page({
  spaceId: "UKCAUD", // ⚠️ Verify correct Confluence space key
  title: `[${ukcaudKey}] ${initiativeName} — Technical Spec`,
  body: techSpecBody,
  parentId: prdPageId, // Child of PRD
});
console.log(`✅ Created Technical Spec stub: ${techSpecPage.id}`);
```

#### 7.5 UAT Test Plan Stub

```javascript
const uatBody = `
<h2>Scope</h2>
<p>UAT for: <a href="https://caseware.atlassian.net/browse/${ukcaudKey}">${ukcaudKey}</a> — ${initiativeName}</p>

<h2>Phase 1: Core Functionality</h2>
<p><em>To be filled in: core user flows to test. Each test case: precondition, steps, expected result.</em></p>

<h2>Phase 2: Edge Cases &amp; Error Handling</h2>
<p><em>To be filled in: error states, boundary conditions, fallback behaviour.</em></p>

<h2>Phase 3: Cross-Browser / Cross-Platform</h2>
<p><em>To be filled in if applicable: device coverage, browser matrix.</em></p>

<h2>Acceptance Sign-Off</h2>
<table>
  <tr><th>Role</th><th>Person</th><th>Date</th><th>Outcome</th></tr>
  <tr><td>Product</td><td>Liam Bond</td><td></td><td></td></tr>
  <tr><td>QA</td><td>[To be assigned]</td><td></td><td></td></tr>
  <tr><td>Stakeholder</td><td>[To be assigned]</td><td></td><td></td></tr>
</table>
`;

const uatPage = await mcp__atlassian__confluence_create_page({
  spaceId: "UKCAUD", // ⚠️ Verify correct Confluence space key
  title: `[${ukcaudKey}] ${initiativeName} — UAT Test Plan`,
  body: uatBody,
  parentId: prdPageId, // Child of PRD
});
console.log(`✅ Created UAT Test Plan stub: ${uatPage.id}`);
```

### Step 8: Create Jira Epics and Stories

For each epic in the delivery structure:

#### 8.1 Create Epic

```javascript
for (const epic of epics) {
  const epicPayload = {
    fields: {
      project: { key: "UKCAUD" },
      issuetype: { name: "Epic" },
      summary: epic.title,
      description: {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Confluence One-Pager: " },
              {
                type: "inlineCard",
                attrs: {
                  url: `https://caseware.atlassian.net/wiki/spaces/UKCAUD/pages/${epic.confluencePageId}`,
                },
              },
            ],
          },
        ],
      },
      parent: { key: ukcaudKey },
      labels: ["UKCAUD_Epic_DoR"], // ⚠️ Verify label name in Jira
      customfield_10015: new Date().toISOString().split("T")[0], // Start date — ⚠️ verify field IDs
      customfield_10022: new Date().toISOString().split("T")[0], // Target start
      customfield_10023: new Date().toISOString().split("T")[0], // Target end
    },
  };

  const epicResult = await mcp__atlassian__jira_create_issue(epicPayload);
  epic.key = epicResult.key;
  console.log(`✅ Created UKCAUD Epic: ${epic.key} — ${epic.title}`);

  // Verify parent linkage
  const verifyEpic = await mcp__atlassian__jira_get_issue({
    issueKey: epic.key,
  });
  if (!verifyEpic.fields.parent || verifyEpic.fields.parent.key !== ukcaudKey) {
    console.warn(
      `⚠️ Parent field not set correctly for ${epic.key} — may need manual fix in Jira UI`,
    );
  }
}
```

#### 8.2 Create Placeholder Stories

For each epic, create placeholder stories in Gherkin format with DoR template:

```javascript
for (const epic of epics) {
  for (const capability of epic.capabilities) {
    const storyBody = {
      type: "doc",
      version: 1,
      content: [
        {
          type: "heading",
          attrs: { level: 3 },
          content: [{ type: "text", text: "Acceptance Criteria (Gherkin)" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: `Given [context]\nWhen [action]\nThen [expected result]`,
            },
          ],
        },
        {
          type: "heading",
          attrs: { level: 3 },
          content: [{ type: "text", text: "Definition of Ready Checklist" }],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "[ ] Acceptance Criteria defined (Gherkin-ready)",
                    },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "[ ] UX mocks linked (if UI-facing)",
                    },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "[ ] Dependencies identified and linked (blocked by)",
                    },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "[ ] Story points estimated (Fibonacci: 1/2/3/5/8)",
                    },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "[ ] Story linked to an Epic (no orphan stories)",
                    },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "[ ] KTLO label applied if applicable (tech-debt or oncall)",
                    },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "[ ] Story belongs to active or planned sprint",
                    },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "[ ] No [DRAFT] or [WIP] in summary",
                    },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "[ ] DoR acknowledged by PO (transition to Ready for Development)",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const storyPayload = {
      fields: {
        project: { key: "UKCAUD" },
        issuetype: { name: "Story" },
        summary: `[AI-GENERATED] ${capability}`,
        description: storyBody,
        parent: { key: epic.key },
        labels: ["requires-review", "ai-generated"],
      },
    };

    const storyResult = await mcp__atlassian__jira_create_issue(storyPayload);
    console.log(`  ✅ Created Story: ${storyResult.key} — ${capability}`);
  }
}
```

### Step 9: Link Everything Back to UKJPD

Link the UKCAUD initiative to the UKJPD parent:

```javascript
await mcp__atlassian__jira_create_issue_link({
  type: "is tracked by", // ⚠️ Verify correct link type name in your Jira instance
  inwardIssue: ukcaudKey,
  outwardIssue: ukjpdKey,
});

// Update UKJPD item with PRD link
await mcp__atlassian__jira_add_comment({
  issueKey: ukjpdKey,
  body: {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: `PRD created: ${ukcaudKey} — ${initiativeName}\nConfluence PRD: https://caseware.atlassian.net/wiki/spaces/UKCAUD/pages/${prdPageId}\n\n---\nCo-authored with Claude Code`,
          },
        ],
      },
    ],
  },
});

console.log(`✅ Linked ${ukcaudKey} → ${ukjpdKey}`);
```

### Step 10: Update UKCAUD Initiative with Confluence Links

```javascript
const initiativeDescription = {
  type: "doc",
  version: 1,
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "PRD: " },
        {
          type: "inlineCard",
          attrs: {
            url: `https://caseware.atlassian.net/wiki/spaces/UKCAUD/pages/${prdPageId}`,
          },
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "UKJPD parent: " },
        {
          type: "inlineCard",
          attrs: { url: `https://caseware.atlassian.net/browse/${ukjpdKey}` },
        },
      ],
    },
  ],
};

await mcp__atlassian__jira_update_issue({
  issueKey: ukcaudKey,
  fields: { description: initiativeDescription },
});

console.log(`✅ Updated ${ukcaudKey} with Confluence and UKJPD links`);
```

### Step 11: Log to Workspace Files

```javascript
const today = new Date().toISOString().split("T")[0];
const workspacePath =
  "C:/Users/liam.bond/Documents/Productivity Tool/workspace/";

// Log to ukcaud/milestones.md
const milestonesPath = `${workspacePath}initiatives/ukcaud/milestones.md`;
// Append new initiative row to milestones table

// Log to ukcaud/context.md
const contextPath = `${workspacePath}initiatives/ukcaud/context.md`;
// Append decision log entry with all created keys/URLs

console.log(`✅ Logged to workspace files`);
```

### Step 12: Return Summary

Display all created items:

```
✅ PRD Cascade Complete — ${initiativeName}

📄 Confluence Pages Created:
  PRD:                   https://caseware.atlassian.net/wiki/spaces/UKCAUD/pages/${prdPageId}
  Initiative One-Pager:  https://caseware.atlassian.net/wiki/spaces/UKCAUD/pages/[id]
${epics.map(e => `  Epic One-Pager (${e.title}): https://caseware.atlassian.net/wiki/spaces/UKCAUD/pages/${e.confluencePageId}`).join('\n')}
  Technical Spec stub:   https://caseware.atlassian.net/wiki/spaces/UKCAUD/pages/[id]
  UAT Test Plan stub:    https://caseware.atlassian.net/wiki/spaces/UKCAUD/pages/[id]

🎫 Jira Items Created:
  UKJPD Idea (discovery): ${ukjpdKey}
    https://caseware.atlassian.net/browse/${ukjpdKey}
  UKCAUD Initiative:       ${ukcaudKey}
    https://caseware.atlassian.net/browse/${ukcaudKey}
${epics.map(e => `  UKCAUD Epic: ${e.key} — ${e.title}\n    https://caseware.atlassian.net/browse/${e.key}`).join('\n')}
  Stories created: [N] placeholder stories with DoR template

🔗 Links:
  ${ukcaudKey} → ${ukjpdKey} (is tracked by)
  PRD linked in both UKCAUD initiative and UKJPD item

📁 Workspace Updated:
  initiatives/ukcaud/milestones.md
  initiatives/ukcaud/context.md

⚠️  Items to verify/complete manually:
  1. Fill in Confluence pages (Solution section, DACI, KPIs, Technical Approach)
  2. Set sprint dates on UKCAUD Initiative (customfield_10015/10022/10023)
  3. Estimate story points on placeholder stories
  4. Confirm DACI roles with stakeholders
  5. Complete UAT test cases before merge
```

---

## PRD Template Reference

The full PRD structure created in Step 6 follows the CWAS product playbook:

```markdown
# PRD: [Initiative Name]

**UKJPD parent:** [key] | **UKCAUD Initiative:** [key] | **Input Goal:** [if known]
**Author:** Liam Bond | **Date:** [auto] | **Status:** Draft

## 1. Problem Statement

[What's broken, missing, or suboptimal. Customer/team pain. Current workaround.]

## 2. Target Users

| User | Role | Volume | Pain level |

## 3. Success Metrics (OKR-aligned)

| Metric | Current | Target | OKR link |
[Tied to Plandek dashboards where measurable: Velocity, Cycle Time, Completion Rate, Quality]
[Explicit link to team OKR / Input Goal]

## 4. Proposed Solution

[Approach + key design decisions. What we're building and why this way.]

## 5. Scope (MoSCoW)

### Must Have

### Should Have

### Could Have

### Won't Have (this iteration)

## 6. Work Item Breakdown (CWAS Hierarchy)

Initiative → Epics → Stories (Gherkin format)
[Auto-generated from scope. Stories follow: Given/When/Then, DoR checklist, KTLO labels]
Sprint allocation: 55% features / 20% tech debt / 10% defects / 15% interrupts

## 7. Dependencies

[Upstream/downstream teams, systems, API contracts, external stakeholders]

## 8. Timeline & Phases

[Fibonacci-based sprint estimates. Phase breakdown if multi-quarter.]

## 9. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |

## 10. Open Questions

[Blocking decisions. Owned by whom. Target resolution date.]

## 11. Release Readiness Criteria

[GTM, security, ops sign-off requirements. Links to CWAS Release Readiness checklist.]
```

---

## Error Handling

### UKJPD item not found

```
❌ UKJPD-nnn does not exist. Please verify the key or say "none" to create a new UKJPD Idea first.
```

### UKCAUD initiative is wrong type

```
❌ UKCAUD-nnn is type "[type]", not "Initiative". Please provide an Initiative key or say "create new".
```

### Confluence page creation fails

```
❌ Failed to create Confluence page: [error]

Check:
1. Confluence space key — verify "UKCAUD" is correct for your instance
2. Parent page ID — verify the Initiatives parent page exists
3. Confluence MCP connectivity

Retry? (yes/no)
```

### Jira epic parent not set after creation

```
⚠️ Epic [key] parent not set correctly. Manually set parent to ${ukcaudKey} in Jira UI.
```

---

## Notes

- **Stories are placeholders**: All stories are created with `[AI-GENERATED]` prefix and `requires-review` label — they need human review and refinement before entering a sprint
- **DoR template embedded**: Every story includes the CWAS DoR checklist so refinement can happen in Jira
- **Confluence pages are stubs**: The 5 pages give structure and cross-links; content sections marked "To be filled in" are intentional — humans fill the domain knowledge
- **Rovo upgrade path**: After 3-4 PRDs created via this Claude prompt and the template is battle-tested, extract the structure into a formal Confluence page template and configure the Rovo Product Requirements Expert agent against it — PRD generation can then trigger directly from Jira without Claude Code
- **Verify before first run**: Confirm Confluence space key, parent page IDs, and Jira field IDs (customfield_10015/10022/10023) for your instance before first use

---

**Last Updated**: 2026-04-01
**Version**: 1.0 (CWAS + Caseware brand + MoSCoW + OKR aligned full cascade)
