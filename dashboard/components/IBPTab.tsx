"use client";

import { useState, useCallback, useEffect } from "react";

interface IBPReport {
  date: string;
  rawMarkdown: string;
}

interface IBPTabProps {
  ibpMeta?: {
    lastGenerated: string | null;
    availableDates: string[];
  };
}

function MarkdownSection({ content }: { content: string }) {
  // Split markdown into sections by ## headers and render with basic styling
  const sections = content.split(/^(#{1,3}\s.+)$/m);

  return (
    <div className="space-y-3">
      {sections.map((block, idx) => {
        const trimmed = block.trim();
        if (!trimmed) return null;

        if (trimmed.startsWith("### ")) {
          return (
            <h4
              key={idx}
              className="text-xs font-semibold text-gray-300 mt-4 mb-1"
            >
              {trimmed.replace(/^###\s/, "")}
            </h4>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h3
              key={idx}
              className="text-sm font-semibold text-gray-200 mt-5 mb-1 border-b border-gray-700/30 pb-1"
            >
              {trimmed.replace(/^##\s/, "")}
            </h3>
          );
        }
        if (trimmed.startsWith("# ")) {
          return (
            <h2
              key={idx}
              className="text-base font-bold text-gray-100 mt-4 mb-2"
            >
              {trimmed.replace(/^#\s/, "")}
            </h2>
          );
        }

        // Render body text: handle bullet points and paragraphs
        const lines = trimmed.split("\n");
        return (
          <div key={idx} className="space-y-1">
            {lines.map((line, li) => {
              const l = line.trim();
              if (!l) return null;

              if (l.startsWith("- ") || l.startsWith("* ")) {
                return (
                  <div key={li} className="flex items-start gap-2 text-xs text-gray-300 pl-2">
                    <span className="text-gray-600 shrink-0 mt-0.5">•</span>
                    <span className="leading-relaxed">
                      {renderInlineMarkdown(l.slice(2))}
                    </span>
                  </div>
                );
              }

              return (
                <p key={li} className="text-xs text-gray-300 leading-relaxed">
                  {renderInlineMarkdown(l)}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function renderInlineMarkdown(text: string): React.ReactNode {
  // Handle **bold** and basic inline formatting
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="text-gray-100 font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

export function IBPTab({ ibpMeta }: IBPTabProps) {
  const [report, setReport] = useState<IBPReport | null>(null);
  const [availableDates, setAvailableDates] = useState<string[]>(
    ibpMeta?.availableDates ?? [],
  );
  const [selectedDate, setSelectedDate] = useState<string>(
    ibpMeta?.availableDates?.[0] ?? "",
  );
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async (date?: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = date ? `/api/ibp?date=${date}` : "/api/ibp";
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? `HTTP ${res.status}`,
        );
      }
      const data = await res.json();
      if (data.report) {
        setReport(data.report);
        setSelectedDate(data.report.date);
      }
      if (data.availableDates) {
        setAvailableDates(data.availableDates);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load IBP");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/ibp", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "Generation failed");
      }
      // Refresh to show the new report
      await fetchReport();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to generate IBP",
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    fetchReport(date);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-700/50 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Integrated Business Progress
            </h2>
            {report && (
              <span className="text-xs text-purple-400">
                {report.date}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {availableDates.length > 1 && (
              <select
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="text-xs bg-gray-700/60 border border-gray-600/50 rounded px-2 py-1 text-gray-300 focus:outline-none focus:border-blue-500/50"
              >
                {availableDates.map((date) => (
                  <option key={date} value={date}>
                    {date}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="text-xs px-2.5 py-1 bg-blue-600/80 hover:bg-blue-500/80 disabled:bg-gray-700/60 disabled:text-gray-500 rounded text-white transition-colors"
            >
              {generating ? "Generating…" : "⚡ Generate IBP"}
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading && !report && (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-600 text-sm">Loading IBP report…</p>
          </div>
        )}

        {error && (
          <div className="p-4">
            <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-3">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && !report && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-2">
                No IBP reports generated yet.
              </p>
              <p className="text-xs text-gray-700 mb-4">
                Click Generate IBP to create your first daily business progress
                report.
              </p>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="text-xs px-3 py-1.5 bg-blue-600/80 hover:bg-blue-500/80 disabled:bg-gray-700/60 rounded text-white transition-colors"
              >
                {generating ? "Generating…" : "⚡ Generate First IBP"}
              </button>
            </div>
          </div>
        )}

        {report && (
          <div className="p-4">
            <div className="bg-gray-800/50 rounded border border-gray-700/30 p-4">
              <MarkdownSection content={report.rawMarkdown} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
