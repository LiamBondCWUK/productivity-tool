# Productivity Tool Customization — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Customize Quinn Daneyko's 12-skill productivity system for Liam Bond's workflow — 3 Jira projects, personal Confluence space, generic stakeholders — and create documentation + user guide.

**Architecture:** Find-and-replace across all 12 skill markdown files, create workspace directory structure with initial template files, install skills as Claude Code commands, and produce a comprehensive user guide.

**Tech Stack:** Markdown skill files, Claude Code commands directory, Jira/Confluence (Atlassian MCP), local filesystem

---

## File Map

### Files to Create

- `workspace/coordinator/weekly-plan.md` — current week's priorities template
- `workspace/coordinator/daily-log.md` — daily entries template
- `workspace/coordinator/decision-log.md` — strategic decisions template
- `workspace/coordinator/cross-cutting-concerns.md` — dependencies tracker
- `workspace/coordinator/notes/` — directory for dated notes
- `workspace/coordinator/archive/` — directory for weekly archives
- `workspace/initiatives/ukcaud/weekly-todos.md` — UKCAUD weekly checklist
- `workspace/initiatives/ukcaud/milestones.md` — UKCAUD milestone tracker
- `workspace/initiatives/ukcaud/context.md` — UKCAUD strategy/decisions
- `workspace/initiatives/ukcaud/epics.md` — UKCAUD epic tracker
- `workspace/initiatives/ukcaud/archive/` — UKCAUD weekly archives
- `workspace/initiatives/dist/weekly-todos.md` — DIST weekly checklist
- `workspace/initiatives/dist/milestones.md` — DIST milestone tracker
- `workspace/initiatives/dist/context.md` — DIST strategy/decisions
- `workspace/initiatives/dist/epics.md` — DIST epic tracker
- `workspace/initiatives/dist/archive/` — DIST weekly archives
- `workspace/initiatives/ukcas/weekly-todos.md` — UKCAS weekly checklist
- `workspace/initiatives/ukcas/milestones.md` — UKCAS milestone tracker
- `workspace/initiatives/ukcas/context.md` — UKCAS strategy/decisions
- `workspace/initiatives/ukcas/epics.md` — UKCAS epic tracker
- `workspace/initiatives/ukcas/archive/` — UKCAS weekly archives
- `workspace/strategy/product-strategy.md` — strategic direction
- `workspace/strategy/key-customers.md` — customer insights
- `docs/USER-GUIDE.md` — comprehensive user guide with daily/weekly workflows
- `docs/CUSTOMIZATION-LOG.md` — what was changed and why

### Files to Modify (All 12 Skills)

- `morning-checkin.md` — paths, initiatives, stakeholders, meeting name
- `evening-checkin.md` — paths, initiatives, stakeholders
- `weekly-todo-review.md` — paths, initiatives, stakeholders, reporting sections
- `ai-checkin-prep.md` — paths, initiatives, meeting name, reporting order
- `create-initiative.md` — paths, project keys, Confluence space, labels, stakeholders, parent goals
- `create-epic.md` — paths, project keys, Confluence space, labels, stakeholders, parent page IDs
- `split-initiative.md` — paths, project keys, Confluence space, labels
- `discover-child-epics.md` — paths, project references
- `process-raw-input.md` — paths, initiatives
- `review-github-code.md` — AiDA-specific analysis → generic, shell paths
- `create-internal-deck.md` — named owners → generic teams, examples
- `markdown-to-pdf.md` — brew → Windows package managers

### Files to Create (Skill Installation)

- `~/.claude/commands/morning-checkin.md` — symlink/copy
- `~/.claude/commands/evening-checkin.md` — symlink/copy
- `~/.claude/commands/weekly-todo-review.md` — symlink/copy
- `~/.claude/commands/ai-checkin-prep.md` — symlink/copy
- `~/.claude/commands/create-initiative.md` — symlink/copy
- `~/.claude/commands/create-epic.md` — symlink/copy
- `~/.claude/commands/split-initiative.md` — symlink/copy
- `~/.claude/commands/discover-child-epics.md` — symlink/copy
- `~/.claude/commands/process-raw-input.md` — symlink/copy
- `~/.claude/commands/review-github-code.md` — symlink/copy
- `~/.claude/commands/create-internal-deck.md` — symlink/copy
- `~/.claude/commands/markdown-to-pdf.md` — symlink/copy

