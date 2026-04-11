"use client";

import { useState, useEffect } from "react";
import type { TimeTracker as TimeTrackerType } from "../types/dashboard";

interface Props {
  tracker: TimeTrackerType;
  onRefetch: () => void;
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

function formatElapsed(startedAt: string): string {
  const elapsed = Math.round(
    (Date.now() - new Date(startedAt).getTime()) / 60000,
  );
  return formatMinutes(elapsed);
}

function formatElapsedHHMM(startedAt: string): string {
  const elapsed = Math.round(
    (Date.now() - new Date(startedAt).getTime()) / 1000,
  );
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

async function apiPost(action: string, extra?: Record<string, unknown>) {
  await fetch("/api/time", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...extra }),
  });
}

export function TimeTracker({ tracker, onRefetch }: Props) {
  const [label, setLabel] = useState("");
  const [elapsed, setElapsed] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [showStartForm, setShowStartForm] = useState(false);

  const { activeSession, todayTotalMinutes, weekTotalMinutes } = tracker;
  const plannedSessions = tracker.plannedSessions ?? [];
  const plannedTodayMinutes =
    tracker.plannedTodayMinutes ??
    plannedSessions.reduce(
      (sum, session) => sum + (session.durationMinutes ?? 0),
      0,
    );

  // Live timer tick
  useEffect(() => {
    if (!activeSession) {
      setElapsed("");
      return;
    }
    const tick = () => setElapsed(formatElapsedHHMM(activeSession.startedAt));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  const handleStart = async () => {
    if (!label.trim()) return;
    setIsStarting(true);
    const parts = label.trim().split(" ");
    const jiraPattern = /^[A-Z]+-\d+$/;
    const jiraKey = jiraPattern.test(parts[0]) ? parts[0] : undefined;
    const taskLabel = jiraKey
      ? parts.slice(1).join(" ") || jiraKey
      : label.trim();
    await apiPost("start", { label: taskLabel, jiraKey });
    setLabel("");
    setShowStartForm(false);
    setIsStarting(false);
    onRefetch();
  };

  const handleStop = async () => {
    await apiPost("stop");
    onRefetch();
  };

  const handleAddMinutes = async (minutes: number) => {
    await apiPost("add-minutes", { minutes });
    onRefetch();
  };

  const handleLogAndNext = async () => {
    await apiPost("log-and-next");
    onRefetch();
    setShowStartForm(true);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Time Tracker
        </h2>
      </div>

      <div className="flex-1 space-y-3">
        {/* Active session */}
        {activeSession ? (
          <div className="bg-blue-900/20 border border-blue-700/40 rounded-lg p-3">
            <div className="flex items-start justify-between mb-1">
              <div className="flex-1 min-w-0">
                {activeSession.jiraKey && (
                  <span className="text-blue-400 text-xs font-mono">
                    {activeSession.jiraKey}{" "}
                  </span>
                )}
                <span className="text-gray-200 text-sm">
                  {activeSession.label}
                </span>
              </div>
              <span className="text-blue-300 font-mono text-sm shrink-0 ml-2">
                {elapsed}
              </span>
            </div>
            <div className="flex gap-2 mt-2 flex-wrap">
              <button
                onClick={() => handleAddMinutes(15)}
                className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors"
              >
                +15m
              </button>
              <button
                onClick={() => handleAddMinutes(30)}
                className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors"
              >
                +30m
              </button>
              <button
                onClick={handleStop}
                className="text-xs px-2 py-1 bg-red-700/50 hover:bg-red-600/50 rounded text-red-300 transition-colors"
              >
                Stop
              </button>
              <button
                onClick={handleLogAndNext}
                className="text-xs px-2 py-1 bg-green-700/50 hover:bg-green-600/50 rounded text-green-300 transition-colors"
              >
                Log & Next
              </button>
            </div>
          </div>
        ) : (
          <div>
            {showStartForm ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleStart()}
                  placeholder="TICKET-123 or task name"
                  className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  autoFocus
                />
                <button
                  onClick={handleStart}
                  disabled={!label.trim() || isStarting}
                  className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-white transition-colors shrink-0"
                >
                  Start
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowStartForm(true)}
                className="w-full py-2 text-gray-600 hover:text-gray-400 text-xs border border-dashed border-gray-700 hover:border-gray-500 rounded transition-colors"
              >
                ▶ Start timer
              </button>
            )}
          </div>
        )}

        {/* Totals */}
        <div className="space-y-1 pt-1 border-t border-gray-700/50">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Today</span>
            <span className="text-gray-300 font-mono">
              {formatMinutes(todayTotalMinutes)}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Planned</span>
            <span className="text-blue-300 font-mono">
              {formatMinutes(plannedTodayMinutes)}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">This week</span>
            <span className="text-gray-300 font-mono">
              {formatMinutes(weekTotalMinutes)}
            </span>
          </div>
        </div>

        {plannedSessions.length > 0 && (
          <div>
            <p className="text-gray-500 text-xs font-semibold mb-1">
              Planned focus blocks
            </p>
            <div className="space-y-0.5 max-h-24 overflow-y-auto">
              {plannedSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center gap-2 text-xs"
                >
                  {session.jiraKey && (
                    <span className="text-blue-400 font-mono shrink-0">
                      {session.jiraKey}
                    </span>
                  )}
                  <span className="text-gray-400 truncate flex-1">
                    {session.label}
                  </span>
                  <span className="text-blue-300 font-mono shrink-0">
                    {formatMinutes(session.durationMinutes ?? 0)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent sessions */}
        {tracker.todaySessions.length > 0 && (
          <div>
            <p className="text-gray-500 text-xs font-semibold mb-1">
              Today&apos;s sessions
            </p>
            <div className="space-y-0.5 max-h-32 overflow-y-auto">
              {[...tracker.todaySessions].reverse().map((session) => (
                <div
                  key={session.id}
                  className="flex items-center gap-2 text-xs"
                >
                  {session.jiraKey && (
                    <span className="text-blue-400 font-mono shrink-0">
                      {session.jiraKey}
                    </span>
                  )}
                  <span className="text-gray-400 truncate flex-1">
                    {session.label}
                  </span>
                  <span className="text-gray-500 font-mono shrink-0">
                    {formatMinutes(session.durationMinutes ?? 0)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
