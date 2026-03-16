# Skill: Create Internal Deck

**Usage**: `/create-internal-deck`

**Purpose**: Generate internal presentation decks for working discussions, aligning teams on technical approaches, surfacing blockers, and driving decisions.

**When to use**:
- Technical architecture discussions
- Cross-team alignment meetings
- Quarterly planning sessions
- Initiative kickoffs or milestone reviews
- Risk/blocker surfacing sessions

**When NOT to use**:
- External presentations (customers, board, investors)
- Marketing materials
- Executive summaries (use separate format)

---

## Deck Format Principles

### Style Guidelines
Based on reference: `inbox/presentations/Test Coverage.pdf`

**Slide Structure**:
- **Title slide**: Topic only (e.g., "Agentic Quality")
- **Outcomes slide**: 3-4 bullets, clear meeting goals
- **Content slides**: Short header + bullets/columns, no paragraphs
- **Blocker slides**: Multi-column layout (Environment | Langfuse | Annotation)
- **Next steps slide**: Numbered actions with owners/timelines

**Formatting Rules**:
- ✅ Bullet points (3-5 per slide max)
- ✅ Scannable headers
- ✅ Concrete examples with metrics (e.g., "25+ FS test cases")
- ✅ Named owners for work in progress (Jeff, Saul, Oscar)
- ❌ No paragraphs or dense text blocks
- ❌ No complex diagrams (use text-based architecture)
- ❌ No jargon without definition on first use

**Slide Count**:
- Target: 8-12 slides for 60-min working session
- Max: 15 slides (including appendix)

---

## Deck Structure Template

### Section 1: Context (1-2 slides)
1. **Title Slide**: Topic name only
2. **Meeting Outcomes**: 3-4 clear goals (transparency, align on path, surface blockers, clarify capacity)

### Section 2: Framework/Approach (2-3 slides)
3. **High-level approach**: Framework or methodology (e.g., AMI loop: Analyze → Measure → Improve)
   - Include concrete goals with metrics
   - Show where current work fits
4. **Milestone timeline** (if relevant): Visual showing Alpha/Beta/GA with dates
5. **Definitions** (if needed): Define key terms (e.g., Alpha = test version, Beta = customer pilot)

### Section 3: Current State (2-3 slides)
6. **Current progress**: What's being built (name owners: Jeff, Saul, etc.)
   - Bullet format: "Jeff - Offline Evaluation: accuracy + cost measurement"
7. **Current process/pain points**: What's working, what's not
   - Include concrete examples (e.g., "Domain experts in aicpa-se-beta")
8. **Example workflow** (optional): Concrete iteration cycle (e.g., AiDA: user feedback → annotation → bug → fix → retest)

### Section 4: Blockers & Gaps (1-2 slides)
9. **Known blockers & risks**: Multi-column layout
   - **Environment & Test Automation**: Current state, problem, decision needed
   - **Infrastructure Gaps**: Approval status, workarounds needed
   - **Process Gaps**: What's not being worked on, impact
   - Use "Current state → Problem → Decision needed" structure

### Section 5: Path Forward (1-2 slides)
10. **Key roles/responsibilities**: Bullet list (5-7 areas)
    - e.g., "Evals platform implementation", "Compliance & vendor alignment"
11. **Next steps**: Numbered actions (1-3 immediate, concrete)
    - e.g., "1. Integrate with quality guild – weekly sync"
    - e.g., "2. Align on core responsibilities to support agentic delivery"

### Optional: Appendix (0-2 slides)
- Integration architecture (text-based: Domain Experts → Annotation UIs → Ground Truth)
- Detailed examples or edge cases
- Technical deep-dives

---

## Workflow

When user invokes `/create-internal-deck`:

### Step 1: Gather Context
Ask user:
1. **Topic**: What's the deck about? (1-2 sentences)
2. **Audience**: Who's attending? (roles: dev, QA, product, VP)
3. **Meeting goal**: What decision or alignment do you need?
4. **Duration**: 30 min? 60 min?
5. **Key content**:
   - What's the current state? (work in progress, blockers)
   - What's the proposed approach/solution?
   - What framework or methodology applies? (if any)
   - What are the risks/blockers?
   - What are next steps?

### Step 2: Structure Content
Based on answers:
- Map content to deck structure template
- Identify which sections are needed (skip optional slides if not relevant)
- Decide if multi-column layouts needed (blockers, current progress)

