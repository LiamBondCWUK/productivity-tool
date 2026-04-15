import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

const PENDING_FILE = join(
  process.cwd(),
  "..",
  "workspace",
  "coordinator",
  "pending-kanban-cards.json",
);
const ARCHIVED_FILE = join(
  process.cwd(),
  "..",
  "workspace",
  "coordinator",
  "archived-cards.json",
);
const APPROVED_FOR_IMPL_FILE = join(
  process.cwd(),
  "..",
  "workspace",
  "coordinator",
  "approved-cards-for-implementation.json",
);

interface PendingCard {
  title: string;
  body: string;
  priority: "urgent" | "high" | "medium" | "low";
  type: string;
  labels: string[];
  project: string;
}

interface PendingCardsFile {
  generatedAt: string | null;
  totalCards: number;
  cards: PendingCard[];
  lastReviewedAt?: string;
}

interface ArchivedEntry {
  originalCard: PendingCard;
  deniedAt: string;
  reason: string;
}

interface ArchivedCardsFile {
  items: ArchivedEntry[];
}

interface DeniedItem {
  index: number;
  reason?: string;
}

interface ActionBody {
  action: "implement";
  approvedIndices: number[];
  deniedItems: DeniedItem[];
}

function readJson<T>(filePath: string, defaultValue: T): T {
  if (!existsSync(filePath)) return defaultValue;
  let raw = readFileSync(filePath, "utf-8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  return JSON.parse(raw) as T;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ActionBody;
    const { action, approvedIndices = [], deniedItems = [] } = body;

    if (action !== "implement") {
      return NextResponse.json(
        { error: `Unknown action: ${action}` },
        { status: 400 },
      );
    }

    const pending = readJson<PendingCardsFile>(PENDING_FILE, {
      generatedAt: null,
      totalCards: 0,
      cards: [],
    });
    const archived = readJson<ArchivedCardsFile>(ARCHIVED_FILE, { items: [] });
    const now = new Date().toISOString();

    // Archive denied cards
    for (const { index, reason = "" } of deniedItems) {
      const card = pending.cards[index];
      if (card) {
        archived.items.push({ originalCard: card, deniedAt: now, reason });
      }
    }

    // Collect approved cards for implementation
    const approvedCards = approvedIndices
      .map((i) => pending.cards[i])
      .filter(Boolean);

    // Write approved cards to file for Claude Code
    if (approvedCards.length > 0) {
      writeFileSync(
        APPROVED_FOR_IMPL_FILE,
        JSON.stringify(
          {
            generatedAt: now,
            totalCards: approvedCards.length,
            cards: approvedCards,
            summary: `${approvedCards.length} card${approvedCards.length !== 1 ? "s" : ""} approved for implementation on ${new Date(now).toLocaleString("en-GB")}`,
          },
          null,
          2,
        ),
        "utf-8",
      );
    }

    const implemented = approvedCards.length;

    // Remove implemented + denied cards from the pending file
    const indicesToRemove = new Set([
      ...approvedIndices,
      ...deniedItems.map((d) => d.index),
    ]);
    const remainingCards = pending.cards.filter(
      (_, i) => !indicesToRemove.has(i),
    );

    writeFileSync(
      PENDING_FILE,
      JSON.stringify(
        {
          ...pending,
          totalCards: remainingCards.length,
          cards: remainingCards,
          lastReviewedAt: now,
        },
        null,
        2,
      ),
      "utf-8",
    );

    writeFileSync(
      ARCHIVED_FILE,
      JSON.stringify(archived, null, 2),
      "utf-8",
    );

    return NextResponse.json({
      implemented,
      denied: deniedItems.length,
      approvedCardsFile: APPROVED_FOR_IMPL_FILE,
      remainingCards: remainingCards.length,
      nextStep: "Approved cards saved. Open Claude Code to implement improvements.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Action failed: ${message}` },
      { status: 500 },
    );
  }
}
