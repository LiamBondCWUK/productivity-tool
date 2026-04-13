#!/usr/bin/env node
/**
 * graph-teams-search.mjs
 * Searches Teams channels for AI-related content via Microsoft Graph Search API.
 * Uses existing graph-token.json (Chat.Read + Teams.ReadBasic.All scopes — no admin consent).
 *
 * Modes:
 *   --search     Search Teams messages for AI keywords (default)
 *   --channels   List joined teams and identify AI-related channels
 *   --both       Run both search + channel discovery
 *
 * Writes:
 *   - teamsAISearch section to workspace/coordinator/dashboard-data.json
 *   - AI Breaking News Tool/teams-ai-channels.md (channel discovery log)
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DASHBOARD_DATA_PATH = resolve(ROOT, "workspace/coordinator/dashboard-data.json");
const TOKEN_FILE = resolve(ROOT, "workspace/coordinator/graph-token.json");
const NEWS_TOOL_DIR = "C:/Users/liam.bond/Documents/AI Breaking News Tool";
const AI_CHANNELS_LOG = resolve(NEWS_TOOL_DIR, "teams-ai-channels.md");

const AI_KEYWORDS = [
  "AI", "GenAI", "Copilot", "LLM", "machine learning",
  "artificial intelligence", "innovation", "GPT", "Claude",
  "large language model", "neural network", "deep learning",
];

const AI_CHANNEL_PATTERNS = [
  /\bai\b/i, /\bml\b/i, /\bgenai\b/i, /\bcopilot\b/i,
  /\binnovation\b/i, /\bmachine.?learning\b/i,
  /\bartificial.?intelligence\b/i, /\bdata.?science\b/i,
  /\bllm\b/i, /\bdeep.?learning\b/i, /\bgpt\b/i,
];

function readJson(filePath, fallback) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function stripHtml(html) {
  return (html ?? "").replace(/<[^>]+>/g, "").trim();
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
    throw new Error(`Graph GET ${path} → ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json();
}

async function graphPost(accessToken, path, body) {
  const resp = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Graph POST ${path} → ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json();
}

/**
 * Search Teams messages for AI keywords using Graph Search API.
 * Uses Chat.Read scope (delegated, user-consent only).
 */
async function searchTeamsMessages(accessToken) {
  const queryString = AI_KEYWORDS
    .map((kw) => (kw.includes(" ") ? `"${kw}"` : kw))
    .join(" OR ");

  try {
    const data = await graphPost(accessToken, "/search/query", {
      requests: [
        {
          entityTypes: ["chatMessage"],
          query: { queryString },
          from: 0,
          size: 25,
        },
      ],
    });

    const hits = data.value?.[0]?.hitsContainers?.[0]?.hits ?? [];
    console.log(`[graph-teams-search] Search returned ${hits.length} message hits`);

    const messages = hits.map((hit) => {
      const resource = hit.resource ?? {};
      const summary = hit.summary ?? "";
      return {
        id: resource.id ?? hit.hitId ?? "",
        from: resource.from?.emailAddress?.name
          ?? resource.from?.user?.displayName
          ?? "Unknown",
        preview: stripHtml(summary || resource.body?.content || "").slice(0, 200),
        channelIdentity: resource.channelIdentity ?? null,
        chatId: resource.chatId ?? null,
        createdDateTime: resource.createdDateTime ?? "",
        webUrl: resource.webUrl ?? "",
      };
    });

    return messages;
  } catch (err) {
    // Search API may not be available — fall back gracefully
    if (err.message.includes("403") || err.message.includes("401")) {
      console.warn("[graph-teams-search] Search API not available (permissions). Falling back to channel scan.");
      return null;
    }
    console.warn(`[graph-teams-search] Search failed: ${err.message}`);
    return null;
  }
}

/**
 * Enumerate joined teams → channels → find AI-related channels.
 * Uses Teams.ReadBasic.All scope (delegated, user-consent only).
 */
async function discoverAIChannels(accessToken) {
  const teamsData = await graphGet(accessToken, "/me/joinedTeams?$select=id,displayName,description");
  const teams = teamsData.value ?? [];
  console.log(`[graph-teams-search] Found ${teams.length} joined teams`);

  const aiChannels = [];

  for (const team of teams) {
    const isAITeam = AI_CHANNEL_PATTERNS.some(
      (p) => p.test(team.displayName ?? "") || p.test(team.description ?? "")
    );

    try {
      const channelsData = await graphGet(
        accessToken,
        `/teams/${team.id}/channels?$select=id,displayName,description`
      );
      const channels = channelsData.value ?? [];

      for (const ch of channels) {
        const isAIChannel = AI_CHANNEL_PATTERNS.some(
          (p) => p.test(ch.displayName ?? "") || p.test(ch.description ?? "")
        );

        if (isAITeam || isAIChannel) {
          aiChannels.push({
            teamId: team.id,
            teamName: team.displayName,
            channelId: ch.id,
            channelName: ch.displayName,
            matchReason: isAITeam ? "AI team" : "AI channel name",
            deepLink: `https://teams.microsoft.com/l/channel/${ch.id}/${encodeURIComponent(ch.displayName)}?groupId=${team.id}`,
          });
        }
      }
    } catch (err) {
      console.warn(`[graph-teams-search] Could not list channels for "${team.displayName}": ${err.message}`);
    }
  }

  console.log(`[graph-teams-search] Discovered ${aiChannels.length} AI-related channels`);
  return aiChannels;
}