---

## Substitution Reference

All skills share these replacements:

| Pattern                                                             | Replacement                                                 |
| ------------------------------------------------------------------- | ----------------------------------------------------------- |
| `/Users/quinn.daneyko/Documents/claude-experiments/my-work-agents/` | `C:/Users/liam.bond/Documents/Productivity Tool/workspace/` |
| `quinn.daneyko`                                                     | `liam.bond`                                                 |
| `initiatives/aida/`                                                 | `initiatives/ukcaud/`                                       |
| `initiatives/dca/`                                                  | `initiatives/dist/`                                         |
| `initiatives/platform/`                                             | `initiatives/ukcas/`                                        |
| `project: {key: "AI"}`                                              | `project: {key: "UKCAUD"}` (default, context-dependent)     |
| `project = AI` (JQL)                                                | `project = UKCAUD` (default, context-dependent)             |
| `spaceId: "PM"`                                                     | `spaceId: "~623c6d5401f8660070b73415"`                      |
| `/wiki/spaces/PM/`                                                  | `/wiki/spaces/~623c6d5401f8660070b73415/`                   |
| `parentId: "1724679265"`                                            | `parentId: "71467254"`                                      |
| `template 1727561734` / `template 1727561847`                       | `(prompt user for template or create under homepage)`       |
| `CWP-10` (parent goal)                                              | `(prompt user for parent goal — no default)`                |
| `"AI check-in"` / `"status update for Andrew"`                      | `"Liam's AI Check-in"`                                      |
| `(DCA first, then AiDA)`                                            | `(UKCAUD first, then DIST, then UKCAS)`                     |
| `AI-XXX` (issue key format)                                         | `UKCAUD-XXX` / `DIST-XXX` / `UKCAS-XXX` (context-dependent) |
| `parentKey.startsWith('AI-')`                                       | `(validate against UKCAUD-/DIST-/UKCAS- patterns)`          |
| `brew install`                                                      | `winget install` or `choco install` or `scoop install`      |
| `~/.zprofile`                                                       | `(Windows env vars — set via system or .bashrc)`            |
| `open <path>` (macOS)                                               | `start <path>` (Windows)                                    |

### Label Map Replacement

Quinn's labels → Liam's labels:

```javascript
// OLD
const labelMap = {
  aida: ["IntelligentAssistant", "AgenticList", "AiDA"],
  dca: ["DisclosureChecklist", "AssuranceAgent"],
  platform: ["Platform", "Infrastructure"],
};

// NEW
const labelMap = {
  ukcaud: ["UKCloudAudit", "Delivery"],
  dist: ["DIST", "PlatformEscalation"],
  ukcas: ["UKCAS", "InternalSupport"],
};
```

### Stakeholder Replacement

All named stakeholders replaced with generic groups:

```javascript
// OLD
${initiativeName === 'aida' ? '- Peter (UX/design), PY (platform), Citrin (GA requirements)' : ''}
${initiativeName === 'dca' ? '- Peter (Figma review), Citrin (prod GA), PY (platform)' : ''}
${initiativeName === 'platform' ? '- PY (architecture), AiDA/DCA agents (dependencies)' : ''}

// NEW
"Coordinate with relevant stakeholders:\n" +
"   - Product Management (strategic alignment)\n" +
"   - Sales (customer requirements)\n" +
"   - Training (adoption/enablement)\n" +
"   - Support (issue escalation)"
```

---

## Task 1: Create Workspace Directory Structure

**Files:**

- Create: `workspace/coordinator/weekly-plan.md`
- Create: `workspace/coordinator/daily-log.md`
- Create: `workspace/coordinator/decision-log.md`
- Create: `workspace/coordinator/cross-cutting-concerns.md`
- Create: `workspace/initiatives/ukcaud/weekly-todos.md`
- Create: `workspace/initiatives/ukcaud/milestones.md`
- Create: `workspace/initiatives/ukcaud/context.md`
- Create: `workspace/initiatives/ukcaud/epics.md`
- Create: (same for `dist/` and `ukcas/`)
- Create: `workspace/strategy/product-strategy.md`
- Create: `workspace/strategy/key-customers.md`

