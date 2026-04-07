"use client";

import { useState, useEffect, useCallback } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

interface ScheduledTask {
  name: string;
  state: string;
  lastRun: string | null;
  nextRun: string | null;
  lastResult: number | null;
  status: "ok" | "error" | "overdue" | "unknown";
}

interface PM2Process {
  name: string;
  id: number;
  status: string;
  uptime: number;
  restarts: number;
  memBytes: number;
  cpu: number;
  pid: number;
}

interface ClaudeSpeed {
  latestMs: number | null;
  avg7dMs: number | null;
  trend: "normal" | "slow" | "degraded" | "fast" | "unknown";
  flag: boolean;
}

interface Issue {
  severity: "error" | "warn" | "info";
  category: string;
  message: string;
  resolution: string;
}

interface SystemHealth {
  collectedAt: string;
  scheduledTasks: ScheduledTask[];
  pm2Processes: PM2Process[];
  claudeSpeed: ClaudeSpeed;
  portMismatches: {
    process: string;
    configPort: number;
    actualPort: number;
    message: string;
    resolution: string;
  }[];
  ecosystemConflicts: {
    processName: string;
    message: string;
    resolution: string;
  }[];
  issues: Issue[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  const now = new Date();
  const diffH = (now.getTime() - d.getTime()) / 3_600_000;
  if (diffH < 1) return `${Math.round(diffH * 60)}m ago`;
  if (diffH < 24) return `${Math.round(diffH)}h ago`;
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtUptime(ms: number | null): string {
  if (!ms) return "—";
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

function fmtMem(bytes: number | null): string {
  if (!bytes) return "—";
  return `${Math.round(bytes / 1_048_576)}MB`;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
      {children}
    </h3>
  );
}

function IssuesPanel({ issues }: { issues: Issue[] }) {
  if (issues.length === 0) {
    return (
      <div className="bg-green-900/20 border border-green-700/40 rounded-lg p-3 flex items-center gap-2">
        <span className="text-green-400">✅</span>
        <span className="text-sm text-green-300">All systems OK</span>
      </div>
    );
  }

  const errors = issues.filter((i) => i.severity === "error");
  const warns = issues.filter((i) => i.severity === "warn");

  return (
    <div className="space-y-2">
      {errors.map((issue, idx) => (
        <div
          key={idx}
          className="bg-red-900/20 border border-red-700/40 rounded-lg p-3"
        >
          <div className="flex items-start gap-2">
            <span className="text-red-400 shrink-0">🔴</span>
            <div className="min-w-0">
              <p className="text-sm text-red-200 font-medium leading-snug">
                {issue.message}
              </p>
              <p className="text-xs text-red-400/80 mt-0.5">
                → {issue.resolution}
              </p>
            </div>
          </div>
        </div>
      ))}
      {warns.map((issue, idx) => (
        <div
          key={idx}
          className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg p-3"
        >
          <div className="flex items-start gap-2">
            <span className="text-yellow-400 shrink-0">🟡</span>
            <div className="min-w-0">
              <p className="text-sm text-yellow-200 font-medium leading-snug">
                {issue.message}
              </p>
              <p className="text-xs text-yellow-400/80 mt-0.5">
                → {issue.resolution}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ScheduledTasksPanel({ tasks }: { tasks: ScheduledTask[] }) {
  if (tasks.length === 0) {
    return (
      <p className="text-xs text-gray-600">
        No Claude-related scheduled tasks found.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {tasks.map((task) => {
        const statusIcon = {
          ok: "✅",
          error: "🔴",
          overdue: "🟡",
          unknown: "⚪",
        }[task.status];
        const statusColor = {
          ok: "text-green-400",
          error: "text-red-400",
          overdue: "text-yellow-400",
          unknown: "text-gray-500",
        }[task.status];

        return (
          <div
            key={task.name}
            className="bg-gray-800/40 border border-gray-700/40 rounded-lg px-3 py-2 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span>{statusIcon}</span>
              <span className="text-sm text-gray-200 font-medium truncate">
                {task.name}
              </span>
            </div>
            <div className="flex items-center gap-4 shrink-0 text-xs">
              <span className={statusColor}>{task.status}</span>
              <span className="text-gray-500">
                last {fmtTime(task.lastRun)}
              </span>
              {task.nextRun && (
                <span className="text-gray-600">
                  next{" "}
                  {new Date(task.nextRun).toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PM2Panel({ processes }: { processes: PM2Process[] }) {
  if (processes.length === 0) {
    return (
      <p className="text-xs text-gray-600">
        PM2 not responding or no processes found.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {processes.map((proc) => {
        const online = proc.status === "online";
        return (
          <div
            key={proc.name}
            className="bg-gray-800/40 border border-gray-700/40 rounded-lg px-3 py-2 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className={online ? "text-green-400" : "text-red-400"}>
                ●
              </span>
              <span className="text-sm text-gray-200 font-medium truncate">
                {proc.name}
              </span>
              {!online && (
                <span className="text-xs bg-red-900/40 text-red-300 px-1.5 py-0.5 rounded">
                  {proc.status}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 shrink-0 text-xs text-gray-500">
              <span title="uptime">⏱ {fmtUptime(proc.uptime)}</span>
              <span title="memory">💾 {fmtMem(proc.memBytes)}</span>
              {proc.restarts > 0 && (
                <span
                  className={proc.restarts > 5 ? "text-yellow-400" : ""}
                  title="restarts"
                >
                  ↺ {proc.restarts}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ClaudeSpeedPanel({ speed }: { speed: ClaudeSpeed }) {
  if (!speed.latestMs) {
    return (
      <p className="text-xs text-gray-600">Speed data not available yet.</p>
    );
  }

  const trendColor = {
    normal: "text-green-400",
    fast: "text-blue-400",
    slow: "text-yellow-400",
    degraded: "text-red-400",
    unknown: "text-gray-500",
  }[speed.trend];

  const trendIcon = {
    normal: "✅",
    fast: "🚀",
    slow: "🟡",
    degraded: "⚠️",
    unknown: "⚪",
  }[speed.trend];

  const pctDiff =
    speed.avg7dMs && speed.latestMs
      ? Math.round((speed.latestMs / speed.avg7dMs - 1) * 100)
      : null;

  return (
    <div className="bg-gray-800/40 border border-gray-700/40 rounded-lg p-3">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span>{trendIcon}</span>
          <div>
            <span className="text-sm font-medium text-gray-200">
              {speed.latestMs}ms
            </span>
            {speed.avg7dMs && (
              <span className="text-xs text-gray-500 ml-2">
                7-day avg: {speed.avg7dMs}ms
                {pctDiff !== null && (
                  <span
                    className={
                      pctDiff > 0
                        ? "text-yellow-400 ml-1"
                        : "text-green-400 ml-1"
                    }
                  >
                    ({pctDiff > 0 ? "+" : ""}
                    {pctDiff}%)
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
        <span className={`text-xs font-medium capitalize ${trendColor}`}>
          {speed.trend}
        </span>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function SystemTab() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/system");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? `HTTP ${res.status}`,
        );
      }
      const data: SystemHealth = await res.json();
      setHealth(data);
      setLastFetched(new Date());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  const errorCount =
    health?.issues.filter((i) => i.severity === "error").length ?? 0;
  const warnCount =
    health?.issues.filter((i) => i.severity === "warn").length ?? 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-700/50 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              System Health
            </h2>
            {health && (errorCount > 0 || warnCount > 0) && (
              <div className="flex items-center gap-1.5">
                {errorCount > 0 && (
                  <span className="text-xs bg-red-900/40 text-red-300 px-1.5 py-0.5 rounded">
                    {errorCount} error{errorCount > 1 ? "s" : ""}
                  </span>
                )}
                {warnCount > 0 && (
                  <span className="text-xs bg-yellow-900/40 text-yellow-300 px-1.5 py-0.5 rounded">
                    {warnCount} warning{warnCount > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {lastFetched && (
              <span className="text-xs text-gray-600">
                {lastFetched.toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
            <button
              onClick={fetchHealth}
              disabled={loading}
              className="text-xs px-2 py-1 bg-gray-700/60 hover:bg-gray-600/60 rounded text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-40"
            >
              {loading ? "Loading…" : "↻ Refresh"}
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading && !health && (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-600 text-sm">Loading system health…</p>
          </div>
        )}

        {error && (
          <div className="p-4">
            <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-4">
              <p className="text-sm text-red-300 font-medium">
                Failed to load health data
              </p>
              <p className="text-xs text-red-400/80 mt-1">{error}</p>
              <p className="text-xs text-gray-500 mt-2">
                Run{" "}
                <code className="bg-gray-800 px-1 rounded">
                  scripts\system-health-collect.ps1
                </code>{" "}
                to generate data.
              </p>
            </div>
          </div>
        )}

        {health && (
          <div className="p-4 space-y-5">
            {/* Issues */}
            <section>
              <SectionHeader>Issues & Resolutions</SectionHeader>
              <IssuesPanel issues={health.issues} />
            </section>

            {/* Scheduled Tasks */}
            <section>
              <SectionHeader>Scheduled Tasks</SectionHeader>
              <ScheduledTasksPanel tasks={health.scheduledTasks} />
            </section>

            {/* PM2 */}
            <section>
              <SectionHeader>PM2 Processes</SectionHeader>
              <PM2Panel processes={health.pm2Processes} />
            </section>

            {/* Claude Speed */}
            <section>
              <SectionHeader>Claude Performance</SectionHeader>
              <ClaudeSpeedPanel speed={health.claudeSpeed} />
            </section>

            {/* Footer */}
            {health.collectedAt && (
              <p className="text-xs text-gray-700 text-right">
                Data collected{" "}
                {new Date(health.collectedAt).toLocaleString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  day: "numeric",
                  month: "short",
                })}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
