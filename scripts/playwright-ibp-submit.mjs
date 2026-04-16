#!/usr/bin/env node
import { chromium } from "playwright";
import { readFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import readline from "readline";
import os from "os";
import { extractQuinnSections } from "./generate-ibp.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SCREENSHOT_DIR = resolve(ROOT, "scripts/ibp-screenshots");
const EDGE_PROFILE_DEFAULT = join(os.homedir(), "AppData", "Local", "Microsoft", "Edge", "User Data");
const POWERAPPS_URL =
  "https://apps.powerapps.com/play/e/default-7b8a41e4-2f76-4eef-87d3-f75dd19c0e56/a/0c737b17-28a4-405f-b03b-a55915bf1896?tenantId=7b8a41e4-2f76-4eef-87d3-f75dd19c0e56";

const dateArg = process.argv.find((a) => a.startsWith("--date="))?.split("=")[1];
const DEMO_MODE = process.argv.includes("--demo");
const TARGET_DATE = dateArg ?? new Date().toISOString().slice(0, 10);
const profileArg = process.argv.find((a) => a.startsWith("--profile-dir="))?.split("=")[1];
const EDGE_PROFILE = profileArg ? resolve(ROOT, profileArg) : EDGE_PROFILE_DEFAULT;
const HEADLESS = process.argv.includes("--headless");
const cdpPortArg = process.argv.find((a) => a.startsWith("--cdp-port="))?.split("=")[1];
const CDP_PORT = cdpPortArg ? parseInt(cdpPortArg, 10) : 9222;
const USE_CDP = process.argv.includes("--cdp") || !!cdpPortArg;

const ibpFile = resolve(
  ROOT,
  `workspace/coordinator/${DEMO_MODE ? "demo-ibp" : "ibp"}-${TARGET_DATE}.md`,
);

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolveAnswer) => {
    rl.question(question, (answer) => {
      rl.close();
      resolveAnswer(answer);
    });
  });
}

function sectionToEditorText(section) {
  const lines = String(section || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s*/, ""));

  if (lines.length === 0) return "- No updates captured.";
  return lines.map((line) => `- ${line}`).join("\n");
}

