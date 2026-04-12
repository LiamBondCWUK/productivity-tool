"use client";

import { useMemo, useState } from "react";
import type { NoteEntry } from "../types/dashboard";

interface NotesTabProps {
  notes: NoteEntry[];
  onRefetch: () => void;
}

export function NotesTab({ notes, onRefetch }: NotesTabProps) {
  const sortedNotes = useMemo(
    () => [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [notes],
  );

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveNote() {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), content: content.trim() }),
      });
      setTitle("");
      setContent("");
      onRefetch();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full grid grid-cols-[380px_1fr] min-h-0 overflow-hidden">
      <div className="border-r border-gray-700/50 p-4 overflow-y-auto">
        <h2 className="text-sm font-semibold text-gray-100 mb-3">Recent Notes</h2>
        <div className="space-y-2">
          {sortedNotes.length === 0 && (
            <p className="text-xs text-gray-500">No notes saved yet.</p>
          )}
          {sortedNotes.map((note) => (
            <div key={note.id} className="rounded border border-gray-700/60 bg-gray-800/50 p-3">
              <p className="text-sm font-medium text-gray-100">{note.title}</p>
              <p className="text-xs text-gray-500 mt-1">
                Updated {new Date(note.updatedAt).toLocaleString("en-GB")}
              </p>
              <p className="text-xs text-gray-300 mt-2 whitespace-pre-wrap line-clamp-6">
                {note.content}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 flex flex-col min-h-0">
        <h2 className="text-sm font-semibold text-gray-100 mb-3">Capture Note</h2>
        <label className="text-xs text-gray-400 mb-1">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Standup notes"
          className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
        />

        <label className="text-xs text-gray-400 mt-4 mb-1">Content</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Capture decisions, blockers, and follow-ups..."
          className="w-full flex-1 min-h-[200px] rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
        />

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={saveNote}
            disabled={saving || !title.trim() || !content.trim()}
            className="px-3 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white"
          >
            {saving ? "Saving..." : "Save Note"}
          </button>
          <p className="text-xs text-gray-500">Notes are stored in dashboard data for daily ops context.</p>
        </div>
      </div>
    </div>
  );
}
