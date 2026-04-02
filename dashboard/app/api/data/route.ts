import { NextResponse } from "next/server";
import { readDashboardData } from "../../../lib/dashboardData";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = readDashboardData();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to read dashboard data" },
      { status: 500 },
    );
  }
}