- [ ] **Step 1: Create all directories**

```bash
cd "C:/Users/liam.bond/Documents/Productivity Tool"
mkdir -p workspace/coordinator/notes
mkdir -p workspace/coordinator/archive
mkdir -p workspace/initiatives/ukcaud/archive
mkdir -p workspace/initiatives/dist/archive
mkdir -p workspace/initiatives/ukcas/archive
mkdir -p workspace/strategy
```

- [ ] **Step 2: Create coordinator template files**

`workspace/coordinator/weekly-plan.md`:

```markdown
# Cross-Initiative Weekly Plan - Week of 2026-03-17

## Metadata

- Week Start: 2026-03-17
- Week End: 2026-03-21
- Created By: Liam Bond

---

## 🔥 This Week: Top Priorities

### Cross-Cutting Work

- [ ] [To be filled during Monday planning]

### UK Cloud Audit (UKCAUD)

- [ ] [To be filled during Monday planning]

### Platform Escalations (DIST)

- [ ] [To be filled during Monday planning]

### Internal Support (UKCAS)

- [ ] [To be filled during Monday planning]

---

## 🚀 Last Week: Wins & Impact

[First week — no prior data]

---

## ⚠️ Issues / Blockers

### Critical (Blocking Work)

None

### Informational (Monitoring)

None

---

## 🔮 Looking Ahead

- [Add upcoming milestones, deadlines, and key dates here]
```

`workspace/coordinator/daily-log.md`:

```markdown
# Daily Log - Week of 2026-03-17

Week: 2026-03-17 → 2026-03-21

---
```

`workspace/coordinator/decision-log.md`:

```markdown
# Decision Log

Captures major decisions with context and rationale.

---
```

`workspace/coordinator/cross-cutting-concerns.md`:

```markdown
# Cross-Cutting Concerns

## Active Dependencies

None yet.

---
```

- [ ] **Step 3: Create initiative template files for UKCAUD**

`workspace/initiatives/ukcaud/weekly-todos.md`:

```markdown
# UK Cloud Audit Weekly Todos - Week of 2026-03-17

Week Start: 2026-03-17

## 📋 This Week's Focus

[To be filled during Monday planning]

## Priorities (Ranked)

- [ ] [Add priorities here]

## In Progress

## Blocked

## Notes

---

**Week Start**: 2026-03-17
**Week End**: 2026-03-21
**Last Updated**: 2026-03-17
```

`workspace/initiatives/ukcaud/milestones.md`:

```markdown
# UK Cloud Audit (UKCAUD) Milestones

| Jira Issue | Title | Target Date | Status | Confluence Page |
| ---------- | ----- | ----------- | ------ | --------------- |
```

`workspace/initiatives/ukcaud/context.md`:

```markdown
# UK Cloud Audit (UKCAUD) Context

## Overview

UK Cloud Audit delivery project (Jira: UKCAUD).

## Key Stakeholders

- Product Management — strategic alignment
- Sales — customer requirements
- Training — adoption/enablement
- Support — issue escalation

## Recent Decisions

[Decisions will be logged here by skills]
```

`workspace/initiatives/ukcaud/epics.md`:

```markdown
# UK Cloud Audit (UKCAUD) Epics

## Active Epics

| Jira Issue | Epic Title | Target Date | Status | Confluence Page |
| ---------- | ---------- | ----------- | ------ | --------------- |
```

- [ ] **Step 4: Create identical template files for DIST and UKCAS**

Same structure as UKCAUD but with appropriate names:

- DIST: "Platform Escalations (DIST)" — Jira project DIST
- UKCAS: "Internal Support (UKCAS)" — Jira project UKCAS

- [ ] **Step 5: Create strategy template files**

`workspace/strategy/product-strategy.md`:

```markdown
# Product Strategy

Strategic direction and positioning insights.

---
```

`workspace/strategy/key-customers.md`:

```markdown
# Key Customers

Customer insights, use cases, and feedback.

---
```

- [ ] **Step 6: Verify directory structure**

```bash
find "C:/Users/liam.bond/Documents/Productivity Tool/workspace" -type f | sort
```

Expected: 17 files across coordinator/, initiatives/ukcaud/, initiatives/dist/, initiatives/ukcas/, strategy/.

