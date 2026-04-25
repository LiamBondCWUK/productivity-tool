#!/usr/bin/env node
/**
 * generate-ibp.mjs
 * Integrated Business Progress (IBP) — EOD activity summary.
 *
 * Reads:
 *   - workspace/coordinator/daily-unified-log.json  (merged activity)
 *   - workspace/coordinator/dashboard-data.json     (inbox, projects context)
 *
 * Writes:
 *   - workspace/coordinator/ibp-YYYY-MM-DD.md
 *
 * Optionally calls Claude via OAuth (Claude CLI) to synthesise a narrative summary.
 * If OAuth isn't available, writes a plain data-only summary.
 *
 * Usage:
 *   node scripts/generate-ibp.mjs [--date=YYYY-MM-DD] [--skip-ai] [--output=workspace/coordinator/demo-ibp-YYYY-MM-DD.md]
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { execSync, spawnSync } from "child_process";
import { homedir } from "os";

// Load .env if it exists
try {
  const dotenvPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env");
  if (existsSync(dotenvPath)) {
    const envContent = readFileSync(dotenvPath, "utf8");
    envContent.split("\n").forEach((line) => {
      const [key, ...valueParts] = line.trim().split("=");
      if (key && !key.startsWith("#") && !process.env[key]) {
        process.env[key] = valueParts.join("=").trim();
      }
    });
  }
} catch (e) {
  // Silently ignore if dotenv fails
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const UNIFIED_LOG_PATH = resolve(ROOT, "workspace/coordinator/daily-unified-log.json");
const DASHBOARD_DATA_PATH = resolve(ROOT, "workspace/coordinator/dashboard-data.json");

const dateArg = process.argv.find((a) => a.startsWith("--date"))?.split("=")[1];
const outputArg = process.argv.find((a) => a.startsWith("--output"))?.split("=")[1];
const TARGET_DATE = dateArg ?? new Date().toISOString().slice(0, 10);
const SKIP_AI = process.argv.includes("--skip-ai");

const OUTPUT_PATH = outputArg
  ? resolve(ROOT, outputArg)
  : resolve(ROOT, `workspace/coordinator/ibp-${TARGET_DATE}.md`);

console.log(`[generate-ibp] generating IBP for ${TARGET_DATE}`);

// --- Helpers ----------------------------------------------------------------

function readJson(filePath, fallback) {
  try {
    let raw = readFileSync(filePath, "utf8");
    // Strip UTF-8 BOM if present (Windows PowerShell writes BOM by default)
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function fmtMin(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function cleanText(input, maxLen = 240) {
  if (!input) return "";
  const normalized = String(input)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (normalized.length <= maxLen) return normalized;
  const cut = normalized.slice(0, maxLen).replace(/\s+\S*$/, "");
  return (cut || normalized.slice(0, maxLen)) + "…";
}

function blockToBullets(block, limit = 6) {
  if (!block) return [];
  return String(block)
    .split("\n")
    .map((line) => line.trim().replace(/^[-*]\s*/, ""))
    .filter(Boolean)
    .slice(0, limit);
}

function toActionBullet(text, fallback = "") {
  const cleaned = cleanText(text, 180);
  if (!cleaned) return fallback;
  if (cleaned.includes(" - ") || cleaned.includes(" — ")) return cleaned;
  return cleaned;
}

