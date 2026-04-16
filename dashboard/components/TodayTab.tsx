"use client";

import { useState } from "react";
import { PriorityInbox } from "./PriorityInbox";
import { CalendarPanel } from "./CalendarPanel";
import { TimeTracker } from "./TimeTracker";
import { ActiveWindow } from "./ActiveWindow";
import { AISchedule } from "./AISchedule";
import { TeamMessages } from "./TeamMessages";
import type {
  PriorityInbox as PriorityInboxType,
  CalendarEvent,
  TimeTracker as TimeTrackerType,
} from "../types/dashboard";

interface TodayTabProps {
  inbox: PriorityInboxType;
  calendarToday: CalendarEvent[];
  calendarWeekAhead: CalendarEvent[];
  calendarHasToken: boolean;
  timeTracker: TimeTrackerType;
  standupUrl?: string;
  ibpMeta?: {
    lastGenerated: string | null;
    availableDates: string[];
  };
  onClearNotification: (id: string) => Promise<void>;
  onRefreshNotifications: () => Promise<void>;
  onRefetch: () => void;
}

export function TodayTab({
  inbox,
  calendarToday,
  calendarWeekAhead,
  calendarHasToken,
  timeTracker,
  standupUrl,
  ibpMeta,
  onClearNotification,
  onRefreshNotifications,
  onRefetch,
}: TodayTabProps) {
  const [submittingIbp, setSubmittingIbp] = useState(false);
  const [ibpMessage, setIbpMessage] = useState<string | null>(null);

  const latestIbpDate = ibpMeta?.availableDates?.[0] ?? null;

  async function handleFillIbpForm() {
    if (!latestIbpDate) return;
    setSubmittingIbp(true);
    setIbpMessage(null);

    try {
      const res = await fetch("/api/ibp/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: latestIbpDate, demo: false }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "Failed to start PowerApps fill");
      }

      setIbpMessage("PowerApps form fill started. Review and click Submit manually in browser.");
    } catch (err: unknown) {
      setIbpMessage(err instanceof Error ? err.message : "Failed to start PowerApps fill");
    } finally {
      setSubmittingIbp(false);
    }
  }

  return (
    <div className="h-full grid grid-cols-[320px_1fr_280px] min-h-0 overflow-hidden">
      {/* Left - Priority Inbox */}
      <div className="border-r border-gray-700/50 p-4 flex flex-col overflow-hidden">
        <PriorityInbox
          inbox={inbox}
          onClear={onClearNotification}
          onRefresh={onRefreshNotifications}
        />
      </div>

      {/* Center - AI Day Plan */}
      <div className="border-r border-gray-700/50 p-4 flex flex-col overflow-y-auto min-h-0">
        <div className="mb-4 rounded border border-blue-700/40 bg-blue-900/20 p-3">
          <p className="text-xs uppercase tracking-wide text-blue-300">Standup</p>
          <p className="text-sm text-gray-200 mt-1">
            Open today&apos;s sprint operations view directly from Command Center.
          </p>
          {standupUrl && (
            <a
              href={standupUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block mt-2 text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white"
            >
              Open Standup View
            </a>
          )}
        </div>
        <AISchedule onRefetch={onRefetch} />

        <div className="mt-4 rounded border border-emerald-700/40 bg-emerald-900/20 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-emerald-300">IBP Status</p>
              <p className="text-sm text-gray-200 mt-1">
                {latestIbpDate
                  ? `Latest IBP: ${latestIbpDate}`
                  : "No IBP generated yet."}
              </p>
              {ibpMeta?.lastGenerated && (
                <p className="text-xs text-gray-400 mt-1">
                  Last generated: {ibpMeta.lastGenerated}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <a
                href="?tab=ibp"
                className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-100"
              >
                View IBP Tab
              </a>
              <button
                onClick={handleFillIbpForm}
                disabled={!latestIbpDate || submittingIbp}
                className="text-xs px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-600 disabled:bg-gray-700 disabled:text-gray-500 text-white"
              >
                {submittingIbp ? "Starting…" : "Fill PowerApps Form"}
              </button>
            </div>
          </div>
          {ibpMessage && (
            <p className="text-xs text-emerald-200 mt-2">{ibpMessage}</p>
          )}
        </div>
      </div>

      {/* Right - Calendar + Active Window + Teams/Email + Manual Time Tracker */}
      <div className="flex flex-col overflow-hidden divide-y divide-gray-700/50">
        {/* Calendar */}
        <div className="p-4 flex flex-col overflow-hidden max-h-[35vh]">
          <CalendarPanel
            today={calendarToday}
            weekAhead={calendarWeekAhead}
            hasToken={calendarHasToken}
          />
        </div>

        {/* Active Window Tracker (auto) */}
        <div className="p-4 overflow-y-auto shrink-0 max-h-[18vh]">
          <ActiveWindow />
        </div>

        {/* Teams + Email Messages */}
        <div className="p-4 flex-1 overflow-y-auto min-h-0">
          <TeamMessages />
        </div>

        {/* Manual Time Tracker (legacy) */}
        <div className="p-4 flex flex-col overflow-hidden shrink-0">
          <TimeTracker tracker={timeTracker} onRefetch={onRefetch} />
        </div>
      </div>
    </div>
  );
}
