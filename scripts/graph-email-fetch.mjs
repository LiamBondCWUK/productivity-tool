#!/usr/bin/env node
/**
 * graph-email-fetch.mjs
 * Fetches flagged/important emails via Microsoft Graph REST API.
 * Uses the same graph-token.json as the calendar panel — no separate m365 login needed.
 *
 * Prerequisites:
 *   Run setup-graph-token.ps1 once (already includes Mail.Read scope)
 *
 * Writes: flaggedEmails section to workspace/coordinator/dashboard-data.json
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

async function fetchFlaggedEmails() {
  if (!existsSync(TOKEN_FILE)) {
    console.log("[graph-email-fetch] No graph-token.json — run setup-graph-token.ps1 first");
    return [];
  }

  let tokenData;
  try {
    tokenData = JSON.parse(readFileSync(TOKEN_FILE, "utf8"));
    tokenData = await refreshTokenIfNeeded(tokenData);
  } catch (err) {
    console.log(`[graph-email-fetch] Token error: ${err.message}`);
    return [];
  }

  try {
    // Fetch flagged messages and high-importance messages from last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const filter = encodeURIComponent(
      `(flag/flagStatus eq 'flagged' or importance eq 'high') and receivedDateTime ge ${sevenDaysAgo}`
    );
    const data = await graphGet(
      tokenData.access_token,
      `/me/messages?$filter=${filter}&$select=id,subject,from,receivedDateTime,webLink,importance,followUpFlag&$top=20&$orderby=receivedDateTime desc`
    );

    const messages = (data.value ?? []).slice(0, 10).map((m) => ({
      id: m.id,
      subject: m.subject ?? "(no subject)",
      from: m.from?.emailAddress?.name ?? m.from?.emailAddress?.address ?? "Unknown",
      webLink: m.webLink ?? "",
      receivedAt: m.receivedDateTime ?? new Date().toISOString(),
    }));

    console.log(`[graph-email-fetch] ${messages.length} flagged/important emails found`);
    return messages;
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
