import { NextRequest, NextResponse } from "next/server";
import {
  readDashboardData,
  writeDashboardData,
} from "../../../lib/dashboardData";
import type { ActiveSession, TimeSession } from "../../../types/dashboard";

export const dynamic = "force-dynamic";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function minutesBetween(start: string, end: string): number {
  return Math.round(
    (new Date(end).getTime() - new Date(start).getTime()) / 60000,
  );
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    action: string;
    label?: string;
    jiraKey?: string;
    minutes?: number;
    notes?: string;
  };
  const { action } = body;

  const data = readDashboardData();

  if (action === "start") {
    const activeSession: ActiveSession = {
      id: generateId(),
      label: body.label ?? "Unnamed task",
      jiraKey: body.jiraKey,
      startedAt: new Date().toISOString(),
    };
    const updated = {
      ...data,
      timeTracker: { ...data.timeTracker, activeSession },
    };
    writeDashboardData(updated);
    return NextResponse.json({ ok: true, session: activeSession });
  }

  if (action === "stop" || action === "log-and-next") {
    const { activeSession } = data.timeTracker;
    if (!activeSession) {
      return NextResponse.json({ error: "No active session" }, { status: 400 });
    }
    const endedAt = new Date().toISOString();
    const durationMinutes = minutesBetween(activeSession.startedAt, endedAt);
    const completed: TimeSession = {
      ...activeSession,
      endedAt,
      durationMinutes,
      notes: body.notes,
    };
    const newTodayTotal = data.timeTracker.todayTotalMinutes + durationMinutes;
    const newWeekTotal = data.timeTracker.weekTotalMinutes + durationMinutes;
    const updated = {
      ...data,
      timeTracker: {
        ...data.timeTracker,
        activeSession: null,
        todaySessions: [...data.timeTracker.todaySessions, completed],
        todayTotalMinutes: newTodayTotal,
        weekTotalMinutes: newWeekTotal,
      },
    };
    writeDashboardData(updated);
    return NextResponse.json({ ok: true, session: completed });
  }

  if (action === "add-minutes") {
    const { activeSession } = data.timeTracker;
    if (!activeSession) {
      return NextResponse.json({ error: "No active session" }, { status: 400 });
    }
    const minutesToAdd = body.minutes ?? 15;
    const adjustedStart = new Date(
      new Date(activeSession.startedAt).getTime() - minutesToAdd * 60000,
    ).toISOString();
    const updated = {
      ...data,
      timeTracker: {
        ...data.timeTracker,
        activeSession: { ...activeSession, startedAt: adjustedStart },
      },
    };
    writeDashboardData(updated);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