function uniqueBy(items, normalizer = (item) => item) {
  const seen = new Set();
  return items.filter((item) => {
    const key = normalizer(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function groupSimilarItems(items) {
  // Strip leading status prefix (Advanced, Scoped, Delivered, Start) and per-template identifier
  // to find a canonical action key, then group items with the same action
  const getActionKey = (item) => {
    return item
      .replace(/^-\s+/, '')
      .replace(/^(Advanced|Scoped|Delivered|Start|Completed)\s+/i, '')
      .replace(/^Audit\s+(HAT|Mercia)\s+\w+(\s+\w+)*\s+-\s+/i, '')
      .replace(/^(Audit HAT UK Corporate|Audit HAT UK LLP|Audit HAT UK Charity|Audit Mercia UK Company|Audit Mercia UK LLP|Audit Mercia UK Charity|Audit Mercia UK Pension Schemes|Audit Mercia ROI Company|Audit Mercia International Company)\s*[-–]\s*/i, '')
      .trim()
  }

  const groups = new Map()
  for (const item of items) {
    const key = getActionKey(item).toLowerCase()
    if (!groups.has(key)) groups.set(key, { canonical: getActionKey(item), items: [] })
    groups.get(key).items.push(item)
  }

  const result = []
  for (const group of groups.values()) {
    if (group.items.length === 1) {
      result.push(group.items[0])
    } else {
      result.push(`- ${group.canonical} (×${group.items.length} audit templates)`)
    }
  }
  return result
}

function toYmd(date) {
  return date.toISOString().slice(0, 10);
}

function parseYmd(value) {
  return new Date(`${value}T00:00:00Z`);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function describeConfluencePage(title) {
  if (/retro|retrospective/i.test(title)) return `Published sprint retrospective: ${title}`;
  if (/planning|sprint.*plan/i.test(title)) return `Updated sprint planning doc: ${title}`;
  if (/best.?practice|session.*management|guide/i.test(title)) return `Updated best practice guide: ${title}`;
  if (/priorities/i.test(title)) return `Updated team priorities page`;
  if (/tracker|schedule/i.test(title)) return `Updated content schedule tracker`;
  return `Updated Confluence: ${title}`;
}

function normalizePersonKey(name) {
  return name.split(',')[0].trim().toLowerCase();
}

function isLiamCentric(summary) {
  const firstClause = summary.split(/[.;]|—/)[0];
  if (/^[A-Z][a-z]+ (referenced|shared|summarised|raised concern|called for|captured)/i.test(firstClause)
      && !/liam/i.test(firstClause)) return false;
  return true;
}

function formatDateLabel(ymd) {
  const date = parseYmd(ymd);
  return date
    .toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })
    .replace(",", "");
}

function getWorkWeekRanges(targetYmd) {
  const target = parseYmd(targetYmd);
  const day = target.getUTCDay();
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  const currentWeekStart = addDays(target, offsetToMonday);
  const currentWeekEnd = addDays(currentWeekStart, 4);
  const nextWeekStart = addDays(currentWeekStart, 7);
  const nextWeekEnd = addDays(nextWeekStart, 4);

  return {
    currentWeekStart: toYmd(currentWeekStart),
    currentWeekEnd: toYmd(currentWeekEnd),
    nextWeekStart: toYmd(nextWeekStart),
    nextWeekEnd: toYmd(nextWeekEnd),
  };
}

function getISOWeek(date) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function isYmdBetween(ymd, startYmd, endYmd) {
  if (!ymd) return false;
  return ymd >= startYmd && ymd <= endYmd;
}

function eventYmd(event) {
  const startTime = event?.startTime;
  if (!startTime) return null;
  return String(startTime).slice(0, 10);
}

function enumerateDays(startYmd, endYmd) {
  const out = [];
  let cursor = parseYmd(startYmd);
  const end = parseYmd(endYmd);
  while (cursor <= end) {
    out.push(toYmd(cursor));
    cursor = addDays(cursor, 1);
  }
  return out;
}

function loadWeekUnifiedLogs(startYmd, endYmd) {
  const days = enumerateDays(startYmd, endYmd);
  const logs = [];

  for (const ymd of days) {
    const datedPath = resolve(ROOT, `workspace/coordinator/daily-unified-log-${ymd}.json`);
    if (existsSync(datedPath)) {
      const log = readJson(datedPath, null);
      if (log?.entries?.length) {
        logs.push(log);
        continue;
      }
    }

    if (ymd === TARGET_DATE) {
      const latest = readJson(UNIFIED_LOG_PATH, null);
      if (latest?.date === ymd && latest?.entries?.length) {
        logs.push(latest);
      }
    }
  }

  return logs;
}

function aggregateSummaryFromLogs(logs) {
  const byLabel = new Map();

  for (const log of logs) {
    for (const item of log.summary ?? []) {
      const key = cleanText(item.label, 120) || "(unknown)";
      if (!byLabel.has(key)) {
        byLabel.set(key, {
          label: key,
          totalMin: 0,
          sources: new Set(),
        });
      }
      const entry = byLabel.get(key);
      entry.totalMin += item.totalMin ?? 0;
      for (const source of item.sources ?? []) {
        entry.sources.add(source);
      }
    }
  }

  return [...byLabel.values()]
    .map((item) => ({ ...item, sources: [...item.sources] }))
    .sort((a, b) => (b.totalMin ?? 0) - (a.totalMin ?? 0));
}

// --- Build context for the AI prompt / plain summary -----------------------

function buildContext(unifiedLog, dashboardData) {
  const entries = unifiedLog.entries ?? [];
  const summary = unifiedLog.summary ?? [];
  const total = unifiedLog.totalMinutes ?? 0;

  // Inbox items
  const urgent = dashboardData?.priorityInbox?.urgent ?? [];
  const today = dashboardData?.priorityInbox?.today ?? [];
  const inboxItems = [...urgent, ...today].map((i) => i.title ?? i.id);

  // Projects
  const projects = dashboardData?.personalProjects?.projects ?? [];

  // Claude sessions narrative (with claude-sessions-today.json supplementary read)
  const claudeSessions = entries.filter((e) => e.source === "claude");
  const claudeSummary = uniqueBy(
    claudeSessions
      .filter((session) => (session.durationMin ?? 0) >= 5 || /ibp|demo|workflow|dashboard|automation/i.test(session.label ?? ""))
      .sort((a, b) => (b.durationMin ?? 0) - (a.durationMin ?? 0)),
    (session) => `${cleanText(session.label, 80)}|${cleanText(session.detail, 80)}`
  )
    .slice(0, 6)
    .map((s) => {
      const label = cleanText(s.label, 80) || "(session)";
      const detail = cleanText(s.detail, 80);
      return `  - ${label} (${fmtMin(s.durationMin)})${detail ? ": " + detail : ""}`;
    })
    .join("\n");

  // Supplementary Claude session enumeration from file
  let claudeSessionsInfo = "";
  try {
    const sessionsPath = resolve(ROOT, "workspace/coordinator/claude-sessions-today.json");
    if (existsSync(sessionsPath)) {
      const allSessions = readJson(sessionsPath, []);
      const weekRanges = getWorkWeekRanges(TARGET_DATE);
      const weekStart = parseYmd(weekRanges.currentWeekStart).getTime();
      const weekEnd = parseYmd(weekRanges.currentWeekEnd).getTime() + 86400000;
      const weekSessions = allSessions.filter((s) => {
        const startMs = new Date(s.start).getTime();
        return startMs >= weekStart && startMs <= weekEnd;
      });
      if (weekSessions.length > 0) {
        const projectDirs = new Set(weekSessions.map((s) => s.projectDir?.split(/[/\\]/).pop()).filter(Boolean));
        const projectList = [...projectDirs].join(", ");
        claudeSessionsInfo = `Claude Code: ${weekSessions.length} sessions across ${projectList} (this week)`;
      }
    }
  } catch {
    // claude-sessions-today.json not available
  }

  // Window sessions by task
  const windowSummary = summary
    .filter((s) => s.sources.includes("window"))
    .slice(0, 8)
    .map((s) => `  - ${s.label.padEnd(20)} ${fmtMin(s.totalMin)}`)
    .join("\n");

  // Jira worklog
  const jiraSessions = entries.filter((e) => e.source === "jira-worklog");
  const jiraSummary = jiraSessions
    .map((s) => `  - ${s.label}: ${fmtMin(s.durationMin)} — ${s.detail.slice(0, 60)}`)
    .join("\n");

  // Planned vs actual focus work from day plan + time tracker
  const plannedSessions = dashboardData?.timeTracker?.plannedSessions ?? [];
  const plannedTodayMinutes =
    dashboardData?.timeTracker?.plannedTodayMinutes ??
    plannedSessions.reduce((sum, session) => sum + (session.durationMinutes ?? 0), 0);
  const actualTodayMinutes = dashboardData?.timeTracker?.todayTotalMinutes ?? total;
  const actualToPlannedPct =
    plannedTodayMinutes > 0
      ? Math.round((actualTodayMinutes / plannedTodayMinutes) * 100)
      : null;

  const plannedSummary = plannedSessions
    .slice(0, 8)
    .map((s) => {
      const start = s.startedAt ? new Date(s.startedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "?";
      return `  - ${start} ${s.label} (${fmtMin(s.durationMinutes ?? 0)})`;
    })
    .join("\n");

  const weekRanges = getWorkWeekRanges(TARGET_DATE);

  // Teams messages (prefer Power Automate ingest when available)
  const teamMessages = dashboardData?.paTeamsMessages ?? dashboardData?.teamMessages ?? [];
  const teamMessagesSummary = teamMessages
    .slice(0, 10)
    .map((m) => {
      const rawTime = m.receivedAt ?? m.createdDateTime;
      const sender = m.from?.user?.displayName ?? m.from;
      const preview = cleanText((m.preview ?? m.body?.content ?? "(no preview)").replace(/<[^>]*>/g, " "), 140);
      const timeStr = rawTime
        ? new Date(rawTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
        : "?";
      return `  - [${timeStr}] ${cleanText(sender, 40)}: ${cleanText(preview, 80)}`;
    })
    .join("\n");

  const documentSignals = dashboardData?.paDocumentSignals ?? [];

  // Flagged / important emails
  const flaggedEmails = dashboardData?.flaggedEmails ?? [];
  const flaggedEmailsSummary = flaggedEmails
    .slice(0, 10)
    .map((e) => {
      const timeStr = e.receivedAt
        ? new Date(e.receivedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
        : "?";
      return `  - [${timeStr}] From: ${cleanText(e.from, 50)} — ${cleanText(e.subject, 100)}`;
    })
    .join("\n");

  // Calendar — split meetings vs focus blocks
  const calendarToday = dashboardData?.calendar?.today ?? [];
  const weekAhead = dashboardData?.calendar?.weekAhead ?? [];
  const allKnownEvents = [...calendarToday, ...weekAhead];

  const todayMeetings = calendarToday.filter((e) => !e.isFocusBlock);
  const thisWeekUpcomingMeetings = weekAhead.filter((event) => {
    if (event.isFocusBlock) return false;
    const ymd = eventYmd(event);
    return isYmdBetween(ymd, TARGET_DATE, weekRanges.currentWeekEnd);
  });
  const nextWeekMeetings = allKnownEvents.filter((event) => {
    if (event.isFocusBlock) return false;
    const ymd = eventYmd(event);
    return isYmdBetween(ymd, weekRanges.nextWeekStart, weekRanges.nextWeekEnd);
  });

  const completedThisWeekMeetings = calendarToday.filter((event) => {
    if (event.isFocusBlock) return false;
    const ymd = eventYmd(event);
    return Boolean(event.isCompleted)
      && isYmdBetween(ymd, weekRanges.currentWeekStart, weekRanges.currentWeekEnd)
      && !/(lunch|focus|break)/i.test(event.title ?? "");
  });

  const meetingsTotalMin = todayMeetings.reduce((sum, m) => {
    if (m.startTime && m.endTime) {
      const durationMin = Math.round((new Date(m.endTime) - new Date(m.startTime)) / 60000);
      return sum + Math.max(0, durationMin);
    }
    return sum;
  }, 0);
  const meetingsSummary = todayMeetings
    .map((m) => {
      const startStr = m.startTime
        ? new Date(m.startTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
        : "?";
      const endStr = m.endTime
        ? new Date(m.endTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
        : "?";
      return `  - ${startStr}–${endStr} ${cleanText(m.title, 100)}${m.isCompleted ? " ✓" : ""}`;
    })
    .join("\n");

  // Jira items from all priorityInbox buckets
  const allInboxJira = [
    ...(dashboardData?.priorityInbox?.urgent ?? []),
    ...(dashboardData?.priorityInbox?.today ?? []),
    ...(dashboardData?.priorityInbox?.thisWeek ?? []),
  ].filter((i) => i.source === "jira" || i.type === "jira");
  const jiraInboxSummary = allInboxJira
    .map((i) => `  - [${(i.priority ?? "?").toUpperCase()}] ${cleanText(i.title, 110)} (${cleanText(i.project ?? "?", 20)})`)
    .join("\n");

  const weekAheadSummary = weekAhead
    .slice(0, 8)
    .map((m) => {
      const startStr = m.startTime
        ? new Date(m.startTime).toLocaleString("en-GB", {
            weekday: "short",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "Later";
      return `  - ${startStr} ${cleanText(m.title, 100)}`;
    })
    .join("\n");

  return {
    date: TARGET_DATE,
    totalTracked: fmtMin(total),
    totalTrackedMin: total,
    inboxItems,
    windowSummary,
    claudeSummary,
    claudeSessionsInfo,
    jiraSummary,
    plannedSummary,
    plannedTodayMinutes,
    actualTodayMinutes,
    actualToPlannedPct,
    projects,
    summary,
    teamMessagesSummary,
    teamMessageCount: teamMessages.length,
    flaggedEmailsSummary,
    flaggedEmailCount: flaggedEmails.length,
    meetingsSummary,
    meetingsTotalMin,
    meetingCount: todayMeetings.length,
    jiraInboxSummary,
    jiraInboxCount: allInboxJira.length,
    weekAheadSummary,
    weekAheadCount: weekAhead.length,
    weekRanges,
    thisWeekUpcomingMeetings,
    nextWeekMeetings,
    completedThisWeekMeetings,
    documentSignals,
    documentSignalCount: documentSignals.length,
    jiraProjectSnapshots: null, // populated in run() via async Jira API call
    jiraDistBlockers: [],
    jiraComments: [],
    githubActivity: null,
    confluenceActivity: null,
    jiraAutomationActivity: [],
  };
}

// --- Plain summary (no AI) -------------------------------------------------

export function extractQuinnSections(markdown) {
  const content = String(markdown ?? "");
  const sectionDefs = [
    // Accept both new clean headers and legacy emoji headers
    { key: "winsAndImpact", header: /^##\s*(?:🚀\s*Current Week:\s*Wins\s*&\s*Impact|Impact)\s*$/im },
    { key: "issuesBlockers", header: /^##\s*(?:⚠️\s*Issues\s*\/\s*Blockers|Blockers)\s*$/im },
    { key: "nextWeekPriorities", header: /^##\s*(?:🔥\s*Next Week:\s*(?:Top\s*)?Priorities|Priorities)\s*$/im },
    { key: "lookingAhead", header: /^##\s*(?:🔮\s*)?Looking Ahead\s*$/im },
  ];

  const starts = sectionDefs
    .map((def) => {
      const match = def.header.exec(content);
      return match ? { key: def.key, start: match.index, headerLine: match[0] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);

  const result = {
    winsAndImpact: "",
    issuesBlockers: "",
    nextWeekPriorities: "",
    lookingAhead: "",
  };

  for (let i = 0; i < starts.length; i += 1) {
    const current = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1].start : content.length;
    const raw = content.slice(current.start, end);
    const withoutHeader = raw.replace(current.headerLine, "").trim();
    result[current.key] = withoutHeader;
  }

  return result;
}

async function buildPlainSummary(ctx) {
  const weekRanges = ctx.weekRanges ?? getWorkWeekRanges(ctx.date);
  const weekLabel = `${formatDateLabel(weekRanges.currentWeekStart)} - ${formatDateLabel(weekRanges.currentWeekEnd)}`;
  const nextWeekLabel = `${formatDateLabel(weekRanges.nextWeekStart)} - ${formatDateLabel(weekRanges.nextWeekEnd)}`;

  const allIssues = [...new Map(
    (ctx.jiraProjectSnapshots ?? [])
      .flatMap((snapshot) => (snapshot.issues ?? []).map((issue) => ({ ...issue, project: snapshot.project })))
      .map((issue) => [issue.key, issue])
  ).values()];
  const distBlockers = ctx.jiraDistBlockers ?? [];
  const weekSummary = (ctx.weekSummary?.length ? ctx.weekSummary : ctx.summary) ?? [];
  const weekEntries = ctx.weekEntries ?? [];
  const github = ctx.githubActivity ?? { prsAuthored: [], prsReviewed: [], commits: [], localCommits: [] };
  const confluence = ctx.confluenceActivity ?? { pagesCreated: [], pagesEdited: [] };
  const automationRules = ctx.jiraAutomationActivity ?? [];
  const jiraComments = ctx.jiraComments ?? [];
  // All commits: GitHub (pushed) + local git repos (unpushed / private)
  const allCommits = [
    ...(github.commits ?? []),
    ...(github.localCommits ?? []).filter((lc) => !(github.commits ?? []).some((c) => c.message === lc.message && c.repo === lc.repo)),
  ];

  // Load ibp-context JSON if available (Change 8)
  // Expected ibp-context schema:
  // { week, generatedAt, teamsChats: [{ date, with, topic, summary, liamAction?, outcome? }],
  //   transcriptHighlights: [{ date, meeting, attendees, keyPoints }],
  //   standaloneSignals: string[] }
  // liamAction: verb phrase for what Liam did (e.g. "delivered skill", "ran intro session")
  // outcome: one-sentence result separate from the full summary
  const weekStr = getISOWeek(ctx.date);
  const contextPath = resolve(ROOT, 'workspace', 'coordinator', `ibp-context-${weekStr}.json`);
  let ibpContext = null;
  try {
    if (existsSync(contextPath)) {
      ibpContext = readJson(contextPath, null);
    }
  } catch {
    // context not available
  }

  function isPersonallyTouchedIssue(issue) {
    // Reporter = always manual (user created it)
    if (issue?.reporterIsCurrentUser) return true;
    // Any manual changelog entry (excludes automation-rule-only touches)
    if (issue?.touchedByCurrentUserManual) return true;
    return false;
  }

  const personallyTouchedIssues = allIssues
    .filter(isPersonallyTouchedIssue)
    .sort((a, b) => new Date(b.updated ?? 0).getTime() - new Date(a.updated ?? 0).getTime());

  function softTime(minutes) {
    if (!minutes || minutes <= 0) return "a short block";
    if (minutes < 45) return "under an hour";
    if (minutes < 90) return "roughly an hour";
    const hours = Math.round(minutes / 60);
    if (hours <= 3) return "a couple of hours";
    if (hours <= 6) return "around half a day";
    if (hours <= 10) return "most of a day";
    if (hours <= 16) return "a solid couple of days";
    if (hours <= 25) return "roughly three days";
    return "the bulk of the week";
  }

  function softHours(minutes) {
    if (!minutes || minutes <= 0) return "minimal time";
    const hours = Math.round(minutes / 60);
    if (hours === 0) return "under an hour";
    if (hours === 1) return "~1h";
    return `~${hours}h`;
  }

  function humaniseActivityLabel(label) {
    const value = String(label ?? "").toLowerCase().trim();
    if (/^ai-coding$/.test(value)) return "Hands-on coding (AI pair-programming)";
    if (/^jira-browse$/.test(value)) return "Jira ticket review, triage, and sprint work";
    if (/^browser$/.test(value)) return "Web research and documentation review";
    if (/^dev$/.test(value)) return "Local development environment and tooling";
    if (/^bond$/.test(value)) return "Cross-project engineering sessions";
    if (/^bond documents$/.test(value)) return "Workspace automation and scripting";
    if (/^local[.-]command/.test(value)) return "Cross-project engineering sessions";
    if (/^productivity tool/.test(value)) return "Command Center and IBP pipeline work";
    if (/^(ukcaud|ukjpd|ukcas|dist)-?\d*/i.test(value)) return `Focused work on ${value.toUpperCase()}`;
    return cleanText(label, 60);
  }

  function cleanClaudeDetail(detail) {
    if (!detail) return "";
    // Strip the entire local-command-caveat block (the full warning text up to DO NOT respond)
    let cleaned = detail
      .replace(/<local-command-caveat>[\s\S]*?DO NOT respond[^.\n]*\.?\s*/gi, "")
      .replace(/^<local-command-caveat>\s*/i, "")
      .replace(/Caveat:\s*The messages below were generated by the user while running local commands[^.]*\.?\s*DO NOT respond[^.\n]*\.?\s*/gi, "")
      .replace(/^caveat:\s*/i, "")
      .replace(/^(do not|warning|system):\s*/i, "")
      .replace(/The messages below were generated by the user while running local commands[^\n]*/gi, "")
      .replace(/DO NOT respond[^\n]*/gi, "")
      .replace(/You are working inside the project:?\s*"[^"]*"\s*Working directory:?\s*\S+/gi, "")
      .replace(/^(run|start|open|check)\s+my\s+/i, "")
      .replace(/C:[/\\]\S+/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (/^(local[.-]command|the messages below|do not respond)/i.test(cleaned)) return "";
    if (/^[\w.-]+$/.test(cleaned) && cleaned.length < 30) return "";
    if (cleaned.length < 8) return "";
    return cleanText(cleaned, 120);
  }

  function professionaliseDetail(detail) {
    if (!detail || detail.length < 5) return "";
    // Strip full caveat block first
    let text = detail
      .replace(/<local-command-caveat>[\s\S]*?DO NOT respond[^.\n]*\.?\s*/gi, "")
      .replace(/^<local-command-caveat>\s*/i, "")
      .replace(/Caveat:\s*The messages below[^.]*\.?\s*DO NOT respond[^.\n]*\.?\s*/gi, "")
      .replace(/^caveat:\s*/i, "")
      .replace(/^(do not|warning|system):\s*/i, "")
      .replace(/The messages below were generated by the user while running local commands\.?[^\n]*/gi, "")
      // Strip first-person opener
      .replace(/^i\s+(want to make sure|need to make sure|want to ensure|need to ensure)\s+i\s+(have|get|can)\s+/i, "")
      .replace(/^i\s+(want|need|have|think|feel|believe|need to|have to|want to)\s+/i, "")
      // Strip remaining filler phrases
      .replace(/^(to make sure\s+(?:i\s+)?(?:have|get|can)\s+)/i, "")
      .replace(/^(something to prevent|something to|to prevent|to ensure|to make sure|to check)\s+/i, "")
      .replace(/^(instead of|like the|such as)\s+/i, "")
      .trim();
    if (!text || text.length < 5) return "";
    if (/^(do not|warning|caveat|the messages|local.command)/i.test(text)) return "";
    const firstSentence = text.split(/[.!?]/)[0].trim();
    if (!firstSentence || firstSentence.length < 8) return "";
    let final = firstSentence.charAt(0).toUpperCase() + firstSentence.slice(1);
    return cleanText(final, 90);
  }

  function joinNarrativeList(items) {
    if (items.length === 0) return "";
    if (items.length === 1) return items[0];
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
  }

  function humaniseTeamsIncident(line) {
    const value = cleanText(line, 140);
    if (/opening up new engagements/i.test(value)) {
      return "reports that new engagements were not opening properly";
    }
    return value;
  }

  function cleanIssueSummary(summary) {
    return cleanText(summary, 140)
      .replace(/^DEVELOP\s*-\s*/i, "")
      .replace(/^\d+\.\s*/, "")
      .replace(/^Audit\s+(?:(?:HAT|Mercia)\s+)?UK\s+(?:Academy|Company)\s*[-–]\s*/i, "")
      .replace(/\bB\d{2}(?:-[A-Z]+)+\b\s*/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function themeForIssue(issue) {
    const summary = cleanIssueSummary(issue.summary).toLowerCase();
    if (/academy/i.test(issue.summary)) return "sprint delivery work";
    if (/cosmetic|text|label|guidance/.test(summary)) return "UI polish and guidance improvements";
    if (/financial.?statement|"statement".*true|statement.*option/i.test(summary))
      return "HAT UK — Financial Statements";
    if (/remove.*form|old.*se.?builder|legacy.?form/i.test(summary))
      return "HAT UK — Legacy Form Cleanup";
    if (/mercia.*ai.?test|ai.?test.*mercia/i.test(summary))
      return "Mercia UK — AI Testing Audit";
    if (/uk.?corporate|dist.*release|production.?deploy/i.test(summary))
      return "HAT UK Corporate";
    if (/\bMCP\b|enable.*mcp/i.test(summary))
      return null;
    if (/hat|sampling|sample[\s.-]?size|transactional/.test(summary)) return "HAT UK Company Audit — Sampling & Sample Size";
    if (/audit/.test(summary)) return "HAT UK Company Audit — Sampling & Sample Size";
    if (/tailoring|\btb\b/.test(summary)) return "tailoring and trial balance logic";
    if (/rule[\s.-]?builder|automation/.test(summary)) return "rule builder and automation";
    if (/materiality/.test(summary)) return "materiality and sampling logic";
    if (/disclosure checklist|checklist/.test(summary)) return "disclosure checklist delivery";
    if (/navigation|details/.test(summary)) return "navigation and details experience";
    if (/release|spec/.test(summary)) return "release coordination";
    return "sprint delivery work";
  }

  function statusVerb(status) {
    const value = String(status ?? "").toLowerCase();
    if (/done|ready for test|test/.test(value)) return "Delivered";
    if (/in progress|selected/.test(value)) return "Progressed";
    if (/open|to do/.test(value)) return "Scoped";
    return "Advanced";
  }

  function priorityVerb(status) {
    const value = String(status ?? "").toLowerCase();
    if (/in progress/.test(value)) return "Continue";
    if (/selected/.test(value)) return "Pick up";
    if (/to do|open/.test(value)) return "Start";
    return "Finalize";
  }

  function blockerImpact(summary) {
    const value = cleanIssueSummary(summary).toLowerCase();
    if (/materiality|sample|tailoring/.test(value)) return "completion of checklist logic validation";
    if (/details|navigation|guidance/.test(value)) return "final QA sign-off for disclosure checklist UX";
    return "closure of this sprint's planned scope";
  }

  function formatEventLine(event) {
    const ymd = eventYmd(event);
    const day = ymd ? formatDateLabel(ymd).split(" ")[0] : "Day";
    const title = cleanText(event.title ?? "Meeting", 90).replace(/\s*-\s*MS Teams/i, "").trim();
    return `${day}: ${title}`;
  }

  function groupEventsByDay(events) {
    const grouped = new Map();
    for (const event of events) {
      if (/(lunch|focus|break)/i.test(event.title ?? "")) continue;
      const ymd = eventYmd(event);
      if (!ymd) continue;
      const day = formatDateLabel(ymd).split(" ")[0];
      if (!grouped.has(day)) grouped.set(day, []);
      grouped.get(day).push(cleanText(event.title ?? "Meeting", 90).replace(/\s*-\s*MS Teams/i, "").trim());
    }

    return [...grouped.entries()].map(([day, titles]) => `${day}: ${uniqueBy(titles).slice(0, 4).join(", ")}`);
  }

  const workloadBuckets = [
    { label: "hands-on coding and delivery", match: /(ai-coding|claude|script|tool|dashboard|productivity)/i, minutes: 0 },
    { label: "Jira triage, sprint planning, and ticket execution", match: /(jira|ukcaud|ukjpd|ukcas|dist-)/i, minutes: 0 },
    { label: "research, documentation review, and investigation", match: /(browser|web|search|research)/i, minutes: 0 },
  ];
  for (const item of weekSummary) {
    const bucket = workloadBuckets.find((candidate) => candidate.match.test(item.label));
    if (bucket) bucket.minutes += item.totalMin ?? 0;
  }
  const workloadNarrative = workloadBuckets
    .filter((bucket) => bucket.minutes >= 30)
    .map((bucket) => `${softTime(bucket.minutes)} in ${bucket.label}`);
  const rankedWorkloadBuckets = [...workloadBuckets]
    .filter((bucket) => bucket.minutes >= 30)
    .sort((a, b) => b.minutes - a.minutes);

  const themeMap = new Map();
  // Only include issues the user personally touched — excludes auto-triggered automation runs
  const manuallyTouchedIssues = allIssues.filter(
    (issue) => issue.reporterIsCurrentUser || issue.touchedByCurrentUserManual
  );
  // allIssues is already deduplicated by key at source
  const uniqueManualIssues = manuallyTouchedIssues;
  for (const issue of uniqueManualIssues) {
    if (/(qa on hold|on hold|blocked|imped)/i.test(issue.status)) continue;
    const theme = themeForIssue(issue);
    if (!themeMap.has(theme)) themeMap.set(theme, []);
    themeMap.get(theme).push(issue);
  }
  const winsByTheme = [...themeMap.entries()]
    .filter(([theme]) => theme && theme !== "sprint delivery work")
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5)
    .map(([theme, issues]) => ({
      theme,
      issues: issues
        .sort((a, b) => new Date(b.updated ?? 0).getTime() - new Date(a.updated ?? 0).getTime()),
    }));

  const weekTotalHours = Math.max(1, Math.round((ctx.weekTotalMin ?? ctx.totalTrackedMin ?? 0) / 60));

  // AI entries
  const aiEntries = weekEntries
    .filter((e) => e.source === "claude" || e.source === "vscode-chat")
    .sort((a, b) => (b.durationMin ?? 0) - (a.durationMin ?? 0));
  const aiTotalMin = aiEntries.reduce((acc, e) => acc + (e.durationMin ?? 0), 0);
  const aiPct = weekTotalHours > 0 ? Math.round((aiTotalMin / (weekTotalHours * 60)) * 100) : 0;

  // Top AI highlights (structured)
  const topAiHighlights = aiEntries
    .filter((e) => {
      if ((e.durationMin ?? 0) < 5) return false;
      if (!e.detail || e.detail.length < 10) return false;
      if (e.source === "vscode-chat") {
        const d = e.detail.trim();
        if (d.endsWith("?") && d.length < 80) return false;
        if (/^(done|is it|is the|are you|can you|did you)\b.*\??$/i.test(d)) return false;
      }
      return true;
    })
    .slice(0, 10)
    .map((entry) => {
      const sourceLabel = entry.source === "vscode-chat" ? "Copilot" : "Claude";
      let professionalized = "";
      if (entry.source === "vscode-chat") {
        const d = entry.detail.trim();
        if (/^i\s+(want|need|feel|think|believe|was|would)/i.test(d)) {
          professionalized = professionaliseDetail(d) || (d.charAt(0).toUpperCase() + d.slice(1));
        } else {
          professionalized = d.charAt(0).toUpperCase() + d.slice(1);
        }
        if (professionalized.length > 90) professionalized = professionalized.slice(0, 87) + "...";
      } else {
        const rawDetail = (entry.detail ?? "")
          .replace(/<local-command-caveat>[\s\S]*?DO NOT respond[^.\n]*\.?\s*/gi, "")
          .replace(/^<local-command-caveat>\s*/i, "")
          .replace(/Caveat:\s*The messages below[^.]*\.?\s*DO NOT respond[^.\n]*\.?\s*/gi, "")
          .replace(/^caveat:\s*/i, "")
          .replace(/^(do not|warning|system):\s*/i, "")
          .replace(/The messages below[^\n]*/gi, "")
          .replace(/DO NOT respond[^\n]*/gi, "")
          .trim();
        if (/^(do not|warning|caveat|the messages|local.command)/i.test(rawDetail)) return null;
        professionalized = professionaliseDetail(rawDetail) || cleanClaudeDetail(rawDetail) || "";
      }
      if (!professionalized || professionalized.length < 15) return null;
      const labelLower = (entry.label ?? "").toLowerCase();
      if ((labelLower.includes("cross") || labelLower === "bond") && professionalized.length < 25) return null;
      return { sourceLabel, detail: professionalized, durationMin: entry.durationMin ?? 0 };
    })
    .filter(Boolean)
    .slice(0, 5);

  // DIST blockers
  const blockerLines = distBlockers
    .slice(0, 8)
    .map((issue) => {
      const summary = cleanIssueSummary(issue.summary);
      const createdDate = issue.created ? formatDateLabel(issue.created.slice(0, 10)) : "recently";
      return `${issue.key} (${summary}) remains unresolved in ${issue.status} [${issue.priority}] (raised ${createdDate}).`;
    });

  // Completed meetings (filter out ceremonies for the collab section)
  const CEREMONY_RE = /\bstand[- ]?up\b|standup|\bretro\b|retrospective|sprint planning|sprint review|backlog refinement|1[:-]1\b|one[- ]on[- ]one|daily sync/i;
  const allCompletedMeetings = uniqueBy((ctx.completedThisWeekMeetings ?? []).map(formatEventLine));
  const substantiveMeetings = uniqueBy(
    (ctx.completedThisWeekMeetings ?? [])
      .filter((e) => !CEREMONY_RE.test(e.title ?? ""))
      .map(formatEventLine)
  );

  // ---- BUILD OUTPUT -------------------------------------------------------

  const lines = [
    `# IBP — Week of ${weekLabel}`,
    "",
    "## Impact",
    "",
  ];

  // Exec summary — outcome-first, quantified
  const themeNames = winsByTheme.filter(w => w.theme).map((w) => w.theme);
  let execSummary =
    themeNames.length > 0
      ? `Delivered progress across ${joinNarrativeList(themeNames)} this week.`
      : "Delivered focused engineering work this week.";

  const supportingContext = [];
  const totalGitHub = github.prsAuthored.length + github.prsReviewed.length;
  if (totalGitHub > 0) supportingContext.push(`${totalGitHub} GitHub PR${totalGitHub === 1 ? "" : "s"} raised or reviewed`);
  if (allCompletedMeetings.length > 2) supportingContext.push(`${allCompletedMeetings.length} alignment meetings`);
  if (supportingContext.length > 0) {
    const support = joinNarrativeList(supportingContext);
    execSummary += ` ${support.charAt(0).toUpperCase()}${support.slice(1)}.`;
  }
  lines.push(execSummary);
  lines.push("");

  // Thematic sub-sections — one bold heading per workstream, bullets per ticket
  for (const { theme, issues } of winsByTheme) {
    if (!theme) continue;
    const heading = theme.charAt(0).toUpperCase() + theme.slice(1);
    lines.push(`**${heading}**`);
    // Deduplicate by cleaned summary within the theme (different keys, same displayed text)
    const seenSummaries = new Set();
    const impactItems = [];
    for (const issue of issues) {
      const cleaned = cleanIssueSummary(issue.summary).toLowerCase();
      if (seenSummaries.has(cleaned)) continue;
      seenSummaries.add(cleaned);
      impactItems.push(`- ${cleanIssueSummary(issue.summary)}`);
    }
    // Apply groupSimilarItems deduplication for audit template items (Change 1)
    const grouped = groupSimilarItems(impactItems);
    grouped.forEach((l) => lines.push(l));
    lines.push("");
  }

  // Engineering & AI-assisted work sub-section
  const engLines = [];
  for (const pr of github.prsAuthored.slice(0, 5)) {
    const repo = pr.repository?.name ?? pr.repository?.nameWithOwner ?? "repo";
    engLines.push(`- Merged PR (\`${repo}\`): ${cleanText(pr.title, 80)}`);
  }
  for (const pr of github.prsReviewed.slice(0, 4)) {
    const repo = pr.repository?.name ?? pr.repository?.nameWithOwner ?? "repo";
    engLines.push(`- Reviewed PR (\`${repo}\`): ${cleanText(pr.title, 80)}`);
  }
  // Group commits by repo — filter noise before rendering
  const SKIP_COMMIT_REPOS = /^(dotfiles|Bondlw-dotfiles)$/i;
  const SKIP_COMMIT_MSG = /^(?:chore|config|refactor)?:?\s*(?:eod sync|sync \d+|sync from|checkpoint before|wip\b)/i;

  function humaniseRepo(repoName) {
    return repoName.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  function stripPrefix(msg) {
    // Strip both plain (feat:) and scoped (feat(scope):) conventional commit prefixes
    return msg.replace(/^(?:feat|fix|chore|refactor|docs|test|perf|ci|config|build|style)(?:\([^)]+\))?:\s*/i, "").trim();
  }
  // Also skip commits whose entire value is housekeeping after stripping the prefix
  const SKIP_AFTER_STRIP = /^(?:update generated ibp output|ibp output for week)/i;

  const commitsByRepo = new Map();
  for (const c of allCommits) {
    if (SKIP_COMMIT_REPOS.test(c.repo)) continue;
    if (SKIP_COMMIT_MSG.test(c.message)) continue;
    const stripped = stripPrefix(c.message);
    if (SKIP_AFTER_STRIP.test(stripped)) continue;
    if (!commitsByRepo.has(c.repo)) commitsByRepo.set(c.repo, []);
    commitsByRepo.get(c.repo).push(stripped);
  }
  // Build git lines before merging by repo
  const gitLines = [];
  for (const [repo, messages] of commitsByRepo) {
    const cleaned = [...new Set(messages.filter((m) => m.length > 3))];
    if (cleaned.length === 0) continue;
    const label = humaniseRepo(repo);
    // One line per repo — most descriptive messages comma-separated
    const top = [...cleaned].sort((a, b) => b.length - a.length).slice(0, 4);
    gitLines.push(`- ${label}: ${top.map((m) => cleanText(m, 80)).join(", ")}`);
  }

  // Merge duplicate repo entries
  const repoMap = new Map();
  for (const line of gitLines) {
    const repoMatch = line.match(/^- ([^:]+):/);
    const key = repoMatch ? repoMatch[1].trim().toLowerCase() : line;
    if (repoMap.has(key)) {
      const existing = repoMap.get(key);
      const newPart = line.replace(/^- [^:]+:\s*/, '');
      const existingPart = existing.replace(/^- [^:]+:\s*/, '');
      const newFeatures = newPart.split(/[,;]/).map(f => f.trim())
        .filter(f => f && !existingPart.toLowerCase().includes(f.toLowerCase().slice(0, 20)));
      if (newFeatures.length) repoMap.set(key, existing + ', ' + newFeatures.join(', '));
    } else {
      repoMap.set(key, line);
    }
  }
  const mergedGitLines = [...repoMap.values()];
  mergedGitLines.forEach((l) => engLines.push(l));
  for (const rule of automationRules.slice(0, 4)) {
    engLines.push(`- ${rule.action} Jira automation rule: ${cleanText(rule.name, 80)}`);
  }



  // Add skills scan (Change 5) — prefer ibpContext signals over mtime (mtime unreliable on Windows)
  const skillsDir = resolve(homedir(), '.claude', 'skills');
  const weekStart = parseYmd(weekRanges.currentWeekStart);
  const newSkills = [];
  // Extract skill names from ibpContext standaloneSignals (most reliable on Windows)
  const contextSkillNames = new Set();
  if (ibpContext?.standaloneSignals) {
    for (const signal of ibpContext.standaloneSignals) {
      const m = signal.match(/^([\w-]+)\s+skill\s+created/i);
      if (m) contextSkillNames.add(m[1].trim());
    }
  }
  try {
    for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillFile = resolve(skillsDir, entry.name, 'SKILL.md');
      if (!existsSync(skillFile)) continue;
      const content = readFileSync(skillFile, 'utf8');
      const nameMatch = content.match(/^name:s*(.+)$/m);
      const descMatch = content.match(/^description:s*(.+)$/m);
      if (!nameMatch) continue;
      const skillName = nameMatch[1].trim();
      if (contextSkillNames.size > 0) {
        if (!contextSkillNames.has(skillName)) continue;
      } else {
        const stat = statSync(skillFile);
        if (stat.mtimeMs < weekStart.getTime()) continue;
      }
      const rawDesc = descMatch ? descMatch[1].trim() : '';
      const desc = rawDesc.length > 80 ? rawDesc.slice(0, 77) + '...' : rawDesc;
      newSkills.push(`${skillName}${desc ? ' — ' + desc : ''}`);
    }
  } catch {
    // skills dir not accessible
  }
  if (newSkills.length > 0) {
    engLines.push(`- Skills created this week: ${newSkills.join(', ')}`);
  }

  // Group AI highlights by tool — one line per tool, no durations
  const aiByTool = new Map();
  for (const highlight of topAiHighlights) {
    if (!aiByTool.has(highlight.sourceLabel)) aiByTool.set(highlight.sourceLabel, []);
    aiByTool.get(highlight.sourceLabel).push(highlight.detail);
  }
  for (const [tool, details] of aiByTool) {
    const unique = [...new Set(details)];
    engLines.push(`- ${tool}: ${unique.slice(0, 3).map((d) => cleanText(d, 70)).join("; ")}`);
  }

  // Split standaloneSignals: engineering, comms, and blocker signals (Change 4)
  const engSignals = [];
  const commsSignals = [];
  const contextBlockerSignals = [];
  if (ibpContext?.standaloneSignals) {
    for (const signal of ibpContext.standaloneSignals) {
      if (/skill created|\.md.*created|mcp.*submitted|zephyr.*audit|delivered.*to|guide created/i.test(signal))
        engSignals.push(signal);
      else if (/access.*raised|onboarding.*request|course.*pathway|architect.*certif/i.test(signal))
        commsSignals.push(signal);
      else if (/DIST-\d+|blocker raised|still unresolved|blocked on/i.test(signal))
        contextBlockerSignals.push(signal);
      else
        commsSignals.push(signal);
    }
  }

  // Add engSignals to engineering section — skip skills already covered by newSkills
  const newSkillNames = new Set(newSkills.map(s => s.split(' — ')[0].trim().toLowerCase()));
  for (const s of engSignals) {
    const skillMatch = s.match(/^([\w-]+)\s+skill\s+created/i);
    if (skillMatch && newSkillNames.has(skillMatch[1].toLowerCase())) continue;
    engLines.push(`- ${s}`);
  }

  if (engLines.length > 0) {
    lines.push("**Engineering & AI-assisted work**");
    engLines.forEach((l) => lines.push(l));
    lines.push("");
  }

  // Collaboration & documentation sub-section
  const collabLines = [];
  for (const page of confluence.pagesCreated.slice(0, 3)) {
    collabLines.push(`- ${describeConfluencePage(page.title)}${page.space ? ` (${page.space})` : ""}`);
  }
  const editedPageKeys = new Set();
  for (const page of confluence.pagesEdited.slice(0, 6)) {
    const key = page.title.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
    if (editedPageKeys.has(key)) continue;
    editedPageKeys.add(key);
    collabLines.push(`- ${describeConfluencePage(page.title)}`);
  }
  for (const comment of jiraComments.slice(0, 4)) {
    const firstSentence = comment.comment.split(/[.!?]/)[0].trim();
    if (firstSentence.length > 15) {
      collabLines.push(
        (() => { const s = cleanText(firstSentence, 60); return `- Contributed to ${comment.issueKey}: ${s.charAt(0).toUpperCase()}${s.slice(1)}`; })()
      );
    }
  }


  // Build Communications section (Change 5)
  const commsLines = [];

  // Deduplicate Teams chats by person (keep richest summary)
  const chatsByPerson = new Map();
  for (const chat of ibpContext?.teamsChats ?? []) {
    const key = normalizePersonKey(chat.with);
    if (!chatsByPerson.has(key)) {
      chatsByPerson.set(key, { ...chat });
    } else {
      const prev = chatsByPerson.get(key);
      if (chat.summary.length > prev.summary.length) {
        chatsByPerson.set(key, { ...chat, alsoDate: prev.date });
      } else {
        prev.alsoDate = chat.date;
      }
    }
  }

  for (const chat of chatsByPerson.values()) {
    if (!isLiamCentric(chat.summary)) continue;
    const dateNote = chat.alsoDate ? ` (also ${chat.alsoDate})` : '';
    const isGroup = chat.with.includes(',');
    const nameParts = chat.with.split(',').map(p => p.trim().split(' ')[0]).slice(0, 3).join(', ');
    const prefix = isGroup ? `Team sync (${nameParts})` : `1:1 with ${chat.with}${dateNote}`;
    const action = chat.liamAction ? `${chat.liamAction}: ` : '';
    const outcome = chat.outcome ?? cleanText(chat.summary, 120);
    commsLines.push(`- ${prefix} — ${action}${outcome}`);
  }

  // Add transcript highlights
  for (const t of ibpContext?.transcriptHighlights ?? []) {
    const points = (t.keyPoints ?? []).slice(0, 2).join('; ');
    commsLines.push(`- ${t.meeting} [${t.date}]: ${points}`);
  }

  // Add comms signals from standaloneSignals
  for (const s of commsSignals) commsLines.push(`- ${s}`);

  if (substantiveMeetings.length > 0) {
    collabLines.push(`- Meetings: ${substantiveMeetings.slice(0, 4).join("; ")}`);
  }
  if (collabLines.length > 0) {
    lines.push("**Collaboration & documentation**");
    collabLines.forEach((l) => lines.push(l));
    lines.push("");
  }

  if (commsLines.length) {
    lines.push("## Communications");
    lines.push("");
    commsLines.forEach((l) => lines.push(l));
    lines.push("");
  }

  // ---- BLOCKERS -----------------------------------------------------------

  lines.push("## Blockers");
  lines.push("");
  const allBlockerEntries = [
    ...blockerLines,
    ...contextBlockerSignals,
  ];

  // Filter resolved blockers via Jira status check (Change 6)
  const resolvedKeys = await getResolvedTicketKeys(allBlockerEntries);
  const activeBlockers = allBlockerEntries.filter((b) => {
    const keys = [...b.matchAll(/([A-Z]+-\d+)/g)].map(m => m[1]);
    return !keys.some(k => resolvedKeys.has(k));
  });

  if (activeBlockers.length > 0) {
    activeBlockers.forEach((entry) => lines.push(`- ${entry}`));
  } else {
    lines.push("- None");
  }
  lines.push("");

  // ---- PRIORITIES ---------------------------------------------------------

  lines.push("## Priorities");
  lines.push(`_${nextWeekLabel}_`);
  lines.push("");

  const priorityIssues = uniqueBy(
    uniqueManualIssues
      .filter((issue) => /(to do|selected|in progress|open)/i.test(issue.status))
      .filter((issue) => themeForIssue(issue) !== "sprint delivery work")
      .slice(0, 10)
      .map((issue) => {
        const summary = cleanIssueSummary(issue.summary)
          .replace(new RegExp(`^${issue.project}\\s*[-:]?\\s*`, "i"), "")
          .replace(new RegExp(`^${issue.key}\\s*[-:]?\\s*`, "i"), "");
        const lead = summary.charAt(0).toUpperCase() + summary.slice(1);
        return { summary: lead, key: issue.key, status: issue.status, theme: themeForIssue(issue) };
      }),
    (issue) => issue.summary.toLowerCase()
  );

  // Group by theme if multiple themes present, otherwise flat list — exclude catch-all
  const priorityByTheme = new Map();
  for (const issue of priorityIssues) {
    if (issue.theme === "sprint delivery work") continue;
    if (!priorityByTheme.has(issue.theme)) priorityByTheme.set(issue.theme, []);
    priorityByTheme.get(issue.theme).push(issue);
  }

  const priorityLines = [];
  if (priorityByTheme.size > 1) {
    for (const [theme, issues] of priorityByTheme) {
      const heading = theme.charAt(0).toUpperCase() + theme.slice(1);
      lines.push(`**${heading}**`);
      issues.slice(0, 3).forEach((issue) =>
        lines.push(`- ${priorityVerb(issue.status)} ${issue.summary}`)
      );
      lines.push("");
    }
  } else {
    priorityIssues.slice(0, 5).forEach((issue) =>
      priorityLines.push(`- ${priorityVerb(issue.status)} ${issue.summary}`)
    );
    if ((ctx.documentSignalCount ?? 0) > 0) {
      priorityLines.push(
        `- Review ${ctx.documentSignalCount} document change signal${ctx.documentSignalCount === 1 ? "" : "s"}`
      );
    }
  }

  // Action items from transcript highlights (Change 7)
  const nextSteps = (ibpContext?.transcriptHighlights ?? [])
    .flatMap(t => t.keyPoints ?? [])
    .filter(p => /next|action|will|plan|schedule|follow.up/i.test(p))
    .slice(0, 3);
  for (const step of nextSteps) priorityLines.push(`- ${step}`);

  // Notable next-week meetings
  const notableMeetings = (ctx?.nextWeekMeetings ?? [])
    .filter(m => !m.isCancelled && !m.title?.startsWith('Canceled:') && !/standup|stand[- ]?up|rollover|lunch|break/i.test(m.title ?? ""))
    .map(m => (m.title ?? '').replace(/\s*-\s*MS Teams/i, '').trim())
    .slice(0, 5);
  if (notableMeetings.length) {
    priorityLines.push(`- Upcoming: ${notableMeetings.join(', ')}`);
  }

  priorityLines.forEach((l) => lines.push(l));
  if (priorityLines.length > 0) lines.push("");

  // ---- LOOKING AHEAD -------------------------------------------------------

  lines.push("## Looking Ahead");
  lines.push("");

  const STANDUP_NOISE_RE = /standup|stand[- ]?up|rollover|lunch|break/i;
  const filterCalEvents = (evts) => (evts ?? []).filter(e => !STANDUP_NOISE_RE.test(e.title ?? '') && !e.title?.startsWith('Canceled:'));
  const thisWeekRemaining = groupEventsByDay(filterCalEvents(ctx.thisWeekUpcomingMeetings));
  const nextWeekMeetings = groupEventsByDay(filterCalEvents(ctx.nextWeekMeetings));
  lines.push("**Rest of this week:**");
  if (thisWeekRemaining.length > 0) {
    thisWeekRemaining.forEach((entry) => lines.push(`- ${entry}`));
  } else {
    lines.push("- No upcoming meetings scheduled for this week.");
  }
  lines.push("");
  lines.push("**Next week:**");
  if (nextWeekMeetings.length > 0) {
    nextWeekMeetings.forEach((entry) => lines.push(`- ${entry}`));
  } else {
    lines.push("- Next week calendar not yet populated.");
  }
  lines.push("");

  // Preserve hand-crafted sections from existing file (Change 2)
  let preservedOutput = lines.join("\n");
  const existingFile = existsSync(OUTPUT_PATH) ? readFileSync(OUTPUT_PATH, 'utf8') : '';
  if (existingFile) {
    const preservedSections = [];
    const sectionPattern = /^(## (?:Daily Standup Highlights|Meeting Highlights|Team Retrospective Insights)[\s\S]*?)(?=^## |\Z)/gm;
    let match;
    while ((match = sectionPattern.exec(existingFile)) !== null) {
      preservedSections.push(match[1].trim());
    }
    if (preservedSections.length > 0) {
      preservedOutput += "\n\n" + preservedSections.join("\n\n");
    }
  }

  return preservedOutput;
}
// --- Output validation -----------------------------------------------------

// F5: Hard validation of the final markdown before writing. Fails loud on drift.
function validateIbpOutput(markdown, ctx) {
  const failures = [];
  const required = [
    "## 🚀 Last Week: Wins & Impact",
    "## ⚠️ Issues / Blockers",
    "## 🔥 This Week: Top Priorities",
    "## 🔮 Looking Ahead",
  ];
  required.forEach((h) => {
    if (!markdown.includes(h)) failures.push(`missing required section: ${h}`);
  });
  if (markdown.includes("## Communications")) {
    failures.push("non-spec section present: ## Communications");
  }
  if (/[^.][.…]…/.test(markdown) || /\w…/.test(markdown)) {
    failures.push("mid-sentence truncation (…) detected");
  }
  // Word-count band — exclude the YAML/preserved-section content if any.
  const narrativeOnly = markdown
    .replace(/^# IBP[^\n]*\n/, "")
    .replace(/^---[\s\S]*$/m, "")
    .trim();
  const wc = narrativeOnly.split(/\s+/).filter(Boolean).length;
  if (wc < 250 || wc > 450) failures.push(`word count ${wc} outside band 250–450`);

  // Block false-negative blockers.
  const hasKnownBlocker = (ctx.knownBlockers ?? []).length > 0;
  if (hasKnownBlocker && /## ⚠️ Issues \/ Blockers\s*\n+No new blockers/i.test(markdown)) {
    failures.push("emitted 'No new blockers' while ctx.knownBlockers is non-empty");
  }
  return failures;
}

// F6: Read ~/.claude/primer.md ## Open Blockers section (cross-machine source of truth).
function readPrimerBlockers() {
  const primerPath = resolve(homedir(), ".claude", "primer.md");
  if (!existsSync(primerPath)) return [];
  try {
    const text = readFileSync(primerPath, "utf8");
    const m = text.match(/##\s*Open Blockers\s*\n+([\s\S]*?)(?=\n##\s|$)/);
    if (!m) return [];
    return m[1]
      .split("\n")
      .map((l) => l.replace(/^\s*[-*]\s*/, "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

// --- Claude narrative -------------------------------------------------------

// F12: Load 3 hand-picked peer IBPs as multi-shot anchors. Auto-discovered.
function readPeerExamples() {
  const examplesDir = resolve(__dirname, "ibp-examples");
  if (!existsSync(examplesDir)) return [];
  return readdirSync(examplesDir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .slice(0, 3)
    .map((f, idx) => {
      const author = f.replace(/^\d+-/, "").replace(/\.md$/, "").replace(/-/g, " ");
      const body = readFileSync(resolve(examplesDir, f), "utf8").trim();
      return `<example index="${idx + 1}" author="${author}">\n${body}\n</example>`;
    });
}

// F4: XML-structured prompt with role / format / constraints / 3 multi-shot examples.
// Replaces the daily-framing prompt with weekly framing matching the official Caseware IBP spec.
function buildNarrativePrompt(ctx) {
  const topItems = (block, limit = 3) => {
    if (!block) return [];
    return String(block)
      .split("\n")
      .map((line) => cleanText(line.replace(/^\s*[-*]\s*/, ""), 240))
      .filter(Boolean)
      .slice(0, limit);
  };

  const jiraProjectTop = (ctx.jiraProjectSnapshots ?? [])
    .flatMap((s) =>
      s.issues.slice(0, 4).map((i) => `${i.key} [${i.status}] ${cleanText(i.summary, 240)}`)
    )
    .slice(0, 8);

  const knownBlockers = (ctx.knownBlockers ?? []).map((b) => `- ${b}`).join("\n") ||
    "(none active — emit 'No new blockers identified this week.')";

  const upcomingMilestones = (ctx.upcomingMilestones ?? []).map((m) => `- ${m}`).join("\n") || "- (none surfaced)";
  const oooBlocks = (ctx.oooBlocks ?? []).map((o) => `- ${o}`).join("\n") || "- (none planned next 4 weeks)";

  const examples = readPeerExamples().join("\n\n");

  return `<role>
You are a senior Caseware Product Manager (UK Audit). You write the weekly IBP for the Global Product organisation. You write like Kartik Narayan and Quinn Daneyko — concise, outcome-framed, no fluff. Your reader is Andrew Smith and the wider Product leadership team. Optimise for: clarity of impact, surfacing of blockers, sharpness of next-week priorities.
</role>

<format>
Output MUST follow the official Caseware IBP format exactly. Four sections, in this order, with these exact headings:

## 🚀 Last Week: Wins & Impact
## ⚠️ Issues / Blockers
## 🔥 This Week: Top Priorities
## 🔮 Looking Ahead

Within each section, use bold-initiative bullets:
**Initiative name:** One-to-two-sentence outcome description.

End "This Week: Top Priorities" with a single line:
**Biggest lever:** [one sentence on the highest-impact action this week]
</format>

<constraints>
- Total output: 250–400 words. NEVER exceed 400.
- Top Priorities: maximum 3 items + biggest lever line.
- Last Week: Wins & Impact: maximum 6 items.
- NEVER emit a "Communications" section. Distill 1:1s and team syncs into wins if relevant, otherwise drop.
- NEVER emit raw Jira ticket titles ("Start Audit X — Enable Y..."). Synthesise to outcome-framed priorities.
- NEVER pack multiple items into one comma-separated bullet. One bullet per workstream.
- NEVER truncate mid-sentence with "…". Rewrite to fit the budget.
- Issues / Blockers: distinguish FYI vs Help Needed. If genuinely no blockers, write "No new blockers identified this week." If known blockers exist (see <known_blockers>), include them. NEVER write "None" while real blockers are open.
- Looking Ahead: release dates, OOO blocks ≥2 days, cross-team milestones over the next 1–2 months. NOT a list of daily meeting names.
- Tone: third person, action-oriented, professional. No emojis except the 4 section markers.
- Do not invent facts. If a fact is not in the input data, do not include it.
</constraints>

<input>
<week>${ctx.weekLabel ?? ctx.date}</week>

<facts>
- Total tracked time: ${ctx.totalTracked}
- Planned focus: ${fmtMin(ctx.plannedTodayMinutes)}${ctx.actualToPlannedPct !== null ? ` (${ctx.actualToPlannedPct}% execution)` : ""}
- Meetings: ${ctx.meetingCount} (${fmtMin(ctx.meetingsTotalMin)})
- Teams messages: ${ctx.teamMessageCount}
- Flagged emails: ${ctx.flaggedEmailCount}
- Jira inbox items: ${ctx.jiraInboxCount}
</facts>

<top_activity>
${topItems(ctx.claudeSummary, 6).map((x) => `- ${x}`).join("\n") || "- (none)"}
</top_activity>

<top_jira_workstreams>
${jiraProjectTop.map((x) => `- ${x}`).join("\n") || "- (none)"}
</top_jira_workstreams>

<top_inbox>
${ctx.inboxItems.slice(0, 6).map((i) => `- ${cleanText(i, 240)}`).join("\n") || "- (none)"}
</top_inbox>

<known_blockers>
${knownBlockers}
</known_blockers>

<upcoming_milestones>
${upcomingMilestones}
</upcoming_milestones>

<ooo_blocks>
${oooBlocks}
</ooo_blocks>
</input>

<examples>
${examples}
</examples>

<instructions>
Think step by step before writing.

1. Identify the 3–5 highest-impact wins from <top_activity>, <top_jira_workstreams>, and <top_inbox>. Group by workstream. Reframe each from "what was done" to "what advanced and why it matters".
2. Check <known_blockers>. If non-empty, include them under Issues / Blockers with FYI vs Help Needed labels. If empty, write "No new blockers identified this week."
3. Identify the top 2–3 strategic priorities for next week. Drop raw Jira titles. Phrase as forward-looking actions.
4. Name the single biggest lever — the one item that, if executed well, changes the trajectory.
5. Build Looking Ahead from <upcoming_milestones> and <ooo_blocks>. Drop daily meeting names.
6. Verify total length 250–400 words before emitting.
7. Verify zero "…" mid-sentence.
8. Verify no Communications section.
9. Emit only the four-section markdown — no preamble, no postamble.
</instructions>`;
}

function callClaudeCliOAuth(ctx) {
  const prompt = buildNarrativePrompt(ctx);

  // F1: On Windows we run via cmd.exe (shell:true) so PATHEXT resolves claude.exe / claude.cmd correctly.
  // F3: Pin model for deterministic peer-norm voice.
  const modelArgs = ["--print", "--model", "claude-sonnet-4-6"];

  const attempts = [
    // Stdin-only path. Inline mode fails on Windows due to ARG_MAX (the new XML prompt is ~7KB).
    { cmd: "claude", args: modelArgs, useStdin: true },
    // Fallback if global CLI isn't on PATH (rare).
    { cmd: "npx", args: ["-y", "@anthropic-ai/claude-code", ...modelArgs], useStdin: true },
  ];

  // Strip ANTHROPIC_API_KEY so the CLI falls back to OAuth (Claude Code subscription).
  // Without this, the CLI uses a (potentially zero-credit) API key from the parent env.
  const cliEnv = { ...process.env };
  delete cliEnv.ANTHROPIC_API_KEY;
  delete cliEnv.ANTHROPIC_AUTH_TOKEN;

  for (const attempt of attempts) {
    const result = spawnSync(attempt.cmd, attempt.args, {
      input: attempt.useStdin ? prompt : undefined,
      cwd: ROOT,
      encoding: "utf8",
      timeout: 180000,
      env: cliEnv,
      windowsHide: true,
      shell: process.platform === "win32",
    });

    if (!result.error && result.status === 0 && result.stdout?.trim()) {
      const mode = attempt.useStdin ? "stdin" : "inline";
      console.log(`[generate-ibp] Claude OAuth narrative succeeded via ${attempt.cmd} (${mode}, ${result.stdout.length} chars)`);
      return result.stdout.trim();
    }

    // F2: log every attempt failure even when stderr is empty so we can debug silent failures.
    const errMsg = result.error?.message || result.stderr?.trim() || "";
    const exitInfo = `status=${result.status} signal=${result.signal} stdout-empty=${!result.stdout?.trim()}`;
    const mode = attempt.useStdin ? "stdin" : "inline";
    console.warn(`[generate-ibp] OAuth attempt failed (${attempt.cmd}, ${mode}): ${errMsg.slice(0, 200)} | ${exitInfo}`);
  }

  return null;
}

// --- ADF text extraction helper ------------------------------------------

function extractAdfText(body) {
  if (!body) return "";
  if (typeof body === "string") return body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const texts = [];
  function walkAdf(node) {
    if (!node) return;
    if (node.type === "text" && node.text) texts.push(node.text);
    if (node.content?.length) node.content.forEach(walkAdf);
  }
  walkAdf(body);
  return texts.join(" ").replace(/\s+/g, " ").trim();
}

// --- Jira project snapshot (optional) -------------------------------------

async function fetchJiraProjectSnapshot(fromDate) {
  const jiraEmail = process.env.JIRA_EMAIL;
  const jiraToken = process.env.JIRA_API_TOKEN;
  if (!jiraEmail || !jiraToken) return { snapshots: null, distBlockers: [] };

  const PROJECTS = ["UKCAUD", "UKJPD", "UKCAS", "DIST"];
  const authHeader = Buffer.from(`${jiraEmail}:${jiraToken}`).toString("base64");
  const { default: https } = await import("https");

  const snapshots = [];
  const distBlockers = [];

  const jiraGetJson = async (path) => {
    const options = {
      hostname: "caseware.atlassian.net",
      path,
      method: "GET",
      headers: {
        Authorization: `Basic ${authHeader}`,
        Accept: "application/json",
      },
    };

    return new Promise((resolvePromise, rejectPromise) => {
      const req = https.get(options, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          try {
            resolvePromise(JSON.parse(data));
          } catch {
            resolvePromise(null);
          }
        });
      });
      req.on("error", rejectPromise);
      req.setTimeout(10000, () => req.destroy());
    });
  };

  let currentUserAccountId = "";
  try {
    const myself = await jiraGetJson("/rest/api/3/myself");
    currentUserAccountId = myself?.accountId ?? "";
  } catch {
    currentUserAccountId = "";
  }
  const currentUserEmail = String(jiraEmail).toLowerCase();

  for (const project of PROJECTS) {
    try {
      const jql = encodeURIComponent(
        `project = ${project} AND (assignee = currentUser() OR reporter = currentUser()) AND updated >= "${fromDate}" ORDER BY updated DESC`
      );
      const response = await jiraGetJson(`/rest/api/3/search/jql?jql=${jql}&maxResults=15&expand=changelog&fields=summary,status,priority,assignee,reporter,updated`);

      if (response?.issues?.length > 0) {
        snapshots.push({
          project,
          issues: response.issues.map((i) => ({
            key: i.key,
            summary: i.fields.summary,
            status: i.fields.status?.name ?? "?",
            priority: i.fields.priority?.name ?? "?",
            updated: i.fields.updated ?? "",
            reporterAccountId: i.fields.reporter?.accountId ?? "",
            assigneeAccountId: i.fields.assignee?.accountId ?? "",
            assigneeDisplayName: i.fields.assignee?.displayName ?? "",
            isUnassigned: !i.fields.assignee,
            touchedByCurrentUser: (i.changelog?.histories ?? []).some((h) => {
              const accountId = h?.author?.accountId ?? "";
              const emailAddress = String(h?.author?.emailAddress ?? "").toLowerCase();
              return (currentUserAccountId && accountId === currentUserAccountId) || (currentUserEmail && emailAddress === currentUserEmail);
            }),
            touchedByCurrentUserManual: (i.changelog?.histories ?? []).some((h) => {
              const accountId = h?.author?.accountId ?? "";
              const emailAddress = String(h?.author?.emailAddress ?? "").toLowerCase();
              const isCurrentUser =
                (currentUserAccountId && accountId === currentUserAccountId) ||
                (currentUserEmail && emailAddress === currentUserEmail);
              if (!isCurrentUser) return false;
              const metadata = JSON.stringify(h?.historyMetadata ?? {}).toLowerCase();
              return !/automation|rule actor|rule_action|atlassian.automation|auto-trigger|triggered by rule/.test(metadata);
            }),
            reporterIsCurrentUser:
              (currentUserAccountId && i.fields.reporter?.accountId === currentUserAccountId) ||
              (currentUserEmail && String(i.fields.reporter?.emailAddress ?? "").toLowerCase() === currentUserEmail),
          })),
        });
      }
    } catch (err) {
      console.warn(`[generate-ibp] Jira snapshot for ${project} failed:`, err.message);
    }
  }

  try {
    const blockerJql = encodeURIComponent(
      "project = DIST AND reporter = currentUser() AND priority = Blocker AND resolution = Unresolved AND created >= -30d ORDER BY created DESC"
    );
    const blockerResponse = await jiraGetJson(`/rest/api/3/search/jql?jql=${blockerJql}&maxResults=20&fields=summary,status,priority,created`);
    if (blockerResponse?.issues?.length > 0) {
      blockerResponse.issues.forEach((issue) => {
        distBlockers.push({
          key: issue.key,
          summary: issue.fields.summary,
          status: issue.fields.status?.name ?? "?",
          priority: issue.fields.priority?.name ?? "?",
          created: issue.fields.created ?? "",
        });
      });
    }
  } catch (err) {
    console.warn("[generate-ibp] DIST blocker query failed:", err.message);
  }

  // Jira comment mining — collect user-authored comments on personally touched issues (parallel)
  const comments = [];
  const personallyTouchedForComments = snapshots
    .flatMap((s) => s.issues.filter((i) => i.reporterIsCurrentUser || i.touchedByCurrentUserManual))
    .slice(0, 12);
  if (personallyTouchedForComments.length > 0) {
    console.log(`[generate-ibp] Mining comments on ${personallyTouchedForComments.length} personally touched issues...`);
    const fromMs = new Date(fromDate + "T00:00:00Z").getTime();
    const commentBatches = await Promise.allSettled(
      personallyTouchedForComments.map(async (issue) => {
        const commentResponse = await jiraGetJson(
          `/rest/api/3/issue/${issue.key}/comment?maxResults=15&orderBy=-created`
        );
        if (!commentResponse?.comments?.length) return [];
        const found = [];
        for (const comment of commentResponse.comments) {
          const authorId = comment.author?.accountId ?? "";
          const authorEmail = String(comment.author?.emailAddress ?? "").toLowerCase();
          const isCurrentUser =
            (currentUserAccountId && authorId === currentUserAccountId) ||
            (currentUserEmail && authorEmail === currentUserEmail);
          if (!isCurrentUser) continue;
          const createdMs = new Date(comment.created ?? 0).getTime();
          if (createdMs < fromMs) continue;
          const bodyText = extractAdfText(comment.body);
          if (!bodyText || bodyText.length < 30) continue;
          // Skip short status-update comments
          if (/^(done|updated|fixed|resolved|closed|noted|thanks|ok|lgtm|approved|\+1|will do|on it|checked)\s*\.?$/i.test(bodyText.trim())) continue;
          // Skip comments that are just QA status tables (dev/qa checkboxes etc.)
          if (/^\s*(plans?\s*[-–]|dev\s*[(:]).*qa\s*[(:]/is.test(bodyText)) continue;
          found.push({
            issueKey: issue.key,
            issueSummary: issue.summary,
            comment: bodyText.slice(0, 140),
            created: comment.created ?? "",
          });
        }
        return found;
      })
    );
    for (const batch of commentBatches) {
      if (batch.status === "fulfilled") comments.push(...batch.value);
    }
  }

  return {
    snapshots: snapshots.length > 0 ? snapshots : null,
    distBlockers,
    comments,
  };
}

// --- Blocker auto-resolution via Jira status check (Change 6) --------

async function getResolvedTicketKeys(ticketStrings) {
  const jiraEmail = process.env.JIRA_EMAIL;
  const jiraToken = process.env.JIRA_API_TOKEN;
  if (!jiraEmail || !jiraToken) return new Set();

  const authHeader = Buffer.from(`${jiraEmail}:${jiraToken}`).toString("base64");
  const { default: https } = await import("https");

  const resolved = new Set();
  const keyPattern = /([A-Z]+-\d+)/g;
  const allKeys = [...new Set(
    ticketStrings.flatMap(s => [...s.matchAll(keyPattern)].map(m => m[1]))
  )];

  const jiraGetJson = async (path) => {
    return new Promise((res) => {
      const req = https.get(
        {
          hostname: "caseware.atlassian.net",
          path,
          method: "GET",
          headers: { Authorization: `Basic ${authHeader}`, Accept: "application/json" },
        },
        (response) => {
          let data = "";
          response.on("data", (chunk) => { data += chunk; });
          response.on("end", () => { try { res(JSON.parse(data)); } catch { res(null); } });
        },
      );
      req.on("error", () => res(null));
      req.setTimeout(10000, () => req.destroy());
    });
  };

  for (const key of allKeys) {
    try {
      const data = await jiraGetJson(`/rest/api/3/issue/${key}?fields=status`);
      if (data?.fields?.status?.statusCategory?.key === 'done') resolved.add(key);
    } catch { /* keep blocker if fetch fails */ }
  }
  return resolved;
}

// --- Local git repo commit scan -------------------------------------------

function fetchLocalGitCommits(fromDate, authorEmail) {
  const since = `${fromDate}T00:00:00`;
  const commits = [];
  const seen = new Set();

  const scanRoots = [
    resolve(ROOT, ".."),     // ~/Documents
  ];

  function tryGitLog(dir) {
    const result = spawnSync(
      "git",
      ["-C", dir, "log", `--author=${authorEmail}`, `--since=${since}`,
        "--no-merges", "--format=%s", "--max-count=30"],
      { encoding: "utf8", timeout: 8000, windowsHide: true }
    );
    if (result.error || result.status !== 0 || !result.stdout?.trim()) return;
    const repoNameResult = spawnSync("git", ["-C", dir, "rev-parse", "--show-toplevel"],
      { encoding: "utf8", timeout: 3000, windowsHide: true });
    const repoPath = (repoNameResult.stdout?.trim() ?? dir).replace(/\\/g, "/");
    const repoName = repoPath.split("/").pop() ?? dir;
    const SKIP_LOCAL_MSG = /^(?:chore|config|refactor)?:?\s*(?:eod sync|sync \d+|sync from|checkpoint before|wip\b)/i;
    for (const message of result.stdout.split("\n")) {
      const msg = message.trim();
      if (!msg || msg.length < 3) continue;
      if (SKIP_LOCAL_MSG.test(msg)) continue;
      const key = `${repoName}|${msg.slice(0, 60)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      commits.push({ repo: repoName, message: msg, date: "" });
    }
  }

  for (const root of scanRoots) {
    try {
      tryGitLog(root);
      // Try well-known project subdirectories
      const knownSubdirs = [
        "Productivity Tool", "code", "UKCAUD AI Project",
        "CW Release Notes Tool", "CW Template Comparison Tool", "Property Search Tool",
        "claude-mobile", "chrome-cdp-skill-repo",
      ];
      for (const sub of knownSubdirs) {
        tryGitLog(resolve(root, sub));
      }
    } catch { /* skip */ }
  }

  console.log(`[generate-ibp] Local git: ${commits.length} commits found`);
  return commits;
}

// --- GitHub activity (all repos, via gh CLI) ------------------------------

async function fetchGitHubActivity(fromDate) {
  const result = { prsAuthored: [], prsReviewed: [], commits: [] };
  const ghBin = process.platform === "win32" ? "gh.exe" : "gh";
  const ghRun = (args) =>
    spawnSync(ghBin, args, { encoding: "utf8", timeout: 20000, windowsHide: true });

  try {
    const authored = ghRun([
      "search", "prs", "--author=@me", "--state=merged",
      `--updated=>=${fromDate}`, "--limit=30",
      "--json=title,repository,url,mergedAt",
    ]);
    if (!authored.error && authored.status === 0 && authored.stdout?.trim()) {
      result.prsAuthored = JSON.parse(authored.stdout);
    }
  } catch { /* gh CLI unavailable */ }

  try {
    const reviewed = ghRun([
      "search", "prs", "--reviewed-by=@me", "--state=merged",
      `--updated=>=${fromDate}`, "--limit=30",
      "--json=title,repository,url,mergedAt",
    ]);
    if (!reviewed.error && reviewed.status === 0 && reviewed.stdout?.trim()) {
      const all = JSON.parse(reviewed.stdout);
      const authoredUrls = new Set(result.prsAuthored.map((p) => p.url));
      result.prsReviewed = all.filter((p) => !authoredUrls.has(p.url));
    }
  } catch { /* gh CLI unavailable */ }

  try {
    const commits = ghRun([
      "search", "commits", "--author=@me",
      `--committer-date=>=${fromDate}`, "--limit=50",
      "--json=repository,commit,sha",
    ]);
    if (!commits.error && commits.status === 0 && commits.stdout?.trim()) {
      const parsed = JSON.parse(commits.stdout);
      const seen = new Set();
      for (const c of parsed) {
        const firstLine = (c.commit?.message ?? "").split("\n")[0].trim();
        if (/^Merge (branch|pull request)/i.test(firstLine)) continue;
        const key = `${c.repository?.nameWithOwner ?? ""}|${firstLine.slice(0, 60)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.commits.push({
          repo: c.repository?.name ?? c.repository?.nameWithOwner ?? "repo",
          message: firstLine,
          date: c.commit?.author?.date ?? "",
        });
      }
    }
  } catch { /* gh CLI unavailable */ }

  console.log(`[generate-ibp] GitHub: ${result.prsAuthored.length} PRs authored, ${result.prsReviewed.length} PRs reviewed, ${result.commits.length} commits`);
  return result;
}

// --- Confluence page activity ----------------------------------------------

async function fetchConfluenceActivity(fromDate, authHeader) {
  const result = { pagesCreated: [], pagesEdited: [] };
  const { default: https } = await import("https");

  const confluenceGet = (path) =>
    new Promise((res) => {
      const req = https.get(
        {
          hostname: "caseware.atlassian.net",
          path,
          method: "GET",
          headers: { Authorization: `Basic ${authHeader}`, Accept: "application/json" },
        },
        (response) => {
          let data = "";
          response.on("data", (chunk) => { data += chunk; });
          response.on("end", () => { try { res(JSON.parse(data)); } catch { res(null); } });
        },
      );
      req.on("error", () => res(null));
      req.setTimeout(10000, () => req.destroy());
    });

  try {
    const cql = encodeURIComponent(
      `contributor = currentUser() AND lastModified >= "${fromDate}" ORDER BY lastModified DESC`,
    );
    const response = await confluenceGet(
      `/wiki/rest/api/content/search?cql=${cql}&limit=25&expand=version,space`,
    );
    if (response?.results?.length) {
      for (const page of response.results) {
        const item = {
          title: page.title ?? "Untitled",
          space: page.space?.name ?? page.space?.key ?? "",
          version: page.version?.number ?? 1,
        };
        if (item.version <= 1) {
          result.pagesCreated.push(item);
        } else {
          result.pagesEdited.push(item);
        }
      }
    }
  } catch (err) {
    console.warn("[generate-ibp] Confluence activity fetch failed:", err.message);
  }

  console.log(`[generate-ibp] Confluence: ${result.pagesCreated.length} created, ${result.pagesEdited.length} edited`);
  return result;
}

// --- Jira automation audit -------------------------------------------------

async function fetchJiraAutomationActivity(fromDate, authHeader) {
  const rules = [];
  const { default: https } = await import("https");

  const jiraGet = (path) =>
    new Promise((res) => {
      const req = https.get(
        {
          hostname: "caseware.atlassian.net",
          path,
          method: "GET",
          headers: { Authorization: `Basic ${authHeader}`, Accept: "application/json" },
        },
        (response) => {
          let data = "";
          response.on("data", (chunk) => { data += chunk; });
          response.on("end", () => {
            try { res({ status: response.statusCode, body: JSON.parse(data) }); }
            catch { res({ status: response.statusCode, body: null }); }
          });
        },
      );
      req.on("error", () => res({ status: 0, body: null }));
      req.setTimeout(10000, () => req.destroy());
    });

  try {
    const auditRes = await jiraGet(`/rest/api/3/auditing/record?from=${fromDate}&limit=100`);
    if (auditRes.status === 200 && auditRes.body?.records?.length) {
      const fromMs = new Date(fromDate + "T00:00:00Z").getTime();
      for (const record of auditRes.body.records) {
        const createdMs = record.created ? new Date(record.created).getTime() : 0;
        if (createdMs < fromMs) continue;
        if (/(automation|rule)/i.test(String(record.summary ?? record.eventType ?? ""))) {
          rules.push({
            name: record.objectItem?.name ?? record.summary ?? "Automation rule",
            action: /creat/i.test(record.eventType ?? "") ? "Created" : "Updated",
            date: record.created ?? "",
          });
        }
      }
    }
  } catch (err) {
    console.warn("[generate-ibp] Jira automation audit fetch failed:", err.message);
  }

  console.log(`[generate-ibp] Jira automation: ${rules.length} rule changes found`);
  return rules;
}

// --- Main ------------------------------------------------------------------

async function run() {
  // Ensure unified log is fresh — run merge if it doesn't exist for today
  if (!existsSync(UNIFIED_LOG_PATH)) {
    console.log("[generate-ibp] unified log not found — running merge-activity-log.mjs first");
    try {
      const dateFlag = dateArg ? `--date=${TARGET_DATE}` : "";
      execSync(
        `node "${resolve(__dirname, "merge-activity-log.mjs")}" ${dateFlag}`,
        { stdio: "inherit" }
      );
    } catch (err) {
      console.warn("[generate-ibp] merge-activity-log failed:", err.message);
    }
  }

  const unifiedLog = readJson(UNIFIED_LOG_PATH, { entries: [], summary: [], totalMinutes: 0 });
  const dashboardData = readJson(DASHBOARD_DATA_PATH, {});

  const ctx = buildContext(unifiedLog, dashboardData);
  const weekRanges = ctx.weekRanges ?? getWorkWeekRanges(TARGET_DATE);
  const weekLogs = loadWeekUnifiedLogs(weekRanges.currentWeekStart, weekRanges.currentWeekEnd);
  const logsForAggregation = weekLogs.length > 0 ? weekLogs : [unifiedLog];

  ctx.daysWithWeekData = weekLogs.length;
  ctx.weekEntries = logsForAggregation.flatMap((log) => log.entries ?? []);
  ctx.weekSummary = aggregateSummaryFromLogs(logsForAggregation);
  ctx.weekTotalMin = logsForAggregation.reduce((sum, log) => sum + (log.totalMinutes ?? 0), 0);

  // Attach Jira project snapshots (async, optional — requires JIRA_EMAIL + JIRA_API_TOKEN)
  console.log(`[generate-ibp] fetching Jira project snapshots from ${weekRanges.currentWeekStart}...`);
  const jiraData = await fetchJiraProjectSnapshot(weekRanges.currentWeekStart);
  ctx.jiraProjectSnapshots = jiraData?.snapshots ?? null;
  ctx.jiraDistBlockers = jiraData?.distBlockers ?? [];
  ctx.jiraComments = jiraData?.comments ?? [];
  if (ctx.jiraProjectSnapshots) {
    console.log(`[generate-ibp] Jira snapshots: ${ctx.jiraProjectSnapshots.map((s) => `${s.project}(${s.issues.length})`).join(", ")}`);
  } else {
    console.log("[generate-ibp] Jira project snapshots unavailable (no matching issues, API error, or missing credentials)");
  }

  // GitHub activity (all repos via gh CLI + local git repos)
  console.log("[generate-ibp] fetching GitHub activity...");
  ctx.githubActivity = await fetchGitHubActivity(weekRanges.currentWeekStart);
  // Local git commits (catches private/unpushed work)
  const _gitEmail = process.env.JIRA_EMAIL ?? process.env.GIT_AUTHOR_EMAIL ?? "liam.bond@caseware.com";
  const localCommits = fetchLocalGitCommits(weekRanges.currentWeekStart, _gitEmail);
  ctx.githubActivity.localCommits = localCommits;

  // Confluence pages + Jira automation audit (only when Jira auth is available)
  const _jiraEmail = process.env.JIRA_EMAIL;
  const _jiraToken = process.env.JIRA_API_TOKEN;
  if (_jiraEmail && _jiraToken) {
    const _authHeader = Buffer.from(`${_jiraEmail}:${_jiraToken}`).toString("base64");
    console.log("[generate-ibp] fetching Confluence activity...");
    ctx.confluenceActivity = await fetchConfluenceActivity(weekRanges.currentWeekStart, _authHeader);
    console.log("[generate-ibp] fetching Jira automation audit...");
    ctx.jiraAutomationActivity = await fetchJiraAutomationActivity(weekRanges.currentWeekStart, _authHeader);
  } else {
    ctx.confluenceActivity = { pagesCreated: [], pagesEdited: [] };
    ctx.jiraAutomationActivity = [];
  }

  ctx.weekLabel = formatWeekLabel(weekRanges.currentWeekStart, weekRanges.currentWeekEnd);
  ctx.knownBlockers = [
    ...readPrimerBlockers(),
    ...(ctx.jiraProjectSnapshots ?? [])
      .flatMap((s) => s.issues)
      .filter((i) => i.key?.startsWith("DIST-") && (i.status ?? "").toLowerCase() !== "done")
      .map((i) => `${i.key}: ${i.summary} (${i.status})`),
    ...(ctx.jiraDistBlockers ?? [])
      .map((b) => (typeof b === "string" ? b : `${b.key ?? ""}: ${b.summary ?? ""}`))
      .filter(Boolean),
  ];
  const _seenBlockers = new Set();
  ctx.knownBlockers = ctx.knownBlockers.filter((b) => {
    const key = b.match(/[A-Z]+-\d+/)?.[0] ?? b;
    if (_seenBlockers.has(key)) return false;
    _seenBlockers.add(key);
    return true;
  });
  ctx.upcomingMilestones = ctx.upcomingMilestones ?? [];
  ctx.oooBlocks = ctx.oooBlocks ?? [];
  console.log(
    `[generate-ibp] knownBlockers: ${ctx.knownBlockers.length} (${ctx.knownBlockers.slice(0, 2).join(" | ") || "none"})`,
  );

  let content;

  if (SKIP_AI) {
    content = await buildPlainSummary(ctx);
    console.log("[generate-ibp] using plain summary (no AI)");
  } else {
    console.log("[generate-ibp] calling Claude via OAuth for narrative...");
    const narrative = callClaudeCliOAuth(ctx);

    if (!narrative) {
      console.error("\n[generate-ibp] FATAL: Claude narrative unavailable.");
      console.error("  1. 'claude' CLI not on PATH");
      console.error("  2. Not logged in (run `claude login`)");
      console.error("  3. Windows: claude.cmd not resolvable by spawnSync");
      console.error("  Set IBP_ALLOW_FALLBACK=1 to force the legacy plain-summary fallback.");
      if (process.env.IBP_ALLOW_FALLBACK !== "1") {
        process.exit(2);
      }
      console.warn("[generate-ibp] IBP_ALLOW_FALLBACK=1 set — emitting plain summary (off-spec).");
      content = await buildPlainSummary(ctx);
    } else {
      content = [
        `# IBP — ${ctx.weekLabel ?? ctx.date}`,
        ``,
        narrative,
        ``,
        `---`,
        `_Generated by generate-ibp.mjs (Claude sonnet-4-6) at ${new Date().toLocaleTimeString("en-GB")}_`,
      ].join("\n");
    }
  }

  if (!SKIP_AI) {
    const failures = validateIbpOutput(content, ctx);
    if (failures.length > 0) {
      const failuresPath = OUTPUT_PATH.replace(/\.md$/, "-validation-failures.json");
      writeFileSync(failuresPath, JSON.stringify({ failures, generatedAt: new Date().toISOString() }, null, 2));
      console.error(`[generate-ibp] Validation flagged ${failures.length} issue(s). See ${failuresPath}`);
      failures.forEach((f) => console.error(`  - ${f}`));
      if (process.env.IBP_ALLOW_DRIFT !== "1") {
        console.error("  Set IBP_ALLOW_DRIFT=1 to write anyway.");
        process.exit(3);
      }
    }
  }

  writeFileSync(OUTPUT_PATH, content);
  console.log(`[generate-ibp] wrote ${OUTPUT_PATH}`);
}

function formatWeekLabel(startISO, endISO) {
  if (!startISO || !endISO) return null;
  const start = new Date(startISO);
  const end = new Date(endISO);
  const opts = { weekday: "short", day: "numeric", month: "short" };
  return `Week of ${start.toLocaleDateString("en-GB", opts)} - ${end.toLocaleDateString("en-GB", opts)}`;
}

const isDirectExecution =
  process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  run().catch((err) => {
    console.error("[generate-ibp] fatal:", err);
    process.exit(1);
  });
}
