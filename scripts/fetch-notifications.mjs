#!/usr/bin/env node
/**
 * fetch-notifications.mjs
 *
 * Fetches Jira @mention/comment notifications and Microsoft Graph Office document
 * comment tags, then writes them as jira-comment / doc-comment inbox items into
 * workspace/coordinator/dashboard-data.json.
 *
 * Called by /gm and /intake to populate the Priority Inbox with actionable
 * notifications that the user can clear from the dashboard.
 *
 * Usage:
 *   node scripts/fetch-notifications.mjs
 *   node scripts/fetch-notifications.mjs --dry-run   (preview, no writes)
 *
 * Required env vars (Jira):
 *   JIRA_EMAIL       — Atlassian account email
 *   JIRA_API_TOKEN   — Atlassian API token
 *
 * Optional env vars:
 *   JIRA_BASE_URL    — defaults to https://caseware.atlassian.net
 *
 * Graph token (Office doc comments):
 *   workspace/coordinator/graph-token.json — written by setup-graph-token.ps1
 *
 * Behaviour:
 *   - Jira: fetches issues where currentUser() is @mentioned in comments
 *     (added/updated in the last 7 days). Clears stale items no longer returned.
 *   - Graph: fetches Word/Excel/PowerPoint files modified in the last 7 days
 *     with unresolved comments addressed to the user.
 *   - Both sources are merged into priorityInbox.urgent / today / backlog.
 *   - Existing items with the same id are left untouched (preserves manual ordering).
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_DIR = 'C:/Users/liam.bond/Documents/Productivity Tool';
const DASHBOARD_FILE = join(BASE_DIR, 'workspace/coordinator/dashboard-data.json');
const GRAPH_TOKEN_FILE = join(BASE_DIR, 'workspace/coordinator/graph-token.json');

const JIRA_BASE = process.env.JIRA_BASE_URL ?? 'https://caseware.atlassian.net';
const DRY_RUN = process.argv.includes('--dry-run');
const SINCE_DAYS = 7;

// ─── Auth ─────────────────────────────────────────────────────────────────────

const JIRA_EMAIL = process.env.JIRA_EMAIL ?? 'liam.bond@caseware.com';
const JIRA_TOKEN = process.env.JIRA_API_TOKEN ?? process.env.ATLASSIAN_API_TOKEN;

if (!JIRA_EMAIL || !JIRA_TOKEN) {
  console.warn('⚠  JIRA_EMAIL / JIRA_API_TOKEN not set — skipping Jira comment fetch');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readData() {
  const raw = readFileSync(DASHBOARD_FILE, 'utf8');
  const normalized = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  return JSON.parse(normalized);
}

function writeData(data) {
  writeFileSync(DASHBOARD_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function sinceDate(days = SINCE_DAYS) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

function nowIso() {
  return new Date().toISOString();
}

function jiraHeaders() {
  const creds = Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64');
  return {
    Authorization: `Basic ${creds}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

// ─── Jira: fetch @mention comments ───────────────────────────────────────────

/**
 * Fetches issues where the current user is mentioned in comments within SINCE_DAYS.
 * Jira doesn't have a direct "my notifications" REST endpoint, so we query for issues
 * that have comments mentioning the user's account ID.
 *
 * Returns array of InboxItem-shaped objects (type: "jira-comment").
 */
async function fetchJiraComments() {
  if (!JIRA_EMAIL || !JIRA_TOKEN) return [];

  const items = [];

  try {
    // Step 1: get current user's account ID
    const meResp = await fetch(`${JIRA_BASE}/rest/api/3/myself`, {
      headers: jiraHeaders(),
    });
    if (!meResp.ok) {
      console.warn(`⚠  Jira /myself returned ${meResp.status}`);
      return [];
    }
    const me = await meResp.json();
    const accountId = me.accountId;
    const displayName = me.displayName;

    // Step 2: search recent issues in the target projects, then filter comments locally.
    const jql = `project in (UKCAUD, UKCAS, UKJPD, UKPFR) AND updated >= \"${sinceDate()}\" ORDER BY updated DESC`;
    const searchResp = await fetch(
      `${JIRA_BASE}/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=summary,comment,status,priority&maxResults=100`,
      { headers: jiraHeaders() }
    );
    if (!searchResp.ok) {
      console.warn(`⚠  Jira search returned ${searchResp.status}`);
      return [];
    }
    const searchData = await searchResp.json();
    const issues = searchData.issues ?? [];

    const cutoffMs = Date.now() - SINCE_DAYS * 24 * 60 * 60 * 1000;

    for (const issue of issues) {
      const comments = issue.fields?.comment?.comments ?? [];
      // Find comments mentioning this user, added after cutoff
      for (const comment of comments) {
        const createdMs = new Date(comment.created).getTime();
        if (createdMs < cutoffMs) continue;

        // Check if comment body mentions this user (ADF format)
        const bodyText = extractTextFromAdf(comment.body);
        const mentionedIds = extractMentionIds(comment.body);
        if (!mentionedIds.includes(accountId) && comment.author?.accountId !== accountId) {
          // Only include if user is @mentioned (not just any comment)
          continue;
        }
        // Skip comments authored by the user themselves
        if (comment.author?.accountId === accountId) continue;

        const itemId = `jira-comment-${issue.key}-${comment.id}`;
        const snippet = bodyText.slice(0, 120);

        items.push({
          id: itemId,
          title: `${issue.key}: ${issue.fields.summary}`,
          type: 'jira-comment',
          source: 'jira',
          link: `${JIRA_BASE}/browse/${issue.key}?focusedCommentId=${comment.id}`,
          jiraKey: issue.key,
          commentId: comment.id,
          commentAuthor: comment.author?.displayName ?? 'Unknown',
          commentSnippet: snippet,
          priority: 'today',
          addedAt: nowIso(),
        });
      }
    }
  } catch (err) {
    console.warn('⚠  Jira comment fetch failed:', err.message);
  }

  return items;
}

