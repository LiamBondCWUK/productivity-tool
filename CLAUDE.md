# Productivity Tool — Agent Context

## Project Purpose

Multi-script productivity automation hub. Aggregates Jira sprint data, GitHub PRs, M365 calendar events, and Teams signals into dashboards, reports, and daily briefs. Currently uses raw `fetch()` calls against 30+ REST API endpoints across Jira, Confluence, GitHub, and M365.

## Stack

- Node.js + TypeScript
- REST API integrations (Jira, Confluence, GitHub, M365 Graph API, Teams)
- Output: Markdown reports, HTML dashboards, Slack/Teams notifications

## MCP Servers Available

### Atlassian MCP (`atlassian`)
Replaces direct REST calls to `caseware.atlassian.net`. Use instead of `fetch()` against Jira/Confluence endpoints.

**Use for:**
- Fetching active sprint data (`getIssuesByJql`)
- Reading ceremony tickets (standup, retro, planning)
- Querying Confluence pages and space content
- Getting issue details, comments, transitions
- User lookup for assignment/capacity reports

**Credentials:** Configured in MCP server — no token management needed.
**Instance:** `caseware.atlassian.net`

### M365 MCP (`Microsoft 365` via claude.ai)
Replaces direct MS Graph API calls. Use instead of `fetch('https://graph.microsoft.com/...')`.

**Use for:**
- Calendar events (OOO detection, meeting load)
- Teams channel messages and @mentions
- OneDrive file reads (shared docs, excel exports)
- SharePoint document libraries
- User presence/availability status

### GitHub MCP (`mcp_io_github_git_*`)
Available via deferred tools. Use for repository-level operations.

**Use for:**
- Listing open PRs for sprint review
- Getting PR status/review state
- Commit history for contribution summaries
- Issue linking between GitHub and Jira

## Development Patterns

### Prefer MCP over REST
When adding new data sources or fixing broken fetch() calls, use MCP tools first:
```typescript
// BEFORE (direct REST — avoid)
const res = await fetch(`https://caseware.atlassian.net/rest/api/3/issue/${key}`, {
  headers: { Authorization: `Bearer ${process.env.ATLASSIAN_API_TOKEN}` }
})

// AFTER (MCP — preferred)
// Use the atlassian MCP tool directly in the agent workflow
```

### No Hardcoded Secrets
All tokens must come from environment variables. The `.env` file is gitignored — never commit credentials.

### Immutable Data
Scripts must not mutate source data. Always build new objects from API responses.

## Active Scripts

Run `npm run list` to see all available scripts. Key ones:
- `daily-brief.ts` — Sprint + calendar + PR rollup
- `ceremony-prep.ts` — Pulls Jira sprint + Confluence agenda
- `capacity-report.ts` — OOO calendar + sprint velocity

## Known Issues / Watch Points

- GitHub PAT rotation: token expires quarterly, stored in `.env` as `GITHUB_TOKEN`
- M365 Graph token requires delegated auth (user flow, not service principal) — MCP handles this
- Jira rate limits: max 100 issues per JQL page, paginate using `startAt`
