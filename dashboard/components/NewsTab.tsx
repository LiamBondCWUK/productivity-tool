"use client";

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
}

export function NewsTab({
  lastRun,
  topStories = [],
  suggestions = [],
}: NewsTabProps) {
  const hasStories = topStories.length > 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-700/50 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            AI Breaking News
          </h2>
          {lastRun && (
            <span className="text-xs text-gray-500">
              Last run:{" "}
              {new Date(lastRun).toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
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
                  {story.url && (
                    <a
                      href={story.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-500 hover:text-blue-400 transition-colors shrink-0 mt-0.5"
                      title="Open article"
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
                  )}
                </div>
                {story.summary && (
                  <p className="text-xs text-gray-400 mt-1.5 leading-relaxed line-clamp-3">
                    {story.summary}
                  </p>
                )}
                {story.publishedAt && (
                  <p className="text-xs text-gray-600 mt-1">
                    <time dateTime={story.publishedAt}>
                      {new Date(story.publishedAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </time>
                  </p>
                )}
              </div>
            ))}

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
      </div>
    </div>
  );
}