- [ ] **Step 7: Commit workspace structure**

```bash
cd "C:/Users/liam.bond/Documents/Productivity Tool"
git add workspace/
git commit -m "feat: create workspace directory structure for Liam's productivity system"
```

---

## Task 2: Customize Daily Cadence Skills (morning-checkin, evening-checkin, weekly-todo-review, ai-checkin-prep)

**Files:**

- Modify: `morning-checkin.md`
- Modify: `evening-checkin.md`
- Modify: `weekly-todo-review.md`
- Modify: `ai-checkin-prep.md`

These four skills share the same workspace path references and initiative names. Apply the substitution reference table to all four files.

- [ ] **Step 1: Customize morning-checkin.md**

Key changes:

1. Replace `initiatives/aida/` with `initiatives/ukcaud/` and `initiatives/dca/` with `initiatives/dist/`
2. Add `initiatives/ukcas/weekly-todos.md` to the context loading list (Step 1)
3. Replace `(Cross-Cutting, DCA, AiDA 2.0, Platform)` with `(Cross-Cutting, UKCAUD, DIST, UKCAS)`
4. Update `initiatives/aida/milestones.md` and `initiatives/dca/milestones.md` references to include all three: `ukcaud`, `dist`, `ukcas`
5. Update `initiatives/aida/context.md` and `initiatives/dca/context.md` references to `ukcaud`, `dist`, `ukcas`
6. Verify no hardcoded paths remain

- [ ] **Step 2: Customize evening-checkin.md**

Key changes:

1. Replace all initiative references (aida → ukcaud, dca → dist, platform → ukcas)
2. Replace all path references per substitution table
3. Update example outputs to use new initiative names
4. Replace "IBP" with "IBP" (keep as-is — user confirmed this is fine)

- [ ] **Step 3: Customize weekly-todo-review.md**

Key changes:

1. Replace ALL hardcoded paths (5 occurrences of `/Users/quinn.daneyko/...`)
2. Replace initiative names in Step 1 file discovery (aida → ukcaud, dca → dist, platform → ukcas)
3. Replace `(Cross-Cutting, DCA, AiDA 2.0, Platform)` with `(Cross-Cutting, UKCAUD, DIST, UKCAS)`
4. Update Step 6 archive paths to use new initiative names
5. Update Step 7 plan sections (AiDA 2.0 → UKCAUD, DCA → DIST)
6. Update Step 8 per-initiative todo file names
7. Update Step 9 summary report with new file paths
8. Replace `DAS` reference with appropriate project or remove
9. Update all examples (Citrin, Peter, etc.) to generic references

- [ ] **Step 4: Customize ai-checkin-prep.md**

Key changes:

1. Replace trigger: `"status update for Andrew"` → `"status update"` / `"Liam's AI Check-in"`
2. Replace `"AI check-in"` → `"Liam's AI Check-in"` in description
3. Replace reporting order: `(DCA first, then AiDA)` → `(UKCAUD first, then DIST, then UKCAS)`
4. Replace Step 2 file references to all three initiatives
5. Update Step 3 synthesis to use UKCAUD/DIST/UKCAS

- [ ] **Step 5: Verify no Quinn-specific references remain in all four files**

```bash
grep -r "quinn\|daneyko\|aida\|dca\|platform\|Peter\|Andrew\|Jeff\|Saul\|Oscar\|Citrin\|PY\b\|CWP-10\|AI-" morning-checkin.md evening-checkin.md weekly-todo-review.md ai-checkin-prep.md
```

Expected: No matches (except generic "AI" in non-key contexts).

- [ ] **Step 6: Commit daily cadence skills**

```bash
git add morning-checkin.md evening-checkin.md weekly-todo-review.md ai-checkin-prep.md
git commit -m "feat: customize daily cadence skills for Liam's workflow"
```

---

## Task 3: Customize Jira/Confluence Integration Skills (create-initiative, create-epic, split-initiative, discover-child-epics)

**Files:**

- Modify: `create-initiative.md`
- Modify: `create-epic.md`
- Modify: `split-initiative.md`
- Modify: `discover-child-epics.md`

These skills have the most changes: project keys, Confluence space, labels, parent page IDs, stakeholder names, and parent goal references.

- [ ] **Step 1: Customize create-initiative.md**

