import { NextRequest, NextResponse } from "next/server";
import { writeDashboardData } from "../../../../lib/dashboardData";
import type { DashboardData } from "../../../../types/dashboard";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const syncSecret = process.env.SYNC_SECRET;
  if (!syncSecret) {
    return NextResponse.json(
      { error: "Sync not configured" },
      { status: 503 },
    );
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${syncSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as DashboardData;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid payload" },
        { status: 400 },
      );
    }

    writeDashboardData(body);

    return NextResponse.json({
      success: true,
      receivedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    );
  }
}
