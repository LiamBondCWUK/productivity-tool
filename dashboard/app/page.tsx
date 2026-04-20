"use client";

import { useState, useEffect } from "react";
import { useDashboardData } from "../hooks/useDashboardData";
import { TabWorkspace } from "../components/TabWorkspace";
import { TodayTab } from "../components/TodayTab";
import { TasksTab } from "../components/TasksTab";
import { ProjectsTab } from "../components/ProjectsTab";
import { AutomationTab } from "../components/AutomationTab";
import { NotesTab } from "../components/NotesTab";
import { CeremoniesTab } from "../components/CeremoniesTab";
import { DocHealthTab } from "../components/DocHealthTab";
import { LearningTab } from "../components/LearningTab";
import { NewsTab } from "../components/NewsTab";
import { SystemTab } from "../components/tabs/SystemTab";
import { IBPTab } from "../components/IBPTab";
import { FeedbackTab } from "../components/FeedbackTab";
import type { ProjectPhase, ProjectSuggestion } from "../types/dashboard";

function formatCurrentTime(): string {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatCurrentDate(): string {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function ClockDisplay() {
  const [time, setTime] = useState(formatCurrentTime());
  useEffect(() => {
    const interval = setInterval(() => setTime(formatCurrentTime()), 30000);
    return () => clearInterval(interval);
  }, []);
  return <span className="font-mono">{time}</span>;
}

export default function Dashboard() {
  const { data, loading, error, refetch } = useDashboardData();

  const handlePhaseChange = async (projectId: string, phase: ProjectPhase) => {
    await fetch("/api/projects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, phase }),
    });
    refetch();
  };

  const handleClearNotification = async (id: string) => {
    await fetch(`/api/notifications?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    refetch();
  };

  const handleRefreshNotifications = async () => {
    await fetch("/api/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "refresh-notifications" }),
    });
    refetch();
  };

  const handleRefreshProjects = async () => {
    await fetch("/api/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "sync-projects" }),
    });
    refetch();
  };

  const handleRefreshAll = async () => {
    await fetch("/api/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "morning-orchestrator" }),
    });
    refetch();
  };

  const handleAddTask = async (
    suggestion: ProjectSuggestion,
    projectId: string,
    projectName: string,
  ) => {
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: suggestion.action,
        category: "feature",
        priority: suggestion.priority,
        effort: suggestion.effort,
        projectId,
        projectName,
        source: "overnight-suggestion",
      }),
    });
    refetch();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <p className="text-gray-500">Loading command center...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-2">Failed to load dashboard data</p>
          <p className="text-gray-500 text-sm">{error}</p>
          <button
            onClick={refetch}
            className="mt-4 text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-900 text-gray-100 flex flex-col overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2 bg-gray-800/60 border-b border-gray-700/50 shrink-0">
        <span className="text-gray-100 font-semibold text-sm">
          Liam Command Center
        </span>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <button
            onClick={handleRefreshAll}
            className="text-gray-400 hover:text-gray-200 transition-colors px-2 py-1 rounded hover:bg-gray-700/30"
            title="Refresh all data (morning orchestrator)"
          >
            ↻ Refresh All
          </button>
          {data.overnightAnalysis.generatedAt && (
            <span className="text-purple-400">
              AI Analysis:{" "}
              {new Date(data.overnightAnalysis.generatedAt).toLocaleTimeString(
                "en-GB",
                { hour: "2-digit", minute: "2-digit" },
              )}
            </span>
          )}
          <span>{formatCurrentDate()}</span>
          <ClockDisplay />
        </div>
      </header>

      <TabWorkspace
        todayContent={
          <TodayTab
            inbox={data.priorityInbox}
            calendarToday={data.calendar.today}
            calendarWeekAhead={data.calendar.weekAhead}
            calendarHasToken={data.calendar.hasToken}
            timeTracker={data.timeTracker}
            standupUrl={process.env.NEXT_PUBLIC_CEREMONIES_URL || "/ceremony/sprint-operations"}
            ibpMeta={data.ibp ?? undefined}
            onClearNotification={handleClearNotification}
            onRefreshNotifications={handleRefreshNotifications}
            onRefetch={refetch}
          />
        }
        tasksContent={
          <TasksTab inbox={data.priorityInbox} tasks={data.tasks.items} />
        }
        projectsContent={
          <ProjectsTab
            projects={data.personalProjects.projects}
            onPhaseChange={handlePhaseChange}
            onAddTask={handleAddTask}
            onRefetch={refetch}
            onRefresh={handleRefreshProjects}
          />
        }
        automationContent={
          <AutomationTab
            rules={data.automationRules?.rules ?? []}
            lastChecked={data.automationRules?.lastChecked ?? null}
            onRefetch={refetch}
          />
        }
        notesContent={
          <NotesTab
            notes={data.notes?.items ?? []}
            recentTaskTitles={[
              ...data.priorityInbox.urgent,
              ...data.priorityInbox.today,
            ].map((i) => i.jiraKey ?? i.title).slice(0, 10)}
            recentProjectNames={data.personalProjects.projects.map((p) => p.name)}
            onRefetch={refetch}
          />
        }
        ceremoniesContent={
          <CeremoniesTab embedUrl={process.env.NEXT_PUBLIC_CEREMONIES_URL || "/ceremony/sprint-operations"} />
        }
        docsContent={
          <DocHealthTab
            lastRun={data.docHealth?.lastRun ?? null}
            staleDocs={data.docHealth?.staleDocs ?? []}
          />
        }
        learningContent={
          <LearningTab
            overnightAnalysis={data.overnightAnalysis}
            recommendedInstalls={data.recommendedInstalls}
          />
        }
        newsContent={
          <NewsTab
            lastRun={data.aiNewsResults?.lastRun ?? null}
            topStories={data.aiNewsResults?.topStories ?? []}
            suggestions={data.aiNewsResults?.suggestions ?? []}
            internalIntel={data.aiNewsResults?.internalIntel}
            recommendedInstalls={data.recommendedInstalls?.items ?? []}
            onRefetch={refetch}
            onMarkInstalled={async (id) => {
              try {
                await fetch("/api/installs/mark", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id }),
                });
              } catch {
                // silent fail — dashboard will refresh on next data poll
              }
            }}
          />
        }
        ibpContent={
          <IBPTab ibpMeta={data.ibp ?? undefined} />
        }
        feedbackContent={
          <FeedbackTab initialItems={data.feedback?.items ?? []} />
        }
        systemContent={
          <SystemTab
            suggestions={data.aiNewsResults?.suggestions ?? []}
            recommendedInstalls={data.recommendedInstalls?.items ?? []}
            onMarkInstalled={async (id) => {
              try {
                await fetch("/api/installs/mark", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id }),
                });
              } catch {
                // silent fail
              }
            }}
          />
        }
      />
    </div>
  );
}
