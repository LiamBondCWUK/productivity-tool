"use client";

import { useEffect, useState, useCallback } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

type CardPriority = "urgent" | "high" | "medium" | "low";
type CardType = "improvement" | "feature" | "docs" | "bug";
type ApprovalState = "pending" | "approved" | "denied";

interface PendingCard {
  title: string;
  body: string;
  priority: CardPriority;
  type: CardType;
  labels: string[];
  project: string;
}

interface PendingCardsData {
  generatedAt: string | null;
  totalCards: number;
  cards: PendingCard[];
}

interface PushResult {
  implemented: number;
  denied: number;
  approvedCardsFile: string;
  remainingCards: number;
  nextStep: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const PRIORITY_COLOUR: Record<CardPriority, string> = {
  urgent: "text-red-400 bg-red-400/10 border-red-400/30",
  high: "text-orange-400 bg-orange-400/10 border-orange-400/30",
  medium: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  low: "text-gray-400 bg-gray-400/10 border-gray-400/20",
};

const TYPE_COLOUR: Record<CardType, string> = {
  improvement: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  feature: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  docs: "text-teal-400 bg-teal-400/10 border-teal-400/20",
  bug: "text-red-400 bg-red-400/10 border-red-400/20",
};

function Badge({
  label,
  colourClass,
}: {
  label: string;
  colourClass: string;
}) {
  return (
    <span
      className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border ${colourClass}`}
    >
      {label.toUpperCase()}
    </span>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function PendingCardsReview() {
  const [data, setData] = useState<PendingCardsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // approval state: index → 'pending' | 'approved' | 'denied'
  const [approvalState, setApprovalState] = useState<
    Record<number, ApprovalState>
  >({});
  const [denialReasons, setDenialReasons] = useState<Record<number, string>>(
    {},
  );
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());

  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<PushResult | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // ── Fetch cards ────────────────────────────────────────────────────────────

  const fetchCards = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/cards/pending");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as PendingCardsData;
      setData(json);
      // Initialize all new cards as pending
      const initial: Record<number, ApprovalState> = {};
      json.cards.forEach((_, i) => {
        if (approvalState[i] === undefined) initial[i] = "pending";
      });
      setApprovalState((prev) => ({ ...initial, ...prev }));
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  // ── Per-card actions ───────────────────────────────────────────────────────

  const setCardState = (index: number, state: ApprovalState) => {
    setApprovalState((prev) => ({ ...prev, [index]: state }));
  };

  const toggleExpanded = (index: number) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  // ── Project bulk actions ───────────────────────────────────────────────────

  const setProjectState = (
    projectCards: Array<{ index: number }>,
    state: ApprovalState,
  ) => {
    setApprovalState((prev) => {
      const next = { ...prev };
      for (const { index } of projectCards) next[index] = state;
      return next;
    });
  };

  // ── Push ──────────────────────────────────────────────────────────────────

  const handlePush = async () => {
    if (!data) return;
    setPushing(true);
    setPushResult(null);
    setPushError(null);

    const approvedIndices = data.cards
      .map((_, i) => i)
      .filter((i) => approvalState[i] === "approved");

    const deniedItems = data.cards
      .map((_, i) => i)
      .filter((i) => approvalState[i] === "denied")
      .map((i) => ({ index: i, reason: denialReasons[i] ?? "" }));

    if (approvedIndices.length === 0 && deniedItems.length === 0) {
      setPushError("No approved or denied cards to process. Approve some cards first.");
      setPushing(false);
      return;
    }

    try {
      const res = await fetch("/api/cards/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "implement", approvedIndices, deniedItems }),
      });

      const json = await res.json();

      if (!res.ok) {
        setPushError(
          (json as { error?: string }).error ?? `HTTP ${res.status}`,
        );
      } else {
        setPushResult(json as PushResult);
        // Re-fetch to get updated card list
        await fetchCards();
        // Reset approval state for removed cards
        setApprovalState({});
        setDenialReasons({});
      }
    } catch (err) {
      setPushError(err instanceof Error ? err.message : String(err));
    } finally {
      setPushing(false);
    }
  };

  // ── Derived counts ─────────────────────────────────────────────────────────

  const approvedCount = Object.values(approvalState).filter(
    (s) => s === "approved",
  ).length;
  const deniedCount = Object.values(approvalState).filter(
    (s) => s === "denied",
  ).length;

  // ── Early exits ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="pt-2">
        <p className="text-xs text-gray-600 text-center py-3 animate-pulse">
          Loading pending cards…
        </p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="pt-2">
        <p className="text-xs text-red-400 text-center py-3">
          Failed to load cards: {fetchError}
        </p>
      </div>
    );
  }

  if (!data || data.cards.length === 0) {
    return (
      <div className="pt-2">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Pending Kanban Cards
          </h2>
        </div>
        <p className="text-xs text-gray-600 text-center py-4">
          No pending cards — run overnight analysis to generate cards
        </p>
      </div>
    );
  }

  // Group cards by project
  const grouped = data.cards.reduce<
    Record<string, Array<{ card: PendingCard; index: number }>>
  >((acc, card, index) => {
    if (!acc[card.project]) acc[card.project] = [];
    acc[card.project].push({ card, index });
    return acc;
  }, {});

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="pt-2 border-t border-gray-700/30">
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCollapsed((c) => !c)}
            className="text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-300 transition-colors flex items-center gap-1.5"
          >
            <span className="text-gray-600">{isCollapsed ? "▶" : "▼"}</span>
            Pending Kanban Cards
          </button>
          <span className="text-xs text-gray-500">
            {data.totalCards} card{data.totalCards !== 1 ? "s" : ""}
          </span>
          {data.generatedAt && (
            <span className="text-xs text-gray-700">
              from{" "}
              {new Date(data.generatedAt).toLocaleString("en-GB", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>

        {/* Push controls */}
        <div className="flex items-center gap-2 shrink-0">
          {approvedCount > 0 && (
            <span className="text-xs text-green-400">
              {approvedCount} approved
            </span>
          )}
          {deniedCount > 0 && (
            <span className="text-xs text-red-400">{deniedCount} denied</span>
          )}
          <button
            onClick={handlePush}
            disabled={pushing || (approvedCount === 0 && deniedCount === 0)}
            className="text-xs px-2.5 py-1 rounded bg-blue-700 hover:bg-blue-600 text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {pushing
              ? "Saving…"
              : approvedCount > 0
                ? `Save ${approvedCount} for Implementation`
                : "Save for Implementation"}
          </button>
        </div>
      </div>

      {/* Push result banner */}
      {pushResult && (
        <div className="mb-3 px-3 py-2 rounded text-xs flex items-start justify-between gap-2 bg-green-900/30 border border-green-700/40 text-green-300">
          <div>
            <span className="font-semibold">
              ✓ {pushResult.implemented} card{pushResult.implemented !== 1 ? "s" : ""} saved for implementation
            </span>
            {pushResult.denied > 0 && (
              <span className="ml-2 text-gray-400">
                · {pushResult.denied} archived
              </span>
            )}
            {pushResult.remainingCards > 0 && (
              <span className="ml-2 text-gray-500">
                · {pushResult.remainingCards} remaining
              </span>
            )}
            <p className="mt-1 text-[11px] text-gray-300">{pushResult.nextStep}</p>
          </div>
          <button
            onClick={() => setPushResult(null)}
            className="text-gray-500 hover:text-gray-300 shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* Push error banner */}
      {pushError && (
        <div className="mb-3 px-3 py-2 rounded bg-red-900/30 border border-red-700/40 text-red-300 text-xs flex items-start justify-between gap-2">
          <span>{pushError}</span>
          <button
            onClick={() => setPushError(null)}
            className="text-gray-500 hover:text-gray-300 shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* Card groups (collapsible) */}
      {!isCollapsed && (
        <div className="space-y-3">
          {Object.entries(grouped).map(([projectName, projectCards]) => {
            const projectApproved = projectCards.filter(
              ({ index }) => approvalState[index] === "approved",
            ).length;
            const projectDenied = projectCards.filter(
              ({ index }) => approvalState[index] === "denied",
            ).length;
            const allApproved = projectApproved === projectCards.length;
            const allDenied = projectDenied === projectCards.length;

            return (
              <div
                key={projectName}
                className="bg-gray-800/40 rounded border border-gray-700/30"
              >
                {/* Project header */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/20">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-200">
                      {projectName}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {projectCards.length} card
                      {projectCards.length !== 1 ? "s" : ""}
                    </span>
                    {projectApproved > 0 && (
                      <span className="text-[10px] text-green-400">
                        {projectApproved} ✓
                      </span>
                    )}
                    {projectDenied > 0 && (
                      <span className="text-[10px] text-red-400">
                        {projectDenied} ✕
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setProjectState(projectCards, "approved")}
                      disabled={allApproved}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-green-700/50 text-green-400 hover:bg-green-900/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Approve all
                    </button>
                    <button
                      onClick={() => setProjectState(projectCards, "denied")}
                      disabled={allDenied}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-red-700/50 text-red-400 hover:bg-red-900/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Deny all
                    </button>
                  </div>
                </div>

                {/* Cards */}
                <div className="divide-y divide-gray-700/20">
                  {projectCards.map(({ card, index }) => {
                    const state = approvalState[index] ?? "pending";
                    const isExpanded = expandedCards.has(index);
                    const rowClass =
                      state === "approved"
                        ? "bg-green-900/10"
                        : state === "denied"
                          ? "bg-red-900/10 opacity-60"
                          : "";

                    return (
                      <div
                        key={index}
                        className={`px-3 py-2 transition-colors ${rowClass}`}
                      >
                        <div className="flex items-start gap-2">
                          {/* Approve / Deny buttons */}
                          <div className="flex items-center gap-1 shrink-0 mt-0.5">
                            <button
                              onClick={() =>
                                setCardState(
                                  index,
                                  state === "approved" ? "pending" : "approved",
                                )
                              }
                              title="Approve"
                              className={`w-5 h-5 rounded text-[10px] font-bold border transition-colors flex items-center justify-center ${
                                state === "approved"
                                  ? "bg-green-600 border-green-500 text-white"
                                  : "border-gray-600 text-gray-500 hover:border-green-500 hover:text-green-400"
                              }`}
                            >
                              ✓
                            </button>
                            <button
                              onClick={() =>
                                setCardState(
                                  index,
                                  state === "denied" ? "pending" : "denied",
                                )
                              }
                              title="Deny"
                              className={`w-5 h-5 rounded text-[10px] font-bold border transition-colors flex items-center justify-center ${
                                state === "denied"
                                  ? "bg-red-700 border-red-600 text-white"
                                  : "border-gray-600 text-gray-500 hover:border-red-500 hover:text-red-400"
                              }`}
                            >
                              ✕
                            </button>
                          </div>

                          {/* Card content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 mb-1">
                              <Badge
                                label={card.priority}
                                colourClass={PRIORITY_COLOUR[card.priority] ?? "text-gray-400 bg-gray-400/10 border-gray-600"}
                              />
                              <Badge
                                label={card.type}
                                colourClass={TYPE_COLOUR[card.type as CardType] ?? "text-gray-400 bg-gray-400/10 border-gray-600"}
                              />
                              <span
                                className={`text-xs leading-snug font-medium ${
                                  state === "denied"
                                    ? "text-gray-500 line-through"
                                    : "text-gray-200"
                                }`}
                              >
                                {card.title}
                              </span>
                            </div>

                            {/* Expand/collapse body */}
                            <button
                              onClick={() => toggleExpanded(index)}
                              className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
                            >
                              {isExpanded ? "▲ hide details" : "▼ show details"}
                            </button>

                            {isExpanded && (
                              <p className="mt-1.5 text-[11px] text-gray-400 leading-relaxed">
                                {card.body}
                              </p>
                            )}

                            {/* Denial reason input */}
                            {state === "denied" && (
                              <input
                                type="text"
                                placeholder="Reason for denial (optional)"
                                value={denialReasons[index] ?? ""}
                                onChange={(e) =>
                                  setDenialReasons((prev) => ({
                                    ...prev,
                                    [index]: e.target.value,
                                  }))
                                }
                                className="mt-1.5 w-full text-[11px] bg-gray-900/50 border border-gray-600/50 rounded px-2 py-1 text-gray-400 placeholder-gray-600 focus:outline-none focus:border-gray-500"
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
