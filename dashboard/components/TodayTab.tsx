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
  onClearNotification: (id: string) => Promise<void>;
  onRefetch: () => void;
}

export function TodayTab({
  inbox,
  calendarToday,
  calendarWeekAhead,
  calendarHasToken,
  timeTracker,
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
        <AISchedule onRefetch={onRefetch} />
      </div>

      {/* Right - Calendar + Active Window + Teams/Email + Manual Time Tracker */}
      <div className="flex flex-col overflow-hidden divide-y divide-gray-700/50">
        {/* Calendar */}
        <div
          className="p-4 flex flex-col overflow-hidden"
          style={{ maxHeight: "35vh" }}
        >
          <CalendarPanel
            today={calendarToday}
            weekAhead={calendarWeekAhead}
            hasToken={calendarHasToken}
          />
        </div>

        {/* Active Window Tracker (auto) */}
        <div className="p-4 overflow-y-auto shrink-0" style={{ maxHeight: "18vh" }}>
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
