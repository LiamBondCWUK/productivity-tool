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
 * Optionally calls Claude Haiku to synthesise a narrative summary.
 * If ANTHROPIC_API_KEY is absent, writes a plain data-only summary instead.
 *
 * Usage:
 *   node scripts/generate-ibp.mjs [--date YYYY-MM-DD] [--skip-ai]
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const UNIFIED_LOG_PATH = resolve(ROOT, "workspace/coordinator/daily-unified-log.json");
const DASHBOARD_DATA_PATH = resolve(ROOT, "workspace/coordinator/dashboard-data.json");

const dateArg = process.argv.find((a) => a.startsWith("--date"))?.split("=")[1];
const TARGET_DATE = dateArg ?? new Date().toISOString().slice(0, 10);
const SKIP_AI = process.argv.includes("--skip-ai");

const OUTPUT_PATH = resolve(ROOT, `workspace/coordinator/ibp-${TARGET_DATE}.md`);

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

  // Claude sessions narrative
  const claudeSessions = entries.filter((e) => e.source === "claude");
  const claudeSummary = claudeSessions
    .map((s) => `  - ${s.label} (${fmtMin(s.durationMin)})${s.detail ? ": " + s.detail.slice(0, 80) : ""}`)
    .join("\n");

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

  // Teams messages
  const teamMessages = dashboardData?.teamMessages ?? [];
  const teamMessagesSummary = teamMessages
    .slice(0, 10)
    .map((m) => {
      const timeStr = m.receivedAt
        ? new Date(m.receivedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
        : "?";
      return `  - [${timeStr}] ${m.from}: ${(m.preview ?? "(no preview)").slice(0, 80)}`;
    })
    .join("\n");

  // Flagged / important emails
  const flaggedEmails = dashboardData?.flaggedEmails ?? [];
  const flaggedEmailsSummary = flaggedEmails
    .slice(0, 10)
    .map((e) => {
      const timeStr = e.receivedAt
        ? new Date(e.receivedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
        : "?";
      return `  - [${timeStr}] From: ${e.from} — ${e.subject}`;
    })
    .join("\n");

  // Calendar — split meetings vs focus blocks
  const calendarToday = dashboardData?.calendar?.today ?? [];
  const todayMeetings = calendarToday.filter((e) => !e.isFocusBlock);
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
      return `  - ${startStr}–${endStr} ${m.title}${m.isCompleted ? " ✓" : ""}`;
    })
    .join("\n");

  // Jira items from all priorityInbox buckets
  const allInboxJira = [
    ...(dashboardData?.priorityInbox?.urgent ?? []),
    ...(dashboardData?.priorityInbox?.today ?? []),
    ...(dashboardData?.priorityInbox?.thisWeek ?? []),
  ].filter((i) => i.source === "jira" || i.type === "jira");
  const jiraInboxSummary = allInboxJira
    .map((i) => `  - [${(i.priority ?? "?").toUpperCase()}] ${i.title} (${i.project ?? "?"})`)
    .join("\n");

  return {
    date: TARGET_DATE,
    totalTracked: fmtMin(total),
    totalTrackedMin: total,
    inboxItems,
    windowSummary,
    claudeSummary,
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
    jiraProjectSnapshots: null, // populated in run() via async Jira API call
  };
}

// --- Plain summary (no AI) -------------------------------------------------

