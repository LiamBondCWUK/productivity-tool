"use client";

import { useState, useCallback } from "react";
import type { FeedbackItem, FeedbackStatus } from "../types/dashboard";

const COLUMNS: { id: FeedbackStatus; label: string; colour: string }[] = [
  { id: "inbox",    label: "Inbox",    colour: "text-blue-400 border-blue-500/30 bg-blue-500/5" },
  { id: "accepted", label: "Accepted", colour: "text-green-400 border-green-500/30 bg-green-500/5" },
  { id: "denied",   label: "Denied",   colour: "text-red-400 border-red-500/30 bg-red-500/5" },
];

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
      {/* Add feedback row */}
      <div className="flex gap-2 shrink-0">
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

      {error && (
        <p className="text-red-400 text-xs shrink-0">{error}</p>
      )}

      {/* Kanban columns */}
      <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">
        {COLUMNS.map((col) => {
          const colItems = items.filter((i) => i.status === col.id);
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
                          <span className="text-gray-500 text-xs">{item.source}</span>
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
