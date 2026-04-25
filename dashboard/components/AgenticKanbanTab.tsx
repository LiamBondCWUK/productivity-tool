"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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

interface AKProject {
  id: string;
  name: string;
  description?: string;
  columns?: Column[];
}

interface ExecutionProcess {
  id: string;
  label: string;
  status: string;
  started_at: number;
  task_id: string;
}

interface CampaignSubtask {
  id: string;
  title: string;
  status: string;
  agent: string;
}

interface PendingCampaign {
  coordinatorRunId: string;
  taskTitle: string;
  subtasks: CampaignSubtask[];
  coordinatorRunning: boolean;
}

interface PersonalTask {
  id: string;
  title: string;
  notes: string;
  priority: "urgent" | "high" | "medium" | "low" | null;
  createdAt: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PERSONAL_TAB_ID = "__personal__";
const PERSONAL_STORAGE_KEY = "ak-personal-tasks";

// ============================================================================
// HELPERS
// ============================================================================

function getPriorityColor(priority: string | null): string {
  switch (priority?.toLowerCase()) {
    case "urgent": return "bg-red-500/20 text-red-400 border-red-500/30";
    case "high":   return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    case "medium": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "low":    return "bg-slate-500/20 text-slate-400 border-slate-500/30";
    default:       return "";
  }
}

function formatElapsed(startedAt: number): string {
  const s = Math.floor((Date.now() - startedAt) / 1000);
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ============================================================================
// PERSONAL TASK VIEW
// ============================================================================

interface PersonalTaskViewProps {
  onMakeProject: (task: PersonalTask) => Promise<void>;
}

function PersonalTaskView({ onMakeProject }: PersonalTaskViewProps) {
  const [personalTasks, setPersonalTasks] = useState<PersonalTask[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem(PERSONAL_STORAGE_KEY) ?? "[]");
    } catch {
      return [];
    }
  });

  const [newTitle, setNewTitle] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Persist to localStorage on change
  useEffect(() => {
    localStorage.setItem(PERSONAL_STORAGE_KEY, JSON.stringify(personalTasks));
  }, [personalTasks]);

  const addTask = () => {
    const title = newTitle.trim();
    if (!title) return;
    const task: PersonalTask = {
      id: crypto.randomUUID(),
      title,
      notes: "",
      priority: null,
      createdAt: Date.now(),
    };
    setPersonalTasks((prev) => [task, ...prev]);
    setNewTitle("");
    inputRef.current?.focus();
  };

  const updateTask = (id: string, patch: Partial<PersonalTask>) => {
    setPersonalTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch } : t))
    );
  };

  const deleteTask = (id: string) => {
    setPersonalTasks((prev) => prev.filter((t) => t.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const handleMakeProject = async (task: PersonalTask) => {
    setPromotingId(task.id);
    try {
      await onMakeProject(task);
      setPersonalTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch {
      // error handled by parent
    } finally {
      setPromotingId(null);
    }
  };

  const priorities: Array<PersonalTask["priority"]> = [null, "urgent", "high", "medium", "low"];

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Quick-add input */}
      <div className="flex gap-2 shrink-0">
        <input
          ref={inputRef}
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTask()}
          placeholder="Capture a task or idea…"
          className="flex-1 text-sm px-3 py-2 bg-gray-800 border border-gray-700/50 rounded-md text-gray-100 placeholder-gray-500 outline-none focus:border-blue-500/50"
        />
        <button
          onClick={addTask}
          disabled={!newTitle.trim()}
          className="px-3 py-2 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-md transition-colors"
        >
          Add
        </button>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-2">
        {personalTasks.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-600 text-sm">
              No personal tasks yet — add one above
            </p>
          </div>
        )}

        {personalTasks.map((task) => {
          const expanded = expandedId === task.id;
          return (
            <div
              key={task.id}
              className="bg-gray-800/60 border border-gray-700/50 rounded-md p-3 hover:border-gray-600/50 transition-colors"
            >
              <div className="flex items-start gap-2">
                {/* Expand toggle */}
                <button
                  onClick={() => setExpandedId(expanded ? null : task.id)}
                  className="text-gray-600 hover:text-gray-400 mt-0.5 shrink-0 text-[10px]"
                >
                  {expanded ? "▼" : "▶"}
                </button>

                {/* Title */}
                <input
                  value={task.title}
                  onChange={(e) => updateTask(task.id, { title: e.target.value })}
                  className="flex-1 text-sm text-gray-100 bg-transparent outline-none min-w-0"
                />

                {/* Priority pill */}
                <select
                  value={task.priority ?? ""}
                  onChange={(e) =>
                    updateTask(task.id, {
                      priority: (e.target.value as PersonalTask["priority"]) || null,
                    })
                  }
                  className="text-[10px] bg-gray-700/50 border border-gray-600/40 rounded px-1 py-0.5 text-gray-300 outline-none"
                >
                  <option value="">—</option>
                  {priorities.slice(1).map((p) => (
                    <option key={p} value={p!}>
                      {p}
                    </option>
                  ))}
                </select>

                {/* Priority badge */}
                {task.priority && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0 ${getPriorityColor(task.priority)}`}
                  >
                    {task.priority}
                  </span>
                )}

                {/* Actions */}
                <button
                  onClick={() => handleMakeProject(task)}
                  disabled={promotingId === task.id}
                  className="px-2 py-1 text-[10px] bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded transition-colors whitespace-nowrap"
                >
                  {promotingId === task.id ? "…" : "Make Project"}
                </button>
                <button
                  onClick={() => deleteTask(task.id)}
                  className="text-gray-600 hover:text-red-400 text-xs transition-colors px-1"
                >
                  ✕
                </button>
              </div>

              {expanded && (
                <div className="mt-2 ml-5">
                  <textarea
                    value={task.notes}
                    onChange={(e) => updateTask(task.id, { notes: e.target.value })}
                    placeholder="Notes, context, or next steps…"
                    rows={3}
                    className="w-full text-xs text-gray-300 bg-gray-700/40 border border-gray-600/30 rounded px-2 py-1.5 outline-none focus:border-blue-500/30 resize-none placeholder-gray-600"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// TASK CARD
// ============================================================================

interface TaskCardProps {
  task: AKTask;
  isChild: boolean;
  dmRunning: boolean;
  onDMClick: (taskId: string, taskTitle: string) => Promise<void>;
}

function TaskCard({ task, isChild, dmRunning, onDMClick }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  const [dmLoading, setDmLoading] = useState(false);

  const handleDMClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDmLoading(true);
    try {
      await onDMClick(task.id, task.title);
    } finally {
      setDmLoading(false);
    }
  };

  const busy = dmLoading || dmRunning;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      {...attributes}
      {...listeners}
      className={`bg-gray-800 rounded-md p-3 mb-2 cursor-grab active:cursor-grabbing hover:border-gray-600/60 transition-colors ${
        isChild
          ? "ml-4 border-l-2 border-l-blue-600/50 border border-gray-700/30"
          : "border border-gray-700/50"
      }`}
    >
      <p className="text-gray-100 text-sm font-medium leading-snug mb-2">{task.title}</p>

      {task.description && (
        <p className="text-gray-400 text-xs mb-2 line-clamp-2">{task.description}</p>
      )}

      <div className="flex flex-wrap gap-1.5 items-center mb-2">
        {task.priority && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${getPriorityColor(task.priority)}`}>
            {task.priority}
          </span>
        )}
        {task.agent && (
          <span className="text-[10px] px-1.5 py-0.5 rounded border bg-purple-500/20 text-purple-400 border-purple-500/30">
            {task.agent === "CLAUDE_CODE" ? "Claude" : "Copilot"}
          </span>
        )}
        {task.coordinator_run_id && !busy && (
          <span className="text-[10px] px-1.5 py-0.5 rounded border bg-green-500/20 text-green-400 border-green-500/30">
            DM&apos;d
          </span>
        )}
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleDMClick}
          disabled={busy}
          className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors flex items-center gap-1"
        >
          {busy ? (
            <>
              <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              {dmLoading ? "Launching…" : "Running…"}
            </>
          ) : "DM"}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// COLUMN WRAPPER
// ============================================================================

interface ColumnWrapperProps {
  column: Column;
  tasks: AKTask[];
  allTasks: AKTask[];
  dmRunning: Record<string, boolean>;
  onDMClick: (taskId: string, taskTitle: string) => Promise<void>;
}

function ColumnWrapper({ column, tasks, allTasks, dmRunning, onDMClick }: ColumnWrapperProps) {
  const taskIds = tasks.map((t) => t.id);

  const ordered = useMemo(() => {
    const allTaskIds = new Set(allTasks.map((t) => t.id));
    const roots = tasks.filter(
      (t) => !t.parent_issue_id || !allTaskIds.has(t.parent_issue_id)
    );
    const result: Array<{ task: AKTask; isChild: boolean }> = [];

    for (const root of roots) {
      result.push({ task: root, isChild: false });
      tasks
        .filter((t) => t.parent_issue_id === root.id)
        .forEach((child) => result.push({ task: child, isChild: true }));
    }

    const seen = new Set(result.map((r) => r.task.id));
    tasks
      .filter((t) => !seen.has(t.id))
      .forEach((t) => result.push({ task: t, isChild: !!t.parent_issue_id }));

    return result;
  }, [tasks, allTasks]);

  return (
    <div className="flex flex-col flex-1 min-w-72 bg-gray-800/50 border border-gray-700/50 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 shrink-0 border-b border-gray-700/50">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-300">
          {column.name}
        </span>
        <span className="text-xs text-gray-500">{tasks.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {ordered.length === 0 && (
            <p className="text-gray-600 text-xs text-center py-4">Empty</p>
          )}
          {ordered.map(({ task, isChild }) => (
            <TaskCard
              key={task.id}
              task={task}
              isChild={isChild}
              dmRunning={dmRunning[task.id] ?? false}
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
      <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse shrink-0" />
      <span className="text-gray-300 max-w-[180px] truncate">{process.label}</span>
      <span className="text-gray-500 shrink-0">{formatElapsed(process.started_at)}</span>
      <button
        onClick={handleStop}
        disabled={stopping}
        className="ml-1 px-1.5 py-0.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-[10px] rounded transition-colors"
      >
        {stopping ? "…" : "Kill"}
      </button>
    </div>
  );
}

// ============================================================================
// CAMPAIGN REVIEW PANEL
// ============================================================================

interface CampaignEntryProps {
  taskId: string;
  campaign: PendingCampaign;
  onApprove: (coordinatorRunId: string, taskId: string) => Promise<void>;
  onReject: (coordinatorRunId: string, taskId: string) => Promise<void>;
}

function CampaignEntry({ taskId, campaign, onApprove, onReject }: CampaignEntryProps) {
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);

  const handle = async (action: "approve" | "reject") => {
    setLoading(action);
    try {
      if (action === "approve") await onApprove(campaign.coordinatorRunId, taskId);
      else await onReject(campaign.coordinatorRunId, taskId);
    } catch (e) {
      console.error(`Campaign ${action} failed:`, e);
    } finally {
      setLoading(null);
    }
  };

  const canAct = !campaign.coordinatorRunning && campaign.subtasks.length > 0;

  return (
    <div className="bg-gray-800/60 border border-amber-600/20 rounded-md p-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-200 mb-1.5 truncate">
            {campaign.taskTitle}
          </p>
          {campaign.coordinatorRunning ? (
            <p className="text-xs text-gray-500 flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 border-2 border-gray-500 border-t-white rounded-full animate-spin" />
              Coordinator running…
            </p>
          ) : campaign.subtasks.length === 0 ? (
            <p className="text-xs text-gray-500 italic">No sub-tasks created yet</p>
          ) : (
            <div className="flex flex-wrap gap-1 mt-1">
              {campaign.subtasks.map((sub) => (
                <span
                  key={sub.id}
                  className="text-[10px] px-1.5 py-0.5 bg-gray-700/60 border border-gray-600/40 rounded text-gray-300"
                >
                  {sub.title}
                </span>
              ))}
            </div>
          )}
        </div>

        {canAct && (
          <div className="flex gap-1.5 shrink-0">
            <button
              onClick={() => handle("reject")}
              disabled={!!loading}
              className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 rounded transition-colors"
            >
              {loading === "reject" ? "…" : "Reject"}
            </button>
            <button
              onClick={() => handle("approve")}
              disabled={!!loading}
              className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded transition-colors"
            >
              {loading === "approve" ? "…" : "Approve"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface CampaignReviewPanelProps {
  campaigns: Record<string, PendingCampaign>;
  onApprove: (coordinatorRunId: string, taskId: string) => Promise<void>;
  onReject: (coordinatorRunId: string, taskId: string) => Promise<void>;
}

function CampaignReviewPanel({ campaigns, onApprove, onReject }: CampaignReviewPanelProps) {
  const entries = Object.entries(campaigns);
  if (entries.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-amber-600/30 bg-amber-950/20 p-3 max-h-52 overflow-y-auto">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
        <span className="text-xs font-semibold text-amber-300 uppercase tracking-wide">
          Awaiting Approval ({entries.length})
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {entries.map(([taskId, campaign]) => (
          <CampaignEntry
            key={campaign.coordinatorRunId}
            taskId={taskId}
            campaign={campaign}
            onApprove={onApprove}
            onReject={onReject}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// PROJECT TABS
// ============================================================================

interface ProjectTabsProps {
  projects: AKProject[];
  activeProjectId: string | null;
  onSelect: (projectId: string) => void;
  onCreateProject: (name: string, description?: string) => Promise<AKProject & { columns: Column[] }>;
}

function ProjectTabs({ projects, activeProjectId, onSelect, onCreateProject }: ProjectTabsProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      await onCreateProject(name);
      setNewName("");
      setCreating(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto pb-0.5">
      {/* Personal tab — always first */}
      <button
        onClick={() => onSelect(PERSONAL_TAB_ID)}
        className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap transition-colors ${
          activeProjectId === PERSONAL_TAB_ID
            ? "bg-purple-600 text-white"
            : "bg-gray-800/60 border border-gray-700/50 text-gray-400 hover:text-gray-200 hover:border-gray-600"
        }`}
      >
        Personal
      </button>

      <span className="text-gray-700 text-xs shrink-0">|</span>

      {/* AK projects */}
      {projects.map((project) => (
        <button
          key={project.id}
          onClick={() => onSelect(project.id)}
          className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap transition-colors ${
            activeProjectId === project.id
              ? "bg-blue-600 text-white"
              : "bg-gray-800/60 border border-gray-700/50 text-gray-400 hover:text-gray-200 hover:border-gray-600"
          }`}
        >
          {project.name}
        </button>
      ))}

      {creating ? (
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") { setCreating(false); setNewName(""); }
            }}
            placeholder="Project name"
            className="text-xs px-2 py-1 bg-gray-800 border border-blue-500/50 rounded text-gray-100 placeholder-gray-500 outline-none w-36"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || saving}
            className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded"
          >
            {saving ? "…" : "Add"}
          </button>
          <button
            onClick={() => { setCreating(false); setNewName(""); }}
            className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="px-2 py-1 text-xs bg-gray-800/60 border border-gray-700/50 text-gray-500 hover:text-gray-300 hover:border-gray-600 rounded-md transition-colors"
        >
          + New
        </button>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function AgenticKanbanTab() {
  const [projects, setProjects] = useState<AKProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>(PERSONAL_TAB_ID);
  const [columns, setColumns] = useState<Column[]>([]);
  const [tasks, setTasks] = useState<AKTask[]>([]);
  const [processes, setProcesses] = useState<ExecutionProcess[]>([]);
  const [pendingCampaigns, setPendingCampaigns] = useState<Record<string, PendingCampaign>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [dmRunning, setDmRunning] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [backendOffline, setBackendOffline] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Refs for stable closures in setInterval callbacks
  const pendingCampaignsRef = useRef(pendingCampaigns);
  pendingCampaignsRef.current = pendingCampaigns;

  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  const isPersonal = activeProjectId === PERSONAL_TAB_ID;

  // ─── Load board for a project ───────────────────────────────────────────

  const loadProject = useCallback(async (projectId: string) => {
    const [detailRes, tasksRes] = await Promise.all([
      fetch(`/api/ak-proxy/ak/projects/${projectId}`),
      fetch(`/api/ak-proxy/ak/tasks?project_id=${encodeURIComponent(projectId)}`),
    ]);

    if (!detailRes.ok) throw new Error("Failed to fetch project");
    if (!tasksRes.ok) throw new Error("Failed to fetch tasks");

    const detail: AKProject & { columns: Column[] } = await detailRes.json();
    const taskList: AKTask[] = await tasksRes.json();

    setColumns(detail.columns ?? []);
    setTasks(Array.isArray(taskList) ? taskList : []);
  }, []);

  // ─── Init ───────────────────────────────────────────────────────────────

  const initProjects = useCallback(async () => {
    try {
      setLoading(true);
      setBackendOffline(false);
      setError(null);

      const res = await fetch("/api/ak-discover", { method: "POST" });
      if (!res.ok) throw new Error("Failed to discover projects");

      const list: AKProject[] = await res.json();
      const projectList = Array.isArray(list) ? list : [];
      setProjects(projectList);

      // If currently viewing a real project, reload it
      if (activeProjectId !== PERSONAL_TAB_ID) {
        const stillExists = projectList.find((p) => p.id === activeProjectId);
        if (stillExists) {
          await loadProject(activeProjectId);
        } else if (projectList.length > 0) {
          const preferred =
            projectList.find((p) => p.name.toLowerCase().includes("command center")) ??
            projectList[0];
          setActiveProjectId(preferred.id);
          await loadProject(preferred.id);
        }
      }
    } catch (e) {
      if (e instanceof TypeError) {
        setBackendOffline(true);
      } else {
        setError(e instanceof Error ? e.message : "Failed to initialize");
      }
    } finally {
      setLoading(false);
    }
  }, [activeProjectId, loadProject]);

  useEffect(() => {
    initProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  // ─── Switch project ─────────────────────────────────────────────────────

  const handleSelectProject = useCallback(
    async (projectId: string) => {
      if (projectId === activeProjectId) return;
      setActiveProjectId(projectId);
      setPendingCampaigns({});
      setDmRunning({});

      if (projectId === PERSONAL_TAB_ID) {
        setColumns([]);
        setTasks([]);
        return;
      }

      setColumns([]);
      setTasks([]);
      try {
        await loadProject(projectId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load project");
      }
    },
    [activeProjectId, loadProject]
  );

  // ─── Create project (from New tab or from Personal "Make Project") ──────

  const handleCreateProject = useCallback(
    async (name: string, description = "") => {
      const res = await fetch("/api/ak-proxy/ak/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      if (!res.ok) throw new Error("Failed to create project");

      const newProject: AKProject & { columns: Column[] } = await res.json();
      setProjects((prev) => [...prev, newProject]);
      setActiveProjectId(newProject.id);
      setColumns(newProject.columns ?? []);
      setTasks([]);
      setPendingCampaigns({});
      setDmRunning({});
      return newProject;
    },
    []
  );

  // ─── Make Project from personal task ───────────────────────────────────

  const handleMakeProject = useCallback(
    async (task: PersonalTask) => {
      const newProject = await handleCreateProject(task.title, task.notes);

      // If the personal task has notes, create a task in the backlog
      if (task.notes.trim() && newProject.columns) {
        const backlogCol = (newProject.columns as Column[]).find(
          (c) => c.name === "Backlog"
        );
        if (backlogCol) {
          await fetch("/api/ak-proxy/ak/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: task.title,
              description: task.notes,
              column_id: backlogCol.id,
              priority: task.priority ?? "medium",
            }),
          });
          await loadProject(newProject.id);
        }
      }
    },
    [handleCreateProject, loadProject]
  );

  // ─── Poll execution processes ───────────────────────────────────────────

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/ak-proxy/execution-processes");
        if (!res.ok) return;
        const json = await res.json();
        const procs: ExecutionProcess[] = json?.data ?? (Array.isArray(json) ? json : []);
        setProcesses(procs);

        const runningIds = new Set(procs.map((p) => p.id));

        setPendingCampaigns((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const [taskId, campaign] of Object.entries(next)) {
            const isRunning = runningIds.has(campaign.coordinatorRunId);
            if (campaign.coordinatorRunning !== isRunning) {
              next[taskId] = { ...campaign, coordinatorRunning: isRunning };
              changed = true;
            }
          }
          return changed ? next : prev;
        });

        setDmRunning((prev) => {
          const currentTasks = tasksRef.current;
          let changed = false;
          const next = { ...prev };
          for (const taskId of Object.keys(next)) {
            const task = currentTasks.find((t) => t.id === taskId);
            if (task?.coordinator_run_id && !runningIds.has(task.coordinator_run_id)) {
              if (!pendingCampaignsRef.current[taskId]) {
                delete next[taskId];
                changed = true;
              }
            }
          }
          return changed ? next : prev;
        });
      } catch {
        // silent
      }
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, []); // stable — reads state via refs

  // ─── Poll campaign status ───────────────────────────────────────────────

  useEffect(() => {
    const poll = async () => {
      const campaigns = pendingCampaignsRef.current;
      if (Object.keys(campaigns).length === 0) return;

      for (const [taskId, campaign] of Object.entries(campaigns)) {
        try {
          const res = await fetch(
            `/api/ak-proxy/ak/tasks/campaigns/${encodeURIComponent(campaign.coordinatorRunId)}`
          );
          if (!res.ok) continue;
          const data = await res.json();
          const subtasks: CampaignSubtask[] = data?.subtasks ?? [];

          setPendingCampaigns((prev) => {
            if (!prev[taskId] || prev[taskId].subtasks.length === subtasks.length) return prev;
            return { ...prev, [taskId]: { ...prev[taskId], subtasks } };
          });
        } catch {
          // silent
        }
      }
    };

    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, []);

  // ─── Sync from intake ───────────────────────────────────────────────────

  const handleSync = useCallback(async () => {
    try {
      setSyncing(true);
      setSyncStatus(null);
      const res = await fetch("/api/ak-sync", { method: "POST" });
      if (!res.ok) throw new Error("Sync failed");
      const result: { synced: number } = await res.json();
      setSyncStatus(`Synced ${result.synced} new cards`);
      await initProjects();
      setTimeout(() => setSyncStatus(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }, [initProjects]);

  // ─── DM coordinator ─────────────────────────────────────────────────────

  const handleDMClick = useCallback(async (taskId: string, taskTitle: string) => {
    setDmRunning((prev) => ({ ...prev, [taskId]: true }));
    try {
      const res = await fetch(
        `/api/ak-proxy/ak/tasks/${encodeURIComponent(taskId)}/coordinator`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ auto_dispatch: true, approval_required: true }),
        }
      );

      if (!res.ok) throw new Error("Failed to launch coordinator");

      const result = await res.json();
      const coordinatorRunId =
        result?.coordinator_run_id ?? result?.data?.coordinator_run_id;

      if (coordinatorRunId) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId ? { ...t, coordinator_run_id: coordinatorRunId } : t
          )
        );
        setPendingCampaigns((prev) => ({
          ...prev,
          [taskId]: {
            coordinatorRunId,
            taskTitle,
            subtasks: [],
            coordinatorRunning: true,
          },
        }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to launch coordinator");
      setDmRunning((prev) => {
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
    }
  }, []);

  // ─── DM All Backlog ─────────────────────────────────────────────────────

  const handleDMAllBacklog = useCallback(async () => {
    const backlogCol = columns.find((c) => c.name === "Backlog");
    if (!backlogCol) return;

    const eligible = tasks.filter(
      (t) =>
        t.column_id === backlogCol.id &&
        !t.coordinator_run_id &&
        !t.parent_issue_id &&
        !dmRunning[t.id]
    );

    for (const task of eligible) {
      await handleDMClick(task.id, task.title);
    }
  }, [columns, tasks, dmRunning, handleDMClick]);

  // ─── Approve campaign ───────────────────────────────────────────────────

  const handleApprove = useCallback(
    async (coordinatorRunId: string, taskId: string) => {
      const res = await fetch(
        `/api/ak-proxy/ak/tasks/campaigns/${encodeURIComponent(coordinatorRunId)}/approve`,
        { method: "POST" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to approve");
      }
      setPendingCampaigns((prev) => { const n = { ...prev }; delete n[taskId]; return n; });
      setDmRunning((prev) => { const n = { ...prev }; delete n[taskId]; return n; });
      const pid = activeProjectId !== PERSONAL_TAB_ID ? activeProjectId : null;
      if (pid) { try { await loadProject(pid); } catch { /* silent */ } }
    },
    [activeProjectId, loadProject]
  );

  // ─── Reject campaign ────────────────────────────────────────────────────

  const handleReject = useCallback(
    async (coordinatorRunId: string, taskId: string) => {
      const res = await fetch(
        `/api/ak-proxy/ak/tasks/campaigns/${encodeURIComponent(coordinatorRunId)}/reject`,
        { method: "POST" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to reject");
      }
      setPendingCampaigns((prev) => { const n = { ...prev }; delete n[taskId]; return n; });
      setDmRunning((prev) => { const n = { ...prev }; delete n[taskId]; return n; });
    },
    []
  );

  // ─── Stop process ───────────────────────────────────────────────────────

  const handleStopProcess = useCallback(async (processId: string) => {
    const res = await fetch(
      `/api/ak-proxy/execution-processes/${encodeURIComponent(processId)}/stop`,
      { method: "POST" }
    );
    if (!res.ok) throw new Error("Failed to stop process");
    setProcesses((prev) => prev.filter((p) => p.id !== processId));
  }, []);

  // ─── Drag and drop ──────────────────────────────────────────────────────

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      if (!over) return;

      const taskId = active.id as string;
      const newColumnId = over.id as string;
      const task = tasks.find((t) => t.id === taskId);
      if (!task || task.column_id === newColumnId) return;

      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, column_id: newColumnId } : t))
      );

      try {
        const res = await fetch(
          `/api/ak-proxy/ak/tasks/${encodeURIComponent(taskId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ column_id: newColumnId }),
          }
        );
        if (!res.ok) throw new Error("Failed to move task");
      } catch (e) {
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, column_id: task.column_id } : t))
        );
        setError(e instanceof Error ? e.message : "Failed to move task");
      }
    },
    [tasks]
  );

  // ─── Derived state ──────────────────────────────────────────────────────

  const tasksByColumn = useMemo(() => {
    const map: Record<string, AKTask[]> = {};
    columns.forEach((col) => {
      map[col.id] = tasks
        .filter((t) => t.column_id === col.id)
        .sort((a, b) => a.position - b.position);
    });
    return map;
  }, [columns, tasks]);

  const backlogRootCount = useMemo(() => {
    const col = columns.find((c) => c.name === "Backlog");
    if (!col) return 0;
    return (tasksByColumn[col.id] ?? []).filter(
      (t) => !t.coordinator_run_id && !t.parent_issue_id && !dmRunning[t.id]
    ).length;
  }, [columns, tasksByColumn, dmRunning]);

  const hasPendingCampaigns = Object.keys(pendingCampaigns).length > 0;

  // ─── Render: Loading / offline ──────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400 text-sm">Loading Agentic Kanban…</p>
      </div>
    );
  }

  if (backendOffline) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-red-400 text-sm mb-2">AK backend offline — start with:</p>
          <code className="text-xs text-gray-400 bg-gray-800/50 px-3 py-2 rounded inline-block">
            pm2 start ecosystem.config.js
          </code>
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full p-4 gap-3 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0 gap-3">
        <h2 className="text-lg font-semibold text-gray-100">Agentic Kanban</h2>
        {!isPersonal && (
          <div className="flex items-center gap-2">
            {backlogRootCount > 0 && (
              <button
                onClick={handleDMAllBacklog}
                className="px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
              >
                DM All Backlog ({backlogRootCount})
              </button>
            )}
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
              ) : "Sync from intake"}
            </button>
            {syncStatus && (
              <span className="text-xs text-green-400">{syncStatus}</span>
            )}
          </div>
        )}
      </div>

      {/* Project tabs */}
      <ProjectTabs
        projects={projects}
        activeProjectId={activeProjectId}
        onSelect={handleSelectProject}
        onCreateProject={handleCreateProject}
      />

      {error && (
        <p className="text-amber-400 text-xs shrink-0">{error}</p>
      )}

      {/* Personal inbox */}
      {isPersonal ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <PersonalTaskView onMakeProject={handleMakeProject} />
        </div>
      ) : (
        <>
          {/* Kanban board */}
          <DndContext
            collisionDetection={closestCorners}
            onDragEnd={handleDragEnd}
            onDragStart={(event) => setActiveId(event.active.id as string)}
            onDragCancel={() => setActiveId(null)}
          >
            <div className="flex gap-3 flex-1 min-h-0 overflow-x-auto">
              {columns.length === 0 ? (
                <div className="flex items-center justify-center w-full">
                  <p className="text-gray-500 text-sm">
                    {projects.length === 0
                      ? "No projects — sync from intake or create one above"
                      : "Loading board…"}
                  </p>
                </div>
              ) : (
                columns
                  .slice()
                  .sort((a, b) => a.position - b.position)
                  .map((col) => (
                    <ColumnWrapper
                      key={col.id}
                      column={col}
                      tasks={tasksByColumn[col.id] ?? []}
                      allTasks={tasks}
                      dmRunning={dmRunning}
                      onDMClick={handleDMClick}
                    />
                  ))
              )}
            </div>

            <DragOverlay>
              {activeId ? (
                <div className="bg-gray-800 border border-blue-500/50 rounded-md p-3 shadow-xl max-w-xs opacity-95">
                  <p className="text-sm text-gray-100">
                    {tasks.find((t) => t.id === activeId)?.title}
                  </p>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          {/* Campaign approval panel */}
          {hasPendingCampaigns && (
            <CampaignReviewPanel
              campaigns={pendingCampaigns}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          )}

          {/* Running agents footer */}
          {processes.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap shrink-0 pt-2 border-t border-gray-700/50">
              <span className="text-xs text-gray-500 shrink-0">Running:</span>
              {processes.map((proc) => (
                <ProcessPill key={proc.id} process={proc} onStop={handleStopProcess} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
