#!/usr/bin/env node
/**
 * project-discovery.mjs
 * Scans ~/Documents/ for git repos / package.json / CLAUDE.md
 * Writes project-registry.json to workspace/coordinator/
 */
import { readdirSync, existsSync, readFileSync, writeFileSync, statSync } from "fs";
import { join, resolve } from "path";
import { execSync } from "child_process";
import { homedir } from "os";

const DOCS_DIR = join(homedir(), "Documents");
const OUTPUT_FILE = join(
  new URL(".", import.meta.url).pathname
    .replace(/^\/([A-Z]:)/, "$1")
    .replace(/%20/g, " "),
  "..",
  "workspace",
  "coordinator",
  "project-registry.json",
);

const EXCLUDE_DIRS = new Set([
  "Obsidian Vault",
  "My Music",
  "My Pictures",
  "My Videos",
  "dotfiles",
  "code",
  "chrome-cdp-skill-repo",
  "Cloud SDK API Reference",
  "archived-browser-dumps",
  "Guides",
  "PowerShell",
  "node_modules",
  ".git",
]);

function getLastCommit(dir) {
  try {
    const iso = execSync('git log -1 --format="%aI"', {
      cwd: dir,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5000,
    })
      .toString()
      .trim()
      .replace(/^"|"$/g, "");
    return iso || null;
  } catch {
    return null;
  }
}

function getLastCommitMessage(dir) {
  try {
    return execSync('git log -1 --format="%s"', {
      cwd: dir,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5000,
    })
      .toString()
      .trim()
      .replace(/^"|"$/g, "");
  } catch {
    return null;
  }
}

function detectPhase(name, dir) {
  // Check CLAUDE.md for phase hints
  const claudeMd = join(dir, "CLAUDE.md");
  if (existsSync(claudeMd)) {
    const content = readFileSync(claudeMd, "utf-8").toLowerCase();
    if (content.includes("done") || content.includes("complete") || content.includes("shipped")) {
      return "Done";
    }
    if (content.includes("review") || content.includes("testing")) {
      return "Review";
    }
    if (content.includes("building") || content.includes("in progress")) {
      return "Building";
    }
  }
  // Fallback: if no recent commit → Backlog, else Building
  const lastCommit = getLastCommit(dir);
  if (!lastCommit) return "Backlog";
  const daysSince = (Date.now() - new Date(lastCommit).getTime()) / 86_400_000;
  if (daysSince > 60) return "Done";
  if (daysSince > 14) return "Backlog";
  return "Building";
}

function scanDocuments() {
  const entries = readdirSync(DOCS_DIR, { withFileTypes: true });
  const projects = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (EXCLUDE_DIRS.has(entry.name)) continue;

    const dir = join(DOCS_DIR, entry.name);
    const hasGit = existsSync(join(dir, ".git"));
    const hasPkg = existsSync(join(dir, "package.json"));
    const hasClaude = existsSync(join(dir, "CLAUDE.md"));

    if (!hasGit && !hasPkg && !hasClaude) continue;

    // Check for nested project in one level (e.g. "Productivity Tool/dashboard")
    let effectiveDir = dir;
    if (!hasGit && existsSync(join(dir, ".git"))) {
      effectiveDir = dir;
    }

    const lastCommit = getLastCommit(effectiveDir);
    const lastCommitMsg = lastCommit ? getLastCommitMessage(effectiveDir) : null;
    const phase = detectPhase(entry.name, effectiveDir);

    let description = null;
    const readmePath = join(dir, "README.md");
    if (existsSync(readmePath)) {
      const lines = readFileSync(readmePath, "utf-8").split("\n");
      const descLine = lines.find(
        (l) => l.trim() && !l.startsWith("#") && !l.startsWith("!") && l.length > 20,
      );
      if (descLine) description = descLine.trim().slice(0, 120);
    }

    projects.push({
      name: entry.name,
      path: resolve(dir).replace(/\\/g, "/"),
      phase,
      lastCommit,
      lastCommitMsg,
      hasGit,
      hasPkg,
      hasClaude,
      description,
    });
  }

  // Sort: active first, then by last commit desc
  projects.sort((a, b) => {
    const phaseOrder = { Building: 0, Review: 1, Backlog: 2, Done: 3 };
    const pa = phaseOrder[a.phase] ?? 4;
    const pb = phaseOrder[b.phase] ?? 4;
    if (pa !== pb) return pa - pb;
    if (a.lastCommit && b.lastCommit) {
      return new Date(b.lastCommit).getTime() - new Date(a.lastCommit).getTime();
    }
    return 0;
  });

  return projects;
}

const projects = scanDocuments();

writeFileSync(OUTPUT_FILE, JSON.stringify({ updatedAt: new Date().toISOString(), projects }, null, 2));

console.log(`Discovered ${projects.length} projects → ${OUTPUT_FILE}`);
projects.forEach((p) => console.log(`  [${p.phase}] ${p.name}  (git:${p.hasGit})`));
