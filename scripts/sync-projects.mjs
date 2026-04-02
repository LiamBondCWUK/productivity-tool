#!/usr/bin/env node
/**
 * sync-projects.mjs
 *
 * Syncs personal-projects.json into dashboard-data.json.personalProjects.
 * For each project with a gitDir, reads the last commit timestamp.
 * Run on startup or as part of gm-auto.ps1.
 *
 * Usage: node scripts/sync-projects.mjs
 */

import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../');
const PROJECTS_CONFIG = join(ROOT, 'workspace/config/personal-projects.json');
const DASHBOARD_DATA = join(ROOT, 'workspace/coordinator/dashboard-data.json');

function getGitActivity(gitDir) {
  if (!gitDir) return { lastActivity: null, lastCommitSubject: null };
  try {
    const out = execFileSync('git', ['-C', gitDir, 'log', '-1', '--format=%ci|%s'], {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
    if (!out) return { lastActivity: null, lastCommitSubject: null };
    const pipeIdx = out.indexOf('|');
    const dateStr = out.slice(0, pipeIdx).trim();
    const subject = out.slice(pipeIdx + 1).trim() || null;
    return {
      lastActivity: new Date(dateStr).toISOString(),
      lastCommitSubject: subject,
    };
  } catch {
    return { lastActivity: null, lastCommitSubject: null };
  }
}

function syncProjects() {
  const projectsConfig = JSON.parse(readFileSync(PROJECTS_CONFIG, 'utf8'));
  const dashData = JSON.parse(readFileSync(DASHBOARD_DATA, 'utf8'));

  // Preserve overnight suggestions and phase overrides from previous data
  const existing = {};
  for (const p of dashData.personalProjects?.projects ?? []) {
    existing[p.id] = p;
  }

  const projects = projectsConfig.map((config) => {
    const { lastActivity, lastCommitSubject } = getGitActivity(config.gitDir);
    const prev = existing[config.id] ?? {};

    return {
      id: config.id,
      name: config.name,
      description: config.description ?? null,
      phase: prev.phase ?? config.phase,
      completionPercent: config.completionPercent,
      dir: config.dir ?? null,
      gitDir: config.gitDir ?? null,
      devDocsDir: config.devDocsDir ?? null,
      tags: config.tags ?? [],
      lastActivity: lastActivity ?? prev.lastActivity ?? null,
      lastCommitSubject: lastCommitSubject ?? prev.lastCommitSubject ?? null,
      suggestions: prev.suggestions ?? [],
      state: prev.state ?? null,
      crossProjectDeps: prev.crossProjectDeps ?? [],
      neglected: prev.neglected ?? false,
    };
  });

  dashData.personalProjects = {
    lastRefreshed: new Date().toISOString(),
    projects,
  };

  writeFileSync(DASHBOARD_DATA, JSON.stringify(dashData, null, 2));
  console.log(`[sync-projects] Synced ${projects.length} projects at ${dashData.personalProjects.lastRefreshed}`);
  for (const p of projects) {
    console.log(`  ${p.id}: ${p.phase} ${p.completionPercent}% | last: ${p.lastActivity ?? 'unknown'}`);
  }
}

syncProjects();
