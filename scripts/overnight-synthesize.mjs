#!/usr/bin/env node
/**
 * overnight-synthesize.mjs
 *
 * Budget-guarded per-project LLM synthesis.
 *
 * Hard guardrails:
 *   - $5.00 nightly hard ceiling (configurable via OVERNIGHT_BUDGET env)
 *   - 32,000 char input cap per project prompt (~8k tokens)
 *   - No raw source files in prompt — only structured findings JSON
 *   - No subagents — sequential single-threaded calls only
 *   - Skip unchanged projects (git change detection)
 *   - Only projects WITH findings go to LLM
 *
 * Model selection:
 *   - Haiku:  default (fast, cheap)
 *   - Sonnet: projects with >20 source files AND >5 findings (higher confidence needed)
 *
 * Export:
 *   synthesizeProject(entry, healthResult, budgetState, recentCommits) → SynthesisResult
 *   createBudgetState()                                                 → BudgetState
 *
 * Card shape:
 *   { title, body, priority: 'urgent'|'high'|'medium'|'low', type: 'bug'|'feature'|'improvement'|'docs', labels: string[] }
 */

import { spawnSync, execSync } from 'child_process';

// ── Pricing constants (as of 2025-04) ─────────────────────────────────────────
// Haiku 3.5:  $0.80/MTok input, $4.00/MTok output
// Sonnet 3.7: $3.00/MTok input, $15.00/MTok output
const PRICING = {
  haiku:  { input: 0.80  / 1_000_000, output: 4.00  / 1_000_000 },
  sonnet: { input: 3.00  / 1_000_000, output: 15.00 / 1_000_000 },
};

const HAIKU_MODEL  = process.env.OVERNIGHT_HAIKU_MODEL  ?? 'claude-haiku-4-5-20251001';
const SONNET_MODEL = process.env.OVERNIGHT_SONNET_MODEL ?? 'claude-sonnet-4-5';

// ── Budget hard ceiling ───────────────────────────────────────────────────────
const BUDGET_HARD_LIMIT   = parseFloat(process.env.OVERNIGHT_BUDGET ?? '5.00');
const BUDGET_SOFT_LIMIT   = BUDGET_HARD_LIMIT * 0.90; // warn at 90%
const PER_PROJECT_CHAR_CAP = 32_000; // ~8k tokens

// ── Token estimation (rough: 4 chars ≈ 1 token) ──────────────────────────────
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function estimateCost(modelKey, inputTokens, outputTokens) {
  const p = PRICING[modelKey];
  return (inputTokens * p.input) + (outputTokens * p.output);
}

// ── Budget state factory ──────────────────────────────────────────────────────
export function createBudgetState() {
  return {
    totalCostUsd:       0,
    totalInputTokens:   0,
    totalOutputTokens:  0,
    projectsCalled:     0,
    projectsSkipped:    0,
    limitReached:       false,
  };
}

// ── Model selector ────────────────────────────────────────────────────────────
function selectModel(healthResult) {
  const useSonnet =
    healthResult.sourceFileCount > 20 &&
    healthResult.findings.length >= 5;
  return useSonnet ? { key: 'sonnet', name: SONNET_MODEL } : { key: 'haiku', name: HAIKU_MODEL };
}

