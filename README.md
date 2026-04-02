# Liam's Product Management System

## Dashboard (Command Center)

The dashboard is a Next.js 14 app at `localhost:3000`, managed by pm2. It provides a live view of the priority inbox, personal projects Kanban, vibe-kanban task board, calendar, and time tracker.

### Prerequisites

- Node.js 18+
- pm2 (`npm install -g pm2`)
- Claude CLI installed and authenticated (used by the overnight analysis agent — no separate API key needed)

### First-time setup

```powershell
# 1. Install dashboard dependencies
cd "C:\Users\liam.bond\Documents\Productivity Tool\dashboard"
npm install

# 2. Build
npm run build

# 3. Start with pm2 (auto-restarts, survives reboots)
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # run the output command to enable autostart on login

# 4. Register overnight analysis (02:00 Mon–Fri) — requires admin PowerShell
& "$HOME\Documents\Productivity Tool\scripts\register-overnight-task.ps1"

# 5. Register morning /gm (08:45 Mon–Fri) — requires admin PowerShell
& "$HOME\Documents\Productivity Tool\scripts\register-gm-task.ps1"

# 6. Optional: Microsoft Graph auth for /focus calendar integration
powershell -File "scripts\setup-graph-token.ps1"
```

The `dashboard/ecosystem.config.js` configures:

- **App name:** `command-center`
- **Port:** 3000
- **`DASHBOARD_DATA_PATH`:** points to `workspace/coordinator/dashboard-data.json`
- Auto-restart on crash, max 10 restarts

### Development mode

```powershell
cd dashboard
npm run dev   # hot-reload at localhost:3000
```

---

## Overview

This is a collection of 12 structured prompt files (referred to as "skills") designed to drive a **personal productivity system for a technical product manager**. The original author manages multiple software initiatives using Jira, Confluence, and GitHub, and built these prompts to automate the repetitive coordination work that connects daily execution to weekly reporting and long-term planning.

**Workflow philosophy:** The system follows a "capture, structure, surface" pattern. Raw information enters through daily check-ins and ad-hoc processing, gets structured into Jira issues and Confluence pages via creation/splitting prompts, and surfaces back as weekly summaries and meeting prep. The goal is to keep a single source of truth across local markdown files, Jira, and Confluence without manual copy-paste between systems.

The prompts assume a **local workspace** of markdown files organised into `coordinator/` (cross-cutting plans, logs, briefs) and `initiatives/{name}/` (per-initiative context, todos, milestones, epics). They are designed to be invoked as slash commands inside an AI coding assistant (Claude Code) with MCP (Model Context Protocol) integrations for Jira, Confluence, and GitHub.

---

## Prompt Catalogue

