# Changelog

## 2026-04-02

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