/**
 * Fetch recent messages from discovered AI channels.
 * Only fetches from channels, not full message read (uses beta if available).
 */
async function fetchChannelMessages(accessToken, aiChannels) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const allMessages = [];

  // Cap at 10 channels to avoid rate-limiting
  const channelsToScan = aiChannels.slice(0, 10);

  for (const ch of channelsToScan) {
    try {
      const data = await graphGet(
        accessToken,
        `/teams/${ch.teamId}/channels/${ch.channelId}/messages?$top=10`
      );
      const msgs = (data.value ?? [])
        .filter((m) => m.createdDateTime >= cutoff)
        .map((m) => ({
          id: m.id,
          from: m.from?.user?.displayName ?? "Unknown",
          preview: stripHtml(m.body?.content ?? "").slice(0, 200),
          teamName: ch.teamName,
          channelName: ch.channelName,
          createdDateTime: m.createdDateTime,
          deepLink: ch.deepLink,
        }));
      allMessages.push(...msgs);
    } catch (err) {
      // ChannelMessage.Read.All may be needed — skip without failing
      if (err.message.includes("403") || err.message.includes("401")) {
        console.warn(`[graph-teams-search] No permission to read messages in "${ch.teamName}/${ch.channelName}" — channel message reading requires ChannelMessage.Read.All (admin-consent). Skipping.`);
      } else {
        console.warn(`[graph-teams-search] Error reading "${ch.teamName}/${ch.channelName}": ${err.message}`);
      }
    }
  }

  return allMessages;
}

/**
 * Write discovered AI channels to a log file for awareness/manual joining.
 */
function writeChannelDiscoveryLog(aiChannels) {
  const date = new Date().toISOString().slice(0, 10);
  const lines = [
    "# Teams AI Channels Discovery Log",
    "",
    `Last updated: ${date}`,
    "",
    "Channels matching AI-related keywords in name or description.",
    "Join channels you're not a member of to expand coverage.",
    "",
    "| Team | Channel | Match Reason | Link |",
    "|------|---------|-------------|------|",
  ];

  for (const ch of aiChannels) {
    lines.push(`| ${ch.teamName} | ${ch.channelName} | ${ch.matchReason} | [Open](${ch.deepLink}) |`);
  }

  if (aiChannels.length === 0) {
    lines.push("| (none found) | — | — | — |");
  }

  writeFileSync(AI_CHANNELS_LOG, lines.join("\n") + "\n");
  console.log(`[graph-teams-search] Wrote ${aiChannels.length} channels to teams-ai-channels.md`);
}

async function run() {
  const mode = process.argv[2] ?? "--both";

  if (!existsSync(TOKEN_FILE)) {
    console.log("[graph-teams-search] No graph-token.json — run setup-graph-token.ps1 first");
    process.exit(0);
  }

  let tokenData;
  try {
    tokenData = JSON.parse(readFileSync(TOKEN_FILE, "utf8"));
    tokenData = await refreshTokenIfNeeded(tokenData);
  } catch (err) {
    console.error(`[graph-teams-search] Token error: ${err.message}`);
    process.exit(1);
  }

  const results = {
    searchMessages: [],
    aiChannels: [],
    channelMessages: [],
  };

  // Search API approach
  if (mode === "--search" || mode === "--both") {
    const searchResults = await searchTeamsMessages(tokenData.access_token);
    if (searchResults !== null) {
      results.searchMessages = searchResults;
    }
  }

  // Channel discovery approach
  if (mode === "--channels" || mode === "--both") {
    results.aiChannels = await discoverAIChannels(tokenData.access_token);
    writeChannelDiscoveryLog(results.aiChannels);

    // Try to fetch channel messages (may fail without admin-consent scope)
    if (results.aiChannels.length > 0) {
      results.channelMessages = await fetchChannelMessages(
        tokenData.access_token,
        results.aiChannels
      );
    }
  }

  // Merge all messages (search + channel), deduplicate by ID
  const allMessages = [...results.searchMessages, ...results.channelMessages];
  const seen = new Set();
  const dedupedMessages = allMessages.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  // Write to dashboard-data.json
  const dashboardData = readJson(DASHBOARD_DATA_PATH, {});
  dashboardData.teamsAISearch = {
    lastRun: new Date().toISOString(),
    messages: dedupedMessages.slice(0, 20),
    discoveredChannels: results.aiChannels.length,
    searchAvailable: results.searchMessages.length > 0 || mode === "--search",
  };
  writeFileSync(DASHBOARD_DATA_PATH, JSON.stringify(dashboardData, null, 2));

  console.log(`[graph-teams-search] Done: ${dedupedMessages.length} messages, ${results.aiChannels.length} AI channels`);
}

run().catch((err) => {
  console.error("[graph-teams-search] fatal:", err);
  process.exit(1);
});
