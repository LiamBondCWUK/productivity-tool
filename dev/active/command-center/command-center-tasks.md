# Command Center — Tasks

## Phase 1: Dashboard Foundation

- [ ] 1.1 Scaffold Next.js 14 app at `dashboard/`
- [ ] 1.2 Create `workspace/coordinator/dashboard-data.json` schema
- [ ] 1.3 Create `workspace/config/personal-projects.json`
- [ ] 1.4 Build SSE API route (`dashboard/src/app/api/events/route.ts`)
- [ ] 1.5 Build PriorityInbox component
- [ ] 1.6 Build ProjectsBoard Kanban with @dnd-kit
- [ ] 1.7 Build CalendarPanel (Graph API + graceful fallback)
- [ ] 1.8 Build TimeTracker (start/stop, +15m, Log & Next)
- [ ] 1.9 Wire pm2 ecosystem.config.js
- [ ] 1.10 Register pm2 resurrect in Windows Task Scheduler

## Phase 2: Overnight Analysis Agent

- [ ] 2.1 Create `scripts/overnight-analysis.mjs`
- [ ] 2.2 Register in Windows Task Scheduler at 02:00 Mon–Fri

## Phase 3: Morning Intake

- [ ] 3.1 Redesign `commands/gm.md` as AI priority inbox
- [ ] 3.2 Create `commands/intake.md`
- [ ] 3.3 Create `scripts/gm-auto.ps1`
- [ ] 3.4 Register gm-auto.ps1 in Task Scheduler at 08:45

## Phase 4: CLI Ticket Consolidation

- [ ] 4.1 Enhance `commands/ticket.md` — add epic/initiative/split
- [ ] 4.2 Enhance `commands/clone.md` — add --bulk/--preset
- [ ] 4.3 Create `workspace/config/clone-presets.json`

## Phase 5: EOD Activity Capture

- [ ] 5.1 Create `commands/log.md`
- [ ] 5.2 Enhance `commands/eod.md` — full activity pipeline
- [ ] 5.3 Redesign `workspace/coordinator/daily-log.md` template

## Phase 6: Focus Block Scheduling

- [ ] 6.1 Create `commands/focus.md`
- [ ] 6.2 Create `scripts/setup-graph-token.ps1`
- [ ] 6.3 Add Windows toast notifications to dashboard API

## Phase 7: IBP Enhancement

- [ ] 7.1 Update IBP script to parse new daily-log + time-log formats
- [ ] 7.2 Replace /sprint-retro with thin wrapper
- [ ] 7.3 Replace /sprint-plan with thin wrapper
- [ ] 7.4 Replace /standup with thin wrapper
- [ ] 7.5 Deploy Jira Rule 1 (UKCAS → UKJPD)
- [ ] 7.6 Deploy Jira Rule 2 (UKCAUD → UKJPD)
