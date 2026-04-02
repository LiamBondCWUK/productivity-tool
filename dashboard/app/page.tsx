'use client'

import { useState, useEffect } from 'react'
import { useDashboardData } from '../hooks/useDashboardData'
import { PriorityInbox } from '../components/PriorityInbox'
import { ProjectsBoard } from '../components/ProjectsBoard'
import { CalendarPanel } from '../components/CalendarPanel'
import { TimeTracker } from '../components/TimeTracker'
import { TasksPanel } from '../components/TasksPanel'
import type { ProjectPhase, ProjectSuggestion } from '../types/dashboard'

function formatCurrentTime(): string {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function formatCurrentDate(): string {
  return new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

function ClockDisplay() {
  const [time, setTime] = useState(formatCurrentTime())
  useEffect(() => {
    const interval = setInterval(() => setTime(formatCurrentTime()), 30000)
    return () => clearInterval(interval)
  }, [])
  return <span className="font-mono">{time}</span>
}

export default function Dashboard() {
  const { data, loading, error, refetch } = useDashboardData()

  const handlePhaseChange = async (projectId: string, phase: ProjectPhase) => {
    await fetch('/api/projects', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, phase }),
    })
    refetch()
  }

  const handleAddTask = async (suggestion: ProjectSuggestion, projectId: string, projectName: string) => {
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: suggestion.action,
        category: 'feature',
        priority: suggestion.priority,
        effort: suggestion.effort,
        projectId,
        projectName,
        source: 'overnight-suggestion',
      }),
    })
    refetch()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <p className="text-gray-500">Loading command center...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-2">Failed to load dashboard data</p>
          <p className="text-gray-500 text-sm">{error}</p>
          <button onClick={refetch} className="mt-4 text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-300">
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-gray-900 text-gray-100 flex flex-col overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2 bg-gray-800/60 border-b border-gray-700/50 shrink-0">
        <span className="text-gray-100 font-semibold text-sm">Liam Command Center</span>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          {data.overnightAnalysis.generatedAt && (
            <span className="text-purple-400">
              AI Analysis: {new Date(data.overnightAnalysis.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <span>{formatCurrentDate()}</span>
          <ClockDisplay />
        </div>
      </header>

      <main className="flex-1 grid grid-cols-[250px_260px_1fr_280px] min-h-0 overflow-hidden">
        {/* Inbox */}
        <div className="border-r border-gray-700/50 p-4 flex flex-col overflow-hidden">
          <PriorityInbox inbox={data.priorityInbox} />
        </div>

        {/* Projects */}
        <div className="border-r border-gray-700/50 p-4 flex flex-col overflow-hidden">
          <ProjectsBoard
            projects={data.personalProjects.projects}
            onPhaseChange={handlePhaseChange}
            onAddTask={handleAddTask}
          />
        </div>

        {/* Tasks kanban */}
        <div className="border-r border-gray-700/50 p-4 flex flex-col overflow-hidden">
          <TasksPanel tasks={data.tasks?.items ?? []} onRefetch={refetch} />
        </div>

        {/* Calendar + Time tracker */}
        <div className="flex flex-col overflow-hidden">
          <div className="flex-1 p-4 border-b border-gray-700/50 flex flex-col min-h-0 overflow-hidden">
            <CalendarPanel today={data.calendar.today} weekAhead={data.calendar.weekAhead} hasToken={data.calendar.hasToken} />
          </div>
          <div className="p-4 flex flex-col overflow-hidden" style={{ maxHeight: '45vh' }}>
            <TimeTracker tracker={data.timeTracker} onRefetch={refetch} />
          </div>
        </div>
      </main>
    </div>
  )
}