// ── Prompt builder ────────────────────────────────────────────────────────────
function buildPrompt(entry, healthResult, recentCommits) {
  const projectSummary = {
    name:            entry.name,
    phase:           entry.phase,
    description:     entry.description || null,
    lastCommit:      entry.lastCommit   || null,
    lastCommitMsg:   entry.lastCommitMsg || null,
    hasGit:          entry.hasGit,
    hasClaude:       entry.hasClaude,
    hasPkg:          entry.hasPkg,
    sourceFileCount: healthResult.sourceFileCount,
    testFileCount:   healthResult.testFileCount,
    findings:        healthResult.findings,
    recentCommits:   (recentCommits || []).slice(0, 10),
  };

  const systemPrompt = `You are an AI assistant performing a nightly health analysis of a developer's personal projects.
Analyse the structured findings and project metadata provided.
Be specific and actionable — reference exact finding IDs, file metrics, or commit patterns where relevant.
Respond ONLY with valid JSON (no markdown backtick wrapper).`;

  const userPrompt = `Analyse this project and produce exactly this JSON structure:
{
  "state": "<1-sentence current state summary>",
  "suggestions": [
    { "priority": "HIGH|MED|LOW", "action": "<specific actionable text>", "effort": "S|M|L" }
  ],
  "qualityIssues": ["<specific issue>"],
  "neglected": ["<specific gap>"],
  "crossProjectDeps": ["<dependency note>"],
  "globalInsight": "<optional 1-sentence cross-project pattern>",
  "cards": [
    {
      "title": "<short card title>",
      "body": "<2-4 sentence description with context>",
      "priority": "urgent|high|medium|low",
      "type": "bug|feature|improvement|docs"
    }
  ]
}

Rules:
- suggestions: 2-3 items maximum, ranked by impact
- cards: one card per HIGH finding, optional for MEDIUM — do not create cards for LOW findings
- qualityIssues: only if concrete problems found, else []
- neglected: only if genuinely stale/abandoned, else []
- crossProjectDeps: only if this project clearly blocks/needs another, else []
- globalInsight: omit if nothing notable

PROJECT METADATA:
${JSON.stringify(projectSummary, null, 2)}`;

  return { systemPrompt, userPrompt };
}

