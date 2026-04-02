import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

export const dynamic = "force-dynamic";

const DASHBOARD_FILE = join(process.cwd(), "..", "workspace", "coordinator", "dashboard-data.json");
const GRAPH_TOKEN_FILE = join(process.cwd(), "..", "workspace", "coordinator", "graph-token.json");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readData(): any {
  return JSON.parse(readFileSync(DASHBOARD_FILE, "utf-8"));
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

// PUT — accept plan; optionally book Outlook focus blocks via Graph API
export async function PUT(req: NextRequest) {
  try {
    const body: AcceptBody = await req.json().catch(() => ({}));
    const data = readData();

    if (!data.dayPlan) {
      return NextResponse.json({ error: "No day plan to accept" }, { status: 400 });
    }

    data.dayPlan.accepted = true;

    const bookedCount = 0;
    let graphError: string | null = null;

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
    }

    writeData(data);

    return NextResponse.json({
      dayPlan: data.dayPlan,
      bookedCount,
      graphError,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
