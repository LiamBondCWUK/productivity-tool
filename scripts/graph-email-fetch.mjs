#!/usr/bin/env node
/**
 * graph-email-fetch.mjs
 * Fetches flagged/important emails via CLI for Microsoft 365 (m365).
 * No Azure App Registration needed — m365 uses Microsoft's PnP app internally.
 *
 * Prerequisites:
 *   npm install -g @pnp/cli-microsoft365
 *   m365 login  (one-time browser auth)
 *
 * Writes: flaggedEmails section to workspace/coordinator/dashboard-data.json
 *
 * Usage:
 *   node scripts/graph-email-fetch.mjs
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DASHBOARD_DATA_PATH = resolve(ROOT, "workspace/coordinator/dashboard-data.json");

function readJson(filePath, fallback) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function runM365(args) {
  const output = execSync(`m365 ${args} --output json`, {
    encoding: "utf8",
    timeout: 15000,
    windowsHide: true,
  });
  return JSON.parse(output);
}

async function fetchFlaggedEmails() {
  // Check m365 login status
  try {
    const status = execSync("m365 status --output json", {
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true,
    }).trim();
    const parsed = JSON.parse(status);
    if (!parsed || parsed === "Logged out") {
      console.log("[graph-email-fetch] Not logged in to m365 — run 'm365 login' first");
      return [];
    }
  } catch {
    console.log("[graph-email-fetch] m365 not available or not logged in — skipping");
    return [];
  }

  try {
    // Fetch messages from Inbox received in the last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const messages = runM365(
      `outlook message list --folderName Inbox --startTime "${sevenDaysAgo}"`
    );

    if (!Array.isArray(messages) || messages.length === 0) {
      console.log("[graph-email-fetch] No inbox messages found");
      return [];
    }

    // Filter to flagged (followUpFlag.flagStatus === 'flagged') or high-importance messages
    const flagged = messages.filter(
      (m) =>
        m.followUpFlag?.flagStatus === "flagged" ||
        m.importance === "high"
    );

    const result = flagged.slice(0, 10).map((m) => ({
      id: m.id,
      subject: m.subject ?? "(no subject)",
      from: m.from?.emailAddress?.name ?? m.from?.emailAddress?.address ?? "Unknown",
      webLink: m.webLink ?? "",
      receivedAt: m.receivedDateTime ?? new Date().toISOString(),
    }));

    console.log(`[graph-email-fetch] ${result.length} flagged/important emails found`);
    return result;
  } catch (err) {
    console.warn("[graph-email-fetch] Failed to fetch emails:", err.message);
    return [];
  }
}

async function run() {
  const flaggedEmails = await fetchFlaggedEmails();

  const dashboardData = readJson(DASHBOARD_DATA_PATH, {});
  dashboardData.flaggedEmails = flaggedEmails;
  dashboardData.flaggedEmailsFetchedAt = new Date().toISOString();

  writeFileSync(DASHBOARD_DATA_PATH, JSON.stringify(dashboardData, null, 2));
  console.log(`[graph-email-fetch] wrote ${flaggedEmails.length} emails to dashboard-data.json`);
}

run().catch((err) => {
  console.error("[graph-email-fetch] fatal:", err);
  process.exit(1);
});
