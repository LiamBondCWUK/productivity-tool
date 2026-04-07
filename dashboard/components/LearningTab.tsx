"use client";

import type {
  OvernightProjectAnalysis,
  RecommendedInstalls,
} from "../types/dashboard";

interface LearningTabProps {
  overnightAnalysis: {
    generatedAt: string | null;
    projects: Record<string, OvernightProjectAnalysis>;
  };
  recommendedInstalls: RecommendedInstalls;
}

export function LearningTab({
  overnightAnalysis,
  recommendedInstalls,
}: LearningTabProps) {
  const { generatedAt, projects } = overnightAnalysis;
  const projectEntries = Object.entries(projects);
  const visibleInstalls = recommendedInstalls.items.filter(
    (item) => item.priority === "HIGH" || item.priority === "MED",
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Overnight Analysis */}
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
          <div className="flex items-center justify-center py-6">
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

        {/* Recommended Installs */}
        <div className="pt-2">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Recommended Installs
            </h2>
            {recommendedInstalls.lastUpdated && (
              <span className="text-xs text-purple-400">
                {new Date(recommendedInstalls.lastUpdated).toLocaleDateString(
                  "en-GB",
                  { day: "numeric", month: "short" },
                )}
              </span>
            )}
          </div>

          {visibleInstalls.length === 0 ? (
            <p className="text-xs text-gray-600 text-center py-4">
              Run morning scan to populate
            </p>
          ) : (
            <div className="space-y-2">
              {visibleInstalls.map((install) => {
                const priorityColour =
                  install.priority === "HIGH"
                    ? "text-red-400 border-red-900/40"
                    : "text-yellow-400 border-yellow-900/40";
                const categoryColour =
                  install.category === "MCP"
                    ? "bg-blue-900/40 text-blue-300"
                    : install.category === "Plugin"
                      ? "bg-purple-900/40 text-purple-300"
                      : install.category === "Architecture"
                        ? "bg-teal-900/40 text-teal-300"
                        : install.category === "VSCode"
                          ? "bg-indigo-900/40 text-indigo-300"
                          : "bg-gray-700/50 text-gray-400";
                return (
                  <div
                    key={install.id}
                    className={`bg-gray-800/50 rounded border p-3 ${priorityColour.split(" ")[1]}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`text-xs font-semibold ${priorityColour.split(" ")[0]}`}
                        >
                          {install.priority}
                        </span>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded ${categoryColour}`}
                        >
                          {install.category}
                        </span>
                        <span className="text-xs font-medium text-gray-200">
                          {install.name}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed mb-1">
                      {install.description}
                    </p>
                    <p className="text-xs text-gray-600 italic mb-1.5">
                      {install.signal}
                    </p>
                    {install.installCommand && (
                      <code className="block text-xs bg-gray-900/60 text-green-400 px-2 py-1 rounded font-mono leading-relaxed break-all">
                        {install.installCommand}
                      </code>
                    )}
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
