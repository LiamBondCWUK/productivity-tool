/**
 * Replit GitHub import automation
 * Uses Edge (avoids Chrome profile lock) with fallback to fresh Chromium
 */
import { chromium } from 'playwright';
import path from 'path';
import os from 'os';

const REPO = 'LiamBondCWUK/productivity-tool';
const ROOT_DIR = 'dashboard';
const EDGE_PROFILE = path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data');

async function tryLaunch() {
  // Try Edge first (won't conflict with running Chrome)
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
    console.log('Edge failed (' + err.message.split('
')[0] + '), falling back to fresh Chromium...');
  }

  // Fallback: fresh Chromium with temp profile (user will need to log in manually)
  const tmpDir = path.join(os.tmpdir(), 'playwright-replit-' + Date.now());
  const ctx = await chromium.launchPersistentContext(tmpDir, {
    headless: false,
    args: ['--no-first-run', '--no-default-browser-check'],
  });
  console.log('Fresh Chromium launched. You may need to log into Replit manually.');
  return ctx;
}

async function main() {
  const browser = await tryLaunch();
  const page = await browser.newPage();

  console.log('Navigating to Replit import page...');
  await page.goto('https://replit.com/new/github', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const url = page.url();
  console.log('Current URL:', url);

  if (url.includes('login') || url.includes('signin')) {
    console.log('Not logged into Replit -- please log in, then re-run.');
    console.log('Browser stays open 3 minutes.');
    await page.waitForTimeout(180000);
    await browser.close();
    return;
  }

  console.log('Looking for GitHub URL input...');
  const inputSelectors = [
    'input[placeholder*=github i]',
    'input[placeholder*=repository i]',
    'input[type=text]',
    'input[type=url]',
  ];

  let input = null;
  for (const selector of inputSelectors) {
    input = await page.;
    if (input) {
      console.log('Found input: ' + selector);
      break;
    }
  }

  if (!input) {
    console.log('Could not find input -- complete import manually:');
    console.log('  Repo: ' + REPO);
    console.log('  Root directory: ' + ROOT_DIR);
    console.log('Browser stays open 3 minutes.');
    await page.waitForTimeout(180000);
    await browser.close();
    return;
  }

  await input.click();
  await input.fill('https://github.com/' + REPO);
  console.log('Filled repo: ' + REPO);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3000);

  const rootSelectors = [
    'input[placeholder*=root i]',
    'input[placeholder*=directory i]',
    'input[name*=root i]',
  ];

  let rootInput = null;
  for (const selector of rootSelectors) {
    rootInput = await page.;
    if (rootInput) {
      console.log('Found root dir input: ' + selector);
      break;
    }
  }

  if (rootInput) {
    await rootInput.click({ clickCount: 3 });
    await rootInput.fill(ROOT_DIR);
    console.log('Set root directory: ' + ROOT_DIR);
  } else {
    console.log('Root dir input not found -- set to  + ROOT_DIR +  manually.');
  }

  await page.waitForTimeout(1000);

  const importSelectors = [
    'button:has-text(Import)',
    'button:has-text(import)',
    'button[type=submit]',
  ];

  let importBtn = null;
  for (const selector of importSelectors) {
    importBtn = await page.;
    if (importBtn) {
      console.log('Found import button: ' + selector);
      break;
    }
  }

  if (importBtn) {
    console.log('Clicking Import...');
    await importBtn.click();
    await page.waitForTimeout(5000);
    console.log('Final URL:', page.url());
  } else {
    console.log('Import button not found -- click it manually.');
  }

  console.log('');
  console.log('Browser stays open 3 minutes for you to review.');
  await page.waitForTimeout(180000);
  await browser.close();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