/** Extract plain text from Atlassian Document Format (ADF) JSON body */
function extractTextFromAdf(adfBody) {
  if (!adfBody) return '';
  if (typeof adfBody === 'string') return adfBody;
  const parts = [];
  function walk(node) {
    if (!node) return;
    if (node.type === 'text') parts.push(node.text ?? '');
    if (node.type === 'mention') parts.push(`@${node.attrs?.text ?? ''}`);
    (node.content ?? []).forEach(walk);
  }
  walk(adfBody);
  return parts.join('').trim();
}

/** Extract account IDs of @mentioned users from ADF body */
function extractMentionIds(adfBody) {
  if (!adfBody || typeof adfBody === 'string') return [];
  const ids = [];
  function walk(node) {
    if (!node) return;
    if (node.type === 'mention') ids.push(node.attrs?.id ?? '');
    (node.content ?? []).forEach(walk);
  }
  walk(adfBody);
  return ids;
}

// ─── Graph: fetch Office doc comment tags ────────────────────────────────────

/**
 * Fetches Excel/Word/PowerPoint files from OneDrive modified in last SINCE_DAYS
 * that have unresolved comments addressing the current user.
 *
 * Returns array of InboxItem-shaped objects (type: "doc-comment").
 *
 * Note: Graph workbook comments API only works for Excel (.xlsx).
 * Word document comments require a different approach (not yet in Graph REST).
 * This function handles Excel; Word/PPT items appear as file-level notifications.
 */
async function fetchDocComments() {
  if (!existsSync(GRAPH_TOKEN_FILE)) {
    console.log('ℹ  graph-token.json not found — skipping Office doc comment fetch');
    return [];
  }

  let tokenData;
  try {
    tokenData = JSON.parse(readFileSync(GRAPH_TOKEN_FILE, 'utf8'));
  } catch {
    console.warn('⚠  Could not read graph-token.json');
    return [];
  }

  const accessToken = tokenData.access_token;
  if (!accessToken) {
    console.warn('⚠  graph-token.json has no access_token');
    return [];
  }

  const graphHeaders = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  };

  const items = [];

  try {
    // Get current user's display name / email for mention matching
    const meResp = await fetch('https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName', {
      headers: graphHeaders,
    });
    if (!meResp.ok) {
      console.warn(`⚠  Graph /me returned ${meResp.status}`);
      return [];
    }
    const me = await meResp.json();
    const myDisplayName = me.displayName;
    const myEmail = (me.mail ?? me.userPrincipalName ?? '').toLowerCase();

    // Search for recently modified Office files in OneDrive
    const since = new Date();
    since.setDate(since.getDate() - SINCE_DAYS);
    const sinceIso = since.toISOString();

    const searchResp = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/root/search(q='.xlsx')` +
      `?$filter=lastModifiedDateTime ge ${sinceIso}` +
      `&$select=id,name,webUrl,lastModifiedDateTime,parentReference` +
      `&$top=50`,
      { headers: graphHeaders }
    );

    if (!searchResp.ok) {
      console.warn(`⚠  Graph drive search returned ${searchResp.status}`);
      return [];
    }

    const searchData = await searchResp.json();
    const files = searchData.value ?? [];

    for (const file of files) {
      if (!file.name.endsWith('.xlsx')) continue;

      try {
        const driveId = file.parentReference?.driveId;
        const drivePrefix = driveId
          ? `https://graph.microsoft.com/v1.0/drives/${driveId}`
          : 'https://graph.microsoft.com/v1.0/me/drive';

        const commentsResp = await fetch(
          `${drivePrefix}/items/${file.id}/workbook/comments`,
          { headers: graphHeaders }
        );

        if (!commentsResp.ok) continue; // file may not be a workbook or not accessible

        const commentsData = await commentsResp.json();
        const comments = commentsData.value ?? [];

        for (const comment of comments) {
          if (comment.isResolved) continue;

          const commentText = comment.content?.richText?.trim() ?? '';
          const mentions = comment.mentions ?? [];

          // Check if current user is mentioned
          const isMentioned = mentions.some((m) => {
            const email = (m.email ?? '').toLowerCase();
            const name = (m.name ?? '').toLowerCase();
            return email === myEmail || name === myDisplayName.toLowerCase();
          });

          // Also check text for @DisplayName mention
          const textMentionsMe =
            commentText.toLowerCase().includes(`@${myDisplayName.toLowerCase()}`) ||
            commentText.toLowerCase().includes(`@${myEmail}`);

          if (!isMentioned && !textMentionsMe) continue;

          const authorName = comment.author?.displayName ?? 'Unknown';
          if (authorName === myDisplayName) continue; // skip own comments

          const itemId = `doc-comment-${file.id}-${comment.id}`;
          const snippet = commentText.slice(0, 120);

          items.push({
            id: itemId,
            title: `Comment in ${file.name}`,
            type: 'doc-comment',
            source: 'graph',
            link: file.webUrl,
            filePath: file.name,
            fileUrl: file.webUrl,
            driveItemId: file.id,
            driveId: file.parentReference?.driveId ?? null,
            commentObjectId: comment.id,
            commentAuthor: authorName,
            commentSnippet: snippet,
            priority: 'today',
            addedAt: nowIso(),
          });
        }
      } catch {
        // Individual file failure is non-fatal
      }
    }
  } catch (err) {
    console.warn('⚠  Graph doc comment fetch failed:', err.message);
  }

  return items;
}

