"use client";

import { useState, useEffect, useCallback } from "react";
import type { DashboardData } from "../types/dashboard";

export function useDashboardData() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch("/api/data");
      if (!response.ok) throw new Error("Failed to fetch dashboard data");
      const freshData = (await response.json()) as DashboardData;
      setData(freshData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    const eventSource = new EventSource("/api/events");

    eventSource.onmessage = (event) => {
      const payload = JSON.parse(event.data) as { type: string };
      if (payload.type === "update") {
        fetchData();
      }
    };

    eventSource.onerror = () => {
      // SSE reconnects automatically — no action needed
    };

    return () => {
      eventSource.close();
    };
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
