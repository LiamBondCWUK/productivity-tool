"use client";

import { useState } from "react";
import type {
  InboxItem,
  PriorityInbox as PriorityInboxType,
} from "../types/dashboard";

interface Props {
  inbox: PriorityInboxType;
  onClear: (id: string) => Promise<void>;
}

function formatDeadlineCountdown(deadline: string): string {
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return "OVERDUE";
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function InboxItemRow({
  item,
  onClear,
}: {
  item: InboxItem;
  onClear?: (id: string) => Promise<void>;
}) {
  const [clearing, setClearing] = useState(false);
  const isClearable =
    item.type === "jira-comment" || item.type === "doc-comment";
  const isJira = item.jiraKey !== undefined;

  const handleClear = async () => {
    if (!onClear) return;
    setClearing(true);
    try {
      await onClear(item.id);
    } finally {
      setClearing(false);
    }
  };

  const typeIcon =
    item.type === "jira"
      ? "🎫"
      : item.type === "ai-suggestion"
        ? "🤖"
        : item.type === "teams"
          ? "💬"
          : item.type === "standing"
            ? "📌"
            : item.type === "jira-comment"
              ? "@"
              : item.type === "doc-comment"
                ? "📝"
                : "□";

  return (
    <div className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-gray-700/50 transition-colors group">
      <span className="text-gray-400 text-xs mt-0.5 shrink-0 font-mono">
        {typeIcon}
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
        {item.commentSnippet && (
          <p className="text-gray-500 text-xs truncate mt-0.5 italic">
            {item.commentAuthor ? `${item.commentAuthor}: ` : ""}
            {item.commentSnippet}
          </p>
        )}
        {item.reasoning && (
          <p className="text-gray-500 text-xs truncate mt-0.5 italic">
            {item.reasoning}
          </p>
        )}
        {item.installCommand && (
          <code className="text-[10px] text-green-400 bg-gray-900/60 rounded px-1.5 py-0.5 mt-0.5 inline-block font-mono">
            {item.installCommand}
          </code>
        )}
        {item.filePath && (
          <p className="text-gray-500 text-xs truncate mt-0.5">
            {item.filePath}
          </p>
        )}
        {item.slaDeadline && (
          <span className="text-red-400 text-xs">
            SLA: {formatDeadlineCountdown(item.slaDeadline)}
          </span>
        )}
        {item.deadlineLabel && !item.slaDeadline && (
          <span className="text-yellow-400 text-xs">{item.deadlineLabel}</span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {item.link && (
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 hover:text-blue-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          >
            ↗
          </a>
        )}
        {isClearable && onClear && (
          <button
            onClick={handleClear}
            disabled={clearing}
            title={
              item.type === "doc-comment"
                ? "Resolve comment in document"
                : "Mark notification as read"
            }
            className="text-xs text-gray-600 hover:text-green-400 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed px-1"
          >
            {clearing ? "…" : "✓"}
          </button>
        )}
      </div>
    </div>
  );
}

export function PriorityInbox({ inbox, onClear }: Props) {
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
                <InboxItemRow key={item.id} item={item} onClear={onClear} />
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
                <InboxItemRow key={item.id} item={item} onClear={onClear} />
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
                <InboxItemRow key={item.id} item={item} onClear={onClear} />
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
              <InboxItemRow key={item.id} item={item} onClear={onClear} />
            ))}
        </section>
      </div>
    </div>
  );
}
