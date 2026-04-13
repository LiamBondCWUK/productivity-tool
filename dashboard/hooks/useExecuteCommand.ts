"use client";

import { useState, useCallback } from "react";

interface ExecuteResult {
  success?: boolean;
  error?: string;
  output?: string;
  durationMs?: number;
  command?: string;
}

export function useExecuteCommand() {
  const [running, setRunning] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ExecuteResult | null>(null);

  const execute = useCallback(
    async (command: string, args?: string[]): Promise<ExecuteResult> => {
      setRunning(command);
      setLastResult(null);
      try {
        const res = await fetch("/api/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command, args }),
        });
        const result: ExecuteResult = await res.json();
        setLastResult(result);
        return result;
      } catch (err) {
        const result: ExecuteResult = {
          error: err instanceof Error ? err.message : "Network error",
          command,
        };
        setLastResult(result);
        return result;
      } finally {
        setRunning(null);
      }
    },
    [],
  );

  return { execute, running, lastResult };
}
