"use client";

import { useState } from "react";
import { useExecuteCommand } from "../hooks/useExecuteCommand";
import { RunButton, StatusBanner } from "./RunButton";
import type {
  InternalIntelItem,
  InternalIntelligence,
  RecommendedInstall,
} from "../types/dashboard";

type TabId = "external" | "internal" | "suggestions";

interface TopStory {
  title: string;
  summary: string;
  url?: string;
  publishedAt?: string;
}

interface NewsTabProps {
  lastRun?: string | null;
  topStories?: TopStory[];
  suggestions?: string[];
  internalIntel?: InternalIntelligence;
  recommendedInstalls?: RecommendedInstall[];
  onMarkInstalled?: (id: string) => Promise<void>;
  onRefetch?: () => void;
}

const SOURCE_BADGE_STYLES: Record<string, string> = {
  teams: "bg-blue-900/40 text-blue-300 border-blue-700/40",
  confluence: "bg-purple-900/40 text-purple-300 border-purple-700/40",
  newsletter: "bg-green-900/40 text-green-300 border-green-700/40",
  external: "bg-gray-800/40 text-gray-300 border-gray-700/40",
};

const SOURCE_LABELS: Record<string, string> = {
  teams: "Teams",
  confluence: "Confluence",
  newsletter: "Newsletter",
  external: "External",
};

function SourceBadge({ type }: { type: string }) {
  return (
    <span
      className={`text-[10px] font-medium border rounded px-1.5 py-0.5 ${SOURCE_BADGE_STYLES[type] ?? SOURCE_BADGE_STYLES.external}`}
    >
      {SOURCE_LABELS[type] ?? type}
    </span>
  );
}

function ExternalLink({ url, label }: { url: string; label?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-gray-500 hover:text-blue-400 transition-colors shrink-0 mt-0.5"
      title={label ?? "Open"}
    >
      <svg
        className="w-3.5 h-3.5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
        />
      </svg>
    </a>
  );
}

