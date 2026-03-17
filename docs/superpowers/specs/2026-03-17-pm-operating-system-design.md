# PM Operating System — Design Spec

**Author:** Liam Bond (with Claude)
**Date:** 2026-03-17
**Status:** Draft — awaiting review

---

## 1. Overview

An automated productivity system for a product manager managing three Jira projects (UKCAUD, DIST, UKCAS) that unifies daily task management, weekly reporting, ticket creation, and stakeholder updates into a single operating system powered by Claude Code.

**Core principle:** Every action cascades — work completing at the bottom rolls up status through epics, initiatives, and goals. One system, one source of truth, no duplicate reporting.

**Replaces/enhances:**

- Quinn Daneyko's 12-skill productivity tool (daily cadence, Jira/Confluence integration)
- Existing chief-of-staff agent (communications triage)
- Sprint command (sprint lifecycle)
- UKJPD Workflows automation (discovery-to-delivery pipeline)
- Manual status updates across Atlassian Goals, Projects, and Confluence

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    DAILY HUB (chief-of-staff)                 │
│   /gm (morning) → day tracking → /eod (evening) → /prep      │
│                                                                │
│   Pulls from:                                                  │
│   ├── Jira (UKCAUD sprint + backlog, DIST, UKCAS)            │
│   ├── Local workspace (weekly-plan, todos, daily-log)          │
│   ├── Teams (messages, meetings, action items)                 │
│   ├── Confluence (milestones, sprint pages)                    │
│   └── Atlassian Goals (goal progress, linked initiatives)      │
└────────┬──────────┬───────────┬──────────┬────────────────────┘
         │          │           │          │
  ┌──────▼──┐ ┌─────▼────┐ ┌───▼────┐ ┌───▼──────────────┐
  │ WEEKLY  │ │ TICKET   │ │ESCALATE│ │ DECK & DOCS      │
  │ REVIEW  │ │ FACTORY  │ │        │ │                   │
  │         │ │          │ │ UKCAS →│ │ /deck (branded)   │
  │ /sprint │ │ /discover│ │ UKCAUD │ │ /pdf              │
  │ retro   │ │ /clone   │ │ or     │ │                   │
  │ →Conflu │ │ /ticket  │ │ DIST   │ │ /process          │
  │  ence   │ │ /tickets │ │        │ │ (raw input)       │
  │ +Goals  │ │ /escalate│ │ +Teams │ │                   │
  └─────────┘ └──────────┘ └────────┘ └───────────────────┘
```

### Hierarchy Model

```
Atlassian Goal (GraphQL API — home.atlassian.com)
  ↕ linked via goals_linkWorkItem
Jira Initiative (UKCAUD / UKJPD)
  └── Epic (UKCAUD)
        └── Story / Bug (UKCAUD)
              └── Subtasks (Development, Manual Testing, Content,
                            Automated Testing, Peer Review, etc.)
