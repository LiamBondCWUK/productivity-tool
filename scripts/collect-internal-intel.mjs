#!/usr/bin/env node
/**
 * collect-internal-intel.mjs
 *
 * Bridge script that reads from existing proven extractors (Teams LevelDB,
 * Confluence REST, Outlook COM) and writes structured internal intelligence
 * to dashboard-data.json for the Command Center.
 *
 * Fallback chain per source:
 *   1. Try Microsoft Graph (if graph-token.json exists and valid)
 *   2. Fall back to local extractor outputs
 *   3. Trigger upstream extractor if outputs are stale (>12h)
 *
 * Usage:
 *   node scripts/collect-internal-intel.mjs            # Normal run
 *   node scripts/collect-internal-intel.mjs --force     # Force-refresh all sources
 */

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DOCS_ROOT = resolve(ROOT, "..");

const DASHBOARD_DATA_PATH = resolve(ROOT, "workspace/coordinator/dashboard-data.json");
const TOKEN_FILE = resolve(ROOT, "workspace/coordinator/graph-token.json");
const REVIEW_EVIDENCE_DIR = resolve(ROOT, "outputs/review-evidence");
const NEWSLETTER_SOURCES_PATH = resolve(DOCS_ROOT, "AI Breaking News Tool/newsletter-sources.md");

const STALE_THRESHOLD_MS = 12 * 60 * 60 * 1000; // 12 hours
const FORCE = process.argv.includes("--force");

// ── Helpers ──────────────────────────────────────────────────────────────────

function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function isStale(filePath) {
  if (!existsSync(filePath)) return true;
  const age = Date.now() - statSync(filePath).mtimeMs;
  return age > STALE_THRESHOLD_MS;
}

function log(source, msg) {
  console.log(`[${source}] ${msg}`);
}

function tryExec(cmd, label) {
  try {
    log(label, `Triggering upstream: ${cmd}`);
    execSync(cmd, { stdio: "inherit", timeout: 120_000 });
    return true;
  } catch (err) {
    log(label, `Upstream trigger failed: ${err.message}`);
    return false;
  }
}

// ── AI Keyword Matching ──────────────────────────────────────────────────────

const AI_PATTERN = /\b(AI|artificial.?intelligence|machine.?learn|ML|deep.?learn|LLM|large.?language|GenAI|generative.?AI|copilot|claude|GPT|openai|anthropic|chatbot|neural.?net|NLP|natural.?language|RAG|retrieval.?augment|agent|agentic|MCP|model.?context|innovat|automat(?:ion|ed|ing))\b/i;

function matchesAI(text) {
  return AI_PATTERN.test(text);
}

// ── Teams: Parse LevelDB Evidence Files ──────────────────────────────────────

