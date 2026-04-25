"use client";

import { useState } from "react";
import { useExecuteCommand } from "../hooks/useExecuteCommand";
import { RunButton, StatusBanner } from "./RunButton";

interface CeremoniesTabProps {
  embedUrl: string;
}

export function CeremoniesTab({ embedUrl }: CeremoniesTabProps) {
  const { execute, running, lastResult } = useExecuteCommand();
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [iframeError, setIframeError] = useState(false);

  const hasUrl = Boolean(embedUrl);

  const handleRegenerate = async () => {
    setShowResult(true);
    const result = await execute("refresh-ceremonies");
    if (result.success) {
      setLastRefreshed(new Date().toISOString());
    }
  };

  return (
    <div className="h-full p-4 flex flex-col min-h-0">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-100">Sprint Operations</h2>
          <p className="text-xs text-gray-400 mt-1">
            Embedded ceremony dashboard for standup, planning, refinement, demo, and retro prep.
          </p>
          {lastRefreshed && (
            <p className="text-xs text-green-400/70 mt-1">
              Last refreshed:{" "}
              {new Date(lastRefreshed).toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <RunButton
            label="↻ Regenerate Data"
            runningLabel="Regenerating…"
            running={running === "refresh-ceremonies"}
            onClick={handleRegenerate}
          />
          <a
            href={embedUrl}
            target="_blank"
            rel="noreferrer"
            className="px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
          >
            Open in New Tab
          </a>
        </div>
      </div>

      {showResult && lastResult && (
        <div className="mb-2">
          <StatusBanner
            success={lastResult.success}
            error={lastResult.error}
            durationMs={lastResult.durationMs}
            onDismiss={() => setShowResult(false)}
          />
        </div>
      )}

      <div className="flex-1 min-h-0 rounded border border-gray-700 overflow-hidden">
        {hasUrl && !iframeError ? (
          <iframe
            title="Ceremony Dashboard"
            src={embedUrl}
            className="w-full h-full bg-gray-950"
            onError={() => setIframeError(true)}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            <div className="text-center space-y-2">
              <p>Ceremony dashboard embed not available</p>
              <p className="text-xs text-gray-600">
                Use &quot;Regenerate Data&quot; to fetch latest ceremony data from Jira,
                or set NEXT_PUBLIC_CEREMONIES_URL to an external ceremony server.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
