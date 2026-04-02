import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { InboxItem } from '../../../types/dashboard'

const DASHBOARD_FILE = join(process.cwd(), '..', 'workspace', 'coordinator', 'dashboard-data.json')
const GRAPH_TOKEN_FILE = join(process.cwd(), '..', 'workspace', 'coordinator', 'graph-token.json')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readData(): any {
  return JSON.parse(readFileSync(DASHBOARD_FILE, 'utf-8'))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function writeData(data: any): void {
  writeFileSync(DASHBOARD_FILE, JSON.stringify(data, null, 2))
}

function findAndRemoveItem(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any,
  id: string,
): InboxItem | null {
  const sections = ['urgent', 'aiSuggested', 'today', 'backlog'] as const
  for (const section of sections) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const idx = data.priorityInbox[section].findIndex((item: any) => item.id === id)
    if (idx !== -1) {
      const [removed] = data.priorityInbox[section].splice(idx, 1)
      return removed as InboxItem
    }
  }
  return null
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

  const data = readData()
  const item = findAndRemoveItem(data, id)

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

  writeData(data)

  return NextResponse.json({
    success: true,
    id,
    type: item.type,
    sourceCleared: sourceResult.success,
    sourceMessage: sourceResult.message,
  })
}
