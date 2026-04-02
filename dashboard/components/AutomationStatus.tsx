"use client";

import { useState } from "react";
import type { AutomationRule, AutomationRuleStatus } from "../types/dashboard";

interface Props {
  rules: AutomationRule[];
  lastChecked: string | null;
  onRefetch: () => void;
}

const STATUS_CONFIG: Record<
  AutomationRuleStatus,
  { label: string; textClass: string; bgClass: string }
> = {
  pending: {
    label: "Pending",
    textClass: "text-yellow-400",
    bgClass: "bg-yellow-400/10",
  },
  deployed: {
    label: "Deployed",
    textClass: "text-green-400",
    bgClass: "bg-green-400/10",
  },
  blocked: {
    label: "Blocked",
    textClass: "text-red-400",
    bgClass: "bg-red-400/10",
  },
  disabled: {
    label: "Disabled",
    textClass: "text-gray-500",
    bgClass: "bg-gray-500/10",
  },
};

const PHASE_ORDER: Record<string, number> = {
  "1.1": 1,
  "1.2": 2,
  "1.3": 3,
  "1.4": 4,
  "2.1": 5,
  "2.2": 6,
};

export function AutomationStatus({ rules, lastChecked, onRefetch }: Props) {
  const [updating, setUpdating] = useState<string | null>(null);

  const sortedRules = [...rules].sort(
    (a, b) => (PHASE_ORDER[a.phase] ?? 99) - (PHASE_ORDER[b.phase] ?? 99),
  );

  const deployedCount = rules.filter((r) => r.status === "deployed").length;
  const blockedCount = rules.filter((r) => r.status === "blocked").length;

  async function updateRuleStatus(
    ruleId: string,
    status: AutomationRuleStatus,
    blockedReason?: string,
  ) {
    setUpdating(ruleId);
    try {
      await fetch("/api/automation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleId, status, blockedReason }),
      });
      onRefetch();
    } finally {
      setUpdating(null);
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Automation Rules
        </h2>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-green-400">
            {deployedCount}/{rules.length} live
          </span>
          {blockedCount > 0 && (
            <span className="text-red-400">{blockedCount} blocked</span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
        {sortedRules.map((rule) => {
          const cfg = STATUS_CONFIG[rule.status];
          const isUpdating = updating === rule.id;

          return (
            <div
              key={rule.id}
              className="rounded bg-gray-800/50 border border-gray-700/40 p-2.5"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                    <span className="text-gray-500 text-xs font-mono shrink-0">
                      {rule.phase}
                    </span>
                    <span
                      className={[
                        "text-xs px-1.5 py-0.5 rounded font-medium shrink-0",
                        cfg.textClass,
                        cfg.bgClass,
                      ].join(" ")}
                    >
                      {cfg.label}
                    </span>
                    {rule.status === "blocked" && rule.blockedReason && (
                      <span className="text-xs text-red-300/70 truncate">
                        {rule.blockedReason}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-gray-200 font-medium leading-tight truncate">
                    {rule.name}
                  </p>

                  <p className="text-xs text-gray-500 leading-tight mt-0.5 line-clamp-2">
                    {rule.description}
                  </p>

                  {rule.verificationCheck && rule.status !== "deployed" && (
                    <p className="text-xs text-blue-400/60 mt-1 leading-tight line-clamp-1">
                      ✓ {rule.verificationCheck}
                    </p>
                  )}

                  {rule.deployedAt && (
                    <p className="text-xs text-gray-600 mt-1">
                      {new Date(rule.deployedAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1 shrink-0">
                  {rule.jiraLink && (
                    <a
                      href={rule.jiraLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs px-2 py-0.5 bg-blue-900/40 hover:bg-blue-800/50 text-blue-300 rounded transition-colors"
                    >
                      Open
                    </a>
                  )}
                  {rule.status === "pending" && (
                    <button
                      onClick={() => updateRuleStatus(rule.id, "deployed")}
                      disabled={isUpdating}
                      className="text-xs px-2 py-0.5 bg-green-900/40 hover:bg-green-800/60 text-green-300 rounded transition-colors disabled:opacity-50"
                    >
                      {isUpdating ? "…" : "Done"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {lastChecked && (
        <p className="text-xs text-gray-600 mt-2 shrink-0">
          Updated{" "}
          {new Date(lastChecked).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      )}
    </div>
  );
}
