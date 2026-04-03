"use client";

import { useState, useEffect } from "react";

interface JiraSubtask {
  key: string;
  summary: string;
  status: string;
}

interface JiraComment {
  id: string;
  author: string;
  body: string;
  created: string;
}

interface JiraIssueDetail {
  key: string;
  summary: string;
  status: string;
  priority: string;
  issueType: string;
  assignee: string | null;
  reporter: string | null;
  created: string | null;
  updated: string | null;
  description: string;
  subtasks: JiraSubtask[];
  comments: JiraComment[];
  jiraUrl: string;
}

interface TaskDetailProps {
  jiraKey: string | null;
}

const PRIORITY_COLOURS: Record<string, string> = {
  Highest: "text-red-400",
  High: "text-orange-400",
  Medium: "text-yellow-400",
  Low: "text-blue-400",
  Lowest: "text-gray-500",
};

const STATUS_COLOURS: Record<string, string> = {
  "In Progress": "bg-blue-500/20 text-blue-300",
  Done: "bg-green-500/20 text-green-300",
  "To Do": "bg-gray-600/40 text-gray-400",
  Review: "bg-purple-500/20 text-purple-300",
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function TaskDetail({ jiraKey }: TaskDetailProps) {
  const [detail, setDetail] = useState<JiraIssueDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jiraKey) {
      setDetail(null);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/jira/${encodeURIComponent(jiraKey)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<JiraIssueDetail>;
      })
      .then((data) => {
        setDetail(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load");
        setLoading(false);
      });
  }, [jiraKey]);

  if (!jiraKey) {
    return (
      <div className="h-full flex items-center justify-center text-gray-600 text-sm">
        Select a task to view details
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-sm">
        Loading {jiraKey}...
      </div>
    );
  }

  if (error || !detail) {
    const isCredsMissing = error?.includes("503");
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-sm px-8 text-center">
        {isCredsMissing ? (
          <>
            <span className="text-yellow-400 font-medium">
              Jira credentials not configured
            </span>
            <span className="text-gray-500 text-xs">
              Add <code className="text-gray-400">JIRA_EMAIL</code> and{" "}
              <code className="text-gray-400">JIRA_API_TOKEN</code> to{" "}
              <code className="text-gray-400">.env.local</code>, then restart
              the dashboard
            </span>
          </>
        ) : (
          <span className="text-red-400">{error ?? "Unknown error"}</span>
        )}
      </div>
    );
  }

  const statusClass =
    STATUS_COLOURS[detail.status] ?? "bg-gray-600/40 text-gray-400";
  const priorityClass = PRIORITY_COLOURS[detail.priority] ?? "text-gray-400";

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-700/50 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-gray-500 font-mono">
                {detail.key}
              </span>
              <span
                className={`text-xs px-1.5 py-0.5 rounded font-medium ${statusClass}`}
              >
                {detail.status}
              </span>
              <span className="text-xs text-gray-500">{detail.issueType}</span>
              <span className={`text-xs font-medium ${priorityClass}`}>
                {detail.priority}
              </span>
            </div>
            <h2 className="text-sm font-semibold text-gray-100 leading-snug">
              {detail.summary}
            </h2>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
              {detail.assignee && <span>Assigned: {detail.assignee}</span>}
              {detail.updated && (
                <span>Updated: {formatDate(detail.updated)}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Description */}
        {detail.description && (
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Description
            </h3>
            <pre className="text-xs text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
              {detail.description}
            </pre>
          </section>
        )}

        {/* Subtasks */}
        {detail.subtasks.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Subtasks ({detail.subtasks.length})
            </h3>
            <ul className="space-y-1">
              {detail.subtasks.map((st) => (
                <li key={st.key} className="flex items-center gap-2 text-xs">
                  <span
                    className={`px-1.5 py-0.5 rounded text-xs ${
                      STATUS_COLOURS[st.status] ??
                      "bg-gray-600/40 text-gray-400"
                    }`}
                  >
                    {st.status}
                  </span>
                  <span className="font-mono text-gray-500">{st.key}</span>
                  <span className="text-gray-300 truncate">{st.summary}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Comments */}
        {detail.comments.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Recent Comments
            </h3>
            <div className="space-y-3">
              {detail.comments.map((c) => (
                <div
                  key={c.id}
                  className="bg-gray-800/50 rounded p-2.5 border border-gray-700/30"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-300">
                      {c.author}
                    </span>
                    <span className="text-xs text-gray-600">
                      {formatDate(c.created)}
                    </span>
                  </div>
                  <pre className="text-xs text-gray-400 whitespace-pre-wrap font-sans leading-relaxed">
                    {c.body}
                  </pre>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Footer actions */}
      <div className="px-4 py-2 border-t border-gray-700/50 flex items-center gap-2 shrink-0">
        <a
          href={detail.jiraUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded transition-colors"
        >
          Open in Jira ↗
        </a>
        <button
          onClick={() =>
            navigator.clipboard.writeText(`claude /ticket ${detail.key}`)
          }
          className="text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
        >
          Copy CLI command
        </button>
      </div>
    </div>
  );
}