function InternalIntelSection({
  title,
  items,
  icon,
}: {
  title: string;
  items: InternalIntelItem[];
  icon: string;
}) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
        <span>{icon}</span>
        {title}
        <span className="text-gray-600 font-normal">({items.length})</span>
      </p>
      {items.map((item, index) => (
        <div
          key={index}
          className="bg-gray-800/40 rounded-lg p-3 border border-gray-700/40 hover:border-gray-600/60 transition-colors"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <SourceBadge type={item.sourceType} />
              <p className="text-sm font-medium text-gray-200 leading-snug flex-1">
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-blue-400 transition-colors"
                  >
                    {item.title}
                  </a>
                ) : (
                  item.title
                )}
              </p>
            </div>
            {item.url && <ExternalLink url={item.url} />}
          </div>
          {item.summary && (
            <p className="text-xs text-gray-400 mt-1.5 leading-relaxed line-clamp-3 ml-[calc(theme(spacing.2)+4rem)]">
              {item.summary}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function SuggestionCard({
  install,
  onMarkInstalled,
}: {
  install: RecommendedInstall;
  onMarkInstalled?: (id: string) => Promise<void>;
}) {
  const [marking, setMarking] = useState(false);

  const handleMark = async () => {
    if (!onMarkInstalled) return;
    setMarking(true);
    try {
      await onMarkInstalled(install.id);
    } finally {
      setMarking(false);
    }
  };

  const priorityStyles: Record<string, string> = {
    HIGH: "border-l-red-400",
    MED: "border-l-yellow-400",
    LOW: "border-l-gray-500",
  };

  const categoryBadge: Record<string, string> = {
    MCP: "bg-cyan-900/40 text-cyan-300 border-cyan-700/40",
    Plugin: "bg-violet-900/40 text-violet-300 border-violet-700/40",
    VSCode: "bg-blue-900/40 text-blue-300 border-blue-700/40",
    npm: "bg-red-900/40 text-red-300 border-red-700/40",
    App: "bg-amber-900/40 text-amber-300 border-amber-700/40",
    Architecture: "bg-emerald-900/40 text-emerald-300 border-emerald-700/40",
  };

  return (
    <div
      className={`bg-gray-800/40 rounded-lg p-3 border border-gray-700/40 border-l-2 ${priorityStyles[install.priority] ?? ""} hover:border-gray-600/60 transition-colors`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-[10px] font-medium border rounded px-1.5 py-0.5 ${categoryBadge[install.category] ?? "bg-gray-800/40 text-gray-300 border-gray-700/40"}`}
            >
              {install.category}
            </span>
            <span className="text-sm font-medium text-gray-200">
              {install.name}
            </span>
            <span
              className={`text-[10px] font-bold ${install.priority === "HIGH" ? "text-red-400" : install.priority === "MED" ? "text-yellow-400" : "text-gray-500"}`}
            >
              {install.priority}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">{install.description}</p>
          {install.signal && (
            <p className="text-xs text-gray-600 mt-0.5 italic">
              Signal: {install.signal}
            </p>
          )}
          {install.installCommand && (
            <code className="text-[10px] text-green-400 bg-gray-900/60 rounded px-1.5 py-0.5 mt-1 inline-block font-mono">
              {install.installCommand}
            </code>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {install.status === "INSTALLED" ? (
            <span className="text-green-400 text-xs">✓ Installed</span>
          ) : onMarkInstalled ? (
            <button
              onClick={handleMark}
              disabled={marking}
              className="text-xs text-gray-500 hover:text-green-400 transition-colors disabled:opacity-40"
              title="Mark as installed"
            >
              {marking ? "…" : "Install ✓"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function NewsTab({
  lastRun,
  topStories = [],
  suggestions = [],
  internalIntel,
  recommendedInstalls = [],
  onMarkInstalled,
  onRefetch,
}: NewsTabProps) {
  const [activeTab, setActiveTab] = useState<TabId>("external");
  const { execute, running, lastResult } = useExecuteCommand();
  const [showResult, setShowResult] = useState(false);

  const handleRefreshNews = async () => {
    setShowResult(true);
    const result = await execute("refresh-news");
    if (result.success) onRefetch?.();
  };

  const hasStories = topStories.length > 0;
  const hasInternalIntel =
    (internalIntel?.teamsChannels?.length ?? 0) > 0 ||
    (internalIntel?.confluencePages?.length ?? 0) > 0 ||
    (internalIntel?.newsletterHighlights?.length ?? 0) > 0;
  const internalCount =
    (internalIntel?.teamsChannels?.length ?? 0) +
    (internalIntel?.confluencePages?.length ?? 0) +
    (internalIntel?.newsletterHighlights?.length ?? 0);
  const pendingInstalls = recommendedInstalls.filter(
    (i) => i.status === "PENDING",
  );

  const tabs: Array<{ id: TabId; label: string; count: number }> = [
    { id: "external", label: "External", count: topStories.length },
    { id: "internal", label: "Internal", count: internalCount },
    {
      id: "suggestions",
      label: "Suggestions",
      count: pendingInstalls.length,
    },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-700/50 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            AI Breaking News
          </h2>
          <div className="flex items-center gap-3">
            {lastRun && (
              <span className="text-xs text-gray-500">
                Last run:{" "}
                {new Date(lastRun).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
            <RunButton
              label="↻ Run Fresh"
              runningLabel="Gathering…"
              running={running === "refresh-news"}
              onClick={handleRefreshNews}
            />
          </div>
        </div>

        {showResult && lastResult && (
          <div className="mt-2">
            <StatusBanner
              success={lastResult.success}
              error={lastResult.error}
              durationMs={lastResult.durationMs}
              onDismiss={() => setShowResult(false)}
            />
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 mt-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`text-xs px-2.5 py-1 rounded transition-colors ${
                activeTab === tab.id
                  ? "bg-gray-700 text-gray-200"
                  : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-1 text-gray-500">({tab.count})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* External News Tab */}
        {activeTab === "external" && (
          <>
            {!hasStories ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-600 text-sm text-center">
                  No news stories yet.
                  <br />
                  <span className="text-xs text-gray-700 mt-1 block">
                    Run: node scripts/extract-news-results.mjs
                  </span>
                </p>
              </div>
            ) : (
              <div className="p-4 space-y-3">
                {topStories.map((story, index) => (
                  <div
                    key={index}
                    className="bg-gray-800/40 rounded-lg p-3 border border-gray-700/40 hover:border-gray-600/60 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-gray-200 leading-snug flex-1">
                        {story.url ? (
                          <a
                            href={story.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-blue-400 transition-colors"
                          >
                            {story.title}
                          </a>
                        ) : (
                          story.title
                        )}
                      </p>
                      {story.url && <ExternalLink url={story.url} />}
                    </div>
                    {story.summary && (
                      <p className="text-xs text-gray-400 mt-1.5 leading-relaxed line-clamp-3">
                        {story.summary}
                      </p>
                    )}
                    {story.publishedAt && (
                      <p className="text-xs text-gray-600 mt-1">
                        <time dateTime={story.publishedAt}>
                          {new Date(story.publishedAt).toLocaleDateString(
                            "en-GB",
                            {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            },
                          )}
                        </time>
                      </p>
                    )}
                  </div>
                ))}

                {/* Legacy suggestions badges (simple list) */}
                {suggestions.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-gray-700/50">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      Setup Suggestions
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.map((suggestion, index) => (
                        <span
                          key={index}
                          className="text-xs bg-blue-900/30 text-blue-300 border border-blue-700/40 rounded px-2 py-0.5"
                        >
                          {suggestion}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Internal Intelligence Tab */}
        {activeTab === "internal" && (
          <div className="p-4 space-y-5">
            {!hasInternalIntel ? (
              <div className="flex items-center justify-center h-full py-12">
                <p className="text-gray-600 text-sm text-center">
                  No internal intelligence yet.
                  <br />
                  <span className="text-xs text-gray-700 mt-1 block">
                    Run the morning scan to populate Teams, Confluence, and
                    newsletter data.
                  </span>
                </p>
              </div>
            ) : (
              <>
                <InternalIntelSection
                  title="Teams Channels"
                  icon="💬"
                  items={internalIntel?.teamsChannels ?? []}
                />
                <InternalIntelSection
                  title="Confluence Updates"
                  icon="📄"
                  items={internalIntel?.confluencePages ?? []}
                />
                <InternalIntelSection
                  title="Newsletter Highlights"
                  icon="📧"
                  items={internalIntel?.newsletterHighlights ?? []}
                />
              </>
            )}
          </div>
        )}

        {/* Suggestions Tab */}
        {activeTab === "suggestions" && (
          <div className="p-4 space-y-3">
            {pendingInstalls.length === 0 ? (
              <div className="flex items-center justify-center h-full py-12">
                <p className="text-gray-600 text-sm text-center">
                  No pending suggestions.
                  <br />
                  <span className="text-xs text-gray-700 mt-1 block">
                    HIGH and MED recommendations from the morning scan appear
                    here.
                  </span>
                </p>
              </div>
            ) : (
              pendingInstalls.map((install) => (
                <SuggestionCard
                  key={install.id}
                  install={install}
                  onMarkInstalled={onMarkInstalled}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
