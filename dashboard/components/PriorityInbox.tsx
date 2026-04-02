"use client";

import { useState } from "react";
import type {
  InboxItem,
  PriorityInbox as PriorityInboxType,
} from "../types/dashboard";

interface Props {
  inbox: PriorityInboxType;
}

function formatDeadlineCountdown(deadline: string): string {
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return "OVERDUE";
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function InboxItemRow({ item }: { item: InboxItem }) {
  const isJira = item.jiraKey !== undefined;
  return (
    <div className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-gray-700/50 transition-colors group">
      <span className="text-gray-400 text-xs mt-0.5 shrink-0">
        {item.type === "jira"
          ? "🎫"
          : item.type === "ai-suggestion"
            ? "🤖"
            : item.type === "teams"
              ? "💬"
              : item.type === "standing"
                ? "📌"
                : "□"}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {isJira && (
            <span className="text-blue-400 text-xs font-mono shrink-0">
              {item.jiraKey}
            </span>
          )}
          <span className="text-gray-200 text-sm truncate">{item.title}</span>
        </div>
        {item.slaDeadline && (
          <span className="text-red-400 text-xs">
            SLA: {formatDeadlineCountdown(item.slaDeadline)}
          </span>
        )}
        {item.deadlineLabel && !item.slaDeadline && (
          <span className="text-yellow-400 text-xs">{item.deadlineLabel}</span>
        )}
      </div>
      {item.link && (
        <a
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-500 hover:text-blue-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        >
          ↗
        </a>
      )}
    </div>
  );
}

export function PriorityInbox({ inbox }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleSection = (section: string) => {
    setCollapsed((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const totalCount =
    inbox.urgent.length +
    inbox.aiSuggested.length +
    inbox.today.length +
    inbox.backlog.length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Priority Inbox
        </h2>
        {totalCount > 0 && (
          <span className="text-xs text-gray-500">{totalCount} items</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
        {/* URGENT */}
        {inbox.urgent.length > 0 && (
          <section>
            <button
              onClick={() => toggleSection("urgent")}
              className="flex items-center gap-1.5 mb-1 w-full text-left"
            >
              <span className="text-red-400 text-xs font-bold">🔴 URGENT</span>
              <span className="text-red-400/60 text-xs">
                ({inbox.urgent.length})
              </span>
            </button>
            {!collapsed["urgent"] &&
              inbox.urgent.map((item) => (
                <InboxItemRow key={item.id} item={item} />
              ))}
          </section>
        )}

        {/* AI SUGGESTED */}
        {inbox.aiSuggested.length > 0 && (
          <section>
            <button
              onClick={() => toggleSection("ai")}
              className="flex items-center gap-1.5 mb-1 w-full text-left"
            >
              <span className="text-purple-400 text-xs font-bold">
                🤖 AI SUGGESTED
              </span>
              <span className="text-purple-400/60 text-xs">
                ({inbox.aiSuggested.length})
              </span>
            </button>
            {!collapsed["ai"] &&
              inbox.aiSuggested.map((item) => (
                <InboxItemRow key={item.id} item={item} />
              ))}
          </section>
        )}

        {/* TODAY */}
        <section>
          <button
            onClick={() => toggleSection("today")}
            className="flex items-center gap-1.5 mb-1 w-full text-left"
          >
            <span className="text-yellow-400 text-xs font-bold">🟡 TODAY</span>
            <span className="text-yellow-400/60 text-xs">
              ({inbox.today.length})
            </span>
          </button>
          {!collapsed["today"] &&
            (inbox.today.length > 0 ? (
              inbox.today.map((item) => (
                <InboxItemRow key={item.id} item={item} />
              ))
            ) : (
              <p className="text-gray-600 text-xs px-2">Run /gm to populate</p>
            ))}
        </section>

        {/* BACKLOG */}
        <section>
          <button
            onClick={() => toggleSection("backlog")}
            className="flex items-center gap-1.5 mb-1 w-full text-left"
          >
            <span className="text-blue-400 text-xs font-bold">🔵 BACKLOG</span>
            <span className="text-blue-400/60 text-xs">
              ({inbox.backlog.length})
            </span>
          </button>
          {!collapsed["backlog"] &&
            inbox.backlog.map((item) => (
              <InboxItemRow key={item.id} item={item} />
            ))}
        </section>
      </div>
    </div>
  );
}
