"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  closestCorners,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ============================================================================
// TYPES
// ============================================================================

interface Column {
  id: string;
  name: string;
  position: number;
}

interface AKTask {
  id: string;
  column_id: string;
  title: string;
  description: string;
  priority: string | null;
  agent: string | null;
  coordinator_run_id: string | null;
  parent_issue_id: string | null;
  position: number;
  created_at: number;
}

interface Project {
  id: string;
  name: string;
  columns: Column[];
}

interface ExecutionProcess {
  id: string;
  label: string;
  status: string;
  started_at: number;
  task_id: string;
}

// ============================================================================
// PRIORITY COLORS
// ============================================================================

function getPriorityColor(priority: string | null): string {
  if (!priority) return "";
  switch (priority.toLowerCase()) {
    case "urgent":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    case "high":
      return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    case "medium":
      return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "low":
      return "bg-slate-500/20 text-slate-400 border-slate-500/30";
    default:
      return "";
  }
}

// ============================================================================
// TASK CARD COMPONENT
// ============================================================================

interface TaskCardProps {
  task: AKTask;
  dmRunning: boolean;
  onDMClick: (taskId: string) => Promise<void>;
}

function TaskCard({ task, dmRunning, onDMClick }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [dmLoading, setDmLoading] = useState(false);

  const handleDMClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDmLoading(true);
    try {
      await onDMClick(task.id);
    } finally {
      setDmLoading(false);
    }
  };

  const priorityColor = task.priority ? getPriorityColor(task.priority) : "";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="bg-gray-800 border border-gray-700/50 rounded-md p-3 mb-2 cursor-grab active:cursor-grabbing group hover:border-gray-600/50 transition-colors"
    >
      {/* Title */}
      <p className="text-gray-100 text-sm font-medium leading-snug mb-2">
        {task.title}
      </p>

      {/* Description (if present) */}
      {task.description && (
        <p className="text-gray-400 text-xs mb-2 line-clamp-2">
          {task.description}
        </p>
      )}

      {/* Parent indicator */}
      {task.parent_issue_id && (
        <div className="text-xs text-gray-500 mb-2 pl-2 border-l-2 border-gray-600 italic">
          Parent: {task.parent_issue_id}
        </div>
      )}

      {/* Badges row */}
      <div className="flex flex-wrap gap-1.5 items-center mb-2">
        {/* Priority badge */}
        {task.priority && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${priorityColor}`}
          >
            {task.priority}
          </span>
        )}

        {/* Agent badge */}
        {task.agent && (
          <span className="text-[10px] px-1.5 py-0.5 rounded border bg-purple-500/20 text-purple-400 border-purple-500/30">
            {task.agent}
          </span>
        )}
      </div>

      {/* DM button */}
      <div className="flex justify-end gap-1">
        <button
          onClick={handleDMClick}
          disabled={dmRunning || dmLoading}
          className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors flex items-center gap-1"
        >
          {dmLoading ? (
            <>
              <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              DM…
            </>
          ) : dmRunning ? (
            <>
              <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Running…
            </>
          ) : (
            "DM"
          )}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// DROPPABLE COLUMN WRAPPER
// ============================================================================

interface ColumnWrapperProps {
  column: Column;
  tasks: AKTask[];
  dmRunning: Record<string, boolean>;
  onDMClick: (taskId: string) => Promise<void>;
}

function ColumnWrapper({
  column,
  tasks,
  dmRunning,
  onDMClick,
}: ColumnWrapperProps) {
  const taskIds = tasks.map((t) => t.id);

  return (
    <div className="flex flex-col flex-1 min-w-80 bg-gray-800/50 border border-gray-700/50 rounded-lg overflow-hidden">
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2 shrink-0 border-b border-gray-700/50">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-300">
          {column.name}
        </span>
        <span className="text-xs text-gray-500">{tasks.length}</span>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-2">
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {tasks.length === 0 && (
            <p className="text-gray-600 text-xs text-center py-4">Empty</p>
          )}
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              dmRunning={dmRunning[task.id] || false}
              onDMClick={onDMClick}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

// ============================================================================
// PROCESS PILL
// ============================================================================

interface ProcessPillProps {
  process: ExecutionProcess;
  onStop: (processId: string) => Promise<void>;
}

function ProcessPill({ process, onStop }: ProcessPillProps) {
  const [stopping, setStopping] = useState(false);
  const elapsed = Math.floor((Date.now() - process.started_at) / 1000);

  const handleStop = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setStopping(true);
    try {
      await onStop(process.id);
    } finally {
      setStopping(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-2 px-2 py-1 text-xs bg-gray-800 border border-gray-700/50 rounded">
      <span className="text-gray-300">{process.label}</span>
      <span className="text-gray-500">
        {Math.floor(elapsed / 60)}m {elapsed % 60}s
      </span>
      <button
        onClick={handleStop}
        disabled={stopping}
        className="ml-1 px-1.5 py-0.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-[10px] rounded transition-colors"
      >
        {stopping ? "…" : "Stop"}
      </button>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function AgenticKanbanTab() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [tasks, setTasks] = useState<AKTask[]>([]);
  const [processes, setProcesses] = useState<ExecutionProcess[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [dmRunning, setDmRunning] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [backendOffline, setBackendOffline] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  // ========================================================================
  // INITIALIZATION: Fetch Command Center project
  // ========================================================================

  useEffect(() => {
    const initProject = async () => {
      try {
        setLoading(true);
        setBackendOffline(false);
        setError(null);

        const projectRes = await fetch("/api/ak-proxy/projects");
        if (!projectRes.ok) throw new Error("Failed to fetch projects");

        const projectList: Project[] = await projectRes.json();
        const commandCenter = projectList.find((p) =>
          p.name.toLowerCase().includes("command center")
        );

        if (!commandCenter) {
          setError("Command Center project not found");
          setLoading(false);
          return;
        }

        setProjectId(commandCenter.id);
        setColumns(commandCenter.columns);

        // Fetch tasks
        const tasksRes = await fetch(
          `/api/ak-proxy/tasks?project_id=${encodeURIComponent(commandCenter.id)}`
        );
        if (!tasksRes.ok) throw new Error("Failed to fetch tasks");

        const taskList: AKTask[] = await tasksRes.json();
        setTasks(taskList);

        setLoading(false);
      } catch (e) {
        if (e instanceof Error && e.message.includes("fetch")) {
          setBackendOffline(true);
        } else {
          setError(
            e instanceof Error ? e.message : "Failed to initialize kanban"
          );
        }
        setLoading(false);
      }
    };

    initProject();
  }, []);

  // ========================================================================
  // POLL EXECUTION PROCESSES
  // ========================================================================

  useEffect(() => {
    if (!projectId) return;

    const pollProcesses = async () => {
      try {
        const res = await fetch("/api/ak-proxy/execution-processes");
        if (!res.ok) return;

        const procs: ExecutionProcess[] = await res.json();
        setProcesses(procs);

        // Update dmRunning based on coordinator_run_id matching
        const dmMap: Record<string, boolean> = {};
        procs.forEach((proc) => {
          const task = tasks.find((t) => t.coordinator_run_id === proc.id);
          if (task) dmMap[task.id] = true;
        });
        setDmRunning(dmMap);
      } catch (e) {
        // Silent fail on poll — don't disrupt UI
      }
    };

    pollProcesses();
    const interval = setInterval(pollProcesses, 5000);
    return () => clearInterval(interval);
  }, [projectId, tasks]);

  // ========================================================================
  // SYNC CARDS FROM INTAKE
  // ========================================================================

  const handleSync = useCallback(async () => {
    try {
      setSyncing(true);
      setSyncStatus(null);

      const res = await fetch("/api/ak-sync", { method: "POST" });
      if (!res.ok) throw new Error("Sync failed");

      const result: { synced: number; skipped: number; projectId: string } =
        await res.json();
      setSyncStatus(`Synced ${result.synced} cards`);

      // Refresh tasks
      if (projectId) {
        const tasksRes = await fetch(
          `/api/ak-proxy/tasks?project_id=${encodeURIComponent(projectId)}`
        );
        if (tasksRes.ok) {
          const taskList: AKTask[] = await tasksRes.json();
          setTasks(taskList);
        }
      }

      // Clear status after 3s
      setTimeout(() => setSyncStatus(null), 3000);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to sync cards"
      );
    } finally {
      setSyncing(false);
    }
  }, [projectId]);

  // ========================================================================
  // LAUNCH DM COORDINATOR
  // ========================================================================

  const handleDMClick = useCallback(
    async (taskId: string) => {
      try {
        setDmRunning((prev) => ({ ...prev, [taskId]: true }));

        const res = await fetch(
          `/api/ak-proxy/tasks/${encodeURIComponent(taskId)}/coordinator`,
          { method: "POST", body: JSON.stringify({}) }
        );

        if (!res.ok) throw new Error("Failed to launch coordinator");

        const result: { coordinator_run_id: string } = await res.json();

        // Update task with coordinator_run_id
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? { ...t, coordinator_run_id: result.coordinator_run_id }
              : t
          )
        );
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Failed to launch coordinator"
        );
        setDmRunning((prev) => {
          const next = { ...prev };
          delete next[taskId];
          return next;
        });
      }
    },
    []
  );

  // ========================================================================
  // STOP EXECUTION PROCESS
  // ========================================================================

  const handleStopProcess = useCallback(async (processId: string) => {
    try {
      const res = await fetch(
        `/api/ak-proxy/execution-processes/${encodeURIComponent(processId)}/stop`,
        { method: "POST" }
      );

      if (!res.ok) throw new Error("Failed to stop process");

      setProcesses((prev) => prev.filter((p) => p.id !== processId));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to stop process"
      );
    }
  }, []);

  // ========================================================================
  // DRAG AND DROP HANDLER
  // ========================================================================

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;

      if (!over) return;

      const taskId = active.id as string;
      const newColumnId = over.id as string;

      const task = tasks.find((t) => t.id === taskId);
      if (!task || task.column_id === newColumnId) return;

      try {
        // Optimistic update
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId ? { ...t, column_id: newColumnId } : t
          )
        );

        // Send to API
        const res = await fetch(
          `/api/ak-proxy/tasks/${encodeURIComponent(taskId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ column_id: newColumnId }),
          }
        );

        if (!res.ok) throw new Error("Failed to move task");
      } catch (e) {
        // Revert on error
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId ? { ...t, column_id: task.column_id } : t
          )
        );
        setError(
          e instanceof Error ? e.message : "Failed to move task"
        );
      }
    },
    [tasks]
  );

  // ========================================================================
  // GROUP TASKS BY COLUMN
  // ========================================================================

  const tasksByColumn = useMemo(() => {
    const map: Record<string, AKTask[]> = {};
    columns.forEach((col) => {
      map[col.id] = tasks
        .filter((t) => t.column_id === col.id)
        .sort((a, b) => a.position - b.position);
    });
    return map;
  }, [columns, tasks]);

  // ========================================================================
  // RENDER: LOADING STATE
  // ========================================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400 text-sm">Loading Agentic Kanban…</p>
      </div>
    );
  }

  // ========================================================================
  // RENDER: BACKEND OFFLINE
  // ========================================================================

  if (backendOffline) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-red-400 text-sm mb-2">
            AK backend offline — start with:
          </p>
          <code className="text-xs text-gray-400 bg-gray-800/50 px-3 py-2 rounded inline-block">
            pm2 start ecosystem.config.js
          </code>
        </div>
      </div>
    );
  }

  // ========================================================================
  // RENDER: MAIN KANBAN
  // ========================================================================

  return (
    <div className="flex flex-col h-full p-4 gap-4 overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between shrink-0 gap-4">
        <h2 className="text-lg font-semibold text-gray-100">Agentic Kanban</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors flex items-center gap-1"
          >
            {syncing ? (
              <>
                <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Syncing…
              </>
            ) : (
              "Sync from intake"
            )}
          </button>
          {syncStatus && (
            <span className="text-xs text-green-400">{syncStatus}</span>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <p className="text-red-400 text-xs shrink-0">{error}</p>
      )}

      {/* Kanban columns */}
      <DndContext
        collisionDetection={closestCorners}
        onDragEnd={handleDragEnd}
        onDragStart={(event) => setActiveId(event.active.id as string)}
      >
        <div className="flex gap-4 flex-1 min-h-0 overflow-x-auto">
          {columns.map((col) => (
            <ColumnWrapper
              key={col.id}
              column={col}
              tasks={tasksByColumn[col.id] || []}
              dmRunning={dmRunning}
              onDMClick={handleDMClick}
            />
          ))}
        </div>
        <DragOverlay>
          {activeId ? (
            <div className="bg-gray-800 border border-blue-500/50 rounded-md p-3 shadow-lg max-w-sm">
              {tasks.find((t) => t.id === activeId)?.title}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Footer: Running agents */}
      {processes.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap shrink-0 pt-2 border-t border-gray-700/50">
          <span className="text-xs text-gray-500">Running agents:</span>
          {processes.map((proc) => (
            <ProcessPill
              key={proc.id}
              process={proc}
              onStop={handleStopProcess}
            />
          ))}
        </div>
      )}
    </div>
  );
}
