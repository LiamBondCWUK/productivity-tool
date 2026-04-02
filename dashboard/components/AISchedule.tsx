"use client";

import { useState, useCallback, useEffect } from "react";
import type {
  DayPlan,
  DayPlanBlock,
  DayPlanBlockType,
} from "../types/dashboard";

interface AIScheduleProps {
  initialPlan?: DayPlan | null;
  onRefetch?: () => void;
}

const TYPE_COLORS: Record<DayPlanBlockType, string> = {
  focus: "bg-blue-500/20 border-blue-500/50 text-blue-300",
  meeting: "bg-purple-500/20 border-purple-500/50 text-purple-300",
  admin: "bg-yellow-500/20 border-yellow-500/50 text-yellow-300",
  buffer: "bg-gray-500/20 border-gray-500/50 text-gray-400",
};

const TYPE_LABELS: Record<DayPlanBlockType, string> = {
  focus: "FOCUS",
  meeting: "MEETING",
  admin: "ADMIN",
  buffer: "BUFFER",
};

function BlockRow({
  block,
  dismissed,
  onDismiss,
}: {
  block: DayPlanBlock;
  dismissed: boolean;
  onDismiss: (time: string) => void;
}) {
  if (dismissed) return null;
  const colorClass = TYPE_COLORS[block.type] ?? TYPE_COLORS.buffer;
  const label = TYPE_LABELS[block.type] ?? block.type.toUpperCase();
  const durationLabel =
    block.duration >= 60
      ? `${Math.floor(block.duration / 60)}h${block.duration % 60 > 0 ? `${block.duration % 60}m` : ""}`
      : `${block.duration}m`;

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg border ${colorClass} group`}
    >
      <div className="flex flex-col items-center min-w-[48px]">
        <span className="text-sm font-mono font-semibold">{block.time}</span>
        <span className="text-xs opacity-60">{durationLabel}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold tracking-wider opacity-70">
            {label}
          </span>
          {block.booked && (
            <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">
              booked
            </span>
          )}
        </div>
        <p className="text-sm font-medium mt-0.5 truncate">{block.task}</p>
        {block.rationale && (
          <p className="text-xs opacity-60 mt-0.5 line-clamp-2">
            {block.rationale}
          </p>
        )}
      </div>
      <button
        onClick={() => onDismiss(block.time)}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-red-400 text-lg leading-none p-1"
        title="Dismiss block"
      >
        &times;
      </button>
    </div>
  );
}

export function AISchedule({ initialPlan, onRefetch }: AIScheduleProps) {
  const [plan, setPlan] = useState<DayPlan | null>(initialPlan ?? null);
  const [generating, setGenerating] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [bookingResult, setBookingResult] = useState<string | null>(null);

  useEffect(() => {
    if (initialPlan !== undefined) setPlan(initialPlan);
  }, [initialPlan]);

  const fetchPlan = useCallback(async () => {
    try {
      const res = await fetch("/api/day-plan");
      if (res.ok) {
        const json = await res.json();
        setPlan(json.dayPlan ?? null);
      }
    } catch {
      // silent
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    setBookingResult(null);
    setDismissed(new Set());
    try {
      const res = await fetch("/api/day-plan", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Generation failed");
      setPlan(json.dayPlan ?? null);
      onRefetch?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate plan");
    } finally {
      setGenerating(false);
    }
  }, [onRefetch]);

  const handleAcceptAll = useCallback(async () => {
    if (!plan) return;
    setAccepting(true);
    setError(null);
    try {
      const res = await fetch("/api/day-plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookCalendar: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Accept failed");
      setPlan(json.dayPlan ?? null);
      if (json.graphError) {
        setBookingResult(`Plan accepted. Note: ${json.graphError}`);
      } else {
        const booked = (json.dayPlan?.blocks ?? []).filter(
          (b: DayPlanBlock) => b.booked,
        ).length;
        setBookingResult(
          `Plan accepted. ${booked} focus block${booked !== 1 ? "s" : ""} booked in Outlook.`,
        );
      }
      onRefetch?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept plan");
    } finally {
      setAccepting(false);
    }
  }, [plan, onRefetch]);

  const handleDismiss = useCallback((time: string) => {
    setDismissed((prev) => new Set([...prev, time]));
  }, []);

  const visibleBlocks =
    plan?.blocks.filter((b) => !dismissed.has(b.time)) ?? [];
  const accepted = plan?.accepted ?? false;

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold tracking-wider text-gray-400 uppercase">
            AI Day Plan
          </h3>
          {plan?.generatedAt && (
            <p className="text-xs text-gray-500 mt-0.5">
              Generated{" "}
              {new Date(plan.generatedAt).toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              })}
              {accepted && (
                <span className="ml-2 text-green-400">&#10003; accepted</span>
              )}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {!accepted ? (
            <>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="text-xs px-2.5 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 disabled:opacity-50 transition-colors"
              >
                {generating
                  ? "Generating..."
                  : plan
                    ? "Regenerate"
                    : "Generate"}
              </button>
              {plan && visibleBlocks.length > 0 && (
                <button
                  onClick={handleAcceptAll}
                  disabled={accepting}
                  className="text-xs px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-colors font-semibold"
                >
                  {accepting ? "Booking..." : "Accept All"}
                </button>
              )}
            </>
          ) : (
            <button
              onClick={fetchPlan}
              className="text-xs px-2.5 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
            >
              Refresh
            </button>
          )}
        </div>
      </div>

      {/* Status messages */}
      {error && (
        <p className="text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded p-2">
          {error}
        </p>
      )}
      {bookingResult && (
        <p className="text-xs text-green-400 bg-green-900/20 border border-green-800/40 rounded p-2">
          {bookingResult}
        </p>
      )}

      {/* Empty state */}
      {!plan && !generating && (
        <div className="text-center py-6 text-gray-500">
          <p className="text-sm">No day plan yet.</p>
          <p className="text-xs mt-1">
            Click Generate to create an AI-scheduled plan.
          </p>
        </div>
      )}

      {/* Generating state */}
      {generating && (
        <div className="text-center py-6 text-gray-500">
          <p className="text-sm animate-pulse">Generating your day plan...</p>
        </div>
      )}

      {/* Plan blocks */}
      {plan && !generating && (
        <div className="flex flex-col gap-2">
          {visibleBlocks.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-3">
              All blocks dismissed.
            </p>
          ) : (
            visibleBlocks.map((block) => (
              <BlockRow
                key={block.time}
                block={block}
                dismissed={dismissed.has(block.time)}
                onDismiss={handleDismiss}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
