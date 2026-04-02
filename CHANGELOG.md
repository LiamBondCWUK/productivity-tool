# Changelog

## 2026-04-02 (AutomationStatus dashboard panel + Jira rule tracking API)

### Added

- `dashboard/components/AutomationStatus.tsx` — new dashboard panel showing all 6 Jira automation rules (phases 1.1–2.2) with color-coded status badges (pending/deployed/blocked/disabled), phase labels, Jira deep-links, and one-click "Done" buttons to mark rules deployed
- `dashboard/app/api/automation/route.ts` — REST API for automation rule status: GET returns current rules from dashboard-data.json; PATCH updates individual rule status (sets `deployedAt` on deploy, clears it on block, stores `blockedReason`)

### Changed

- `dashboard/app/page.tsx` — added AutomationStatus as a 3rd panel in column 4 (below Calendar and TimeTracker), with flex-1 to fill remaining height
- `dashboard/types/dashboard.ts` — added `AutomationRule`, `AutomationRuleStatus` types and `automationRules` field on `DashboardData`
- `dashboard/data/dashboard-data.json` + `workspace/coordinator/dashboard-data.json` — populated `automationRules` section with 6 rules covering phases 1.1 (retro enrichment), 1.2 (enhancement routing), 1.3 (epic done sync), 1.4 (disable stale rule), 2.1 (readiness checker), 2.2 (theme analyzer); all start as `pending`

## 2026-04-02 (UK prompt customisation + PRD cascade skill)

### Changed (Phase 1.6 — all 12 prompts personalised for Liam Bond / UK Caseware team)

- `morning-checkin.md` — initiative paths updated to `ukcaud/ukcas/dist`; groupings now Cross-Cutting / UKCAUD / UKCAS / DIST; milestone + context paths updated; stale-todos warning uses UK initiative names
- `weekly-todo-review.md` — all quinn.daneyko paths → liam workspace; section headers use UKCAUD/UKCAS/DIST; archive directories updated
- `ai-checkin-prep.md` — "DCA first, AiDA second" → "UKCAUD first, then UKCAS/DIST"; quinn paths replaced; output format updated
- `evening-checkin.md` — initiative groupings + example log entries updated to UKCAUD/UKCAS context
- `create-initiative.md` — project selection prompt added; `project: {key: "AI"}` → dynamic projectKey; labelMap → CWAS taxonomy; spaceId → "UKCAUD" (⚠️ verify); valid initiatives: ukcaud/ukcas/dist/ukjpd
- `create-epic.md` — project selection added; project key validation updated to UKCAUD/UKJPD/UKCAS/DIST pattern; DoR label → UKCAUD_Epic_DoR (⚠️ verify)
- `split-initiative.md` — project selection added; labelMap → CWAS; spaces/PM/ → spaces/UKCAUD/; examples updated
- `process-raw-input.md` — quinn paths → liam workspace; initiative routing: aida→ukcaud, dca→ukcas, platform→dist
- `discover-child-epics.md` — example issue keys updated to UKCAUD-XXX format
- `create-internal-deck.md` — owner names → UK team placeholders; AiDA/DCA → UKCAUD/UKCAS examples
- `review-github-code.md` — Windows setup added (`$env:GITHUB_TOKEN`); macOS-only references removed
- `markdown-to-pdf.md` — Windows install commands added (winget pandoc/typst); `open` → `Start-Process`

### Added (Phase 3.2 — new 13th prompt)

- `create-prd.md` — full PRD cascade skill: minimal input → UKJPD Idea + UKCAUD Initiative (created or linked) → 5 Confluence pages (PRD master, Initiative One-Pager, Epic One-Pager(s), Tech Spec stub, UAT Test Plan stub) → Jira Epics + placeholder Stories with embedded CWAS DoR checklist → all linked back to UKJPD; returns all URLs + issue keys + manual completion checklist

---

## 2026-04-02 (Replit deployment + test data population)

### Added

- `dashboard/.replit` — Replit deployment config (run `npm start`, port 3000 → 80)
- `dashboard/data/dashboard-data.json` — bundled test data file for portable deployment (fallback when `DASHBOARD_DATA_PATH` not set)
- `scripts/populate-test-data.mjs` — script to fill all dashboard panels with realistic test data (2 urgent, 3 AI suggested, 5 projects, 6 calendar events, 3 time tracker sessions, 5 overnight analysis entries)

### Changed

- `dashboard/lib/dashboardData.ts` — replaced hardcoded Windows path fallback with portable `path.join(process.cwd(), "data", "dashboard-data.json")` so the app works on Replit and any environment

---

## 2026-04-02 (Dashboard + Vibe-kanban + Overnight analysis CLI migration)

### Added (Dashboard phase 1-2: command center UI + overnight analysis agent)

