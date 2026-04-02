import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { Task, TaskLogEntry } from '../../../types/dashboard'

const DASHBOARD_FILE = join(process.cwd(), '..', 'workspace', 'coordinator', 'dashboard-data.json')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readData(): any {
  return JSON.parse(readFileSync(DASHBOARD_FILE, 'utf-8'))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function writeData(data: any): void {
  writeFileSync(DASHBOARD_FILE, JSON.stringify(data, null, 2))
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const data = readData()
  if (!data.tasks) data.tasks = { items: [] }

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

  data.tasks.items.push(task)
  writeData(data)
  return NextResponse.json(task)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const data = readData()
  if (!data.tasks) data.tasks = { items: [] }

  const idx: number = data.tasks.items.findIndex((t: Task) => t.id === body.id)
  if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const task: Task = data.tasks.items[idx]

  if (body.status) {
    task.status = body.status
    if (body.status === 'executing' && !task.startedAt) {
      task.startedAt = new Date().toISOString()
    }
    if (body.status === 'completed' || body.status === 'failed') {
      task.completedAt = new Date().toISOString()
    }
  }

  if (body.logEntry) {
    const entry: TaskLogEntry = {
      timestamp: new Date().toISOString(),
      text: body.logEntry.text,
      type: body.logEntry.type ?? 'info',
    }
    task.executionLog.push(entry)
  }

  if (body.title !== undefined) task.title = body.title
  if (body.description !== undefined) task.description = body.description

  data.tasks.items[idx] = task
  writeData(data)
  return NextResponse.json(task)
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const data = readData()
  if (!data.tasks) return NextResponse.json({ error: 'No tasks' }, { status: 404 })
  data.tasks.items = data.tasks.items.filter((t: Task) => t.id !== id)
  writeData(data)
  return NextResponse.json({ success: true })
}
