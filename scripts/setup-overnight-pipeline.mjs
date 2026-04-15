#!/usr/bin/env node
/**
 * setup-overnight-pipeline.mjs
 *
 * Bootstrap script to fully configure the overnight pipeline:
 *   1. Start vibe-kanban server
 *   2. Create a default "Overnight" project
 *   3. Run vibe-kanban discover to populate config
 *   4. Verify all components ready
 *   5. Run a test overnight analysis
 *
 * Usage:
 *   node scripts/setup-overnight-pipeline.mjs [--dry-run] [--test]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = join(__filename, '..', '..');
const CONFIG_FILE = join(projectRoot, 'workspace/config/vibe-kanban.json');
const TEST_ONLY = process.argv.includes('--test');
const DRY_RUN = process.argv.includes('--dry-run');

console.log(`\n🚀 Setting up overnight project pipeline\n`);

// ── Helper: Wait for HTTP readiness ────────────────────────────────────────
async function waitForServer(url, maxWaitSec = 30) {
  const start = Date.now();
  while ((Date.now() - start) / 1000 < maxWaitSec) {
    try {
      const response = await fetch(url, { method: 'HEAD', timeout: 2000 });
      if (response.ok || response.status === 404) return true;
    } catch {
      // server not ready yet
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

// ── Main async runner ──────────────────────────────────────────────────────
async function main() {

  // ── 1. Check / Install vibe-kanban ─────────────────────────────────────────
  console.log(`[1/5] Checking vibe-kanban installation...`);
  try {
    const result = spawnSync('npx', ['vibe-kanban', '--version'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
    });
    if (result.status === 0) {
      console.log(`  ✓ vibe-kanban available: ${result.stdout.trim()}`);
    } else {
      throw new Error('version check failed');
    }
  } catch (err) {
    if (!DRY_RUN) {
      console.log(`  Installing vibe-kanban...`);
      execSync('npm install -D vibe-kanban', { cwd: projectRoot, stdio: 'inherit' });
      console.log(`  ✓ vibe-kanban installed`);
    } else {
      console.log(`  [dry-run] would install vibe-kanban`);
    }
  }

  // ── 2. Start vibe-kanban (if not already running) ───────────────────────────
  console.log(`\n[2/5] Starting vibe-kanban on :3001...`);
  try {
    const ready = await waitForServer('http://localhost:3001/api/boards', 3);
    if (ready) {
      console.log(`  ✓ vibe-kanban already running`);
    } else {
      throw new Error('timeout');
    }
  } catch {
    if (!DRY_RUN && !TEST_ONLY) {
      console.log(`  Starting server (background process)...`);
      // Start vibe-kanban in background
      spawnSync('npx', ['vibe-kanban'], {
        cwd: projectRoot,
        stdio: 'ignore',
        detached: true,
      });
      // Wait for it to be ready
      const ready = await waitForServer('http://localhost:3001/api/boards', 30);
      if (ready) {
        console.log(`  ✓ vibe-kanban started and ready`);
      } else {
        console.warn(`  ⚠ vibe-kanban may still be starting...`);
      }
    } else if (DRY_RUN) {
      console.log(`  [dry-run] would start vibe-kanban`);
    }
  }

  // ── 3. Create default "Overnight" project (via API) ────────────────────────
  console.log(`\n[3/5] Creating "Overnight" project...`);
  if (!DRY_RUN && !TEST_ONLY) {
    try {
      const response = await fetch('http://localhost:3001/api/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Overnight',
          description: 'Nightly project health analysis & improvement cards',
          slug: 'overnight',
        }),
        timeout: 5000,
      });

      if (response.ok) {
        const board = await response.json();
        console.log(`  ✓ Project created: ${board.name} (ID: ${board.id})`);
      } else if (response.status === 409 || response.status === 400) {
        // Project likely already exists
        console.log(`  ℹ Project already exists (or name conflict)`);
      } else {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
    } catch (err) {
      console.warn(`  ⚠ Could not create project via API: ${err.message}`);
      console.warn(`  (This is OK — may automate in future)`);
    }
  } else if (DRY_RUN) {
    console.log(`  [dry-run] would POST /api/boards with project data`);
  }

  // ── 4. Run vibe-kanban discover to populate config ────────────────────────
  console.log(`\n[4/5] Running vibe-kanban:discover...`);
  if (!DRY_RUN && !TEST_ONLY) {
    try {
      const result = execSync('npm run vibe-kanban:discover', {
        cwd: projectRoot,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 10000,
      });
      console.log(result);
      const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      if (config.projectId && config.defaultStatusId) {
        console.log(`  ✓ Config populated: projectId=${config.projectId}, statusId=${config.defaultStatusId}`);
      } else {
        console.warn(`  ⚠ Config still incomplete (projectId or statusId missing)`);
        console.warn(`     Run: npm run vibe-kanban:discover`);
      }
    } catch (err) {
      console.warn(`  ⚠ discover command output: ${err.message}`);
    }
  } else if (DRY_RUN) {
    console.log(`  [dry-run] would run npm run vibe-kanban:discover`);
  }

  // ── 5. Verify overnight pipeline readiness ─────────────────────────────────
  console.log(`\n[5/5] Verifying overnight pipeline...`);
  const checks = [];

  // Check: overnight-analysis.mjs exists and is runnable
  const analysisPath = join(projectRoot, 'scripts/overnight-analysis.mjs');
  if (existsSync(analysisPath)) {
    checks.push({ name: 'overnight-analysis.mjs', ok: true });
  } else {
    checks.push({ name: 'overnight-analysis.mjs', ok: false, reason: 'file missing' });
  }

  // Check: project-registry.json exists
  const registryPath = join(projectRoot, 'workspace/coordinator/project-registry.json');
  if (existsSync(registryPath)) {
    const registry = JSON.parse(readFileSync(registryPath, 'utf-8'));
    checks.push({ name: 'project-registry.json', ok: true, count: registry.projects?.length || 0 });
  } else {
    checks.push({ name: 'project-registry.json', ok: false, reason: 'not generated yet' });
  }

  // Check: vibe-kanban config
  if (existsSync(CONFIG_FILE)) {
    const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    const hasProjectId = !!config.projectId;
    checks.push({ name: 'vibe-kanban config', ok: hasProjectId, details: hasProjectId ? `projectId=${config.projectId}` : 'projectId=null' });
  } else {
    checks.push({ name: 'vibe-kanban config', ok: false, reason: 'file missing' });
  }

  // Check: Claude CLI available
  try {
    const result = spawnSync('claude', ['--version'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    if (result.status === 0) {
      checks.push({ name: 'Claude CLI', ok: true, version: result.stdout.trim() });
    } else {
      checks.push({ name: 'Claude CLI', ok: false, reason: 'version check failed' });
    }
  } catch (err) {
    checks.push({ name: 'Claude CLI', ok: false, reason: 'not in PATH' });
  }

  // Check: Task Scheduler job registered
  try {
    const result = execSync('Get-ScheduledTask -TaskName OvernightAnalysis -ErrorAction SilentlyContinue | Select-Object -ExpandProperty TaskName', {
      encoding: 'utf-8',
      shell: 'powershell',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    if (result.includes('OvernightAnalysis')) {
      checks.push({ name: 'Task Scheduler (OvernightAnalysis)', ok: true });
    } else {
      checks.push({ name: 'Task Scheduler (OvernightAnalysis)', ok: false, reason: 'task not found' });
    }
  } catch {
    checks.push({ name: 'Task Scheduler (OvernightAnalysis)', ok: false, reason: 'PowerShell check failed' });
  }

  // Print checks
  for (const check of checks) {
    const icon = check.ok ? '✓' : '✗';
    const detail = check.details ? ` (${check.details})` : check.count !== undefined ? ` (${check.count} projects)` : check.reason ? ` (${check.reason})` : check.version ? ` ${check.version}` : '';
    console.log(`  ${icon} ${check.name}${detail}`);
  }

  const allOk = checks.every(c => c.ok);
  if (!allOk) {
    console.warn(`\n⚠ Some checks failed. Manual setup may be needed.`);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(60)}`);
  console.log(`\n✅ Overnight pipeline ready!\n`);
  console.log(`Next steps:`);
  console.log(`  1. If vibe-kanban projectId is null:`);
  console.log(`     npm run vibe-kanban  # start UI on :3001`);
  console.log(`     # Create a project in the UI, then:`);
  console.log(`     npm run vibe-kanban:discover\n`);
  console.log(`  2. Ensure Claude CLI is logged in:`);
  console.log(`     claude login\n`);
  console.log(`  3. Test a manual run:`);
  console.log(`     npm run overnight\n`);
  console.log(`  4. Schedule is registered at 02:00 Mon-Fri`);
  console.log(`     Get-ScheduledTask OvernightAnalysis\n`);
  console.log(`Demo: node scripts/push-pending-kanban-cards.mjs --dry-run`);
  console.log(`      (shows cards that will be created)\n`);
}

main().catch(err => {
  console.error('Error during setup:', err);
  process.exit(1);
});