async function waitForForm(page) {
  await page.goto(POWERAPPS_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(4_000);

  const loggedIn = await page
    .waitForFunction(() => {
      const bodyText = document.body?.innerText || "";
      return (
        bodyText.includes("Weekly IBP Form") ||
        bodyText.includes("Current Week: Wins & Impact") ||
        bodyText.includes("Select Team")
      );
    }, { timeout: 120_000 })
    .then(() => true)
    .catch(() => false);

  if (!loggedIn) {
    console.log("[playwright-ibp-submit] Waiting for sign-in/form load timed out.");
    console.log("[playwright-ibp-submit] Complete SSO in the browser and press Enter to continue.");
    await prompt("Press Enter after the form is visible...");
  }
}

async function selectTeam(page, teamName) {
  const selected = await page.evaluate((name) => {
    const normalize = (text) => (text || "").replace(/\s+/g, " ").trim().toLowerCase();

    const directSelect = Array.from(document.querySelectorAll("select")).find((el) =>
      normalize(el.innerText).includes(normalize(name)) ||
      Array.from(el.options || []).some((opt) => normalize(opt.textContent).includes(normalize(name))),
    );

    if (directSelect) {
      const option = Array.from(directSelect.options).find((opt) =>
        normalize(opt.textContent).includes(normalize(name)),
      );
      if (option) {
        directSelect.value = option.value;
        directSelect.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }

    const labels = Array.from(document.querySelectorAll("div,span,label")).filter((el) =>
      normalize(el.textContent).includes("select team"),
    );

    for (const label of labels) {
      let scope = label.closest("div");
      for (let depth = 0; depth < 5 && scope; depth += 1) {
        const combo = scope.querySelector('[role="combobox"], input, button');
        if (combo) {
          combo.click();
          return true;
        }
        scope = scope.parentElement;
      }
    }

    return false;
  }, teamName);

  if (selected) {
    await page.waitForTimeout(800);
    const option = page.getByText(teamName, { exact: false }).first();
    if (await option.count()) {
      await option.click({ timeout: 3_000 }).catch(() => {});
      await page.waitForTimeout(700);
    }
  }
}

async function fillEditorByHeading(page, headingText, content, fallbackIndex) {
  const ok = await page.evaluate(
    ({ heading, value, index }) => {
      const normalize = (text) => (text || "").replace(/\s+/g, " ").trim().toLowerCase();
      const headingNeedle = normalize(heading);

      const setEditor = (editor) => {
        if (!editor) return false;
        editor.focus();
        editor.textContent = "";
        editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
        editor.textContent = value;
        editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
        editor.dispatchEvent(new Event("change", { bubbles: true }));
        editor.blur();
        return true;
      };

      const candidates = Array.from(document.querySelectorAll("div,span,h1,h2,h3,h4,label,p,strong"))
        .filter((el) => {
          const t = normalize(el.textContent);
          return t.includes(headingNeedle) && t.length < 140;
        });

      for (const node of candidates) {
        let scope = node.closest("div");
        for (let depth = 0; depth < 7 && scope; depth += 1) {
          const editor = scope.querySelector('[contenteditable="true"]');
          if (setEditor(editor)) return true;
          const editors = scope.querySelectorAll('[contenteditable="true"]');
          if (editors.length > 0 && setEditor(editors[0])) return true;
          scope = scope.parentElement;
        }
      }

      const allEditors = Array.from(document.querySelectorAll('[contenteditable="true"]'));
      if (allEditors[index]) {
        return setEditor(allEditors[index]);
      }

      return false;
    },
    { heading: headingText, value: content, index: fallbackIndex },
  );

  if (!ok) {
    throw new Error(`Could not fill editor for heading: ${headingText}`);
  }
}

async function run() {
  console.log(`[playwright-ibp-submit] date=${TARGET_DATE} mode=${DEMO_MODE ? "demo" : "real"}`);

  if (!existsSync(ibpFile)) {
    throw new Error(`IBP file not found: ${ibpFile}`);
  }

  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const markdown = readFileSync(ibpFile, "utf8");
  const sections = extractQuinnSections(markdown);

  const wins = sectionToEditorText(sections.winsAndImpact);
  const blockers = sectionToEditorText(sections.issuesBlockers);
  const priorities = sectionToEditorText(sections.nextWeekPriorities);
  const lookingAhead = sectionToEditorText(sections.lookingAhead);

  // --- browser acquisition ---
  // CDP mode: attach to an already-running Edge (launched with --remote-debugging-port=<CDP_PORT>)
  // This avoids profile-lock and context teardown issues entirely.
  let browser = null;
  let context;
  let isCdp = false;

  if (USE_CDP) {
    console.log(`[playwright-ibp-submit] CDP mode — connecting to http://127.0.0.1:${CDP_PORT}`);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
    const contexts = browser.contexts();
    context = contexts[0] ?? (await browser.newContext({ viewport: { width: 1600, height: 980 } }));
    isCdp = true;
  } else {
    try {
      context = await chromium.launchPersistentContext(EDGE_PROFILE, {
        channel: "msedge",
        headless: HEADLESS,
        viewport: { width: 1600, height: 980 },
      });
    } catch (error) {
      const fallbackProfile = resolve(ROOT, "workspace/coordinator/.playwright-fallback-profile");
      mkdirSync(fallbackProfile, { recursive: true });
      console.warn(
        `[playwright-ibp-submit] Edge profile launch failed (${EDGE_PROFILE}); retrying with fallback profile ${fallbackProfile} and default Chromium.`,
      );
      context = await chromium.launchPersistentContext(fallbackProfile, {
        headless: HEADLESS,
        viewport: { width: 1600, height: 980 },
      });
    }
  }

  const page = context.pages()[0] ?? (await context.newPage());

  try {
    await waitForForm(page);
    await selectTeam(page, "UK Solutions");

    await fillEditorByHeading(page, "Current Week: Wins & Impact", wins, 0);
    await fillEditorByHeading(page, "Issues / Blockers", blockers, 1);
    await fillEditorByHeading(page, "Next Week: Top Priorities", priorities, 2);
    await fillEditorByHeading(page, "Looking Ahead", lookingAhead, 3);

    await page.waitForTimeout(1000);

    const screenshotPath = resolve(
      SCREENSHOT_DIR,
      `ibp-preflight-${TARGET_DATE}${DEMO_MODE ? "-demo" : ""}.png`,
    );
    await page.screenshot({ path: screenshotPath, fullPage: true });

    console.log(`[playwright-ibp-submit] Form filled. Screenshot: ${screenshotPath}`);
    console.log("[playwright-ibp-submit] Submit was NOT clicked. Review and submit manually in browser.");
    if (process.stdin.isTTY) {
      await prompt("Press Enter when you are finished reviewing/submitting manually...");
    } else {
      console.log("[playwright-ibp-submit] Non-interactive mode: keeping browser open until it is manually closed.");
      await new Promise((resolveDone) => {
        const poll = setInterval(() => {
          if (context.pages().length === 0) {
            clearInterval(poll);
            resolveDone();
          }
        }, 2000);

        context.on("close", () => {
          clearInterval(poll);
          resolveDone();
        });
      });
    }
  } finally {
    if (isCdp) {
      // In CDP mode we attached to the user's real browser — never close it.
      if (browser) await browser.close().catch(() => {});
    } else {
      if (context.pages().length > 0) {
        await context.close();
      }
    }
  }
}

run().catch((err) => {
  console.error("[playwright-ibp-submit] fatal:", err.message || err);
  process.exit(1);
});
