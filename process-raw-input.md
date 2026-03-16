# Process Raw Input Skill

## Description

Extracts key insights from raw presentations, transcripts, interviews, or notes and routes them to appropriate workspace files. Designed for quick 2-5 minute processing with minimal overhead.

## Usage

```bash
/process-raw-input
```

**Interactive workflow**: The skill prompts for input type and content, then routes insights automatically.

## Workflow

### Step 1: Identify Input Type

Prompt user to specify content type:

```
What type of content are you processing?

1. presentation - Meeting deck, slide presentation
2. transcript - Meeting transcript, video transcript
3. interview - Customer or stakeholder interview notes
4. raw-note - Unstructured notes or observations

Enter type (presentation|transcript|interview|raw-note):
> presentation
```

**Valid types**:
- `presentation`: Slide decks, meeting presentations
- `transcript`: Meeting or video transcripts
- `interview`: Customer/stakeholder interview notes
- `raw-note`: General unstructured notes

### Step 2: Extract Key Insights

Analyze the provided content and extract 3-5 key insights:

```
Paste the raw content below (press Enter twice when done):
> [User pastes content]

Analyzing content...
```

**Extraction criteria**:
- **Strategic insights**: Product direction, market positioning, competitive analysis
- **Decisions**: Commitments, go/no-go, scope changes
- **Customer insights**: Pain points, use cases, feedback
- **Initiative-specific**: AiDA, DCA, or Platform work details
- **Dependencies**: Cross-team coordination needs

**Output format** (internal):
```javascript
const insights = [
  {
    type: "strategic",  // strategic|decision|customer|initiative|dependency
    initiative: "aida", // aida|dca|platform|cross-cutting
    summary: "Brief one-line insight",
    detail: "More context if needed"
  },
  // ... 3-5 total insights
];
```

### Step 3: Route to Appropriate Files

Based on insight type and initiative, update relevant files:

#### 3.1 Strategic Insights
**Target**: `strategy/product-strategy.md`

```javascript
if (insight.type === "strategic") {
  const strategyPath = "/Users/quinn.daneyko/Documents/claude-experiments/my-work-agents/strategy/product-strategy.md";

  const entry = `
## ${new Date().toISOString().split('T')[0]}: ${insight.summary}

${insight.detail}

*Source: ${inputType} - ${new Date().toISOString()}*
`;

  // Append to relevant section in product-strategy.md
  // (Market Positioning, Competitive Analysis, Product Direction, etc.)
}
```

#### 3.2 Decision Insights
**Target**: `coordinator/decision-log.md`

```javascript
if (insight.type === "decision") {
  const decisionLogPath = "/Users/quinn.daneyko/Documents/claude-experiments/my-work-agents/coordinator/decision-log.md";

  const entry = `
## ${new Date().toISOString().split('T')[0]}: ${insight.summary}

**Context**: ${insight.detail}

**Decision**: [Extracted from content]

**Rationale**: [Why this decision was made]

*Source: ${inputType} - ${new Date().toISOString()}*
`;

  // Append to decision log
}
```

#### 3.3 Initiative-Specific Insights
**Target**: `initiatives/{name}/context.md` (Recent Decisions section)

```javascript
if (insight.type === "initiative" && insight.initiative !== "cross-cutting") {
  const contextPath = `/Users/quinn.daneyko/Documents/claude-experiments/my-work-agents/initiatives/${insight.initiative}/context.md`;

  const entry = `
## ${new Date().toISOString().split('T')[0]}: ${insight.summary}

${insight.detail}

*Source: ${inputType} - ${new Date().toISOString()}*
`;

  // Append to Recent Decisions section in context.md
}
```

#### 3.4 Customer Insights
**Target**: `strategy/key-customers.md`

```javascript
if (insight.type === "customer") {
  const customersPath = "/Users/quinn.daneyko/Documents/claude-experiments/my-work-agents/strategy/key-customers.md";

  const entry = `
## ${new Date().toISOString().split('T')[0]}: ${insight.summary}

**Customer Context**: ${insight.detail}

**Initiative Impact**: ${insight.initiative === "cross-cutting" ? "Multiple initiatives" : insight.initiative.toUpperCase()}

*Source: ${inputType} - ${new Date().toISOString()}*
`;

  // Append to appropriate customer section
}
```

#### 3.5 Cross-Cutting Dependencies
**Target**: `coordinator/cross-cutting-concerns.md`

