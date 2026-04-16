import { NextRequest, NextResponse } from "next/server";
import { join } from "path";
import { spawn } from "child_process";

export const dynamic = "force-dynamic";

const PROJECT_ROOT = join(/* turbopackIgnore: true */ process.cwd(), "..");
function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const date = typeof body.date === "string" && body.date ? body.date : todayIsoDate();
    const demo = Boolean(body.demo);

    const escapedRoot = PROJECT_ROOT.replaceAll('"', '""');
    const command = [
      `cd /d "${escapedRoot}"`,
      `node ".\\scripts\\playwright-ibp-submit.mjs" "--date=${date}"${demo ? " --demo" : ""}`,
    ].join(" && ");

    const child = spawn("cmd.exe", ["/d", "/s", "/c", command], {
      cwd: PROJECT_ROOT,
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });

    child.unref();

    return NextResponse.json({
      success: true,
      started: true,
      date,
      demo,
      pid: child.pid,
      message:
        "PowerApps fill job started. The form is auto-filled only; submit remains manual in browser.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
