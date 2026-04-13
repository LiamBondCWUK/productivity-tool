import { NextRequest, NextResponse } from 'next/server'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { readDashboardData, writeDashboardData } from '../../../lib/dashboardData'
import type { InboxItem, DashboardData } from '../../../types/dashboard'

const GRAPH_TOKEN_FILE = join(process.cwd(), '..', 'workspace', 'coordinator', 'graph-token.json')

function findAndRemoveItem(
  data: DashboardData,
  id: string,
): { updatedData: DashboardData; removed: InboxItem | null } {
  const sections = ['urgent', 'aiSuggested', 'today', 'backlog'] as const
  for (const section of sections) {
    const items = data.priorityInbox[section]
    const found = items.find((item) => item.id === id)
    if (found) {
      const updatedData: DashboardData = {
        ...data,
        priorityInbox: {
          ...data.priorityInbox,
          [section]: items.filter((item) => item.id !== id),
        },
      }
      return { updatedData, removed: found as InboxItem }
    }
  }
  return { updatedData: data, removed: null }
}

async function tryDeleteDocComment(item: InboxItem): Promise<{ success: boolean; message: string }> {
  if (!existsSync(GRAPH_TOKEN_FILE)) {
    return { success: false, message: 'Graph token not configured' }
  }

  let tokenData: { access_token?: string }
  try {
    tokenData = JSON.parse(readFileSync(GRAPH_TOKEN_FILE, 'utf-8'))
  } catch {
    return { success: false, message: 'Failed to read Graph token' }
  }

  const accessToken = tokenData.access_token
  if (!accessToken) {
    return { success: false, message: 'No access_token in Graph token file' }
  }

  if (!item.driveItemId || !item.commentObjectId) {
    return { success: false, message: 'Missing driveItemId or commentObjectId on item' }
  }

  // Build the Graph endpoint — support driveId for shared drives
  const driveSegment = item.driveId
    ? `drives/${item.driveId}`
    : 'me/drive'

  const url = `https://graph.microsoft.com/v1.0/${driveSegment}/items/${item.driveItemId}/workbook/comments/${item.commentObjectId}`

  try {
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (response.ok || response.status === 404) {
      return { success: true, message: 'Deleted from OneDrive/SharePoint' }
    }

    const errorText = await response.text().catch(() => '')
    return {
      success: false,
      message: `Graph API returned ${response.status}: ${errorText.slice(0, 120)}`,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, message: `Network error: ${message}` }
  }
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const data = readDashboardData()
  const { updatedData, removed: item } = findAndRemoveItem(data, id)

  if (!item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }

  // Attempt source-side clearing for doc-comment items
  let sourceResult: { success: boolean; message: string } = {
    success: true,
    message: 'Local-only clear (no source action for this type)',
  }

  if (item.type === 'doc-comment') {
    sourceResult = await tryDeleteDocComment(item)
    // We still remove from inbox even if Graph call fails — local clear always wins
  }
  // jira-comment: Jira has no public dismiss-notification API, so local-only is intentional

  writeDashboardData(updatedData)

  return NextResponse.json({
    success: true,
    id,
    type: item.type,
    sourceCleared: sourceResult.success,
    sourceMessage: sourceResult.message,
  })
}