// ── Claude CLI call ───────────────────────────────────────────────────────────
function callClaudeCLI(systemPrompt, userPrompt, modelName) {
  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
  const result = spawnSync('claude', ['--print', '--model', modelName], {
    input: fullPrompt,
    encoding: 'utf-8',
    timeout: 120_000,
    maxBuffer: 4 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (result.error) throw new Error(`Claude CLI spawn error: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`Claude CLI exited ${result.status}: ${(result.stderr || '').slice(0, 300)}`);
  }
  return result.stdout.trim();
}

// ── JSON extraction ───────────────────────────────────────────────────────────
function extractJson(text) {
  // Try to peel off markdown code fences if present
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return JSON.parse(fenced[1].trim());
  // Grab first { ... } block
  const braceMatch = text.match(/(\{[\s\S]*\})/);
  if (braceMatch) return JSON.parse(braceMatch[1].trim());
  return JSON.parse(text);
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Synthesise one project using LLM. Updates budgetState in-place.
 *
 * @param {object}        entry         - Project entry (from registry)
 * @param {object}        healthResult  - Output from checkProjectHealth()
 * @param {object}        budgetState   - Mutable budget tracker (createBudgetState())
 * @param {string[]}      recentCommits - Git log lines (last 7 days)
 * @returns {SynthesisResult}
 */
export async function synthesizeProject(entry, healthResult, budgetState, recentCommits = []) {
  // ── Pre-flight: skip if no findings ──────────────────────────────────────
  if (healthResult.skipped || healthResult.findings.length === 0) {
    budgetState.projectsSkipped += 1;
    return {
      project: entry.name,
      skipped: true,
      skipReason: healthResult.skipped ? healthResult.skipReason : 'no findings — healthy project',
      analysis: null,
      cards: [],
      modelUsed: null,
      costUsd: 0,
    };
  }

  // ── Pre-flight: budget check ──────────────────────────────────────────────
  if (budgetState.limitReached) {
    budgetState.projectsSkipped += 1;
    return {
      project: entry.name,
      skipped: true,
      skipReason: `budget ceiling $${BUDGET_HARD_LIMIT} reached`,
      analysis: null,
      cards: [],
      modelUsed: null,
      costUsd: 0,
    };
  }

  const model = selectModel(healthResult);
  const { systemPrompt, userPrompt } = buildPrompt(entry, healthResult, recentCommits);

  // ── Input size guard ──────────────────────────────────────────────────────
  const fullInput = `${systemPrompt}\n\n${userPrompt}`;
  const cappedInput = fullInput.length > PER_PROJECT_CHAR_CAP
    ? fullInput.slice(0, PER_PROJECT_CHAR_CAP) + '\n[...truncated to stay within token budget]'
    : fullInput;

  const estimatedInputTokens  = estimateTokens(cappedInput);
  const estimatedOutputTokens = 400; // conservative estimate
  const projectedCost = estimateCost(model.key, estimatedInputTokens, estimatedOutputTokens);

  // Check if this call would push us over the hard limit
  if (budgetState.totalCostUsd + projectedCost > BUDGET_HARD_LIMIT) {
    budgetState.limitReached = true;
    budgetState.projectsSkipped += 1;
    console.warn(`[synthesize] Budget ceiling $${BUDGET_HARD_LIMIT} would be exceeded — stopping synthesis`);
    return {
      project: entry.name,
      skipped: true,
      skipReason: `would exceed $${BUDGET_HARD_LIMIT} budget ceiling`,
      analysis: null,
      cards: [],
      modelUsed: null,
      costUsd: 0,
    };
  }

  if (budgetState.totalCostUsd >= BUDGET_SOFT_LIMIT) {
    console.warn(`[synthesize] Soft budget threshold reached ($${budgetState.totalCostUsd.toFixed(4)} / $${BUDGET_HARD_LIMIT})`);
  }

  // ── Call Claude ────────────────────────────────────────────────────────────
  let rawOutput = '';
  let analysis = null;
  let callError = null;

  try {
    console.log(`[synthesize] ${entry.name} (${model.key}, ${healthResult.findings.length} findings)`);
    rawOutput = callClaudeCLI(systemPrompt, `${userPrompt}${cappedInput !== fullInput ? '\n[...truncated]' : ''}`, model.name);

    // Measure actual output tokens (post-call)
    const actualOutputTokens = estimateTokens(rawOutput);
    const actualCost = estimateCost(model.key, estimatedInputTokens, actualOutputTokens);

    budgetState.totalCostUsd      += actualCost;
    budgetState.totalInputTokens  += estimatedInputTokens;
    budgetState.totalOutputTokens += actualOutputTokens;
    budgetState.projectsCalled    += 1;

    analysis = extractJson(rawOutput);
  } catch (err) {
    callError = err.message;
    console.error(`[synthesize] ${entry.name} failed: ${callError}`);
    budgetState.projectsCalled += 1;

    // Return structured error — don't rethrow to allow remaining projects to run
    return {
      project: entry.name,
      skipped: false,
      skipReason: null,
      analysis: null,
      cards: [],
      error: callError,
      modelUsed: model.name,
      costUsd: 0,
    };
  }

  // ── Post-process cards ────────────────────────────────────────────────────
  const cards = (analysis.cards || []).map(card => ({
    title:    card.title    || `[${entry.name}] ${card.type ?? 'finding'}`,
    body:     card.body     || '',
    priority: card.priority || 'medium',
    type:     card.type     || 'improvement',
    labels:   [
      entry.name.toLowerCase().replace(/\s+/g, '-'),
      'overnight',
      card.type || 'improvement',
    ],
    project: entry.name,
  }));

  const costUsd = estimateCost(
    model.key,
    estimatedInputTokens,
    estimateTokens(rawOutput),
  );

  return {
    project: entry.name,
    skipped: false,
    skipReason: null,
    analysis: {
      state:            analysis.state            || '',
      suggestions:      analysis.suggestions      || [],
      qualityIssues:    analysis.qualityIssues     || [],
      neglected:        analysis.neglected         || [],
      crossProjectDeps: analysis.crossProjectDeps  || [],
      globalInsight:    analysis.globalInsight     || null,
    },
    cards,
    modelUsed: model.name,
    costUsd,
  };
}

// ── Utility: get recent git commits ──────────────────────────────────────────
export function getRecentCommits(dir, hasGit, sinceDays = 7) {
  if (!hasGit) return [];
  try {
    const output = execSync(
      `git log --since="${sinceDays} days ago" --oneline`,
      { cwd: dir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 },
    );
    return output.trim().split('\n').filter(Boolean).slice(0, 15);
  } catch {
    return [];
  }
}
