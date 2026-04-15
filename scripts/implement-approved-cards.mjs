#!/usr/bin/env node
/**
 * implement-approved-cards.mjs
 *
 * Reads approved-cards-for-implementation.json and dispatches each card
 * to Claude Code via the `claude` CLI (--print mode, non-interactive).
 *
 * Usage:
 *   node scripts/implement-approved-cards.mjs             # run all approved cards
 *   node scripts/implement-approved-cards.mjs --dry-run   # preview prompts only
 *   node scripts/implement-approved-cards.mjs --index 0   # run single card by index
 *
 * Output:
 *   workspace/coordinator/implementation-log.json         # per-run history
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { createInterface } from 'readline';

const __filename = fileURLToPath(import.meta.url);
const BASE_DIR = join(dirname(__filename), '..');
const COORDINATOR = join(BASE_DIR, 'workspace/coordinator');
const APPROVED_FILE = join(COORDINATOR, 'approved-cards-for-implementation.json');
const IMPL_LOG_FILE = join(COORDINATOR, 'implementation-log.json');

const DRY_RUN = process.argv.includes('--dry-run');
const INDEX_ARG = (() => {
  const i = process.argv.indexOf('--index');
  return i !== -1 ? parseInt(process.argv[i + 1], 10) : null;
})();

// ── Helpers ───────────────────────────────────────────────────────────────────

function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf-8')); } catch { return null; }
}

function writeJson(file, data) {
  writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

function log(msg) {
  const ts = new Date().toLocaleTimeString('en-GB');
  console.log(`[${ts}] ${msg}`);
}

function separator(title = '') {
  const line = '─'.repeat(60);
  if (title) console.log(`\n${line}\n  ${title}\n${line}`);
  else console.log(line);
}

// ── Model routing ─────────────────────────────────────────────────────────────
// Rule: use Haiku for low-complexity tasks; Sonnet only for feature work or
// urgent bugs that require architectural reasoning.

const MODEL_HAIKU  = 'haiku';
const MODEL_SONNET = 'sonnet';
const EXECUTOR_SYSTEM_PROMPT = 'You are an automated coding executor. Work only on the requested task, keep context minimal, avoid unrelated exploration, and make the smallest correct change.';

function selectModel(card) {
  const { priority, type } = card;
  if (type === 'feature') {
    return { model: MODEL_SONNET, effort: 'high',   tier: 'Sonnet ⚡' };
  }
  if (type === 'bug' && (priority === 'urgent' || priority === 'high')) {
    return { model: MODEL_SONNET, effort: 'high',   tier: 'Sonnet ⚡' };
  }
  if (type === 'improvement' && priority === 'urgent') {
    return { model: MODEL_HAIKU,  effort: 'medium', tier: 'Haiku 💨' };
  }
  // docs, low/medium improvements, low-priority bugs
  return   { model: MODEL_HAIKU,  effort: 'low',    tier: 'Haiku 💨' };
}

// ── Interactive confirmation ───────────────────────────────────────────────────

function askConfirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

function buildPrompt(card, workDir) {
  return `You are working inside the project: "${card.project}"
Working directory: ${workDir}

TASK: ${card.title}
PRIORITY: ${card.priority}
TYPE: ${card.type}

CONTEXT:
${card.body}

INSTRUCTIONS:
- Implement this improvement directly in the codebase
- Make only the changes necessary for this specific task
- Follow existing code style and conventions
- Do not add unrelated changes
- Stage and commit any changes with a semantic commit message referencing this task

Begin implementation now.`;
}

function resolveProjectDir(card) {
  const docsDir = 'C:/Users/liam.bond/Documents';

  // Special cases first
  const overrides = {
    'Command Center': join(docsDir, 'Productivity Tool', 'dashboard'),
    'Productivity Tool': join(docsDir, 'Productivity Tool'),
  };
  if (overrides[card.project]) {
    const dir = overrides[card.project];
    if (existsSync(dir)) return dir;
  }

  // Try exact project name as a folder directly under Documents
  const exactDir = join(docsDir, card.project);
  if (existsSync(exactDir)) return exactDir;

  // Fall back to the Productivity Tool root
  return BASE_DIR;
}

// ── Main ──────────────────────────────────────────────────────────────────────

if (!existsSync(APPROVED_FILE)) {
  console.error(`\nNo approved cards file found at:\n  ${APPROVED_FILE}`);
  console.error('\nApprove cards in the dashboard (Analysis tab) first.\n');
  process.exit(1);
}

const data = readJson(APPROVED_FILE);
const allCards = data?.cards || [];

if (allCards.length === 0) {
  console.log('\nNo approved cards to implement. Approve cards in the dashboard first.\n');
  process.exit(0);
}

// Filter to single card if --index specified
const cards = INDEX_ARG !== null
  ? [allCards[INDEX_ARG]].filter(Boolean)
  : allCards;

if (cards.length === 0) {
  console.error(`\nNo card at index ${INDEX_ARG} (file has ${allCards.length} cards).\n`);
  process.exit(1);
}

// Wrap in async IIFE so we can await readline confirmation
(async () => {

separator('APPROVED CARDS EXECUTOR');
log(`Found ${allCards.length} approved card(s) in file`);
if (data.summary) log(`Batch: ${data.summary}`);
console.log('');

// Preview all cards with model routing
cards.forEach((card, i) => {
  const idx = INDEX_ARG !== null ? INDEX_ARG : i;
  const m = selectModel(card);
  console.log(`  [${idx}] [${card.priority.toUpperCase()}] [${m.tier}] ${card.title}`);
  console.log(`       Project: ${card.project}  |  Type: ${card.type}`);
  console.log('');
});

if (DRY_RUN) {
  separator();
  console.log('[DRY RUN] Prompts that would be sent to Claude:\n');
  cards.forEach((card, i) => {
    const m = selectModel(card);
    separator(`Card ${i} [${m.tier}]: ${card.title}`);
    console.log(buildPrompt(card, resolveProjectDir(card)));
    console.log('');
  });
  process.exit(0);
}

separator('READY — confirm each card before execution');
console.log('  y = run  |  n/skip = skip this card  |  q = quit\n');

const results = [];
let succeeded = 0;
let failed = 0;
let skipped = 0;

for (let i = 0; i < cards.length; i++) {
  const card = cards[i];
  const globalIdx = INDEX_ARG !== null ? INDEX_ARG : i;
  const modelInfo = selectModel(card);

  separator(`Card ${globalIdx + 1}/${allCards.length}`);
  console.log(`  Title:    ${card.title}`);
  console.log(`  Project:  ${card.project}`);
  console.log(`  Priority: ${card.priority}  |  Type: ${card.type}`);
  console.log(`  Model:    ${modelInfo.tier} (${modelInfo.model}, effort=${modelInfo.effort})`);
  if (card.body) {
    const preview = card.body.replace(/\n/g, ' ').slice(0, 120);
    console.log(`  Context:  ${preview}${card.body.length > 120 ? '…' : ''}`);
  }
  console.log('');

  const answer = await askConfirm(`  Run this card? (y/n/q) → `);
  console.log('');

  if (answer === 'q' || answer === 'quit') {
    log('Quit — stopping executor.');
    break;
  }

  if (answer !== 'y' && answer !== 'yes') {
    log(`Skipped card ${globalIdx + 1}.`);
    skipped++;
    results.push({ index: globalIdx, title: card.title, project: card.project, status: 'skipped' });
    continue;
  }

  // Resolve project working directory
  const workDir = resolveProjectDir(card);
  log(`Working directory: ${workDir}`);
  log(`Model: ${modelInfo.tier} — starting claude (this may take 1-5 minutes)...`);

  const prompt = buildPrompt(card, workDir);
  const startTime = Date.now();

  const result = spawnSync(
    'claude',
    [
      '--dangerously-skip-permissions',
      '--print',
      '--model', modelInfo.model,
      '--effort', modelInfo.effort,
      '--disable-slash-commands',
      '--system-prompt', EXECUTOR_SYSTEM_PROMPT,
      prompt,
    ],
    {
      cwd: workDir,
      stdio: ['ignore', 'inherit', 'inherit'],
      encoding: 'utf-8',
      timeout: 900_000,
      shell: false,
    }
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const success = result.status === 0;

  results.push({
    index: globalIdx,
    title: card.title,
    project: card.project,
    priority: card.priority,
    model: modelInfo.model,
    effort: modelInfo.effort,
    status: success ? 'done' : 'failed',
    exitCode: result.status,
    elapsedSeconds: parseFloat(elapsed),
    workDir,
    ranAt: new Date().toISOString(),
  });

  if (success) {
    succeeded++;
    log(`✓ Done in ${elapsed}s`);
  } else {
    failed++;
    log(`✗ Failed (exit ${result.status}) after ${elapsed}s`);
  }

  console.log('');
}

// ── Write implementation log ──────────────────────────────────────────────────

const runRecord = {
  ranAt: new Date().toISOString(),
  totalCards: cards.length,
  succeeded,
  failed,
  results,
  approvedBatch: data.summary || 'unknown',
};

let history = readJson(IMPL_LOG_FILE) || [];
if (!Array.isArray(history)) history = [];
history.unshift(runRecord);
if (history.length > 30) history = history.slice(0, 30); // keep last 30 runs
writeJson(IMPL_LOG_FILE, history);

// ── Summary ───────────────────────────────────────────────────────────────────

separator('SUMMARY');
log(`Completed: ${succeeded}/${cards.length} cards  |  Skipped: ${skipped}  |  Failed: ${failed}`);
if (failed > 0) log(`Failed: ${failed} card(s) - check output above`);
log(`Log saved to: ${IMPL_LOG_FILE}`);

// Clear approved file only if all non-skipped cards succeeded
const allProcessed = succeeded + skipped === cards.length;
  if (INDEX_ARG === null && failed === 0 && allProcessed) {
    writeJson(APPROVED_FILE, {
      generatedAt: data.generatedAt,
      totalCards: 0,
      cards: [],
      summary: `All ${allCards.length} cards implemented on ${new Date().toLocaleString('en-GB')}`,
      lastClearedAt: new Date().toISOString(),
    });
    log(`✓ Cleared ${APPROVED_FILE} (all cards processed)`);
  }

  console.log('');
  process.exit(failed > 0 ? 1 : 0);
})();
