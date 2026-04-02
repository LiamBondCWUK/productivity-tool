"use client";

import { useState } from "react";
import type {
  PersonalProject,
  ProjectPhase,
  ProjectSuggestion,
} from "../types/dashboard";

const PHASES: ProjectPhase[] = ["Backlog", "Building", "Review", "Done"];

const PHASE_COLORS: Record<ProjectPhase, string> = {
  Backlog: "text-gray-400",
  Building: "text-blue-400",
  Review: "text-yellow-400",
  Done: "text-green-400",
};

const EFFORT_LABELS: Record<string, string> = {
  S: "~10m",
  M: "~1h",
  L: "~half-day",
};
const PRIORITY_COLORS: Record<string, string> = {
  HIGH: "text-red-400",
  MED: "text-yellow-400",
  LOW: "text-gray-400",
};

function SuggestionChip({
  suggestion,
  onAdd,
}: {
  suggestion: ProjectSuggestion;
  onAdd?: () => void;
}) {
  return (
    <div className="flex items-start gap-1.5 py-1 px-2 bg-gray-700/50 rounded text-xs">
      <span className={PRIORITY_COLORS[suggestion.priority]}>
        {suggestion.priority}
      </span>
      <span className="text-gray-300 flex-1">{suggestion.action}</span>
      <span className="text-gray-500 shrink-0">
        {EFFORT_LABELS[suggestion.effort]}
      </span>
      {onAdd && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAdd();
          }}
          className="ml-1 text-blue-400 hover:text-blue-300 shrink-0 font-semibold leading-none"
          title="Add to tasks"
        >
          +
        </button>
      )}
    </div>
  );
}

function ProjectCard({
  project,
  onPhaseChange,
  onAddTask,
}: {
  project: PersonalProject;
  onPhaseChange: (projectId: string, phase: ProjectPhase) => Promise<void>;
  onAddTask?: (
    suggestion: ProjectSuggestion,
    projectId: string,
    projectName: string
  ) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const suggestions = project.suggestions ?? [];
  const suggestionCount = suggestions.length;

  return (
    <div className="bg-gray-700/40 border border-gray-600/30 rounded-lg p-3 hover:border-gray-500/50 transition-colors">
      <div
        className="flex items-start justify-between gap-2 cursor-pointer"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-gray-100 text-sm font-medium">
              {project.name}
            </span>
            {suggestionCount > 0 && (
              <span className="text-purple-400 text-xs">
                {suggestionCount} suggestions
              </span>
            )}
          </div>
          {project.state && (
            <p className="text-gray-400 text-xs mt-0.5 truncate">
              {project.state}
            </p>
          )}
          {project.lastActivity && !project.state && (
            <p className="text-gray-500 text-xs mt-0.5">
              Last: {project.lastActivity}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-12 h-1.5 bg-gray-600 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${project.completionPercent}%` }}
            />
          </div>
          <span className="text-gray-500 text-xs">
            {project.completionPercent}%
          </span>
          <span className="text-gray-500 text-xs">{expanded ? "up" : "dn"}</span>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-gray-600/30 pt-3">
          <div className="flex gap-1">
            {PHASES.map((phase) => (
              <button
                key={phase}
                onClick={() => onPhaseChange(project.id, phase)}
                className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                  project.phase === phase
                    ? "border-blue-500 bg-blue-500/20 text-blue-300"
                    : "border-gray-600 text-gray-500 hover:border-gray-400"
                }`}
              >
                {phase}
              </button>
            ))}
          </div>

          {suggestions.length > 0 && (
            <div className="space-y-1">
              <p className="text-gray-500 text-xs font-semibold">
                AI Suggestions
              </p>
              {suggestions.map((suggestion, index) => (
                <SuggestionChip
                  key={index}
                  suggestion={suggestion}
                  onAdd={
                    onAddTask
                      ? () => onAddTask(suggestion, project.id, project.name)
                      : undefined
                  }
                />
              ))}
            </div>
          )}

          {project.crossProjectDeps && project.crossProjectDeps.length > 0 && (
            <div>
              <p className="text-gray-500 text-xs font-semibold mb-1">
                Cross-project deps
              </p>
              {project.crossProjectDeps.map((dep, index) => (
                <p key={index} className="text-orange-400/80 text-xs">
                  {dep}
                </p>
              ))}
            </div>
          )}

          {project.neglected && project.neglected.length > 0 && (
            <div>
              <p className="text-gray-500 text-xs font-semibold mb-1">
                Neglected
              </p>
              {project.neglected.map((item, index) => (
                <p key={index} className="text-yellow-500/70 text-xs">
                  {item}
                </p>
              ))}
            </div>
          )}

          <div className="flex gap-1 flex-wrap">
            {project.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs text-gray-600 border border-gray-700 rounded px-1.5 py-0.5"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  projects: PersonalProject[];
  onPhaseChange: (projectId: string, phase: ProjectPhase) => Promise<void>;
  onAddTask?: (
    suggestion: ProjectSuggestion,
    projectId: string,
    projectName: string
  ) => Promise<void>;
}

export function ProjectsBoard({ projects, onPhaseChange, onAddTask }: Props) {
  const [activePhase, setActivePhase] = useState<ProjectPhase | "All">("All");

  const filteredProjects =
    activePhase === "All"
      ? projects
      : projects.filter((p) => p.phase === activePhase);

  const countByPhase = (phase: ProjectPhase) =>
    projects.filter((p) => p.phase === phase).length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          My AI Projects
        </h2>
        <div className="flex gap-1">
          {(["All", ...PHASES] as const).map((phase) => (
            <button
              key={phase}
              onClick={() => setActivePhase(phase)}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${
                activePhase === phase
                  ? "bg-gray-600 text-gray-200"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {phase === "All" ? "All" : `${phase} (${countByPhase(phase)})`}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
        {filteredProjects.length === 0 ? (
          <div className="text-gray-600 text-sm text-center mt-8">
            No projects in this phase
          </div>
        ) : (
          filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onPhaseChange={onPhaseChange}
              onAddTask={onAddTask}
            />
          ))
        )}

        <button className="w-full mt-2 py-2 text-gray-600 hover:text-gray-400 text-xs border border-dashed border-gray-700 hover:border-gray-500 rounded transition-colors">
          + New Project
        </button>
      </div>
    </div>
  );
}
