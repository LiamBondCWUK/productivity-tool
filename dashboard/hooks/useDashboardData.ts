"use client";

import { useState, useEffect, useCallback } from "react";
import type { CalendarEvent, DashboardData } from "../types/dashboard";

interface LegacyCalendarEvent {
  id?: string;
  title?: string;
  start?: string;
  end?: string;
  startTime?: string;
  endTime?: string;
  isFocusBlock?: boolean;
  isCompleted?: boolean;
  status?: string;
  past?: boolean;
}

interface LegacyCalendarShape {
  lastRefreshed?: string | null;
  hasToken?: boolean;
  source?: string;
  today?: LegacyCalendarEvent[];
  weekAhead?: LegacyCalendarEvent[];
  events?: LegacyCalendarEvent[];
}

type DashboardApiData = Omit<DashboardData, "calendar"> & {
  calendar?: LegacyCalendarShape;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizeCalendarEvent(event: LegacyCalendarEvent): CalendarEvent {
  const startTime = event.startTime ?? event.start ?? new Date(0).toISOString();
  const endTime = event.endTime ?? event.end ?? startTime;

  return {
    id: event.id ?? `${event.title ?? "event"}-${startTime}`,
    title: event.title ?? "Untitled event",
    startTime,
    endTime,
    isFocusBlock: event.isFocusBlock ?? false,
    isCompleted: event.isCompleted ?? event.past ?? event.status === "completed",
  };
}

function isSameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function normalizeCalendar(calendar: unknown): DashboardData["calendar"] {
  const fallback: DashboardData["calendar"] = {
    lastRefreshed: null,
    hasToken: false,
    today: [],
    weekAhead: [],
  };

  if (!isRecord(calendar)) {
    return fallback;
  }

  const rawCalendar = calendar as LegacyCalendarShape;
  const lastRefreshed = asString(rawCalendar.lastRefreshed) ?? null;

  if (Array.isArray(rawCalendar.today) || Array.isArray(rawCalendar.weekAhead)) {
    return {
      lastRefreshed,
      hasToken:
        typeof rawCalendar.hasToken === "boolean"
          ? rawCalendar.hasToken
          : rawCalendar.source !== "mock",
      today: Array.isArray(rawCalendar.today)
        ? rawCalendar.today.map(normalizeCalendarEvent)
        : [],
      weekAhead: Array.isArray(rawCalendar.weekAhead)
        ? rawCalendar.weekAhead.map(normalizeCalendarEvent)
        : [],
    };
  }

  const allEvents = Array.isArray(rawCalendar.events)
    ? rawCalendar.events.map(normalizeCalendarEvent)
    : [];
  const now = new Date();

  return {
    lastRefreshed,
    hasToken:
      typeof rawCalendar.hasToken === "boolean"
        ? rawCalendar.hasToken
        : rawCalendar.source !== "mock",
    today: allEvents.filter((event) => isSameLocalDay(new Date(event.startTime), now)),
    weekAhead: allEvents.filter((event) => {
      const eventDate = new Date(event.startTime);
      return !Number.isNaN(eventDate.getTime()) && !isSameLocalDay(eventDate, now);
    }),
  };
}

function normalizeDashboardData(raw: unknown): DashboardData {
  const data = raw as DashboardApiData;

  return {
    ...data,
    calendar: normalizeCalendar(data.calendar),
  } as DashboardData;
}

export function useDashboardData() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch("/api/data");
      if (!response.ok) throw new Error("Failed to fetch dashboard data");
      const freshData = normalizeDashboardData(await response.json());
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
