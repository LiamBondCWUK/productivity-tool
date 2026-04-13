"use client";

import { useMemo, useState } from "react";
import type { NoteEntry } from "../types/dashboard";

interface NotesTabProps {
  notes: NoteEntry[];
  recentTaskTitles?: string[];
  recentProjectNames?: string[];
  onRefetch: () => void;
}

const TEMPLATES: { label: string; title: string; content: string }[] = [
  {
    label: "Standup",
    title: `Standup — ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`,
    content: "## Yesterday\n- \n\n## Today\n- \n\n## Blockers\n- ",
  },
  {
    label: "Decision",
    title: "Decision: ",
    content: "## Context\n\n\n## Options Considered\n1. \n2. \n\n## Decision\n\n\n## Rationale\n",
  },
  {
    label: "Retro Note",
    title: `Retro — ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`,
    content: "## What went well\n- \n\n## What didn't go well\n- \n\n## Action items\n- ",
  },
  {
    label: "Meeting Note",
    title: "Meeting: ",
    content: "## Attendees\n- \n\n## Key Points\n- \n\n## Actions\n- [ ] \n\n## Follow-ups\n- ",
  },
];

export function NotesTab({
  notes,
  recentTaskTitles = [],
  recentProjectNames = [],
  onRefetch,
}: NotesTabProps) {
  const [search, setSearch] = useState("");
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const sortedNotes = useMemo(
    () => [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [notes],
  );

  const filteredNotes = useMemo(() => {
    if (!search.trim()) return sortedNotes;
    const q = search.toLowerCase();
    return sortedNotes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q),
    );
  }, [sortedNotes, search]);

  const selectedNote = selectedNoteId
    ? sortedNotes.find((n) => n.id === selectedNoteId) ?? null
    : null;

  function applyTemplate(tpl: (typeof TEMPLATES)[number]) {
    setTitle(tpl.title);
    setContent(tpl.content);
    setSelectedNoteId(null);
  }

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

  async function deleteNote(noteId: string) {
    setDeleting(noteId);
    try {
      await fetch(`/api/notes?id=${encodeURIComponent(noteId)}`, {
        method: "DELETE",
      });
      if (selectedNoteId === noteId) setSelectedNoteId(null);
      onRefetch();
    } finally {
      setDeleting(null);
    }
  }

  // Detect mentions of tasks/projects in note content
  function extractMentions(text: string): string[] {
    const mentions: string[] = [];
    for (const t of recentTaskTitles) {
      if (t && text.toLowerCase().includes(t.toLowerCase().slice(0, 20))) {
        mentions.push(t);
      }
    }
    for (const p of recentProjectNames) {
      if (p && text.toLowerCase().includes(p.toLowerCase())) {
        mentions.push(`Project: ${p}`);
      }
    }
    // Detect Jira keys
    const jiraKeys = text.match(/[A-Z]{2,10}-\d{1,6}/g);
    if (jiraKeys) {
      for (const key of [...new Set(jiraKeys)]) {
        mentions.push(key);
      }
    }
    return [...new Set(mentions)].slice(0, 5);
  }

  return (
    <div className="h-full grid grid-cols-[340px_1fr] min-h-0 overflow-hidden">
      {/* Left — note list */}
      <div className="border-r border-gray-700/50 flex flex-col overflow-hidden">
        <div className="px-3 py-2.5 border-b border-gray-700/50 shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Notes ({filteredNotes.length})
            </h2>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes..."
            className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-xs text-gray-100"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredNotes.length === 0 && (
            <p className="text-xs text-gray-600 text-center py-6">
              {search ? "No notes match your search" : "No notes saved yet"}
            </p>
          )}
          {filteredNotes.map((note) => {
            const mentions = extractMentions(note.content);
            return (
              <button
                key={note.id}
                onClick={() => {
                  setSelectedNoteId(
                    note.id === selectedNoteId ? null : note.id,
                  );
                }}
                className={[
                  "w-full text-left rounded p-2.5 transition-colors border",
                  selectedNoteId === note.id
                    ? "bg-blue-600/20 border-blue-600/40"
                    : "bg-transparent border-transparent hover:bg-gray-700/40 hover:border-gray-600/30",
                ].join(" ")}
              >
                <p className="text-xs font-medium text-gray-200 truncate">
                  {note.title}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {new Date(note.updatedAt).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                <p className="text-xs text-gray-400 mt-1 truncate">
                  {note.content.slice(0, 80)}
                </p>
                {mentions.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {mentions.map((m, i) => (
                      <span
                        key={i}
                        className="text-[10px] px-1 py-0.5 rounded bg-gray-700/60 text-gray-400"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right — editor / detail */}
      <div className="flex flex-col min-h-0 overflow-hidden">
        {selectedNote ? (
          // View mode
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-100">
                  {selectedNote.title}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Created{" "}
                  {new Date(selectedNote.createdAt).toLocaleString("en-GB")} ·
                  Updated{" "}
                  {new Date(selectedNote.updatedAt).toLocaleString("en-GB")}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => {
                    setTitle(selectedNote.title);
                    setContent(selectedNote.content);
                    setSelectedNoteId(null);
                  }}
                  className="text-xs px-2 py-1 bg-gray-700/60 hover:bg-gray-600/60 rounded text-gray-300"
                >
                  Edit Copy
                </button>
                <button
                  onClick={() => deleteNote(selectedNote.id)}
                  disabled={deleting === selectedNote.id}
                  className="text-xs px-2 py-1 bg-red-900/40 hover:bg-red-800/60 rounded text-red-300 disabled:opacity-50"
                >
                  {deleting === selectedNote.id ? "…" : "Delete"}
                </button>
              </div>
            </div>
            {(() => {
              const mentions = extractMentions(selectedNote.content);
              return mentions.length > 0 ? (
                <div className="flex gap-1 mb-3 flex-wrap">
                  {mentions.map((m, i) => (
                    <span
                      key={i}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300 border border-blue-700/40"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              ) : null;
            })()}
            <div className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">
              {selectedNote.content}
            </div>
          </div>
        ) : (
          // Editor mode
          <div className="flex-1 overflow-y-auto p-4 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-100">
                Capture Note
              </h2>
              <div className="flex gap-1">
                {TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.label}
                    onClick={() => applyTemplate(tpl)}
                    className="text-[10px] px-2 py-1 rounded bg-gray-700/60 text-gray-400 hover:text-gray-200 hover:bg-gray-600/60 transition-colors"
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="text-xs text-gray-400 mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Standup notes"
              className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
            />

            <label className="text-xs text-gray-400 mt-3 mb-1">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Capture decisions, blockers, and follow-ups..."
              className="w-full flex-1 min-h-[200px] rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 font-mono"
            />

            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={saveNote}
                disabled={saving || !title.trim() || !content.trim()}
                className="px-3 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white"
              >
                {saving ? "Saving..." : "Save Note"}
              </button>
              {(title || content) && (
                <button
                  onClick={() => {
                    setTitle("");
                    setContent("");
                  }}
                  className="text-xs text-gray-500 hover:text-gray-300"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
