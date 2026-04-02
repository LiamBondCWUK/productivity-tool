#!/usr/bin/env node
/**
 * activity-tracker.mjs
 * pm2 daemon — polls the active foreground window title every 30s via PowerShell,
 * infers the current task, and appends sessions to activity-log.json.
 *
 * Run via: pm2 start ecosystem.config.js
 * Or directly: node scripts/activity-tracker.mjs
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ACTIVITY_LOG = resolve(__dirname, "../workspace/coordinator/activity-log.json");
const POLL_INTERVAL_MS = 30_000; // 30 seconds

// --- PowerShell command to get the active window title ---------------------
const PS_GET_TITLE = `
(Get-Process | Where-Object {$_.MainWindowTitle -ne ''} | Sort-Object CPU -Descending | Select-Object -First 1).MainWindowTitle
`.trim();

function getActiveWindowTitle() {
  try {
    return execSync(`powershell -NoProfile -Command "${PS_GET_TITLE}"`, {
      timeout: 5000,
    })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

// --- Task inference from window title -------------------------------------
const JIRA_KEY_RE = /\b([A-Z]{2,10}-\d+)\b/;

function inferTask(title) {
  if (!title) return null;

  const jiraMatch = title.match(JIRA_KEY_RE);
  if (jiraMatch) return jiraMatch[1];

  const lower = title.toLowerCase();
  if (lower.includes("jira") || lower.includes("atlassian")) return "jira-browse";
  if (lower.includes("teams") || lower.includes("microsoft teams")) return "teams";
  if (lower.includes("outlook")) return "email";
  if (lower.includes("claude")) return "ai-coding";
  if (lower.includes("vs code") || lower.includes("visual studio code")) return "dev";
  if (lower.includes("chrome") || lower.includes("edge") || lower.includes("firefox")) return "browser";

  return null;
}

// --- Session tracking -------------------------------------------------------
let currentSession = null; // { start, windowTitle, inferredTask }

function readLog() {
  try {
    const raw = readFileSync(ACTIVITY_LOG, "utf8").trim();
    return JSON.parse(raw || "[]");
  } catch {
    return [];
  }
}

function flushSession(endTime) {
  if (!currentSession) return;
  const durationMin = Math.round(
    (endTime - new Date(currentSession.start)) / 60_000
  );
  if (durationMin < 1) return; // ignore sub-minute blips

  const log = readLog();
  log.push({
    start: currentSession.start,
    end: endTime.toISOString(),
    windowTitle: currentSession.windowTitle,
    inferredTask: currentSession.inferredTask,
    durationMin,
  });

  writeFileSync(ACTIVITY_LOG, JSON.stringify(log, null, 2));
  console.log(
    `[activity-tracker] flushed session: ${currentSession.inferredTask ?? "unknown"} (${durationMin}m) — "${currentSession.windowTitle}"`
  );
}

// --- Main polling loop ------------------------------------------------------
function poll() {
  const title = getActiveWindowTitle();
  const inferredTask = inferTask(title);
  const now = new Date();

  // Same title — extend current session
  if (currentSession && currentSession.windowTitle === title) {
    return;
  }

  // Title changed — flush previous session, start new one
  flushSession(now);

  if (title) {
    currentSession = {
      start: now.toISOString(),
      windowTitle: title,
      inferredTask,
    };
    console.log(
      `[activity-tracker] new session: ${inferredTask ?? "unknown"} — "${title}"`
    );
  } else {
    currentSession = null;
  }
}

// Flush on exit
process.on("SIGINT", () => {
  flushSession(new Date());
  process.exit(0);
});
process.on("SIGTERM", () => {
  flushSession(new Date());
  process.exit(0);
});

console.log(`[activity-tracker] started — polling every ${POLL_INTERVAL_MS / 1000}s`);
console.log(`[activity-tracker] log: ${ACTIVITY_LOG}`);

poll(); // immediate first poll
setInterval(poll, POLL_INTERVAL_MS);
