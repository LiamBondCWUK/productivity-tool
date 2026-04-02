# Command Center — Plan

## Goal

Personal AI command center at localhost:3000 — set-and-forget productivity OS.

## Phases

### Phase 1: Dashboard Foundation (CURRENT)

1. Scaffold Next.js 14 app at `dashboard/`
2. Create `workspace/coordinator/dashboard-data.json` schema
3. PriorityInbox component (URGENT / AI SUGGESTED / TODAY / BACKLOG)
4. ProjectsBoard Kanban (Backlog | Building | Review | Done)
5. CalendarPanel (Microsoft Graph calendarView)
6. TimeTracker (start/stop, +15m, Log & Next)

### Phase 2: Overnight Analysis Agent

7. `scripts/overnight-analysis.mjs` — reads git log, dev/active, commands/\*.md
8. Register in Windows Task Scheduler at 02:00

### Phase 3: Morning Intake

9. Redesign `/gm` — AI priority inbox + writes dashboard-data.json + opens localhost:3000
10. Create `/intake` — mid-day re-prioritise (same pull, no browser)
11. Create `scripts/gm-auto.ps1` for 08:45 scheduled trigger

### Phase 4: CLI Ticket Consolidation

12. Enhance `/ticket` — add epic/initiative/split sub-commands
13. Enhance `/clone` — add --bulk/--preset flags
14. Create `workspace/config/clone-presets.json`

### Phase 5: EOD Activity Capture

15. Create `/log [tag] <note>`
16. Enhance `/eod` — Jira + Office files + calendar + Teams
17. Redesign daily-log.md template

### Phase 6: Focus Block Scheduling

18. Create `/focus <ticket> <duration>` — Microsoft Graph POST /me/events
19. Create `scripts/setup-graph-token.ps1` — OAuth2 device code flow
20. Windows toast notifications via BurntToast

### Phase 7: IBP Enhancement

21. Update `generate-ibp.mjs` — parse new daily-log + time-log
22. Thin-wrap /sprint-retro, /sprint-plan, /standup
23. Deploy Jira Rule 1 (UKCAS → UKJPD)
24. Deploy Jira Rule 2 (UKCAUD → UKJPD)

## Tech Stack

- Next.js 14 App Router + TypeScript + Tailwind CSS
- @dnd-kit/core (drag-and-drop Kanban)
- Recharts (charts)
- @microsoft/microsoft-graph-client (calendar)
- fs.watch + SSE (real-time dashboard updates)
- pm2 (process manager)
- claude-haiku-4-5 (overnight analysis)

## Key Data Files

- `workspace/coordinator/dashboard-data.json` — central hub
- `workspace/coordinator/time-log.json` — time sessions
- `workspace/coordinator/overnight-report.md` — nightly suggestions
- `workspace/config/projects.json` — project metadata (existing)
- `workspace/config/clone-presets.json` — deep clone presets (new)
