import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { resolve } from "path";

const ACTIVITY_LOG = resolve(
  process.cwd(),
  "../workspace/coordinator/activity-log.json"
);

interface ActivitySession {
  start: string;
  end: string;
  windowTitle: string;
  inferredTask: string | null;
  durationMin: number;
}

export async function GET() {
  try {
    const raw = readFileSync(ACTIVITY_LOG, "utf8").trim();
    const allSessions: ActivitySession[] = JSON.parse(raw || "[]");

    // Filter to today's sessions only
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todaySessions = allSessions.filter(
      (s) => new Date(s.start) >= todayStart
    );

    // Compute a simple summary
    const totalMin = todaySessions.reduce((sum, s) => sum + s.durationMin, 0);
    const taskBreakdown = todaySessions.reduce<Record<string, number>>(
      (acc, s) => {
        const key = s.inferredTask ?? "unknown";
        acc[key] = (acc[key] ?? 0) + s.durationMin;
        return acc;
      },
      {}
    );

    return NextResponse.json({
      sessions: todaySessions,
      totalMin,
      taskBreakdown,
      lastUpdated: allSessions.length
        ? allSessions[allSessions.length - 1].end
        : null,
    });
  } catch {
    return NextResponse.json(
      { sessions: [], totalMin: 0, taskBreakdown: {}, lastUpdated: null },
      { status: 200 }
    );
  }
}
