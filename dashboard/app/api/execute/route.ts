import { NextRequest, NextResponse } from "next/server";
import { spawnSync } from "child_process";
import { dirname, join } from "path";
import { existsSync } from "fs";
import { platform } from "os";

export const dynamic = "force-dynamic";

const IS_WINDOWS = platform() === "win32";
const IS_REPLIT = Boolean(process.env.REPL_SLUG || process.env.REPL_ID);

const SCRIPTS_DIR = IS_REPLIT
  ? join(process.cwd(), "..", "scripts")
  : join(process.cwd(), "..", "scripts");

const UKCAUD_SCRIPTS_DIR = IS_REPLIT
  ? join(process.cwd(), "..", "..", "CW UKCAUD Project Tracker", "scripts")
  : join(process.cwd(), "..", "..", "CW UKCAUD Project Tracker", "scripts");

type Platform = "cross" | "windows" | "linux";

// Allowlisted commands — each has a key, execution config, and description
const COMMAND_REGISTRY: Record<
  string,
  {
    description: string;
    type: "node" | "powershell";
    script: string;
    dir?: string;
    timeout?: number;
    args?: string[];
    platform: Platform;
  }
> = {
  "generate-day-plan": {
    description: "Generate AI day plan from all data sources",
    type: "node",
    script: join(SCRIPTS_DIR, "generate-day-plan.mjs"),
    timeout: 90_000,
    platform: "cross",
  },
  "refresh-news": {
    description: "Run AI Breaking News tool to gather fresh stories",
    type: "node",
    script: join(SCRIPTS_DIR, "extract-news-results.mjs"),
    timeout: 120_000,
    platform: "cross",
  },
  "system-health": {
    description: "Collect system health data (scheduled tasks, PM2, Claude speed)",
    type: "powershell",
    script: join(SCRIPTS_DIR, "system-health-collect.ps1"),
    timeout: 60_000,
    platform: "windows",
  },
  "morning-orchestrator": {
    description: "Run full morning orchestrator (git sync, health, overnight, news)",
    type: "powershell",
    script: join(SCRIPTS_DIR, "run-morning-orchestrator.ps1"),
    timeout: 300_000,
    platform: "windows",
  },
  "refresh-ceremonies": {
    description: "Regenerate ceremony data from Jira sprints",
    type: "node",
    script: join(UKCAUD_SCRIPTS_DIR, "generate-ceremony-data.mjs"),
    timeout: 120_000,
    platform: "cross",
  },
  "generate-ibp": {
    description: "Generate daily Integrated Business Progress report",
    type: "node",
    script: join(SCRIPTS_DIR, "generate-ibp.mjs"),
    timeout: 120_000,
    platform: "cross",
  },
  "refresh-calendar": {
    description: IS_REPLIT
      ? "Fetch calendar events from ICS feed"
      : "Fetch calendar events from Outlook",
    type: IS_REPLIT ? "node" : "powershell",
    script: IS_REPLIT
      ? join(SCRIPTS_DIR, "ics-calendar-fetch.mjs")
      : join(SCRIPTS_DIR, "outlook-calendar-fetch.ps1"),
    timeout: 60_000,
    platform: "cross",
  },
  "refresh-email": {
    description: "Fetch flagged emails from Outlook",
    type: "powershell",
    script: join(SCRIPTS_DIR, "outlook-mail-fetch.ps1"),
    timeout: 60_000,
    platform: "windows",
  },
  "refresh-notifications": {
    description: "Fetch Jira comment notifications and Microsoft app comments",
    type: "node",
    script: join(SCRIPTS_DIR, "fetch-notifications.mjs"),
    timeout: 90_000,
    platform: "cross",
  },
  "doc-health-update": {
    description: "Prompt Claude to update stale documentation",
    type: "node",
    script: join(SCRIPTS_DIR, "update-stale-docs.mjs"),
    timeout: 180_000,
    platform: "cross",
  },
  "overnight-analysis": {
    description: "Run overnight project analysis (AI suggestions)",
    type: "node",
    script: join(SCRIPTS_DIR, "overnight-analysis.mjs"),
    timeout: 300_000,
    platform: "cross",
  },
  "sync-projects": {
    description: "Discover and sync project registry from git repos",
    type: "node",
    script: join(SCRIPTS_DIR, "sync-projects.mjs"),
    timeout: 60_000,
    platform: "cross",
  },
  "jira-status": {
    description: "Check and sync Jira automation rule status",
    type: "node",
    script: join(SCRIPTS_DIR, "check-jira-automation-status.mjs"),
    timeout: 60_000,
    platform: "cross",
  },
  "activity-merge": {
    description: "Merge activity logs from all sources",
    type: "node",
    script: join(SCRIPTS_DIR, "merge-activity-log.mjs"),
    timeout: 60_000,
    platform: "cross",
  },
  "refresh-teams": {
    description: "Fetch unread Teams messages via Microsoft Graph API",
    type: "node",
    script: join(SCRIPTS_DIR, "graph-teams-fetch.mjs"),
    timeout: 60_000,
    platform: "windows",
  },
  "ingest-pa-exports": {
    description: "Ingest Power Automate OneDrive exports (Teams messages + document signals) into dashboard-data.json",
    type: "node",
    script: join(SCRIPTS_DIR, "ingest-pa-exports.mjs"),
    timeout: 60_000,
    platform: "windows",
  },
  "check-automation-status": {
    description: "Check Jira automation rules deployment status",
    type: "node",
    script: join(SCRIPTS_DIR, "check-jira-automation-status.mjs"),
    timeout: 60_000,
    platform: "cross",
  },
  "ai-morning-scan": {
    description: "Full morning scan: live inventory + HN, GitHub, Reddit, Anthropic, MCP, arXiv, ProductHunt",
    type: "node",
    script: join(SCRIPTS_DIR, "morning-orchestrator.mjs"),
    timeout: 180_000,
    platform: "cross",
  },
};

