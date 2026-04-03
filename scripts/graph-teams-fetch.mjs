#!/usr/bin/env node
/**
 * graph-teams-fetch.mjs
 * Fetches unread Teams chat conversations via CLI for Microsoft 365 (m365).
 * No Azure App Registration needed — m365 uses Microsoft's PnP app internally.
 *
 * Prerequisites:
 *   npm install -g @pnp/cli-microsoft365
 *   m365 login  (one-time browser auth)
 *
 * Writes: teamMessages section to workspace/coordinator/dashboard-data.json
 *
 * Usage:
 *   node scripts/graph-teams-fetch.mjs
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
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

async function fetchTeamsMessages() {
  // Check m365 login status
  try {
    const status = execSync("m365 status --output json", {
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true,
    }).trim();
    const parsed = JSON.parse(status);
    if (!parsed || parsed === "Logged out") {
      console.log("[graph-teams-fetch] Not logged in to m365 — run 'm365 login' first");
      return [];
    }
  } catch {
    console.log("[graph-teams-fetch] m365 not available or not logged in — skipping");
    return [];
  }

  try {
    // Fetch recent chats (one-on-one and group)
    const chats = runM365("teams chat list");
    if (!Array.isArray(chats) || chats.length === 0) {
      console.log("[graph-teams-fetch] No chats found");
      return [];
    }

    // Sort by lastMessagePreview.createdDateTime desc, take most recent 10
    const sorted = chats
      .filter((c) => c.lastMessagePreview)
      .sort((a, b) => {
        const aTime = a.lastMessagePreview?.createdDateTime ?? "";
        const bTime = b.lastMessagePreview?.createdDateTime ?? "";
        return bTime.localeCompare(aTime);
      })
      .slice(0, 10);

    const messages = sorted.map((chat) => {
      const lastMsg = chat.lastMessagePreview;
      const memberNames = (chat.members ?? [])
        .map((m) => m.displayName)
        .filter(Boolean)
        .slice(0, 3);
      const from = lastMsg?.from?.user?.displayName ?? memberNames.join(", ") ?? "Unknown";
      const preview = lastMsg?.body?.content
        ? lastMsg.body.content.replace(/<[^>]+>/g, "").slice(0, 100)
        : "";

      return {
        id: chat.id,
        from,
        preview,
        chatUrl: `https://teams.microsoft.com/l/chat/${chat.id}/0`,
        unreadCount: chat.unreadMessageCount ?? 0,
        receivedAt: lastMsg?.createdDateTime ?? chat.createdDateTime ?? new Date().toISOString(),
      };
    });

    // Filter to only chats with unread messages (or recent last 24h)
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const relevant = messages.filter(
      (m) => m.unreadCount > 0 || m.receivedAt >= cutoff
    );

    console.log(`[graph-teams-fetch] ${relevant.length} relevant chats found`);
    return relevant;
  } catch (err) {
    console.warn("[graph-teams-fetch] Failed to fetch Teams chats:", err.message);
    return [];
  }
}

async function run() {
  const teamMessages = await fetchTeamsMessages();

  const dashboardData = readJson(DASHBOARD_DATA_PATH, {});
  dashboardData.teamMessages = teamMessages;
  dashboardData.teamMessagesFetchedAt = new Date().toISOString();

  writeFileSync(DASHBOARD_DATA_PATH, JSON.stringify(dashboardData, null, 2));
  console.log(`[graph-teams-fetch] wrote ${teamMessages.length} messages to dashboard-data.json`);
}

run().catch((err) => {
  console.error("[graph-teams-fetch] fatal:", err);
  process.exit(1);
});
