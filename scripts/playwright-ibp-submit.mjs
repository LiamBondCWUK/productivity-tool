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

function stripMarkdown(line) {
  return line
    .replace(/\*\*(.*?)\*\*/g, "$1")  // **bold** → bold
    .replace(/__(.*?)__/g, "$1")       // __bold__ → bold
    .replace(/\*(.*?)\*/g, "$1")       // *italic* → italic
    .replace(/_(.*?)_/g, "$1")         // _italic_ → italic
    .replace(/^[-*#>\s]+/, "")         // strip leading list/heading markers
    .trim();
}

function sectionToEditorText(section) {
  const lines = String(section || "")
    .split("\n")
    .map((line) => stripMarkdown(line))
    .filter(Boolean);

  if (lines.length === 0) return "No updates captured.";
  // Plain text — the PowerApps RTE adds bullet formatting per line automatically
  return lines.join("\n");
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

async function selectTeamInFrame(frame, teamName) {
  return frame
    .evaluate((name) => {
      const normalize = (text) => (text || "").replace(/\s+/g, " ").trim().toLowerCase();

      const directSelect = Array.from(document.querySelectorAll("select")).find(
        (el) =>
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
    }, teamName)
    .catch(() => false);
}

async function selectTeam(page, teamName) {
  // The Canvas App renders in the runtime-app.powerplatform.com frame.
  const appFrame = page.frames().find((f) => /runtime-app\.powerplatform\.com/.test(f.url()));

  if (!appFrame) {
    console.warn("[playwright-ibp-submit] Could not find PowerApps app frame — skipping team selection");
    return;
  }

  // Find the dropdown control coordinates via JS, then click natively.
  // Canvas App ignores JS synthetic click events — must use Playwright native pointer events.
  const rect = await appFrame.evaluate(() => {
    const normalize = (text) => (text || "").replace(/\s+/g, " ").trim().toLowerCase();
    const labels = Array.from(document.querySelectorAll("div,span,label,p")).filter((el) =>
      normalize(el.textContent).includes("select team") && normalize(el.textContent).length < 30,
    );
    for (const label of labels) {
      let scope = label.closest("div");
      for (let depth = 0; depth < 6 && scope; depth += 1) {
        const combo = scope.querySelector('[role="combobox"],[role="listbox"],select,button,input');
        if (combo) {
          const r = combo.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            return { x: r.left + r.width / 2, y: r.top + r.height / 2, found: true };
          }
        }
        scope = scope.parentElement;
      }
    }
    return { found: false };
  }).catch(() => ({ found: false }));

  if (!rect?.found) {
    console.warn("[playwright-ibp-submit] Could not locate dropdown control — please select team manually");
    return;
  }

  console.log(`[playwright-ibp-submit] Clicking dropdown at frame coords (${Math.round(rect.x)}, ${Math.round(rect.y)})`);
  // Native click fires proper pointerdown/pointerup/click events that Canvas App responds to
  await appFrame.click("body", { position: { x: rect.x, y: rect.y }, timeout: 5_000 });

  // Wait for options to render
  await page.waitForTimeout(2_000).catch(() => {});

  // Options render in the same app frame — wait for them and click natively
  try {
    await appFrame.waitForSelector(`text="${teamName}"`, { timeout: 5_000 });
    await appFrame.click(`text="${teamName}"`, { timeout: 3_000 });
    console.log(`[playwright-ibp-submit] Team "${teamName}" selected`);
  } catch {
    try {
      await appFrame.click(`text=${teamName}`, { timeout: 3_000 });
      console.log(`[playwright-ibp-submit] Team "${teamName}" selected (partial match)`);
    } catch (err) {
      console.warn(`[playwright-ibp-submit] Option not found: ${err.message?.slice(0, 80)} — please select manually`);
    }
  }

  await page.waitForTimeout(700).catch(() => {});
}

// Broader selector: catches contenteditable="true", contenteditable="", contenteditable="plaintext-only"
const EDITABLE_SEL = '[contenteditable]:not([contenteditable="false"])';

async function debugFrameStructure(page) {
  const info = await Promise.all(
    page.frames().map(async (frame, i) => {
      return frame
        .evaluate((sel) => {
          const editors = Array.from(document.querySelectorAll(sel));
          return {
            url: location.href.slice(0, 100),
            editorCount: editors.length,
            editorTags: editors.slice(0, 6).map((e) => `${e.tagName}[ce=${e.getAttribute("contenteditable")}][role=${e.getAttribute("role")}]`),
            bodySnippet: (document.body?.innerText ?? "").slice(0, 200),
          };
        }, EDITABLE_SEL)
        .catch(() => ({ url: "inaccessible", editorCount: -1 }))
        .then((d) => ({ frame: i, ...d }));
    }),
  );
  console.log("[playwright-ibp-submit] frame structure:", JSON.stringify(info, null, 2));
}

async function tryFillInFrame() { /* replaced by positional iframe approach */ }

// Each PowerApps rich text editor is rendered as a separate iframe whose BODY is contenteditable.
// Collect all such editor frames in DOM order, waiting up to timeoutMs for `count` to appear.
async function getEditorFrames(page, count = 4, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let found = [];
  while (Date.now() < deadline) {
    found = [];
    for (const frame of page.frames()) {
      const isEditor = await frame
        .evaluate(() => document.body?.getAttribute("contenteditable") === "true")
        .catch(() => false);
      if (isEditor) found.push(frame);
    }
    if (found.length >= count) return found;
    await new Promise((r) => setTimeout(r, 600));
  }
  return found; // return however many we found
}

async function fillEditorFrame(frame, content, label) {
  // Use document.execCommand to fill contenteditable iframes.
  // This goes through the browser's native text editing pipeline, which Canvas App RTEs
  // are built on top of — more reliable than frame.fill() which may not fire the right events.
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await frame.click("body", { timeout: 5_000 });
      await frame.waitForTimeout(200);

      await frame.evaluate((text) => {
        const body = document.body;
        body.focus();
        // Select all existing content then replace with new text via execCommand.
        // execCommand fires the native InputEvent chain that Canvas App RTEs listen to.
        document.execCommand("selectAll", false, null);
        document.execCommand("insertText", false, text);
      }, content);

      await frame.waitForTimeout(400);

      // Verify the first line of content actually persisted.
      const actual = await frame.evaluate(() => (document.body.innerText ?? "").trim()).catch(() => "");
      const expectedFirstLine = content.split("\n").find((l) => l.trim()) ?? "";
      if (actual.length > 0 && (expectedFirstLine === "" || actual.startsWith(expectedFirstLine.slice(0, 40)))) {
        console.log(`[playwright-ibp-submit] Filled "${label}" (attempt ${attempt}/${MAX_RETRIES})`);
        return;
      }
      console.warn(
        `[playwright-ibp-submit] Fill verification failed for "${label}" attempt ${attempt}/${MAX_RETRIES}` +
        ` — got "${actual.slice(0, 60)}", expected to start with "${expectedFirstLine.slice(0, 40)}"`
      );
    } catch (err) {
      console.warn(`[playwright-ibp-submit] Fill error for "${label}" attempt ${attempt}/${MAX_RETRIES}: ${err.message?.slice(0, 80)}`);
    }
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 1200 * attempt));
    }
  }
  console.error(`[playwright-ibp-submit] Could not verify fill for "${label}" after ${MAX_RETRIES} attempts — content may not have persisted`);
}

