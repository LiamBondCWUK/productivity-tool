import { NextRequest } from "next/server";
import fs from "fs";
import { DATA_FILE } from "../../../lib/dashboardData";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  const encoder = new TextEncoder();
  let keepAlive: ReturnType<typeof setInterval> | undefined;
  let watcher: fs.FSWatcher | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (data: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          // Controller already closed — ignore
        }
      };

      // Send initial ping
      sendEvent(JSON.stringify({ type: "connected" }));

      // Watch the data file for changes
      try {
        watcher = fs.watch(DATA_FILE, () => {
          sendEvent(
            JSON.stringify({
              type: "update",
              timestamp: new Date().toISOString(),
            }),
          );
        });
      } catch {
        // Data file may not exist yet — no watcher needed
      }

      // Keep-alive every 30s
      keepAlive = setInterval(() => {
        sendEvent(JSON.stringify({ type: "ping" }));
      }, 30000);
    },
    cancel() {
      // Called when the browser disconnects — clean up to stop writes to closed controller
      clearInterval(keepAlive);
      watcher?.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