Key changes:

1. Replace ALL hardcoded paths (4 occurrences)
2. Replace `project: {key: "AI"}` → multi-project support:
   - `ukcaud` → `{key: "UKCAUD"}`
   - `dist` → `{key: "DIST"}`
   - `ukcas` → `{key: "UKCAS"}`
3. Replace `project = AI` (JQL) → `project = ${projectKey}` (derived from initiative name)
4. Replace `spaceId: "PM"` → `spaceId: "~623c6d5401f8660070b73415"`
5. Replace Confluence URL paths `/wiki/spaces/PM/` → `/wiki/spaces/~623c6d5401f8660070b73415/`
6. Replace `parentId: "1724679265"` → `parentId: "71467254"`
7. Replace label map with new labels
8. Replace `CWP-10` parent goal references → prompt user for parent
9. Replace `(aida, dca, platform)` valid names → `(ukcaud, dist, ukcas)`
10. Replace ALL stakeholder names with generic groups
11. Replace all `AI-XXX` issue key format references with context-dependent keys
12. Replace `parentKey.startsWith('AI-')` validation → check against UKCAUD-/DIST-/UKCAS-
13. Update all examples

- [ ] **Step 2: Customize create-epic.md**

Same pattern as create-initiative.md plus:

1. Replace parent key validation: `AI-` prefix → project-specific prefix
2. Replace `parent.fields.project.key !== "AI"` check → dynamic project key
3. Replace Confluence fallback parent page ID `"1724679265"` → `"71467254"`
4. Replace all template references
5. Update examples (AI-909, AI-920, AI-607 → generic)

- [ ] **Step 3: Customize split-initiative.md**

Same substitution pattern:

1. Replace all paths, project keys, space IDs, URLs
2. Replace label map
3. Replace template references
4. Update examples (AI-931 → generic)

- [ ] **Step 4: Customize discover-child-epics.md**

Lighter changes:

1. Replace `AI-` issue key references → generic
2. Replace example output (AI-909, AI-1018, etc.) → generic
3. Update script paths if needed
4. Note: `scripts/analyze-epic-hierarchy.mjs` script doesn't exist yet — add a note that user needs to create or adapt this

- [ ] **Step 5: Verify no Quinn-specific references remain**

```bash
grep -r "quinn\|daneyko\|aida\|dca\|platform\|Peter\|PY\|Citrin\|CWP-10\|project = AI\b\|key: \"AI\"\|AI-[0-9]" create-initiative.md create-epic.md split-initiative.md discover-child-epics.md
```

- [ ] **Step 6: Commit Jira/Confluence skills**

```bash
git add create-initiative.md create-epic.md split-initiative.md discover-child-epics.md
git commit -m "feat: customize Jira/Confluence integration skills for UKCAUD/DIST/UKCAS"
```

---

## Task 4: Customize Content Processing Skills (process-raw-input, review-github-code, create-internal-deck, markdown-to-pdf)

**Files:**

- Modify: `process-raw-input.md`
- Modify: `review-github-code.md`
- Modify: `create-internal-deck.md`
- Modify: `markdown-to-pdf.md`

- [ ] **Step 1: Customize process-raw-input.md**

Key changes:

1. Replace ALL 7 hardcoded paths
2. Replace initiative names in insight routing (aida → ukcaud, dca → dist, platform → ukcas)
3. Replace `insight.initiative` valid values
4. Replace example outputs (Citrin, AiDA, DCA → generic)
5. Update file structure reference section

- [ ] **Step 2: Customize review-github-code.md**

Key changes:

1. Replace AiDA-specific analysis section → generic code review focus
2. Replace `caseware/fr-code` examples → generic or user's repos
3. Replace "AiDA integration patterns" → "integration patterns"
4. Replace `~/.zprofile` → Windows env var instructions
5. Replace `source ~/.zprofile` → restart shell or set env var
6. Keep GitHub MCP configuration instructions generic

- [ ] **Step 3: Customize create-internal-deck.md**

Key changes:

1. Replace named owners (Jeff, Saul, Oscar) → generic "[Team Member] - [Area]"
2. Replace example reference `inbox/presentations/Test Coverage.pdf` → generic
3. Replace AiDA/DCA-specific examples → generic initiative examples
4. Update blocker slide format examples with generic names
5. Keep deck structure template generic (it mostly is already)

