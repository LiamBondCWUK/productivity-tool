/**
 * Replit GitHub import — uses Chrome persistent profile
 * Run after closing Chrome (or Chrome profile lock will fail)
 */
import { chromium } from 'playwright';
import path from 'path';
import os from 'os';

const REPO = 'LiamBondCWUK/productivity-tool';
const ROOT_DIR = 'dashboard';
const CHROME_PROFILE = path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data');

async function main() {
  console.log('Launching Chrome with your existing profile...');
  const browser = await chromium.launchPersistentContext(CHROME_PROFILE, {
    headless: false,
    channel: 'chrome',
    args: ['--no-first-run', '--no-default-browser-check'],
    ignoreDefaultArgs: ['--enable-automation'],
  });

  const page = await browser.newPage();
  console.log('Navigating to Replit import page...');
  await page.goto('https://replit.com/new/github', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const url = page.url();
  console.log('Current URL:', url);

  if (url.includes('login') || url.includes('signin')) {
    console.log('Not logged into Replit -- log in then re-run. Browser stays open 3 minutes.');
    await page.waitForTimeout(180000);
    await browser.close();
    return;
  }

  console.log('Searching for GitHub URL input...');
  const inputSelectors = [
    'input[placeholder*="github" i]',
    'input[placeholder*="repository" i]',
    'input[type="text"]',
    'input[type="url"]',
  ];

  let input = null;
  for (const selector of inputSelectors) {
    input = await page.$(selector);
    if (input) {
      console.log('Found input:', selector);
      break;
    }
  }

  if (!input) {
    console.log('Could not find input -- complete manually.');
    console.log('  Repo:', REPO);
    console.log('  Root directory:', ROOT_DIR);
    console.log('Browser stays open 3 minutes.');
    await page.waitForTimeout(180000);
    await browser.close();
    return;
  }

  await input.click();
  await input.fill('https://github.com/' + REPO);
  console.log('Filled repo:', REPO);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3000);

  const rootSelectors = [
    'input[placeholder*="root" i]',
    'input[placeholder*="directory" i]',
    'input[name*="root" i]',
  ];

  let rootInput = null;
  for (const selector of rootSelectors) {
    rootInput = await page.$(selector);
    if (rootInput) {
      console.log('Found root dir input:', selector);
      break;
    }
  }

  if (rootInput) {
    await rootInput.click({ clickCount: 3 });
    await rootInput.fill(ROOT_DIR);
    console.log('Set root directory:', ROOT_DIR);
  } else {
    console.log('Root dir input not found -- set to "' + ROOT_DIR + '" manually.');
  }

  await page.waitForTimeout(1000);

  const importSelectors = [
    'button:has-text("Import")',
    'button:has-text("import")',
    'button[type="submit"]',
  ];

  let importBtn = null;
  for (const selector of importSelectors) {
    importBtn = await page.$(selector);
    if (importBtn) {
      console.log('Found import button:', selector);
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

  console.log('Browser stays open 3 minutes for you to review.');
  await page.waitForTimeout(180000);
  await browser.close();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
