"use client";

import { useState, useEffect, useCallback } from "react";

// ── Script Runner Hook ───────────────────────────────────────────────────────

interface ScriptResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  error?: string;
}

function useScriptRunner() {
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, ScriptResult>>({});

  const run = useCallback(async (key: string) => {
    setRunning((prev) => ({ ...prev, [key]: true }));
    setResults((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    try {
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: key }),
      });
      const data: ScriptResult = await res.json();
      setResults((prev) => ({ ...prev, [key]: data }));
    } catch (err: unknown) {
      setResults((prev) => ({
        ...prev,
        [key]: { success: false, error: err instanceof Error ? err.message : "Network error" },
      }));
    } finally {
      setRunning((prev) => ({ ...prev, [key]: false }));
    }
  }, []);

  return { running, results, run };
}

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

// ── Quick Actions ─────────────────────────────────────────────────────────────

interface QuickAction {
  key: string;
  label: string;
}

function QuickActionGroup({
  label,
  actions,
  running,
  results,
  onRun,
}: {
  label: string;
  actions: QuickAction[];
  running: Record<string, boolean>;
  results: Record<string, ScriptResult>;
  onRun: (key: string) => void;
}) {
  return (
    <div className="bg-gray-800/40 border border-gray-700/40 rounded-lg p-3">
      <p className="text-xs text-gray-500 font-medium mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => {
          const isRunning = running[action.key];
          const result = results[action.key];
          const btnColor = result
            ? result.success
              ? "bg-green-700/40 border-green-600/50 text-green-300"
              : "bg-red-700/40 border-red-600/50 text-red-300"
            : "bg-gray-700/60 border-gray-600/50 text-gray-300 hover:bg-gray-600/60 hover:text-gray-200";

          return (
            <button
              key={action.key}
              onClick={() => onRun(action.key)}
              disabled={isRunning}
              className={`text-xs px-2.5 py-1.5 rounded border transition-colors disabled:opacity-50 ${btnColor}`}
              title={result?.error ?? result?.stdout?.slice(0, 100) ?? ""}
            >
              {isRunning ? "Running…" : action.label}
              {result && !isRunning && (
                <span className="ml-1">{result.success ? "✓" : "✗"}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface RecommendedInstall {
  id: string;
  name: string;
  category: string;
  priority: string;
  description: string;
  signal: string;
  installCommand?: string;
  status: string;
}

interface SystemTabProps {
  suggestions?: string[];
  recommendedInstalls?: RecommendedInstall[];
  onMarkInstalled?: (id: string) => Promise<void>;
}

export function SystemTab({
  suggestions = [],
  recommendedInstalls = [],
  onMarkInstalled,
}: SystemTabProps) {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const { running, results, run } = useScriptRunner();

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

            {/* Quick Actions */}
            <section>
              <SectionHeader>Quick Actions</SectionHeader>
              <div className="space-y-3">
                <QuickActionGroup
                  label="Data Refresh"
                  actions={[
                    { key: "refresh-email", label: "Refresh Email" },
                    { key: "refresh-calendar", label: "Refresh Calendar" },
                    { key: "sync-projects", label: "Sync Projects" },
                    { key: "system-health", label: "System Health" },
                  ]}
                  running={running}
                  results={results}
                  onRun={run}
                />
                <QuickActionGroup
                  label="AI Generation"
                  actions={[
                    { key: "generate-day-plan", label: "Day Plan" },
                    { key: "generate-ibp", label: "Generate IBP" },
                    { key: "overnight-analysis", label: "Overnight Analysis" },
                  ]}
                  running={running}
                  results={results}
                  onRun={run}
                />
                <QuickActionGroup
                  label="Maintenance"
                  actions={[
                    { key: "activity-merge", label: "Merge Activity" },
                    { key: "refresh-news", label: "Extract News" },
                    { key: "jira-status", label: "Jira Status" },
                    { key: "morning-orchestrator", label: "Morning Orchestrator" },
                  ]}
                  running={running}
                  results={results}
                  onRun={run}
                />
              </div>
            </section>

            {/* Suggestions & Recommended Installs */}
            {(suggestions.length > 0 || recommendedInstalls.length > 0) && (
              <section>
                <SectionHeader>Suggestions & Recommended Installs</SectionHeader>
                <div className="space-y-3">
                  {suggestions.length > 0 && (
                    <div className="bg-gray-800/40 border border-gray-700/40 rounded-lg p-3">
                      <p className="text-xs text-gray-500 font-medium mb-2">
                        AI Suggestions
                      </p>
                      <ul className="space-y-1.5">
                        {suggestions.map((s, i) => (
                          <li
                            key={i}
                            className="text-xs text-gray-300 flex items-start gap-2"
                          >
                            <span className="text-gray-600 shrink-0">•</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {recommendedInstalls.length > 0 && (
                    <div className="bg-gray-800/40 border border-gray-700/40 rounded-lg p-3">
                      <p className="text-xs text-gray-500 font-medium mb-2">
                        Recommended Installs
                      </p>
                      <div className="space-y-2">
                        {recommendedInstalls.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-start justify-between gap-2 py-1"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-medium text-gray-200">
                                  {item.name}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-400">
                                  {item.category}
                                </span>
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                                    item.priority === "HIGH"
                                      ? "bg-red-900/40 text-red-300"
                                      : item.priority === "MED"
                                        ? "bg-yellow-900/40 text-yellow-300"
                                        : "bg-gray-700/60 text-gray-400"
                                  }`}
                                >
                                  {item.priority}
                                </span>
                                {item.status === "INSTALLED" && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-900/40 text-green-300">
                                    Installed
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {item.description}
                              </p>
                              {item.installCommand && item.status !== "INSTALLED" && (
                                <code className="text-[10px] text-green-400 bg-gray-800 rounded px-1.5 py-0.5 mt-1 block font-mono">
                                  {item.installCommand}
                                </code>
                              )}
                            </div>
                            {item.status !== "INSTALLED" && onMarkInstalled && (
                              <button
                                onClick={() => onMarkInstalled(item.id)}
                                className="text-[10px] px-2 py-1 rounded bg-green-700/30 text-green-300 hover:bg-green-700/50 transition-colors shrink-0"
                              >
                                Mark Installed
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

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