| File                      | Purpose                                                                                                              | When to Use                                                                                | Inputs                                                                          | Output                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `morning-checkin.md`      | Start-of-day orientation: surface priorities, write a daily brief, suggest how to spend available time               | Every morning at start of work                                                             | Weekly plan, daily log, meeting schedule                                        | `coordinator/daily-brief-YYYY-MM-DD.md` + morning entry in `coordinator/daily-log.md`              |
| `evening-checkin.md`      | End-of-day capture: log accomplishments, decisions, blockers; map progress to weekly commitments                     | Every evening at end of work                                                               | User's summary of the day; sub-agent handoff files                              | Evening entry appended to `coordinator/daily-log.md`                                               |
| `weekly-todo-review.md`   | Friday close-out: review completed work, generate IBP-formatted summary, archive current week, set up next week      | Friday afternoon                                                                           | All weekly-todos files, weekly plan, daily log                                  | Archived week files + updated `coordinator/weekly-plan.md` with Wins and Impact + reset todo files |
| `ai-checkin-prep.md`      | Generate a structured status update for a recurring AI check-in meeting, organised by initiative                     | Before the AI team check-in meeting                                                        | Weekly plan, daily log, per-initiative weekly-todos and milestones              | Status block appended to daily brief + inline preview                                              |
| `create-initiative.md`    | Create a new Jira Initiative with validation, Confluence one-pager, and local tracking updates                       | When starting a brand-new strategic initiative                                             | Initiative name, title, problem statement, strategic alignment, target date     | Jira Initiative issue + Confluence one-pager + updates to `milestones.md` and `context.md`         |
| `create-epic.md`          | Create a Jira Epic under a parent Initiative with validation, Confluence page, and local tracking                    | When breaking an initiative into deliverable epics                                         | Initiative name, epic title, parent issue key, description, target date         | Jira Epic issue + Confluence epic one-pager + updates to `epics.md` and `context.md`               |
| `split-initiative.md`     | Split a large initiative into multiple smaller ones (waves/phases), cancel the source, link everything               | When an initiative is too large and needs phasing                                          | Source issue key, number of splits, titles, descriptions, date ranges per split | Multiple new Jira Initiatives + links + source cancelled + local tracking updated                  |
| `discover-child-epics.md` | Find all child epics under a Jira initiative using reverse lookup from local JSON files                              | After fetching new initiatives, before documenting, or when counts seem wrong              | Local `content/raw/jira-*.json` files                                           | `content/raw/epic-hierarchy.json` + console hierarchy display                                      |
| `process-raw-input.md`    | Extract key insights from raw content (presentations, transcripts, interviews, notes) and route to appropriate files | When you receive new unstructured content that contains actionable information             | Content type + pasted raw content                                               | Updates to strategy files, decision log, initiative context files                                  |
| `review-github-code.md`   | Fetch and analyse code from GitHub URLs, with special focus on integration patterns                                  | When reviewing partner code, investigating a repository, or analysing integration patterns | One or more GitHub URLs                                                         | Structured code summary with architecture, dependencies, and integration analysis                  |
| `create-internal-deck.md` | Generate internal presentation decks in markdown for working discussions                                             | Before technical alignment meetings, planning sessions, initiative kickoffs                | Topic, audience, meeting goal, duration, key content                            | Markdown deck file at `coordinator/notes/YYYY-MM-DD-{topic-slug}.md`                               |
| `markdown-to-pdf.md`      | Convert a local markdown file to PDF using pandoc and typst                                                          | When you need a PDF version of any markdown document                                       | File path (and optional output path)                                            | PDF file                                                                                           |

---

## Workflow Map

The prompts connect in a daily/weekly cadence with planning prompts feeding into it as needed.

```
                          DAILY CADENCE
                          =============

    morning-checkin ──────────────────────> evening-checkin
         |                                       |
         |  Writes daily brief                   |  Logs accomplishments,
         |  Reads weekly plan                    |  maps to commitments
         |  Suggests focus areas                 |  Flags IBP-notable items
         |                                       |
         +──── Both feed into ───────────────────+
                      |
                      v
              weekly-todo-review  (Friday)
                      |
                      |  Archives week, generates IBP summary,
                      |  sets up next week, carries forward items
                      |
                      v
              [Next week's morning-checkin reads the new plan]


                     MEETING PREP
                     ============

    morning-checkin ──> ai-checkin-prep ──> (meeting)
                          |
                          |  Reads same files as morning/evening
                          |  Produces initiative-grouped status

    (any time) ────────> create-internal-deck ──> markdown-to-pdf
                          |                            |
                          |  Builds slide deck         |  Converts to PDF
                          |  in markdown               |  for sharing


                    PLANNING & STRUCTURING
                    ======================

    process-raw-input ──> create-initiative ──> discover-child-epics
         |                      |                      |
         |  Extracts insights   |  Creates Jira        |  Maps epic
         |  from raw content    |  Initiative +        |  hierarchy
         |  Routes to files     |  Confluence page     |
         |                      v                      |
         |               create-epic <─────────────────+
         |                      |
         |                      |  Creates Jira Epic under Initiative
         |                      |  + Confluence page
         |                      v
         |               split-initiative
         |                      |
         |                      |  Breaks large initiative
         |                      |  into waves/phases
         v
    review-github-code
         |
         |  Analyses code for integration patterns
         |  (standalone, feeds into planning decisions)
```

