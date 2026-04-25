import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

const COORDINATOR_DIR = join(
  process.cwd(),
  "..",
  "workspace",
  "coordinator",
);

function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function removeUtf8Bom(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

export async function GET() {
  const week = getISOWeek(new Date());
  const filename = `ibp-context-${week}.json`;
  const filepath = join(COORDINATOR_DIR, filename);

  if (!existsSync(filepath)) {
    return NextResponse.json({
      exists: false,
    });
  }

  try {
    const rawJson = removeUtf8Bom(readFileSync(filepath, "utf-8"));
    const data = JSON.parse(rawJson);

    return NextResponse.json({
      exists: true,
      week,
      lastFetched: data.generatedAt
        ? new Date(data.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
        : null,
      chats: data.teamsChats?.length ?? 0,
      transcripts: data.transcriptHighlights?.length ?? 0,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      exists: false,
      error: message,
    });
  }
}