```javascript
if (insight.type === "dependency") {
  const concernsPath = "/Users/quinn.daneyko/Documents/claude-experiments/my-work-agents/coordinator/cross-cutting-concerns.md";

  const entry = `
### ${new Date().toISOString().split('T')[0]}: ${insight.summary}

${insight.detail}

*Source: ${inputType} - ${new Date().toISOString()}*
`;

  // Append to Active Dependencies section
}
```

### Step 4: Create Dated Analysis (Optional)

**Only create if**:
- Content is complex and needs full context preserved
- User explicitly requests it
- Insights are interconnected and need narrative

```javascript
if (needsFullAnalysis) {
  const analysisPath = `/Users/quinn.daneyko/Documents/claude-experiments/my-work-agents/initiatives/${primaryInitiative}/notes/${inputType}-analysis-${dateStamp}.md`;

  const analysisContent = `
# ${inputType.charAt(0).toUpperCase() + inputType.slice(1)} Analysis - ${dateStamp}

## Source
- Type: ${inputType}
- Date: ${new Date().toISOString()}
- Context: [User-provided or inferred]

## Key Insights

${insights.map(i => `### ${i.summary}\n${i.detail}`).join('\n\n')}

## Full Content

${rawContent}

## Next Steps

${nextSteps}
`;

  // Write to notes/ directory
  console.log(`📄 Created detailed analysis: ${analysisPath}`);
}
```

**Default**: Skip creating dated analysis to minimize overhead.

### Step 5: Report Updates

Display summary of what was updated:

```
✅ Processed raw input and extracted 4 insights

**Updated Files**:
- strategy/product-strategy.md (2 strategic insights)
- coordinator/decision-log.md (1 decision)
- initiatives/aida/context.md (1 initiative-specific insight)

**Insights Routed**:
1. [Strategic] AiDA engagement metrics now include session depth
   → strategy/product-strategy.md

2. [Strategic] Competitive advantage in agent planning capabilities
   → strategy/product-strategy.md

3. [Decision] DCA beta extended to March 2026 for additional testing
   → coordinator/decision-log.md

4. [Initiative] AiDA CWX launch includes new onboarding flow
   → initiatives/aida/context.md

**Next Steps**:
- Review updated files to ensure insights captured correctly
- Follow up on decisions with stakeholders
- Update weekly todos if timeline changed
```

## Input Type Patterns

### Presentation
**Characteristics**:
- Slide-based content
- Strategic themes and direction
- Executive-level decisions

**Common insight types**: Strategic, Decision

**Example prompt**:
```
Processing presentation: Q1 2026 Product Strategy Review

Extracting strategic insights about roadmap prioritization...
```

### Transcript
**Characteristics**:
- Conversational format
- Mix of decisions and discussions
- May contain customer feedback

**Common insight types**: Decision, Customer, Initiative

**Example prompt**:
```
Processing transcript: AiDA Beta Customer Feedback Session

Extracting customer pain points and feature requests...
```

### Interview
**Characteristics**:
- Focused on specific customer or stakeholder
- Deep dive into use cases
- Uncovers requirements

**Common insight types**: Customer, Initiative, Dependency

**Example prompt**:
```
Processing interview: Citrin DCA Beta Feedback

Extracting production GA requirements...
```

### Raw Note
**Characteristics**:
- Unstructured observations
- Mix of topics
- May need interpretation

**Common insight types**: All types possible

**Example prompt**:
```
Processing raw-note: Team Discussion Notes

Extracting actionable insights from notes...
```

## File Structure Reference

**Strategy files**:
- `strategy/product-strategy.md`: Strategic insights, market positioning
- `strategy/key-customers.md`: Customer insights, use cases, feedback

**Coordinator files**:
- `coordinator/decision-log.md`: Major decisions with context
- `coordinator/cross-cutting-concerns.md`: Dependencies, shared work

**Initiative files**:
- `initiatives/aida/context.md`: AiDA-specific insights (Recent Decisions section)
- `initiatives/dca/context.md`: DCA-specific insights (Recent Decisions section)
- `initiatives/platform/context.md`: Platform-specific insights (Recent Decisions section)

**Analysis files** (optional):
- `initiatives/{name}/notes/{type}-analysis-YYYY-MM-DD.md`: Full content + narrative

## Validation

Before updating files:
- [ ] Insights are accurate and actionable
- [ ] Correct initiative attribution (aida|dca|platform|cross-cutting)
- [ ] Appropriate routing to strategy vs. coordinator vs. initiative files
- [ ] No duplicate content (check if insight already captured)
- [ ] Dated entries include source attribution

