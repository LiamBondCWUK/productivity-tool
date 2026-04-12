"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Suspense } from "react";

type TabId =
  | "today"
  | "tasks"
  | "projects"
  | "notes"
  | "ceremonies"
  | "docs"
  | "learning"
  | "news"
  | "system";

const TABS: { id: TabId; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "tasks", label: "Tasks" },
  { id: "projects", label: "Projects" },
  { id: "notes", label: "Notes" },
  { id: "ceremonies", label: "Ceremonies" },
  { id: "docs", label: "Doc Health" },
  { id: "learning", label: "Analysis" },
  { id: "news", label: "News" },
  { id: "system", label: "System" },
];

interface TabWorkspaceProps {
  todayContent: React.ReactNode;
  tasksContent: React.ReactNode;
  projectsContent: React.ReactNode;
  notesContent: React.ReactNode;
  ceremoniesContent: React.ReactNode;
  docsContent: React.ReactNode;
  learningContent: React.ReactNode;
  newsContent: React.ReactNode;
  systemContent: React.ReactNode;
}

function TabBar({ activeTab }: { activeTab: TabId }) {
  const router = useRouter();
  const pathname = usePathname();

  function navigate(tabId: TabId) {
    const params = new URLSearchParams();
    params.set("tab", tabId);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <nav className="flex items-center gap-1 px-4 py-2 bg-gray-800/60 border-b border-gray-700/50 shrink-0">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => navigate(tab.id)}
          className={[
            "px-3 py-1 text-xs rounded font-medium transition-colors",
            activeTab === tab.id
              ? "bg-blue-600 text-white"
              : "text-gray-400 hover:text-gray-200 hover:bg-gray-700/50",
          ].join(" ")}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

function TabWorkspaceInner({
  todayContent,
  tasksContent,
  projectsContent,
  notesContent,
  ceremoniesContent,
  docsContent,
  learningContent,
  newsContent,
  systemContent,
}: TabWorkspaceProps) {
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab") ?? "today";
  const activeTab: TabId = TABS.some((t) => t.id === rawTab)
    ? (rawTab as TabId)
    : "today";

  const contentMap: Record<TabId, React.ReactNode> = {
    today: todayContent,
    tasks: tasksContent,
    projects: projectsContent,
    notes: notesContent,
    ceremonies: ceremoniesContent,
    docs: docsContent,
    learning: learningContent,
    news: newsContent,
    system: systemContent,
  };

  return (
    <>
      <TabBar activeTab={activeTab} />
      <div className="flex-1 min-h-0 overflow-hidden">
        {contentMap[activeTab]}
      </div>
    </>
  );
}

export function TabWorkspace(props: TabWorkspaceProps) {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
          Loading...
        </div>
      }
    >
      <TabWorkspaceInner {...props} />
    </Suspense>
  );
}
