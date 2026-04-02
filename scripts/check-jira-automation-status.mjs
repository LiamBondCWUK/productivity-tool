#!/usr/bin/env node
/**
 * check-jira-automation-status.mjs
 *
 * Queries the Jira Automation 1.0 REST API to detect which automation rules are
 * live/disabled, then syncs status into workspace/coordinator/dashboard-data.json
 * so the AutomationStatus dashboard panel stays current without manual "Done" clicks.
 *
 * Usage:
 *   node scripts/check-jira-automation-status.mjs
 *   node scripts/check-jira-automation-status.mjs --dry-run   (preview only, no writes)
 *
 * Required env vars:
 *   JIRA_EMAIL       — your Atlassian account email
 *   JIRA_API_TOKEN   — Atlassian API token (https://id.atlassian.com/manage-profile/security/api-tokens)
 *
 * Optional env vars:
 *   JIRA_BASE_URL    — defaults to https://caseware.atlassian.net
 *
 * Notes:
 *   - Rules 2.1 (Readiness Checker) and 2.2 (Theme Analyzer) are Rovo Studio agents
 *     and cannot be detected via the Jira Automation API. They require manual confirmation
 *     in the dashboard ("Done" button).
 *   - Already-deployed rules are never downgraded to pending. Manual "Done" clicks are
 *     treated as authoritative.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_DIR = 'C:/Users/liam.bond/Documents/Productivity Tool';
const DASHBOARD_FILE = join(BASE_DIR, 'workspace/coordinator/dashboard-data.json');
const JIRA_BASE = process.env.JIRA_BASE_URL ?? 'https://caseware.atlassian.net';
const DRY_RUN = process.argv.includes('--dry-run');

// ─── Auth validation ─────────────────────────────────────────────────────────

const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

if (!JIRA_EMAIL || !JIRA_API_TOKEN) {
  console.error('');
  console.error('Error: JIRA_EMAIL and JIRA_API_TOKEN environment variables are required.');
  console.error('');
  console.error('  Set them before running:');
  console.error('    $env:JIRA_EMAIL = "your.email@caseware.com"');
  console.error('    $env:JIRA_API_TOKEN = "your-api-token"');
  console.error('    node scripts/check-jira-automation-status.mjs');
  console.error('');
  console.error('  Get an API token at: https://id.atlassian.com/manage-profile/security/api-tokens');
  process.exit(1);
}

const authHeader = 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');

// ─── Jira API helpers ────────────────────────────────────────────────────────

/**
 * Fetch all automation rules for a given Jira project key.
 * Uses the Jira Automation 1.0 REST API (separate from the standard Jira REST API v3).
 *
 * @param {string} projectKey
 * @returns {Promise<Array<{id: string, name: string, state: 'ENABLED'|'DISABLED'}>>}
 */
async function fetchAutomationRules(projectKey) {
  const url = `${JIRA_BASE}/rest/automation/1.0/rules/filter?limit=100&projects=${projectKey}`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    if (res.status === 401) {
      console.error(`  ERROR: 401 Unauthorized for ${projectKey}. Check your JIRA_EMAIL and JIRA_API_TOKEN.`);
      return [];
    }

    if (res.status === 403) {
      console.warn(`  WARN: 403 Forbidden for ${projectKey} automation rules. You may lack admin access to this project's automation.`);
      return [];
    }

    if (!res.ok) {
      const body = await res.text();
      console.warn(`  WARN: ${projectKey} automation API returned HTTP ${res.status}: ${body.slice(0, 300)}`);
      return [];
    }

    const body = await res.json();
    // API returns either { rules: [...] } or { values: [...] } depending on version
    return body.rules ?? body.values ?? [];
  } catch (err) {
    console.warn(`  WARN: Network error fetching ${projectKey} automation rules: ${err.message}`);
    return [];
  }
}

// ─── Rule detection logic ────────────────────────────────────────────────────

/**
 * Given a dashboard rule ID and the list of Jira automation rules for its project,
 * returns the inferred deployment status, or null if inconclusive.
 *
 * Mapping logic:
 *   'deployed' = the rule exists and is in the expected end-state for that phase
 *   'pending'  = the rule exists but hasn't reached the expected state yet
 *   null       = can't determine (rule not found or not checkable via API)
 *
 * @param {string} dashboardRuleId
 * @param {Array} jiraRules
 * @returns {'deployed' | 'pending' | null}
 */
