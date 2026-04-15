#!/usr/bin/env node
/**
 * project-health-check.mjs
 *
 * Deterministic per-project health checks — no LLM required.
 * Returns a structured findings array for each project.
 *
 * Export:  checkProjectHealth(entry) → HealthResult
 * CLI:     node scripts/project-health-check.mjs [path]
 *
 * Finding shape:
 *   { id, severity: 'high'|'medium'|'low', type, message, context }
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// ── Constants ─────────────────────────────────────────────────────────────────

const SOURCE_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.py', '.go', '.cs', '.java', '.rb', '.rs', '.cpp', '.c',
]);

const STALE_COMMIT_DAYS   = 30;  // building project with no commits
const STALE_README_DAYS   = 60;  // readme not touched in 60 days
const TODO_HIGH_THRESHOLD = 10;  // ≥10 = high severity
const TODO_MED_THRESHOLD  =  3;  // ≥3  = medium severity
const MAX_SCAN_FILES      = 50;  // cap file traversal per project
const MAX_WALK_DEPTH      =  4;  // max directory depth

// ── Filesystem helpers ────────────────────────────────────────────────────────

function daysSinceModified(filePath) {
  try {
    return (Date.now() - statSync(filePath).mtimeMs) / 86_400_000;
  } catch {
    return null;
  }
}

function walkDir(dir, maxDepth = MAX_WALK_DEPTH, depth = 0) {
  if (depth > maxDepth) return [];
  const results = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (['node_modules', '__pycache__', 'dist', 'build', '.next', 'coverage'].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(full, maxDepth, depth + 1));
    } else {
      results.push(full);
    }
  }
  return results;
}

// ── Individual checks ─────────────────────────────────────────────────────────

function checkReadme(dir) {
  const findings = [];
  const readmePath = join(dir, 'README.md');
  if (!existsSync(readmePath)) {
    findings.push({
      id: 'missing-readme',
      severity: 'medium',
      type: 'missing-readme',
      message: 'No README.md found',
      context: null,
    });
  } else {
    const days = daysSinceModified(readmePath);
    if (days !== null && days > STALE_README_DAYS) {
      findings.push({
        id: 'readme-stale',
        severity: 'low',
        type: 'readme-stale',
        message: `README.md not updated in ${Math.round(days)} days`,
        context: { daysSince: Math.round(days) },
      });
    }
  }
  return findings;
}

function checkTodos(dir) {
  const files = walkDir(dir)
    .filter(f => SOURCE_EXTENSIONS.has(extname(f)))
    .slice(0, MAX_SCAN_FILES);

  let count = 0;
  for (const file of files) {
    try {
      const matches = readFileSync(file, 'utf-8').match(/\b(TODO|FIXME|HACK|XXX)\b/g);
      if (matches) count += matches.length;
    } catch {
      // skip unreadable files
    }
  }

  if (count >= TODO_HIGH_THRESHOLD) {
    return [{
      id: 'todo-count',
      severity: 'high',
      type: 'todo-count',
      message: `${count} TODO/FIXME markers in ${files.length} scanned files`,
      context: { count, scannedFiles: files.length },
    }];
  }
  if (count >= TODO_MED_THRESHOLD) {
    return [{
      id: 'todo-count',
      severity: 'medium',
      type: 'todo-count',
      message: `${count} TODO/FIXME markers found`,
      context: { count, scannedFiles: files.length },
    }];
  }
  return [];
}

function checkTestCoverage(dir) {
  const allFiles = walkDir(dir).filter(f => SOURCE_EXTENSIONS.has(extname(f)));
  const testFiles = allFiles.filter(f => {
    const norm = f.replace(/\\/g, '/');
    return (
      norm.includes('.test.') ||
      norm.includes('.spec.') ||
      norm.includes('__tests__') ||
      norm.includes('_test.')
    );
  });
  const sourceFiles = allFiles.length;
  const testCount = testFiles.length;

  if (sourceFiles >= 5 && testCount === 0) {
    return [{
      id: 'no-tests',
      severity: 'high',
      type: 'no-tests',
      message: `${sourceFiles} source files but no test files found`,
      context: { sourceFiles, testFiles: 0 },
    }];
  }
  if (sourceFiles >= 10 && testCount < Math.floor(sourceFiles * 0.1)) {
    return [{
      id: 'low-test-coverage',
      severity: 'medium',
      type: 'low-test-coverage',
      message: `Low test coverage: ${testCount}/${sourceFiles} source files have tests`,
      context: { sourceFiles, testFiles: testCount },
    }];
  }
  return [];
}

function checkUncommitted(dir, hasGit) {
  if (!hasGit) return [];
  try {
    const output = execSync('git status --porcelain', {
      cwd: dir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    const count = output.trim().split('\n').filter(Boolean).length;
    if (count >= 5) {
      return [{
        id: 'uncommitted-changes',
        severity: count >= 15 ? 'high' : 'medium',
        type: 'uncommitted-changes',
        message: `${count} uncommitted file changes`,
        context: { count },
      }];
    }
  } catch {
    // git not available or not a real repo
  }
  return [];
}

function checkStaleBuilding(entry) {
  if (!entry.hasGit || entry.phase !== 'Building' || !entry.lastCommit) return [];
  const daysSince = (Date.now() - new Date(entry.lastCommit).getTime()) / 86_400_000;
  if (daysSince > STALE_COMMIT_DAYS) {
    return [{
      id: 'stale-building',
      severity: 'medium',
      type: 'stale-project',
      message: `Marked "Building" but last commit was ${Math.round(daysSince)} days ago`,
      context: { daysSince: Math.round(daysSince), lastCommit: entry.lastCommit },
    }];
  }
  return [];
}

function checkChangelogPending(dir) {
  const pendingPath = join(dir, 'CHANGELOG-PENDING.md');
  if (!existsSync(pendingPath)) return [];
  try {
    const content = readFileSync(pendingPath, 'utf-8').trim();
    const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    const days = daysSinceModified(pendingPath);
    if (lines.length > 0 && days !== null && days > 3) {
      return [{
        id: 'changelog-pending',
        severity: 'low',
        type: 'changelog-pending',
        message: `CHANGELOG-PENDING.md has ${lines.length} unpublished entries (${Math.round(days)} days old)`,
        context: { pendingLines: lines.length, daysSince: Math.round(days) },
      }];
    }
  } catch {
    // skip
  }
  return [];
}

function checkMissingClaudeMd(entry) {
  if (!['Building', 'Review'].includes(entry.phase) || entry.hasClaude) return [];
  return [{
    id: 'missing-claude-md',
    severity: 'low',
    type: 'missing-claude-md',
    message: 'Active project has no CLAUDE.md context file',
    context: null,
  }];
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Run all deterministic checks on one project.
 *
 * @param {object} entry - Project entry from project-registry.json
 * @returns {HealthResult}
 */
