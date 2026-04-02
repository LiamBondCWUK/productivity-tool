#!/usr/bin/env node
/**
 * extract-claude-sessions.mjs
 * Parses ~/.claude/projects/**\/*.jsonl for sessions from today.
 * Extracts: sessionId, project dir (cwd), start/end timestamps, duration,
 * and a short summary (first user message).
 *
 * Writes: workspace/coordinator/claude-sessions-today.json
 *
 * Usage: node scripts/extract-claude-sessions.mjs [--date YYYY-MM-DD]
 */

import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLAUDE_PROJECTS_DIR = resolve(
  process.env.USERPROFILE || process.env.HOME || "C:/Users/liam.bond",
  ".claude/projects"
);
const OUTPUT_PATH = resolve(
  __dirname,
  "../workspace/coordinator/claude-sessions-today.json"
);

// Allow --date YYYY-MM-DD override for testing
const dateArg = process.argv.find((a) => a.startsWith("--date"))
  ?.split("=")[1];
const TARGET_DATE = dateArg ?? new Date().toISOString().slice(0, 10);

console.log(`[extract-claude-sessions] scanning sessions for ${TARGET_DATE}`);
console.log(`[extract-claude-sessions] projects dir: ${CLAUDE_PROJECTS_DIR}`);

// --- Helpers ----------------------------------------------------------------

function isToday(isoString) {
  return isoString?.startsWith(TARGET_DATE);
}

/**
 * Derive a human-readable project label from the directory name.
 * e.g. "C--Users-liam-bond-Documents-Productivity-Tool" → "Productivity Tool"
 */
function labelFromDirName(dirName) {
  // Strip leading path segments up to Documents
  const idx = dirName.indexOf("-Documents-");
  if (idx !== -1) {
    return dirName
      .slice(idx + "-Documents-".length)
      .replace(/-/g, " ")
      .trim();
  }
  // For non-Documents paths, just tidy the name
  return dirName.replace(/^C--Users-[^-]+-/, "").replace(/-/g, " ").trim();
}

/**
 * Extract the first user message content as a plain string (truncated).
 */
function extractFirstUserMessage(lines) {
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.type !== "user") continue;
      const content = entry.message?.content;
      if (typeof content === "string" && content.trim()) {
        return content.trim().slice(0, 120);
      }
      if (Array.isArray(content)) {
        const textBlock = content.find((b) => b.type === "text" && b.text?.trim());
        if (textBlock) return textBlock.text.trim().slice(0, 120);
      }
    } catch {
      // skip malformed lines
    }
  }
  return null;
}

/**
 * Get the working directory from the first entry that has one.
 */
function extractCwd(lines) {
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.cwd) return entry.cwd;
    } catch {
      // skip
    }
  }
  return null;
}

// --- Main -------------------------------------------------------------------

function processJsonlFile(filePath, dirLabel) {
  let raw;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return null;
  }

  const lines = raw.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return null;

  // Collect timestamps from today
  const todayTimestamps = [];
  let sessionId = null;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (!sessionId && entry.sessionId) sessionId = entry.sessionId;
      if (entry.timestamp && isToday(entry.timestamp)) {
        todayTimestamps.push(entry.timestamp);
      }
    } catch {
      // skip
    }
  }

  if (todayTimestamps.length === 0) return null;

  todayTimestamps.sort();
  const start = todayTimestamps[0];
  const end = todayTimestamps[todayTimestamps.length - 1];
  const durationMin = Math.max(
    1,
    Math.round((new Date(end) - new Date(start)) / 60_000)
  );

  const cwd = extractCwd(lines);
  const firstMessage = extractFirstUserMessage(lines);

  return {
    sessionId: sessionId ?? filePath.split("/").pop().replace(".jsonl", ""),
    source: "claude",
    projectDir: dirLabel,
    cwd: cwd ?? null,
    start,
    end,
    durationMin,
    firstMessage,
  };
}

function run() {
  if (!existsSync(CLAUDE_PROJECTS_DIR)) {
    console.error(`[extract-claude-sessions] projects dir not found: ${CLAUDE_PROJECTS_DIR}`);
    writeFileSync(OUTPUT_PATH, JSON.stringify([], null, 2));
    return;
  }

  const sessions = [];

  for (const projectDir of readdirSync(CLAUDE_PROJECTS_DIR)) {
    const projectPath = join(CLAUDE_PROJECTS_DIR, projectDir);
    let stat;
    try {
      stat = statSync(projectPath);
    } catch {
      continue;
    }

    if (!stat.isDirectory()) continue;

    const label = labelFromDirName(projectDir);

    for (const file of readdirSync(projectPath)) {
      if (!file.endsWith(".jsonl")) continue;
      const session = processJsonlFile(join(projectPath, file), label);
      if (session) sessions.push(session);
    }
  }

  // Sort by start time
  sessions.sort((a, b) => a.start.localeCompare(b.start));

  writeFileSync(OUTPUT_PATH, JSON.stringify(sessions, null, 2));
  console.log(
    `[extract-claude-sessions] found ${sessions.length} session(s) for ${TARGET_DATE}`
  );
  if (sessions.length > 0) {
    for (const s of sessions) {
      console.log(`  ${s.start.slice(11, 16)} – ${s.end.slice(11, 16)} (${s.durationMin}m) ${s.projectDir}`);
    }
  }
}

run();
