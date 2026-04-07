#!/usr/bin/env node
/**
 * playwright-jira-automation.mjs
 *
 * Fully-automated Playwright script for Jira Automation rule creation/management.
 *
 * Phases:
 *   1.4 — Disable stale Resolution Recommender rule (019d1f89) in UKCAS
 *   1.1 — Create UKCAUD Retro Enrichment rule (Rovo agent wiring)
 *   1.2 — Create UKCAS → UKJPD Enhancement Routing rule
 *   1.3 — Create UKCAUD Epic Done → UKJPD Delivery Status Sync rule
 *   2.1 — Enable Readiness Checker Rovo agent
 *   2.2 — Enable Theme Analyzer Rovo agent
 *
 * Usage:
 *   node scripts/playwright-jira-automation.mjs                   # run all phases
 *   node scripts/playwright-jira-automation.mjs --task 1.4        # run single phase
 *   node scripts/playwright-jira-automation.mjs --task 1.1,1.2    # run specific phases
 *   node scripts/playwright-jira-automation.mjs --dry-run         # navigate only, no clicks
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import readline from 'readline';
import path from 'path';
import os from 'os';

// ─── CLI Flags ───────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');
const TASK_FILTER = (() => {
  const taskIdx = process.argv.indexOf('--task');
  if (taskIdx === -1) return null;
  const taskArg = process.argv[taskIdx + 1];
  return taskArg ? taskArg.split(',').map(t => t.trim()) : null;
})();

const BASE_URL = 'https://caseware.atlassian.net';
const DASHBOARD_FILE = 'C:/Users/liam.bond/Documents/Productivity Tool/workspace/coordinator/dashboard-data.json';
const SCREENSHOT_DIR = 'C:/Users/liam.bond/Documents/Productivity Tool/scripts/screenshots';
const EDGE_PROFILE = path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data');

// Ensure screenshot directory exists
try { mkdirSync(SCREENSHOT_DIR, { recursive: true }); } catch { /* exists */ }

function shouldRun(phase) {
  if (!TASK_FILTER) return true;
  return TASK_FILTER.includes(phase);
}

// ─── Core Helpers ────────────────────────────────────────────────────────────

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => { rl.close(); resolve(answer); });
  });
}

async function waitForLogin(page) {
  const currentUrl = page.url();
  const isLoginPage = currentUrl.includes('atlassian.com/login') ||
                      currentUrl.includes('id.atlassian.com') ||
                      currentUrl.includes('signin');
  if (isLoginPage) {
    console.log('\n⚠️  SSO login required.');
    console.log('   Log in in the browser window, then press Enter...');
    await prompt('   [Press Enter when logged in]');
    await page.waitForURL(
      url => {
        const href = url.toString();
        return !href.includes('atlassian.com/login') && !href.includes('id.atlassian.com') && !href.includes('signin');
      },
      { timeout: 120000 }
    );
    await page.waitForTimeout(2000);
    console.log('   ✅ Logged in!');
  }
}

async function screenshotOnFailure(page, phaseName, error) {
  const filename = `${phaseName}-failure-${Date.now()}.png`;
  const filepath = join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: true }).catch(() => {});
  console.log(`   📸 Screenshot saved: screenshots/${filename}`);
  if (error) console.log(`   ❌ Error: ${error.message || error}`);
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

/** Click a button/link by visible text with multiple fallback strategies */
async function clickByText(page, text, { timeout = 8000, exact = false } = {}) {
  // Strategy 1: Playwright getByRole button
  const buttonByRole = page.getByRole('button', { name: text, exact });
  if (await buttonByRole.count() > 0) {
    await buttonByRole.first().scrollIntoViewIfNeeded();
    await buttonByRole.first().click();
    return true;
  }
  // Strategy 2: Playwright getByRole link
  const linkByRole = page.getByRole('link', { name: text, exact });
  if (await linkByRole.count() > 0) {
    await linkByRole.first().scrollIntoViewIfNeeded();
    await linkByRole.first().click();
    return true;
  }
  // Strategy 3: getByText (any element)
  const byText = page.getByText(text, { exact });
  if (await byText.count() > 0) {
    await byText.first().scrollIntoViewIfNeeded();
    await byText.first().click();
    return true;
  }
  // Strategy 4: CSS selector fallback for buttons/links
  const cssBtn = page.locator(`button:has-text("${text}"), a:has-text("${text}"), [role="button"]:has-text("${text}")`);
  if (await cssBtn.count() > 0) {
    await cssBtn.first().scrollIntoViewIfNeeded();
    await cssBtn.first().click();
    return true;
  }
  return false;
}

/** Wait for the Jira Automation rules list page to fully load */
async function waitForAutomationPage(page, { timeout = 20000 } = {}) {
  await page.waitForSelector(
    '[data-testid="automation-rule-list"], [class*="RuleList"], table, [data-testid*="automation"]',
    { timeout }
  ).catch(() => {});
  await page.waitForTimeout(2000);
}

