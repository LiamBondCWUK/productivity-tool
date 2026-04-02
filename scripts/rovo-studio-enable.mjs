/**
 * rovo-studio-enable.mjs
 *
 * Playwright automation to enable Rovo Studio agents for phases 2.1 and 2.2.
 *
 * What it does:
 *   Phase 2.1 — Enable "Readiness Checker" Rovo agent
 *   Phase 2.2 — Enable "Theme Analyzer" Rovo agent
 *
 * After each successful enable, calls PATCH /api/automation on localhost:3000
 * to mark the agent as deployed in the dashboard (if dashboard is running).
 *
 * Usage:
 *   node scripts/rovo-studio-enable.mjs
 *   node scripts/rovo-studio-enable.mjs --dry-run   (navigate only, no clicks)
 *
 * Notes:
 *   Rovo Studio does not have a public API — browser-only interaction required.
 *   The script tries multiple known Rovo entry points in order.
 */

import { chromium } from 'playwright';
import path from 'path';
import os from 'os';

const DRY_RUN = process.argv.includes('--dry-run');
const ATLASSIAN_BASE = 'https://caseware.atlassian.net';
const DASHBOARD_API = 'http://localhost:3000/api/automation';
const EDGE_PROFILE = path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data');

// ─── Agent definitions ────────────────────────────────────────────────────────

const AGENTS = [
  {
    id: 'readiness-checker',
    phase: '2.1',
    namePattern: /readiness.?checker|readiness checker/i,
    description: 'Readiness Checker — assesses ticket readiness before sprint planning',
  },
  {
    id: 'theme-analyzer',
    phase: '2.2',
    namePattern: /theme.?analyzer|theme analyzer/i,
    description: 'Theme Analyzer — identifies themes across UKJPD backlog',
  },
];

// ─── Known Rovo Studio entry points (tried in order) ─────────────────────────

const ROVO_URLS = [
  `${ATLASSIAN_BASE}/rovo/studio`,
  `${ATLASSIAN_BASE}/rovo`,
  `https://rovo.atlassian.com`,
  `${ATLASSIAN_BASE}/plugins/servlet/ac/com.atlassian.rovo.rovo-jira/rovo-studio`,
  `${ATLASSIAN_BASE}/admin/rovo`,
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

  const tmpDir = path.join(os.tmpdir(), 'playwright-rovo-' + Date.now());
  const ctx = await chromium.launchPersistentContext(tmpDir, {
    headless: false,
    args: ['--no-first-run', '--no-default-browser-check'],
  });
  console.log('Fresh Chromium launched. You may need to log into Atlassian manually.');
  return ctx;
}

// ─── Dashboard API helper ─────────────────────────────────────────────────────

async function markDeployedInDashboard(agentId) {
  try {
    const res = await fetch(DASHBOARD_API, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: agentId, status: 'deployed' }),
    });
    if (res.ok) {
      console.log(`  ✓ Dashboard updated: ${agentId} → deployed`);
    } else {
      console.log(`  ⚠ Dashboard API returned ${res.status} (dashboard may not be running)`);
    }
  } catch {
    console.log(`  ⚠ Dashboard API unreachable (is pm2 running? Try: pm2 start)`);
  }
}

// ─── Navigate to Rovo Studio ──────────────────────────────────────────────────

async function navigateToRovoStudio(page) {
  for (const url of ROVO_URLS) {
    console.log(`\n  Trying: ${url}`);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(2000);

      const currentUrl = page.url();

      // Handle login redirect
      if (currentUrl.includes('login') || currentUrl.includes('signin') || currentUrl.includes('id.atlassian')) {
        console.log('  ⚠ Redirected to login. Please log in, then the script will continue...');
        await page.waitForURL(u => !u.includes('login') && !u.includes('signin'), { timeout: 120000 });
        await page.waitForTimeout(3000);
      }

      // Check if we landed on a useful page
      const bodyText = await page.textContent('body');

      if (
        bodyText.toLowerCase().includes('rovo') ||
        bodyText.toLowerCase().includes('agent') ||
        currentUrl.includes('rovo')
      ) {
        console.log(`  ✓ Found Rovo page at: ${page.url()}`);
        return true;
      }

      // 404 or redirect to unrelated page — try next URL
      if (res?.status === 404 || currentUrl.includes('error') || currentUrl.includes('404')) {
        console.log(`  ✗ Not found, trying next URL...`);
        continue;
      }
    } catch (err) {
      console.log(`  ✗ Failed (${err.message.split('\n')[0]}), trying next URL...`);
    }
  }

  return false;
}

// ─── Find agent by name pattern ───────────────────────────────────────────────

