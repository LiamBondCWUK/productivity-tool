"use client";

import { useState } from "react";
import { TaskDetail } from "./TaskDetail";
import type { PriorityInbox, InboxItem } from "../types/dashboard";

interface TasksTabProps {
  inbox: PriorityInbox;
}

const PRIORITY_BADGE: Record<string, string> = {
  urgent: "bg-red-500/20 text-red-300",
  today: "bg-yellow-500/20 text-yellow-300",
  backlog: "bg-gray-600/40 text-gray-400",
};

function TaskRow({
  item,
  selected,
  onClick,
}: {
  item: InboxItem;
  selected: boolean;
  onClick: () => void;
}) {
  const badgeClass = PRIORITY_BADGE[item.priority ?? "backlog"];
  return (
    <button
      onClick={onClick}
      className={[
        "w-full text-left px-3 py-2.5 rounded transition-colors border",
        selected
          ? "bg-blue-600/20 border-blue-600/40"
          : "bg-transparent border-transparent hover:bg-gray-700/40 hover:border-gray-600/30",
      ].join(" ")}
    >
      <div className="flex items-start gap-2">
        <span
          className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${badgeClass}`}
        >
          {item.priority ?? "backlog"}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-200 truncate leading-snug">
            {item.jiraKey && (
              <span className="font-mono text-gray-500 mr-1">
                {item.jiraKey}
              </span>
            )}
            {item.title}
          </p>
          {item.commentSnippet && (
            <p className="text-xs text-gray-500 truncate mt-0.5">
              {item.commentSnippet}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

export function TasksTab({ inbox }: TasksTabProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Flatten inbox into a single list, prioritised order
  const allItems: InboxItem[] = [
    ...inbox.urgent,
    ...inbox.today,
    ...inbox.aiSuggested,
    ...inbox.backlog,
  ];

  // Only show items that have a Jira key — others can't load detail
  const jiraItems = allItems.filter((item) => item.jiraKey);
  const nonJiraItems = allItems.filter((item) => !item.jiraKey);

  function handleSelect(item: InboxItem) {
    if (item.jiraKey) {
      setSelectedKey(item.jiraKey === selectedKey ? null : item.jiraKey);
    }
  }

  const selectedItem = allItems.find((i) => i.jiraKey === selectedKey) ?? null;

  return (
    <div className="h-full flex min-h-0">
      {/* Left pane — 20% task list */}
      <div className="w-[220px] shrink-0 border-r border-gray-700/50 flex flex-col overflow-hidden">
        <div className="px-3 py-2.5 border-b border-gray-700/50 shrink-0">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Tasks ({allItems.length})
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {jiraItems.length > 0 && (
            <>
              {jiraItems.map((item) => (
                <TaskRow
                  key={item.id}
                  item={item}
                  selected={item.jiraKey === selectedKey}
                  onClick={() => handleSelect(item)}
                />
              ))}
            </>
          )}
          {nonJiraItems.length > 0 && (
            <>
              {jiraItems.length > 0 && (
                <div className="text-xs text-gray-600 px-2 pt-2 pb-1">
                  Other
                </div>
              )}
              {nonJiraItems.map((item) => (
                <TaskRow
                  key={item.id}
                  item={item}
                  selected={false}
                  onClick={() => {}}
                />
              ))}
            </>
          )}
          {allItems.length === 0 && (
            <p className="text-xs text-gray-600 text-center py-6">
              Inbox is empty
            </p>
          )}
        </div>
      </div>

      {/* Right pane — 80% detail */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {selectedItem?.jiraKey ? (
          <TaskDetail jiraKey={selectedItem.jiraKey} />
        ) : (
          <TaskDetail jiraKey={null} />
        )}
      </div>
    </div>
  );
}