```

---

## 3. Jira Projects & Boards

| Project                 | Key    | Purpose                                         | Issue Types                                                                                                                                        |
| ----------------------- | ------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| UK Cloud Audit Delivery | UKCAUD | Primary delivery board                          | Story, Bug, Epic, Initiative, + subtask types (Development, Manual Testing, Content, Automated Testing, Peer Review, Code Review, UX Review, etc.) |
| Platform Escalations    | DIST   | Escalate to international platform team         | Request, Question, Issue                                                                                                                           |
| Internal Support        | UKCAS  | Customer-reported bugs triaged by support       | Bug (with L1/L2/L3 labels)                                                                                                                         |
| UK Product Discovery    | UKJPD  | Discovery layer — ideas, solutions, initiatives | Idea, Solution, Initiative, Discovery                                                                                                              |

### Observed Ticket Patterns (from board analysis 2026-03-17)

#### UKCAUD Stories

- **Labels:** `UKCAUD_CONTENT/PEERREVIEW`, `UKCAUD_CONTENT/QA`
- **Subtasks:** Content + Peer Review (2 subtasks typical)
- **Components:** Product-specific (e.g., `Audit Mercia UK Academy`, `Audit Mercia UK Charity`)
- **Fix Versions:** Product-specific release name
- **Parent Epic:** Mixed — some linked, many orphaned

#### UKCAUD Bugs — DEVELOP/RELEASE Pattern

- **Naming:** `{DEVELOP|RELEASE} - {Product Name} - {Bug Description}`
- **DEVELOP labels:** `UKCAUD_BUGS_DEV/QA` + `UKCAUD_DEVELOP`
- **RELEASE labels:** `UKCAUD_BUGS_DEV/QA` + `UKCAUD_RELEASE` (or `UKCAUD_BUGS_DEV_AQA` for AQA-routed bugs)
- **DEVELOP fix version:** Product's develop release (e.g., `Audit Mercia UK Academy - Groups + Central Planning`)
- **RELEASE fix version:** Hotfix release prefixed `RELEASE -` (e.g., `RELEASE - Audit Mercia Uk Pension Schemes - HF 26-03 SEB`)
- **Subtasks:** Development + Manual Testing (2 minimum); subtask summaries copy parent summary exactly
- **DIST link:** `is caused by: DIST-XXXXX` when originating from escalation

#### UKCAUD Epics

- **Components:** Product-specific
- **Fix Versions:** Product-specific release
- **Parent Initiative:** Some linked, many orphaned
- **Labels:** Mostly empty

#### DIST Tickets

- **Types:** Request, Question, Issue
- **Labels:** `auto-triaged`, `FeatureFlag`, `DIST_SolutionRelease`, `Audit_Squad`
- **Components:** Mostly empty
- **Priority used as severity indicator**

#### UKCAS Tickets

- **All bugs** — customer-reported issues
- **Escalation labels:** `L1-Support`, `L2-Content`, `L3-Product/Dev`
- **No components used**
- **Reporter:** Support team member (Chantelle, Michael, Jemma, Tyrone)

---

## 4. Subsystem 1: Daily Hub

**Commands:** `/gm`, `/eod`, `/prep`

**Replaces:** morning-checkin + evening-checkin + ai-checkin-prep + chief-of-staff agent

### `/gm` — Morning Briefing

Runs 6 parallel data pulls, presents unified brief:

1. **Jira pull** (via Atlassian MCP):
   - UKCAUD: My tickets in current sprint, due this week, in-progress, blocked
   - DIST: Escalations reported by me or my team, open/waiting
   - UKCAS: Open support tickets by priority, L3 items needing triage
2. **Local workspace pull:**
   - `workspace/coordinator/weekly-plan.md` → this week's priorities
   - `workspace/initiatives/*/weekly-todos.md` → per-initiative tasks
   - Yesterday's evening log → carryover items
   - Commitment progress check (Wednesday+)
3. **Teams pull** (via browser automation):
   - Unread messages requiring response
   - Today's meetings with agenda/context
   - Flagged items from channels
4. **Confluence pull:**
   - Milestones due within 4 weeks
5. **Atlassian Goals pull** (via GraphQL API):
   - Goal progress for linked initiatives
6. **Synthesize** → writes `daily-brief-YYYY-MM-DD.md`:
   - Time-aware guided prompt
   - Top 3 priorities ranked by urgency/impact
   - Blocked items needing escalation
   - Meeting prep bullets
   - 4-quadrant classification (Green/Yellow/Red/Grey)

### `/eod` — Evening Wrap

- Synthesizes from day's log + conversation context + Jira activity
- Maps accomplishments to weekly commitments
- Flags IBP-notable items for Friday
- Pre-loads tomorrow's meetings
- Appends to daily-log.md

### `/prep` — Meeting Prep (Live Jira Status)

Queries Jira directly for real-time status:

1. **UKCAUD Sprint Status:**
   - Current sprint: total tickets by status (To Do / In Progress / Done / Blocked)
   - Sprint health indicator (ahead/behind/on track)
   - At-risk tickets (in progress but nearing sprint end)
2. **DIST Tickets** (filtered to team):
   - Open escalations, waiting on platform, resolved this week
3. **UKCAS Board:**
   - Open tickets by priority, aging tickets, recently resolved
4. **Goal Progress:**
   - Per-goal completion % based on linked initiatives/epics

Output: crisp status block ready for "Liam's AI Check-in"

---

## 5. Subsystem 2: Weekly Review

**Command:** `/sprint retro` (enhanced), `/sprint retro --preview`

**Replaces:** weekly-todo-review + sprint retro

### Single Confluence Page Output

Creates one page per sprint following existing naming convention:
`Sprint Retrospective Q1 2026 Sprint X / Planning Q1 2026 Sprint Y`

**Page Structure:**

```markdown
## Sprint X Retrospective

### Sprint Health (from dashboards)

- Velocity, completion rate, carry-over ratio, avg cycle time
- Trend vs last 3 sprints
- Suggested improvements based on dashboard data

### Wins & Impact (IBP format)

- Narrative bullets grouped by initiative
- Pre-populated from daily log IBP-notable flags + Jira completions

### Commitment Tracking

- Committed: N items | Completed: N (X%) | Carried: N
- Items carried forward with context

### Carry-Forward Items

- [JQL filter link to uncompleted sprint tickets]

### Blockers & Escalations

- Active blockers with owner + age
- DIST escalation status

### Data Quality Flags

- Tickets missing epic | labels | component | release
- [JQL filter links to fix each]

### Dashboard Insights

- Stats from UKCAUD Sprint Review, Scorecard dashboards
- Suggested dashboard improvements

### Goal Alignment

| Goal | Linked Initiatives | Progress | Status |

- Learnings posted to Goals via goals_createLearning
- Decisions posted via goals_createDecision
- Project status updated via projects_createUpdate

---

## Sprint Y Planning

### Sprint Goal

[Drafted from priorities + backlog top items]

### Upcoming Work (Next Sprint + Future Dated)

- Tickets in "Next" sprint — grouped by epic
- Tickets in future sprints with actual dates
- Excludes generic product-name sprints
- JQL: project = UKCAUD AND sprint in futureSprints() AND fixVersion != EMPTY

### Proposed Sprint Scope

- Grouped by epic, capacity estimate from velocity

### Priorities This Week

#### UKCAUD / DIST / UKCAS sections

### Key Dates & Milestones

### JQL Quick Links

- Completed this sprint | Carried over | Blocked | Missing epic
- Missing labels | Missing component | No DIST link
```

### Cascading Updates (One Retro, Three Audiences)

1. **Confluence page** → team-facing
2. **Atlassian Goals** → leadership-facing (goal progress + learnings)
3. **Atlassian Projects** → cross-team-facing (project status update)

### Timing

- `/sprint retro` — run at sprint close-off, generates final page, archives local files
- `/sprint retro --preview` — mid-sprint draft, no archival

### JQL Filter Links (Generated per sprint)

| Filter                | JQL                                                                     |
| --------------------- | ----------------------------------------------------------------------- |
| Completed this sprint | `project = UKCAUD AND sprint in openSprints() AND status = Done`        |
| Carried over          | `project = UKCAUD AND sprint in openSprints() AND status != Done`       |
| Blocked               | `project = UKCAUD AND status = Blocked`                                 |
| My DIST escalations   | `project = DIST AND reporter = currentUser() AND status != Closed`      |
| UKCAS open            | `project = UKCAS AND status != Closed`                                  |
| No epic linked        | `project = UKCAUD AND sprint in openSprints() AND "Epic Link" is EMPTY` |
| Missing labels        | `project = UKCAUD AND sprint in openSprints() AND labels is EMPTY`      |
| Missing component     | `project = UKCAUD AND sprint in openSprints() AND component is EMPTY`   |

### Integration with Existing Dashboards

References and pulls data from:

- **UKCAUD - Sprint(s) Review** (live)
- **UKCAUD Scorecard** (sandbox — suggest promoting to live)
- **Sprint Stats Review** page
- Suggests improvements when patterns spotted in sandbox dashboards

---

## 6. Subsystem 3: Ticket Factory

**Commands:** `/discover`, `/clone`, `/ticket`, `/tickets`, `/escalate`

### Cascading Creation Principle

Every action triggers suggestions downward. Every creation triggers linking upward. Nothing exists in isolation.

- Creating a Goal → suggests Initiative → suggests Epics → suggests Stories
- Creating a Bug → suggests parent Epic, labels, component, release, subtasks, blocking links
- Every level: preview + confirm before action

### Mode A: Discovery Flow (JPD → UKCAUD)

Uses existing UKJPD automation (from `CW UKJPD Workflows/`):

**`/discover <type> "Title"`** — type required upfront:

- `/discover initiative "Title"` — triggers Initiative template + Rovo AI enrichment
- `/discover epic "Title"` — triggers Solution/Epic template + Rovo AI enrichment
- `/discover story "Title"` — triggers Idea/Story template + Rovo AI enrichment

**`/clone <UKJPD-key>`** — clones completed JPD item to UKCAUD:

- Idea → Story, Solution → Epic, Initiative → Initiative
- Carries Confluence page link, creates "Cloners" relationship

**`/clone-ready`** — finds all JPD items in "Ready for Delivery", offers batch clone

### Mode B: Direct UKCAUD Creation (No One-Pager)

For urgent/immediate work skipping JPD. Infers structure from existing UKCAUD tickets.

**Inference engine:**

1. Queries existing tickets of same type in UKCAUD
2. Identifies most common pattern: subtask types, labels, components, checklists
3. Presents inferred template for confirmation

**Epic + Initiative linking (mandatory):**

- Searches existing epics/initiatives, suggests best match
- If no match: offers to create, then links the full chain
- Goal linking: if initiative has no goal, flags it

**Commands:**

```
/ticket story "Title"          → infers structure, suggests epic
/ticket epic "Title"           → infers structure, suggests initiative
/ticket bug "Title" UKCAUD-456 → links to source, infers subtasks
```

**Every direct ticket gets:**

- Subtasks matching UKCAUD patterns (Development + Manual Testing minimum for bugs; Content + Peer Review for stories)
- Labels inferred from parent epic and type (`UKCAUD_BUGS_DEV/QA`, `UKCAUD_CONTENT/PEERREVIEW`, etc.)
- Component inferred from parent epic
- Release from current active fix version
- Blocking links: Development blocks Manual Testing, Development blocks Automated Testing
- Subtask summaries copy parent summary (matching existing pattern)

### Hotfix / Multi-Product Flow

**Always asked when creating bugs:**

1. Is this a hotfix? → If yes:
2. DEVELOP and RELEASE tickets needed? (yes / just develop / just release)
3. How many products? (list or "same as last time")

**Multi-product stamping:**

```
/ticket bug "Fix decimal rounding in trial balance" --products "UK Company, UK LLP, UK Charity"

Creates per product:
├── {DEVELOP} - {Product} - {Description}
│   ├── Development (blocks →)
│   └── Manual Testing
├── {RELEASE} - {Product} - {Description}
│   ├── Development (blocks →)
│   └── Manual Testing

With:
- DEVELOP labels: UKCAUD_BUGS_DEV/QA + UKCAUD_DEVELOP
- RELEASE labels: UKCAUD_BUGS_DEV/QA + UKCAUD_RELEASE
- Fix versions: product develop release / RELEASE - product hotfix release
- DEVELOP ↔ RELEASE linked with "relates to"
- All linked to parent epic
```

### Continuous Improvement

Every batch creation analyses existing similar tickets and suggests improvements:

- Missing subtask types (e.g., Content subtask missing on 8/15 similar bugs)
- Missing testing checklists on QA subtasks
- Wrong blocking link direction
- Inconsistent label patterns

Improvements are offered, not forced. Accepted improvements become the new default.

### Mode C: Mass Management

**`/tickets fix-hygiene`:**

- Tickets without epics → suggests parent, bulk-links
- Tickets without labels → infers from epic/component
- Tickets without component → infers
- Tickets without release → assigns current fix version
- Missing dates → sets from attached release start/end dates
- Blocking link audit → checks Dev blocks QA/AQA (for PR-merge automation)
- Label consistency check
- Initiatives not linked to Goals
- Before/after report with JQL links

**`/tickets bulk-edit`:**

```
# By ticket list
/tickets bulk-edit UKCAUD-100,UKCAUD-101 --add-label "Q1-2026"

# By description (finds matching + subtasks)
/tickets bulk-edit "Ensure PMSD Shows On Opening" --add-checklist-item "Verify PMSD visibility"

# Bulk across product grouping
/tickets bulk-edit "Product: Cloud Audit, type: Bug" --set-component "Cloud Audit"
```

How it works:

1. Resolves target set (JQL, ticket list, or natural language → JQL)
2. Expands to include all subtasks
3. Shows preview: "This will update N tickets. Changes: [list]. Proceed?"
4. Applies, generates summary

**`/tickets relink-epics`** — audits hierarchy, finds orphans, suggests parent links

**`/tickets release-prep "v2024.3"`** — groups by epic under release, checks completeness

### Escalation Flow

**`/escalate <UKCAS-key>`** or **`/escalate <UKCAUD-key>`**

1. Reads source ticket
2. Determines escalation target:
   - UKCAUD (delivery — create bug for fix)
   - DIST (platform — create escalation ticket)
   - Both
3. If UKCAUD bug: runs hotfix/multi-product flow
4. Links with `is caused by` relationship
5. Posts to relevant Teams on-call channel based on area/component:

| Area / Label       | Teams Channel                             |
| ------------------ | ----------------------------------------- |
| L3-Product/Dev     | [configurable — dev oncall channel]       |
| L2-Content         | [configurable — content channel]          |
| Audit_Squad (DIST) | [configurable — audit squad channel]      |
| General DIST       | [configurable — dist escalations channel] |

Channel mapping stored in `workspace/config/teams-channels.json` — user configures once.

---

## 7. Subsystem 4: Deck & Docs

**Commands:** `/deck`, `/pdf`, `/process`

### `/deck` — Internal Presentation Decks

- Follows Caseware brand guidelines (League Spartan, brand colors)
- Brand assets from `~/Documents/CW Release Notes Tool/brand-assets/`
- Markdown deck saved to `workspace/coordinator/notes/`
- Can pull Jira data for progress slides
- Generic team references (no named individuals)

### `/pdf` — Markdown to PDF

- pandoc + typst (installed via `winget` or `choco` on Windows)
- Caseware branded (logo, colors, League Spartan font)
- `start <path>` to open on Windows

### `/process` — Content Processing

- Paste raw content (transcript, presentation, notes, interview)
- Extracts 3-5 insights, routes to workspace files
- If actionable items → offers to create Jira tickets via Ticket Factory
- If strategic decisions → offers to log against Atlassian Goal
- If new feature need → hands off to `/write-prd` → Ticket Factory
- If customer feedback → routes to `workspace/strategy/key-customers.md`

---

## 8. Goal & Alignment Integration

### Atlassian Goals API (GraphQL)

**Endpoint:** `https://caseware.atlassian.net/gateway/api/graphql`
**Auth:** Basic Auth (same credentials as Jira REST API)

**Key operations used:**

- `goals_search` — list/filter goals
- `goals_create` — create new goals
- `goals_linkWorkItem` — link Jira issues to goals
- `goals_createLearning` — post learnings from retros
- `goals_createDecision` — post decisions
- `goals_createUpdate` — post goal status updates
- `projects_createUpdate` — post project status (on_track/at_risk/off_track)

### Cascading Updates

Sprint close-off triggers:

1. IBP summary → Confluence page (team-facing)
2. Goal progress update → Atlassian Goals (leadership-facing)
3. Project status update → Atlassian Projects (cross-team-facing)

### Goal-Aware Creation

- Creating Initiative → "Link to a Goal?" → searches existing, links
- Creating Epic → inherits goal link from parent Initiative
- Hygiene check → "Initiatives not linked to a Goal" flagged
- JPD items → Goals field carried through when cloning to UKCAUD

---

## 9. Workspace Structure

```
C:\Users\liam.bond\Documents\Productivity Tool\
├── workspace/
│   ├── coordinator/
│   │   ├── weekly-plan.md          # Working scratch pad (Confluence is source of truth)
│   │   ├── daily-log.md            # Daily entries
│   │   ├── decision-log.md         # Strategic decisions
│   │   ├── cross-cutting-concerns.md
│   │   ├── notes/                  # Dated notes, decks, meeting prep
│   │   └── archive/                # Weekly snapshots
│   ├── initiatives/
│   │   ├── ukcaud/                 # weekly-todos, milestones, context, epics
│   │   ├── dist/                   # weekly-todos, milestones, context, epics
│   │   └── ukcas/                  # weekly-todos, milestones, context, epics
│   ├── strategy/
│   │   ├── product-strategy.md
│   │   └── key-customers.md
│   └── config/
│       └── teams-channels.json     # Teams channel routing config
├── docs/
│   ├── USER-GUIDE.md
│   └── CUSTOMIZATION-LOG.md
└── [12 skill files — installed as ~/.claude/commands/]
```

---

## 10. Integration Points

| System                            | How Accessed                                           | Used By                                  |
| --------------------------------- | ------------------------------------------------------ | ---------------------------------------- |
| Jira (UKCAUD, DIST, UKCAS, UKJPD) | Atlassian MCP + REST API v3                            | All subsystems                           |
| Confluence                        | Atlassian MCP                                          | Weekly Review, Ticket Factory            |
| Atlassian Goals                   | GraphQL API (direct curl)                              | Daily Hub, Weekly Review, Ticket Factory |
| Atlassian Projects                | GraphQL API (direct curl)                              | Weekly Review                            |
| Microsoft Teams                   | Browser automation (Claude in Chrome) or Teams webhook | Escalations, Daily Hub                   |
| GitHub                            | GitHub MCP                                             | Code review (existing /code-review)      |
| Local filesystem                  | Read/Write/Edit tools                                  | All subsystems                           |
| Jira Dashboards                   | Referenced by URL in outputs                           | Weekly Review                            |

---

## 11. Existing Systems Consumed (Not Replaced)

| System                      | Location                                          | How Used                                                          |
| --------------------------- | ------------------------------------------------- | ----------------------------------------------------------------- |
| UKJPD Workflows             | `~/Documents/CW UKJPD Workflows/`                 | Discovery flow prompts, Confluence templates, Rovo AI agents      |
| UKCAUD Project Tracker      | `~/Documents/CW UKCAUD Project Tracker/`          | PR-merge notification automation rules (blocking link validation) |
| Sprint Retro/Planning pages | Confluence personal space                         | Read existing, create new in same format                          |
| Jira Analytics Dashboards   | 13 dashboards (2 live, 11 sandbox)                | Read metrics, suggest improvements                                |
| Brand assets                | `~/Documents/CW Release Notes Tool/brand-assets/` | Deck & PDF branding                                               |

---

## 12. Command Summary

| Command                    | Subsystem      | Purpose                                                  |
| -------------------------- | -------------- | -------------------------------------------------------- |
| `/gm`                      | Daily Hub      | Morning briefing (Jira + Teams + local + Goals)          |
| `/eod`                     | Daily Hub      | Evening wrap (log + commitments + IBP flags)             |
| `/prep`                    | Daily Hub      | Meeting prep (live Jira sprint/board status + goals)     |
| `/sprint retro`            | Weekly Review  | Sprint close-off → single Confluence page + Goal updates |
| `/sprint retro --preview`  | Weekly Review  | Mid-sprint draft, no archival                            |
| `/discover <type> "Title"` | Ticket Factory | JPD discovery item creation                              |
| `/clone <UKJPD-key>`       | Ticket Factory | Clone JPD → UKCAUD for delivery                          |
| `/clone-ready`             | Ticket Factory | Batch clone all ready JPD items                          |
| `/ticket <type> "Title"`   | Ticket Factory | Direct UKCAUD creation with inference                    |
| `/tickets fix-hygiene`     | Ticket Factory | Audit + fix data quality issues                          |
| `/tickets bulk-edit ...`   | Ticket Factory | Bulk update tickets + subtasks                           |
| `/tickets relink-epics`    | Ticket Factory | Audit + fix epic hierarchy                               |
| `/tickets release-prep`    | Ticket Factory | Release readiness check                                  |
| `/escalate <key>`          | Ticket Factory | Escalate UKCAS/UKCAUD → DIST + Teams notification        |
| `/deck`                    | Deck & Docs    | Branded internal presentation                            |
| `/pdf`                     | Deck & Docs    | Markdown to PDF (Caseware branded)                       |
| `/process`                 | Deck & Docs    | Raw content → insights → Jira/Goals/workspace            |

---

## 13. Data Quality Rules (Enforced by Ticket Factory + Hygiene)

| Rule                                                             | Enforced At        | Fix                             |
| ---------------------------------------------------------------- | ------------------ | ------------------------------- |
| Every story/bug must have a parent epic                          | Creation + hygiene | Suggest epic based on component |
| Every epic must have a parent initiative                         | Creation + hygiene | Suggest initiative or create    |
| Every initiative should link to a Goal                           | Creation + hygiene | Prompt for goal link            |
| Every bug must have labels (DEV/QA or DEV_AQA + DEVELOP/RELEASE) | Creation           | Auto-apply from type            |
| Every ticket must have a component                               | Creation + hygiene | Infer from parent               |
| Every ticket must have a fix version                             | Creation + hygiene | Assign from release or parent   |
| Bug subtasks must have "blocks" links                            | Creation + hygiene | Dev blocks QA, Dev blocks AQA   |
| DEVELOP/RELEASE bugs must be linked                              | Creation           | "relates to" link               |
| Subtask summaries must match parent                              | Creation           | Auto-copy                       |
| Fix versions with "Awaiting" must be resolved                    | Hygiene            | Suggest correct version         |

---

## 14. Outstanding Questions

1. **Teams channel names** — need actual channel names for escalation routing (dev oncall, content, audit squad, dist)
2. **UKJPD remaining tasks** — 16/33 tasks still pending (template uploads, automation rule updates, Rovo agent verification). Should this system complete those as Phase 0?
3. **Teams integration method** — browser automation via Claude in Chrome, or Teams webhook/incoming connector?
4. **Jira Analytics dashboard promotion** — should the system auto-promote sandbox dashboards to live when improvements are validated?
5. **`scripts/analyze-epic-hierarchy.mjs`** — referenced in discover-child-epics but doesn't exist. Build it or use JQL-only approach?

---

## 15. Implementation Phases (Suggested)

| Phase | What                                                | Depends On |
| ----- | --------------------------------------------------- | ---------- |
| 0     | Complete UKJPD Workflows (remaining 16 tasks)       | Nothing    |
| 1     | Workspace structure + local file templates          | Nothing    |
| 2     | Daily Hub (/gm, /eod, /prep)                        | Phase 1    |
| 3     | Ticket Factory — direct creation + inference engine | Phase 1    |
| 4     | Ticket Factory — multi-product + hotfix flow        | Phase 3    |
| 5     | Ticket Factory — mass management + hygiene          | Phase 3    |
| 6     | Escalation flow (/escalate + Teams routing)         | Phase 3    |
| 7     | Weekly Review (/sprint retro → Confluence + Goals)  | Phase 2    |
| 8     | Goals integration (GraphQL API wiring)              | Phase 7    |
| 9     | Deck & Docs (/deck, /pdf, /process)                 | Phase 1    |
| 10    | Documentation + User Guide                          | All phases |
