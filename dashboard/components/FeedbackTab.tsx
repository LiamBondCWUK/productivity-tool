"use client";

import { useState, useCallback, useMemo } from "react";
import type { FeedbackItem, FeedbackStatus } from "../types/dashboard";

const COLUMNS: { id: FeedbackStatus; label: string; colour: string }[] = [
  { id: "inbox",    label: "Inbox",    colour: "text-blue-400 border-blue-500/30 bg-blue-500/5" },
  { id: "accepted", label: "Accepted", colour: "text-green-400 border-green-500/30 bg-green-500/5" },
  { id: "denied",   label: "Denied",   colour: "text-red-400 border-red-500/30 bg-red-500/5" },
];

const SOURCE_BADGE_COLOURS = [
  "text-purple-300 bg-purple-900/40 border-purple-700/50",
  "text-cyan-300 bg-cyan-900/40 border-cyan-700/50",
  "text-orange-300 bg-orange-900/40 border-orange-700/50",
  "text-pink-300 bg-pink-900/40 border-pink-700/50",
  "text-teal-300 bg-teal-900/40 border-teal-700/50",
  "text-yellow-300 bg-yellow-900/40 border-yellow-700/50",
  "text-indigo-300 bg-indigo-900/40 border-indigo-700/50",
  "text-emerald-300 bg-emerald-900/40 border-emerald-700/50",
];

function sourceBadgeColour(source: string): string {
  let hash = 0;
  for (let i = 0; i < source.length; i++) hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  return SOURCE_BADGE_COLOURS[hash % SOURCE_BADGE_COLOURS.length];
}

interface FeedbackTabProps {
  initialItems?: FeedbackItem[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function FeedbackTab({ initialItems = [] }: FeedbackTabProps) {
  const [items, setItems] = useState<FeedbackItem[]>(initialItems);
  const [newText, setNewText] = useState("");
  const [newSource, setNewSource] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  const projectSources = useMemo(() => {
    const sources = [...new Set(
      items.map((i) => i.source).filter((s): s is string => !!s && s !== "manual")
    )].sort();
    return sources;
  }, [items]);

  const filteredItems = useMemo(() => {
    if (sourceFilter === "all") return items;
    return items.filter((i) => i.source === sourceFilter);
  }, [items, sourceFilter]);

  const addFeedback = useCallback(async () => {
    const text = newText.trim();
    if (!text) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, source: newSource.trim() || "manual" }),
      });
      if (!res.ok) throw new Error(await res.text());
      const item: FeedbackItem = await res.json();
      setItems((prev) => [item, ...prev]);
      setNewText("");
      setNewSource("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add feedback");
    } finally {
      setSubmitting(false);
    }
  }, [newText, newSource]);

  const moveItem = useCallback(async (id: string, status: FeedbackStatus) => {
    try {
      const res = await fetch("/api/feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error(await res.text());
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status } : i))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to move item");
    }
  }, []);

  const deleteItem = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/feedback?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await res.text());
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete item");
    }
  }, []);

  return (
    <div className="flex flex-col h-full p-4 gap-4 overflow-hidden">
      {/* Toolbar: add feedback + project filter */}
      <div className="flex flex-col gap-2 shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Feedback text…"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && addFeedback()}
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <input
            type="text"
            placeholder="Source (optional)"
            value={newSource}
            onChange={(e) => setNewSource(e.target.value)}
            className="w-40 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={addFeedback}
            disabled={submitting || !newText.trim()}
            className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors"
          >
            {submitting ? "Adding…" : "Add"}
          </button>
        </div>
        {projectSources.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-gray-500">Filter:</span>
            <button
              onClick={() => setSourceFilter("all")}
              className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                sourceFilter === "all"
                  ? "bg-gray-700 border-gray-500 text-gray-200"
                  : "border-gray-600 text-gray-500 hover:text-gray-300"
              }`}
            >
              All ({items.length})
            </button>
            {projectSources.map((src) => {
              const count = items.filter((i) => i.source === src).length;
              const colour = sourceBadgeColour(src);
              return (
                <button
                  key={src}
                  onClick={() => setSourceFilter(sourceFilter === src ? "all" : src)}
                  className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                    sourceFilter === src ? colour : "border-gray-600 text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {src} ({count})
                </button>
              );
            })}
          </div>
        )}
      </div>

      {error && (
        <p className="text-red-400 text-xs shrink-0">{error}</p>
      )}

      {/* Kanban columns */}
      <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">
        {COLUMNS.map((col) => {
          const colItems = filteredItems.filter((i) => i.status === col.id);
          const others = COLUMNS.filter((c) => c.id !== col.id);

          return (
            <div
              key={col.id}
              className={`flex flex-col flex-1 min-w-0 rounded-lg border ${col.colour} overflow-hidden`}
            >
              <div className="flex items-center justify-between px-3 py-2 shrink-0 border-b border-gray-700/50">
                <span className={`text-xs font-semibold uppercase tracking-wide ${col.colour.split(" ")[0]}`}>
                  {col.label}
                </span>
                <span className="text-xs text-gray-500">{colItems.length}</span>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {colItems.length === 0 && (
                  <p className="text-gray-600 text-xs text-center py-4">Empty</p>
                )}
                {colItems.map((item) => (
                  <div
                    key={item.id}
                    className="bg-gray-800/80 border border-gray-700/50 rounded p-2.5 group"
                  >
                    <p className="text-gray-100 text-sm leading-snug mb-1">{item.text}</p>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-col gap-0.5">
                        {item.source && item.source !== "manual" && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border w-fit ${sourceBadgeColour(item.source)}`}>
                            {item.source}
                          </span>
                        )}
                        <span className="text-gray-600 text-xs">{formatDate(item.createdAt)}</span>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {others.map((target) => (
                          <button
                            key={target.id}
                            onClick={() => moveItem(item.id, target.id)}
                            title={`Move to ${target.label}`}
                            className={`px-1.5 py-0.5 text-xs rounded border ${target.colour} hover:opacity-80 transition-opacity`}
                          >
                            → {target.label}
                          </button>
                        ))}
                        <button
                          onClick={() => deleteItem(item.id)}
                          title="Delete"
                          className="px-1.5 py-0.5 text-xs rounded border border-gray-600 text-gray-500 hover:text-red-400 hover:border-red-500/50 transition-colors"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
