import { NextRequest, NextResponse } from "next/server";
import { execSync, spawnSync } from "child_process";
import { dirname, join } from "path";
import { existsSync } from "fs";

export const dynamic = "force-dynamic";

const SCRIPTS_DIR = join(process.cwd(), "..", "scripts");
const UKCAUD_SCRIPTS_DIR = join(
  process.cwd(),
  "..",
  "..",
  "CW UKCAUD Project Tracker",
  "scripts",
);

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
  }
> = {
  "generate-day-plan": {
    description: "Generate AI day plan from all data sources",
    type: "node",
    script: join(SCRIPTS_DIR, "generate-day-plan.mjs"),
    timeout: 90_000,
  },
  "refresh-news": {
    description: "Run AI Breaking News tool to gather fresh stories",
    type: "node",
    script: join(SCRIPTS_DIR, "extract-news-results.mjs"),
    timeout: 120_000,
  },
  "system-health": {
    description: "Collect system health data (scheduled tasks, PM2, Claude speed)",
    type: "powershell",
    script: join(SCRIPTS_DIR, "system-health-collect.ps1"),
    timeout: 60_000,
  },
  "morning-orchestrator": {
    description: "Run full morning orchestrator (git sync, health, overnight, news)",
    type: "powershell",
    script: join(SCRIPTS_DIR, "run-morning-orchestrator.ps1"),
    timeout: 300_000,
  },
  "refresh-ceremonies": {
    description: "Regenerate ceremony data from Jira sprints",
    type: "node",
    script: join(UKCAUD_SCRIPTS_DIR, "generate-ceremony-data.mjs"),
    timeout: 120_000,
  },
  "generate-ibp": {
    description: "Generate daily Integrated Business Progress report",
    type: "node",
    script: join(SCRIPTS_DIR, "generate-ibp.mjs"),
    timeout: 120_000,
  },
  "refresh-calendar": {
    description: "Fetch calendar events from Outlook",
    type: "powershell",
    script: join(SCRIPTS_DIR, "outlook-calendar-fetch.ps1"),
    timeout: 60_000,
  },
  "refresh-email": {
    description: "Fetch flagged emails from Outlook",
    type: "powershell",
    script: join(SCRIPTS_DIR, "outlook-mail-fetch.ps1"),
    timeout: 60_000,
  },
  "refresh-notifications": {
    description: "Fetch Jira comment notifications and Microsoft app comments",
    type: "node",
    script: join(SCRIPTS_DIR, "fetch-notifications.mjs"),
    timeout: 90_000,
  },
  "doc-health-update": {
    description: "Prompt Claude to update stale documentation",
    type: "node",
    script: join(SCRIPTS_DIR, "update-stale-docs.mjs"),
    timeout: 180_000,
  },
  "overnight-analysis": {
    description: "Run overnight project analysis (AI suggestions)",
    type: "node",
    script: join(SCRIPTS_DIR, "overnight-analysis.mjs"),
    timeout: 300_000,
  },
  "sync-projects": {
    description: "Discover and sync project registry from git repos",
    type: "node",
    script: join(SCRIPTS_DIR, "sync-projects.mjs"),
    timeout: 60_000,
  },
  "jira-status": {
    description: "Check and sync Jira automation rule status",
    type: "node",
    script: join(SCRIPTS_DIR, "check-jira-automation-status.mjs"),
    timeout: 60_000,
  },
  "activity-merge": {
    description: "Merge activity logs from all sources",
    type: "node",
    script: join(SCRIPTS_DIR, "merge-activity-log.mjs"),
    timeout: 60_000,
  },
  "refresh-teams": {
    description: "Fetch unread Teams messages via Microsoft Graph API",
    type: "node",
    script: join(SCRIPTS_DIR, "graph-teams-fetch.mjs"),
    timeout: 60_000,
  },
  "ingest-pa-exports": {
    description: "Ingest Power Automate OneDrive exports (Teams messages + document signals) into dashboard-data.json",
    type: "node",
    script: join(SCRIPTS_DIR, "ingest-pa-exports.mjs"),
    timeout: 60_000,
  },
  "check-automation-status": {
    description: "Check Jira automation rules deployment status",
    type: "node",
    script: join(SCRIPTS_DIR, "check-jira-automation-status.mjs"),
    timeout: 60_000,
  },
};

// Safe environment allowlist for child processes
const ENV_ALLOWLIST = [
  "PATH",
  "HOME",
  "USERPROFILE",
  "TEMP",
  "TMP",
  "APPDATA",
  "LOCALAPPDATA",
  "SystemRoot",
  "NODE_PATH",
  "NODE_ENV",
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
  "JIRA_EMAIL",
  "JIRA_API_TOKEN",
  "ATLASSIAN_API_TOKEN",
];

function safeEnv(): NodeJS.ProcessEnv {
  const env: Record<string, string> = {};
  for (const key of ENV_ALLOWLIST) {
    if (process.env[key]) {
      env[key] = process.env[key]!;
    }
  }
  return env as NodeJS.ProcessEnv;
}

// GET — list available commands
export async function GET() {
  const commands = Object.entries(COMMAND_REGISTRY).map(([id, cmd]) => ({
    id,
    description: cmd.description,
    available: existsSync(cmd.script),
  }));
  return NextResponse.json({ commands });
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

  if (!existsSync(config.script)) {
    return NextResponse.json(
      { error: `Script not found: ${config.script}`, command: commandId },
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
