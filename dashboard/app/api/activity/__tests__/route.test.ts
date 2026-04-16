import { GET } from '../route'
import { readFileSync } from 'fs'
import { NextResponse } from 'next/server'

jest.mock('fs')

const mockReadFileSync = readFileSync as jest.MockedFunction<typeof readFileSync>

describe('GET /api/activity', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Mock the current time to a known date for consistent testing
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-04-15T10:00:00Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should return sessions filtered to today only', async () => {
    const yesterdaySession = {
      start: '2026-04-14T14:00:00Z',
      end: '2026-04-14T15:00:00Z',
      windowTitle: 'Yesterday Work',
      inferredTask: 'work',
      durationMin: 60,
    }

    const todaySession1 = {
      start: '2026-04-15T09:00:00Z',
      end: '2026-04-15T10:00:00Z',
      windowTitle: 'Today Task 1',
      inferredTask: 'coding',
      durationMin: 60,
    }

    const todaySession2 = {
      start: '2026-04-15T10:30:00Z',
      end: '2026-04-15T11:00:00Z',
      windowTitle: 'Today Task 2',
      inferredTask: 'meeting',
      durationMin: 30,
    }

    const mockData = JSON.stringify([yesterdaySession, todaySession1, todaySession2])
    mockReadFileSync.mockReturnValue(mockData as any)

    const response = await GET()
    const data = await response.json()

    expect(data.sessions).toHaveLength(2)
    expect(data.sessions[0].start).toContain('2026-04-15')
    expect(data.sessions[1].start).toContain('2026-04-15')
  })

  it('should compute totalMin aggregation correctly', async () => {
    const sessions = [
      {
        start: '2026-04-15T09:00:00Z',
        end: '2026-04-15T10:00:00Z',
        windowTitle: 'Task 1',
        inferredTask: 'coding',
        durationMin: 60,
      },
      {
        start: '2026-04-15T10:00:00Z',
        end: '2026-04-15T10:30:00Z',
        windowTitle: 'Task 2',
        inferredTask: 'meeting',
        durationMin: 30,
      },
      {
        start: '2026-04-15T10:30:00Z',
        end: '2026-04-15T11:15:00Z',
        windowTitle: 'Task 3',
        inferredTask: 'break',
        durationMin: 45,
      },
    ]

    const mockData = JSON.stringify(sessions)
    mockReadFileSync.mockReturnValue(mockData as any)

    const response = await GET()
    const data = await response.json()

    expect(data.totalMin).toBe(135) // 60 + 30 + 45
  })

  it('should compute taskBreakdown mapping correctly', async () => {
    const sessions = [
      {
        start: '2026-04-15T09:00:00Z',
        end: '2026-04-15T10:00:00Z',
        windowTitle: 'Coding Session 1',
        inferredTask: 'coding',
        durationMin: 60,
      },
      {
        start: '2026-04-15T10:00:00Z',
        end: '2026-04-15T10:30:00Z',
        windowTitle: 'Meeting',
        inferredTask: 'meeting',
        durationMin: 30,
      },
      {
        start: '2026-04-15T10:30:00Z',
        end: '2026-04-15T11:15:00Z',
        windowTitle: 'Coding Session 2',
        inferredTask: 'coding',
        durationMin: 45,
      },
    ]

    const mockData = JSON.stringify(sessions)
    mockReadFileSync.mockReturnValue(mockData as any)

    const response = await GET()
    const data = await response.json()

    expect(data.taskBreakdown).toEqual({
      coding: 105, // 60 + 45
      meeting: 30,
    })
  })

  it('should handle unknown tasks in taskBreakdown', async () => {
    const sessions = [
      {
        start: '2026-04-15T09:00:00Z',
        end: '2026-04-15T10:00:00Z',
        windowTitle: 'Task with no inference',
        inferredTask: null,
        durationMin: 60,
      },
      {
        start: '2026-04-15T10:00:00Z',
        end: '2026-04-15T10:30:00Z',
        windowTitle: 'Known task',
        inferredTask: 'coding',
        durationMin: 30,
      },
    ]

    const mockData = JSON.stringify(sessions)
    mockReadFileSync.mockReturnValue(mockData as any)

    const response = await GET()
    const data = await response.json()

    expect(data.taskBreakdown).toEqual({
      unknown: 60,
      coding: 30,
    })
  })

  it('should remove UTF-8 BOM from file content', async () => {
    const sessions = [
      {
        start: '2026-04-15T09:00:00Z',
        end: '2026-04-15T10:00:00Z',
        windowTitle: 'Task',
        inferredTask: 'coding',
        durationMin: 60,
      },
    ]

    // Add UTF-8 BOM character at the beginning
    const bomChar = '\ufeff'
    const mockData = bomChar + JSON.stringify(sessions)
    mockReadFileSync.mockReturnValue(mockData as any)

    const response = await GET()
    const data = await response.json()

    expect(data.sessions).toHaveLength(1)
    expect(data.totalMin).toBe(60)
  })

  it('should return empty data on JSON parse failure', async () => {
    mockReadFileSync.mockReturnValue('{ invalid json }' as any)

    const response = await GET()
    const data = await response.json()

    expect(data.sessions).toEqual([])
    expect(data.totalMin).toBe(0)
    expect(data.taskBreakdown).toEqual({})
    expect(data.lastUpdated).toBeNull()
    expect(response.status).toBe(200) // Returns 200 even on error
  })

  it('should handle empty activity log gracefully', async () => {
    mockReadFileSync.mockReturnValue('[]' as any)

    const response = await GET()
    const data = await response.json()

    expect(data.sessions).toEqual([])
    expect(data.totalMin).toBe(0)
    expect(data.taskBreakdown).toEqual({})
    expect(data.lastUpdated).toBeNull()
  })

  it('should set lastUpdated to last session end time', async () => {
    const sessions = [
      {
        start: '2026-04-15T09:00:00Z',
        end: '2026-04-15T10:00:00Z',
        windowTitle: 'Task 1',
        inferredTask: 'coding',
        durationMin: 60,
      },
      {
        start: '2026-04-15T10:00:00Z',
        end: '2026-04-15T11:30:00Z',
        windowTitle: 'Task 2',
        inferredTask: 'meeting',
        durationMin: 90,
      },
    ]

    const mockData = JSON.stringify(sessions)
    mockReadFileSync.mockReturnValue(mockData as any)

    const response = await GET()
    const data = await response.json()

    expect(data.lastUpdated).toBe('2026-04-15T11:30:00Z')
  })

  it('should handle file read errors gracefully', async () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('File not found')
    })

    const response = await GET()
    const data = await response.json()

    expect(data.sessions).toEqual([])
    expect(data.totalMin).toBe(0)
    expect(data.taskBreakdown).toEqual({})
    expect(data.lastUpdated).toBeNull()
  })
})
