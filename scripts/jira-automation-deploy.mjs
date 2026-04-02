/**
 * jira-automation-deploy.mjs
 *
 * Playwright automation to deploy Jira automation rules for phases 1.1–1.4.
 * Uses Edge persistent profile (avoids Chrome profile lock).
 *
 * What it does:
 *   Phase 1.1 — UKCAUD: Enable "retro enrichment" rule
 *   Phase 1.2 — UKCAS:  Enable "enhancement routing" rule
 *   Phase 1.3 — UKCAUD: Enable "epic done sync" rule
 *   Phase 1.4 — UKCAS:  Disable "resolution recommender" rule
 *
 * After each successful toggle, calls PATCH /api/automation on localhost:3000
 * to mark the rule as deployed in the dashboard (if dashboard is running).
 *
 * Usage:
 *   node scripts/jira-automation-deploy.mjs
 *   node scripts/jira-automation-deploy.mjs --dry-run   (navigate only, no clicks)
 *
 * Requires: npm install playwright (or playwright is already installed)
 */

import { chromium } from 'playwright';
import path from 'path';
import os from 'os';

const DRY_RUN = process.argv.includes('--dry-run');
const JIRA_BASE = 'https://caseware.atlassian.net';
const DASHBOARD_API = 'http://localhost:3000/api/automation';
const EDGE_PROFILE = path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data');

// ─── Rule definitions ─────────────────────────────────────────────────────────

const RULES = [
  {
    id: 'retro-enrichment',
    phase: '1.1',
    project: 'UKCAUD',
    namePattern: /retro.*enrich|enrich.*retro/i,
    targetState: 'ENABLED',
    description: 'Retro enrichment (invoke Rovo agent on retro label)',
  },
  {
    id: 'enhancement-routing',
    phase: '1.2',
    project: 'UKCAS',
    namePattern: /enhancement.*rout|rout.*enhancement|enhancement.*ukjpd/i,
    targetState: 'ENABLED',
    description: 'Enhancement routing (UKCAS → UKJPD Idea)',
  },
  {
    id: 'epic-done-sync',
    phase: '1.3',
    project: 'UKCAUD',
    namePattern: /epic.*done.*ukjpd|ukjpd.*epic|epic.*done.*sync|delivery.*complete/i,
    targetState: 'ENABLED',
    description: 'Epic done sync (UKCAUD epic Done → UKJPD comment)',
  },
  {
    id: 'disable-resolution-recommender',
    phase: '1.4',
    project: 'UKCAS',
    namePattern: /resolution.?recommender/i,
    targetState: 'DISABLED',
    description: 'Resolution recommender (should be disabled — merged into Triage Agent)',
  },
];

// ─── Browser launch ───────────────────────────────────────────────────────────

async function launchBrowser() {
  try {
    console.log('Trying Edge (avoids Chrome profile lock)...');
    const ctx = await chromium.launchPersistentContext(EDGE_PROFILE, {
      headless: false,
      channel: 'msedge',
      args: ['--no-first-run', '--no-default-browser-check'],
      ignoreDefaultArgs: ['--enable-automation'],
    });
    console.log('Edge launched successfully.');
    return ctx;
  } catch (err) {
    console.log(`Edge failed (${err.message.split('\n')[0]}), falling back to fresh Chromium...`);
  }

  const tmpDir = path.join(os.tmpdir(), 'playwright-jira-' + Date.now());
  const ctx = await chromium.launchPersistentContext(tmpDir, {
    headless: false,
    args: ['--no-first-run', '--no-default-browser-check'],
  });
  console.log('Fresh Chromium launched. You may need to log into Atlassian manually.');
  return ctx;
}

// ─── Dashboard API helper ─────────────────────────────────────────────────────

async function markDeployedInDashboard(ruleId) {
  try {
    const res = await fetch(DASHBOARD_API, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: ruleId, status: 'deployed' }),
    });
    if (res.ok) {
      console.log(`  ✓ Dashboard updated: ${ruleId} → deployed`);
    } else {
      console.log(`  ⚠ Dashboard API returned ${res.status} (dashboard may not be running)`);
    }
  } catch {
    console.log(`  ⚠ Dashboard API unreachable (is pm2 running? Try: pm2 start)`);
  }
}

// ─── Navigate to Jira automation settings ────────────────────────────────────

async function navigateToAutomation(page, projectKey) {
  const url = `${JIRA_BASE}/jira/software/projects/${projectKey}/settings/automate`;
  console.log(`\n  Navigating to ${url}`);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  const currentUrl = page.url();
  if (currentUrl.includes('login') || currentUrl.includes('signin') || currentUrl.includes('id.atlassian')) {
    console.log('  ⚠ Redirected to login. Please log in, then the script will continue.');
    // Wait up to 2 minutes for the user to log in
    await page.waitForURL(url => !url.includes('login') && !url.includes('signin'), { timeout: 120000 });
    await page.waitForTimeout(2000);
  }
}

