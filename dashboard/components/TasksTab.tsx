"use client";

import { useState } from "react";
import { TaskDetail } from "./TaskDetail";
import type { PriorityInbox, InboxItem, Task } from "../types/dashboard";

type SourceFilter = "all" | "jira" | "teams" | "ai" | "other" | "log";

interface TasksTabProps {
  inbox: PriorityInbox;
  tasks?: Task[];
}

const PRIORITY_BADGE: Record<string, string> = {
  urgent: "bg-red-500/20 text-red-300",
  high: "bg-red-500/20 text-red-300",
  today: "bg-yellow-500/20 text-yellow-300",
  medium: "bg-yellow-500/20 text-yellow-300",
  backlog: "bg-gray-600/40 text-gray-400",
  low: "bg-gray-600/40 text-gray-400",
};

const STATUS_BADGE: Record<string, string> = {
  planned: "bg-gray-600/40 text-gray-400",
  confirmed: "bg-blue-500/20 text-blue-300",
  executing: "bg-yellow-500/20 text-yellow-300",
  completed: "bg-green-500/20 text-green-300",
  failed: "bg-red-500/20 text-red-300",
};

const SOURCE_ICON: Record<string, string> = {
  jira: "🎫",
  teams: "💬",
  "ai-suggestion": "🤖",
  "jira-comment": "💬",
  "doc-comment": "📝",
  standing: "🔁",
  recurring: "🔁",
  "free-form": "📌",
};

function sourceGroup(item: InboxItem): SourceFilter {
  if (item.type === "jira" || item.type === "jira-comment") return "jira";
  if (item.type === "teams") return "teams";
  if (item.type === "ai-suggestion") return "ai";
  return "other";
}

function TaskRow({
  item,
  selected,
  onClick,
}: {
  item: InboxItem;
  selected: boolean;
  onClick: () => void;
}) {
  const badgeClass =
    PRIORITY_BADGE[item.priority ?? "backlog"] ?? PRIORITY_BADGE.backlog;
  const icon = SOURCE_ICON[item.type] ?? "📋";
  return (
    <button
      onClick={onClick}
      className={[
        "w-full text-left px-3 py-2.5 rounded transition-colors border",
        selected
          ? "bg-blue-600/20 border-blue-600/40"
          : "bg-transparent border-transparent hover:bg-gray-700/40 hover:border-gray-600/30",
      ].join(" ")}
    >
      <div className="flex items-start gap-2">
        <span className="text-xs shrink-0 mt-0.5">{icon}</span>
        <span
          className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${badgeClass}`}
        >
          {item.priority ?? "backlog"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-200 truncate leading-snug">
            {item.jiraKey && (
              <span className="font-mono text-gray-500 mr-1">
                {item.jiraKey}
              </span>
            )}
            {item.title}
          </p>
          {item.commentSnippet && (
            <p className="text-xs text-gray-500 truncate mt-0.5">
              {item.commentSnippet}
            </p>
          )}
          {item.reasoning && (
            <p className="text-xs text-gray-500 truncate mt-0.5">
              {item.reasoning}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

function TaskLogRow({
  task,
  selected,
  onClick,
}: {
  task: Task;
  selected: boolean;
  onClick: () => void;
}) {
  const badgeClass =
    STATUS_BADGE[task.status] ?? "bg-gray-600/40 text-gray-400";
  return (
    <button
      onClick={onClick}
      className={[
        "w-full text-left px-3 py-2 rounded transition-colors border",
        selected
          ? "bg-blue-600/20 border-blue-600/40"
          : "bg-transparent border-transparent hover:bg-gray-700/40 hover:border-gray-600/30",
      ].join(" ")}
    >
      <div className="flex items-start gap-2">
        <span className="text-xs shrink-0 mt-0.5">📋</span>
        <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${badgeClass}`}>
          {task.status}
        </span>
        <p className="text-xs text-gray-300 leading-snug min-w-0 truncate">
          {task.title}
          {task.projectName && (
            <span className="text-gray-600 ml-1">{task.projectName}</span>
          )}
        </p>
      </div>
    </button>
  );
}

