"use client";

import { useState, useEffect } from "react";
import type {
  PersonalProject,
  ProjectPhase,
  ProjectSuggestion,
  ProjectEntry,
} from "../types/dashboard";

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
}: {
  project: MergedProject;
  onPhaseChange: (projectId: string, phase: ProjectPhase) => Promise<void>;
  onAddTask: (
    suggestion: ProjectSuggestion,
    projectId: string,
    projectName: string,
  ) => Promise<void>;
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
    <div className="bg-gray-800/60 border border-gray-700/50 rounded-lg p-3 hover:border-gray-600/50 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
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

export function ProjectsTab({
  projects,
  onPhaseChange,
  onAddTask,
  onRefetch,
}: ProjectsTabProps) {
  const [registryProjects, setRegistryProjects] = useState<ProjectEntry[]>([]);
  const [registryUpdatedAt, setRegistryUpdatedAt] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [activePhase, setActivePhase] = useState<ProjectPhase | "All">("All");

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
    const slug = (s: string) => s.toLowerCase().replace(/\\s+/g, "-");
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

  const phaseCounts = PHASES.reduce(
    (acc, p) => {
      acc[p] = merged.filter((m) => m.phase === p).length;
      return acc;
    },
    {} as Record<ProjectPhase, number>,
  );

  const filtered =
    activePhase === "All"
      ? merged
      : merged.filter((m) => m.phase === activePhase);

  return (
    <div className="h-full flex min-h-0 overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 pt-3 pb-2 border-b border-gray-700/50 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-200">
              All Projects
            </h2>
            <div className="flex items-center gap-2">
              {registryUpdatedAt && (
                <span className="text-[10px] text-gray-500">
                  registry {relativeTime(registryUpdatedAt)}
                </span>
              )}
              <button
                onClick={onRefetch}
                className="text-[10px] text-gray-500 hover:text-gray-400 transition-colors"
              >
                ↻ refresh
              </button>
            </div>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setActivePhase("All")}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                activePhase === "All"
                  ? "bg-gray-700 text-gray-200"
                  : "text-gray-500 hover:text-gray-400"
              }`}
            >
              All ({merged.length})
            </button>
            {PHASES.map((p) => (
              <button
                key={p}
                onClick={() => setActivePhase(p)}
                className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                  activePhase === p
                    ? "bg-gray-700 text-gray-200"
                    : "text-gray-500 hover:text-gray-400"
                }`}
              >
                {p} ({phaseCounts[p]})
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-sm text-gray-500 text-center mt-8">
              Loading registry…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-gray-500 text-center mt-8">
              {merged.length === 0 ? (
                <div>
                  <p className="mb-2">No projects discovered yet.</p>
                  <code className="text-[11px] bg-gray-800 px-2 py-1 rounded text-gray-400">
                    node scripts/project-discovery.mjs
                  </code>
                </div>
              ) : (
                `No projects in ${activePhase}`
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {filtered.map((project) => (
                <RegistryProjectCard
                  key={project.name}
                  project={project}
                  onPhaseChange={onPhaseChange}
                  onAddTask={onAddTask}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}