// ─── Find a rule in the automation list ──────────────────────────────────────

/**
 * Find a rule row matching the name pattern.
 * Jira automation pages typically render rules as list items or table rows
 * with a visible rule name text element.
 */
async function findRuleRow(page, namePattern) {
  // Try multiple selectors that Jira uses for automation rule names
  const ruleNameSelectors = [
    '[data-testid="rule-name"]',
    '[data-automation-id="rule-name"]',
    '.rule-name',
    '[class*="ruleName"]',
    'h3',
    'h4',
    // Generic: any element containing the rule name as text
  ];

  // First, get all visible text that could be rule names
  const ruleElements = await page.$$('a, span, div, h3, h4, li, td');

  for (const el of ruleElements) {
    try {
      const text = await el.textContent();
      if (text && namePattern.test(text.trim())) {
        // Walk up to find the rule container row
        const row = await el.evaluateHandle(node => {
          let current = node;
          // Walk up max 8 levels to find a container that likely holds the entire rule
          for (let i = 0; i < 8; i++) {
            if (!current.parentElement) break;
            current = current.parentElement;
            const tag = current.tagName.toLowerCase();
            const role = current.getAttribute('role') || '';
            const dataId = current.getAttribute('data-testid') || current.getAttribute('data-rule-id') || '';
            // Stop at likely rule containers
            if (tag === 'li' || tag === 'tr' || role === 'row' || role === 'listitem' ||
                dataId.includes('rule') || current.className?.includes('rule-row') ||
                current.className?.includes('ruleRow')) {
              return current;
            }
          }
          return current;
        });

        const rowEl = row.asElement();
        if (rowEl) {
          return { element: rowEl, name: text.trim() };
        }
      }
    } catch {
      // element may have been detached, skip
    }
  }

  return null;
}

// ─── Get current enable/disable state of a rule row ──────────────────────────

async function getRuleState(ruleRow) {
  // Look for toggle/switch within the rule row
  const toggleSelectors = [
    'button[aria-label*="enable" i]',
    'button[aria-label*="disable" i]',
    'button[aria-pressed]',
    'input[type="checkbox"]',
    '[role="switch"]',
    'button[data-testid*="toggle" i]',
    'button[data-testid*="enable" i]',
    'button[data-testid*="disable" i]',
  ];

  for (const selector of toggleSelectors) {
    const toggle = await ruleRow.$(selector);
    if (toggle) {
      // Determine state from aria-pressed, checked, or aria-label
      const ariaPressed = await toggle.getAttribute('aria-pressed');
      const checked = await toggle.getAttribute('checked');
      const ariaLabel = (await toggle.getAttribute('aria-label') || '').toLowerCase();
      const ariaChecked = await toggle.getAttribute('aria-checked');

      if (ariaPressed === 'true' || checked !== null || ariaChecked === 'true') {
        return 'ENABLED';
      }
      if (ariaPressed === 'false' || ariaChecked === 'false') {
        return 'DISABLED';
      }
      // Fall back to label text
      if (ariaLabel.includes('disable')) {
        return 'ENABLED'; // button says "Disable" → currently enabled
      }
      if (ariaLabel.includes('enable')) {
        return 'DISABLED'; // button says "Enable" → currently disabled
      }
    }
  }

  // No toggle found — try text-based detection on the row
  const rowText = await ruleRow.textContent();
  if (/\benabled\b/i.test(rowText)) return 'ENABLED';
  if (/\bdisabled\b/i.test(rowText)) return 'DISABLED';

  return 'UNKNOWN';
}

// ─── Toggle a rule (enable or disable) ───────────────────────────────────────

