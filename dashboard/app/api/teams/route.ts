import { NextResponse } from "next/server";
import { readDashboardData } from "../../../lib/dashboardData";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = readDashboardData();
    return NextResponse.json({
      teamMessages: data.teamMessages ?? [],
      fetchedAt: null,
    });
  } catch {
    return NextResponse.json(
      { teamMessages: [], fetchedAt: null },
      { status: 500 },
    );
  }
}