- [ ] **Step 4: Customize markdown-to-pdf.md**

Key changes:

1. Replace `brew install pandoc` → `winget install pandoc` or `choco install pandoc` or `scoop install pandoc`
2. Replace `brew install typst` → `winget install typst` or `choco install typst`
3. Replace `open <path>` → `start <path>` (Windows)
4. Update example paths to use Windows paths
5. Note: `scripts/md-to-pdf.sh` doesn't exist — will need a Windows-compatible version (`.ps1` or `.bat` or just direct pandoc command)

- [ ] **Step 5: Verify no Quinn-specific references remain**

```bash
grep -r "quinn\|daneyko\|aida\|dca\|platform\|Peter\|Jeff\|Saul\|Oscar\|Citrin\|PY\b\|brew install" process-raw-input.md review-github-code.md create-internal-deck.md markdown-to-pdf.md
```

- [ ] **Step 6: Commit content processing skills**

```bash
git add process-raw-input.md review-github-code.md create-internal-deck.md markdown-to-pdf.md
git commit -m "feat: customize content processing skills and fix Windows compatibility"
```

---

## Task 5: Install Skills as Claude Code Commands

**Files:**

- Create: 12 files in `~/.claude/commands/`

- [ ] **Step 1: Copy customized skills to commands directory**

```bash
cd "C:/Users/liam.bond/Documents/Productivity Tool"
for f in morning-checkin.md evening-checkin.md weekly-todo-review.md ai-checkin-prep.md \
  create-initiative.md create-epic.md split-initiative.md discover-child-epics.md \
  process-raw-input.md review-github-code.md create-internal-deck.md markdown-to-pdf.md; do
  cp "$f" ~/.claude/commands/"$f"
done
```

- [ ] **Step 2: Verify all 12 commands are installed**

```bash
ls ~/.claude/commands/ | grep -E "morning|evening|weekly|checkin|initiative|epic|split|discover|process|review-github|deck|pdf"
```

Expected: 12 files listed.

- [ ] **Step 3: Test skill invocation**

In a new Claude Code session, verify:

- `/morning-checkin` loads correctly
- `/evening-checkin` loads correctly
- `/weekly-todo-review` loads correctly

- [ ] **Step 4: Commit skill installation record**

No git commit needed — commands directory is user-level, not project-level.

---

## Task 6: Update README and Create Documentation

**Files:**

- Modify: `README.md`
- Create: `docs/USER-GUIDE.md`
- Create: `docs/CUSTOMIZATION-LOG.md`

- [ ] **Step 1: Update README.md**

Replace Quinn's customization table with Liam's actual values. Update:

1. All initiative names → UKCAUD, DIST, UKCAS
2. All path references → Windows paths
3. Remove Quinn-specific examples → Liam-specific
4. Update workflow map with new initiative names
5. Update "Typical sequences" with new skill names

- [ ] **Step 2: Create docs/USER-GUIDE.md**

Comprehensive user guide covering:

```markdown
# Productivity Tool — User Guide

## Quick Start

### First-Time Setup

1. Your workspace is at: `C:\Users\liam.bond\Documents\Productivity Tool\workspace\`
2. Skills are installed as Claude Code commands (`/morning-checkin`, etc.)
3. Jira projects: UKCAUD (delivery), DIST (escalations), UKCAS (support)
4. Confluence space: Personal space at [URL]

### Your Daily Workflow

#### Morning (~2 min)

1. Start Claude Code session
2. Type `/morning-checkin`
3. Review the daily brief → answer the guided prompt
4. Focus on your top priority

#### During the Day

- Log quick notes: just type "log this: [note]" in any Claude session
- Process raw content: `/process-raw-input` when you get presentations/transcripts/notes
- Create decks: `/create-internal-deck` before alignment meetings

#### Evening (~2 min)

1. Type `/evening-checkin`
2. Share what happened (or let it synthesize from your log)
3. Optionally pre-load tomorrow's meetings

### Your Weekly Workflow

#### Monday Morning

1. `/morning-checkin` — reviews last week's carryover
2. Fill in "This Week: Top Priorities" in weekly-plan.md
3. Update weekly-todos.md for each initiative

#### Wednesday+ Mornings

- Morning check-in auto-runs commitment progress check
- Flags at-risk items

#### Friday Afternoon (~10-15 min)

1. `/weekly-todo-review`
2. Review pre-populated Wins & Impact draft
3. Add impact statements for completed items
4. Archives current week, sets up next week
5. Share IBP summary with stakeholders

### Meeting Prep

- Before Liam's AI Check-in: `/ai-checkin-prep`
- Before alignment meetings: `/create-internal-deck`

### Planning & Structuring

- New initiative: `/create-initiative ukcaud "Title"`
- Break into epics: `/create-epic ukcaud "Title" UKCAUD-123`
- Split large initiative: `/split-initiative ukcaud UKCAUD-456`
- Verify hierarchy: `/discover-child-epics`

### Utility

- Convert markdown to PDF: `/markdown-to-pdf path/to/file.md`
- Review GitHub code: `/review-github-code https://github.com/...`

