"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  PersonalProject,
  ProjectPhase,
  ProjectSuggestion,
  ProjectEntry,
  FeedbackItem,
} from "../types/dashboard";

type ViewMode = "overview" | "board" | "list";

interface MergedProject {
  name: string;
  path: string;
  registryPhase: ProjectPhase;
  lastCommit: string | null;
  lastCommitMsg: string | null;
  description: string | null;
  hasGit: boolean;
  hasClaude: boolean;
  hasPkg: boolean;
  personalId?: string;
  phase: ProjectPhase;
  completionPercent?: number;
  tags?: string[];
  suggestions?: ProjectSuggestion[];
  state?: string;
  crossProjectDeps?: string[];
  neglected?: string[];
}

interface ProjectsTabProps {
  projects: PersonalProject[];
  onPhaseChange: (projectId: string, phase: ProjectPhase) => Promise<void>;
  onAddTask: (
    suggestion: ProjectSuggestion,
    projectId: string,
    projectName: string,
  ) => Promise<void>;
  onRefetch: () => void;
  onRefresh?: () => Promise<void>;
}

const PHASES: ProjectPhase[] = ["Backlog", "Building", "Review", "Done"];

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/\\s+/g, "-");
}

function priorityColor(p: "HIGH" | "MED" | "LOW"): string {
  if (p === "HIGH") return "text-red-400";
  if (p === "MED") return "text-yellow-400";
  return "text-blue-400";
}

function RegistryProjectCard({
  project,
  onPhaseChange,
  onAddTask,
  onSelect,
  compact = false,
}: {
  project: MergedProject;
  onPhaseChange: (projectId: string, phase: ProjectPhase) => Promise<void>;
  onAddTask: (
    suggestion: ProjectSuggestion,
    projectId: string,
    projectName: string,
  ) => Promise<void>;
  onSelect?: (project: MergedProject) => void;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<ProjectPhase | null>(null);

  const handlePhaseChange = async (phase: ProjectPhase) => {
    if (!project.personalId) return;
    setLoadingPhase(phase);
    await onPhaseChange(project.personalId, phase);
    setLoadingPhase(null);
  };

  const phaseColors: Record<ProjectPhase, string> = {
    Backlog: "text-gray-400 border-gray-600",
    Building: "text-blue-400 border-blue-600",
    Review: "text-yellow-400 border-yellow-600",
    Done: "text-green-400 border-green-600",
  };

  return (
    <div
      className={`bg-gray-800/60 border border-gray-700/50 rounded-lg p-3 transition-colors ${
        onSelect ? "cursor-pointer hover:border-blue-500/50" : "hover:border-gray-600/50"
      }`}
      onClick={onSelect ? () => onSelect(project) : undefined}
    >      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-gray-100 truncate">
            {project.name}
          </span>
          <div className="flex gap-1 shrink-0">
            {project.hasClaude && (
              <span className="text-[10px] px-1 py-0.5 bg-purple-900/50 text-purple-300 rounded border border-purple-700/50">
                claude
              </span>
            )}
            {project.hasGit && (
              <span className="text-[10px] px-1 py-0.5 bg-gray-700/50 text-gray-400 rounded border border-gray-600/50">
                git
              </span>
            )}
            {project.hasPkg && (
              <span className="text-[10px] px-1 py-0.5 bg-gray-700/50 text-gray-400 rounded border border-gray-600/50">
                pkg
              </span>
            )}
          </div>
        </div>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${phaseColors[project.phase]}`}
        >
          {project.phase}
        </span>
      </div>

      {(project.state || project.description) && (
        <p className="text-xs text-gray-400 mb-2 line-clamp-2">
          {project.state || project.description}
        </p>
      )}

      {project.completionPercent !== undefined && (
        <div className="mb-2">
          <div className="flex justify-between items-center mb-0.5">
            <span className="text-[10px] text-gray-500">progress</span>
            <span className="text-[10px] text-gray-500">
              {project.completionPercent}%
            </span>
          </div>
          <div className="w-full bg-gray-700/50 rounded-full h-1">
            <div
              className="bg-blue-500/70 rounded-full h-1 transition-all"
              style={{ width: `${project.completionPercent}%` }}
            />
          </div>
        </div>
      )}

      {project.lastCommit && (
        <div className="text-[10px] text-gray-500 mb-2 truncate">
          {relativeTime(project.lastCommit)}
          {project.lastCommitMsg && (
            <span className="ml-1 text-gray-600">
              {"— "}{project.lastCommitMsg.slice(0, 60)}
            </span>
          )}
        </div>
      )}

      {project.suggestions && project.suggestions.length > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
        >
          {"💡 "}{project.suggestions.length}{" suggestion"}
          {project.suggestions.length !== 1 ? "s" : ""}
          {expanded ? " ▲" : " ▼"}
        </button>
      )}

      {expanded && (
        <div className="mt-2 space-y-2 border-t border-gray-700/50 pt-2">
          {project.suggestions && project.suggestions.length > 0 && (
            <div className="space-y-1">
              {project.suggestions.map((s, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className={`text-[10px] font-bold shrink-0 ${priorityColor(s.priority)}`}>
                    {s.priority}
                  </span>
                  <span className="text-[11px] text-gray-300 flex-1">
                    {s.action}
                  </span>
                  <span className="text-[10px] text-gray-500 shrink-0">
                    [{s.effort}]
                  </span>
                  {project.personalId && (
                    <button
                      onClick={() =>
                        onAddTask(s, project.personalId!, project.name)
                      }
                      className="text-[10px] text-green-400 hover:text-green-300 shrink-0"
                      title="Add to tasks"
                    >
                      +
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {project.crossProjectDeps && project.crossProjectDeps.length > 0 && (
            <div>
              <span className="text-[10px] text-gray-500 uppercase tracking-wide">
                deps
              </span>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {project.crossProjectDeps.map((dep, i) => (
                  <span
                    key={i}
                    className="text-[10px] px-1 py-0.5 bg-gray-700/50 text-gray-400 rounded"
                  >
                    {dep}
                  </span>
                ))}
              </div>
            </div>
          )}

          {project.neglected && project.neglected.length > 0 && (
            <div>
              <span className="text-[10px] text-gray-500 uppercase tracking-wide">
                neglected
              </span>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {project.neglected.map((item, i) => (
                  <span
                    key={i}
                    className="text-[10px] px-1 py-0.5 bg-yellow-900/30 text-yellow-500 rounded"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}

          {project.personalId && (
            <div className="flex gap-1 flex-wrap">
              {PHASES.map((p) => (
                <button
                  key={p}
                  onClick={() => handlePhaseChange(p)}
                  disabled={loadingPhase !== null || project.phase === p}
                  className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                    project.phase === p
                      ? "border-blue-600 text-blue-400 bg-blue-900/20"
                      : "border-gray-600 text-gray-500 hover:border-gray-500 hover:text-gray-400"
                  } disabled:opacity-50`}
                >
                  {loadingPhase === p ? "…" : p}
                </button>
              ))}
            </div>
          )}

          <div className="text-[10px] text-gray-600 font-mono truncate">
            {project.path}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Phase colours ───────────────────────────────────────────── */
