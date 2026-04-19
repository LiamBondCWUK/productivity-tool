import { NextResponse } from "next/server";
import fs from "fs";

export const dynamic = "force-dynamic";

const HEALTH_PATH = process.env.SYSTEM_HEALTH_PATH;

export async function GET() {
  if (!HEALTH_PATH) {
    return NextResponse.json(
      { error: "SYSTEM_HEALTH_PATH environment variable not configured" },
      { status: 503 },
    );
  }
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
