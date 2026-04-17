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

interface QuinnSections {
  winsAndImpact: string;
  issuesBlockers: string;
  nextWeekPriorities: string;
  lookingAhead: string;
}

interface IBPHeaderMeta {
  weekTitle: string | null;
  generatedDate: string | null;
  trackedSummary: string | null;
  daysSummary: string | null;
}

function parseQuinnSections(markdown: string): QuinnSections | null {
  const content = String(markdown || "");
  const defs = [
    { key: "winsAndImpact", regex: /^##\s*(?:🚀\s*)?Current Week:\s*Wins\s*&\s*Impact\s*$/im },
    { key: "issuesBlockers", regex: /^##\s*(?:⚠️\s*)?Issues\s*\/\s*Blockers\s*$/im },
    { key: "nextWeekPriorities", regex: /^##\s*(?:🔥\s*)?Next Week:\s*(?:Top\s*)?Priorities\s*$/im },
    { key: "lookingAhead", regex: /^##\s*(?:🔮\s*)?Looking Ahead\s*$/im },
  ] as const;

  const starts = defs
    .map((def) => {
      const match = def.regex.exec(content);
      return match ? { key: def.key, start: match.index, header: match[0] } : null;
    })
    .filter((item): item is { key: keyof QuinnSections; start: number; header: string } => Boolean(item))
    .sort((a, b) => a.start - b.start);

  if (starts.length < 4) return null;

  const sections: QuinnSections = {
    winsAndImpact: "",
    issuesBlockers: "",
    nextWeekPriorities: "",
    lookingAhead: "",
  };

  for (let i = 0; i < starts.length; i += 1) {
    const current = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1].start : content.length;
    sections[current.key] = content.slice(current.start, end).replace(current.header, "").trim();
  }

  return sections;
}

function extractHeaderMeta(markdown: string): IBPHeaderMeta {
  const lines = String(markdown || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const weekTitle = lines.find((line) => line.startsWith("# "))?.replace(/^#\s*/, "") ?? null;
  const generatedLine = lines.find((line) => line.startsWith("**Generated:**"));

  if (!generatedLine) {
    return {
      weekTitle,
      generatedDate: null,
      trackedSummary: null,
      daysSummary: null,
    };
  }

  const generatedDateMatch = generatedLine.match(/^\*\*Generated:\*\*\s*([^|]+)/);
  const trackedMatch = generatedLine.match(/\*\*([^*]+tracked)\*\*/i);
  const daysMatch = generatedLine.match(/across\s+(.+)$/i);

  return {
    weekTitle,
    generatedDate: generatedDateMatch?.[1]?.trim() ?? null,
    trackedSummary: trackedMatch?.[1]?.trim() ?? null,
    daysSummary: daysMatch?.[1]?.trim() ?? null,
  };
}

function QuinnCard({
  title,
  content,
  tone,
  bulletTone,
}: {
  title: string;
  content: string;
  tone: string;
  bulletTone: string;
}) {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className="rounded border border-gray-700/40 bg-gray-800/60 overflow-hidden min-h-[220px]">
      <div className={`px-3 py-2 text-sm font-bold ${tone}`}>
        {title}
      </div>
      <div className="p-3 space-y-1 max-h-[320px] overflow-y-auto">
        {lines.length === 0 && <p className="text-xs text-gray-500">No content</p>}
        {lines.map((line, index) => {
          if (line === "---") {
            return <hr key={index} className="border-gray-700/40 my-2" />;
          }
          if (line.startsWith("- ") || line.startsWith("* ")) {
            return (
              <div key={index} className="flex items-start gap-2 text-xs text-gray-300">
                <span className={`${bulletTone} mt-0.5`}>•</span>
                <span className="leading-relaxed">{renderInlineMarkdown(line.slice(2))}</span>
              </div>
            );
          }
          if (line.startsWith("### ")) {
            return (
              <h4 key={index} className="text-xs font-semibold text-gray-200 pt-1">
                {line.replace(/^###\s/, "")}
              </h4>
            );
          }
          return (
            <p key={index} className="text-xs text-gray-300 leading-relaxed">
              {renderInlineMarkdown(line)}
            </p>
          );
        })}
      </div>
    </div>
  );
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

              if (l === "---") {
                return <hr key={li} className="border-gray-700/40 my-2" />;
              }

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
  const tokens = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g);
  return tokens.map((token, i) => {
    if (token.startsWith("**") && token.endsWith("**")) {
      return (
        <strong key={i} className="text-gray-100 font-semibold">
          {token.slice(2, -2)}
        </strong>
      );
    }

    if (token.startsWith("_") && token.endsWith("_")) {
      return (
        <em key={i} className="text-gray-400 italic">
          {token.slice(1, -1)}
        </em>
      );
    }

    return token;
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
  const [submittingToPowerApps, setSubmittingToPowerApps] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const quinnSections = report ? parseQuinnSections(report.rawMarkdown) : null;
  const headerMeta = report ? extractHeaderMeta(report.rawMarkdown) : null;

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
        const detail = data.stderr ? ` — ${data.stderr}` : "";
        throw new Error((data.error ?? "Generation failed") + detail);
      }
      // Switch to the newly generated date and reload
      const newDate = data.generatedDate ?? data.lastGenerated;
      if (newDate) setSelectedDate(newDate);
      await fetchReport(newDate ?? undefined);
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

  const handleFillPowerApps = async () => {
    if (!report?.date) return;

    setSubmittingToPowerApps(true);
    setSubmitMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/ibp/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: report.date, demo: false }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "Failed to start PowerApps fill job");
      }
      setSubmitMessage(
        "PowerApps fill started. The form will be auto-filled only; review and click Submit manually.",
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start PowerApps fill");
    } finally {
      setSubmittingToPowerApps(false);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-700/50 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Impact Blockers Priorities
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
                aria-label="Select IBP date"
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
              onClick={handleFillPowerApps}
              disabled={submittingToPowerApps || !report}
              className="text-xs px-2.5 py-1 bg-emerald-700/80 hover:bg-emerald-600/80 disabled:bg-gray-700/60 disabled:text-gray-500 rounded text-white transition-colors"
            >
              {submittingToPowerApps ? "Starting…" : "Fill PowerApps Form"}
            </button>
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

        {submitMessage && (
          <div className="px-4 pt-4">
            <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-lg p-3">
              <p className="text-sm text-emerald-300">{submitMessage}</p>
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
            {quinnSections ? (
              <div className="space-y-4">
                {headerMeta && (headerMeta.weekTitle || headerMeta.generatedDate || headerMeta.trackedSummary) && (
                  <div className="rounded border border-gray-700/40 bg-gray-800/60 px-3 py-2 flex flex-wrap gap-3 text-xs text-gray-300">
                    {headerMeta.weekTitle && <span className="text-gray-200 font-semibold">{headerMeta.weekTitle}</span>}
                    {headerMeta.generatedDate && <span>Generated: {headerMeta.generatedDate}</span>}
                    {headerMeta.trackedSummary && <span>{headerMeta.trackedSummary}</span>}
                    {headerMeta.daysSummary && <span>{headerMeta.daysSummary}</span>}
                  </div>
                )}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <QuinnCard
                    title="🚀 Current Week: Wins & Impact"
                    content={quinnSections.winsAndImpact}
                    tone="text-rose-200 bg-rose-700/30"
                    bulletTone="text-rose-300"
                  />
                  <QuinnCard
                    title="⚠️ Issues / Blockers"
                    content={quinnSections.issuesBlockers}
                    tone="text-amber-200 bg-amber-700/30"
                    bulletTone="text-amber-300"
                  />
                  <QuinnCard
                    title="🔥 Next Week: Top Priorities"
                    content={quinnSections.nextWeekPriorities}
                    tone="text-orange-200 bg-orange-700/30"
                    bulletTone="text-orange-300"
                  />
                  <QuinnCard
                    title="🔮 Looking Ahead"
                    content={quinnSections.lookingAhead}
                    tone="text-violet-200 bg-violet-700/30"
                    bulletTone="text-violet-300"
                  />
                </div>
                <details className="bg-gray-800/50 rounded border border-gray-700/30 p-4">
                  <summary className="text-xs font-semibold text-gray-300 cursor-pointer select-none">
                    View raw markdown report
                  </summary>
                  <div className="mt-3">
                    <MarkdownSection content={report.rawMarkdown} />
                  </div>
                </details>
              </div>
            ) : (
              <div className="bg-gray-800/50 rounded border border-gray-700/30 p-4">
                <MarkdownSection content={report.rawMarkdown} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