export function checkProjectHealth(entry) {
  if (!entry.path || !existsSync(entry.path)) {
    return {
      project: entry.name,
      path: entry.path || null,
      findings: [],
      skipped: true,
      skipReason: 'path not found or inaccessible',
      sourceFileCount: 0,
      testFileCount: 0,
    };
  }

  const dir = entry.path;

  const findings = [
    ...checkReadme(dir),
    ...checkTodos(dir),
    ...checkTestCoverage(dir),
    ...checkUncommitted(dir, entry.hasGit),
    ...checkStaleBuilding(entry),
    ...checkChangelogPending(dir),
    ...checkMissingClaudeMd(entry),
  ];

  // Attach rough file counts for model routing in synthesize step
  const allSourceFiles = walkDir(dir)
    .filter(f => SOURCE_EXTENSIONS.has(extname(f)));
  const testFileCount = allSourceFiles.filter(f => {
    const n = f.replace(/\\/g, '/');
    return n.includes('.test.') || n.includes('.spec.') || n.includes('__tests__');
  }).length;

  return {
    project: entry.name,
    path: dir,
    findings,
    skipped: false,
    sourceFileCount: allSourceFiles.length,
    testFileCount,
  };
}

// ── CLI mode ──────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && (
  process.argv[1].endsWith('project-health-check.mjs') ||
  process.argv[1] === fileURLToPath(import.meta.url)
);

if (isMain) {
  const dir = process.argv[2] || process.cwd();
  const entry = {
    name: dir.replace(/\\/g, '/').split('/').pop(),
    path: dir.replace(/\\/g, '/'),
    phase: 'Building',
    hasGit: existsSync(join(dir, '.git')),
    hasClaude: existsSync(join(dir, 'CLAUDE.md')),
    lastCommit: null,
  };
  const result = checkProjectHealth(entry);
  console.log(JSON.stringify(result, null, 2));
}
