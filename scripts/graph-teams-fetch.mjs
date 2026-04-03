#!/usr/bin/env node
/**
 * graph-teams-fetch.mjs
 * Fetches unread Teams chat conversations via Microsoft Graph REST API.
 * Uses the same graph-token.json as the calendar panel — no separate m365 login needed.
 *
 * Prerequisites:
 *   Run setup-graph-token.ps1 once (already includes Teams.ReadBasic.All Chat.Read scopes)
 *
 * Writes: teamMessages section to workspace/coordinator/dashboard-data.json
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DASHBOARD_DATA_PATH = resolve(ROOT, "workspace/coordinator/dashboard-data.json");
const TOKEN_FILE = resolve(ROOT, "workspace/coordinator/graph-token.json");

function readJson(filePath, fallback) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function refreshTokenIfNeeded(tokenData) {
  const expiresAt = tokenData.expires_at * 1000;
  const fiveMinutes = 5 * 60 * 1000;
  if (Date.now() < expiresAt - fiveMinutes) return tokenData;

  if (!tokenData.refresh_token) {
    throw new Error("Token expired and no refresh_token available. Run setup-graph-token.ps1 again.");
  }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: tokenData.client_id,
    refresh_token: tokenData.refresh_token,
    scope: "Calendars.ReadWrite offline_access User.Read Teams.ReadBasic.All Chat.Read Mail.Read",
  });

  const resp = await fetch(
    `https://login.microsoftonline.com/${tokenData.tenant_id}/oauth2/v2.0/token`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params }
  );

  if (!resp.ok) throw new Error(`Token refresh failed: ${resp.status}`);
  const refreshed = await resp.json();

  const updated = {
    ...tokenData,
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token ?? tokenData.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + refreshed.expires_in,
  };
  writeFileSync(TOKEN_FILE, JSON.stringify(updated, null, 2));
  return updated;
}

async function graphGet(accessToken, path) {
  const resp = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Graph ${path} → ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json();
}

async function fetchTeamsMessages() {
  if (!existsSync(TOKEN_FILE)) {
    console.log("[graph-teams-fetch] No graph-token.json — run setup-graph-token.ps1 first");
    return [];
  }

  let tokenData;
  try {
    tokenData = JSON.parse(readFileSync(TOKEN_FILE, "utf8"));
    tokenData = await refreshTokenIfNeeded(tokenData);
  } catch (err) {
    console.log(`[graph-teams-fetch] Token error: ${err.message}`);
    return [];
  }

  try {
    // Fetch recent chats with last message preview
    const data = await graphGet(
      tokenData.access_token,
      "/me/chats?$expand=members,lastMessagePreview&$top=20&$orderby=lastMessagePreview/createdDateTime desc"
    );

    const chats = data.value ?? [];
    if (chats.length === 0) {
      console.log("[graph-teams-fetch] No chats found");
      return [];
    }

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const messages = chats
      .filter((c) => c.lastMessagePreview)
      .map((chat) => {
        const lastMsg = chat.lastMessagePreview;
        const memberNames = (chat.members ?? [])
          .map((m) => m.displayName)
          .filter(Boolean)
          .filter((n) => n !== tokenData.user_name)
          .slice(0, 3);
        const from =
          lastMsg?.from?.user?.displayName ??
          memberNames[0] ??
          "Unknown";
        const preview = lastMsg?.body?.content
          ? lastMsg.body.content.replace(/<[^>]+>/g, "").trim().slice(0, 100)
          : "";
        const receivedAt =
          lastMsg?.createdDateTime ?? chat.createdDateTime ?? new Date().toISOString();

        return {
          id: chat.id,
          from,
          preview,
          chatUrl: `https://teams.microsoft.com/l/chat/${chat.id}/0`,
          unreadCount: chat.unreadMessageCount ?? 0,
          receivedAt,
        };
      })
      .filter((m) => m.unreadCount > 0 || m.receivedAt >= cutoff)
      .slice(0, 10);

    console.log(`[graph-teams-fetch] ${messages.length} relevant chats found`);
    return messages;
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
