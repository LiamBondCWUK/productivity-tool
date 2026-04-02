"use client";

import type { OvernightProjectAnalysis } from "../types/dashboard";

interface LearningTabProps {
  overnightAnalysis: {
    generatedAt: string | null;
    projects: Record<string, OvernightProjectAnalysis>;
  };
}

export function LearningTab({ overnightAnalysis }: LearningTabProps) {
  const { generatedAt, projects } = overnightAnalysis;
  const projectEntries = Object.entries(projects);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-700/50 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Overnight Analysis
          </h2>
          {generatedAt && (
            <span className="text-xs text-purple-400">
              Generated{" "}
              {new Date(generatedAt).toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {projectEntries.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-600 text-center">
              No overnight analysis yet.
              <br />
              <span className="text-xs text-gray-700 mt-1 block">
                Runs at 02:00 via Windows Task Scheduler
              </span>
            </p>
          </div>
        )}

        {projectEntries.map(([projectName, analysis]) => (
          <div
            key={projectName}
            className="bg-gray-800/50 rounded border border-gray-700/30 p-3"
          >
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xs font-semibold text-gray-200">
                {projectName}
              </h3>
              <span className="text-xs text-gray-500">{analysis.state}</span>
            </div>

            {analysis.suggestions.length > 0 && (
              <ul className="space-y-1.5">
                {analysis.suggestions.map((suggestion, idx) => {
                  const priorityColour =
                    suggestion.priority === "HIGH"
                      ? "text-red-400"
                      : suggestion.priority === "MED"
                        ? "text-yellow-400"
                        : "text-gray-500";
                  return (
                    <li key={idx} className="flex items-start gap-2 text-xs">
                      <span
                        className={`shrink-0 font-semibold ${priorityColour}`}
                      >
                        {suggestion.priority}
                      </span>
                      <span className="text-gray-300 leading-relaxed">
                        {suggestion.action}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            {analysis.neglected.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-700/30">
                <p className="text-xs text-gray-500">
                  Neglected: {analysis.neglected.join(", ")}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
