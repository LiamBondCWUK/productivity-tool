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
- **Initiative-specific**: UKCAUD, UKCAS, or DIST work details
- **Dependencies**: Cross-team coordination needs

**Output format** (internal):

```javascript
const insights = [
  {
    type: "strategic", // strategic|decision|customer|initiative|dependency
    initiative: "ukcaud", // ukcaud|ukjpd|ukcas|dist|cross-cutting
    summary: "Brief one-line insight",
    detail: "More context if needed",
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
  const strategyPath =
    "C:/Users/liam.bond/Documents/Productivity Tool/workspace/strategy/product-strategy.md";

  const entry = `
## ${new Date().toISOString().split("T")[0]}: ${insight.summary}

${insight.detail}

*Source: ${inputType} - ${new Date().toISOString()}*
`;

  // Append to relevant section in product-strategy.md
}
```

#### 3.2 Decision Insights

**Target**: `coordinator/decision-log.md`

```javascript
if (insight.type === "decision") {
  const decisionLogPath =
    "C:/Users/liam.bond/Documents/Productivity Tool/workspace/coordinator/decision-log.md";

  const entry = `
## ${new Date().toISOString().split("T")[0]}: ${insight.summary}

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
  const contextPath = `C:/Users/liam.bond/Documents/Productivity Tool/workspace/initiatives/${insight.initiative}/context.md`;

  const entry = `
## ${new Date().toISOString().split("T")[0]}: ${insight.summary}

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
  const customersPath =
    "C:/Users/liam.bond/Documents/Productivity Tool/workspace/strategy/key-customers.md";

  const entry = `
## ${new Date().toISOString().split("T")[0]}: ${insight.summary}

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
  const concernsPath =
    "C:/Users/liam.bond/Documents/Productivity Tool/workspace/coordinator/cross-cutting-concerns.md";

  const entry = `
### ${new Date().toISOString().split("T")[0]}: ${insight.summary}

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

**Default**: Skip creating dated analysis to minimize overhead.

### Step 5: Report Updates

Display summary of what was updated:

```
✅ Processed raw input and extracted 4 insights

**Updated Files**:
- strategy/product-strategy.md (2 strategic insights)
- coordinator/decision-log.md (1 decision)
- initiatives/ukcaud/context.md (1 initiative-specific insight)

**Insights Routed**:
1. [Strategic] UK delivery metrics now include session depth
   → strategy/product-strategy.md

2. [Strategic] Competitive advantage in agent planning capabilities
   → strategy/product-strategy.md

3. [Decision] Beta extended to March 2026 for additional testing
   → coordinator/decision-log.md

4. [Initiative] UK launch includes new onboarding flow
   → initiatives/ukcaud/context.md

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

### Transcript

**Characteristics**:

- Conversational format
- Mix of decisions and discussions
- May contain customer feedback

**Common insight types**: Decision, Customer, Initiative

### Interview

**Characteristics**:

- Focused on specific customer or stakeholder
- Deep dive into use cases
- Uncovers requirements

**Common insight types**: Customer, Initiative, Dependency

### Raw Note

**Characteristics**:

- Unstructured observations
- Mix of topics
- May need interpretation

**Common insight types**: All types possible

---

**Last Updated**: 2026-04-02
**Version**: 1.0 (Updated for UK workspace paths)