function buildPlainSummary(ctx) {
  const lines = [
    `# IBP — ${ctx.date}`,
    ``,
    `**Total tracked time:** ${ctx.totalTracked}`,
    `**Planned focus time:** ${fmtMin(ctx.plannedTodayMinutes)}${ctx.actualToPlannedPct !== null ? ` (${ctx.actualToPlannedPct}% execution)` : ""}`,
    ``,
  ];

  if (ctx.summary.length > 0) {
    lines.push(`## Time by Activity`);
    lines.push(``);
    for (const item of ctx.summary) {
      lines.push(`| ${item.label} | ${fmtMin(item.totalMin)} | ${item.sources.join(", ")} |`);
    }
    lines.push(``);
  }

  if (ctx.claudeSummary) {
    lines.push(`## Claude Coding Sessions`);
    lines.push(``);
    lines.push(ctx.claudeSummary);
    lines.push(``);
  }

  if (ctx.jiraSummary) {
    lines.push(`## Jira Worklog`);
    lines.push(``);
    lines.push(ctx.jiraSummary);
    lines.push(``);
  }

  if (ctx.plannedSummary) {
    lines.push(`## Planned Focus Blocks (Booked)`);
    lines.push(``);
    lines.push(ctx.plannedSummary);
    lines.push(``);
  }

  if (ctx.meetingsSummary) {
    lines.push(`## Meetings Today (${ctx.meetingCount}, ${fmtMin(ctx.meetingsTotalMin)})`);
    lines.push(``);
    lines.push(ctx.meetingsSummary);
    lines.push(``);
  }

  if (ctx.teamMessagesSummary) {
    lines.push(`## Teams Messages (${ctx.teamMessageCount})`);
    lines.push(``);
    lines.push(ctx.teamMessagesSummary);
    lines.push(``);
  }

  if (ctx.flaggedEmailsSummary) {
    lines.push(`## Flagged / Important Emails (${ctx.flaggedEmailCount})`);
    lines.push(``);
    lines.push(ctx.flaggedEmailsSummary);
    lines.push(``);
  }

  if (ctx.jiraInboxSummary) {
    lines.push(`## Jira Items in Inbox (${ctx.jiraInboxCount})`);
    lines.push(``);
    lines.push(ctx.jiraInboxSummary);
    lines.push(``);
  }

  if (ctx.jiraProjectSnapshots?.length > 0) {
    lines.push(`## Jira Project Snapshots`);
    lines.push(``);
    for (const snap of ctx.jiraProjectSnapshots) {
      lines.push(`### ${snap.project} (${snap.issues.length} updated today)`);
      lines.push(``);
      for (const issue of snap.issues) {
        lines.push(`- **${issue.key}** [${issue.status}] ${issue.summary}`);
      }
      lines.push(``);
    }
  }

  if (ctx.inboxItems.length > 0) {
    lines.push(`## Open Inbox`);
    lines.push(``);
    for (const item of ctx.inboxItems) {
      lines.push(`- ${item}`);
    }
    lines.push(``);
  }

  lines.push(`---`);
  lines.push(`_Generated by generate-ibp.mjs at ${new Date().toLocaleTimeString("en-GB")}_`);

  return lines.join("\n");
}

// --- Claude Haiku narrative -------------------------------------------------

async function callClaudeHaiku(ctx) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("[generate-ibp] ANTHROPIC_API_KEY not set — using plain summary");
    return null;
  }

  const prompt = `You are an end-of-day assistant. Write a concise IBP (Integrated Business Progress) summary for ${ctx.date}.

DATA:
- Total tracked time: ${ctx.totalTracked}
- Planned focus time: ${fmtMin(ctx.plannedTodayMinutes)}${ctx.actualToPlannedPct !== null ? ` (${ctx.actualToPlannedPct}% execution)` : ""}
- Window activity:
${ctx.windowSummary || "  (none recorded)"}
- Claude AI coding sessions:
${ctx.claudeSummary || "  (none recorded)"}
- Jira worklog:
${ctx.jiraSummary || "  (none recorded)"}
- Planned focus blocks:
${ctx.plannedSummary || "  (none booked)"}
- Meetings today (${ctx.meetingCount}, ${fmtMin(ctx.meetingsTotalMin)} total):
${ctx.meetingsSummary || "  (none recorded)"}
- Teams messages (${ctx.teamMessageCount}):
${ctx.teamMessagesSummary || "  (none)"}
- Flagged emails (${ctx.flaggedEmailCount}):
${ctx.flaggedEmailsSummary || "  (none)"}
- Jira items in inbox:
${ctx.jiraInboxSummary || "  (none)"}
${ctx.jiraProjectSnapshots?.length > 0 ? "- Jira project activity (updated today):\n" + ctx.jiraProjectSnapshots.map(s => s.issues.map(i => `  - ${i.key} [${i.status}] ${i.summary} (${s.project})`).join("\n")).join("\n") : ""}
- Open inbox items:
${ctx.inboxItems.slice(0, 5).map((i) => `  - ${i}`).join("\n") || "  (none)"}

INSTRUCTIONS:
Write a 200-300 word markdown EOD summary with these sections:
1. **What I accomplished today** — 3-5 bullets, be specific about features/tasks completed
2. **Time breakdown** — short paragraph on where time was spent and planned-vs-actual execution
3. **Open threads** — 2-3 bullets of things in progress or outstanding
4. **Tomorrow's priority** — 1 bullet on the most important next action

Keep it crisp, factual, and useful for planning tomorrow.`;

  const body = JSON.stringify({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }],
  });

  const { default: https } = await import("https");

  return new Promise((resolve, reject) => {
    const req = https.request(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.content?.[0]?.text) {
              resolve(parsed.content[0].text);
            } else {
              console.warn("[generate-ibp] unexpected Claude response:", data.slice(0, 200));
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on("error", (err) => {
      console.warn("[generate-ibp] Claude API error:", err.message);
      resolve(null);
    });
    req.setTimeout(20000, () => {
      req.destroy();
      resolve(null);
    });
    req.write(body);
    req.end();
  });
}

