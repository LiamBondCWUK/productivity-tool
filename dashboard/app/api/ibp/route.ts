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

export async function POST() {
  const scriptPath = join(SCRIPTS_DIR, "generate-ibp.mjs");

  try {
    const stdout = execSync(`node "${scriptPath}"`, {
      timeout: 90_000,
      encoding: "utf8",
      cwd: join(process.cwd(), ".."),
    });

    const ibpFiles = getIbpFiles();
    return NextResponse.json({
      success: true,
      stdout: stdout?.slice(0, 500),
      lastGenerated: ibpFiles[0]?.date ?? null,
      availableDates: ibpFiles.map((f) => f.date),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        success: false,
        error: message.slice(0, 500),
      },
      { status: 500 },
    );
  }
}
