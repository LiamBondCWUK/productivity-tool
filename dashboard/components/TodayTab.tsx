"use client";

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
  onClearNotification: (id: string) => Promise<void>;
  onRefetch: () => void;
}

export function TodayTab({
  inbox,
  calendarToday,
  calendarWeekAhead,
  calendarHasToken,
  timeTracker,
  standupUrl,
  onClearNotification,
  onRefetch,
}: TodayTabProps) {
  return (
    <div className="h-full grid grid-cols-[320px_1fr_280px] min-h-0 overflow-hidden">
      {/* Left - Priority Inbox */}
      <div className="border-r border-gray-700/50 p-4 flex flex-col overflow-hidden">
        <PriorityInbox inbox={inbox} onClear={onClearNotification} />
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