## Workspace Structure

[Directory tree]

## All 12 Commands Reference

[Table with command, purpose, when to use]

## Jira Project Mapping

| Initiative Dir | Jira Project | Purpose                 |
| -------------- | ------------ | ----------------------- |
| ukcaud         | UKCAUD       | UK Cloud Audit delivery |
| dist           | DIST         | Platform escalations    |
| ukcas          | UKCAS        | Internal support        |

## Tips

- Skills read local markdown files — keep them updated
- Archived files are read-only snapshots
- IBP-notable items flagged in evening check-in auto-surface on Friday
- Commitment tracking starts Wednesday (configurable)
```

- [ ] **Step 3: Create docs/CUSTOMIZATION-LOG.md**

Document all changes made from Quinn's original:

```markdown
# Customization Log

## Date: 2026-03-17

## Original Author: Quinn Daneyko

## Customized For: Liam Bond

### Global Substitutions Applied

[Table of all find/replace]

### Per-Skill Changes

[Brief notes on any structural changes beyond find/replace]

### What Was NOT Changed

- Custom field IDs (same Atlassian instance)
- IBP reporting format name
- Skill workflow logic and step ordering
- Validation patterns (adapted but same logic)
```

- [ ] **Step 4: Commit documentation**

```bash
git add README.md docs/
git commit -m "docs: add user guide, customization log, and update README for Liam's setup"
```

---

## Task 7: Final Verification

- [ ] **Step 1: Verify no Quinn-specific references remain across ALL files**

```bash
cd "C:/Users/liam.bond/Documents/Productivity Tool"
grep -r "quinn\|daneyko\|/Users/" *.md
grep -r "Peter\|Citrin\|PY\b\|Jeff\|Saul\|Oscar" *.md
grep -r "CWP-10\|project = AI\b\|key: \"AI\"" *.md
```

All three should return empty (no matches).

- [ ] **Step 2: Verify workspace structure is complete**

```bash
find workspace/ -type f | wc -l
```

Expected: 17 files.

- [ ] **Step 3: Verify all skills installed as commands**

```bash
ls ~/.claude/commands/ | grep -cE "morning|evening|weekly|checkin|initiative|epic|split|discover|process|review-github|deck|pdf"
```

Expected: 12.

- [ ] **Step 4: Smoke test — run /morning-checkin**

In a fresh Claude Code session in the Productivity Tool directory, run `/morning-checkin` and verify it:

1. Reads the correct workspace files
2. Uses UKCAUD/DIST/UKCAS initiative names
3. Creates `workspace/coordinator/daily-brief-2026-03-17.md`

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: final verification — all 12 skills customized and workspace ready"
```

---

## Execution Order & Dependencies

```
Task 1 (workspace structure) ─┐
                               ├→ Task 5 (install commands) → Task 7 (verify)
Task 2 (daily cadence) ───────┤
Task 3 (Jira/Confluence) ─────┤
Task 4 (content processing) ──┘
                               └→ Task 6 (documentation) → Task 7 (verify)
```

**Parallelizable:** Tasks 2, 3, 4 are independent and can run in parallel.
**Sequential:** Task 1 must complete before Tasks 2-4 (workspace paths must exist). Task 5 depends on Tasks 2-4. Task 6 depends on all prior tasks. Task 7 is final.