// Safe environment allowlist for child processes
const ENV_ALLOWLIST_COMMON = [
  "PATH",
  "HOME",
  "NODE_PATH",
  "NODE_ENV",
  "JIRA_EMAIL",
  "JIRA_API_TOKEN",
  "ATLASSIAN_API_TOKEN",
  "ANTHROPIC_API_KEY",
  "ICS_CALENDAR_URL",
  "SYNC_SECRET",
  "CW_CLIENT_ID",
  "CW_CLIENT_SECRET",
  "GITHUB_TOKEN",
];

const ENV_ALLOWLIST_WINDOWS = [
  "USERPROFILE",
  "TEMP",
  "TMP",
  "APPDATA",
  "LOCALAPPDATA",
  "SystemRoot",
  "COMPUTERNAME",
  "USERNAME",
  "HOMEDRIVE",
  "HOMEPATH",
  "OS",
  "PROCESSOR_ARCHITECTURE",
  "ProgramFiles",
  "ProgramFiles(x86)",
  "CommonProgramFiles",
  "windir",
];

const ENV_ALLOWLIST_LINUX = [
  "USER",
  "SHELL",
  "LANG",
  "REPL_SLUG",
  "REPL_ID",
  "REPL_OWNER",
];

function safeEnv(): NodeJS.ProcessEnv {
  const env: Record<string, string> = {};
  const allowlist = [
    ...ENV_ALLOWLIST_COMMON,
    ...(IS_WINDOWS ? ENV_ALLOWLIST_WINDOWS : ENV_ALLOWLIST_LINUX),
  ];
  for (const key of allowlist) {
    if (process.env[key]) {
      env[key] = process.env[key]!;
    }
  }
  return env as NodeJS.ProcessEnv;
}

function isCommandAvailable(config: (typeof COMMAND_REGISTRY)[string]): boolean {
  if (config.platform === "windows" && !IS_WINDOWS) return false;
  if (config.platform === "linux" && IS_WINDOWS) return false;
  return existsSync(config.script);
}

// GET — list available commands
export async function GET() {
  const commands = Object.entries(COMMAND_REGISTRY).map(([id, cmd]) => ({
    id,
    description: cmd.description,
    available: isCommandAvailable(cmd),
    platform: cmd.platform,
  }));
  return NextResponse.json({ commands, platform: IS_WINDOWS ? "windows" : "linux" });
}

// POST — execute a command
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.command !== "string") {
    return NextResponse.json(
      { error: "Missing 'command' field" },
      { status: 400 },
    );
  }

  const commandId = body.command as string;
  const commandArgs = Array.isArray(body.args) ? body.args : [];
  const config = COMMAND_REGISTRY[commandId];

  if (!config) {
    return NextResponse.json(
      { error: `Unknown command: ${commandId}`, available: Object.keys(COMMAND_REGISTRY) },
      { status: 400 },
    );
  }

  if (!isCommandAvailable(config)) {
    const reason =
      config.platform === "windows" && !IS_WINDOWS
        ? "This command requires Windows (not available on Replit)"
        : config.platform === "linux" && IS_WINDOWS
          ? "This command is Linux-only"
          : "Script not found";
    return NextResponse.json(
      { error: reason, command: commandId, platform: config.platform },
      { status: 404 },
    );
  }

  // Validate args — only allow simple alphanumeric/dash/dot arguments
  const safeArgPattern = /^[a-zA-Z0-9_\-./: ]+$/;
  for (const arg of commandArgs) {
    if (typeof arg !== "string" || !safeArgPattern.test(arg)) {
      return NextResponse.json(
        { error: `Invalid argument: ${arg}` },
        { status: 400 },
      );
    }
  }

  const timeout = config.timeout ?? 60_000;
  const startTime = Date.now();

  try {
    let stdout = "";

    if (config.type === "node") {
      const result = spawnSync(
        process.execPath,
        [config.script, ...commandArgs],
        {
          timeout,
          encoding: "utf8",
          env: { ...safeEnv(), NODE_PATH: process.env.NODE_PATH ?? "" },
          cwd: config.dir ?? dirname(config.script),
        },
      );
      if (result.status !== 0) {
        const errMsg = (result.stderr ?? result.stdout ?? "").trim();
        return NextResponse.json(
          {
            error: `Script exited with code ${result.status}`,
            output: errMsg.slice(0, 2000),
            command: commandId,
            durationMs: Date.now() - startTime,
          },
          { status: 500 },
        );
      }
      stdout = result.stdout ?? "";
    } else {
      const result = spawnSync(
        "powershell",
        [
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          config.script,
          ...commandArgs,
        ],
        {
        timeout,
        encoding: "utf8",
          env: safeEnv(),
          cwd: config.dir ?? dirname(config.script),
        },
      );
      if (result.status !== 0) {
        const errMsg = (result.stderr ?? result.stdout ?? "").trim();
        return NextResponse.json(
          {
            error: `Script exited with code ${result.status}`,
            output: errMsg.slice(0, 2000),
            command: commandId,
            durationMs: Date.now() - startTime,
          },
          { status: 500 },
        );
      }
      stdout = result.stdout ?? "";
    }

    return NextResponse.json({
      success: true,
      command: commandId,
      output: stdout.slice(0, 5000),
      durationMs: Date.now() - startTime,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: `Execution failed: ${message.slice(0, 500)}`,
        command: commandId,
        durationMs: Date.now() - startTime,
      },
      { status: 500 },
    );
  }
}