- `dashboard/` — Next.js 14 App Router command center at `localhost:3000`, managed by pm2
- `dashboard/ecosystem.config.js` — pm2 process config; app name `command-center`, port 3000, `DASHBOARD_DATA_PATH` env var
- `dashboard/types/dashboard.ts` — shared TypeScript types for all dashboard data structures
- `dashboard/lib/dashboardData.ts` — server-side read/write helpers for `dashboard-data.json`
- `dashboard/components/PriorityInbox.tsx` — URGENT / AI SUGGESTED / TODAY / BACKLOG inbox panel
- `dashboard/components/ProjectsBoard.tsx` — personal projects Kanban with overnight AI suggestion chips and "Add to tasks" buttons
- `dashboard/components/TasksPanel.tsx` — vibe-kanban task board (Planned | Executing | Done columns); inline task creation; category filter (feature, bug-fix, first-build, refactor, analysis, chore); execution log per task
- `dashboard/components/CalendarPanel.tsx` — Microsoft Graph calendar + time tracker
- `dashboard/components/TimeTracker.tsx` — start/stop timer, +15m/+30m quick-add, daily + weekly totals
- `dashboard/app/api/data/route.ts` — SSE endpoint backed by `fs.watch` on `dashboard-data.json`
- `dashboard/app/api/events/route.ts` — dashboard events stream
- `dashboard/app/api/projects/route.ts` — project phase drag-and-drop writes back to `personal-projects.json`
- `dashboard/app/api/tasks/route.ts` — full CRUD for task items (POST create, PATCH update status/log, DELETE)
- `dashboard/app/api/time/route.ts` — time log append
- `dashboard/hooks/useDashboardData.ts` — React hook wrapping the SSE data stream
- `scripts/overnight-analysis.mjs` — nightly analysis agent (02:00 Mon–Fri); reads git log + dev docs + commands for each project; calls Claude via `spawnSync('claude', ['--print'])` (no API key needed — uses existing Claude account); writes suggestions to `dashboard-data.json` and `overnight-report.md`
- `scripts/register-overnight-task.ps1` — registers overnight agent in Windows Task Scheduler
- `scripts/register-gm-task.ps1` — registers morning /gm run in Windows Task Scheduler
- `scripts/gm-auto.ps1` — morning automation: runs `/gm` via Claude CLI at 08:45
- `scripts/run-overnight-analysis.bat` — `.bat` wrapper for Task Scheduler overnight trigger
- `workspace/coordinator/dashboard-data.json` — central data file; includes `priorityInbox`, `personalProjects`, `calendar`, `timeTracker`, `overnightAnalysis`, `tasks` fields
- `workspace/config/personal-projects.json` — project registry for overnight analysis and Kanban board
- `workspace/coordinator/time-log.json` — time tracking sessions
- `workspace/coordinator/overnight-report.md` — overnight analysis markdown report
- `commands/gm.md` — redesigned as AI priority inbox writer
- `commands/intake.md` — mid-day re-prioritise without browser open
- `commands/log.md` — quick capture to daily-log.md

### Changed

- `scripts/overnight-analysis.mjs` — migrated from `@anthropic-ai/sdk` to `spawnSync('claude', ['--print'])` so it uses the user's existing Claude account with no separate API key
- `dashboard/components/ProjectsBoard.tsx` — suggestion chips extended with `+` button to add overnight suggestions directly to the task board as one-click tasks

### Added (Phases 4-7: CLI consolidation + EOD pipeline + Focus blocks + IBP update)

- `commands/clone.md` — full clone workflow with `--bulk`, `--preset`, `--dry-run` flags; absorbs clone-jpd-to-ukcaud logic
- `commands/focus.md` — Microsoft Graph API focus block scheduling (`/focus UKCAUD-xxx 90m`)
- `commands/log.md` — quick capture to daily-log.md with `[ibp]`, `[blocker]`, `[decision]` tags
- `commands/intake.md` — mid-day priority re-pull without opening browser
- `workspace/config/clone-presets.json` — lead-schedule preset (5 UK variants)
- `workspace/coordinator/daily-log.md` — redesigned with new standard format template
- `workspace/coordinator/time-log.json` — new time tracking JSON (written by dashboard + `/eod`)
- `scripts/setup-graph-token.ps1` — one-time OAuth2 device code flow for Microsoft Graph access
- `scripts/append-ticket-subcmds.ps1` — helper used to append sub-commands to ticket.md

### Changed

- `commands/ticket.md` — added epic, initiative, split sub-commands (E1-E7, I1-I6, S1-S4)
- `commands/eod.md` — full rewrite: adds Office file scan (PowerShell), Teams pull (Playwright), calendar pull, structured confirmation draft, new daily-log format write, time-log.json append, dashboard-data.json update
- `scripts/generate-ibp.mjs` (CW UKCAUD Project Tracker) — updated daily-log parser to support new HTML comment format (`<!-- IBP-notable: ... -->`, `<!-- blocker: ... -->`); adds Tomorrow's Priorities extraction; adds time-log.json integration; weekly time total in IBP header

## 2026-03-17

### Added

- `commands/` directory with 13 slash command definitions (gm, eod, prep, standup, sprint-plan, sprint-retro, discover, ticket, tickets, deck, handoff, health, escalate)
- `workspace/` directory with project config, coordinator workspace, and initiative tracking structure
- PM Operating System design spec (`docs/superpowers/specs/2026-03-17-pm-operating-system-design.md`) expanded with resolved design decisions, new commands (standup, sprint-plan, handoff, health, search), and implementation phases

### Changed

- Design spec updated: Playwright MCP chosen for Teams/Calendar integration, sprint planning separated from retro, project config driven by `projects.json`
