# Command Center — Context

Last Updated: 2026-04-02

## Key Directories

- Project root: `C:\Users\liam.bond\Documents\Productivity Tool\`
- Dashboard app: `dashboard/` (to be created)
- Data files: `workspace/coordinator/`
- Config: `workspace/config/`
- Scripts: `scripts/` (to be created)
- Commands: `commands/`

## Key Decisions

- Next.js 14 App Router, TypeScript, Tailwind — no heavy UI lib
- pm2 keeps dashboard alive across reboots
- `dashboard-data.json` is the single source of truth for the dashboard
- SSE (Server-Sent Events) backed by fs.watch on dashboard-data.json for real-time updates
- Overnight agent uses claude-haiku-4-5 (low cost)
- Microsoft Graph API for calendar (token stored in workspace/coordinator/graph-token.json)
- Personal AI projects Kanban (NOT Jira sprint board) — data from workspace/config/projects.json
- Time tracking is local-only — JSON + daily-log.md, feeds IBP
- Overnight agent is advisory only — no auto-creation

## Existing Files of Note

- `workspace/config/projects.json` — 4 Jira projects (UKCAUD, DIST, UKCAS, UKJPD) with full metadata
- `commands/gm.md` — existing morning brief (to be redesigned in Phase 3)
- `workspace/coordinator/daily-log.md` — existing (minimal format, to be redesigned in Phase 5)

## Next Steps

1. Scaffold Next.js app at `dashboard/`
2. Create dashboard-data.json schema at `workspace/coordinator/dashboard-data.json`
3. Build SSE API route at `dashboard/src/app/api/events/route.ts`
4. Build PriorityInbox component
5. Build ProjectsBoard Kanban
6. Build CalendarPanel (Graph API, graceful fallback if no token)
7. Build TimeTracker
8. Wire pm2 + set up Task Scheduler entry

## Personal AI Projects (for Kanban)

These are Liam's personal automation/tooling projects — separate from Jira work:

- Command Center (this project) — Building, ~40%
- Productivity Tool — the existing CLI/commands system — Building
- UKJPD Workflows — automation for discovery pipeline — Done
- Lead Schedule Specifications — Angular frontend tool — Done

Source: will be defined in `workspace/config/personal-projects.json` (new file)
Note: `workspace/config/projects.json` is for Jira project config — personal projects need a separate file.
