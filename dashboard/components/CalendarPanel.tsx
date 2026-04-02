"use client";

import type { CalendarEvent } from "../types/dashboard";

interface Props {
  today: CalendarEvent[];
  weekAhead: CalendarEvent[];
  hasToken: boolean;
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function EventRow({ event }: { event: CalendarEvent }) {
  return (
    <div
      className={`flex items-start gap-2 py-1 ${event.isCompleted ? "opacity-50" : ""}`}
    >
      <span className="text-gray-500 text-xs w-10 shrink-0 font-mono">
        {formatTime(event.startTime)}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {event.isFocusBlock && (
            <span className="text-blue-400 text-xs shrink-0">[FOCUS]</span>
          )}
          <span
            className={`text-sm truncate ${event.isCompleted ? "line-through text-gray-500" : "text-gray-200"}`}
          >
            {event.title}
          </span>
          {event.isCompleted && (
            <span className="text-green-400 text-xs shrink-0">✓</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function CalendarPanel({ today, weekAhead, hasToken }: Props) {
  const safeWeekAhead = weekAhead ?? [];
  const todayEvents = (today ?? []).sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Today&apos;s Calendar
        </h2>
        {!hasToken && (
          <span className="text-yellow-600 text-xs">
            No token — run setup-graph-token.ps1
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
        {/* Today */}
        <section>
          {todayEvents.length === 0 ? (
            <p className="text-gray-600 text-xs px-1">
              {hasToken
                ? "No meetings today"
                : "Calendar unavailable — run /focus to set up Graph API"}
            </p>
          ) : (
            todayEvents.map((event) => (
              <EventRow key={event.id} event={event} />
            ))
          )}
        </section>

        {/* Week ahead */}
        {safeWeekAhead.length > 0 && (
          <section>
            <p className="text-gray-500 text-xs font-semibold mb-2 uppercase tracking-wide">
              Week Ahead
            </p>
            {safeWeekAhead.map((event) => (
              <div key={event.id} className="flex items-center gap-2 py-0.5">
                <span className="text-gray-600 text-xs w-16 shrink-0">
                  {new Date(event.startTime).toLocaleDateString("en-GB", {
                    weekday: "short",
                  })}
                </span>
                <span className="text-gray-400 text-xs truncate">
                  {event.title}
                </span>
              </div>
            ))}
          </section>
        )}

        {/* Focus block CTA */}
        <div className="pt-1 border-t border-gray-700/50">
          <p className="text-gray-600 text-xs">
            Schedule a focus block:{" "}
            <code className="text-blue-400">/focus TICKET 90m</code>
          </p>
        </div>
      </div>
    </div>
  );
}