function InboxItemDetail({ item }: { item: InboxItem }) {
  return (
    <div className="p-6 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-100">{item.title}</h3>
        <div className="flex gap-2 mt-2 flex-wrap">
          <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">
            {item.type}
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">
            {item.source}
          </span>
          {item.priority && (
            <span
              className={`text-xs px-2 py-0.5 rounded ${PRIORITY_BADGE[item.priority] ?? ""}`}
            >
              {item.priority}
            </span>
          )}
        </div>
      </div>
      {item.commentSnippet && (
        <div>
          <p className="text-xs text-gray-500 mb-1">Comment</p>
          <p className="text-xs text-gray-300 bg-gray-800 rounded p-2">
            {item.commentAuthor && (
              <span className="font-medium text-gray-400">
                {item.commentAuthor}:{" "}
              </span>
            )}
            {item.commentSnippet}
          </p>
        </div>
      )}
      {item.reasoning && (
        <div>
          <p className="text-xs text-gray-500 mb-1">AI Reasoning</p>
          <p className="text-xs text-gray-300 bg-gray-800 rounded p-2">
            {item.reasoning}
          </p>
        </div>
      )}
      {item.installCommand && (
        <div>
          <p className="text-xs text-gray-500 mb-1">Installation</p>
          <code className="text-xs text-green-300 bg-gray-800 rounded p-2 block font-mono">
            {item.installCommand}
          </code>
        </div>
      )}
      {item.link && (
        <a
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-400 hover:underline inline-block"
        >
          Open in browser →
        </a>
      )}
      {item.slaDeadline && (
        <p className="text-xs text-red-400">
          SLA Deadline: {new Date(item.slaDeadline).toLocaleString("en-GB")}
        </p>
      )}
      <p className="text-xs text-gray-600">
        Added {new Date(item.addedAt).toLocaleString("en-GB")}
      </p>
    </div>
  );
}

function TaskLogDetail({ task }: { task: Task }) {
  return (
    <div className="p-6 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-100">{task.title}</h3>
        {task.description && (
          <p className="text-xs text-gray-400 mt-1">{task.description}</p>
        )}
        <div className="flex gap-2 mt-2 flex-wrap">
          <span
            className={`text-xs px-2 py-0.5 rounded ${STATUS_BADGE[task.status] ?? ""}`}
          >
            {task.status}
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">
            {task.category}
          </span>
          {task.priority && (
            <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">
              {task.priority}
            </span>
          )}
          {task.effort && (
            <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">
              Effort: {task.effort}
            </span>
          )}
        </div>
      </div>
      {task.projectName && (
        <p className="text-xs text-gray-500">Project: {task.projectName}</p>
      )}
      {task.executionLog.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1">Execution Log</p>
          <div className="bg-gray-800 rounded p-2 space-y-1 max-h-40 overflow-y-auto">
            {task.executionLog.map((entry, i) => (
              <p
                key={i}
                className={`text-xs font-mono ${
                  entry.type === "error"
                    ? "text-red-400"
                    : entry.type === "success"
                      ? "text-green-400"
                      : "text-gray-400"
                }`}
              >
                <span className="text-gray-600 mr-1">
                  {new Date(entry.timestamp).toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {entry.text}
              </p>
            ))}
          </div>
        </div>
      )}
      <p className="text-xs text-gray-600">
        Created {new Date(task.createdAt).toLocaleString("en-GB")}
      </p>
    </div>
  );
}

const SOURCE_FILTER_LABELS: { id: SourceFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "jira", label: "Jira" },
  { id: "teams", label: "Teams" },
  { id: "ai", label: "AI" },
  { id: "other", label: "Other" },
  { id: "log", label: "Log" },
];

