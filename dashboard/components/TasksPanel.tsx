"use client";

import { useState } from "react";
import type {
  Task,
  TaskCategory,
  TaskStatus,
  TaskLogEntry,
} from "../types/dashboard";

const CATEGORY_COLORS: Record<TaskCategory, string> = {
  feature: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "bug-fix": "bg-red-500/20 text-red-300 border-red-500/30",
  "first-build": "bg-purple-500/20 text-purple-300 border-purple-500/30",
  refactor: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  analysis: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  chore: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

const PRIORITY_COLORS: Record<string, string> = {
  HIGH: "text-red-400",
  MED: "text-yellow-400",
  LOW: "text-gray-600",
};

const EFFORT_LABELS: Record<string, string> = {
  S: "~10m",
  M: "~1h",
  L: "~4h",
};

const CATEGORIES: TaskCategory[] = [
  "feature",
  "bug-fix",
  "first-build",
  "refactor",
  "analysis",
  "chore",
];

interface NewTaskForm {
  title: string;
  category: TaskCategory;
  description: string;
  effort: "S" | "M" | "L" | "";
  priority: "HIGH" | "MED" | "LOW" | "";
}

function LogLine({ entry }: { entry: TaskLogEntry }) {
  const color =
    entry.type === "error"
      ? "text-red-400"
      : entry.type === "success"
        ? "text-green-400"
        : "text-gray-400";
  const time = new Date(entry.timestamp).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return (
    <div className="flex gap-1.5 text-xs font-mono leading-snug">
      <span className="text-gray-600 shrink-0">{time}</span>
      <span className={color}>{entry.text}</span>
    </div>
  );
}

function TaskCard({
  task,
  onStatusChange,
  onDelete,
}: {
  task: Task;
  onStatusChange: (id: string, status: TaskStatus) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [logOpen, setLogOpen] = useState(false);
  const isPlanned = task.status === "planned" || task.status === "confirmed";
  const isExecuting = task.status === "executing";
  const isFailed = task.status === "failed";

  return (
    <div
      className={`bg-gray-800/60 border rounded-lg p-2.5 space-y-1.5 ${
        isExecuting
          ? "border-blue-500/40"
          : isFailed
            ? "border-red-500/30"
            : "border-gray-700/40"
      }`}
    >
      {/* Title row */}
      <div className="flex items-start gap-1">
        <p className="text-gray-100 text-xs font-medium leading-snug flex-1">
          {task.title}
        </p>
        <button
          onClick={() => onDelete(task.id)}
          className="text-gray-700 hover:text-gray-500 text-sm leading-none shrink-0 mt-0.5 transition-colors"
          title="Remove"
        >
          x
        </button>
      </div>

      {/* Project */}
      {task.projectName && (
        <p className="text-gray-600 text-xs truncate">{task.projectName}</p>
      )}

      {/* Badges */}
      <div className="flex flex-wrap items-center gap-1">
        <span
          className={`text-xs px-1.5 py-0.5 rounded border ${CATEGORY_COLORS[task.category]}`}
        >
          {task.category}
        </span>
        {task.effort && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700/40 text-gray-500">
            {EFFORT_LABELS[task.effort]}
          </span>
        )}
        {task.priority && (
          <span
            className={`text-xs font-semibold ${PRIORITY_COLORS[task.priority]}`}
          >
            {task.priority}
          </span>
        )}
      </div>

      {/* Execution log */}
      {task.executionLog.length > 0 && (
        <div>
          <button
            onClick={() => setLogOpen((p) => !p)}
            className="text-xs text-gray-600 hover:text-gray-400 flex items-center gap-1 transition-colors"
          >
            {logOpen ? "v" : ">"} log ({task.executionLog.length})
          </button>
          {logOpen && (
            <div className="mt-1 space-y-0.5 max-h-28 overflow-y-auto border border-gray-700/40 rounded p-1.5">
              {task.executionLog.map((e, i) => (
                <LogLine key={i} entry={e} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-1 pt-0.5">
        {isPlanned && (
          <>
            {task.status === "planned" && (
              <button
                onClick={() => onStatusChange(task.id, "confirmed")}
                className="text-xs px-2 py-0.5 rounded border border-gray-600 text-gray-500 hover:border-gray-400 hover:text-gray-300 transition-colors"
              >
                Confirm
              </button>
            )}
            <button
              onClick={() => onStatusChange(task.id, "executing")}
              className="text-xs px-2 py-0.5 rounded border border-blue-500/50 text-blue-400 hover:bg-blue-500/10 transition-colors"
            >
              Execute
            </button>
          </>
        )}
        {isExecuting && (
          <>
            <button
              onClick={() => onStatusChange(task.id, "completed")}
              className="text-xs px-2 py-0.5 rounded border border-green-500/50 text-green-400 hover:bg-green-500/10 transition-colors"
            >
              Done
            </button>
            <button
              onClick={() => onStatusChange(task.id, "failed")}
              className="text-xs px-2 py-0.5 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
            >
              Failed
            </button>
          </>
        )}
      </div>
    </div>
  );
}

interface Props {
  tasks: Task[];
  onRefetch: () => void;
}

export function TasksPanel({ tasks, onRefetch }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [catFilter, setCatFilter] = useState<TaskCategory | "all">("all");
  const [form, setForm] = useState<NewTaskForm>({
    title: "",
    category: "feature",
    description: "",
    effort: "",
    priority: "",
  });

  const planned = tasks.filter(
    (t) => t.status === "planned" || t.status === "confirmed",
  );
  const executing = tasks.filter((t) => t.status === "executing");
  const done = tasks.filter(
    (t) => t.status === "completed" || t.status === "failed",
  );
  const visibleDone =
    catFilter === "all" ? done : done.filter((t) => t.category === catFilter);
  const usedCats = [...new Set(done.map((t) => t.category))];

  async function updateStatus(id: string, status: TaskStatus) {
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    onRefetch();
  }

  async function deleteTask(id: string) {
    await fetch(`/api/tasks?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    onRefetch();
  }

  async function createTask() {
    if (!form.title.trim()) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title.trim(),
        category: form.category,
        effort: form.effort || undefined,
        priority: form.priority || undefined,
      }),
    });
    setForm({
      title: "",
      category: "feature",
      description: "",
      effort: "",
      priority: "",
    });
    setShowForm(false);
    onRefetch();
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Tasks
        </h2>
        <button
          onClick={() => setShowForm((p) => !p)}
          className="text-xs px-2 py-0.5 rounded border border-gray-600 text-gray-400 hover:border-gray-400 transition-colors"
        >
          + New
        </button>
      </div>

      {/* New task form */}
      {showForm && (
        <div className="mb-3 p-2.5 bg-gray-800/60 border border-gray-600/40 rounded-lg space-y-2 shrink-0">
          <input
            autoFocus
            type="text"
            placeholder="Task title..."
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && createTask()}
            className="w-full bg-gray-700/60 border border-gray-600/40 rounded px-2 py-1 text-xs text-gray-100 placeholder-gray-500 outline-none focus:border-gray-400"
          />
          <div className="flex gap-1.5 flex-wrap">
            <select
              value={form.category}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  category: e.target.value as TaskCategory,
                }))
              }
              className="bg-gray-700/60 border border-gray-600/40 rounded px-1.5 py-0.5 text-xs text-gray-300 outline-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={form.effort}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  effort: e.target.value as NewTaskForm["effort"],
                }))
              }
              className="bg-gray-700/60 border border-gray-600/40 rounded px-1.5 py-0.5 text-xs text-gray-300 outline-none"
            >
              <option value="">effort</option>
              <option value="S">S ~10m</option>
              <option value="M">M ~1h</option>
              <option value="L">L ~4h</option>
            </select>
            <select
              value={form.priority}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  priority: e.target.value as NewTaskForm["priority"],
                }))
              }
              className="bg-gray-700/60 border border-gray-600/40 rounded px-1.5 py-0.5 text-xs text-gray-300 outline-none"
            >
              <option value="">priority</option>
              <option value="HIGH">HIGH</option>
              <option value="MED">MED</option>
              <option value="LOW">LOW</option>
            </select>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={createTask}
              className="text-xs px-2.5 py-1 rounded bg-blue-600/30 border border-blue-500/40 text-blue-300 hover:bg-blue-600/50 transition-colors"
            >
              Add Task
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="text-xs px-2.5 py-1 rounded border border-gray-600 text-gray-500 hover:text-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* 3-column kanban */}
      <div className="flex-1 grid grid-cols-3 gap-2 min-h-0 overflow-hidden">
        {/* Planned */}
        <div className="flex flex-col min-h-0">
          <div className="flex items-center gap-1.5 mb-1.5 shrink-0">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Planned
            </span>
            <span className="text-xs text-gray-700">{planned.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
            {planned.length === 0 && (
              <p className="text-gray-700 text-xs text-center mt-8">No tasks</p>
            )}
            {planned.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                onStatusChange={updateStatus}
                onDelete={deleteTask}
              />
            ))}
          </div>
        </div>

        {/* Executing */}
        <div className="flex flex-col min-h-0">
          <div className="flex items-center gap-1.5 mb-1.5 shrink-0">
            <span className="text-xs font-semibold text-blue-400/70 uppercase tracking-wider">
              Executing
            </span>
            {executing.length > 0 && (
              <span className="text-xs w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center leading-none">
                {executing.length}
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
            {executing.length === 0 && (
              <p className="text-gray-700 text-xs text-center mt-8">
                Nothing running
              </p>
            )}
            {executing.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                onStatusChange={updateStatus}
                onDelete={deleteTask}
              />
            ))}
          </div>
        </div>

        {/* Done */}
        <div className="flex flex-col min-h-0">
          <div className="flex items-center gap-1.5 mb-1 shrink-0">
            <span className="text-xs font-semibold text-green-400/60 uppercase tracking-wider">
              Done
            </span>
            <span className="text-xs text-gray-700">{done.length}</span>
          </div>
          {usedCats.length > 1 && (
            <div className="flex gap-1 flex-wrap mb-1.5 shrink-0">
              <button
                onClick={() => setCatFilter("all")}
                className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                  catFilter === "all"
                    ? "bg-gray-600 text-gray-200"
                    : "text-gray-600 hover:text-gray-400"
                }`}
              >
                all
              </button>
              {usedCats.map((c) => (
                <button
                  key={c}
                  onClick={() => setCatFilter(c)}
                  className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                    catFilter === c
                      ? "bg-gray-600 text-gray-200"
                      : "text-gray-600 hover:text-gray-400"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
            {visibleDone.length === 0 && (
              <p className="text-gray-700 text-xs text-center mt-8">
                No completed tasks
              </p>
            )}
            {visibleDone.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                onStatusChange={updateStatus}
                onDelete={deleteTask}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
