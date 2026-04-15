#!/usr/bin/env node
/**
 * push-pending-kanban-cards.mjs
 *
 * Manually push cards from pending-kanban-cards.json to vibe-kanban.
 * Run this after completing vibe-kanban setup (once projectId is configured).
 *
 * Usage:
 *   node scripts/push-pending-kanban-cards.mjs [--dry-run]
 *
 * Pre-requisites:
 *   1. npx vibe-kanban  →  create a project in the UI
 *   2. npm run vibe-kanban:discover  →  populates workspace/config/vibe-kanban.json
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = join(dirname(__filename), '..');
const CARDS_FILE = join(projectRoot, 'workspace/coordinator/pending-kanban-cards.json');
const DRY_RUN = process.argv.includes('--dry-run');

if (!existsSync(CARDS_FILE)) {
  console.error(`No pending cards file found at ${CARDS_FILE}`);
  console.error('Run overnight-analysis.mjs first to generate cards.');
  process.exit(1);
}

const data = JSON.parse(readFileSync(CARDS_FILE, 'utf-8'));
const cards = data.cards || [];

if (cards.length === 0) {
  console.log('No pending cards to push.');
  process.exit(0);
}

console.log(`Found ${cards.length} pending cards (generated: ${data.generatedAt})`);
if (DRY_RUN) {
  console.log('\n[DRY RUN] Cards that would be pushed:\n');
  for (const card of cards) {
    console.log(`  [${card.priority}][${card.type}] ${card.title}`);
    console.log(`    Project: ${card.project}`);
    console.log(`    Labels:  ${card.labels?.join(', ')}`);
    console.log(`    Body:    ${card.body?.slice(0, 80)}...`);
    console.log('');
  }
  process.exit(0);
}

const { createKanbanIssue } = await import('./create-kanban-issue.mjs');

let pushed = 0;
let failed = 0;

for (const card of cards) {
  try {
    await createKanbanIssue({
      title:    card.title,
      body:     card.body,
      priority: card.priority,
      labels:   card.labels || [],
    });
    console.log(`✓ Pushed: [${card.priority}] ${card.title}`);
    pushed += 1;
  } catch (err) {
    console.error(`✗ Failed: ${card.title} — ${err.message}`);
    failed += 1;
  }
}

console.log(`\nDone: ${pushed} pushed, ${failed} failed`);

if (pushed > 0) {
  // Clear the pending cards file after successful push
  writeFileSync(CARDS_FILE, JSON.stringify({
    generatedAt: data.generatedAt,
    pushedAt: new Date().toISOString(),
    totalCards: cards.length,
    pushed,
    failed,
    cards: failed > 0 ? cards.filter((_, i) => i >= pushed) : [],
  }, null, 2));
  console.log(`Updated ${CARDS_FILE}`);
}