### Step 3: Draft Deck
Create markdown file at `coordinator/notes/YYYY-MM-DD-{topic-slug}.md`

**Format**:
```markdown
# {Topic Title}

**Discussion Date**: YYYY-MM-DD
**Attendees**: {roles or names}
**Goal**: {1-sentence meeting goal}

---

## Slide 1: {Topic}

[Content in bullets or brief text]

---

## Slide 2: Meeting Outcomes

• Goal 1
• Goal 2
• Goal 3

---

[Continue for all slides...]
```

### Step 4: Review & Iterate
Present draft to user:
- "Here's the draft deck (X slides). Review and let me know if you want to:"
  - Add/remove slides
  - Adjust level of detail
  - Reorder sections
  - Add concrete examples or metrics

### Step 5: Finalize
After user approval:
- Note location of deck file
- Suggest export format (if user wants PDF, suggest manual export or tool)
- Offer to create appendix slides if needed

---

## Key Patterns to Follow

### Blocker Slide Format
Use multi-column layout (3 columns):

```markdown
## Known Blockers & Risks

**Environment & Test Automation**
• Current state: Domain experts testing in `aicpa-se-beta`
• Problem: Cannot recreate environment from beta
• Decision needed: Which environments for testing?

**Infrastructure Gaps**
• Current state: Langfuse approval in-progress
• Problem: Canada blocker (data residency)
• Workaround needed: Alternative trace collection

**Process Gaps**
• Current state: Not actively working on annotation UI
• Problem: Blocks ground truth creation
• Impact: Jeff + Saul's automation blocked
```

### Current Progress Format
Name owners explicitly:

```markdown
## Current Progress

**Jeff - Offline Evaluation**
• Basic offline eval: accuracy + cost measurement
• Leverages existing LangFuse integration
• Out of scope: Creating test datasets (separate)

**Saul - Trace Tagging**
• Add tags to traces, return trace_id
• Enable human reviews
```

### Next Steps Format
Numbered, specific actions:

```markdown
## Next Steps

1. Integrate with quality guild – agentic COE. Weekly sync for now.
2. Align on core responsibilities to support agentic delivery.
3. Resolve environment blocker: Prod vs canary decision (Week 1).
```

### Goals Format
Include metrics when possible:

```markdown
## Goals

• Meet AI milestone targets (pre-May)
• DCA: Automated test coverage for 25+ FS test cases – measuring at min. suggestion accuracy, citation relevance, reasoning quality
• AiDA: Systematic, iterative improvement framework, building on failure modes defined through Alpha & Beta
```

---

## Examples

**Good examples** (reference decks in `inbox/presentations/`):
- `Test Coverage.pdf` - Technical alignment, blockers, integration
- `2026-02-03-mnp-onsite-ai-strategy.pdf` - Customer-facing strategy
- `2026-01-26-baker-tilly-ai-architecture.pdf` - Technical architecture

**When to add concrete examples**:
- Iteration cycles (e.g., AiDA: user feedback → annotation → fix → retest)
- Workflow diagrams (text-based: Domain Experts → Annotation UIs → Ground Truth)
- Metrics (e.g., "90% suggestion accuracy for 25 internal FS")

**When to use multi-column layouts**:
- Blockers/risks with multiple categories
- Current progress with multiple owners
- Integration points showing data flow

---

## Extensibility

Future enhancements (as needed):
- **Export to PowerPoint/Google Slides**: Script to convert markdown → slides
- **Template variations**: Executive summary (5 slides), deep-dive (20 slides), quarterly review
- **Visual assets**: Integration with diagram tools (Miro, Excalidraw)
- **Collaboration**: Multi-author decks, comment threads
- **Reusable slide library**: Standard slides (milestone timeline, AMI framework, roles/responsibilities)

For now: Focus on markdown format, manual export to PDF/slides if needed.

---

## Error Handling

**If user asks for external presentation**:
- "This skill is optimized for internal working discussions. For external presentations (customers, board), I recommend [describe different approach or skill]."

**If user provides insufficient context**:
- Prompt for missing information (audience, goals, key content)
- Offer example answers to help clarify

**If deck grows too large** (>15 slides):
- Suggest splitting into main deck + appendix
- Or break into multiple sessions (e.g., "Technical Deep Dive" + "Business Alignment")

---

**Last Updated**: 2026-02-18
**Version**: 1.0 (Initial skill based on Test Coverage.pdf reference)
