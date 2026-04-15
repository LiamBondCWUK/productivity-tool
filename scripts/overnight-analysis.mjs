#!/usr/bin/env node
/**
 * overnight-analysis.mjs  —  v2 (budget-guarded tiered pipeline)
 *
 * Orchestrator for the nightly project health pipeline:
 *   1. Discover projects   (project-discovery.mjs)
 *   2. Health check each   (project-health-check.mjs)  ← deterministic, no LLM
 *   3. Synthesise findings (overnight-synthesize.mjs)  ← Haiku/Sonnet, $5 cap
 *   4. Push kanban cards   (create-kanban-issue.mjs)   ← if projectId configured
 *   5. Write dashboard     (dashboard-data.json)
 *   6. Write report        (overnight-report.md)
 *
 * Hard guardrails (all enforced in overnight-synthesize.mjs):
 *   - $5.00 nightly ceiling (OVERNIGHT_BUDGET env to override)
 *   - 8k token input cap per project
 *   - Haiku default, Sonnet only for large+complex projects
 *   - Only projects WITH findings go to LLM
 *   - No subagents, sequential only
 *
 * Runs at 02:00 Mon-Fri via Windows Task Scheduler.
 * Log: workspace/coordinator/overnight-analysis.log
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const BASE_DIR       = 'C:/Users/liam.bond/Documents/Productivity Tool';
const SCRIPTS_DIR    = join(BASE_DIR, 'scripts');
const COORDINATOR    = join(BASE_DIR, 'workspace/coordinator');
const REGISTRY_FILE  = join(COORDINATOR, 'project-registry.json');
const DASHBOARD_FILE = join(COORDINATOR, 'dashboard-data.json');
const REPORT_FILE    = join(COORDINATOR, 'overnight-report.md');
const CARDS_FILE     = join(COORDINATOR, 'pending-kanban-cards.json');
const DOC_HEALTH_SCRIPT  = join(SCRIPTS_DIR, 'doc-freshness-check.ps1');
const DOC_HEALTH_REPORT  = join(COORDINATOR,  'doc-health-report.json');

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(name) {
  return name.toLowerCase().replace(/[\s_]+/g, '-');
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function runDocHealthCheck() {
  if (!existsSync(DOC_HEALTH_SCRIPT)) return null;
  try {
    execSync(
      `powershell -ExecutionPolicy Bypass -File "${DOC_HEALTH_SCRIPT}" -StaleDays 21 -WriteDashboard`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 },
    );
    return readJson(DOC_HEALTH_REPORT);
  } catch {
    return null;
  }
}

// ── Git change detection — skip unmodified projects ───────────────────────────
function hasChangedSinceTimestamp(entry, sinceIso) {
  if (!entry.hasGit || !entry.path || !sinceIso) return true; // can't tell → process
  try {
    const output = execSync(
      `git log --since="${sinceIso}" --oneline`,
      { cwd: entry.path, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 },
    );
    if (output.trim()) return true;
    // Also check mtime of non-git files
    return false;
  } catch {
    return true; // on error, default to process
  }
}

// ── Kanban card push ──────────────────────────────────────────────────────────
async function pushKanbanCards(cards) {
  if (!cards || cards.length === 0) return { pushed: 0, skipped: 0, error: null };

  try {
    const { createKanbanIssue } = await import('./create-kanban-issue.mjs');
    let pushed = 0;
    let skipped = 0;
    for (const card of cards) {
      try {
        await createKanbanIssue({
          title:    card.title,
          body:     card.body,
          priority: card.priority,
          labels:   card.labels || [],
        });
        pushed += 1;
      } catch (err) {
        // projectId not configured → don't rethrow, just skip
        if (err.message.includes('projectId')) {
          console.warn('[kanban] projectId not configured — skipping card push (run vibe-kanban:discover)');
          return { pushed: 0, skipped: cards.length, error: 'projectId not configured' };
        }
        console.warn(`[kanban] Failed to push card "${card.title}": ${err.message}`);
        skipped += 1;
      }
    }
    return { pushed, skipped, error: null };
  } catch (err) {
    console.warn(`[kanban] Could not import create-kanban-issue.mjs: ${err.message}`);
    return { pushed: 0, skipped: cards.length, error: err.message };
  }
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

async function runOvernightPipeline() {
  const pipelineStart = Date.now();
  ensureDir(COORDINATOR);
  console.log(`\n====== Overnight Analysis v2 — ${new Date().toISOString()} ======\n`);

  // ── Step 1: Refresh project registry ────────────────────────────────────
  console.log('[1/6] Refreshing project registry...');
  try {
    execSync(`node "${join(SCRIPTS_DIR, 'project-discovery.mjs')}"`, {
      encoding: 'utf-8',
      stdio: 'inherit',
      timeout: 60_000,
    });
  } catch (err) {
    console.warn(`[1/6] project-discovery failed: ${err.message} — using cached registry`);
  }

  const registry = readJson(REGISTRY_FILE);
  if (!registry?.projects?.length) {
    console.error('[1/6] No projects in registry. Aborting.');
    process.exit(1);
  }
  const projects = registry.projects;
  console.log(`[1/6] ${projects.length} projects loaded\n`);

  // ── Step 2: Deterministic health checks ─────────────────────────────────
  console.log('[2/6] Running deterministic health checks...');
  const { checkProjectHealth } = await import('./project-health-check.mjs');

  const lastRunAt = readJson(DASHBOARD_FILE)?.overnightAnalysis?.generatedAt ?? null;

  const healthResults = [];
  for (const entry of projects) {
    // Skip projects with no changes since last run (git-based)
    if (lastRunAt && !hasChangedSinceTimestamp(entry, lastRunAt)) {
      console.log(`  [skip] ${entry.name} — no changes since last run`);
      healthResults.push({
        project: entry.name,
        path: entry.path,
        findings: [],
        skipped: true,
        skipReason: 'no git changes since last run',
        sourceFileCount: 0,
        testFileCount: 0,
      });
      continue;
    }
    const result = checkProjectHealth(entry);
    const badge = result.findings.length > 0
      ? `⚠ ${result.findings.length} findings`
      : '✓ healthy';
    console.log(`  ${entry.name}: ${badge}`);
    healthResults.push(result);
  }

  const projectsWithFindings = healthResults.filter(r => !r.skipped && r.findings.length > 0);
  console.log(`\n[2/6] ${projectsWithFindings.length}/${projects.length} projects have findings\n`);

  // ── Step 3: LLM synthesis (per project, budget-guarded) ──────────────────
  console.log('[3/6] Running budget-guarded LLM synthesis...');
  const { synthesizeProject, createBudgetState, getRecentCommits } = await import('./overnight-synthesize.mjs');

  const budget = createBudgetState();
  const synthesisResults = [];

  for (let i = 0; i < projects.length; i++) {
    const entry = projects[i];
    const health = healthResults[i];
    const recentCommits = getRecentCommits(entry.path, entry.hasGit);
    const result = await synthesizeProject(entry, health, budget, recentCommits);
    synthesisResults.push(result);
  }

  console.log(`\n[3/6] LLM synthesis complete`);
  console.log(`  Budget used: $${budget.totalCostUsd.toFixed(4)} / $${process.env.OVERNIGHT_BUDGET ?? '5.00'}`);
  console.log(`  Projects called: ${budget.projectsCalled}, skipped: ${budget.projectsSkipped}`);
  if (budget.limitReached) {
    console.warn('  ⚠ Budget ceiling reached — some projects were not synthesised');
  }
  console.log('');

  // ── Step 4: Push kanban cards ────────────────────────────────────────────
  console.log('[4/6] Collecting and pushing kanban cards...');
  const allCards = synthesisResults.flatMap(r => r.cards || []);

  // Always write pending cards JSON (for review / fallback if kanban not configured)
  writeFileSync(CARDS_FILE, JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalCards: allCards.length,
    cards: allCards,
  }, null, 2));

  const kanbanResult = await pushKanbanCards(allCards);
  console.log(`[4/6] Cards: ${allCards.length} generated | ${kanbanResult.pushed} pushed to vibe-kanban | ${kanbanResult.skipped} pending`);
  if (kanbanResult.error) {
    console.log(`  Note: ${kanbanResult.error} — cards saved to ${CARDS_FILE}`);
  }
  console.log('');

  // ── Step 5: Doc freshness check ──────────────────────────────────────────
  console.log('[5/6] Running doc freshness check...');
  const docHealth = runDocHealthCheck();
  if (docHealth) {
    console.log(`  Stale docs: ${docHealth.summary?.staleCount ?? 0}`);
  } else {
    console.log('  Doc health script not available — skipping');
  }
  console.log('');

  // ── Step 6: Write dashboard-data.json and report ─────────────────────────
  console.log('[6/6] Writing dashboard and report...');

  const dashboardData = readJson(DASHBOARD_FILE) || {};
  const durationMs = Date.now() - pipelineStart;

  // Build aggregated projects map (for dashboard.overnightAnalysis.projects)
  const projectsMap = {};
  for (const r of synthesisResults) {
    if (!r.analysis) continue;
    projectsMap[slugify(r.project)] = {
      state:            r.analysis.state,
      suggestions:      r.analysis.suggestions,
      qualityIssues:    r.analysis.qualityIssues,
      neglected:        r.analysis.neglected,
      crossProjectDeps: r.analysis.crossProjectDeps,
    };
  }

  // Global insights + top priority (aggregate from per-project globalInsight fields)
  const globalInsights = synthesisResults
    .filter(r => r.analysis?.globalInsight)
    .map(r => r.analysis.globalInsight);

  const topHighCard = allCards
    .filter(c => c.priority === 'urgent' || c.priority === 'high')
    .sort((a, b) => (a.priority === 'urgent' ? -1 : 1))[0];

  const topPriorityAction = topHighCard
    ? `[${topHighCard.project}] ${topHighCard.title}`
    : (globalInsights[0] ?? 'No high-priority items found');

  // Update overnightAnalysis section (preserves existing shape for Command Center)
  dashboardData.overnightAnalysis = {
    generatedAt:              new Date().toISOString(),
    durationMs,
    model:                    'tiered (haiku/sonnet)',
    estimatedCostUsd:         Math.round(budget.totalCostUsd * 10000) / 10000,
    estimatedInputTokens:     budget.totalInputTokens,
    estimatedOutputTokens:    budget.totalOutputTokens,
    budgetLimit:              parseFloat(process.env.OVERNIGHT_BUDGET ?? '5.00'),
    budgetLimitReached:       budget.limitReached,
    projectsScanned:          projects.length,
    projectsWithFindings:     projectsWithFindings.length,
    projectsProcessedByLLM:   budget.projectsCalled,
    kanbanCardsPushed:        kanbanResult.pushed,
    kanbanCardsPending:       kanbanResult.skipped,
    projects:                 projectsMap,
    globalInsights,
    topPriorityAction,
  };

  // Update priorityInbox with doc health suggestions
  if (!dashboardData.priorityInbox) {
    dashboardData.priorityInbox = { urgent: [], aiSuggested: [], today: [], backlog: [] };
  }
  if (!Array.isArray(dashboardData.priorityInbox.aiSuggested)) {
    dashboardData.priorityInbox.aiSuggested = [];
  }
  // Remove stale doc-health entries before re-inserting fresh ones
  dashboardData.priorityInbox.aiSuggested = dashboardData.priorityInbox.aiSuggested.filter(
    item => !(typeof item?.id === 'string' && item.id.startsWith('doc-health-')),
  );
  if (docHealth?.staleDocs?.length) {
    const docCards = docHealth.staleDocs.slice(0, 5).map(doc => ({
      id:        `doc-health-${doc.id}`,
      title:     `Refresh stale doc: ${doc.filePath}`,
      type:      'ai-suggestion',
      source:    'doc-health-check',
      priority:  doc.priority === 'HIGH' ? 'urgent' : 'today',
      addedAt:   new Date().toISOString(),
      reasoning: `${doc.daysSinceUpdate} days since last update (${doc.reason})`,
    }));
    dashboardData.priorityInbox.aiSuggested.unshift(...docCards);
  }

  // Update docHealth section
  if (docHealth) {
    dashboardData.docHealth = {
      lastRun:   docHealth.generatedAt,
      staleDocs: docHealth.staleDocs || [],
    };
  }

  // Patch personalProjects with per-project analysis
  if (Array.isArray(dashboardData.personalProjects?.projects)) {
    dashboardData.personalProjects.projects = dashboardData.personalProjects.projects.map(p => {
      const key = slugify(p.name);
      const analysis = projectsMap[key];
      if (!analysis) return p;
      return {
        ...p,
        state:            analysis.state,
        suggestions:      analysis.suggestions || [],
        neglected:        analysis.neglected    || [],
        crossProjectDeps: analysis.crossProjectDeps || [],
      };
    });
  }

  writeFileSync(DASHBOARD_FILE, JSON.stringify(dashboardData, null, 2));
  console.log(`  Dashboard updated: ${DASHBOARD_FILE}`);

  // ── Write overnight-report.md ──────────────────────────────────────────
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  let report = `# Overnight Project Analysis Report
## ${dateStr} at ${timeStr}

**Pipeline:** v2 (tiered - haiku/sonnet)
**Duration:** ${Math.round(durationMs / 1000)}s
**Budget used:** $${budget.totalCostUsd.toFixed(4)} / $${process.env.OVERNIGHT_BUDGET ?? '5.00'}
**Projects scanned:** ${projects.length} | **With findings:** ${projectsWithFindings.length} | **LLM processed:** ${budget.projectsCalled}
**Kanban cards:** ${allCards.length} generated | ${kanbanResult.pushed} pushed | ${kanbanResult.skipped} pending (see ${CARDS_FILE})
${budget.limitReached ? '\n> ⚠ **Budget ceiling reached** — some projects were not LLM-synthesised\n' : ''}

---

## Top Priority Action
${topPriorityAction}

`;

  if (globalInsights.length) {
    report += `## Global Insights\n${globalInsights.map(i => `- ${i}`).join('\n')}\n\n`;
  }

  if (docHealth) {
    report += `## Documentation Freshness\n`;
    report += `- Stale docs: ${docHealth.summary?.staleCount ?? 0} (high priority: ${docHealth.summary?.highPriorityCount ?? 0})\n`;
    if (docHealth.staleDocs?.length) {
      for (const doc of docHealth.staleDocs.slice(0, 5)) {
        report += `  - [${doc.priority}] ${doc.filePath} (${doc.daysSinceUpdate}d)\n`;
      }
    }
    report += '\n';
  }

  report += `## Project Findings\n\n`;

  for (const entry of projects) {
    const key = slugify(entry.name);
    const health = healthResults.find(h => h.project === entry.name);
    const synthesis = synthesisResults.find(s => s.project === entry.name);
    const analysis = projectsMap[key];

    // Only include projects that had something to report
    if (!health?.findings?.length && !analysis) continue;

    report += `### ${entry.name} (${entry.phase})\n`;

    if (health?.findings?.length) {
      report += `**Deterministic findings (${health.findings.length}):**\n`;
      for (const f of health.findings) {
        const icon = f.severity === 'high' ? '🔴' : f.severity === 'medium' ? '🟡' : '🟢';
        report += `${icon} \`${f.type}\` — ${f.message}\n`;
      }
      report += '\n';
    }

    if (analysis) {
      report += `**State:** ${analysis.state}\n\n`;
      if (analysis.suggestions?.length) {
        report += `**Suggestions:**\n`;
        for (const s of analysis.suggestions) {
          report += `- [${s.priority}][${s.effort}] ${s.action}\n`;
        }
        report += '\n';
      }
      if (analysis.qualityIssues?.length) {
        report += `**Quality issues:** ${analysis.qualityIssues.join('; ')}\n\n`;
      }
    }

    const projectCards = allCards.filter(c => c.project === entry.name);
    if (projectCards.length) {
      report += `**Kanban cards (${projectCards.length}):**\n`;
      for (const c of projectCards) {
        report += `- [${c.priority}][${c.type}] ${c.title}\n`;
      }
      report += '\n';
    }
  }

  if (allCards.length > 0 && kanbanResult.pushed === 0) {
    report += `---\n\n## ⏳ Pending Kanban Cards (${allCards.length})\n`;
    report += `Cards saved to \`pending-kanban-cards.json\`. `;
    report += `To push: configure vibe-kanban (\`npm run vibe-kanban:discover\`) then run:\n`;
    report += `\`\`\`\nnode scripts/push-pending-kanban-cards.mjs\n\`\`\`\n\n`;
  }

  writeFileSync(REPORT_FILE, report);
  console.log(`  Report written: ${REPORT_FILE}`);
  console.log(`\n====== Overnight Analysis Complete (${Math.round(durationMs / 1000)}s) ======\n`);
}

// ── Entry point ───────────────────────────────────────────────────────────────
runOvernightPipeline().catch(err => {
  console.error('Fatal error in overnight pipeline:', err);
  process.exit(1);
});
