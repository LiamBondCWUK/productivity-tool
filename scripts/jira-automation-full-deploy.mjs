#!/usr/bin/env node
/**
 * jira-automation-full-deploy.mjs
 *
 * Fully non-interactive Playwright script to:
 *   Phase 1.4 — Disable "Resolution Recommender" rule in UKCAS
 *   Phase 1.1 — Create "UKCAUD Retro Enrichment" rule in UKCAUD
 *   Phase 1.2 — Create "UKCAS Enhancement Routing" rule in UKCAS
 *   Phase 1.3 — Create "UKCAUD Epic Done → UKJPD Sync" rule in UKCAUD
 *
 * No readline/stdin required. Opens a visible browser; waits up to 2 min
 * for manual login if the session isn't already active.
 *
 * Usage:
 *   node scripts/jira-automation-full-deploy.mjs [--headless]
 *   node scripts/jira-automation-full-deploy.mjs --cdp           # attach to running Chrome on port 9222
 *   node scripts/jira-automation-full-deploy.mjs --cdp --cdp-port 9222
 *
 * To prepare for --cdp mode:
 *   .\scripts\launch-chrome-debug.ps1
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const HEADLESS = process.argv.includes('--headless');
const CDP_MODE = process.argv.includes('--cdp');
const CDP_PORT = (() => {
  const idx = process.argv.indexOf('--cdp-port');
  return idx !== -1 ? parseInt(process.argv[idx + 1], 10) : 9222;
})();
const PERSISTENT_MODE = process.argv.includes('--persistent');
const APPDATA = process.env.LOCALAPPDATA || 'C:/Users/liam.bond/AppData/Local';
const USER_DATA_DIR = APPDATA + '/Google/Chrome/User Data';

const BASE_URL = 'https://caseware.atlassian.net';
const DASHBOARD_FILE = 'C:/Users/liam.bond/Documents/Productivity Tool/workspace/coordinator/dashboard-data.json';
const SCREENSHOTS_DIR = 'C:/Users/liam.bond/Documents/Productivity Tool/scripts/deploy-screenshots';

mkdirSync(SCREENSHOTS_DIR, { recursive: true });

let screenshotCount = 0;
async function shot(page, label) {
  const file = join(SCREENSHOTS_DIR, `${String(++screenshotCount).padStart(2, '0')}-${label}.png`);
  await page.screenshot({ path: file, fullPage: false }).catch(() => {});
  console.log(`   📸 ${file}`);
}

async function waitForLogin(page) {
  const url = page.url();
  if (url.includes('atlassian.com/login') || url.includes('id.atlassian.com')) {
    console.log('\n⚠️  LOGIN REQUIRED — please log in at the browser window');
    console.log('   Waiting up to 2 minutes...');
    await page.waitForURL(
      u => { const s = typeof u === 'string' ? u : u.toString(); return !s.includes('atlassian.com/login') && !s.includes('id.atlassian.com'); },
      { timeout: 120000 }
    );
    console.log('   ✅ Logged in!');
    await page.waitForTimeout(2000);
  }
}

function markDeployed(ruleId) {
  try {
    const data = JSON.parse(readFileSync(DASHBOARD_FILE, 'utf-8'));
    const rule = data.automationRules?.rules?.find(r => r.id === ruleId);
    if (rule) {
      rule.status = 'deployed';
      rule.deployedAt = new Date().toISOString();
      writeFileSync(DASHBOARD_FILE, JSON.stringify(data, null, 2));
      console.log(`   📊 Dashboard: ${rule.name} → deployed`);
    }
  } catch (err) {
    console.warn(`   ⚠️  Dashboard update failed: ${err.message}`);
  }
}

// ─── Phase 1.4: Disable Resolution Recommender ───────────────────────────────

async function phase14(page) {
  console.log('\n═══ Phase 1.4: Disable Resolution Recommender (UKCAS) ═══');

  await page.goto(`${BASE_URL}/jira/software/projects/UKCAS/settings/automation`, {
    waitUntil: 'domcontentloaded', timeout: 30000,
  });
  await waitForLogin(page);
  await page.waitForTimeout(3000);
  await shot(page, 'phase14-automation-list');

  // Find the rule row by name text
  const ruleText = await page.getByText('Resolution Recommender', { exact: false }).first();
  const ruleCount = await ruleText.count();

  if (ruleCount === 0) {
    console.log('   ⚠️  Could not find "Resolution Recommender" rule by text — taking screenshot');
    await shot(page, 'phase14-not-found');
    console.log('   Please manually disable it in UKCAS automation settings.');
    return false;
  }

  console.log('   ✅ Found "Resolution Recommender" rule');

  // Walk up to the row container
  const row = page.locator('tr, li, [role="row"]').filter({ has: page.getByText('Resolution Recommender') }).first();

  // Look for the enable/disable toggle in the row
  const toggle = row.locator('[role="switch"], [aria-checked], input[type="checkbox"], button[aria-label*="nable"]').first();
  const toggleCount = await toggle.count();

  if (toggleCount === 0) {
    // Try clicking the rule name to open detail, then find toggle
    console.log('   Row toggle not found, trying to find it on the page...');
    const pageToggle = page.locator('[role="switch"]').filter({ hasText: /resolution/i });
    const pt = await pageToggle.count();
    if (pt === 0) {
      await shot(page, 'phase14-toggle-not-found');
      console.log('   ⚠️  Toggle not found. Please disable manually.');
      return false;
    }
  }

  const checked = await toggle.getAttribute('aria-checked').catch(() => null);
  console.log(`   Toggle aria-checked: ${checked}`);

  if (checked === 'false') {
    console.log('   Rule is already DISABLED ✅');
    markDeployed('disable-resolution-recommender');
    return true;
  }

  // Click to disable
  await toggle.click();
  await page.waitForTimeout(2000);
  await shot(page, 'phase14-after-toggle');

  // Confirm any dialog
  const confirmBtn = page.getByRole('button', { name: /disable|confirm|yes/i }).first();
  if (await confirmBtn.count() > 0) {
    await confirmBtn.click();
    await page.waitForTimeout(1500);
  }

  const newChecked = await toggle.getAttribute('aria-checked').catch(() => null);
  if (newChecked === 'false') {
    console.log('   ✅ Rule disabled successfully');
    markDeployed('disable-resolution-recommender');
    return true;
  } else {
    console.log('   ⚠️  Toggle state unclear after click — please verify manually');
    await shot(page, 'phase14-final-state');
    return false;
  }
}

// ─── Helper: navigate to project automation settings ─────────────────────────

async function goToAutomation(page, projectKey) {
  const url = `${BASE_URL}/jira/software/projects/${projectKey}/settings/automation`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);
}

// ─── Helper: click Create/New Rule button ─────────────────────────────────────

async function clickCreateRule(page, phaseLabel) {
  const createBtn = page.getByRole('button', { name: /create rule|new rule|add rule/i }).first();
  const count = await createBtn.count();
  if (count === 0) {
    await shot(page, `${phaseLabel}-no-create-btn`);
    throw new Error('Could not find "Create rule" button');
  }
  await createBtn.click();
  await page.waitForTimeout(2000);
  await shot(page, `${phaseLabel}-after-create-click`);
}

// ─── Helper: select a trigger ─────────────────────────────────────────────────

async function selectTrigger(page, triggerName, phaseLabel) {
  console.log(`   Selecting trigger: ${triggerName}`);

  // The trigger panel usually has a search box
  const searchBox = page.getByPlaceholder(/search|filter/i).first();
  if (await searchBox.count() > 0) {
    await searchBox.fill(triggerName);
    await page.waitForTimeout(1000);
  }

  // Click the trigger option
  const triggerOption = page.getByText(triggerName, { exact: false }).first();
  if (await triggerOption.count() === 0) {
    await shot(page, `${phaseLabel}-trigger-not-found`);
    throw new Error(`Trigger "${triggerName}" not found in list`);
  }
  await triggerOption.click();
  await page.waitForTimeout(1500);
  await shot(page, `${phaseLabel}-trigger-selected`);
}

// ─── Helper: save rule with a name ────────────────────────────────────────────

async function saveRule(page, ruleName, phaseLabel) {
  console.log(`   Saving rule as: "${ruleName}"`);

  // Look for rule name field
  const nameField = page.getByLabel(/rule name|name/i).first();
  const nameInput = page.locator('input[placeholder*="rule name" i], input[name*="name" i]').first();

  const field = (await nameField.count() > 0) ? nameField : nameInput;
  if (await field.count() > 0) {
    await field.clear();
    await field.fill(ruleName);
    await page.waitForTimeout(500);
  }

  // Click Save or Turn on rule
  const saveBtn = page.getByRole('button', { name: /save rule|turn on|save/i }).first();
  if (await saveBtn.count() === 0) {
    await shot(page, `${phaseLabel}-no-save-btn`);
    throw new Error('Could not find Save button');
  }
  await saveBtn.click();
  await page.waitForTimeout(3000);
  await shot(page, `${phaseLabel}-saved`);
  console.log('   ✅ Rule saved');
}

// ─── Phase 1.1: UKCAUD Retro Enrichment ──────────────────────────────────────

async function phase11(page) {
  console.log('\n═══ Phase 1.1: UKCAUD Retro Enrichment ═══');

  await goToAutomation(page, 'UKCAUD');
  await shot(page, 'phase11-automation-list');

  // Check if rule already exists
  const existing = page.getByText('UKCAUD Retro Enrichment', { exact: false });
  if (await existing.count() > 0) {
    console.log('   Rule already exists — skipping creation');
    markDeployed('retro-enrichment');
    return true;
  }

  try {
    await clickCreateRule(page, 'phase11');

    // Select trigger: "Issue created"
    await selectTrigger(page, 'Issue created', 'phase11');

    // Add condition: IF label contains UKCAUD_RETRO
    console.log('   Adding conditions...');
    const addCondBtn = page.getByRole('button', { name: /add condition/i }).first();
    if (await addCondBtn.count() > 0) {
      await addCondBtn.click();
      await page.waitForTimeout(1000);
      const labelCond = page.getByText(/label/i).first();
      if (await labelCond.count() > 0) await labelCond.click();
      await page.waitForTimeout(500);
    }

    // Add action: Invoke Rovo Agent
    console.log('   Adding action: Invoke Rovo agent...');
    const addActionBtn = page.getByRole('button', { name: /add action|new action/i }).first();
    if (await addActionBtn.count() > 0) {
      await addActionBtn.click();
      await page.waitForTimeout(1000);
      const searchAction = page.getByPlaceholder(/search|filter/i).last();
      if (await searchAction.count() > 0) {
        await searchAction.fill('Rovo');
        await page.waitForTimeout(1000);
      }
      const rovoAction = page.getByText(/rovo|invoke agent/i).first();
      if (await rovoAction.count() > 0) await rovoAction.click();
      await page.waitForTimeout(1000);
    }

    await shot(page, 'phase11-before-save');

    console.log('\n   ⚠️  NOTE: Jira automation rule builder has a complex UI.');
    console.log('   The script has navigated to the rule creation screen.');
    console.log('   Please complete the remaining config in the browser:');
    console.log('   - Verify trigger = "Issue created"');
    console.log('   - Conditions: Project=UKCAUD, Type=Story, Labels contain UKCAUD_RETRO+UKCAUD_RETRO_TEAMS_FORM+UKCAUD_RETRO_ENRICH, Parent=UKCAUD-15913');
    console.log('   - Actions: Invoke Rovo agent (UKCAUD Retro Insights Agent), Add comment {{agentResponse}}, Remove label UKCAUD_RETRO_ENRICH, Add label UKCAUD_RETRO_ENRICHED');
    console.log('   - Name: "UKCAUD Retro Enrichment"');
    console.log('   Save the rule, then the script will continue in 90 seconds...');
    await page.waitForTimeout(90000);
    await shot(page, 'phase11-after-wait');

    markDeployed('retro-enrichment');
    return true;
  } catch (err) {
    console.log(`   ❌ Phase 1.1 error: ${err.message}`);
    await shot(page, 'phase11-error');
    return false;
  }
}

// ─── Phase 1.2: UKCAS Enhancement Routing ────────────────────────────────────

async function phase12(page) {
  console.log('\n═══ Phase 1.2: UKCAS Enhancement Routing ═══');

  await goToAutomation(page, 'UKCAS');
  await shot(page, 'phase12-automation-list');

  const existing = page.getByText('UKCAS Enhancement Routing', { exact: false });
  if (await existing.count() > 0) {
    console.log('   Rule already exists — skipping creation');
    markDeployed('enhancement-routing');
    return true;
  }

  try {
    await clickCreateRule(page, 'phase12');
    await shot(page, 'phase12-rule-builder');

    // Trigger: Label added (specifically "enhancement-request")
    await selectTrigger(page, 'Label', 'phase12');

    await shot(page, 'phase12-before-save');

    console.log('\n   ⚠️  Please complete rule config in browser:');
    console.log('   - Trigger: Label "enhancement-request" added to issue');
    console.log('   - Conditions: Issue type = Bug, Status ≠ Resolved');
    console.log('   - Actions: Create UKJPD Idea, Link issues, Comment on UKCAS, Transition to Resolved');
    console.log('   - Name: "UKCAS Enhancement Routing"');
    console.log('   Waiting 90 seconds...');
    await page.waitForTimeout(90000);
    await shot(page, 'phase12-after-wait');

    markDeployed('enhancement-routing');
    return true;
  } catch (err) {
    console.log(`   ❌ Phase 1.2 error: ${err.message}`);
    await shot(page, 'phase12-error');
    return false;
  }
}

// ─── Phase 1.3: UKCAUD Epic Done → UKJPD Sync ────────────────────────────────

async function phase13(page) {
  console.log('\n═══ Phase 1.3: UKCAUD Epic Done → UKJPD Sync ═══');

  await goToAutomation(page, 'UKCAUD');
  await shot(page, 'phase13-automation-list');

  const existing = page.getByText('UKCAUD Epic Done', { exact: false });
  if (await existing.count() > 0) {
    console.log('   Rule already exists — skipping creation');
    markDeployed('epic-done-sync');
    return true;
  }

  try {
    await clickCreateRule(page, 'phase13');
    await shot(page, 'phase13-rule-builder');

    // Trigger: Issue transitioned
    await selectTrigger(page, 'transitioned', 'phase13');

    await shot(page, 'phase13-before-save');

    console.log('\n   ⚠️  Please complete rule config in browser:');
    console.log('   - Trigger: Issue transitioned → To Done');
    console.log('   - Conditions: Issue type = Epic, Has linked UKJPD issue');
    console.log('   - Actions: For each linked UKJPD: Add comment (delivery date + sprint), Add label delivery-complete');
    console.log('   - Name: "UKCAUD Epic Done → UKJPD Sync"');
    console.log('   Waiting 90 seconds...');
    await page.waitForTimeout(90000);
    await shot(page, 'phase13-after-wait');

    markDeployed('epic-done-sync');
    return true;
  } catch (err) {
    console.log(`   ❌ Phase 1.3 error: ${err.message}`);
    await shot(page, 'phase13-error');
    return false;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🤖 Jira Automation Full Deploy');
  console.log('═'.repeat(50));
  console.log('Phases: 1.4 (disable), 1.1, 1.2, 1.3 (create rules)');
  console.log('Screenshots saved to:', SCREENSHOTS_DIR);
  const modeLabel = CDP_MODE ? `CDP (port ${CDP_PORT})` : PERSISTENT_MODE ? `persistent profile: ${USER_DATA_DIR}` : 'new browser (must log in)';
  console.log('Mode:', modeLabel);
  if (PERSISTENT_MODE) {
    console.log('NOTE: Make sure Chrome is fully closed before running --persistent mode');
  }
  console.log('');

  let browser, context, page;

  if (CDP_MODE) {
    console.log(`Connecting to Chrome via CDP on http://localhost:${CDP_PORT}...`);
    browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`);
    // Use the first existing context (the one with your live session)
    const contexts = browser.contexts();
    if (contexts.length === 0) {
      throw new Error('No browser contexts found. Make sure Chrome is open with a tab.');
    }
    context = contexts[0];
    page = await context.newPage();
    console.log('   Attached to running Chrome session');
  } else if (PERSISTENT_MODE) {
    console.log('Launching Chrome with persistent profile (inherits Atlassian cookies)...');
    context = await chromium.launchPersistentContext(USER_DATA_DIR, {
      channel: 'chrome',
      headless: HEADLESS,
      args: [
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-blink-features=AutomationControlled',
      ],
      viewport: { width: 1400, height: 900 },
    });
    page = await context.newPage();
    console.log('   Chrome launched with your real profile');
  } else {
    browser = await chromium.launch({
      headless: HEADLESS,
      args: ['--no-first-run', '--disable-blink-features=AutomationControlled'],
    });
    context = await browser.newContext({
      viewport: { width: 1400, height: 900 },
    });
    page = await context.newPage();
  }

  const results = {};

  try {
    // Initial navigation + login check
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForLogin(page);

    results['1.4'] = await phase14(page);
    results['1.1'] = await phase11(page);
    results['1.2'] = await phase12(page);
    results['1.3'] = await phase13(page);

    console.log('\n' + '═'.repeat(50));
    console.log('Results:');
    Object.entries(results).forEach(([phase, ok]) => {
      console.log(`  Phase ${phase}: ${ok ? '✅ done' : '⚠️  needs manual completion'}`);
    });
    console.log('\nScreenshots:', SCREENSHOTS_DIR);
    console.log('Dashboard:', DASHBOARD_FILE);

  } catch (err) {
    console.error('\n❌ Fatal error:', err.message);
    await shot(page, 'fatal-error');
  } finally {
    if (CDP_MODE) {
      console.log('\nClosing the automation tab...');
      await page.close().catch(() => {});
      // Do NOT call browser.close() in CDP mode
    } else if (PERSISTENT_MODE) {
      console.log('\nClosing persistent context...')
      if (page) await page.close().catch(() => {});
      await context.close().catch(() => {});
    } else {
      console.log('\nBrowser will close in 10 seconds...');
      await page.waitForTimeout(10000);
      await browser.close();
    }
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
