import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

const PENDING_FILE = join(
  process.cwd(),
  "..",
  "workspace",
  "coordinator",
  "pending-kanban-cards.json",
);

export async function GET() {
  try {
    if (!existsSync(PENDING_FILE)) {
      return NextResponse.json({ generatedAt: null, totalCards: 0, cards: [] });
    }
    let raw = readFileSync(PENDING_FILE, "utf-8");
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    const data = JSON.parse(raw);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to read pending cards" },
      { status: 500 },
    );
  }
}
