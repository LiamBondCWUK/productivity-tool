#!/usr/bin/env node
/**
 * merge-activity-log.mjs
 * Merges three activity data sources into one unified daily log:
 *   1. Window polling  → workspace/coordinator/activity-log.json
 *   2. Claude sessions → runs extract-claude-sessions.mjs, then reads output
 *   3. Jira worklog   → Jira REST API (graceful fail if no credentials)
 *
 * Writes: workspace/coordinator/daily-unified-log.json
 *
 * Usage:
 *   node scripts/merge-activity-log.mjs [--date YYYY-MM-DD]
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Load .env if present so scheduled/manual runs have Jira credentials.
try {
  const dotenvPath = resolve(ROOT, ".env");
  if (existsSync(dotenvPath)) {
    const envContent = readFileSync(dotenvPath, "utf8");
    envContent.split("\n").forEach((line) => {
      const [key, ...valueParts] = line.trim().split("=");
      if (key && !key.startsWith("#") && !process.env[key]) {
        process.env[key] = valueParts.join("=").trim();
      }
    });
  }
} catch {
  // Ignore .env parsing failures and continue with process env.
}

const ACTIVITY_LOG_PATH = resolve(ROOT, "workspace/coordinator/activity-log.json");
const CLAUDE_SESSIONS_PATH = resolve(ROOT, "workspace/coordinator/claude-sessions-today.json");
const VSCODE_CHAT_PATH = resolve(ROOT, "workspace/coordinator/vscode-chat-today.json");
const DASHBOARD_DATA_PATH = resolve(ROOT, "workspace/coordinator/dashboard-data.json");
const dateArg = process.argv.find((a) => a.startsWith("--date"))?.split("=")[1];
const TARGET_DATE = dateArg ?? new Date().toISOString().slice(0, 10);
const OUTPUT_PATH = resolve(ROOT, "workspace/coordinator/daily-unified-log.json");
const OUTPUT_DATED_PATH = resolve(ROOT, `workspace/coordinator/daily-unified-log-${TARGET_DATE}.json`);

console.log(`[merge-activity-log] merging sources for ${TARGET_DATE}`);

// --- Helpers ----------------------------------------------------------------

function readJson(filePath, fallback) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function isTargetDate(isoString) {
  return isoString?.startsWith(TARGET_DATE);
}

// --- Source 1: Window polling sessions -------------------------------------

function loadWindowSessions() {
  const all = readJson(ACTIVITY_LOG_PATH, []);
  const todaysSessions = all.filter(
    (s) => isTargetDate(s.start) || isTargetDate(s.end)
  );
  return todaysSessions.map((s) => ({
    source: "window",
    start: s.start,
    end: s.end,
    durationMin: s.durationMin ?? 0,
    label: s.inferredTask ?? "unknown",
    detail: s.windowTitle ?? "",
  }));
}

// --- Source 2: Claude sessions ---------------------------------------------

function loadClaudeSessions() {
  // Re-run extract-claude-sessions to get fresh data
  try {
    const dateFlag = dateArg ? `--date=${TARGET_DATE}` : "";
    execSync(
      `node "${resolve(__dirname, "extract-claude-sessions.mjs")}" ${dateFlag}`,
      { stdio: "inherit" }
    );
  } catch (err) {
    console.warn("[merge-activity-log] extract-claude-sessions failed:", err.message);
  }

  const sessions = readJson(CLAUDE_SESSIONS_PATH, []);
  return sessions.map((s) => ({
    source: "claude",
    start: s.start,
    end: s.end,
    durationMin: s.durationMin ?? 0,
    label: s.projectDir ?? "claude-session",
    detail: s.firstMessage ?? "",
    cwd: s.cwd ?? null,
    sessionId: s.sessionId,
  }));
}

// --- Source 3: VS Code Copilot Chat sessions ------------------------------

function loadVsCodeChatSessions() {
  // Re-run extract-vscode-chat to get fresh data
  try {
    const dateFlag = dateArg ? `--date=${TARGET_DATE}` : "";
    execSync(
      `node "${resolve(__dirname, "extract-vscode-chat.mjs")}" ${dateFlag}`,
      { stdio: "inherit" }
    );
  } catch (err) {
    console.warn("[merge-activity-log] extract-vscode-chat failed:", err.message);
  }

  const sessions = readJson(VSCODE_CHAT_PATH, []);
  return sessions.map((s) => ({
    source: "vscode-chat",
    start: s.start,
    end: s.end,
    durationMin: s.durationMin ?? 0,
    label: "VS Code Copilot Chat",
    detail: s.firstMessage ?? "",
    sessionId: s.sessionId,
    messageCount: s.messageCount ?? 0,
  }));
}

// --- Source 4: Jira worklog ------------------------------------------------

async function loadJiraWorklog() {
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  const domain = process.env.JIRA_DOMAIN ?? "caseware.atlassian.net";

  if (!email || !token) {
    console.log("[merge-activity-log] Jira credentials not set — skipping worklog");
    return [];
  }

  // Get issues the user updated today via the search API
  const jql = encodeURIComponent(
    `worklogAuthor = currentUser() AND worklogDate = "${TARGET_DATE}" ORDER BY updated DESC`
  );
  const url = `https://${domain}/rest/api/3/search/jql?jql=${jql}&fields=summary,worklog&maxResults=20`;
  const auth = Buffer.from(`${email}:${token}`).toString("base64");

  let response;
  try {
    const { default: https } = await import("https");
    response = await new Promise((resolve, reject) => {
      const req = https.request(url, {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
      }, (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => resolve({ status: res.statusCode, body }));
      });
      req.on("error", reject);
      req.setTimeout(8000, () => { req.destroy(new Error("timeout")); });
      req.end();
    });
  } catch (err) {
    console.warn("[merge-activity-log] Jira worklog fetch failed:", err.message);
    return [];
  }

  if (response.status !== 200) {
    console.warn(`[merge-activity-log] Jira returned ${response.status} — skipping worklog`);
    return [];
  }

  let data;
  try {
    data = JSON.parse(response.body);
  } catch {
    return [];
  }

  const entries = [];
  for (const issue of data.issues ?? []) {
    const key = issue.key;
    const summary = issue.fields?.summary ?? "";
    const worklogs = issue.fields?.worklog?.worklogs ?? [];

    for (const wl of worklogs) {
      if (!isTargetDate(wl.started)) continue;
      const durationMin = Math.round((wl.timeSpentSeconds ?? 0) / 60);
      if (durationMin === 0) continue;

      const start = wl.started;
      const end = new Date(new Date(start).getTime() + durationMin * 60_000).toISOString();

      entries.push({
        source: "jira-worklog",
        start,
        end,
        durationMin,
        label: key,
        detail: summary,
      });
    }
  }

  console.log(`[merge-activity-log] Jira worklog: ${entries.length} entr${entries.length === 1 ? "y" : "ies"}`);
  return entries;
}

// --- Summarise by label (for IBP context) ----------------------------------

function summariseByLabel(entries) {
  const map = {};
  for (const entry of entries) {
    const key = entry.label;
    if (!map[key]) {
      map[key] = { label: key, sources: new Set(), totalMin: 0, firstSeen: entry.start };
    }
    map[key].totalMin += entry.durationMin;
    map[key].sources.add(entry.source);
    if (entry.start < map[key].firstSeen) map[key].firstSeen = entry.start;
  }

  return Object.values(map)
    .map((s) => ({ ...s, sources: Array.from(s.sources) }))
    .sort((a, b) => b.totalMin - a.totalMin);
}

// --- Main ------------------------------------------------------------------

async function run() {
  const windowSessions = loadWindowSessions();
  const claudeSessions = loadClaudeSessions();
  const vscodeChatSessions = loadVsCodeChatSessions();
  const jiraSessions = await loadJiraWorklog();

  const allEntries = [...windowSessions, ...claudeSessions, ...vscodeChatSessions, ...jiraSessions];
  allEntries.sort((a, b) => a.start.localeCompare(b.start));

  const totalMinAll = allEntries.reduce((acc, e) => acc + (e.durationMin ?? 0), 0);
  const summary = summariseByLabel(allEntries);

  const unifiedLog = {
    date: TARGET_DATE,
    generatedAt: new Date().toISOString(),
    totalMinutes: totalMinAll,
    sourceCounts: {
      window: windowSessions.length,
      claude: claudeSessions.length,
      vscodeChat: vscodeChatSessions.length,
      jiraWorklog: jiraSessions.length,
    },
    summary,
    entries: allEntries,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(unifiedLog, null, 2));
  writeFileSync(OUTPUT_DATED_PATH, JSON.stringify(unifiedLog, null, 2));

  console.log(`[merge-activity-log] wrote ${OUTPUT_PATH}`);
  console.log(`[merge-activity-log] wrote ${OUTPUT_DATED_PATH}`);
  console.log(`[merge-activity-log] total tracked: ${totalMinAll} minutes across ${allEntries.length} entries`);
  if (summary.length > 0) {
    console.log("[merge-activity-log] top activities:");
    for (const item of summary.slice(0, 5)) {
      console.log(`  ${item.label.padEnd(20)} ${item.totalMin}m  [${item.sources.join(",")}]`);
    }
  }
}

run().catch((err) => {
  console.error("[merge-activity-log] fatal:", err);
  process.exit(1);
});
