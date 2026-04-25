import { NextResponse } from 'next/server'
import { readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export const dynamic = 'force-dynamic'

interface AKProject {
  id: string
  name: string
  repo_path: string
  columns?: Array<{ id: string; name: string; position: number }>
}

const SCAN_ROOT = join(homedir(), 'Documents')

// Folders to skip — not real projects
const EXCLUDE = new Set([
  '_archive', 'node_modules', '.git', 'dotfiles', 'dotfiles-publish',
  'Obsidian Vault', 'My Music', 'My Pictures', 'My Videos',
  'prompts', 'archived-browser-dumps', 'PowerShell', 'Guides',
])

function findGitRepos(root: string, maxDepth = 2): Array<{ name: string; path: string }> {
  const repos: Array<{ name: string; path: string }> = []

  function scan(dir: string, depth: number) {
    if (depth > maxDepth) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    if (entries.some((e) => e.name === '.git' && e.isDirectory())) {
      const name = dir.split(/[\\/]/).pop() ?? dir
      repos.push({ name, path: dir })
      return // don't recurse into git repos
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || EXCLUDE.has(entry.name)) continue
      scan(join(dir, entry.name), depth + 1)
    }
  }

  scan(root, 0)
  return repos
}

export async function POST(): Promise<NextResponse<AKProject[]>> {
  const baseUrl = process.env.AK_BACKEND_URL ?? 'http://localhost:3001'

  // Discover git repos
  const discovered = existsSync(SCAN_ROOT) ? findGitRepos(SCAN_ROOT) : []

  // Fetch existing AK projects
  let existing: AKProject[] = []
  try {
    const res = await fetch(`${baseUrl}/api/ak/projects`)
    if (res.ok) existing = await res.json()
  } catch {
    return NextResponse.json([], { status: 502 })
  }

  const existingPaths = new Set(existing.map((p) => p.repo_path).filter(Boolean))

  // Create missing projects
  const createPromises = discovered
    .filter((repo) => !existingPaths.has(repo.path))
    .map(async (repo) => {
      try {
        await fetch(`${baseUrl}/api/ak/projects`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: repo.name,
            description: '',
            repo_path: repo.path,
          }),
        })
      } catch {
        // best-effort — non-fatal
      }
    })

  await Promise.all(createPromises)

  // Return refreshed project list
  try {
    const res = await fetch(`${baseUrl}/api/ak/projects`)
    if (!res.ok) return NextResponse.json(existing)
    const updated: AKProject[] = await res.json()
    return NextResponse.json(Array.isArray(updated) ? updated : existing)
  } catch {
    return NextResponse.json(existing)
  }
}