const PHASE_PILL: Record<ProjectPhase, string> = {
  Backlog:  "text-gray-400  border-gray-600  bg-gray-800/40",
  Building: "text-blue-400  border-blue-600  bg-blue-900/20",
  Review:   "text-yellow-400 border-yellow-600 bg-yellow-900/20",
  Done:     "text-green-400  border-green-600  bg-green-900/20",
};

const PHASE_COL_HEADER: Record<ProjectPhase, string> = {
  Backlog:  "border-gray-600  text-gray-400",
  Building: "border-blue-600  text-blue-400",
  Review:   "border-yellow-600 text-yellow-400",
  Done:     "border-green-600  text-green-400",
};

/* ── Overview ────────────────────────────────────────────────── */
function OverviewView({
  merged,
  onSelect,
}: {
  merged: MergedProject[];
  onSelect: (p: MergedProject) => void;
}) {
  const phaseCounts = PHASES.reduce((acc, p) => {
    acc[p] = merged.filter((m) => m.phase === p).length;
    return acc;
  }, {} as Record<ProjectPhase, number>);

  const avgCompletion =
    merged.length === 0
      ? 0
      : Math.round(
          merged.reduce((s, m) => s + (m.completionPercent ?? 0), 0) / merged.length,
        );

  const recentlyActive = [...merged]
    .filter((m) => m.lastCommit)
    .sort((a, b) => new Date(b.lastCommit!).getTime() - new Date(a.lastCommit!).getTime())
    .slice(0, 5);

  return (
    <div className="p-4 space-y-6 overflow-y-auto h-full">
      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-gray-800/60 border border-gray-700/50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-gray-100">{merged.length}</div>
          <div className="text-[11px] text-gray-500 mt-0.5">Total</div>
        </div>
        {PHASES.map((ph) => (
          <div
            key={ph}
            className={`bg-gray-800/60 border rounded-lg p-3 text-center ${PHASE_COL_HEADER[ph]}`}
          >
            <div className="text-2xl font-bold">{phaseCounts[ph]}</div>
            <div className="text-[11px] mt-0.5 opacity-80">{ph}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-[11px] text-gray-500 mb-1">
          <span>Avg completion</span>
          <span>{avgCompletion}%</span>
        </div>
        <div className="w-full bg-gray-700/50 rounded-full h-2">
          <div
            className="bg-blue-500/70 rounded-full h-2 transition-all"
            style={{ width: `${avgCompletion}%` }}
          />
        </div>
      </div>

      {/* Phase breakdown bars */}
      <div className="space-y-2">
        <h3 className="text-[11px] text-gray-500 uppercase tracking-wider">Phase breakdown</h3>
        {PHASES.map((ph) => {
          const count = phaseCounts[ph];
          const pct = merged.length ? Math.round((count / merged.length) * 100) : 0;
          return (
            <div key={ph} className="flex items-center gap-3">
              <span className={`text-[11px] w-16 shrink-0 ${PHASE_COL_HEADER[ph].split(" ")[1]}`}>{ph}</span>
              <div className="flex-1 bg-gray-700/50 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full ${ph === "Backlog" ? "bg-gray-500" : ph === "Building" ? "bg-blue-500" : ph === "Review" ? "bg-yellow-500" : "bg-green-500"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-[11px] text-gray-500 w-8 text-right">{count}</span>
            </div>
          );
        })}
      </div>

      {/* Recently active */}
      {recentlyActive.length > 0 && (
        <div>
          <h3 className="text-[11px] text-gray-500 uppercase tracking-wider mb-2">Recently active</h3>
          <div className="space-y-1.5">
            {recentlyActive.map((p) => (
              <div
                key={p.name}
                onClick={() => onSelect(p)}
                className="flex items-center gap-3 p-2 bg-gray-800/40 rounded border border-gray-700/30 hover:border-blue-500/40 cursor-pointer transition-colors"
              >
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${PHASE_PILL[p.phase]}`}
                >
                  {p.phase}
                </span>
                <span className="text-sm text-gray-200 flex-1 truncate">{p.name}</span>
                <span className="text-[11px] text-gray-500 shrink-0">{relativeTime(p.lastCommit)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Board view ──────────────────────────────────────────────── */
function BoardView({
  merged,
  onPhaseChange,
  onAddTask,
  onSelect,
}: {
  merged: MergedProject[];
  onPhaseChange: (projectId: string, phase: ProjectPhase) => Promise<void>;
  onAddTask: (s: ProjectSuggestion, id: string, name: string) => Promise<void>;
  onSelect: (p: MergedProject) => void;
}) {
  return (
    <div className="flex gap-3 p-4 h-full overflow-x-auto">
      {PHASES.map((ph) => {
        const cards = merged.filter((m) => m.phase === ph);
        return (
          <div
            key={ph}
            className={`flex flex-col min-w-[220px] max-w-[280px] flex-1 rounded-lg border ${PHASE_COL_HEADER[ph]} bg-gray-900/40 overflow-hidden`}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/50 shrink-0">
              <span className={`text-xs font-semibold uppercase tracking-wide ${PHASE_COL_HEADER[ph].split(" ")[1]}`}>
                {ph}
              </span>
              <span className="text-[11px] text-gray-500">{cards.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {cards.length === 0 && (
                <p className="text-gray-600 text-xs text-center py-4">Empty</p>
              )}
              {cards.map((p) => (
                <RegistryProjectCard
                  key={p.name}
                  project={p}
                  onPhaseChange={onPhaseChange}
                  onAddTask={onAddTask}
                  onSelect={onSelect}
                  compact
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Project detail panel ────────────────────────────────────── */
function ProjectDetailPanel({
  project,
  onBack,
  onPhaseChange,
  onAddTask,
}: {
  project: MergedProject;
  onBack: () => void;
  onPhaseChange: (projectId: string, phase: ProjectPhase) => Promise<void>;
  onAddTask: (s: ProjectSuggestion, id: string, name: string) => Promise<void>;
}) {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [fbLoading, setFbLoading] = useState(true);

  useEffect(() => {
    setFbLoading(true);
    fetch("/api/feedback")
      .then((r) => r.json())
      .then((data: { items: FeedbackItem[] }) => {
        const matched = (data.items ?? []).filter(
          (f) => f.source?.toLowerCase() === project.name.toLowerCase(),
        );
        setFeedback(matched);
      })
      .catch(() => setFeedback([]))
      .finally(() => setFbLoading(false));
  }, [project.name]);

  const fbByStatus = {
    inbox:    feedback.filter((f) => f.status === "inbox"),
    accepted: feedback.filter((f) => f.status === "accepted"),
    denied:   feedback.filter((f) => f.status === "denied"),
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Back header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-700/50 shrink-0">
        <button
          onClick={onBack}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          ← Back
        </button>
        <span className="text-sm font-semibold text-gray-100">{project.name}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded border ml-auto ${PHASE_PILL[project.phase]}`}>
          {project.phase}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Description / state */}
        {(project.state || project.description) && (
          <p className="text-sm text-gray-400">{project.state || project.description}</p>
        )}

        {/* Progress */}
        {project.completionPercent !== undefined && (
          <div>
            <div className="flex justify-between text-[11px] text-gray-500 mb-1">
              <span>Completion</span>
              <span>{project.completionPercent}%</span>
            </div>
            <div className="w-full bg-gray-700/50 rounded-full h-2">
              <div
                className="bg-blue-500/70 rounded-full h-2"
                style={{ width: `${project.completionPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Phase change */}
        {project.personalId && (
          <div>
            <h3 className="text-[11px] text-gray-500 uppercase tracking-wider mb-2">Move to phase</h3>
            <div className="flex gap-1 flex-wrap">
              {PHASES.map((ph) => (
                <button
                  key={ph}
                  onClick={() => onPhaseChange(project.personalId!, ph)}
                  className={`text-[11px] px-2.5 py-1 rounded border transition-colors ${
                    project.phase === ph
                      ? PHASE_PILL[ph]
                      : "border-gray-600 text-gray-500 hover:border-gray-400"
                  }`}
                >
                  {ph}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Git info */}
        {project.lastCommit && (
          <div>
            <h3 className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Last commit</h3>
            <p className="text-xs text-gray-400">
              {relativeTime(project.lastCommit)}
              {project.lastCommitMsg && (
                <span className="text-gray-600 ml-1">— {project.lastCommitMsg}</span>
              )}
            </p>
            <p className="text-[10px] text-gray-600 font-mono mt-0.5">{project.path}</p>
          </div>
        )}

        {/* Tags */}
        {project.tags && project.tags.length > 0 && (
          <div>
            <h3 className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Tags</h3>
            <div className="flex flex-wrap gap-1">
              {project.tags.map((t, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 bg-gray-700/50 text-gray-400 rounded">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* AI suggestions */}
        {project.suggestions && project.suggestions.length > 0 && (
          <div>
            <h3 className="text-[11px] text-gray-500 uppercase tracking-wider mb-2">AI suggestions</h3>
            <div className="space-y-1.5">
              {project.suggestions.map((s, i) => (
                <div key={i} className="flex items-start gap-2 bg-gray-800/40 rounded p-2">
                  <span className={`text-[10px] font-bold shrink-0 ${priorityColor(s.priority)}`}>
                    {s.priority}
                  </span>
                  <span className="text-[11px] text-gray-300 flex-1">{s.action}</span>
                  <span className="text-[10px] text-gray-500 shrink-0">[{s.effort}]</span>
                  {project.personalId && (
                    <button
                      onClick={() => onAddTask(s, project.personalId!, project.name)}
                      className="text-[10px] text-green-400 hover:text-green-300 shrink-0"
                      title="Add to tasks"
                    >
                      +
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Feedback from this project */}
        <div>
          <h3 className="text-[11px] text-gray-500 uppercase tracking-wider mb-2">
            Feedback
            {!fbLoading && feedback.length > 0 && (
              <span className="ml-1 text-blue-400">({feedback.length})</span>
            )}
          </h3>
          {fbLoading ? (
            <p className="text-xs text-gray-600">Loading…</p>
          ) : feedback.length === 0 ? (
            <p className="text-xs text-gray-600">No feedback yet from this project.</p>
          ) : (
            <div className="space-y-3">
              {(["inbox", "accepted", "denied"] as const).map((status) => {
                const items = fbByStatus[status];
                if (items.length === 0) return null;
                const colour = status === "inbox" ? "text-blue-400" : status === "accepted" ? "text-green-400" : "text-red-400";
                return (
                  <div key={status}>
                    <p className={`text-[10px] uppercase tracking-wider mb-1 ${colour}`}>
                      {status} ({items.length})
                    </p>
                    <div className="space-y-1.5">
                      {items.map((f) => (
                        <div key={f.id} className="bg-gray-800/60 border border-gray-700/30 rounded p-2">
                          <p className="text-xs text-gray-200">{f.text}</p>
                          <p className="text-[10px] text-gray-600 mt-0.5">
                            {new Date(f.createdAt).toLocaleDateString("en-GB", {
                              day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                            })}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ProjectsTab({
  projects,
  onPhaseChange,
  onAddTask,
  onRefetch,
  onRefresh,
}: ProjectsTabProps) {
  const [registryProjects, setRegistryProjects] = useState<ProjectEntry[]>([]);
  const [registryUpdatedAt, setRegistryUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [selectedProject, setSelectedProject] = useState<MergedProject | null>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data: { updatedAt: string | null; projects: ProjectEntry[] }) => {
        setRegistryProjects(data.projects || []);
        setRegistryUpdatedAt(data.updatedAt);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const merged: MergedProject[] = registryProjects.map((entry) => {
    const slug = (s: string) => s.toLowerCase().replace(/\s+/g, "-");
    const personal = projects.find((p) => slug(p.name) === slug(entry.name));
    return {
      name: entry.name,
      path: entry.path,
      registryPhase: entry.phase,
      lastCommit: entry.lastCommit,
      lastCommitMsg: entry.lastCommitMsg,
      description: entry.description,
      hasGit: entry.hasGit,
      hasClaude: entry.hasClaude,
      hasPkg: entry.hasPkg,
      personalId: personal?.id,
      phase: personal?.phase ?? entry.phase,
      completionPercent: personal?.completionPercent,
      tags: personal?.tags,
      suggestions: personal?.suggestions,
      state: personal?.state,
      crossProjectDeps: personal?.crossProjectDeps,
      neglected: personal?.neglected,
    };
  });

  const handleSelect = useCallback((p: MergedProject) => {
    setSelectedProject(p);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedProject(null);
  }, []);

  /* ── Per-project detail view ─────────────────────────────── */
  if (selectedProject) {
    return (
      <ProjectDetailPanel
        project={selectedProject}
        onBack={handleBack}
        onPhaseChange={onPhaseChange}
        onAddTask={onAddTask}
      />
    );
  }

  const VIEW_MODES: { id: ViewMode; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "board",    label: "Board" },
    { id: "list",     label: "List" },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="px-4 pt-3 pb-2 border-b border-gray-700/50 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 bg-gray-800/60 rounded p-0.5">
            {VIEW_MODES.map((vm) => (
              <button
                key={vm.id}
                onClick={() => setViewMode(vm.id)}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  viewMode === vm.id
                    ? "bg-blue-600 text-white font-medium"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                {vm.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-600">{merged.length} projects</span>
            {registryUpdatedAt && (
              <span className="text-[10px] text-gray-500">
                synced {relativeTime(registryUpdatedAt)}
              </span>
            )}
            <button
              onClick={async () => {
                setRefreshing(true);
                try {
                  if (onRefresh) await onRefresh();
                } finally {
                  setRefreshing(false);
                  onRefetch();
                }
              }}
              disabled={refreshing}
              className="text-[10px] text-gray-500 hover:text-gray-400 disabled:opacity-40 transition-colors"
              title="Sync project registry"
            >
              {refreshing ? "…" : "↻"}
            </button>
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-500">Loading registry…</p>
          </div>
        ) : merged.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-sm text-gray-500">
              <p className="mb-2">No projects discovered yet.</p>
              <code className="text-[11px] bg-gray-800 px-2 py-1 rounded text-gray-400">
                node scripts/project-discovery.mjs
              </code>
            </div>
          </div>
        ) : viewMode === "overview" ? (
          <OverviewView merged={merged} onSelect={handleSelect} />
        ) : viewMode === "board" ? (
          <BoardView
            merged={merged}
            onPhaseChange={onPhaseChange}
            onAddTask={onAddTask}
            onSelect={handleSelect}
          />
        ) : (
          /* List view */
          <div className="h-full overflow-y-auto p-4">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {merged.map((project) => (
                <RegistryProjectCard
                  key={project.name}
                  project={project}
                  onPhaseChange={onPhaseChange}
                  onAddTask={onAddTask}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
