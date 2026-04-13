"use client";

import { AutomationStatus } from "./AutomationStatus";
import { useExecuteCommand } from "../hooks/useExecuteCommand";
import { RunButton, StatusBanner } from "./RunButton";
import type { AutomationRule } from "../types/dashboard";

interface AutomationTabProps {
  rules: AutomationRule[];
  lastChecked: string | null;
  onRefetch: () => void;
}

export function AutomationTab({ rules, lastChecked, onRefetch }: AutomationTabProps) {
  const { execute, running, lastResult } = useExecuteCommand();

  async function handleVerify() {
    await execute("check-automation-status");
    onRefetch();
  }

  const deployedCount = rules.filter((r) => r.status === "deployed").length;
  const pendingCount = rules.filter((r) => r.status === "pending").length;
  const blockedCount = rules.filter((r) => r.status === "blocked").length;

  return (
    <div className="h-full flex flex-col overflow-hidden p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-100">Automation Rules</h2>
          <p className="text-xs text-gray-400 mt-1">
            Jira automation rules and their deployment status. Verify checks live Jira API to sync
            actual rule states.
          </p>
          <div className="flex gap-2 mt-2">
            <span className="text-xs px-1.5 py-0.5 rounded bg-green-900/40 text-green-300">
              {deployedCount} deployed
            </span>
            {pendingCount > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-900/40 text-yellow-300">
                {pendingCount} pending
              </span>
            )}
            {blockedCount > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-red-900/40 text-red-300">
                {blockedCount} blocked
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <RunButton
            label="⚡ Verify Status"
            onClick={handleVerify}
            running={!!running}
            variant="secondary"
          />
          {lastChecked && (
            <span className="text-xs text-gray-600">
              Last checked{" "}
              {new Date(lastChecked).toLocaleString("en-GB", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
      </div>
      <StatusBanner success={lastResult?.success} error={lastResult?.error} durationMs={lastResult?.durationMs} />
      <div className="flex-1 min-h-0 overflow-hidden">
        <AutomationStatus rules={rules} lastChecked={lastChecked} onRefetch={onRefetch} />
      </div>
    </div>
  );
}
