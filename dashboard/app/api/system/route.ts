import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const HEALTH_PATH =
  process.env.SYSTEM_HEALTH_PATH ??
  path.join(
    "C:",
    "Users",
    "liam.bond",
    "Documents",
    "Productivity Tool",
    "workspace",
    "coordinator",
    "system-health.json",
  );

export async function GET() {
  try {
    if (!fs.existsSync(HEALTH_PATH)) {
      return NextResponse.json(
        {
          error:
            "system-health.json not found — run scripts/system-health-collect.ps1 first",
        },
        { status: 404 },
      );
    }
    const raw = fs.readFileSync(HEALTH_PATH, "utf-8").replace(/^\uFEFF/, "");
    const data = JSON.parse(raw);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to read system health data" },
      { status: 500 },
    );
  }
}
