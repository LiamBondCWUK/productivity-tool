#!/usr/bin/env node
/**
 * generate-day-plan.mjs
 * Reads calendar + priority inbox + overnight suggestions from dashboard-data.json,
 * calls Claude (via CLI, uses existing OAuth login) to produce a prioritised day plan,
 * and writes it back.
 *
 * Usage:
 *   node scripts/generate-day-plan.mjs
 *   node scripts/generate-day-plan.mjs --dry-run   (prints plan, no write)
 */

import { spawnSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = resolve(__dirname, "../workspace/coordinator/dashboard-data.json");
const DRY_RUN = process.argv.includes("--dry-run");

function readData() {
  return JSON.parse(readFileSync(DATA_FILE, "utf8"));
}

function formatCalendar(events) {
  if (!events?.length) return "No meetings today.";
  return events
    .map((e) => {
      const time = e.startTime ?? "?";
      return `  ${time} — ${e.title}${e.duration ? ` (${e.duration}min)` : ""}`;
    })
    .join("\n");
}

function formatInbox(inbox) {
  const items = [
    ...(inbox?.urgent ?? []),
    ...(inbox?.today ?? []),
    ...(inbox?.upcoming ?? []),
  ];
  if (!items.length) return "No items in priority inbox.";
  return items
    .slice(0, 10)
    .map((item) => {
      const label = item.key ?? item.title ?? "?";
      const priority = item.priority ?? item.type ?? "";
      return `  [${priority}] ${label}: ${item.summary ?? ""}`;
    })
    .join("\n");
}

function formatSuggestions(overnightAnalysis) {
  const projects = overnightAnalysis?.projects ?? {};
  const suggestions = [];
  for (const [projectName, analysis] of Object.entries(projects)) {
    for (const s of analysis.suggestions ?? []) {
      if (s.priority === "HIGH" || s.priority === "CRITICAL") {
        suggestions.push(`  [${s.priority}] ${projectName}: ${s.message}`);
      }
    }
  }
  if (!suggestions.length) return "No high-priority suggestions from overnight analysis.";
  return suggestions.slice(0, 5).join("\n");
}

async function generateDayPlan() {
  const data = readData();
  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const prompt = `You are a personal productivity assistant. Generate a prioritised day plan for today.

## Context

**Current time:** ${timeStr} on ${dateStr}

**Calendar:**
${formatCalendar(data.calendarToday)}

**Priority inbox (work items needing attention):**
${formatInbox(data.priorityInbox)}

**Overnight AI suggestions (high priority only):**
${formatSuggestions(data.overnightAnalysis)}

## Instructions

Return ONLY valid JSON — no prose, no markdown fences, no commentary.
Return an array of time blocks from now until end of day (17:30), for example:

[
  {
    "time": "09:30",
    "duration": 90,
    "task": "UKCAUD-789",
    "type": "focus",
    "label": "Fix Azure B2C login bug",
    "rationale": "Highest priority ticket, flagged as urgent in inbox"
  }
]

Rules:
- type must be one of: "focus" | "meeting" | "admin" | "buffer"
- Include existing calendar meetings as "meeting" blocks — do not invent meetings
- Add focus blocks for top 2-3 inbox items
- Add a 15-minute buffer after every 90-minute focus block
- Add an admin block around 16:30 for email/messages
- Do not schedule anything before ${timeStr}
- Keep focus blocks to 90 minutes max
- Label must be a short (< 50 chars) human-readable description
- rationale must explain why this block is prioritised now (1 sentence)`;

  // Use claude CLI with existing OAuth login — no API key required
  const result = spawnSync(
    "claude",
    ["-p", prompt, "--model", "claude-haiku-4-5-20251001"],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
  );

  if (result.error || result.status !== 0) {
    throw new Error(result.stderr || result.error?.message || "claude CLI failed");
  }

  const rawText = result.stdout.trim();

  let blocks;
  try {
    // Strip any accidental markdown fences
    const cleaned = rawText.replace(/^```[a-z]*\n?/m, "").replace(/```$/m, "").trim();
    blocks = JSON.parse(cleaned);
    if (!Array.isArray(blocks)) throw new Error("expected array");
  } catch (err) {
    console.error("[generate-day-plan] Failed to parse Claude response:", err.message);
    console.error("Raw response:", rawText);
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log("[generate-day-plan] DRY RUN — day plan:");
    console.log(JSON.stringify(blocks, null, 2));
    return;
  }

  // Write back to dashboard-data.json
  data.dayPlan = {
    generatedAt: now.toISOString(),
    accepted: false,
    blocks,
  };
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  console.log(`[generate-day-plan] Written ${blocks.length} blocks to dashboard-data.json`);
}

generateDayPlan().catch((err) => {
  console.error("[generate-day-plan] Error:", err.message);
  process.exit(1);
});
