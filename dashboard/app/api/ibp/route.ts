// @no-tdd — process-spawn plumbing; integration-tested via Command Center end-to-end.
import { NextRequest, NextResponse } from "next/server";
import { readFileSync, readdirSync } from "fs";
import { join, basename } from "path";
import { execSync } from "child_process";

export const dynamic = "force-dynamic";

const COORDINATOR_DIR = join(
  process.cwd(),
  "..",
  "workspace",
  "coordinator",
);

const SCRIPTS_DIR = join(process.cwd(), "..", "scripts");

function removeUtf8Bom(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

function getIbpFiles(): { date: string; path: string }[] {
  try {
    const files = readdirSync(COORDINATOR_DIR);
    return files
      .filter((f) => /^ibp-\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .map((f) => ({
        date: basename(f, ".md").replace("ibp-", ""),
        path: join(COORDINATOR_DIR, f),
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const requestedDate = new URL(req.url).searchParams.get("date");
  const ibpFiles = getIbpFiles();

  if (ibpFiles.length === 0) {
    return NextResponse.json({
      lastGenerated: null,
      availableDates: [],
      report: null,
    });
  }

  const target = requestedDate
    ? ibpFiles.find((f) => f.date === requestedDate)
    : ibpFiles[0];

  if (!target) {
    return NextResponse.json(
      { error: `No IBP found for date: ${requestedDate}` },
      { status: 404 },
    );
  }

  try {
    const rawMarkdown = removeUtf8Bom(
      readFileSync(target.path, "utf-8"),
    );

    return NextResponse.json({
      lastGenerated: ibpFiles[0].date,
      availableDates: ibpFiles.map((f) => f.date),
      report: {
        date: target.date,
        rawMarkdown,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to read IBP file" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const scriptPath = join(SCRIPTS_DIR, "generate-ibp.mjs");
  const body = await req.json().catch(() => ({}));
  const requestedDate = typeof body.date === "string" && body.date ? body.date : null;
  const targetDate = requestedDate ?? new Date().toISOString().slice(0, 10);
  const skipAi = body.skipAi === true;
  const gather = body.gather === true;

  // Strip ANTHROPIC_API_KEY from the spawn env so the CLI uses OAuth (mirroring
  // generate-ibp.mjs). Without this, Command Center hits the same depleted-API-key
  // issue the audit caught.
  const cleanEnv = { ...process.env };
  delete cleanEnv.ANTHROPIC_API_KEY;
  delete cleanEnv.ANTHROPIC_AUTH_TOKEN;

  try {
    const stdout = execSync(
      `node "${scriptPath}" --date=${targetDate}${skipAi ? " --skip-ai" : ""}${gather ? " --gather" : ""}`,
      {
        timeout: 240_000,
        encoding: "utf8",
        cwd: join(process.cwd(), ".."),
        env: cleanEnv,
      },
    );

    const ibpFiles = getIbpFiles();
    return NextResponse.json({
      success: true,
      stdout: stdout?.slice(0, 800),
      lastGenerated: ibpFiles[0]?.date ?? null,
      availableDates: ibpFiles.map((f) => f.date),
      generatedDate: targetDate,
      claudeUsed: !skipAi,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const stderr = (err as { stderr?: string }).stderr ?? "";
    const status = (err as { status?: number }).status;
    return NextResponse.json(
      {
        success: false,
        error: message.slice(0, 800),
        stderr: stderr.slice(0, 800),
        exitStatus: status ?? null,
        // Surface validation-failures path so Command Center can link to it.
        validationFailuresPath:
          stderr.match(/See (\S+-validation-failures\.json)/)?.[1] ?? null,
      },
      { status: 500 },
    );
  }
}


