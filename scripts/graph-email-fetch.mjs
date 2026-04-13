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
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DASHBOARD_DATA_PATH = resolve(ROOT, "workspace/coordinator/dashboard-data.json");
const TOKEN_FILE = resolve(ROOT, "workspace/coordinator/graph-token.json");
const OUTLOOK_FALLBACK_SCRIPT = resolve(ROOT, "scripts/outlook-mail-fetch.ps1");

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

/**
 * Fetch AI newsletter and internal comms emails.
 * Reads newsletter-sources.md for sender domains and subject keywords.
 * Uses existing Mail.Read scope — no admin consent needed.
 */
async function fetchNewsletterEmails() {
  if (!existsSync(TOKEN_FILE)) return [];

  let tokenData;
  try {
    tokenData = JSON.parse(readFileSync(TOKEN_FILE, "utf8"));
    tokenData = await refreshTokenIfNeeded(tokenData);
  } catch (err) {
    console.log(`[graph-email-fetch] Newsletter token error: ${err.message}`);
    return [];
  }

  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Known external newsletter sender domains
    const externalDomains = [
      "deeplearning.ai",
      "tldrai.com",
      "jack-clark.net",
      "theneurondaily.com",
      "bensbites.com",
      "newsletter.pragmaticengineer.com",
    ];

    // Subject keywords for AI-related internal emails
    const aiSubjectKeywords = [
      "AI", "ML", "GenAI", "Copilot", "innovation",
      "artificial intelligence", "machine learning", "LLM",
    ];

    // Subject keywords for newsletter-type emails
    const newsletterKeywords = [
      "newsletter", "digest", "AI weekly", "weekly briefing", "AI update",
    ];

    // Build OData filter — Graph API $filter is limited, so we use a broad filter
    // then do client-side refinement
    const filter = encodeURIComponent(
      `receivedDateTime ge ${oneDayAgo}`
    );

    const data = await graphGet(
      tokenData.access_token,
      `/me/messages?$filter=${filter}&$select=id,subject,from,receivedDateTime,webLink,bodyPreview&$top=50&$orderby=receivedDateTime desc`
    );

    const allMessages = data.value ?? [];

    // Client-side filter: match newsletter senders, AI keywords, or newsletter keywords
    const newsletters = allMessages.filter((m) => {
      const fromAddr = (m.from?.emailAddress?.address ?? "").toLowerCase();
      const fromName = (m.from?.emailAddress?.name ?? "").toLowerCase();
      const subject = (m.subject ?? "").toLowerCase();

      // External newsletter sender match
      const isExternalNewsletter = externalDomains.some((d) => fromAddr.includes(d));

      // Internal Caseware AI email match
      const isInternalAI = fromAddr.includes("caseware.com") && aiSubjectKeywords.some(
        (kw) => subject.includes(kw.toLowerCase())
      );

      // Internal Caseware product update that mentions AI
      const isProductUpdate = fromAddr.includes("caseware.com") && (
        subject.includes("product update") ||
        subject.includes("release notes") ||
        subject.includes("what's new")
      ) && (m.bodyPreview ?? "").toLowerCase().match(/\bai\b|copilot|genai|machine learning/);

      // Generic newsletter keyword match
      const isNewsletterKeyword = newsletterKeywords.some(
        (kw) => subject.includes(kw.toLowerCase()) || fromName.includes("newsletter")
      );

      return isExternalNewsletter || isInternalAI || isProductUpdate || isNewsletterKeyword;
    });

    // Deduplicate by subject similarity (strip "Re:", "Fwd:", whitespace)
    const seen = new Set();
    const deduped = newsletters.filter((m) => {
      const normalized = (m.subject ?? "")
        .replace(/^(re|fwd|fw):\s*/gi, "")
        .trim()
        .toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });

    const results = deduped.slice(0, 15).map((m) => ({
      id: m.id,
      subject: m.subject ?? "(no subject)",
      from: m.from?.emailAddress?.name ?? m.from?.emailAddress?.address ?? "Unknown",
      fromAddress: m.from?.emailAddress?.address ?? "",
      webLink: m.webLink ?? "",
      receivedAt: m.receivedDateTime ?? new Date().toISOString(),
      preview: (m.bodyPreview ?? "").slice(0, 500),
      sourceType: (m.from?.emailAddress?.address ?? "").includes("caseware.com")
        ? "internal"
        : "external",
    }));

    console.log(`[graph-email-fetch] ${results.length} newsletter emails found (${newsletters.length} pre-dedup)`);
    return results;
  } catch (err) {
    console.warn("[graph-email-fetch] Failed to fetch newsletters:", err.message);
    return [];
  }
}

function runOutlookFallback() {
  if (!existsSync(OUTLOOK_FALLBACK_SCRIPT)) {
    console.warn("[graph-email-fetch] Outlook fallback script not found");
    return false;
  }

  const fallbackRun = spawnSync(
    "powershell",
    ["-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", OUTLOOK_FALLBACK_SCRIPT],
    { encoding: "utf8" }
  );

  if (fallbackRun.status === 0) {
    const output = (fallbackRun.stdout ?? "").trim();
    if (output) {
      console.log(`[graph-email-fetch] Outlook fallback: ${output}`);
    }
    return true;
  }

  const errorOutput = (fallbackRun.stderr ?? fallbackRun.stdout ?? "").trim();
  console.warn(`[graph-email-fetch] Outlook fallback failed: ${errorOutput}`);
  return false;
}

async function run() {
  const flaggedEmails = await fetchFlaggedEmails();
  const newsletterEmails = await fetchNewsletterEmails();

  if (flaggedEmails.length === 0 && newsletterEmails.length === 0 && runOutlookFallback()) {
    return;
  }

  const dashboardData = readJson(DASHBOARD_DATA_PATH, {});
  dashboardData.flaggedEmails = flaggedEmails;
  dashboardData.flaggedEmailsFetchedAt = new Date().toISOString();
  dashboardData.newsletterEmails = newsletterEmails;
  dashboardData.newsletterEmailsFetchedAt = new Date().toISOString();

  writeFileSync(DASHBOARD_DATA_PATH, JSON.stringify(dashboardData, null, 2));
  console.log(`[graph-email-fetch] wrote ${flaggedEmails.length} flagged + ${newsletterEmails.length} newsletter emails to dashboard-data.json`);
}

run().catch((err) => {
  console.error("[graph-email-fetch] fatal:", err);
  process.exit(1);
});