function detectDeploymentStatus(dashboardRuleId, jiraRules) {
  switch (dashboardRuleId) {
    case 'retro-enrichment': {
      // Phase 1.1 — UKCAUD: rule fires on retro label enrichment, invokes Rovo agent
      const match = jiraRules.find(r =>
        /retro.*enrich|enrich.*retro/i.test(r.name)
      );
      if (!match) return null;
      return match.state === 'ENABLED' ? 'deployed' : 'pending';
    }

    case 'enhancement-routing': {
      // Phase 1.2 — UKCAS: enhancement-request label → route to UKJPD Idea
      const match = jiraRules.find(r =>
        /enhancement.*rout|rout.*enhancement|enhancement.*ukjpd/i.test(r.name)
      );
      if (!match) return null;
      return match.state === 'ENABLED' ? 'deployed' : 'pending';
    }

    case 'epic-done-sync': {
      // Phase 1.3 — UKCAUD: epic transitions Done → comment on linked UKJPD item
      const match = jiraRules.find(r =>
        /epic.*done.*ukjpd|ukjpd.*epic|epic.*done.*sync|delivery.*complete/i.test(r.name)
      );
      if (!match) return null;
      return match.state === 'ENABLED' ? 'deployed' : 'pending';
    }

    case 'disable-resolution-recommender': {
      // Phase 1.4 — UKCAS: rule 019d1f89 should be DISABLED (merged into Triage Agent)
      // For this rule, "deployed" = successfully disabled in Jira
      const match = jiraRules.find(r =>
        (r.id && String(r.id).toLowerCase().startsWith('019d1f89')) ||
        /resolution.?recommender/i.test(r.name)
      );
      if (!match) {
        // If the rule doesn't exist at all, it may already have been deleted → treat as deployed
        console.log('    Note: resolution recommender rule not found — may already be deleted');
        return null; // Can't confirm safely; leave for manual verification
      }
      // Goal is to DISABLE it — deployed means state is DISABLED
      return match.state === 'DISABLED' ? 'deployed' : 'pending';
    }

    // Rovo Studio agents — not queryable via Jira Automation REST API
    // Must be confirmed manually via the dashboard "Done" button
    case 'readiness-checker':
    case 'theme-analyzer':
      return null;

    default:
      return null;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nJira Automation Status Sync${DRY_RUN ? ' [DRY RUN]' : ''}`);
  console.log('─'.repeat(50));

  // Load current dashboard state
  let data;
  try {
    data = JSON.parse(readFileSync(DASHBOARD_FILE, 'utf-8'));
  } catch (err) {
    console.error(`Error reading ${DASHBOARD_FILE}: ${err.message}`);
    process.exit(1);
  }

  const rules = data.automationRules?.rules ?? [];
  if (rules.length === 0) {
    console.log('No automation rules in dashboard-data.json. Nothing to sync.');
    return;
  }

  // Determine which projects need to be queried
  const projectsToFetch = [...new Set(
    rules
      .filter(r => !['readiness-checker', 'theme-analyzer'].includes(r.id))
      .map(r => r.project)
  )];

  // Fetch automation rule lists in parallel
  console.log(`\nFetching automation rules from Jira (${projectsToFetch.join(', ')})...`);
  const projectRuleMap = {};
  await Promise.all(
    projectsToFetch.map(async projectKey => {
      const fetched = await fetchAutomationRules(projectKey);
      projectRuleMap[projectKey] = fetched;
      console.log(`  ${projectKey}: ${fetched.length} rule(s) found`);
    })
  );

  // Evaluate each dashboard rule
  console.log('\nEvaluating rules:');
  let updatedCount = 0;
  const updates = [];

  for (const rule of rules) {
    const jiraRules = projectRuleMap[rule.project] ?? [];
    const detectedStatus = detectDeploymentStatus(rule.id, jiraRules);

    if (detectedStatus === null) {
      const reason = ['readiness-checker', 'theme-analyzer'].includes(rule.id)
        ? 'Rovo Studio — manual confirmation required'
        : 'not found in Jira rule list';
      console.log(`  SKIP   [${rule.phase}] ${rule.name} — ${reason}`);
      continue;
    }

    if (rule.status === 'deployed' && detectedStatus !== 'deployed') {
      // Preserve manual "Done" confirmations — never downgrade
      console.log(`  KEEP   [${rule.phase}] ${rule.name} — keeping manually confirmed 'deployed'`);
      continue;
    }

    if (detectedStatus === rule.status) {
      console.log(`  OK     [${rule.phase}] ${rule.name} — ${rule.status} (no change)`);
      continue;
    }

    // Status change detected
    const previousStatus = rule.status;
    updates.push({ rule, previousStatus, newStatus: detectedStatus });
    console.log(`  UPDATE [${rule.phase}] ${rule.name}: ${previousStatus} → ${detectedStatus}`);
    updatedCount++;
  }

  // Apply updates
  if (!DRY_RUN && updatedCount > 0) {
    for (const { rule, newStatus } of updates) {
      rule.status = newStatus;
      if (newStatus === 'deployed' && !rule.deployedAt) {
        rule.deployedAt = new Date().toISOString();
      }
    }

    data.automationRules.rules = rules;
    data.automationRules.lastChecked = new Date().toISOString();
    writeFileSync(DASHBOARD_FILE, JSON.stringify(data, null, 2));
    console.log(`\nWrote ${DASHBOARD_FILE}`);
  } else if (DRY_RUN && updatedCount > 0) {
    console.log('\n[Dry run] No changes written.');
  }

  // Summary
  const deployedCount = rules.filter(r => r.status === 'deployed').length;
  const totalCheckable = rules.filter(r => !['readiness-checker', 'theme-analyzer'].includes(r.id)).length;

  console.log('\n' + '─'.repeat(50));
  console.log(`Summary: ${updatedCount} rule(s) updated | ${deployedCount}/${rules.length} deployed`);
  console.log(`lastChecked: ${data.automationRules.lastChecked ?? 'unchanged'}`);

  if (deployedCount < totalCheckable) {
    console.log('\nPending rules (deploy these via the dashboard):');
    rules
      .filter(r => r.status === 'pending' && !['readiness-checker', 'theme-analyzer'].includes(r.id))
      .forEach(r => console.log(`  • Phase ${r.phase}: ${r.name}`));
  }

  if (['readiness-checker', 'theme-analyzer'].some(id => rules.find(r => r.id === id)?.status === 'pending')) {
    console.log('\nRovo Studio agents (enable manually then click Done in dashboard):');
    ['readiness-checker', 'theme-analyzer']
      .map(id => rules.find(r => r.id === id))
      .filter(r => r && r.status === 'pending')
      .forEach(r => console.log(`  • Phase ${r.phase}: ${r.name} → ${r.jiraLink}`));
  }

  console.log('');
}

main().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
