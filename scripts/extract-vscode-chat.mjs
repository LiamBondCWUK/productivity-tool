#!/usr/bin/env node
/**
 * extract-vscode-chat.mjs
 *
 * Scans VS Code Copilot Chat transcript JSONL files and extracts session
 * summaries for a given date. Writes output to:
 *   workspace/coordinator/vscode-chat-today.json
 *
 * Usage:
 *   node extract-vscode-chat.mjs [--date=YYYY-MM-DD]
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { resolve, join } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { execSync } from "child_process";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");

const dateArg = process.argv.find((a) => a.startsWith("--date="));
const TARGET_DATE = dateArg ? dateArg.slice(7) : new Date().toISOString().slice(0, 10);
const OUTPUT_PATH = resolve(ROOT, "workspace/coordinator/vscode-chat-today.json");

// VS Code workspace storage base — support one or more workspace hashes
const STORAGE_BASE = resolve(
  process.env.APPDATA ?? "C:/Users/" + (process.env.USERNAME ?? "liam.bond") + "/AppData/Roaming",
  "Code/User/workspaceStorage"
);

function findTranscriptDirs() {
  const dirs = [];
  if (!existsSync(STORAGE_BASE)) return dirs;
  for (const hash of readdirSync(STORAGE_BASE)) {
    const transcriptsDir = join(STORAGE_BASE, hash, "GitHub.copilot-chat", "transcripts");
    if (existsSync(transcriptsDir)) dirs.push(transcriptsDir);
  }
  return dirs;
}

function isTargetDate(isoString) {
  return isoString && isoString.startsWith(TARGET_DATE);
}

function parseTranscriptFile(filePath) {
  let raw;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return null;
  }

  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return null;

  let sessionId = null;
  let startTime = null;
  const userMessages = [];

  for (const line of lines) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }

    if (record.type === "session.start") {
      sessionId = record.data?.sessionId ?? record.id;
      startTime = record.data?.startTime ?? record.timestamp;
    } else if (record.type === "user.message") {
      const content = record.data?.content ?? "";
      const ts = record.timestamp;
      if (content.trim().length > 0 && ts) {
        userMessages.push({ content: content.trim(), timestamp: ts });
      }
    }
  }

  if (!startTime) return null;

  // Filter to messages on the target date
  const targetMessages = userMessages.filter((m) => isTargetDate(m.timestamp));
  const sessionStartsOnTarget = isTargetDate(startTime);

  // Session is relevant if it started on target date OR has messages on target date
  if (!sessionStartsOnTarget && targetMessages.length === 0) return null;

  const firstMessage = targetMessages[0]?.content ?? userMessages[0]?.content ?? "";
  const messageCount = targetMessages.length;

  // Duration: spread between first and last target-date message, capped at 60 min per session
  // Scales with message count: messages * 2.5 min, capped at 60 min
  let durationMin = 0;
  if (targetMessages.length >= 2) {
    const first = new Date(targetMessages[0].timestamp);
    const last = new Date(targetMessages[targetMessages.length - 1].timestamp);
    const spreadMin = Math.round((last - first) / 60_000);
    // Use message-count estimate if spread is very long (cross-midnight sessions)
    const msgEstimate = Math.round(targetMessages.length * 2.5);
    durationMin = Math.min(60, Math.min(spreadMin > 120 ? msgEstimate : spreadMin, msgEstimate + 15));
  } else if (targetMessages.length === 1) {
    durationMin = 5; // single-message session: estimate 5 min
  } else if (sessionStartsOnTarget && userMessages.length > 0) {
    durationMin = Math.min(30, Math.round(userMessages.length * 2));
  }
  if (durationMin < 1 && messageCount > 0) durationMin = 2;

  // Use first target-date message time as effective start
  const effectiveStart = targetMessages[0]?.timestamp ?? startTime;
  const effectiveEnd = targetMessages.length > 0
    ? targetMessages[targetMessages.length - 1].timestamp
    : effectiveStart;

  return {
    sessionId,
    start: effectiveStart,
    end: effectiveEnd,
    durationMin,
    messageCount,
    firstMessage,
    allUserMessages: targetMessages.slice(0, 5).map((m) => m.content),
  };
}

function run() {
  const dirs = findTranscriptDirs();
  if (dirs.length === 0) {
    console.log("[extract-vscode-chat] no transcript directories found");
    writeFileSync(OUTPUT_PATH, JSON.stringify([], null, 2));
    return;
  }

  const sessions = [];
  for (const dir of dirs) {
    let files;
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }

    for (const file of files) {
      const session = parseTranscriptFile(join(dir, file));
      if (session) sessions.push(session);
    }
  }

  sessions.sort((a, b) => a.start.localeCompare(b.start));
  console.log(`[extract-vscode-chat] found ${sessions.length} sessions for ${TARGET_DATE}`);

  writeFileSync(OUTPUT_PATH, JSON.stringify(sessions, null, 2));
  console.log(`[extract-vscode-chat] wrote ${OUTPUT_PATH}`);
}

run();
