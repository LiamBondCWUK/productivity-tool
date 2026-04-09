/**
 * create-kanban-issue.mjs
 *
 * Programmatic vibe-kanban issue creation.
 * Reads workspace/config/vibe-kanban.json for API base URL, project ID, and status ID.
 *
 * Usage (CLI):
 *   node scripts/create-kanban-issue.mjs --title "feat: add X" --body "..." --priority medium
 *   node scripts/create-kanban-issue.mjs --title "bug: ..." --labels "feedback,tool-name,bug"
 *
 * Usage (module):
 *   import { createKanbanIssue } from './scripts/create-kanban-issue.mjs'
 *   await createKanbanIssue({ title, body, priority, labels })
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const projectRoot = join(dirname(__filename), "..");
const CONFIG_PATH = join(projectRoot, "workspace/config/vibe-kanban.json");

// ── Port Discovery ────────────────────────────────────────────────────────────

function resolveBaseUrl(config) {
  // Try reading the port file written by vibe-kanban at startup
  const portFiles = [config.portFile, ...(config.portFileFallbacks || [])].filter(Boolean);
  for (const portFile of portFiles) {
    if (existsSync(portFile)) {
      try {
        const port = readFileSync(portFile, "utf8").trim();
        if (/^\d+$/.test(port)) {
          return `http://localhost:${port}`;
        }
      } catch {
        // continue to next fallback
      }
    }
  }
  // Fall back to configured baseUrl
  return config.baseUrl || `http://localhost:${config.defaultPort || 3001}`;
}

// ── Config Loader ─────────────────────────────────────────────────────────────

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(
      `vibe-kanban config not found at ${CONFIG_PATH}.\n` +
      "Run `npx vibe-kanban` once, create a project in the UI, then update the config."
    );
  }
  const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  const baseUrl = resolveBaseUrl(config);
  return { ...config, baseUrl };
}

// ── Issue Creation ────────────────────────────────────────────────────────────

/**
 * @param {object} options
 * @param {string} options.title       — Issue title (required)
 * @param {string} [options.body]      — Issue body / description (markdown)
 * @param {'urgent'|'high'|'medium'|'low'} [options.priority]
 * @param {string[]} [options.labels]  — Label strings (stored in extension_metadata)
 * @returns {Promise<object>}          — Created issue from vibe-kanban API
 */
export async function createKanbanIssue({ title, body = "", priority = "medium", labels = [] }) {
  const config = loadConfig();

  if (!config.projectId) {
    throw new Error(
      "vibe-kanban projectId is not set in workspace/config/vibe-kanban.json.\n" +
      "Create a project in the vibe-kanban UI, then run `npm run vibe-kanban:discover` to populate it."
    );
  }

  if (!config.defaultStatusId) {
    throw new Error(
      "vibe-kanban defaultStatusId is not set in workspace/config/vibe-kanban.json.\n" +
      "Run `npm run vibe-kanban:discover` to populate it."
    );
  }

  const payload = {
    project_id: config.projectId,
    status_id: config.defaultStatusId,
    title,
    description: body,
    priority,
    sort_order: Date.now(),
    extension_metadata: {
      labels,
      source: "claude-code",
      created_at: new Date().toISOString(),
    },
  };

  const endpoint = `${config.baseUrl}${config.issuesEndpoint}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`vibe-kanban API error ${response.status}: ${text}`);
  }

  return response.json();
}

// ── Discover helper — reads projects + statuses from vibe-kanban and updates config ──

export async function discoverVibeKanban() {
  const config = loadConfig();
  const baseUrl = config.baseUrl;

  console.log(`Connecting to vibe-kanban at ${baseUrl}...`);

  const projectsResponse = await fetch(`${baseUrl}/api/projects`);
  if (!projectsResponse.ok) {
    throw new Error(`Failed to fetch projects: ${projectsResponse.status}`);
  }
  const projects = await projectsResponse.json();
  console.log("Projects found:", projects.map((p) => `${p.name} (${p.id})`).join(", "));

  if (projects.length === 0) {
    console.log("No projects found — create one in the vibe-kanban UI first.");
    return;
  }

  const project = projects[0];
  const statusesResponse = await fetch(`${baseUrl}/api/projects/${project.id}/statuses`);
  const statuses = statusesResponse.ok ? await statusesResponse.json() : [];
  const todoStatus = statuses.find((s) => /todo|backlog|open/i.test(s.name)) || statuses[0];

  console.log(`Using project: ${project.name} (${project.id})`);
  console.log(`Using status: ${todoStatus?.name || "unknown"} (${todoStatus?.id})`);

  // Update config file with discovered values
  const { readFileSync: rf, writeFileSync: wf } = await import("fs");
  const currentConfig = JSON.parse(rf(CONFIG_PATH, "utf8"));
  currentConfig.projectId = project.id;
  currentConfig.defaultStatusId = todoStatus?.id || null;
  currentConfig.baseUrl = baseUrl;
  delete currentConfig._comment;
  wf(CONFIG_PATH, JSON.stringify({ ...currentConfig }, null, 2), "utf8");
  console.log("Config updated:", CONFIG_PATH);
}

// ── CLI entry point ───────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);

  if (args.includes("--discover")) {
    discoverVibeKanban()
      .then(() => console.log("Discovery complete."))
      .catch((error) => { console.error(error.message); process.exit(1); });
  } else {
    const getArg = (flag) => {
      const index = args.indexOf(flag);
      return index >= 0 ? args[index + 1] : null;
    };

    const title = getArg("--title");
    const body = getArg("--body") || "";
    const priority = getArg("--priority") || "medium";
    const labelsRaw = getArg("--labels") || "";
    const labels = labelsRaw ? labelsRaw.split(",").map((l) => l.trim()) : [];

    if (!title) {
      console.error("Usage: node scripts/create-kanban-issue.mjs --title \"...\" [--body \"...\"] [--priority high] [--labels \"feedback,tool\"]");
      process.exit(1);
    }

    createKanbanIssue({ title, body, priority, labels })
      .then((issue) => {
        console.log(`Created issue: ${issue.id || issue.title || title}`);
      })
      .catch((error) => {
        console.error("Error:", error.message);
        process.exit(1);
      });
  }
}
