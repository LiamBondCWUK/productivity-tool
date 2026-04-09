/**
 * sync-feedback.mjs
 *
 * Pulls new feedback from the UKCAUD Tracker feedback API and creates
 * corresponding issues in vibe-kanban. Deduplicates via synced-feedback-ids.json.
 *
 * Usage:
 *   node scripts/sync-feedback.mjs
 *   npm run sync-feedback
 *
 * Requires:
 *   - FEEDBACK_API_URL env var pointing to deployed UKCAUD Tracker Replit
 *   - FEEDBACK_SECRET env var matching the tracker's FEEDBACK_SECRET
 *   - workspace/config/vibe-kanban.json with projectId + defaultStatusId populated
 *     (run `npm run vibe-kanban:discover` once after first vibe-kanban launch)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createKanbanIssue } from "./create-kanban-issue.mjs";

const __filename = fileURLToPath(import.meta.url);
const projectRoot = join(dirname(__filename), "..");

const SYNCED_IDS_FILE = join(projectRoot, "workspace/coordinator/synced-feedback-ids.json");
const FEEDBACK_API_URL = process.env.FEEDBACK_API_URL || "https://REPLACE-WITH-UKCAUD-TRACKER-REPL.replit.app";
const FEEDBACK_SECRET = process.env.FEEDBACK_SECRET || "local-dev-secret";

// ── Synced IDs tracker ────────────────────────────────────────────────────────

function loadSyncedIds() {
  if (!existsSync(SYNCED_IDS_FILE)) return new Set();
  try {
    const data = JSON.parse(readFileSync(SYNCED_IDS_FILE, "utf8"));
    return new Set(Array.isArray(data) ? data : []);
  } catch {
    return new Set();
  }
}

function saveSyncedIds(ids) {
  mkdirSync(dirname(SYNCED_IDS_FILE), { recursive: true });
  writeFileSync(SYNCED_IDS_FILE, JSON.stringify([...ids], null, 2), "utf8");
}

// ── Fetch feedback from UKCAUD Tracker ───────────────────────────────────────

async function fetchFeedback() {
  const response = await fetch(`${FEEDBACK_API_URL}/api/feedback`, {
    headers: { "x-feedback-key": FEEDBACK_SECRET },
  });
  if (!response.ok) {
    throw new Error(`Feedback API returned ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

// ── Build vibe-kanban issue body from triage ──────────────────────────────────

function buildIssueBody(entry) {
  const { triage, raw, assets } = entry;
  const lines = [
    `**Type:** ${triage.type}`,
    `**Tool:** ${raw.tool || "unknown"}`,
    `**Page:** ${raw.page || raw.url || "unknown"}`,
    `**Rating:** ${raw.rating ? raw.rating + "/5" : "not rated"}`,
    `**Submitted:** ${entry.timestamp}`,
    "",
    `**User goal:** ${triage.userGoal || "(not specified)"}`,
    `**Issue:** ${triage.issue || "(not specified)"}`,
  ];

  if (triage.recommendation) {
    lines.push(`**Recommendation:** ${triage.recommendation}`);
  }

  if (triage.reproSteps && triage.reproSteps.length > 0) {
    lines.push("", "**Repro steps:**");
    triage.reproSteps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
  }

  if (triage.priorityReason) {
    lines.push("", `**Priority reason:** ${triage.priorityReason}`);
  }

  if (raw.transcript) {
    lines.push("", "**User transcript:**", "```", raw.transcript, "```");
  }

  if (assets?.screenshot || assets?.recording) {
    lines.push("", "**Session capture:**");
    if (assets.screenshot) lines.push(`- [Screenshot](${FEEDBACK_API_URL}${assets.screenshot})`);
    if (assets.recording) lines.push(`- [Screen recording](${FEEDBACK_API_URL}${assets.recording})`);
    if (assets.transcript) lines.push(`- [Written steps](${FEEDBACK_API_URL}${assets.transcript})`);
  }

  lines.push(
    "",
    "---",
    "### Claude Prompt (copy and paste to action)",
    "```",
    triage.claudePrompt,
    "```"
  );

  return lines.join("\n");
}

// ── Main sync loop ────────────────────────────────────────────────────────────

async function syncFeedback() {
  console.log("Fetching feedback from", FEEDBACK_API_URL);
  const allFeedback = await fetchFeedback();
  console.log(`Found ${allFeedback.length} total feedback entries`);

  const syncedIds = loadSyncedIds();
  const newEntries = allFeedback.filter((entry) => !syncedIds.has(entry.id));

  if (newEntries.length === 0) {
    console.log("No new feedback to sync.");
    return;
  }

  console.log(`Syncing ${newEntries.length} new entries to vibe-kanban...`);

  for (const entry of newEntries) {
    const { triage, raw } = entry;
    const typeEmoji = { bug: "🐛", feature: "💡", improvement: "✨", question: "❓" }[triage.type] || "📝";
    const title = `${typeEmoji} [${raw.tool || "tool"}] ${triage.summary}`;
    const body = buildIssueBody(entry);
    const labels = ["feedback", raw.tool || "unknown-tool", triage.type].filter(Boolean);

    try {
      await createKanbanIssue({ title, body, priority: triage.priority, labels });
      syncedIds.add(entry.id);
      console.log(`  ✓ Created: ${title.slice(0, 60)}`);
    } catch (error) {
      console.error(`  ✗ Failed for ${entry.id}: ${error.message}`);
    }
  }

  saveSyncedIds(syncedIds);
  console.log(`Sync complete. ${newEntries.length} entries processed.`);
}

syncFeedback().catch((error) => {
  console.error("Sync failed:", error.message);
  process.exit(1);
});
