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
 *   node scripts/generate-ibp.mjs [--date YYYY-MM-DD] [--skip-ai]
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync, spawnSync } from "child_process";

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

function cleanText(input, maxLen = 240) {
  if (!input) return "";
  const normalized = String(input)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return normalized.slice(0, maxLen);
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
    .slice(0, 8)
    .map((s) => {
      const label = cleanText(s.label, 80) || "(session)";
      const detail = cleanText(s.detail, 80);
      return `  - ${label} (${fmtMin(s.durationMin)})${detail ? ": " + detail : ""}`;
    })
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
      return `  - [${timeStr}] ${cleanText(m.from, 40)}: ${cleanText(m.preview ?? "(no preview)", 80)}`;
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
      return `  - [${timeStr}] From: ${cleanText(e.from, 50)} — ${cleanText(e.subject, 100)}`;
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

// --- Claude narrative -------------------------------------------------------

function buildNarrativePrompt(ctx) {
  const topItems = (block, limit = 3) => {
    if (!block) return [];
    return String(block)
      .split("\n")
      .map((line) => cleanText(line.replace(/^\s*[-*]\s*/, ""), 110))
      .filter(Boolean)
      .slice(0, limit);
  };

  const jiraProjectTop = (ctx.jiraProjectSnapshots ?? [])
    .flatMap((s) => s.issues.slice(0, 2).map((i) => `${i.key} [${i.status}] ${cleanText(i.summary, 70)}`))
    .slice(0, 4);

  return `Write a concise markdown IBP summary for ${ctx.date}.

Facts:
- Total tracked: ${ctx.totalTracked}
- Planned focus: ${fmtMin(ctx.plannedTodayMinutes)}${ctx.actualToPlannedPct !== null ? ` (${ctx.actualToPlannedPct}% execution)` : ""}
- Meetings today: ${ctx.meetingCount} (${fmtMin(ctx.meetingsTotalMin)})
- Teams messages: ${ctx.teamMessageCount}
- Flagged emails: ${ctx.flaggedEmailCount}
- Jira inbox items: ${ctx.jiraInboxCount}

Top activity items:
${topItems(ctx.claudeSummary, 4).map((x) => `- ${x}`).join("\n") || "- none"}

Top inbox items:
${ctx.inboxItems.slice(0, 4).map((i) => `- ${cleanText(i, 110)}`).join("\n") || "- none"}

Top jira items:
${topItems(ctx.jiraInboxSummary, 4).map((x) => `- ${x}`).join("\n") || "- none"}

Top jira project updates:
${jiraProjectTop.map((x) => `- ${x}`).join("\n") || "- none"}

Output 120-180 words with sections:
1) What I accomplished today (3-5 bullets)
2) Time breakdown (short paragraph)
3) Open threads (2-3 bullets)
4) Tomorrow's priority (1 bullet)

Keep it factual and actionable.`;
}

function callClaudeCliOAuth(ctx) {
  const prompt = buildNarrativePrompt(ctx);

  const attempts = [
    // Most reliable path for larger prompts: pass prompt via stdin.
    { cmd: "claude", args: ["--print"], useStdin: true },
    // Fallback: inline prompt mode.
    { cmd: "claude", args: ["-p", prompt, "--output-format", "text"], useStdin: false },
    // Final fallback if global CLI isn't on PATH.
    { cmd: "npx", args: ["-y", "@anthropic-ai/claude-code", "--print"], useStdin: true },
  ];

  for (const attempt of attempts) {
    const cmd = process.platform === "win32" && attempt.cmd === "npx" ? "npx.cmd" : attempt.cmd;
    const result = spawnSync(cmd, attempt.args, {
      input: attempt.useStdin ? prompt : undefined,
      cwd: ROOT,
      encoding: "utf8",
      timeout: 60000,
      env: process.env,
      windowsHide: true,
    });

    if (!result.error && result.status === 0 && result.stdout?.trim()) {
      return result.stdout.trim();
    }

    const errMsg = result.error?.message || result.stderr?.trim();
    if (errMsg) {
      const mode = attempt.useStdin ? "stdin" : "inline";
      console.warn(`[generate-ibp] OAuth attempt failed (${attempt.cmd}, ${mode}): ${errMsg.slice(0, 200)}`);
    }
  }

  console.log("[generate-ibp] OAuth narrative unavailable (run 'claude login')");
  return null;
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

  if (SKIP_AI) {
    content = buildPlainSummary(ctx);
    console.log("[generate-ibp] using plain summary (no AI)");
  } else {
    console.log("[generate-ibp] calling Claude via OAuth for narrative...");
    const narrative = callClaudeCliOAuth(ctx);

    if (narrative) {
      content = [
        `# IBP — ${ctx.date}`,
        ``,
        `**Total tracked time:** ${ctx.totalTracked}`,
        ``,
        narrative,
        ``,
        `---`,
        `_Generated by generate-ibp.mjs with Claude narrative at ${new Date().toLocaleTimeString("en-GB")}_`,
      ].join("\n");
    } else {
      console.log("[generate-ibp] falling back to plain summary because OAuth narrative is unavailable");
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