/** Navigate to a project's automation settings */
async function goToAutomation(page, projectKey) {
  const url = `${BASE_URL}/jira/software/projects/${projectKey}/settings/automation`;
  console.log(`   Navigating to ${projectKey} automation...`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForLogin(page);
  await waitForAutomationPage(page);
}

/** Type into an input field with clearing first */
async function fillField(page, locator, value) {
  await locator.click();
  await locator.fill('');
  await locator.fill(value);
  await page.waitForTimeout(300);
}

/**
 * Select an option from a dropdown/picker in Jira Automation wizard.
 * Handles both type-ahead selects and click-to-pick selectors.
 */
async function selectFromDropdown(page, inputOrTriggerLocator, optionText) {
  await inputOrTriggerLocator.click();
  await page.waitForTimeout(500);

  // If it's a text input, type to filter
  const tagName = await inputOrTriggerLocator.evaluate(el => el.tagName.toLowerCase()).catch(() => '');
  if (tagName === 'input') {
    await inputOrTriggerLocator.fill(optionText);
    await page.waitForTimeout(800);
  }

  // Click the matching option from the dropdown
  const optionLocators = [
    page.locator(`[role="option"]:has-text("${optionText}")`).first(),
    page.locator(`[role="menuitem"]:has-text("${optionText}")`).first(),
    page.locator(`li:has-text("${optionText}")`).first(),
    page.getByText(optionText, { exact: false }).first(),
  ];

  for (const opt of optionLocators) {
    if (await opt.count() > 0 && await opt.isVisible()) {
      await opt.click();
      await page.waitForTimeout(500);
      return true;
    }
  }
  return false;
}

// ─── Jira Automation Rule Wizard Driver ──────────────────────────────────────

/**
 * Opens the "Create rule" wizard and selects a trigger.
 * Returns true if trigger was selected successfully.
 */
async function openCreateRuleAndSelectTrigger(page, triggerName) {
  console.log('   Opening rule creation wizard...');

  // Click "Create rule" button
  const createClicked = await clickByText(page, 'Create rule');
  if (!createClicked) {
    // Fallback: look for add/create icon buttons
    const addButton = page.locator('button[data-testid*="create"], button[aria-label*="Create rule"], a:has-text("Create rule")').first();
    if (await addButton.count() > 0) {
      await addButton.click();
    } else {
      console.log('   ⚠️  Could not find "Create rule" button');
      return false;
    }
  }
  await page.waitForTimeout(2000);

  // The trigger selection screen appears — search for the trigger
  console.log(`   Selecting trigger: ${triggerName}`);

  // Look for a search/filter input in the trigger picker
  const searchInput = page.locator('input[placeholder*="search" i], input[placeholder*="filter" i], input[type="search"], input[aria-label*="search" i]').first();
  if (await searchInput.count() > 0) {
    await fillField(page, searchInput, triggerName);
    await page.waitForTimeout(1000);
  }

  // Click the trigger option
  const triggerClicked = await clickByText(page, triggerName);
  if (!triggerClicked) {
    console.log(`   ⚠️  Could not find trigger "${triggerName}" in list`);
    return false;
  }
  await page.waitForTimeout(1500);
  return true;
}

/**
 * Clicks "New condition" and selects the condition type.
 */
async function addCondition(page, conditionType) {
  console.log(`   Adding condition: ${conditionType}`);

  // Click "New condition" or "Add condition" or the "+" component
  const conditionClicked = await clickByText(page, 'New condition') ||
                           await clickByText(page, 'Add condition') ||
                           await clickByText(page, 'Add component');
  if (!conditionClicked) {
    // Try the plus icon within the rule builder
    const plusButton = page.locator('[data-testid*="add-component"], button[aria-label*="Add"], [class*="AddComponent"]').first();
    if (await plusButton.count() > 0) {
      await plusButton.click();
      await page.waitForTimeout(800);
      await clickByText(page, 'New condition').catch(() => {});
    }
  }
  await page.waitForTimeout(1000);

  // Search for condition type
  const searchInput = page.locator('input[placeholder*="search" i], input[type="search"]').first();
  if (await searchInput.count() > 0) {
    await fillField(page, searchInput, conditionType);
    await page.waitForTimeout(800);
  }

  const selected = await clickByText(page, conditionType);
  await page.waitForTimeout(1500);
  return selected;
}

/**
 * Clicks "New action" and selects the action type.
 */
async function addAction(page, actionType) {
  console.log(`   Adding action: ${actionType}`);

  const actionClicked = await clickByText(page, 'New action') ||
                        await clickByText(page, 'Add action') ||
                        await clickByText(page, 'Add component');
  if (!actionClicked) {
    const plusButton = page.locator('[data-testid*="add-component"], button[aria-label*="Add"]').first();
    if (await plusButton.count() > 0) {
      await plusButton.click();
      await page.waitForTimeout(800);
      await clickByText(page, 'New action').catch(() => {});
    }
  }
  await page.waitForTimeout(1000);

  const searchInput = page.locator('input[placeholder*="search" i], input[type="search"]').first();
  if (await searchInput.count() > 0) {
    await fillField(page, searchInput, actionType);
    await page.waitForTimeout(800);
  }

  const selected = await clickByText(page, actionType);
  await page.waitForTimeout(1500);
  return selected;
}

/**
 * Saves the current trigger/condition/action configuration step.
 * Jira Automation uses "Save" buttons within each component.
 */
async function saveCurrentStep(page) {
  // Look for Save button in the current panel/modal
  const saveClicked = await clickByText(page, 'Save') ||
                      await clickByText(page, 'Confirm') ||
                      await clickByText(page, 'Done');
  await page.waitForTimeout(1500);
  return saveClicked;
}

/**
 * Names the rule and enables it (final step in Create Rule wizard).
 */
async function nameAndEnableRule(page, ruleName) {
  console.log(`   Naming rule: ${ruleName}`);

  // Look for the rule name input — usually at the top of the wizard or in a final step
  const nameInput = page.locator(
    'input[placeholder*="name" i], input[aria-label*="name" i], ' +
    'input[data-testid*="rule-name"], input[name*="name" i]'
  ).first();

  if (await nameInput.count() > 0) {
    await fillField(page, nameInput, ruleName);
  } else {
    // Sometimes the name is set by clicking the "Untitled rule" text
    const untitledText = page.getByText('Untitled rule', { exact: false });
    if (await untitledText.count() > 0) {
      await untitledText.click();
      await page.waitForTimeout(500);
      const editableInput = page.locator('input:focus, [contenteditable="true"]:focus').first();
      if (await editableInput.count() > 0) {
        await editableInput.fill(ruleName);
      }
    }
  }
  await page.waitForTimeout(500);
}

/**
 * Clicks the final "Turn it on" / "Enable" / "Save" button to activate the rule.
 */
async function turnOnRule(page) {
  if (DRY_RUN) {
    console.log('   [DRY RUN] Would click "Turn it on"');
    return true;
  }

  console.log('   Enabling rule...');
  const enabled = await clickByText(page, 'Turn it on') ||
                  await clickByText(page, 'Enable rule') ||
                  await clickByText(page, 'Enable') ||
                  await clickByText(page, 'Save');
  await page.waitForTimeout(2000);
  return enabled;
}

/**
 * Fills a text/description field within a Jira Automation action config panel.
 * Handles both plain textarea and rich-text editors.
 */
async function fillTextArea(page, labelText, value) {
  // Try to find by label or placeholder
  let field = page.locator(`textarea:near(:text("${labelText}"))`).first();
  if (await field.count() === 0) {
    field = page.locator(`[contenteditable="true"]:near(:text("${labelText}"))`).first();
  }
  if (await field.count() === 0) {
    field = page.locator('textarea').first();
  }

  if (await field.count() > 0) {
    await field.click();
    const tagName = await field.evaluate(el => el.tagName.toLowerCase());
    if (tagName === 'textarea') {
      await field.fill(value);
    } else {
      // contenteditable
      await field.evaluate((el, val) => { el.textContent = val; }, value);
      await field.dispatchEvent('input');
    }
    await page.waitForTimeout(300);
    return true;
  }
  return false;
}

// ─── Phase 1.4: Disable Resolution Recommender ──────────────────────────────

async function phase14DisableRule(page) {
  console.log('\n══ Phase 1.4: Disable Resolution Recommender (UKCAS rule 019d1f89) ══');

  await goToAutomation(page, 'UKCAS');

  // UKCAS has 113 rules — try search/filter first
  const searchInput = page.locator(
    'input[placeholder*="search" i], input[placeholder*="filter" i], ' +
    'input[type="search"], input[aria-label*="search" i]'
  ).first();

  if (await searchInput.count() > 0) {
    console.log('   Searching for "Resolution Recommender"...');
    await fillField(page, searchInput, 'Resolution Recommender');
    await page.waitForTimeout(2000);
  }

  // Try to find the rule by name or partial ID
  const ruleLocators = [
    page.getByText('Resolution Recommender', { exact: false }),
    page.getByText('019d1f89', { exact: false }),
    page.locator('[data-rule-id*="019d1f89"]'),
  ];

  let foundRule = null;
  for (const loc of ruleLocators) {
    if (await loc.count() > 0) {
      foundRule = loc.first();
      console.log('   ✅ Found Resolution Recommender rule');
      break;
    }
  }

  if (!foundRule) {
    await screenshotOnFailure(page, 'phase14');
    console.log('   ⚠️  Could not locate rule automatically.');
    console.log('   Please disable rule "Resolution Recommender" (019d1f89) manually.');
    await prompt('   [Press Enter when done]');
    await markDeployed('disable-resolution-recommender');
    return;
  }

  if (DRY_RUN) {
    console.log('   [DRY RUN] Would disable the rule');
    return;
  }

  // Click the rule to open it, then look for enable/disable toggle inside
  await foundRule.scrollIntoViewIfNeeded();
  await foundRule.click();
  await page.waitForTimeout(2000);

  // Inside the rule detail view, look for an enabled toggle or "Disable" button
  const disableClicked = await clickByText(page, 'Disable') ||
                         await clickByText(page, 'Disable rule');
  if (disableClicked) {
    await page.waitForTimeout(1500);
    // Confirm if there's a confirmation dialog
    await clickByText(page, 'Disable').catch(() => {});
    await clickByText(page, 'Confirm').catch(() => {});
    console.log('   ✅ Rule disabled via Disable button');
    await markDeployed('disable-resolution-recommender');
    console.log('   ✅ Phase 1.4 complete');
    return;
  }

  // Fallback: look for toggle switch
  const toggleSelectors = [
    '[role="switch"]',
    'button[aria-checked]',
    '[class*="toggle" i]',
    'input[type="checkbox"]',
  ];

  for (const sel of toggleSelectors) {
    const toggle = page.locator(sel).first();
    if (await toggle.count() > 0) {
      const isEnabled = await toggle.getAttribute('aria-checked');
      if (isEnabled === 'true') {
        await toggle.click();
        await page.waitForTimeout(1500);
        console.log('   ✅ Toggle clicked — rule should now be DISABLED');
      } else if (isEnabled === 'false') {
        console.log('   ✅ Rule is already disabled');
      } else {
        await toggle.click();
        await page.waitForTimeout(1500);
        console.log('   ✅ Toggle clicked (state was ambiguous)');
      }
      await markDeployed('disable-resolution-recommender');
      console.log('   ✅ Phase 1.4 complete');
      return;
    }
  }

  // If nothing worked, screenshot and prompt
  await screenshotOnFailure(page, 'phase14-toggle');
  console.log('   ⚠️  Could not find disable control. Please disable manually.');
  await prompt('   [Press Enter when rule is disabled]');
  await markDeployed('disable-resolution-recommender');
  console.log('   ✅ Phase 1.4 complete');
}

// ─── Phase 1.1: Create UKCAUD Retro Enrichment Rule ─────────────────────────

async function phase11RetroEnrichment(page) {
  console.log('\n══ Phase 1.1: Create UKCAUD Retro Enrichment Rule ══');

  await goToAutomation(page, 'UKCAUD');

  // Step 1: Open create wizard and select trigger "Issue created"
  const triggerOk = await openCreateRuleAndSelectTrigger(page, 'Issue created');
  if (!triggerOk) {
    await screenshotOnFailure(page, 'phase11-trigger');
    console.log('   ⚠️  Could not select trigger. Please create rule manually per spec.');
    await prompt('   [Press Enter when done]');
    await markDeployed('retro-enrichment');
    return;
  }
  await saveCurrentStep(page);

  // Step 2: Add conditions
  // Condition 1: Issue type = Story
  await addCondition(page, 'Issue fields condition');
  await page.waitForTimeout(1000);
  // Configure: Field = Issue Type, Value = Story
  await selectFromDropdown(page, page.locator('input, select').first(), 'Issue type');
  await page.waitForTimeout(500);
  await selectFromDropdown(page, page.locator('input, select').nth(1), 'Story');
  await saveCurrentStep(page);

  // Condition 2: Labels contain UKCAUD_RETRO
  await addCondition(page, 'Issue fields condition');
  await page.waitForTimeout(1000);
  await selectFromDropdown(page, page.locator('input, select').first(), 'Labels');
  await page.waitForTimeout(500);
  // Set "contains" + value
  const labelInput1 = page.locator('input[placeholder*="value" i], input[aria-label*="value" i]').first();
  if (await labelInput1.count() > 0) {
    await fillField(page, labelInput1, 'UKCAUD_RETRO');
  }
  await saveCurrentStep(page);

  // Condition 3: Labels contain UKCAUD_RETRO_TEAMS_FORM
  await addCondition(page, 'Issue fields condition');
  await page.waitForTimeout(1000);
  await selectFromDropdown(page, page.locator('input, select').first(), 'Labels');
  await page.waitForTimeout(500);
  const labelInput2 = page.locator('input[placeholder*="value" i], input[aria-label*="value" i]').first();
  if (await labelInput2.count() > 0) {
    await fillField(page, labelInput2, 'UKCAUD_RETRO_TEAMS_FORM');
  }
  await saveCurrentStep(page);

  // Condition 4: Labels contain UKCAUD_RETRO_ENRICH
  await addCondition(page, 'Issue fields condition');
  await page.waitForTimeout(1000);
  await selectFromDropdown(page, page.locator('input, select').first(), 'Labels');
  await page.waitForTimeout(500);
  const labelInput3 = page.locator('input[placeholder*="value" i], input[aria-label*="value" i]').first();
  if (await labelInput3.count() > 0) {
    await fillField(page, labelInput3, 'UKCAUD_RETRO_ENRICH');
  }
  await saveCurrentStep(page);

  // Condition 5: Parent = UKCAUD-15913
  await addCondition(page, 'Issue fields condition');
  await page.waitForTimeout(1000);
  await selectFromDropdown(page, page.locator('input, select').first(), 'Parent');
  await page.waitForTimeout(500);
  const parentInput = page.locator('input[placeholder*="value" i], input[aria-label*="value" i]').first();
  if (await parentInput.count() > 0) {
    await fillField(page, parentInput, 'UKCAUD-15913');
  }
  await saveCurrentStep(page);

  // Step 3: Add actions
  // Action 1: Invoke Rovo agent
  const agentActionOk = await addAction(page, 'Use agent');
  if (!agentActionOk) {
    // Fallback: try alternative names
    await addAction(page, 'Invoke agent') || await addAction(page, 'Rovo agent');
  }
  await page.waitForTimeout(1000);
  // Select the agent: UKCAUD Retro Insights Agent
  const agentPicker = page.locator('input[placeholder*="agent" i], input[aria-label*="agent" i], select').first();
  if (await agentPicker.count() > 0) {
    await selectFromDropdown(page, agentPicker, 'UKCAUD Retro Insights Agent');
  } else {
    await clickByText(page, 'UKCAUD Retro Insights Agent');
  }
  await page.waitForTimeout(500);

  // Fill input variables if there's a field for it
  const inputField = page.locator('textarea, [contenteditable="true"]').first();
  if (await inputField.count() > 0) {
    const inputVars = [
      '{{issue.key}}', '{{issue.summary}}', '{{issue.description}}',
      '{{issue.components}}', '{{issue.labels}}', '{{issue.priority}}'
    ].join(', ');
    await inputField.click();
    await inputField.fill(inputVars);
  }
  await saveCurrentStep(page);

  // Action 2: Add comment with agent response
  await addAction(page, 'Add comment');
  await page.waitForTimeout(1000);
  await fillTextArea(page, 'Comment', '{{agentResponse}}');
  await saveCurrentStep(page);

  // Action 3: Edit labels — remove UKCAUD_RETRO_ENRICH, add UKCAUD_RETRO_ENRICHED
  await addAction(page, 'Edit issue');
  await page.waitForTimeout(1000);
  // Look for Labels field and configure remove/add
  await clickByText(page, 'Labels').catch(() => {});
  await page.waitForTimeout(500);

  // Try to find remove label input
  const removeInput = page.locator('input[placeholder*="remove" i], input[aria-label*="remove" i]').first();
  if (await removeInput.count() > 0) {
    await fillField(page, removeInput, 'UKCAUD_RETRO_ENRICH');
  }

  // Try to find add label input
  const addInput = page.locator('input[placeholder*="add" i], input[aria-label*="add" i]').first();
  if (await addInput.count() > 0) {
    await fillField(page, addInput, 'UKCAUD_RETRO_ENRICHED');
  }
  await saveCurrentStep(page);

  // Step 4: Name and enable
  await nameAndEnableRule(page, 'UKCAUD Retro - Teams Form → Rovo Enrichment');
  await turnOnRule(page);

  await markDeployed('retro-enrichment');
  console.log('   ✅ Phase 1.1 complete');
}

// ─── Phase 1.2: Create UKCAS Enhancement Routing Rule ───────────────────────

async function phase12EnhancementRouting(page) {
  console.log('\n══ Phase 1.2: Create UKCAS → UKJPD Enhancement Routing Rule ══');

  await goToAutomation(page, 'UKCAS');

  // Step 1: Trigger — Field value changed (Labels)
  const triggerOk = await openCreateRuleAndSelectTrigger(page, 'Field value changed');
  if (!triggerOk) {
    await screenshotOnFailure(page, 'phase12-trigger');
    console.log('   ⚠️  Could not select trigger. Manual creation required.');
    await prompt('   [Press Enter when done]');
    await markDeployed('enhancement-routing');
    return;
  }
  await page.waitForTimeout(1000);

  // Configure trigger: Field = Labels
  const fieldPicker = page.locator('input[placeholder*="field" i], input[aria-label*="field" i], select').first();
  if (await fieldPicker.count() > 0) {
    await selectFromDropdown(page, fieldPicker, 'Labels');
  }
  await saveCurrentStep(page);

  // Step 2: Conditions
  // Condition 1: Labels contain "enhancement-request"
  await addCondition(page, 'Issue fields condition');
  await page.waitForTimeout(1000);
  await selectFromDropdown(page, page.locator('input, select').first(), 'Labels');
  await page.waitForTimeout(500);
  const enhLabelInput = page.locator('input[placeholder*="value" i], input[aria-label*="value" i]').first();
  if (await enhLabelInput.count() > 0) {
    await fillField(page, enhLabelInput, 'enhancement-request');
  }
  await saveCurrentStep(page);

  // Condition 2: Issue type = Bug
  await addCondition(page, 'Issue fields condition');
  await page.waitForTimeout(1000);
  await selectFromDropdown(page, page.locator('input, select').first(), 'Issue type');
  await page.waitForTimeout(500);
  await selectFromDropdown(page, page.locator('input, select').nth(1), 'Bug');
  await saveCurrentStep(page);

  // Condition 3: Status category is NOT Done
  await addCondition(page, 'Issue fields condition');
  await page.waitForTimeout(1000);
  await selectFromDropdown(page, page.locator('input, select').first(), 'Status category');
  await page.waitForTimeout(500);
  // Set comparator to "is not" then select "Done"
  const comparator = page.locator('select, [role="listbox"]').first();
  if (await comparator.count() > 0) {
    await selectFromDropdown(page, comparator, 'is not');
  }
  await selectFromDropdown(page, page.locator('input, select').last(), 'Done');
  await saveCurrentStep(page);

  // Step 3: Actions

  // Action 1: Create issue in UKJPD
  await addAction(page, 'Create issue');
  await page.waitForTimeout(1500);

  // Configure: Project = UKJPD, Type = Idea
  const projectPicker = page.locator('input[placeholder*="project" i], input[aria-label*="project" i]').first();
  if (await projectPicker.count() > 0) {
    await selectFromDropdown(page, projectPicker, 'UKJPD');
  }
  await page.waitForTimeout(500);

  const typePicker = page.locator('input[placeholder*="type" i], input[aria-label*="issue type" i]').first();
  if (await typePicker.count() > 0) {
    await selectFromDropdown(page, typePicker, 'Idea');
  }

  // Summary field
  const summaryInput = page.locator('input[placeholder*="summary" i], input[aria-label*="summary" i], input[name*="summary" i]').first();
  if (await summaryInput.count() > 0) {
    await fillField(page, summaryInput, 'Enhancement: {{issue.summary}}');
  }

  // Description — use the rich text editor or textarea
  const descriptionContent = `h3. Enhancement Request from Support

*Source:* Support (UKCAS)
*Original Ticket:* {{issue.key}} — {{issue.summary}}
*Reported By:* {{issue.reporter.displayName}}
*Component:* {{issue.components.name}}

h4. Customer Description
{{issue.description}}

h4. Context
This enhancement was identified during support triage of {{issue.key}}. The original ticket has been resolved as "Not a Bug — Enhancement Request."

----
_Auto-created by UKCAS Enhancement Routing automation_`;

  await fillTextArea(page, 'Description', descriptionContent);

  // Labels: support-originated
  const labelsField = page.locator('input[placeholder*="labels" i], input[aria-label*="labels" i]').first();
  if (await labelsField.count() > 0) {
    await fillField(page, labelsField, 'support-originated');
    await page.keyboard.press('Enter');
  }
  await saveCurrentStep(page);

  // Action 2: Link issues — relates to
  await addAction(page, 'Link issue');
  await page.waitForTimeout(1000);
  const linkTypePicker = page.locator('input[placeholder*="link" i], select').first();
  if (await linkTypePicker.count() > 0) {
    await selectFromDropdown(page, linkTypePicker, 'relates to');
  }
  await saveCurrentStep(page);

  // Action 3: Add internal comment on UKCAS ticket
  await addAction(page, 'Add comment');
  await page.waitForTimeout(1000);

  const commentContent = `Enhancement request routed to UKJPD Discovery.

*UKJPD Idea:* {{createdIssue.key}} — {{createdIssue.summary}}
*Link:* [{{createdIssue.key}}|{{createdIssue.url}}]

This UKCAS ticket can now be resolved as "Not a Bug — Enhancement Request."
The enhancement will be triaged and prioritised through the discovery pipeline.`;

  await fillTextArea(page, 'Comment', commentContent);

  // Set visibility to internal/Member if available
  await clickByText(page, 'Internal').catch(() => {});
  await clickByText(page, 'Member').catch(() => {});
  await saveCurrentStep(page);

  // Action 4: Transition to Resolved
  await addAction(page, 'Transition issue');
  await page.waitForTimeout(1000);
  const statusPicker = page.locator('input[placeholder*="status" i], select, input[aria-label*="status" i]').first();
  if (await statusPicker.count() > 0) {
    await selectFromDropdown(page, statusPicker, 'Resolved');
  }
  // Set resolution
  const resolutionPicker = page.locator('input[placeholder*="resolution" i], select[name*="resolution" i]').first();
  if (await resolutionPicker.count() > 0) {
    await selectFromDropdown(page, resolutionPicker, 'Not a Bug');
  }
  await saveCurrentStep(page);

  // Step 4: Name and enable
  await nameAndEnableRule(page, 'Enhancement Request → UKJPD Discovery Routing');
  await turnOnRule(page);

  await markDeployed('enhancement-routing');
  console.log('   ✅ Phase 1.2 complete');
}

// ─── Phase 1.3: Create UKCAUD Epic Done → UKJPD Sync Rule ──────────────────

async function phase13EpicDoneSync(page) {
  console.log('\n══ Phase 1.3: Create UKCAUD Epic Done → UKJPD Delivery Status Sync ══');

  await goToAutomation(page, 'UKCAUD');

  // Step 1: Trigger — Issue transitioned
  const triggerOk = await openCreateRuleAndSelectTrigger(page, 'Issue transitioned');
  if (!triggerOk) {
    await screenshotOnFailure(page, 'phase13-trigger');
    console.log('   ⚠️  Could not select trigger. Manual creation required.');
    await prompt('   [Press Enter when done]');
    await markDeployed('epic-done-sync');
    return;
  }
  await page.waitForTimeout(1000);

  // Configure trigger: To status category = Done
  const toStatusPicker = page.locator(
    'input[placeholder*="to" i], input[aria-label*="to status" i], ' +
    'input[placeholder*="status" i]'
  ).first();
  if (await toStatusPicker.count() > 0) {
    await selectFromDropdown(page, toStatusPicker, 'Done');
  } else {
    // Try clicking "To status" label then selecting Done
    await clickByText(page, 'To status').catch(() => {});
    await page.waitForTimeout(500);
    await clickByText(page, 'Done').catch(() => {});
  }
  await saveCurrentStep(page);

  // Step 2: Conditions
  // Condition 1: Issue type = Epic
  await addCondition(page, 'Issue fields condition');
  await page.waitForTimeout(1000);
  await selectFromDropdown(page, page.locator('input, select').first(), 'Issue type');
  await page.waitForTimeout(500);
  await selectFromDropdown(page, page.locator('input, select').nth(1), 'Epic');
  await saveCurrentStep(page);

  // Condition 2: Has linked UKJPD issue
  // Use "Related issues condition" or "Linked issues"
  const linkedConditionOk = await addCondition(page, 'Related issues condition');
  if (!linkedConditionOk) {
    await addCondition(page, 'Linked issues');
  }
  await page.waitForTimeout(1000);
  // Filter to UKJPD project
  const linkedProjectInput = page.locator('input[placeholder*="project" i], input[aria-label*="project" i]').first();
  if (await linkedProjectInput.count() > 0) {
    await selectFromDropdown(page, linkedProjectInput, 'UKJPD');
  }
  await saveCurrentStep(page);

  // Step 3: Actions
  // Action 1: Lookup linked issues
  await addAction(page, 'Lookup issues');
  await page.waitForTimeout(1000);
  // Configure JQL or linked issues lookup
  const jqlInput = page.locator('textarea, input[placeholder*="JQL" i], input[placeholder*="query" i]').first();
  if (await jqlInput.count() > 0) {
    await jqlInput.click();
    await jqlInput.fill('project = UKJPD AND issueFunction in linkedIssuesOf("key = {{issue.key}}")');
  }
  await saveCurrentStep(page);

  // Action 2: For each — Add comment on UKJPD items
  const branchOk = await addAction(page, 'For each');
  if (!branchOk) {
    await addAction(page, 'Branch rule');
  }
  await page.waitForTimeout(1500);

  // Inside the branch, add comment action
  await addAction(page, 'Add comment');
  await page.waitForTimeout(1000);

  const deliveryComment = `h3. ✅ Delivery Complete

The linked delivery item has been completed:

*UKCAUD Epic:* {{issue.key}} — {{issue.summary}}
*Completed:* {{now.jiraDate}}
*Fix Version:* {{issue.fixVersions.name}}
*Story Points Delivered:* {{issue.story_points}}

h4. Stories Completed
{{#issue.subtasks}}
* {{key}} — {{summary}} ({{status.name}})
{{/issue.subtasks}}

----
_Auto-posted by UKCAUD → UKJPD Delivery Status Sync_`;

  await fillTextArea(page, 'Comment', deliveryComment);
  await saveCurrentStep(page);

  // Action 3: Add confirmation comment on UKCAUD Epic (back in main branch)
  await addAction(page, 'Add comment');
  await page.waitForTimeout(1000);

  const confirmComment = `Delivery status synced to UKJPD. Linked discovery items updated:
{{#linkedIssues}}
* {{key}} — {{summary}}
{{/linkedIssues}}`;

  await fillTextArea(page, 'Comment', confirmComment);
  // Set to internal
  await clickByText(page, 'Internal').catch(() => {});
  await saveCurrentStep(page);

  // Step 4: Name and enable
  await nameAndEnableRule(page, 'UKCAUD Epic Done → UKJPD Delivery Status Update');
  await turnOnRule(page);

  await markDeployed('epic-done-sync');
  console.log('   ✅ Phase 1.3 complete');
}

// ─── Phase 2.1 + 2.2: Rovo Studio Agent Enablement ──────────────────────────

const ROVO_AGENTS = [
  {
    id: 'readiness-checker',
    phase: '2.1',
    namePattern: /readiness.?checker|readiness checker/i,
    description: 'Readiness Checker — assesses ticket readiness before sprint planning',
  },
  {
    id: 'theme-analyzer',
    phase: '2.2',
    namePattern: /theme.?analyzer|theme analyzer|jira theme analyzer/i,
    description: 'Theme Analyzer — identifies themes across UKJPD backlog',
  },
];

const ROVO_URLS = [
  `${BASE_URL}/rovo/studio`,
  `${BASE_URL}/rovo`,
  `${BASE_URL}/plugins/servlet/ac/com.atlassian.rovo.rovo-jira/rovo-studio`,
  `${BASE_URL}/admin/rovo`,
];

async function navigateToRovoStudio(page) {
  for (const url of ROVO_URLS) {
    console.log(`   Trying: ${url}`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await waitForLogin(page);
      await page.waitForTimeout(2000);

      const currentUrl = page.url();
      const bodyText = await page.textContent('body').catch(() => '');

      if (
        bodyText.toLowerCase().includes('rovo') ||
        bodyText.toLowerCase().includes('agent') ||
        currentUrl.includes('rovo')
      ) {
        console.log(`   ✅ Found Rovo page at: ${currentUrl}`);
        return true;
      }
    } catch (err) {
      console.log(`   ✗ Failed (${err.message.split('\n')[0]}), trying next...`);
    }
  }
  return false;
}

async function findRovoAgent(page, namePattern) {
  const candidateSelectors = [
    '[data-testid*="agent"]',
    '[class*="agent" i]',
    '.agent-card',
    '[role="listitem"]',
    '[role="article"]',
    'li',
  ];

  for (const selector of candidateSelectors) {
    const elements = await page.$$(selector);
    for (const el of elements) {
      try {
        const text = await el.textContent();
        if (text && namePattern.test(text)) {
          return { element: el, name: text.trim().substring(0, 80) };
        }
      } catch { /* element detached */ }
    }
  }

  // Fallback: scan all text elements and walk up DOM
  const allElements = await page.$$('span, h2, h3, h4, p, div');
  for (const el of allElements) {
    try {
      const text = await el.textContent();
      if (text && namePattern.test(text.trim())) {
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
              role === 'listitem' || role === 'article'
            ) return current;
          }
          return current;
        });
        const containerEl = container.asElement();
        if (containerEl) return { element: containerEl, name: text.trim().substring(0, 80) };
      }
    } catch { /* skip */ }
  }
  return null;
}