export function TasksTab({ inbox, tasks = [] }: TasksTabProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<"inbox" | "log">("inbox");
  const [filter, setFilter] = useState<SourceFilter>("all");

  const allInbox: InboxItem[] = [
    ...inbox.urgent,
    ...inbox.today,
    ...inbox.aiSuggested,
    ...inbox.backlog,
  ];

  const filteredInbox =
    filter === "all" || filter === "log"
      ? allInbox
      : allInbox.filter((item) => sourceGroup(item) === filter);

  const showTasks = filter === "all" || filter === "log";

  const sourceCounts: Record<SourceFilter, number> = {
    all: allInbox.length + tasks.length,
    jira: allInbox.filter((i) => sourceGroup(i) === "jira").length,
    teams: allInbox.filter((i) => sourceGroup(i) === "teams").length,
    ai: allInbox.filter((i) => sourceGroup(i) === "ai").length,
    other: allInbox.filter((i) => sourceGroup(i) === "other").length,
    log: tasks.length,
  };

  function handleSelectInbox(item: InboxItem) {
    setSelectedId(item.id === selectedId ? null : item.id);
    setSelectedType("inbox");
  }

  function handleSelectLog(task: Task) {
    setSelectedId(task.id === selectedId ? null : task.id);
    setSelectedType("log");
  }

  const selectedInboxItem =
    selectedType === "inbox"
      ? allInbox.find((i) => i.id === selectedId)
      : undefined;
  const selectedTask =
    selectedType === "log"
      ? tasks.find((t) => t.id === selectedId)
      : undefined;

  return (
    <div className="h-full flex min-h-0">
      {/* Left pane */}
      <div className="w-[260px] shrink-0 border-r border-gray-700/50 flex flex-col overflow-hidden">
        <div className="px-3 py-2.5 border-b border-gray-700/50 shrink-0">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Tasks ({allInbox.length + tasks.length})
          </h2>
          <div className="flex gap-1 flex-wrap">
            {SOURCE_FILTER_LABELS.filter((f) => sourceCounts[f.id] > 0 || f.id === "all").map(
              (f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={[
                    "text-xs px-2 py-0.5 rounded transition-colors",
                    filter === f.id
                      ? "bg-blue-600 text-white"
                      : "bg-gray-700/50 text-gray-400 hover:text-gray-200",
                  ].join(" ")}
                >
                  {f.label} ({sourceCounts[f.id]})
                </button>
              ),
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filter !== "log" &&
            filteredInbox.map((item) => (
              <TaskRow
                key={item.id}
                item={item}
                selected={item.id === selectedId}
                onClick={() => handleSelectInbox(item)}
              />
            ))}
          {showTasks && tasks.length > 0 && (
            <>
              {filter === "all" && filteredInbox.length > 0 && (
                <div className="text-xs text-gray-600 px-2 pt-3 pb-1 border-t border-gray-700/50 mt-2">
                  Task Log ({tasks.length})
                </div>
              )}
              {tasks.map((task) => (
                <TaskLogRow
                  key={task.id}
                  task={task}
                  selected={task.id === selectedId}
                  onClick={() => handleSelectLog(task)}
                />
              ))}
            </>
          )}
          {filteredInbox.length === 0 && (!showTasks || tasks.length === 0) && (
            <p className="text-xs text-gray-600 text-center py-6">
              No tasks match this filter
            </p>
          )}
        </div>
      </div>

      {/* Right pane — detail */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {selectedInboxItem?.jiraKey ? (
          <TaskDetail jiraKey={selectedInboxItem.jiraKey} />
        ) : selectedInboxItem ? (
          <InboxItemDetail item={selectedInboxItem} />
        ) : selectedTask ? (
          <TaskLogDetail task={selectedTask} />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-600 text-xs">
            Select a task to view details
          </div>
        )}
      </div>
    </div>
  );
}
