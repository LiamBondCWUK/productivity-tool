import { NextResponse } from "next/server";
import { readDashboardData } from "../../../lib/dashboardData";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = readDashboardData();
    return NextResponse.json({
      flaggedEmails: data.flaggedEmails ?? [],
      fetchedAt: null,
    });
  } catch {
    return NextResponse.json(
      { flaggedEmails: [], fetchedAt: null },
      { status: 500 },
    );
  }
}