async function findAgent(page, namePattern) {
  // Rovo Studio typically lists agents as cards or list items
  const candidateSelectors = [
    '[data-testid*="agent"]',
    '[class*="agent"]',
    '[class*="Agent"]',
    '.agent-card',
    '[role="listitem"]',
    '[role="article"]',
    'li',
    'div[data-component-type="agent"]',
  ];

  // Try structured selectors first
  for (const selector of candidateSelectors) {
    const elements = await page.$$(selector);
    for (const el of elements) {
      try {
        const text = await el.textContent();
        if (text && namePattern.test(text)) {
          return { element: el, name: text.trim().substring(0, 80) };
        }
      } catch {
        // element detached
      }
    }
  }

  // Fallback: scan all text-containing elements
  const allElements = await page.$$('span, h2, h3, h4, p, div');
  for (const el of allElements) {
    try {
      const text = await el.textContent();
      if (text && namePattern.test(text.trim())) {
        // Walk up to find a container
        const container = await el.evaluateHandle(node => {
          let current = node;
          for (let i = 0; i < 6; i++) {
            if (!current.parentElement) break;
            current = current.parentElement;
            const className = current.className || '';
            const role = current.getAttribute('role') || '';
            if (
              className.toLowerCase().includes('card') ||
              className.toLowerCase().includes('agent') ||
              className.toLowerCase().includes('item') ||
              role === 'listitem' ||
              role === 'article'
            ) {
              return current;
            }
          }
          return current;
        });

        const containerEl = container.asElement();
        if (containerEl) {
          return { element: containerEl, name: text.trim().substring(0, 80) };
        }
      }
    } catch {
      // skip
    }
  }

  return null;
}

// ─── Check if agent is already enabled ───────────────────────────────────────

async function isAgentEnabled(agentElement) {
  // Look for status indicators within the agent card
  const text = await agentElement.textContent();
  const lowerText = text.toLowerCase();

  // Direct state labels
  if (lowerText.includes('enabled') || lowerText.includes('active') || lowerText.includes('deployed')) {
    return true;
  }
  if (lowerText.includes('disabled') || lowerText.includes('inactive')) {
    return false;
  }

  // Look for toggle/switch
  const toggle = await agentElement.$('input[type="checkbox"], [role="switch"], button[aria-pressed]');
  if (toggle) {
    const ariaPressed = await toggle.getAttribute('aria-pressed');
    const checked = await toggle.getAttribute('checked');
    const ariaChecked = await toggle.getAttribute('aria-checked');

    if (ariaPressed === 'true' || checked !== null || ariaChecked === 'true') return true;
    if (ariaPressed === 'false' || ariaChecked === 'false') return false;
  }

  return null; // Unknown
}

// ─── Enable an agent ─────────────────────────────────────────────────────────

async function enableAgent(page, agentElement) {
  // Priority order: direct enable button, then toggle, then "more actions" menu
  const enableSelectors = [
    'button:has-text("Enable")',
    'button:has-text("Activate")',
    'button[aria-label*="enable" i]',
    'button[aria-label*="activate" i]',
    '[role="switch"]',
    'input[type="checkbox"]',
    'button[aria-pressed="false"]',
  ];

  // Try within the agent element first
  for (const selector of enableSelectors) {
    const btn = await agentElement.$(selector);
    if (btn) {
      const isVisible = await btn.isVisible();
      if (isVisible) {
        await btn.click();
        return true;
      }
    }
  }

  // Try clicking on the agent card/name to open its detail page, then enable from there
  await agentElement.click();
  await page.waitForTimeout(2000);

  // Now look for enable button on the detail page
  for (const selector of enableSelectors) {
    const btn = await page.$(selector);
    if (btn) {
      const isVisible = await btn.isVisible();
      if (isVisible) {
        await btn.click();
        return true;
      }
    }
  }

  return false;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nRovo Studio Agent Enable${DRY_RUN ? ' [DRY RUN]' : ''}`);
  console.log('─'.repeat(55));
  console.log('Agents: 2.1 Readiness Checker · 2.2 Theme Analyzer');

  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    const found = await navigateToRovoStudio(page);

    if (!found) {
      console.log('\n⚠ Could not find Rovo Studio automatically.');
      console.log('  Please navigate to Rovo Studio manually in the browser window.');
      console.log('  Then press Enter in this terminal to continue...');

      // Give the user 3 minutes to navigate manually
      await page.waitForTimeout(180000);
    }

    console.log('\nSearching for agents...');

    for (const agent of AGENTS) {
      console.log(`\n  [Phase ${agent.phase}] ${agent.description}`);

      // Refresh/scroll to make sure all agents are loaded
      await page.waitForTimeout(1000);

      const found = await findAgent(page, agent.namePattern);

      if (!found) {
        console.log(`  ✗ Agent not found on current page`);
        console.log(`    → Enable manually in Rovo Studio, then click Done in the dashboard`);
        continue;
      }

      console.log(`  Found: "${found.name.substring(0, 60)}"`);

      const alreadyEnabled = await isAgentEnabled(found.element);

      if (alreadyEnabled === true) {
        console.log(`  ✓ Already enabled — marking deployed in dashboard`);
        if (!DRY_RUN) {
          await markDeployedInDashboard(agent.id);
        }
        continue;
      }

      if (DRY_RUN) {
        console.log(`  [DRY RUN] Would click Enable`);
        continue;
      }

      await found.element.scrollIntoViewIfNeeded();
      const enabled = await enableAgent(page, found.element);

      if (enabled) {
        await page.waitForTimeout(1500);
        console.log(`  ✓ Enabled successfully`);
        await markDeployedInDashboard(agent.id);
      } else {
        console.log(`  ✗ Could not find Enable button — manual action required`);
        console.log(`    → Enable in Rovo Studio, then click Done in dashboard at localhost:3000`);
      }
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
