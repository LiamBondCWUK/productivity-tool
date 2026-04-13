import { NextRequest, NextResponse } from 'next/server'
import { readDashboardData, writeDashboardData } from '../../../lib/dashboardData'
import type { Task, TaskLogEntry } from '../../../types/dashboard'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const data = readDashboardData()
  const tasks = data.tasks ?? { items: [] }

  const task: Task = {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: body.title,
    description: body.description,
    category: body.category ?? 'feature',
    status: 'planned',
    projectId: body.projectId,
    projectName: body.projectName,
    createdAt: new Date().toISOString(),
    executionLog: [],
    source: body.source ?? 'manual',
    priority: body.priority,
    effort: body.effort,
  }

  writeDashboardData({
    ...data,
    tasks: { ...tasks, items: [...tasks.items, task] },
  })
  return NextResponse.json(task)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const data = readDashboardData()
  const tasks = data.tasks ?? { items: [] }

  const idx: number = tasks.items.findIndex((t: Task) => t.id === body.id)
  if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const existing: Task = tasks.items[idx]
  let updated: Task = { ...existing }

  if (body.status) {
    updated = { ...updated, status: body.status }
    if (body.status === 'executing' && !existing.startedAt) {
      updated = { ...updated, startedAt: new Date().toISOString() }
    }
    if (body.status === 'completed' || body.status === 'failed') {
      updated = { ...updated, completedAt: new Date().toISOString() }
    }
  }

  if (body.logEntry) {
    const entry: TaskLogEntry = {
      timestamp: new Date().toISOString(),
      text: body.logEntry.text,
      type: body.logEntry.type ?? 'info',
    }
    updated = { ...updated, executionLog: [...updated.executionLog, entry] }
  }

  if (body.title !== undefined) updated = { ...updated, title: body.title }
  if (body.description !== undefined) updated = { ...updated, description: body.description }

  const updatedItems = tasks.items.map((t: Task, i: number) => (i === idx ? updated : t))

  writeDashboardData({
    ...data,
    tasks: { ...tasks, items: updatedItems },
  })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const data = readDashboardData()
  if (!data.tasks) return NextResponse.json({ error: 'No tasks' }, { status: 404 })

  writeDashboardData({
    ...data,
    tasks: { ...data.tasks, items: data.tasks.items.filter((t: Task) => t.id !== id) },
  })
  return NextResponse.json({ success: true })
}