async function fillEditorByHeading(page, _headingText, content, index) {
  // Legacy shim — now just delegates to positional filling via getEditorFrames.
  // The `_headingText` param is kept for logging only; actual targeting is by index.
  // Callers still pass the heading text for the log message.
  throw new Error("fillEditorByHeading is deprecated — use fillEditorFrame directly");
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

    // Debug screenshot after form loads — helps diagnose any fill failures
    const preShot = resolve(SCREENSHOT_DIR, `debug-preload-${TARGET_DATE}.png`);
    await page.screenshot({ path: preShot, fullPage: false }).catch(() => {});
    console.log(`[playwright-ibp-submit] Pre-fill screenshot: ${preShot}`);

    // Retry team selection up to 3 times and verify it took effect.
    let teamSelected = false;
    for (let attempt = 1; attempt <= 3 && !teamSelected; attempt++) {
      if (attempt > 1) {
        console.log(`[playwright-ibp-submit] Retrying team selection (attempt ${attempt}/3)…`);
        await page.waitForTimeout(2_000).catch(() => {});
      }
      await selectTeam(page, "UK Solutions");
      const dropShotPath = resolve(SCREENSHOT_DIR, `debug-dropdown-${TARGET_DATE}.png`);
      await page.screenshot({ path: dropShotPath, fullPage: false }).catch(() => {});

      // Check if "UK Solutions" text is now visible in the app frame.
      const appFrame = page.frames().find((f) => /runtime-app\.powerplatform\.com/.test(f.url()));
      if (appFrame) {
        const verified = await appFrame.evaluate(() => {
          const normalize = (t) => (t || "").replace(/\s+/g, " ").trim().toLowerCase();
          return Array.from(document.querySelectorAll("div,span,p,button")).some(
            (el) => normalize(el.textContent) === "uk solutions"
          );
        }).catch(() => false);
        if (verified) {
          teamSelected = true;
          console.log("[playwright-ibp-submit] Team selection verified ✓");
        } else {
          console.warn(`[playwright-ibp-submit] Team selection not confirmed (attempt ${attempt}/3)`);
        }
      }
    }
    if (!teamSelected) {
      console.warn("[playwright-ibp-submit] Could not auto-select team — please select 'UK Solutions' manually");
      if (process.stdin.isTTY) await prompt("Select 'UK Solutions' in browser then press Enter…");
    }

    // After team selection the form may re-render (new iframes spin up). Wait for all 4 editors.
    console.log("[playwright-ibp-submit] Waiting for 4 editor frames after team selection…");
    const editorFrames = await getEditorFrames(page, 4, 30_000);
    console.log(`[playwright-ibp-submit] Found ${editorFrames.length} editor frames`);
    if (editorFrames.length < 4) {
      await debugFrameStructure(page);
      const failShot = resolve(SCREENSHOT_DIR, `debug-not-enough-editors-${TARGET_DATE}.png`);
      await page.screenshot({ path: failShot, fullPage: false }).catch(() => {});
      throw new Error(`Expected 4 editor frames, found ${editorFrames.length}. Screenshot: ${failShot}`);
    }

    // Fill each editor in order, re-fetching fresh frame references between fills
    // to guard against Canvas App re-rendering staling the cached frame handles.
    const fills = [
      { content: wins,        label: "Current Week: Wins & Impact" },
      { content: blockers,    label: "Issues / Blockers" },
      { content: priorities,  label: "Next Week: Top Priorities" },
      { content: lookingAhead, label: "Looking Ahead" },
    ];

    for (let i = 0; i < fills.length; i++) {
      // Re-acquire fresh frame references before each fill — avoids stale handles
      // after Canvas App re-renders in response to the previous fill.
      const freshFrames = await getEditorFrames(page, 4, 8_000);
      if (freshFrames.length < 4) {
        console.warn(`[playwright-ibp-submit] Only ${freshFrames.length} editor frames before fill ${i + 1} — proceeding with what we have`);
      }
      const targetFrame = freshFrames[i];
      if (!targetFrame) {
        console.error(`[playwright-ibp-submit] No frame at index ${i} for "${fills[i].label}" — skipping`);
        continue;
      }

      await fillEditorFrame(targetFrame, fills[i].content, fills[i].label);

      // Per-fill screenshot for diagnostics.
      const fillShot = resolve(SCREENSHOT_DIR, `debug-fill-${i + 1}-${fills[i].label.replace(/[^a-zA-Z0-9]/g, "-")}-${TARGET_DATE}.png`);
      await page.screenshot({ path: fillShot, fullPage: false }).catch(() => {});

      if (i < fills.length - 1) {
        // Give Canvas App time to process the fill and stabilise before the next.
        await page.waitForTimeout(2_000).catch(() => {});
      }
    }

    await page.waitForTimeout(1_000);

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