## Error Handling

### Error: Invalid Input Type
```
❌ Error: Invalid input type "${inputType}"

Valid types: presentation, transcript, interview, raw-note

Please specify a valid type.
```

### Error: File Not Found
```
❌ Error: Target file not found: ${filePath}

This file should exist in the workspace. Check directory structure.
```

### Error: No Insights Extracted
```
⚠️  Warning: No actionable insights extracted from content

This could mean:
- Content is too vague or general
- Content is purely informational (no decisions or new information)
- Content needs more context to interpret

Suggestions:
1. Provide more context about the source
2. Highlight specific sections to focus on
3. Skip processing if content is not actionable
```

## Token Budget

**Keep processing lightweight**:
- Extract 3-5 insights only (not exhaustive)
- Route to existing files (no new file creation unless needed)
- Minimal overhead: 2-5 minutes target
- Skip detailed analysis by default

## Success Metrics

**Good processing**:
- 3-5 insights extracted and routed
- Files updated in 2-5 minutes
- Clear summary of what was updated

**Great processing**:
- Insights directly actionable
- Correct initiative attribution
- No duplicate content
- User immediately knows next steps

## Notes

- **No complex metadata**: Just date and source type
- **No full content duplication**: Extract insights, not entire transcript
- **Routing is automatic**: Skill determines target files based on insight type
- **Minimal notes/ usage**: Only create dated analysis if truly needed
- **Focus on actionability**: Skip purely informational content

## Related Skills

- `/update-milestone` - For milestone changes discovered in content
- `/create-initiative` - If content reveals need for new initiative
- `/weekly-todo-review` - For synthesizing insights into weekly plan

## Examples

### Example 1: Process Presentation

```bash
/process-raw-input

What type of content are you processing?
> presentation

Paste the raw content below:
> [Slide 1: Q1 2026 Product Strategy]
> [Slide 2: AiDA Engagement Intelligence Priority]
> [Slide 3: DCA Beta Extension to March 2026]
> ...

✅ Processed raw input and extracted 3 insights

**Updated Files**:
- strategy/product-strategy.md (1 strategic insight)
- coordinator/decision-log.md (1 decision)
- initiatives/aida/context.md (1 initiative-specific insight)

**Insights Routed**:
1. [Strategic] AiDA Engagement Intelligence is Q1 2026 priority
   → strategy/product-strategy.md

2. [Decision] DCA Beta extended to March 2026 for Citrin feedback
   → coordinator/decision-log.md

3. [Initiative] AiDA CWX launch includes new metrics dashboard
   → initiatives/aida/context.md
```

### Example 2: Process Customer Interview

```bash
/process-raw-input

What type of content are you processing?
> interview

Paste the raw content below:
> [Interview with Citrin - DCA Beta Feedback]
> - Checklist automation saves 2 hours per engagement
> - Need multi-framework support (UK, AU, CA first)
> - Request for audit trail functionality
> ...

✅ Processed raw input and extracted 4 insights

**Updated Files**:
- strategy/key-customers.md (2 customer insights)
- initiatives/dca/context.md (2 initiative-specific insights)

**Insights Routed**:
1. [Customer] Citrin: 2 hours saved per engagement with DCA
   → strategy/key-customers.md

2. [Customer] Citrin: Multi-framework support is must-have for GA
   → strategy/key-customers.md

3. [Initiative] DCA Global Release needs UK/AU/CA frameworks first
   → initiatives/dca/context.md

4. [Initiative] Audit trail feature requested for DCA GA
   → initiatives/dca/context.md
```

### Example 3: Process Team Notes

```bash
/process-raw-input

What type of content are you processing?
> raw-note

Paste the raw content below:
> [Team discussion on platform dependencies]
> - AiDA regional rollout blocked by localization epics
> - Platform team needs AiDA rollout plan first
> - PY to review auth v2.0 migration guide
> ...

✅ Processed raw input and extracted 2 insights

**Updated Files**:
- coordinator/cross-cutting-concerns.md (2 dependencies)

**Insights Routed**:
1. [Dependency] AiDA regional rollout blocked by Platform localization
   → coordinator/cross-cutting-concerns.md

2. [Dependency] Platform needs AiDA rollout plan before creating epics
   → coordinator/cross-cutting-concerns.md

**Next Steps**:
- AiDA agent: Create regional rollout plan (2 days)
- Platform agent: Ready to create localization epics once plan available
```

---

**Last Updated**: 2026-02-10
**Version**: 1.0 (Initial skill for insight management)
