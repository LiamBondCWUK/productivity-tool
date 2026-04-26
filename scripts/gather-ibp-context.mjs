#!/usr/bin/env node
/**
 * gather-ibp-context.mjs
 * Gathers IBP context for the week using M365 and Atlassian MCP tools via Claude CLI.
 * Writes enriched ibp-context-YYYY-Wnn.json, which generate-ibp.mjs reads at generation time.
 *
 * Usage:
 *   node scripts/gather-ibp-context.mjs [--date=YYYY-MM-DD] [--merge]
 *
 * --merge: merge gathered data into existing ibp-context JSON (preserves hand-curated fields
 *          like nextWeekPriorities; gathered data takes precedence for deduplication)
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const dateArg = process.argv.find((a) => a.startsWith("--date"))?.split("=")[1];
const MERGE = process.argv.includes("--merge");
const TARGET_DATE = dateArg ?? new Date().toISOString().slice(0, 10);

function getISOWeek(dateStr) {
  const d = new Date(dateStr + "T12:00:00Z");
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const year = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 3 - ((firstThursday.getUTCDay() + 6) % 7));
  const weekNum = Math.round((thursday - firstThursday) / (7 * 86400000)) + 1;
  return `${year}-W${String(weekNum).padStart(2, "0")}`;
}

function getWorkWeekDates(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const dow = d.getDay(); // 0=Sun
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((dow + 6) % 7));
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  return {
    weekStart: monday.toISOString().slice(0, 10),
    weekEnd: friday.toISOString().slice(0, 10),
  };
}

function readJson(filePath) {
  try {
    let raw = readFileSync(filePath, "utf8");
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function mergeContexts(existing, gathered) {
  const dedupeBy = (arr, keyFn) => {
    const seen = new Set();
    return arr.filter((item) => {
      const k = typeof keyFn === "function" ? keyFn(item) : item[keyFn];
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  return {
    week: existing.week ?? gathered.week,
    generatedAt: new Date().toISOString(),
    teamsChats: dedupeBy(
      [...(gathered.teamsChats ?? []), ...(existing.teamsChats ?? [])],
      (c) => `${c.date}|${c.with}`,
    ),
    transcriptHighlights: dedupeBy(
      [...(gathered.transcriptHighlights ?? []), ...(existing.transcriptHighlights ?? [])],
      (t) => `${t.date}|${t.meeting}`,
    ),
    standaloneSignals: [...new Set([
      ...(gathered.standaloneSignals ?? []),
      ...(existing.standaloneSignals ?? []),
    ])],
    jiraActivity: dedupeBy(
      [...(gathered.jiraActivity ?? []), ...(existing.jiraActivity ?? [])],
      "key",
    ),
    calendarMeetings: dedupeBy(
      [...(gathered.calendarMeetings ?? []), ...(existing.calendarMeetings ?? [])],
      (m) => `${m.date}|${m.title}`,
    ),
    // Preserve hand-curated nextWeekPriorities from existing if non-empty
    nextWeekPriorities: (existing.nextWeekPriorities?.length > 0)
      ? existing.nextWeekPriorities
      : (gathered.nextWeekPriorities ?? []),
  };
}

function buildGatherPrompt(weekStart, weekEnd, isoWeek) {
  return `You are gathering IBP (Impact, Blockers, Priorities) context for Liam Bond (liam.bond@caseware.com) for the week ${weekStart} to ${weekEnd} (${isoWeek}).

Use the available MCP tools to gather data:

1. Teams chat messages: search for conversations Liam participated in during ${weekStart} to ${weekEnd}. For each conversation extract who he spoke with, the topic, and a 1-2 sentence summary of outcomes.
2. Calendar events: find meetings and events in Liam's calendar during ${weekStart} to ${weekEnd}. Exclude standups, rollovers, and cancelled events.
3. Jira issues: search for issues in UKCAUD, DIST, UKCAS, UKJPD projects that Liam updated or commented on since ${weekStart}.

Then output ONLY a valid JSON object with exactly this structure (no preamble, no commentary, no markdown fences):
{
  "week": "${isoWeek}",
  "generatedAt": "ISO_TIMESTAMP",
  "teamsChats": [
    {"date": "YYYY-MM-DD", "with": "Person Name", "topic": "brief topic", "summary": "1-2 sentence summary of what was discussed and any outcome"}
  ],
  "transcriptHighlights": [
    {"date": "YYYY-MM-DD", "meeting": "meeting name", "attendees": 0, "keyPoints": ["key point 1", "key point 2"]}
  ],
  "standaloneSignals": [
    "One-line signal about a notable delivery, decision, or milestone this week"
  ],
  "jiraActivity": [
    {"key": "PROJ-123", "summary": "issue summary", "status": "status", "updated": "YYYY-MM-DD"}
  ],
  "calendarMeetings": [
    {"date": "YYYY-MM-DD", "title": "meeting title", "duration": "30m", "attendees": 0}
  ],
  "nextWeekPriorities": []
}

Field rules:
- teamsChats: include all 1:1s and notable group conversations for the week
- transcriptHighlights: only for formal meetings with clear outcomes (Craft sessions, reviews, planning sessions, retrospectives)
- standaloneSignals: notable deliveries, skills shipped, people onboarded, key decisions — one clear signal per item
- jiraActivity: all issues Liam touched this week across UKCAUD/DIST/UKCAS/UKJPD
- calendarMeetings: filtered list — exclude standups, rollovers, cancelled events
- nextWeekPriorities: leave as empty array []
- Output ONLY the JSON object — no other text`;
}

async function run() {
  const { weekStart, weekEnd } = getWorkWeekDates(TARGET_DATE);
  const isoWeek = getISOWeek(TARGET_DATE);
  const outputPath = resolve(ROOT, "workspace", "coordinator", `ibp-context-${isoWeek}.json`);

  console.log(`[gather-ibp-context] gathering context for ${isoWeek} (${weekStart}–${weekEnd})`);

  const ALLOWED_TOOLS = [
    "mcp__claude_ai_Microsoft_365__chat_message_search",
    "mcp__claude_ai_Microsoft_365__outlook_calendar_search",
    "mcp__claude_ai_Microsoft_365__outlook_email_search",
    "mcp__claude_ai_Microsoft_365__read_resource",
    "mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql",
    "mcp__claude_ai_Atlassian__getJiraIssue",
    "mcp__claude_ai_Atlassian__atlassianUserInfo",
    "mcp__claude_ai_Atlassian__search",
  ].join(",");

  const gatherPrompt = buildGatherPrompt(weekStart, weekEnd, isoWeek);
  const cliEnv = { ...process.env };
  delete cliEnv.ANTHROPIC_API_KEY;
  delete cliEnv.ANTHROPIC_AUTH_TOKEN;

  const modelArgs = [
    "--print",
    "--model", "claude-haiku-4-5-20251001",
    "--no-session-persistence",
    "--allowedTools", ALLOWED_TOOLS,
  ];

  const attempts = [
    { cmd: "claude", args: modelArgs },
    { cmd: "npx", args: ["-y", "@anthropic-ai/claude-code", ...modelArgs] },
  ];

  let rawOutput = null;
  for (const attempt of attempts) {
    const result = spawnSync(attempt.cmd, attempt.args, {
      input: gatherPrompt,
      cwd: ROOT,
      encoding: "utf8",
      timeout: 240000,
      env: cliEnv,
      windowsHide: true,
      shell: process.platform === "win32",
    });

    if (!result.error && result.status === 0 && result.stdout?.trim()) {
      rawOutput = result.stdout.trim();
      console.log(`[gather-ibp-context] Claude gather succeeded via ${attempt.cmd} (${rawOutput.length} chars)`);
      break;
    }

    const errMsg = result.error?.message || result.stderr?.trim() || "";
    console.warn(
      `[gather-ibp-context] attempt failed (${attempt.cmd}): ${errMsg.slice(0, 200)} | status=${result.status} signal=${result.signal}`,
    );
  }

  if (!rawOutput) {
    console.error("[gather-ibp-context] FATAL: Claude gather unavailable. Ensure 'claude' CLI is on PATH and logged in.");
    process.exit(2);
  }

  // Extract JSON — Claude may wrap output in markdown code fences despite instructions
  let jsonStr = rawOutput;
  const fenceMatch = rawOutput.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();
  const jsonStart = jsonStr.indexOf("{");
  const jsonEnd = jsonStr.lastIndexOf("}");
  if (jsonStart !== -1 && jsonEnd !== -1) jsonStr = jsonStr.slice(jsonStart, jsonEnd + 1);

  let gathered;
  try {
    gathered = JSON.parse(jsonStr);
  } catch (err) {
    console.error(`[gather-ibp-context] Failed to parse JSON output: ${err.message}`);
    console.error(`[gather-ibp-context] Raw output (first 600 chars):\n${rawOutput.slice(0, 600)}`);
    process.exit(3);
  }

  gathered.week = gathered.week ?? isoWeek;
  gathered.generatedAt = new Date().toISOString();
  gathered.teamsChats = gathered.teamsChats ?? [];
  gathered.transcriptHighlights = gathered.transcriptHighlights ?? [];
  gathered.standaloneSignals = gathered.standaloneSignals ?? [];
  gathered.jiraActivity = gathered.jiraActivity ?? [];
  gathered.calendarMeetings = gathered.calendarMeetings ?? [];
  gathered.nextWeekPriorities = gathered.nextWeekPriorities ?? [];

  let final = gathered;
  if (MERGE && existsSync(outputPath)) {
    console.log(`[gather-ibp-context] merging with existing ${outputPath}`);
    const existing = readJson(outputPath);
    if (existing) final = mergeContexts(existing, gathered);
  }

  writeFileSync(outputPath, JSON.stringify(final, null, 2), "utf8");
  console.log(
    `[gather-ibp-context] wrote ${outputPath} (chats: ${final.teamsChats.length}, signals: ${final.standaloneSignals.length}, jira: ${final.jiraActivity.length}, calendar: ${final.calendarMeetings.length})`,
  );
}

run().catch((err) => {
  console.error("[gather-ibp-context] fatal:", err);
  process.exit(1);
});