function collectTeams() {
  log("teams", "Scanning Teams evidence files...");

  const teamsFiles = readdirSync(REVIEW_EVIDENCE_DIR)
    .filter((f) => f.startsWith("teams-") && f.endsWith(".md"))
    .map((f) => join(REVIEW_EVIDENCE_DIR, f));

  if (teamsFiles.length === 0) {
    log("teams", "No teams-*.md files found");
    return [];
  }

  // Check staleness and trigger extractor if needed
  const anyStale = teamsFiles.some((f) => isStale(f));
  if ((anyStale || FORCE) && existsSync(resolve(DOCS_ROOT, "extract-teams-v2.js"))) {
    tryExec(
      `node "${resolve(DOCS_ROOT, "extract-teams-v2.js")}"`,
      "teams"
    );
  }

  const results = [];
  const messageRegex = /^- \*\*(.+?)\*\* \[(.+?)\](?: \(peers: (.+?)\))?: (.+)/;

  for (const filePath of teamsFiles) {
    const content = readFileSync(filePath, "utf8");
    const lines = content.split("\n");

    let currentSection = "";
    for (const line of lines) {
      if (line.startsWith("## ")) {
        currentSection = line.replace(/^## /, "").trim();
        continue;
      }

      const match = line.match(messageRegex);
      if (!match) continue;

      const [, sender, channels, , body] = match;
      const fullText = `${sender} ${channels} ${body}`;

      if (!matchesAI(fullText)) continue;

      // Clean body of LevelDB binary artifacts
      const cleanBody = body
        .replace(/[\x00-\x1f\x7f-\x9f]/g, "")
        .replace(/[�]+/g, "…")
        .trim();

      if (cleanBody.length < 15) continue;

      results.push({
        title: `${channels} — ${sender}`,
        summary: cleanBody.slice(0, 300),
        sourceType: "teams",
        channel: channels,
        sender,
        section: currentSection,
      });
    }
  }

  // Dedupe by summary similarity (first 80 chars)
  const seen = new Set();
  const deduped = results.filter((r) => {
    const key = r.summary.slice(0, 80).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort: channel messages first, then group, then direct
  const sectionOrder = { "CHANNEL MESSAGES": 0, "GROUP CHAT MESSAGES": 1, "DIRECT MESSAGES": 2 };
  deduped.sort((a, b) => (sectionOrder[a.section] ?? 3) - (sectionOrder[b.section] ?? 3));

  const capped = deduped.slice(0, 10);
  log("teams", `${results.length} AI matches → ${deduped.length} deduped → ${capped.length} returned`);
  return capped;
}

// ── Confluence: Direct REST API ──────────────────────────────────────────────

async function collectConfluence() {
  log("confluence", "Querying Confluence REST API...");

  const apiToken = process.env.ATLASSIAN_API_TOKEN;
  if (!apiToken) {
    log("confluence", "ATLASSIAN_API_TOKEN not set — skipping");
    return [];
  }

  const user = "liam.bond@caseware.com";
  const baseUrl = "https://caseware.atlassian.net/wiki/rest/api";
  const auth = `Basic ${Buffer.from(`${user}:${apiToken}`).toString("base64")}`;

  const cqlQueries = [
    // AI-labelled or AI-text pages modified in last 7 days
    `type = page AND (label in ("ai", "ml", "genai", "copilot", "llm", "innovation", "machine-learning") OR text ~ "artificial intelligence" OR text ~ "machine learning" OR text ~ "large language model" OR text ~ "GenAI" OR text ~ "Copilot") AND lastModified >= now("-7d")`,
    // Architecture/design docs mentioning AI
    `type = page AND label in ("documentation", "architecture", "design") AND text ~ "AI" AND lastModified >= now("-7d")`,
  ];

  const allPages = [];
  const seenIds = new Set();

  for (const cql of cqlQueries) {
    try {
      const url = `${baseUrl}/content/search?cql=${encodeURIComponent(cql)}&limit=15&expand=version,space,history.lastUpdated`;
      const resp = await fetch(url, {
        headers: { Authorization: auth, Accept: "application/json" },
      });

      if (!resp.ok) {
        log("confluence", `CQL query failed: ${resp.status} ${resp.statusText}`);
        continue;
      }

      const data = await resp.json();
      for (const page of data.results ?? []) {
        if (seenIds.has(page.id)) continue;
        seenIds.add(page.id);

        const modifiedDate = page.history?.lastUpdated?.when ?? page.version?.when ?? "";
        const modifiedBy = page.history?.lastUpdated?.by?.displayName ?? page.version?.by?.displayName ?? "";
        const spaceKey = page.space?.key ?? "";
        const spaceName = page.space?.name ?? spaceKey;
        const pageUrl = `https://caseware.atlassian.net/wiki${page._links?.webui ?? ""}`;

        // Flag freshness
        const modMs = new Date(modifiedDate).getTime();
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        const flag = modMs > oneDayAgo ? "NEW" : "RECENT";

        allPages.push({
          title: page.title,
          summary: `${spaceName} — modified by ${modifiedBy}. ${flag}.`,
          sourceType: "confluence",
          url: pageUrl,
          space: spaceName,
          modifier: modifiedBy,
          modified: modifiedDate,
          flag,
        });
      }
    } catch (err) {
      log("confluence", `CQL error: ${err.message}`);
    }
  }

  // Sort by modified date descending, cap at 15
  allPages.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
  const capped = allPages.slice(0, 15);
  log("confluence", `${allPages.length} pages found → ${capped.length} returned`);
  return capped;
}

// ── Newsletters: Outlook COM Output + Graph Fallback ─────────────────────────

function collectNewsletters() {
  log("newsletters", "Scanning for newsletter emails...");

  // Load newsletter sender config
  const externalDomains = [
    "deeplearning.ai",
    "tldrai.com",
    "jack-clark.net",
    "theneurondaily.com",
    "bensbites.com",
    "newsletter.pragmaticengineer.com",
  ];

  const aiSubjectKeywords = [
    "AI", "ML", "GenAI", "Copilot", "innovation",
    "artificial intelligence", "machine learning", "LLM",
    "newsletter", "digest", "AI weekly", "weekly briefing", "AI update",
  ];

  // Check if Outlook COM output exists in dashboard-data.json
  const dashData = readJson(DASHBOARD_DATA_PATH);
  const flaggedEmails = dashData.flaggedEmails ?? [];
  const newsletterEmails = dashData.newsletterEmails ?? [];

  // If we already have Graph-sourced newsletter emails, use those
  if (newsletterEmails.length > 0) {
    log("newsletters", `Using ${newsletterEmails.length} existing Graph newsletter results`);
    return newsletterEmails.map((e) => ({
      title: e.subject ?? "(no subject)",
      summary: `From ${e.from ?? e.fromAddress ?? "unknown"}. ${e.preview ?? ""}`.slice(0, 300),
      sourceType: "newsletter",
      url: e.webLink ?? "",
      newsletter: e.from ?? "",
      receivedAt: e.receivedAt ?? "",
      emailSourceType: e.sourceType ?? "external",
    }));
  }

  // Trigger Outlook COM fetch if stale
  const outlookScript = resolve(ROOT, "scripts/outlook-mail-fetch.ps1");
  if ((isStale(DASHBOARD_DATA_PATH) || FORCE) && existsSync(outlookScript)) {
    tryExec(`powershell -NoProfile -File "${outlookScript}"`, "newsletters");
  }

  // Re-read after possible refresh
  const refreshedData = readJson(DASHBOARD_DATA_PATH);
  const allEmails = [
    ...(refreshedData.flaggedEmails ?? []),
    ...(refreshedData.newsletterEmails ?? []),
  ];

  if (allEmails.length === 0) {
    log("newsletters", "No emails found in dashboard-data.json");
    return [];
  }

  // Filter for newsletters
  const results = [];
  const seenSubjects = new Set();

  for (const email of allEmails) {
    const from = (email.from ?? email.fromAddress ?? "").toLowerCase();
    const subject = (email.subject ?? "").toLowerCase();
    const normalizedSubject = subject.replace(/\s+/g, " ").trim();

    if (seenSubjects.has(normalizedSubject)) continue;

    // Check external newsletter domains
    const isExternal = externalDomains.some((d) => from.includes(d.toLowerCase()));

    // Check AI subject keywords
    const hasAISubject = aiSubjectKeywords.some((kw) => subject.includes(kw.toLowerCase()));

    // Check internal Caseware AI comms
    const isInternalAI = from.includes("caseware.com") && hasAISubject;

    if (!isExternal && !isInternalAI && !hasAISubject) continue;

    seenSubjects.add(normalizedSubject);
    results.push({
      title: email.subject ?? "(no subject)",
      summary: `From ${email.from ?? "unknown"}.`,
      sourceType: "newsletter",
      url: email.webLink ?? "",
      newsletter: email.from ?? "",
      receivedAt: email.receivedAt ?? "",
      emailSourceType: isExternal ? "external" : "internal",
    });
  }

  const capped = results.slice(0, 15);
  log("newsletters", `${results.length} newsletter matches → ${capped.length} returned`);
  return capped;
}

// ── Optional Graph Enrichment ────────────────────────────────────────────────

async function tryGraphEnrichment() {
  if (!existsSync(TOKEN_FILE)) return null;

  let tokenData;
  try {
    tokenData = JSON.parse(readFileSync(TOKEN_FILE, "utf8"));
    const expiresAt = (tokenData.expires_at ?? 0) * 1000;
    if (Date.now() > expiresAt - 5 * 60 * 1000) {
      log("graph", "Token expired — skipping Graph enrichment");
      return null;
    }
  } catch {
    return null;
  }

  log("graph", "Valid Graph token found — attempting enrichment");

  const results = { teams: [], newsletters: [] };

  try {
    // Teams search via Graph Search API
    const searchResp = await fetch("https://graph.microsoft.com/v1.0/search/query", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [{
          entityTypes: ["chatMessage"],
          query: { queryString: "AI OR GenAI OR Copilot OR LLM OR machine learning OR innovation" },
          from: 0,
          size: 10,
        }],
      }),
    });

    if (searchResp.ok) {
      const searchData = await searchResp.json();
      const hits = searchData.value?.[0]?.hitsContainers?.[0]?.hits ?? [];
      for (const hit of hits) {
        const resource = hit.resource ?? {};
        results.teams.push({
          title: `${resource.channelIdentity?.channelId ?? "Chat"} — ${resource.from?.emailAddress?.name ?? "Unknown"}`,
          summary: (resource.summary ?? resource.bodyPreview ?? "").slice(0, 300),
          sourceType: "teams",
          url: resource.webUrl ?? "",
        });
      }
      log("graph", `Teams search: ${results.teams.length} messages`);
    } else {
      log("graph", `Teams search failed: ${searchResp.status}`);
    }
  } catch (err) {
    log("graph", `Teams search error: ${err.message}`);
  }

  try {
    // Newsletter emails via Graph
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const filter = encodeURIComponent(`receivedDateTime ge ${oneDayAgo}`);
    const emailResp = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages?$filter=${filter}&$select=id,subject,from,receivedDateTime,webLink,bodyPreview&$top=50&$orderby=receivedDateTime desc`,
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    );

    if (emailResp.ok) {
      const emailData = await emailResp.json();
      const externalDomains = ["deeplearning.ai", "tldrai.com", "jack-clark.net", "theneurondaily.com", "bensbites.com", "newsletter.pragmaticengineer.com"];
      const aiKeywords = /\b(AI|ML|GenAI|Copilot|innovation|artificial.?intelligence|machine.?learn|LLM|newsletter|digest)\b/i;

      for (const msg of emailData.value ?? []) {
        const fromAddr = (msg.from?.emailAddress?.address ?? "").toLowerCase();
        const subject = msg.subject ?? "";
        const isExternal = externalDomains.some((d) => fromAddr.includes(d));
        const isAI = aiKeywords.test(subject);

        if (isExternal || isAI) {
          results.newsletters.push({
            title: subject,
            summary: `From ${msg.from?.emailAddress?.name ?? "unknown"}. ${(msg.bodyPreview ?? "").slice(0, 200)}`,
            sourceType: "newsletter",
            url: msg.webLink ?? "",
            emailSourceType: isExternal ? "external" : "internal",
          });
        }
      }
      log("graph", `Newsletter emails: ${results.newsletters.length} matches`);
    } else {
      log("graph", `Email fetch failed: ${emailResp.status}`);
    }
  } catch (err) {
    log("graph", `Email error: ${err.message}`);
  }

  return results;
}

// ── Merge & Dedupe ───────────────────────────────────────────────────────────

function mergeResults(local, graph) {
  const merged = {
    teamsChannels: [...local.teams],
    confluencePages: [...local.confluence],
    newsletterHighlights: [...local.newsletters],
  };

  if (!graph) return merged;

  // Merge Graph teams results (prepend, they're fresher)
  if (graph.teams.length > 0) {
    const existingTitles = new Set(merged.teamsChannels.map((t) => t.title.toLowerCase()));
    for (const item of graph.teams) {
      if (!existingTitles.has(item.title.toLowerCase())) {
        merged.teamsChannels.unshift(item);
      }
    }
    merged.teamsChannels = merged.teamsChannels.slice(0, 10);
  }

  // Merge Graph newsletter results
  if (graph.newsletters.length > 0) {
    const existingSubjects = new Set(merged.newsletterHighlights.map((n) => n.title.toLowerCase()));
    for (const item of graph.newsletters) {
      if (!existingSubjects.has(item.title.toLowerCase())) {
        merged.newsletterHighlights.unshift(item);
      }
    }
    merged.newsletterHighlights = merged.newsletterHighlights.slice(0, 15);
  }

  return merged;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n═══ Internal Intelligence Collection ═══\n");

  // Collect from local extractors
  const teams = collectTeams();
  const confluence = await collectConfluence();
  const newsletters = collectNewsletters();

  const localResults = { teams, confluence, newsletters };
  log("summary", `Local: ${teams.length} teams, ${confluence.length} confluence, ${newsletters.length} newsletters`);

  // Try Graph enrichment
  const graphResults = await tryGraphEnrichment();

  // Merge
  const internalIntel = mergeResults(localResults, graphResults);
  log("summary", `Final: ${internalIntel.teamsChannels.length} teams, ${internalIntel.confluencePages.length} confluence, ${internalIntel.newsletterHighlights.length} newsletters`);

  // Write to dashboard-data.json
  const dashData = readJson(DASHBOARD_DATA_PATH);
  if (!dashData.aiNewsResults) {
    dashData.aiNewsResults = {};
  }
  dashData.aiNewsResults.internalIntel = internalIntel;
  dashData.aiNewsResults.internalIntelUpdatedAt = new Date().toISOString();

  writeFileSync(DASHBOARD_DATA_PATH, JSON.stringify(dashData, null, 2));
  log("summary", `Written to ${DASHBOARD_DATA_PATH}`);

  console.log("\n═══ Done ═══\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