**Typical sequences:**

1. **New work arrives:** `process-raw-input` --> `create-initiative` --> `create-epic` --> morning/evening check-ins track progress
2. **Initiative too large:** `discover-child-epics` --> `split-initiative` --> `create-epic`
3. **Daily rhythm:** `morning-checkin` --> work --> `evening-checkin` --> repeat
4. **Weekly rhythm:** Mon-Thu daily rhythm --> Friday `weekly-todo-review` --> Monday `morning-checkin` reads fresh plan
5. **Meeting prep:** `ai-checkin-prep` or `create-internal-deck` --> optionally `markdown-to-pdf`

---

## Customisation Guide

### What to find-and-replace across all 12 files

Before using these prompts, do a bulk find-and-replace for these author-specific values:

| Find                                                                             | Replace With                                                |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `quinn.daneyko`                                                                  | Your username                                               |
| `caseware.atlassian.net`                                                         | Your Atlassian domain                                       |
| `project = AI` and `{key: "AI"}`                                                 | Your Jira project key                                       |
| `spaceId: "PM"`                                                                  | Your Confluence space key                                   |
| `aida`, `dca`, `platform`                                                        | Your initiative/project directory names                     |
| Stakeholder names (Peter, PY, Citrin, Andrew, Jeff, Saul, Oscar)                 | Your colleagues                                             |
| Label values in `labelMap` objects                                               | Your Jira labels                                            |
| Custom field IDs (`customfield_10015`, `customfield_10022`, `customfield_10023`) | Your Jira custom field IDs (Admin > Issues > Custom Fields) |
| Confluence parent page IDs (`1724679265`, `1727561847`)                          | Your page IDs                                               |

### Per-prompt customisation notes

**morning-checkin.md**

- File paths assume `coordinator/` and `initiatives/{name}/` structure — rename to match your layout
- Commitment check triggers Wednesday+ (Step 1e) — adjust for your sprint cadence
- Time-aware focus suggestions and daily brief template are generic and usable as-is

**evening-checkin.md**

- "IBP-notable" refers to an internal business review format — rename to your org's weekly status format
- "Sub-agent handoff files" concept (Step 0) — remove if you don't use multi-agent setups
- Log entry template and context hygiene recommendations are generic

**weekly-todo-review.md**

- Hardcoded paths: `/Users/quinn.daneyko/Documents/claude-experiments/my-work-agents/...` — replace with your workspace root
- "IBP format" sections — rename to match your weekly reporting format
- Archive-and-reset workflow and carry-forward logic are generic

**ai-checkin-prep.md**

- Initiative reporting order ("DCA first, then AiDA") — change to your preferred order
- Meeting name ("AI check-in", "status update for Andrew") — rename for your meeting

**create-initiative.md / create-epic.md / split-initiative.md**

- These three share the same Jira/Confluence references — customise once, apply to all
- The validation workflows (duplicate detection, parent checks, date validation) are generic
- "Minimal Jira description, full content in Confluence" philosophy is generic

**discover-child-epics.md**

- Requires `scripts/analyze-epic-hierarchy.mjs` script — you'd need to create or adapt this
- The reverse-lookup methodology from JSON files is generic

**process-raw-input.md**

- Input type classification and insight extraction framework are generic
- File routing targets need your directory structure

**review-github-code.md**

- AiDA-specific analysis section — replace with your product/integration context or remove
- URL parsing and code review template are generic

**create-internal-deck.md**

- Reference deck examples — replace with your own
- Deck structure template and formatting rules are generic

**markdown-to-pdf.md**

- `brew install` commands assume macOS — use `winget`, `choco`, or `scoop` on Windows
- Font preference ("11pt Helvetica Neue") — change to your preferred font

---

## Integration Requirements

