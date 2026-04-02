"use client";

import { useEffect, useState } from "react";

interface ActivityData {
  sessions: Array<{
    start: string;
    end: string;
    windowTitle: string;
    inferredTask: string | null;
    durationMin: number;
  }>;
  totalMin: number;
  taskBreakdown: Record<string, number>;
  lastUpdated: string | null;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ActiveWindow() {
  const [data, setData] = useState<ActivityData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchActivity = async () => {
      try {
        const res = await fetch("/api/activity");
        if (!res.ok) throw new Error("failed");
        const json = await res.json();
        setData(json);
        setError(false);
      } catch {
        setError(true);
      }
    };

    fetchActivity();
    const interval = setInterval(fetchActivity, 30_000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const latestSession = data?.sessions.at(-1);

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
        Active Window
      </h3>

      {error && (
        <p className="text-xs text-gray-600">
          Tracker offline — start with{" "}
          <code className="text-gray-500">pm2 start ecosystem.config.js</code>
        </p>
      )}

      {!error && !latestSession && (
        <p className="text-xs text-gray-600">No activity recorded today yet.</p>
      )}

      {latestSession && (
        <div className="bg-gray-800/60 rounded p-2 space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
            <span className="text-xs text-gray-300 truncate">
              {latestSession.inferredTask ?? "Unknown"}
            </span>
            <span className="ml-auto text-xs text-gray-500 shrink-0">
              {formatDuration(latestSession.durationMin)}
            </span>
          </div>
          <p className="text-xs text-gray-600 truncate pl-4">
            {latestSession.windowTitle}
          </p>
        </div>
      )}

      {data && data.totalMin > 0 && (
        <div className="space-y-1 pt-1">
          <p className="text-xs text-gray-500">
            Today:{" "}
            <span className="text-gray-300">
              {formatDuration(data.totalMin)} tracked
            </span>
          </p>
          {Object.entries(data.taskBreakdown)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 4)
            .map(([task, mins]) => (
              <div key={task} className="flex items-center gap-2">
                <span className="text-xs text-gray-600 truncate flex-1">
                  {task}
                </span>
                <span className="text-xs text-gray-500 shrink-0">
                  {formatDuration(mins)}
                </span>
              </div>
            ))}
          {data.lastUpdated && (
            <p className="text-xs text-gray-700 pt-1">
              Last sync: {formatTime(data.lastUpdated)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
