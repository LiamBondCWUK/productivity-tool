import { NextRequest, NextResponse } from "next/server";
import { readDashboardData, writeDashboardData } from "../../../lib/dashboardData";
import type { NoteEntry } from "../../../types/dashboard";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const title = String(body.title ?? "").trim();
  const content = String(body.content ?? "").trim();

  if (!title || !content) {
    return NextResponse.json({ error: "Title and content are required" }, { status: 400 });
  }

  const data = readDashboardData();
  const now = new Date().toISOString();
  const note: NoteEntry = {
    id: `note-${Date.now()}`,
    title,
    content,
    createdAt: now,
    updatedAt: now,
  };

  if (!data.notes) {
    data.notes = { items: [], lastUpdated: null };
  }

  data.notes.items.unshift(note);
  data.notes.lastUpdated = now;
  writeDashboardData(data);

  return NextResponse.json(note);
}