// --- Jira project snapshot (optional) -------------------------------------

async function fetchJiraProjectSnapshot(date) {
  const jiraEmail = process.env.JIRA_EMAIL;
  const jiraToken = process.env.JIRA_API_TOKEN;
  if (!jiraEmail || !jiraToken) return null;

  const JIRA_BASE = "https://caseware.atlassian.net";
  const PROJECTS = ["UKCAUD", "UKJPD", "UKCAS"];
  const authHeader = Buffer.from(`${jiraEmail}:${jiraToken}`).toString("base64");
  const { default: https } = await import("https");

  const snapshots = [];

  for (const project of PROJECTS) {
    try {
      const jql = encodeURIComponent(
        `project = ${project} AND (assignee = currentUser() OR reporter = currentUser()) AND updated >= "${date}" ORDER BY updated DESC`
      );
      const options = {
        hostname: "caseware.atlassian.net",
        path: `/rest/api/3/search?jql=${jql}&maxResults=10&fields=summary,status,priority`,
        method: "GET",
        headers: {
          Authorization: `Basic ${authHeader}`,
          Accept: "application/json",
        },
      };

      const response = await new Promise((resolvePromise, rejectPromise) => {
        const req = https.get(options, (res) => {
          let data = "";
          res.on("data", (chunk) => { data += chunk; });
          res.on("end", () => {
            try { resolvePromise(JSON.parse(data)); }
            catch { resolvePromise(null); }
          });
        });
        req.on("error", rejectPromise);
        req.setTimeout(10000, () => req.destroy());
      });

      if (response?.issues?.length > 0) {
        snapshots.push({
          project,
          issues: response.issues.map((i) => ({
            key: i.key,
            summary: i.fields.summary,
            status: i.fields.status?.name ?? "?",
            priority: i.fields.priority?.name ?? "?",
          })),
        });
      }
    } catch (err) {
      console.warn(`[generate-ibp] Jira snapshot for ${project} failed:`, err.message);
    }
  }

  return snapshots.length > 0 ? snapshots : null;
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

  // Attach Jira project snapshots (async, optional — requires JIRA_EMAIL + JIRA_API_TOKEN)
  console.log("[generate-ibp] fetching Jira project snapshots...");
  ctx.jiraProjectSnapshots = await fetchJiraProjectSnapshot(TARGET_DATE);
  if (ctx.jiraProjectSnapshots) {
    console.log(`[generate-ibp] Jira snapshots: ${ctx.jiraProjectSnapshots.map((s) => `${s.project}(${s.issues.length})`).join(", ")}`);
  } else {
    console.log("[generate-ibp] Jira project snapshots skipped (no API credentials)");
  }

  let content;

  if (SKIP_AI || !process.env.ANTHROPIC_API_KEY) {
    content = buildPlainSummary(ctx);
    console.log("[generate-ibp] using plain summary (no AI)");
  } else {
    console.log("[generate-ibp] calling Claude Haiku for narrative...");
    const narrative = await callClaudeHaiku(ctx);
    if (narrative) {
      content = [
        `# IBP — ${ctx.date}`,
        ``,
        `**Total tracked time:** ${ctx.totalTracked}`,
        ``,
        narrative,
        ``,
        `---`,
        `_Generated by generate-ibp.mjs with Claude Haiku at ${new Date().toLocaleTimeString("en-GB")}_`,
      ].join("\n");
    } else {
      content = buildPlainSummary(ctx);
    }
  }

  writeFileSync(OUTPUT_PATH, content);
  console.log(`[generate-ibp] wrote ${OUTPUT_PATH}`);
}

run().catch((err) => {
  console.error("[generate-ibp] fatal:", err);
  process.exit(1);
});