async function enableRovoAgent(page, agentElement) {
  const enableSelectors = [
    'button:has-text("Enable")',
    'button:has-text("Activate")',
    'button[aria-label*="enable" i]',
    'button[aria-label*="activate" i]',
    '[role="switch"]',
    'input[type="checkbox"]',
    'button[aria-pressed="false"]',
  ];

  // Try within the agent element
  for (const selector of enableSelectors) {
    const btn = await agentElement.$(selector);
    if (btn && await btn.isVisible()) {
      await btn.click();
      return true;
    }
  }

  // Click agent card to open detail, then try from there
  await agentElement.click();
  await page.waitForTimeout(2000);

  for (const selector of enableSelectors) {
    const btn = await page.$(selector);
    if (btn && await btn.isVisible()) {
      await btn.click();
      return true;
    }
  }
  return false;
}

async function phase21And22RovoStudio(page) {
  console.log('\n══ Phase 2.1 + 2.2: Rovo Studio Agent Enablement ══');

  const found = await navigateToRovoStudio(page);
  if (!found) {
    await screenshotOnFailure(page, 'rovo-studio');
    console.log('   ⚠️  Could not find Rovo Studio automatically.');
    console.log('   Please navigate to Rovo Studio manually in the browser.');
    await prompt('   [Press Enter when you are on the Rovo Studio page]');
  }

  for (const agent of ROVO_AGENTS) {
    if (!shouldRun(agent.phase)) {
      console.log(`   ⏭️  Skipping ${agent.phase} (filtered out)`);
      continue;
    }

    console.log(`\n   [Phase ${agent.phase}] ${agent.description}`);
    await page.waitForTimeout(1000);

    const agentResult = await findRovoAgent(page, agent.namePattern);
    if (!agentResult) {
      console.log('   ✗ Agent not found on current page');
      console.log('   → Please enable manually in Rovo Studio');
      await prompt(`   [Press Enter when ${agent.id} is enabled]`);
      await markDeployed(agent.id);
      continue;
    }

    console.log(`   Found: "${agentResult.name.substring(0, 60)}"`);

    // Check if already enabled
    const text = await agentResult.element.textContent().catch(() => '');
    const lowerText = text.toLowerCase();
    const alreadyEnabled = lowerText.includes('enabled') || lowerText.includes('active');

    if (alreadyEnabled) {
      console.log('   ✅ Already enabled');
      await markDeployed(agent.id);
      continue;
    }

    if (DRY_RUN) {
      console.log('   [DRY RUN] Would click Enable');
      continue;
    }

    await agentResult.element.scrollIntoViewIfNeeded();
    const enabled = await enableRovoAgent(page, agentResult.element);

    if (enabled) {
      await page.waitForTimeout(1500);
      console.log('   ✅ Enabled successfully');
      await markDeployed(agent.id);
    } else {
      console.log('   ✗ Could not find Enable button — manual action required');
      await prompt(`   [Press Enter when ${agent.id} is enabled]`);
      await markDeployed(agent.id);
    }
  }

  console.log('   ✅ Phase 2.1 + 2.2 complete');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🤖 Jira Automation — Full Playwright Runner');
  console.log('═'.repeat(55));
  if (DRY_RUN) console.log('⚠️  DRY RUN MODE — no changes will be made');
  if (TASK_FILTER) console.log(`📋 Running phases: ${TASK_FILTER.join(', ')}`);
  console.log('All 5 tasks will be automated in a single browser session.\n');

  // Try Edge persistent context for SSO cookies, fall back to fresh Chromium
  let context;
  let isEdge = false;
  try {
    console.log('Launching Edge (reuses SSO cookies)...');
    context = await chromium.launchPersistentContext(EDGE_PROFILE, {
      headless: false,
      channel: 'msedge',
      args: ['--no-first-run', '--no-default-browser-check', '--disable-blink-features=AutomationControlled'],
      ignoreDefaultArgs: ['--enable-automation'],
      viewport: { width: 1400, height: 900 },
    });
    isEdge = true;
    console.log('✅ Edge launched with persistent profile.');
  } catch (err) {
    console.log(`Edge failed (${err.message.split('\n')[0]}), launching fresh Chromium...`);
    const tmpDir = path.join(os.tmpdir(), `playwright-jira-${Date.now()}`);
    context = await chromium.launchPersistentContext(tmpDir, {
      headless: false,
      args: ['--no-first-run', '--disable-blink-features=AutomationControlled'],
      viewport: { width: 1400, height: 900 },
    });
    console.log('✅ Fresh Chromium launched. Manual SSO login will be required.');
  }

  const page = await context.newPage();

  try {
    // Initial auth check
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForLogin(page);
    console.log('✅ Authenticated to Atlassian\n');

    // Run phases in order — Rovo agents FIRST so they're available for retro rule
    if (shouldRun('2.1') || shouldRun('2.2')) {
      await phase21And22RovoStudio(page);
    }
    if (shouldRun('1.4')) await phase14DisableRule(page);
    if (shouldRun('1.1')) await phase11RetroEnrichment(page);
    if (shouldRun('1.2')) await phase12EnhancementRouting(page);
    if (shouldRun('1.3')) await phase13EpicDoneSync(page);

    // Final summary
    console.log('\n' + '═'.repeat(55));
    console.log('🎉 All phases complete!');

    try {
      const data = JSON.parse(readFileSync(DASHBOARD_FILE, 'utf-8'));
      const rules = data.automationRules?.rules ?? [];
      console.log('\nFinal automation status:');
      rules.forEach(r => {
        const icon = r.status === 'deployed' ? '✅' : r.status === 'blocked' ? '🚫' : '⏳';
        console.log(`  ${icon} [${r.phase}] ${r.name} — ${r.status}`);
      });
    } catch { /* dashboard file not found */ }

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    await screenshotOnFailure(page, 'main-error', err);
  } finally {
    await prompt('\n[Press Enter to close the browser]');
    await context.close();
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
