import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { execSync, spawnSync } from "child_process";

export const dynamic = "force-dynamic";

const DASHBOARD_FILE = join(process.cwd(), "..", "workspace", "coordinator", "dashboard-data.json");
const GRAPH_TOKEN_FILE = join(process.cwd(), "..", "workspace", "coordinator", "graph-token.json");
const OUTLOOK_BOOK_SCRIPT = join(process.cwd(), "..", "scripts", "outlook-book-focus-blocks.ps1");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readData(): any {
  let raw = readFileSync(DASHBOARD_FILE, "utf-8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  return JSON.parse(raw);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function writeData(data: any): void {
  writeFileSync(DASHBOARD_FILE, JSON.stringify(data, null, 2), "utf-8");
}

// GET — return current day plan
export async function GET() {
  try {
    const data = readData();
    return NextResponse.json({ dayPlan: data.dayPlan ?? null });
  } catch {
    return NextResponse.json({ error: "Failed to read day plan" }, { status: 500 });
  }
}

// POST — trigger generation
export async function POST() {
  try {
    const scriptPath = join(process.cwd(), "..", "scripts", "generate-day-plan.mjs");
    execSync(`node "${scriptPath}"`, {
      timeout: 60_000,
      env: { ...process.env },
    });
    const data = readData();
    return NextResponse.json({ dayPlan: data.dayPlan ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Generation failed: ${message}` }, { status: 500 });
  }
}

interface AcceptBody {
  bookCalendar?: boolean;
}

interface FocusBlockInput {
  type?: string;
  time: string;
  duration: number;
  task?: string;
  label?: string;
  rationale?: string;
  booked?: boolean;
}

interface OutlookBookingResult {
  bookedTimes: string[];
  count: number;
  errors: string[];
}

function tryBookFocusBlocksOutlook(focusBlocks: FocusBlockInput[]): OutlookBookingResult {
  if (!focusBlocks.length) {
    return { bookedTimes: [], count: 0, errors: [] };
  }

  const payload = JSON.stringify(focusBlocks);
  const encodedPayload = Buffer.from(payload, "utf8").toString("base64");
  const bookingRun = spawnSync(
    "powershell",
    [
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      OUTLOOK_BOOK_SCRIPT,
      "-BlocksBase64",
      encodedPayload,
    ],
    { encoding: "utf8" },
  );

  if (bookingRun.status !== 0) {
    const message = (bookingRun.stderr ?? bookingRun.stdout ?? "").trim();
    return { bookedTimes: [], count: 0, errors: [message || "Outlook booking failed"] };
  }

  const output = (bookingRun.stdout ?? "").trim();
  if (!output) {
    return { bookedTimes: [], count: 0, errors: ["Outlook booking returned no output"] };
  }

  try {
    const parsed = JSON.parse(output) as OutlookBookingResult;
    return {
      bookedTimes: parsed.bookedTimes ?? [],
      count: parsed.count ?? 0,
      errors: parsed.errors ?? [],
    };
  } catch {
    return { bookedTimes: [], count: 0, errors: ["Could not parse Outlook booking output"] };
  }
}

function buildPlannedSessions(blocks: FocusBlockInput[]) {
  const today = new Date().toISOString().split("T")[0];

  return blocks
    .filter((block) => block.booked)
    .map((block, index) => {
      const [hour, minute] = (block.time as string).split(":").map(Number);
      const startDt = new Date(`${today}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`);
      const endDt = new Date(startDt.getTime() + (block.duration as number) * 60_000);
      const label = block.task ?? block.label ?? "Focus block";
      const jiraMatch = label.match(/[A-Z]+-\d+/);

      return {
        id: `planned-${today}-${String(index + 1).padStart(2, "0")}-${block.time}`,
        label,
        jiraKey: jiraMatch ? jiraMatch[0] : undefined,
        startedAt: startDt.toISOString(),
        endedAt: endDt.toISOString(),
        durationMinutes: block.duration,
        notes: block.rationale ?? "Planned focus block from AI Day Plan",
        planned: true,
        source: "day-plan",
      };
    });
}

// PUT — accept plan; optionally book Outlook focus blocks via Graph API
export async function PUT(req: NextRequest) {
  try {
    const body: AcceptBody = await req.json().catch(() => ({}));
    const data = readData();

    if (!data.dayPlan) {
      return NextResponse.json({ error: "No day plan to accept" }, { status: 400 });
    }

    data.dayPlan.accepted = true;

    let bookedCount = 0;
    let graphError: string | null = null;
    let outlookError: string | null = null;

    if (body.bookCalendar !== false) {
      try {
        const tokenRaw = readFileSync(GRAPH_TOKEN_FILE, "utf-8");
        const tokenData = JSON.parse(tokenRaw);
        const accessToken: string = tokenData.access_token ?? tokenData.accessToken;

        const focusBlocks = data.dayPlan.blocks.filter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (b: any) => b.type === "focus" && !b.booked,
        );

        for (const block of focusBlocks) {
          try {
            const today = new Date().toISOString().split("T")[0];
            const [hour, minute] = (block.time as string).split(":").map(Number);
            const startDt = new Date(`${today}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`);
            const endDt = new Date(startDt.getTime() + (block.duration as number) * 60_000);

            const eventBody = {
              subject: `[FOCUS] ${block.task ?? block.label ?? "Focus block"}`,
              body: { contentType: "Text", content: block.rationale ?? "" },
              start: { dateTime: startDt.toISOString(), timeZone: "Europe/London" },
              end: { dateTime: endDt.toISOString(), timeZone: "Europe/London" },
              showAs: "busy",
            };

            const resp = await fetch("https://graph.microsoft.com/v1.0/me/events", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(eventBody),
            });

            if (resp.ok) {
              block.booked = true;
              bookedCount += 1;
            } else {
              graphError = `Graph API ${resp.status}: ${await resp.text()}`;
              break;
            }
          } catch {
            graphError = "Failed to create calendar event";
            break;
          }
        }
      } catch {
        graphError = "Graph token unavailable — plan accepted but calendar not booked";
      }

      const remainingFocusBlocks = data.dayPlan.blocks.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (b: any) => b.type === "focus" && !b.booked,
      );

      if (remainingFocusBlocks.length > 0) {
        const outlookResult = tryBookFocusBlocksOutlook(remainingFocusBlocks);
        if (outlookResult.errors.length > 0) {
          outlookError = outlookResult.errors[0];
        }

        if (outlookResult.bookedTimes.length > 0) {
          data.dayPlan.blocks.forEach((block: FocusBlockInput) => {
            if (
              block.type === "focus" &&
              !block.booked &&
              outlookResult.bookedTimes.includes(block.time)
            ) {
              block.booked = true;
            }
          });
          bookedCount += outlookResult.count;
        }
      }
    }

    const bookedFocusBlocks = data.dayPlan.blocks.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (b: any) => b.type === "focus" && b.booked,
    );

    const plannedSessions = buildPlannedSessions(bookedFocusBlocks);
    data.timeTracker = {
      ...data.timeTracker,
      plannedSessions,
      plannedTodayMinutes: plannedSessions.reduce(
        (sum: number, session: { durationMinutes?: number }) => sum + (session.durationMinutes ?? 0),
        0,
      ),
    };

    writeData(data);

    const bookingError = outlookError ?? graphError;

    return NextResponse.json({
      dayPlan: data.dayPlan,
      bookedCount,
      graphError: bookingError,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