| Tool                       | Required For                                                                   | Setup Notes                                                                    |
| -------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| **Claude Code**            | Running all prompts                                                            | Prompts are written as skill definitions for an AI assistant with MCP support  |
| **Jira (Atlassian Cloud)** | `create-initiative`, `create-epic`, `split-initiative`, `discover-child-epics` | Needs project with Initiative and Epic issue types, write access               |
| **Confluence**             | `create-initiative`, `create-epic`, `split-initiative`                         | Needs a space for one-pager pages, write access, parent page IDs               |
| **Atlassian MCP Server**   | All Jira/Confluence prompts                                                    | Provides `jira_get_issue`, `jira_create_issue`, `confluence_create_page`, etc. |
| **GitHub Account + Token** | `review-github-code`                                                           | `GITHUB_TOKEN` env var with `repo` scope                                       |
| **GitHub MCP Server**      | `review-github-code`                                                           | Provides `get_file_contents` and directory listing                             |
| **pandoc + typst**         | `markdown-to-pdf`                                                              | Install via package manager                                                    |
| **Node.js**                | `discover-child-epics`                                                         | Runs the hierarchy analysis script                                             |
| **Local Filesystem**       | All prompts                                                                    | Backbone — a folder structure with `coordinator/` and `initiatives/{name}/`    |

**Minimum viable setup (no external integrations):**
The daily cadence prompts (`morning-checkin`, `evening-checkin`, `weekly-todo-review`) and content prompts (`process-raw-input`, `create-internal-deck`) work with **local files only**. You can start with these without any Jira, Confluence, or GitHub integration.

---

## Getting Started

### Phase 1: Daily Rhythm (no external tools needed)

1. **`morning-checkin.md`** — Create a minimal `coordinator/weekly-plan.md` with a few priorities, then run it
2. **`evening-checkin.md`** — Run at end of day. Adjust the template sections to match what you want to capture
3. **`weekly-todo-review.md`** — Run on Friday. Turns a week of daily logs into a formatted summary

### Phase 2: Content Processing (no external tools needed)

4. **`process-raw-input.md`** — Next time you receive meeting notes or a transcript, run this to extract and route insights
5. **`create-internal-deck.md`** — Before your next alignment meeting, try generating a deck
6. **`markdown-to-pdf.md`** — Convert any markdown to PDF (verify pandoc/typst setup)

### Phase 3: Jira/Confluence Integration (requires Atlassian access)

7. **`create-initiative.md`** — Start here (top-level container). Customise project key, labels, and Confluence space first
8. **`create-epic.md`** — Break initiatives down into epics
9. **`discover-child-epics.md`** — Verify your hierarchy
10. **`split-initiative.md`** — Use when an initiative grows too large

### Phase 4: Specialised Prompts

11. **`ai-checkin-prep.md`** — Customise for your recurring status meeting
12. **`review-github-code.md`** — Requires GitHub MCP setup

### First step: Create your workspace

```
your-workspace/
├── coordinator/
│   ├── weekly-plan.md
│   ├── daily-log.md
│   ├── notes/
│   └── archive/
└── initiatives/
    ├── {your-project-1}/
    │   ├── weekly-todos.md
    │   ├── milestones.md
    │   ├── context.md
    │   ├── epics.md
    │   └── archive/
    └── {your-project-2}/
        └── (same structure)
```

Then start with `morning-checkin.md` and iterate from there. Each prompt is self-contained enough to be adopted independently.

## Related Projects

| Project                                                          | Relationship                                      |
| ---------------------------------------------------------------- | ------------------------------------------------- |
| [AI Breaking News Tool](../AI%20Breaking%20News%20Tool/)         | AI ecosystem research feeds into daily briefings  |
| [Property Search Tool](../Property%20Search%20Tool/)             | Property reports feed into daily briefing context |
| [CW UKCAUD Project Tracker](../CW%20UKCAUD%20Project%20Tracker/) | Jira automation and delivery tracking             |
| [CW UKJPD Workflows](../CW%20UKJPD%20Workflows/)                 | JPD feature request delivery prompts              |
