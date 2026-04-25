import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { resolve } from 'path'

export const dynamic = 'force-dynamic'

interface PendingCard {
  title: string
  body?: string
  description?: string
  priority?: 'urgent' | 'high' | 'medium' | 'low'
  type?: string
  labels?: string[]
  project?: string
}

interface PendingCardsFile {
  generatedAt: string
  totalCards: number
  cards: PendingCard[]
}

interface SyncState {
  synced: string[]
}

interface AKColumn {
  id: string
  name: string
  position: number
  project_id: string
}

interface AKProject {
  id: string
  name: string
  columns?: AKColumn[]
}

interface AKTask {
  title: string
  description: string
  priority: 'urgent' | 'high' | 'medium' | 'low'
  column_id: string
}

interface SyncResponse {
  synced: number
  skipped: number
  projectId?: string
  message?: string
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    if (!existsSync(filePath)) return null
    const content = await readFile(filePath, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    console.error(`Failed to read ${filePath}:`, error)
    return null
  }
}

async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
  try {
    await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
  } catch (error) {
    console.error(`Failed to write ${filePath}:`, error)
    throw error
  }
}

async function getOrCreateProject(
  baseUrl: string,
  projectName: string
): Promise<{ projectId: string; backlogColumnId: string }> {
  try {
    // Fetch existing projects (raw array — no envelope)
    const projectsRes = await fetch(`${baseUrl}/api/ak/projects`)
    if (!projectsRes.ok) {
      throw new Error(`Failed to fetch projects: ${projectsRes.statusText}`)
    }

    const projects: AKProject[] = await projectsRes.json()
    const existing = Array.isArray(projects)
      ? projects.find((p) => p.name === projectName)
      : undefined

    if (existing) {
      // Fetch the project with columns
      const detailRes = await fetch(`${baseUrl}/api/ak/projects/${existing.id}`)
      if (!detailRes.ok) throw new Error(`Failed to fetch project detail: ${detailRes.statusText}`)
      const detail: AKProject & { columns: AKColumn[] } = await detailRes.json()
      const backlog = detail.columns?.find((c) => c.name === 'Backlog')
      if (!backlog) throw new Error('No Backlog column found in existing project')
      return { projectId: existing.id, backlogColumnId: backlog.id }
    }

    // Create new project — response includes columns directly
    const createRes = await fetch(`${baseUrl}/api/ak/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: projectName,
        description: 'Productivity Tool task intake',
      }),
    })

    if (!createRes.ok) {
      throw new Error(`Failed to create project: ${createRes.statusText}`)
    }

    const newProject: AKProject & { columns: AKColumn[] } = await createRes.json()
    if (!newProject?.id) throw new Error('Invalid project response: no id field')

    const backlog = newProject.columns?.find((c) => c.name === 'Backlog')
    if (!backlog) throw new Error('No Backlog column in newly created project')

    return { projectId: newProject.id, backlogColumnId: backlog.id }
  } catch (error) {
    throw new Error(
      `Project lookup/creation failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function POST(req: NextRequest): Promise<NextResponse<SyncResponse>> {
  const pendingCardsPath = resolve(
    'C:/Users/liam.bond/Documents/Productivity Tool/workspace/coordinator/pending-kanban-cards.json'
  )
  const syncStatePath = resolve(
    'C:/Users/liam.bond/Documents/Productivity Tool/workspace/coordinator/ak-sync-state.json'
  )

  try {
    // Read pending cards
    const cardsData = await readJsonFile<PendingCardsFile>(pendingCardsPath)
    if (!cardsData) {
      return NextResponse.json(
        {
          synced: 0,
          skipped: 0,
          message: 'No pending cards file found',
        },
        { status: 200 }
      )
    }

    // Read sync state (create if missing)
    let syncState = await readJsonFile<SyncState>(syncStatePath)
    if (!syncState) {
      syncState = { synced: [] }
    }

    const baseUrl = process.env.AK_BACKEND_URL || 'http://localhost:3001'

    // Get or create Command Center project
    let projectId: string
    let backlogColumnId: string
    try {
      const result = await getOrCreateProject(baseUrl, 'Command Center')
      projectId = result.projectId
      backlogColumnId = result.backlogColumnId
    } catch (error) {
      return NextResponse.json(
        {
          synced: 0,
          skipped: 0,
          message: `Failed to get/create project: ${error instanceof Error ? error.message : String(error)}`,
        },
        { status: 502 }
      )
    }

    let syncedCount = 0
    const newSyncedIds: string[] = []

    // Sync each card
    for (const card of cardsData.cards) {
      // Create a stable ID from title and project
      const cardId = `${card.project || 'default'}:${card.title}`

      if (syncState.synced.includes(cardId)) {
        continue // Already synced
      }

      const task: AKTask = {
        title: card.title,
        description: card.body || card.description || '',
        priority: card.priority || 'medium',
        column_id: backlogColumnId,
      }

      try {
        const taskRes = await fetch(`${baseUrl}/api/ak/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(task),
        })

        if (!taskRes.ok) {
          console.error(`Failed to create task for "${card.title}": ${taskRes.statusText}`)
          continue
        }

        syncedCount++
        newSyncedIds.push(cardId)
      } catch (error) {
        console.error(
          `Error syncing task "${card.title}":`,
          error instanceof Error ? error.message : String(error)
        )
        continue
      }
    }

    // Update sync state
    const updatedSyncState: SyncState = {
      synced: [...syncState.synced, ...newSyncedIds],
    }
    await writeJsonFile(syncStatePath, updatedSyncState)

    const skipped = cardsData.cards.length - syncedCount

    return NextResponse.json({
      synced: syncedCount,
      skipped,
      projectId,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      {
        synced: 0,
        skipped: 0,
        message: `Sync failed: ${message}`,
      },
      { status: 502 }
    )
  }
}