// ─── Merge into dashboard-data.json ──────────────────────────────────────────

/**
 * Merges new notification items into the priority inbox.
 * - New items go into the correct section based on their .priority field.
 * - Existing items with the same id are left untouched.
 * - Stale jira-comment / doc-comment items that are NOT in the fresh fetch are removed
 *   (they've been resolved or are too old).
 */
function mergeNotifications(data, freshJiraItems, freshDocItems) {
  data.priorityInbox = data.priorityInbox ?? {
    urgent: [],
    aiSuggested: [],
    today: [],
    backlog: [],
  };

  const inbox = data.priorityInbox;
  const sections = ['urgent', 'aiSuggested', 'today', 'backlog'];

  // Build a set of fresh IDs by type
  const freshJiraIds = new Set(freshJiraItems.map((i) => i.id));
  const freshDocIds = new Set(freshDocItems.map((i) => i.id));
  const allFreshIds = new Set([...freshJiraIds, ...freshDocIds]);

  // Remove stale jira-comment / doc-comment items no longer in fresh fetch
  for (const section of sections) {
    inbox[section] = (inbox[section] ?? []).filter((item) => {
      if (item.type === 'jira-comment' || item.type === 'doc-comment') {
        return allFreshIds.has(item.id);
      }
      return true; // keep all other item types
    });
  }

  // Build a set of already-present IDs (after stale removal)
  const existingIds = new Set(
    sections.flatMap((s) => (inbox[s] ?? []).map((i) => i.id))
  );

  // Add new items to the appropriate section
  const allFresh = [...freshJiraItems, ...freshDocItems];
  for (const item of allFresh) {
    if (existingIds.has(item.id)) continue;

    const section = item.priority === 'urgent'
      ? 'urgent'
      : item.priority === 'today'
      ? 'today'
      : 'backlog';

    inbox[section] = inbox[section] ?? [];
    inbox[section].push(item);
    existingIds.add(item.id);
  }

  return data;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('📬 fetch-notifications: starting...');

  const [jiraItems, docItems] = await Promise.all([
    fetchJiraComments(),
    fetchDocComments(),
  ]);

  console.log(`  Jira @mentions: ${jiraItems.length} item(s)`);
  console.log(`  Doc comments:   ${docItems.length} item(s)`);

  if (DRY_RUN) {
    console.log('\n--- DRY RUN: items that would be added ---');
    [...jiraItems, ...docItems].forEach((item) =>
      console.log(`  [${item.type}] ${item.title} — ${item.commentSnippet ?? ''}`)
    );
    console.log('--- end dry run ---');
    return;
  }

  const data = readData();
  const updated = mergeNotifications(data, jiraItems, docItems);
  writeData(updated);

  console.log(`✅ fetch-notifications: dashboard-data.json updated`);
}

main().catch((err) => {
  console.error('❌ fetch-notifications failed:', err);
  process.exit(1);
});
