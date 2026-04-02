#!/usr/bin/env node
/**
 * playwright-jira-automation.mjs
 *
 * Automates Jira Automation tasks for phases 1.1–1.4 and opens Rovo Studio for 2.1/2.2.
 *
 * Phases:
 *   1.4 — Disable stale Resolution Recommender rule (019d1f89) in UKCAS automation
 *   1.1, 1.2, 1.3 — Navigate to Jira Automation editor pages for manual creation
 *   2.1, 2.2 — Open Rovo Studio for manual enablement
 *
 * Usage:
 *   node scripts/playwright-jira-automation.mjs [--headless]
 *
 * The script launches a visible browser (headful by default) so you can interact
 * when needed. It will pause and prompt you if it needs you to log in.
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import readline from 'readline';

const HEADLESS = process.argv.includes('--headless');
const BASE_URL = 'https://caseware.atlassian.net';
const DASHBOARD_FILE = 'C:/Users/liam.bond/Documents/Productivity Tool/workspace/coordinator/dashboard-data.json';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => { rl.close(); resolve(answer); });
  });
}

async function waitForLogin(page) {
  // page.url() is synchronous in Playwright
  const currentUrl = page.url();
  const isLoginPage = currentUrl.includes('atlassian.com/login') || currentUrl.includes('id.atlassian.com');
  if (isLoginPage) {
    console.log('\n⚠️  You need to log into Atlassian.');
    console.log('   Please log in in the browser window, then press Enter here to continue...');
    await prompt('   [Press Enter when logged in]');
    // Wait for navigation away from login
    await page.waitForURL(url => !url.includes('atlassian.com/login') && !url.includes('id.atlassian.com'), { timeout: 60000 });
    console.log('   ✅ Logged in!');
  }
}

async function markDeployed(ruleId) {
  try {
    const data = JSON.parse(readFileSync(DASHBOARD_FILE, 'utf-8'));
    const rule = data.automationRules?.rules?.find(r => r.id === ruleId);
    if (rule && rule.status !== 'deployed') {
      rule.status = 'deployed';
      rule.deployedAt = new Date().toISOString();
      writeFileSync(DASHBOARD_FILE, JSON.stringify(data, null, 2));
      console.log(`   📊 Dashboard updated: ${rule.name} → deployed`);
    }
  } catch (err) {
    console.warn(`   ⚠️  Could not update dashboard: ${err.message}`);
  }
}

// ─── Phase 1.4: Disable Resolution Recommender ───────────────────────────────

async function phase14DisableRule(page) {
  console.log('\n── Phase 1.4: Disable Resolution Recommender (UKCAS rule 019d1f89) ──');

  await page.goto(`${BASE_URL}/jira/software/projects/UKCAS/settings/automation`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await waitForLogin(page);

  // Wait for automation list to load
  await page.waitForSelector('[data-testid="automation-rule-list"], .automation-rule-list, [class*="RuleList"], table', {
    timeout: 15000,
  }).catch(() => console.log('   ℹ️  Could not detect rule list container — continuing anyway'));

  await page.waitForTimeout(2000);

  // Try to find the rule by name or ID
  const ruleLocators = [
    page.getByText('Resolution Recommender', { exact: false }),
    page.getByText('019d1f89', { exact: false }),
    page.locator('[data-rule-id*="019d1f89"]'),
  ];

  let foundRule = null;
  for (const loc of ruleLocators) {
    const count = await loc.count();
    if (count > 0) {
      foundRule = loc.first();
      console.log('   ✅ Found Resolution Recommender rule');
      break;
    }
  }

  if (!foundRule) {
    // Take a screenshot to help diagnose
    await page.screenshot({ path: 'C:/Users/liam.bond/Documents/Productivity Tool/scripts/phase14-debug.png' });
    console.log('   ⚠️  Could not locate the rule automatically.');
    console.log('   📸 Screenshot saved to scripts/phase14-debug.png');
    console.log('   Please manually find rule "Resolution Recommender" (019d1f89) and disable it.');
    console.log('   Then press Enter to continue...');
    await prompt('   [Press Enter when done]');
    await markDeployed('disable-resolution-recommender');
    return;
  }

  // Look for the toggle near the rule
  const ruleRow = await foundRule.locator('xpath=ancestor::tr, ancestor::li, ancestor::div[@role="row"]').first();

  // Try to find a toggle/switch within the row
  const toggleSelectors = [
    '[role="switch"]',
    'button[aria-checked]',
    '[class*="toggle"]',
    '[class*="Toggle"]',
    'input[type="checkbox"]',
  ];

  let toggleFound = false;
  for (const sel of toggleSelectors) {
    const toggle = ruleRow.locator(sel).first();
    const toggleCount = await toggle.count();
    if (toggleCount > 0) {
      const isEnabled = await toggle.getAttribute('aria-checked') || await toggle.isChecked().catch(() => 'unknown');
      console.log(`   ℹ️  Toggle found, current state: ${isEnabled}`);

      if (isEnabled === 'true' || isEnabled === true) {
        await toggle.click();
        await page.waitForTimeout(1000);
        console.log('   ✅ Clicked toggle — rule should now be DISABLED');
        toggleFound = true;
      } else if (isEnabled === 'false' || isEnabled === false) {
        console.log('   ✅ Rule is already disabled — no action needed');
        toggleFound = true;
      } else {
        await toggle.click();
        await page.waitForTimeout(1000);
        console.log('   ✅ Clicked toggle (state was ambiguous)');
        toggleFound = true;
      }
      break;
    }
  }

  if (!toggleFound) {
    console.log('   ⚠️  Could not find toggle automatically. Please disable the rule manually.');
    await prompt('   [Press Enter when the rule is disabled]');
  }

  await markDeployed('disable-resolution-recommender');
  console.log('   ✅ Phase 1.4 complete');
}

// ─── Phase 1.1: Open UKCAUD automation page ───────────────────────────────────

async function phase11OpenPage(page) {
  console.log('\n── Phase 1.1: UKCAUD Retro Enrichment Rule ──');
  console.log('   Opening UKCAUD Automation settings...');

  await page.goto(`${BASE_URL}/jira/software/projects/UKCAUD/settings/automation`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  console.log('');
  console.log('   📋 Rule spec for 1.1 — UKCAUD Retro Enrichment:');
  console.log('   Trigger: Issue created');
  console.log('   Conditions:');
  console.log('     • Project = UKCAUD');
  console.log('     • Issue type = Story');
  console.log('     • Labels contain: UKCAUD_RETRO + UKCAUD_RETRO_TEAMS_FORM + UKCAUD_RETRO_ENRICH');
  console.log('     • Parent = UKCAUD-15913');
  console.log('   Actions:');
  console.log('     1. Invoke Rovo agent → UKCAUD Retro Insights Agent');
  console.log('     2. Add comment: {{agentResponse}}');
  console.log('     3. Remove label: UKCAUD_RETRO_ENRICH');
  console.log('     4. Add label: UKCAUD_RETRO_ENRICHED');
  console.log('   Name: "UKCAUD Retro Enrichment"');
  console.log('');
  console.log('   Click "Create rule" in the browser to begin.');
  await prompt('   [Press Enter when you have saved the rule]');
  await markDeployed('retro-enrichment');
  console.log('   ✅ Phase 1.1 marked complete');
}

// ─── Phase 1.2: Open UKCAS automation page ───────────────────────────────────

async function phase12OpenPage(page) {
  console.log('\n── Phase 1.2: UKCAS → UKJPD Enhancement Routing ──');
  console.log('   Opening UKCAS Automation settings...');

  await page.goto(`${BASE_URL}/jira/software/projects/UKCAS/settings/automation`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  console.log('');
  console.log('   📋 Rule spec for 1.2 — Enhancement Routing:');
  console.log('   Trigger: Label "enhancement-request" added to issue');
  console.log('   Conditions:');
  console.log('     • Issue type = Bug');
  console.log('     • Status ≠ Resolved');
  console.log('   Actions:');
  console.log('     1. Create UKJPD Idea');
  console.log('        Summary: [Routed from UKCAS-{{issue.key}}] {{issue.summary}}');
  console.log('        Description: {{issue.description}}');
  console.log('     2. Link UKCAS issue → UKJPD Idea ("is tracked by")');
  console.log('     3. Comment on UKCAS: "Enhancement routed to UKJPD: {{createdIssue.key}}"');
  console.log('     4. Transition UKCAS to Resolved (Resolution = "Enhancement - Routed to JPD")');
  console.log('   Name: "UKCAS Enhancement Routing"');
  console.log('');
  await prompt('   [Press Enter when you have saved the rule]');
  await markDeployed('enhancement-routing');
  console.log('   ✅ Phase 1.2 marked complete');
}

// ─── Phase 1.3: Open UKCAUD automation page ───────────────────────────────────

async function phase13OpenPage(page) {
  console.log('\n── Phase 1.3: UKCAUD Epic Done → UKJPD Status Sync ──');
  console.log('   Opening UKCAUD Automation settings...');

  await page.goto(`${BASE_URL}/jira/software/projects/UKCAUD/settings/automation`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  console.log('');
  console.log('   📋 Rule spec for 1.3 — Epic Done → UKJPD Sync:');
  console.log('   Trigger: Issue transitioned → To Done');
  console.log('   Conditions:');
  console.log('     • Issue type = Epic');
  console.log('     • Has linked issue in UKJPD');
  console.log('   Actions:');
  console.log('     For each linked UKJPD issue:');
  console.log('       1. Add comment: "Delivery complete: UKCAUD Epic {{issue.key}} marked Done');
  console.log('          on {{now.format("dd MMM yyyy")}}. Sprint: {{issue.sprint}}."');
  console.log('       2. Add label: delivery-complete');
  console.log('   Name: "UKCAUD Epic Done → UKJPD Sync"');
  console.log('');
  await prompt('   [Press Enter when you have saved the rule]');
  await markDeployed('epic-done-sync');
  console.log('   ✅ Phase 1.3 marked complete');
}

// ─── Phase 2.1 + 2.2: Open Rovo Studio ───────────────────────────────────────

async function phase21And22RovoStudio(page) {
  console.log('\n── Phase 2.1 + 2.2: Rovo Studio agents ──');
  console.log('   Opening Rovo Studio...');

  await page.goto(`${BASE_URL}/rovo`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  console.log('');
  console.log('   📋 2.1 — Enable "Readiness Checker" on UKCAUD project');
  console.log('         Look for it in Rovo Studio → Agent Library → Readiness Checker');
  console.log('         Enable it and scope to UKCAUD project');
  console.log('');
  await prompt('   [Press Enter when Readiness Checker is enabled]');
  await markDeployed('readiness-checker');

  console.log('   📋 2.2 — Enable "Jira Theme Analyzer" on UKJPD project');
  console.log('         Look for: Rovo Studio → Agent Library → Jira Theme Analyzer');
  console.log('         Enable it and scope to UKJPD project');
  console.log('');
  await prompt('   [Press Enter when Theme Analyzer is enabled]');
  await markDeployed('theme-analyzer');

  console.log('   ✅ Phase 2.1 + 2.2 complete');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🤖 Jira Automation — Playwright Runner');
  console.log('═'.repeat(50));
  console.log('This script will automate Phase 1.4 and guide you through 1.1–1.3 and 2.1–2.2.');
  console.log('A browser window will open — please keep it visible.\n');

  const browser = await chromium.launch({
    headless: HEADLESS,
    channel: 'chrome', // Use system Chrome (likely already logged into Atlassian)
    args: ['--no-first-run', '--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });

  const page = await context.newPage();

  try {
    // First navigate to Atlassian to check login status
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForLogin(page);

    // Run each phase
    await phase14DisableRule(page);
    await phase11OpenPage(page);
    await phase12OpenPage(page);
    await phase13OpenPage(page);
    await phase21And22RovoStudio(page);

    // Final summary
    console.log('\n' + '═'.repeat(50));
    console.log('🎉 All phases complete!');

    // Print final state
    const data = JSON.parse(readFileSync(DASHBOARD_FILE, 'utf-8'));
    const rules = data.automationRules?.rules ?? [];
    console.log('\nFinal automation status:');
    rules.forEach(r => {
      const icon = r.status === 'deployed' ? '✅' : r.status === 'blocked' ? '🚫' : '⏳';
      console.log(`  ${icon} [${r.phase}] ${r.name} — ${r.status}`);
    });
    console.log('\n📋 Check your dashboard at http://localhost:3000 for the live view.');

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    await page.screenshot({ path: 'C:/Users/liam.bond/Documents/Productivity Tool/scripts/error-screenshot.png' }).catch(() => {});
    console.error('Screenshot saved to scripts/error-screenshot.png');
  } finally {
    await prompt('\n[Press Enter to close the browser]');
    await browser.close();
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
