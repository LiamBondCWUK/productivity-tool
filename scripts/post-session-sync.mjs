/**
 * post-session-sync.mjs
 *
 * Claude Code Stop hook — fires at the end of every session.
 * Reads the session transcript to find completed TodoWrite tasks, matches them
 * against open vibe-kanban issues by title similarity, and marks matched ones Done.
 *
 * Wired via ~/.claude/settings.json Stop hook.
 * Never blocks Claude from stopping — all errors exit(0).
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const projectRoot = join(dirname(__filename), "..");
const CONFIG_PATH = join(projectRoot, "workspace/config/vibe-kanban.json");

// ── Config ────────────────────────────────────────────────────────────────────

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return null;
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return null;
  }
}

function resolveBaseUrl(config) {
  const portFiles = [config.portFile, ...(config.portFileFallbacks || [])].filter(Boolean);
  for (const portFile of portFiles) {
    if (existsSync(portFile)) {
      try {
        const port = readFileSync(portFile, "utf8").trim();
        if (/^\d+$/.test(port)) return `http://localhost:${port}`;
      } catch { /* continue */ }
    }
  }
  return config.baseUrl || "http://localhost:3001";
}

// ── Extract completed tasks from Claude session transcript ────────────────────

function extractCompletedTasks() {
  const sessionId = process.env.CLAUDE_SESSION_ID;
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (!sessionId || !homeDir) return [];

  const claudeDir = join(homeDir, ".claude", "projects");
  if (!existsSync(claudeDir)) return [];

  const { readdirSync } = await import("fs");
  let sessionFile = null;
  try {
    for (const projectDir of readdirSync(claudeDir)) {
      const candidate = join(claudeDir, projectDir, `${sessionId}.jsonl`);
      if (existsSync(candidate)) { sessionFile = candidate; break; }
    }
  } catch { return []; }

  if (!sessionFile) return [];

  const completed = [];
  try {
    const lines = readFileSync(sessionFile, "utf8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === "tool_use" && entry.name === "TodoWrite") {
          for (const todo of (entry.input?.todos || [])) {
            if (todo.status === "completed" && todo.content) {
              completed.push(todo.content.trim());
            }
          }
        }
      } catch { /* skip */ }
    }
  } catch { return []; }

  return [...new Set(completed)];
}

// ── Title similarity ──────────────────────────────────────────────────────────

function titleMatches(issueTitle, taskTitle) {
  const normalize = (s) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const issue = normalize(issueTitle);
  const task = normalize(taskTitle);
  if (issue.includes(task) || task.includes(issue)) return true;
  const issueWords = new Set(issue.split(" ").filter((w) => w.length > 3));
  const taskWords = task.split(" ").filter((w) => w.length > 3);
  if (taskWords.length === 0) return false;
  const overlap = taskWords.filter((w) => issueWords.has(w)).length;
  return overlap / taskWords.length >= 0.6;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const config = loadConfig();
  if (!config?.projectId) process.exit(0);

  const baseUrl = resolveBaseUrl(config);
  const completedTasks = extractCompletedTasks();
  if (completedTasks.length === 0) process.exit(0);

  console.log(`[post-session-sync] ${completedTasks.length} completed tasks`);

  // Fetch open issues
  let issues = [];
  try {
    const res = await fetch(`${baseUrl}/api/projects/${config.projectId}/issues`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    issues = Array.isArray(data) ? data : (data.issues || []);
  } catch (error) {
    console.error("[post-session-sync] Could not fetch issues:", error.message);
    process.exit(0);
  }

  // Get Done status ID
  let doneStatusId = null;
  try {
    const res = await fetch(`${baseUrl}/api/projects/${config.projectId}/statuses`);
    if (res.ok) {
      const statuses = await res.json();
      doneStatusId = statuses.find((s) => /done|complete|closed/i.test(s.name))?.id || null;
    }
  } catch { /* no status update */ }

  if (!doneStatusId) process.exit(0);

  // Match and mark Done
  let count = 0;
  for (const issue of issues) {
    const isOpen = !/done|complete|closed/i.test(issue.status_name || "");
    if (!isOpen) continue;
    if (!completedTasks.some((task) => titleMatches(issue.title, task))) continue;

    try {
      await fetch(`${baseUrl}/api/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status_id: doneStatusId }),
      });
      count++;
      console.log(`[post-session-sync] ✓ Done: ${issue.title.slice(0, 60)}`);
    } catch { /* skip this issue */ }
  }

  console.log(`[post-session-sync] Marked ${count} issue(s) Done`);
  process.exit(0);
}

main().catch(() => process.exit(0));