async function toggleRule(ruleRow, targetState) {
  // Prefer a direct toggle button
  const toggleSelectors = [
    `button[aria-label*="${targetState === 'ENABLED' ? 'enable' : 'disable'}" i]`,
    'button[aria-pressed]',
    '[role="switch"]',
    'input[type="checkbox"]',
    // More actions menu approach
    'button[aria-label*="more" i]',
    'button[aria-label*="actions" i]',
    '[data-testid*="more-actions" i]',
    '[data-testid*="kebab" i]',
  ];

  for (const selector of toggleSelectors) {
    const toggle = await ruleRow.$(selector);
    if (toggle) {
      const isVisible = await toggle.isVisible();
      if (!isVisible) continue;

      const ariaLabel = (await toggle.getAttribute('aria-label') || '').toLowerCase();

      // Exact match: button says the action we want (e.g. "Enable rule" when we want ENABLED)
      if (
        (targetState === 'ENABLED' && ariaLabel.includes('enable')) ||
        (targetState === 'DISABLED' && ariaLabel.includes('disable'))
      ) {
        await toggle.click();
        return true;
      }

      // Toggle switch: just click it
      if (selector.includes('aria-pressed') || selector.includes('switch') || selector.includes('checkbox')) {
        await toggle.click();
        return true;
      }

      // If it's a "more actions" menu, open it and look for enable/disable option
      if (ariaLabel.includes('more') || ariaLabel.includes('actions') || selector.includes('kebab')) {
        await toggle.click();
        await ruleRow.page().waitForTimeout(500);

        const menuOptionText = targetState === 'ENABLED' ? 'enable' : 'disable';
        const menuOption = await ruleRow.page().$(`[role="menuitem"]:has-text("${menuOptionText}"), li:has-text("${menuOptionText}")`);
        if (menuOption) {
          await menuOption.click();
          return true;
        }

        // Close the menu if we opened it but couldn't find the option
        await ruleRow.page().keyboard.press('Escape');
      }
    }
  }

  return false;
}

// ─── Process a project's rules ────────────────────────────────────────────────

async function processProject(page, browser, projectKey, rules) {
  const projectRules = rules.filter(r => r.project === projectKey);
  if (projectRules.length === 0) return;

  console.log(`\n${'─'.repeat(55)}`);
  console.log(`Project: ${projectKey} (${projectRules.length} rule(s) to process)`);

  await navigateToAutomation(page, projectKey);

  // Wait for rules to load
  await page.waitForTimeout(3000);

  // Check for "no automation" or empty state
  const pageText = await page.textContent('body');
  if (pageText.includes('No rules') || pageText.includes('no automation rules')) {
    console.log(`  ⚠ No automation rules found on this page. Check that you have admin access to ${projectKey}.`);
    return;
  }

  for (const rule of projectRules) {
    console.log(`\n  [Phase ${rule.phase}] ${rule.description}`);
    console.log(`  Target state: ${rule.targetState}`);

    const found = await findRuleRow(page, rule.namePattern);

    if (!found) {
      console.log(`  ✗ Rule not found (pattern: ${rule.namePattern})`);
      console.log(`    → Open manually: ${JIRA_BASE}/jira/software/projects/${projectKey}/settings/automate`);
      continue;
    }

    console.log(`  Found: "${found.name}"`);

    const currentState = await getRuleState(found.element);
    console.log(`  Current state: ${currentState}`);

    if (currentState === rule.targetState) {
      console.log(`  ✓ Already in target state (${rule.targetState}) — no action needed`);
      if (!DRY_RUN) {
        await markDeployedInDashboard(rule.id);
      }
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would toggle from ${currentState} → ${rule.targetState}`);
      continue;
    }

    // Scroll the rule into view and attempt toggle
    await found.element.scrollIntoViewIfNeeded();
    const toggled = await toggleRule(found.element, rule.targetState);

    if (toggled) {
      await page.waitForTimeout(1500); // Wait for state change to apply
      const newState = await getRuleState(found.element);
      console.log(`  ✓ Toggled. New state: ${newState}`);

      if (newState === rule.targetState || newState === 'UNKNOWN') {
        await markDeployedInDashboard(rule.id);
      } else {
        console.log(`  ⚠ State mismatch after toggle — expected ${rule.targetState}, got ${newState}`);
        console.log(`    → Verify manually: ${JIRA_BASE}/jira/software/projects/${projectKey}/settings/automate`);
      }
    } else {
      console.log(`  ✗ Could not find toggle button — manual action required`);
      console.log(`    → Open: ${JIRA_BASE}/jira/software/projects/${projectKey}/settings/automate`);
      console.log(`    → Find "${found.name}" and set to ${rule.targetState}`);
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nJira Automation Deploy${DRY_RUN ? ' [DRY RUN]' : ''}`);
  console.log('─'.repeat(55));
  console.log('Phases: 1.1 (UKCAUD) · 1.2 (UKCAS) · 1.3 (UKCAUD) · 1.4 (UKCAS)');

  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    const projects = [...new Set(RULES.map(r => r.project))];

    for (const projectKey of projects) {
      await processProject(page, browser, projectKey, RULES);
    }

    console.log('\n' + '─'.repeat(55));
    console.log('Done. Browser stays open 2 minutes for review.');
    await page.waitForTimeout(120000);
  } catch (err) {
    console.error('\nError:', err.message);
    console.log('Browser stays open 2 minutes for review.');
    await page.waitForTimeout(120000);
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
