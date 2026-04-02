import { NextRequest } from "next/server";
import fs from "fs";
import { DATA_FILE } from "../../../lib/dashboardData";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (data: string) => {
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      // Send initial ping
      sendEvent(JSON.stringify({ type: "connected" }));

      // Watch the data file for changes
      let watcher: fs.FSWatcher | null = null;

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
      const keepAlive = setInterval(() => {
        sendEvent(JSON.stringify({ type: "ping" }));
      }, 30000);

      return () => {
        clearInterval(keepAlive);
        watcher?.close();
      };
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
