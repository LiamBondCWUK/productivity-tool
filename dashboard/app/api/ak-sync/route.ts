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

interface AKTask {
  title: string
  description: string
  priority: 'urgent' | 'high' | 'medium' | 'low'
  project_id: string
  status: 'backlog' | 'todo' | 'in_progress' | 'done'
}

interface AKProject {
  id: string
  name: string
  description: string
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
): Promise<string> {
  try {
    // Try to fetch existing projects
    const projectsRes = await fetch(`${baseUrl}/api/projects`)
    if (!projectsRes.ok) {
      throw new Error(`Failed to fetch projects: ${projectsRes.statusText}`)
    }

    const projectsData = await projectsRes.json()
    const projects = Array.isArray(projectsData) ? projectsData : projectsData.projects || []

    const existing = projects.find(
      (p: unknown): p is AKProject =>
        typeof p === 'object' && p !== null && 'name' in p && p.name === projectName
    )

    if (existing && typeof existing.id === 'string') {
      return existing.id
    }

    // Create new project
    const createRes = await fetch(`${baseUrl}/api/projects`, {
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

    const newProject = await createRes.json()
    if (typeof newProject?.id !== 'string') {
      throw new Error('Invalid project response: no id field')
    }

    return newProject.id
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
    try {
      projectId = await getOrCreateProject(baseUrl, 'Command Center')
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
        project_id: projectId,
        status: 'backlog',
      }

      try {
        const taskRes = await fetch(`${baseUrl}/api/tasks`, {
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
