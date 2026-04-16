import { GET, POST, PUT } from '../route'
import { NextRequest } from 'next/server'
import { readFileSync, writeFileSync } from 'fs'
import { execSync, spawnSync } from 'child_process'

// Mock fs module
jest.mock('fs')

// Mock child_process module
jest.mock('child_process')

// Mock global fetch
global.fetch = jest.fn()

const mockReadFileSync = readFileSync as jest.MockedFunction<typeof readFileSync>
const mockWriteFileSync = writeFileSync as jest.MockedFunction<typeof writeFileSync>
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>
const mockSpawnSync = spawnSync as jest.MockedFunction<typeof spawnSync>
const mockFetch = global.fetch as jest.MockedFunction<typeof global.fetch>

// Sample dashboard data structure
const sampleDashboardData = {
  dayPlan: {
    accepted: false,
    blocks: [
      {
        type: 'focus',
        time: '09:00',
        duration: 90,
        task: 'PROJ-123 Implementation',
        label: 'Deep work block',
        booked: false,
      },
      {
        type: 'focus',
        time: '11:00',
        duration: 60,
        task: 'Code review',
        booked: false,
      },
    ],
  },
  timeTracker: {
    plannedSessions: [],
    plannedTodayMinutes: 0,
  },
}

describe('GET /api/day-plan', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-04-15T10:00:00Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test('returns current day plan successfully', async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify(sampleDashboardData))

    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.dayPlan).toEqual(sampleDashboardData.dayPlan)
  })

  test('strips UTF-8 BOM from file content', async () => {
    const bomContent = '\ufeff' + JSON.stringify(sampleDashboardData)
    mockReadFileSync.mockReturnValue(bomContent)

    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.dayPlan).toEqual(sampleDashboardData.dayPlan)
  })

  test('returns null dayPlan when not present in data', async () => {
    const dataWithoutPlan = { timeTracker: {} }
    mockReadFileSync.mockReturnValue(JSON.stringify(dataWithoutPlan))

    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.dayPlan).toBeNull()
  })

  test('handles file read errors', async () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('File not found')
    })

    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBe('Failed to read day plan')
  })

  test('handles JSON parse errors', async () => {
    mockReadFileSync.mockReturnValue('invalid json {')

    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBe('Failed to read day plan')
  })
})

describe('POST /api/day-plan', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-04-15T10:00:00Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test('executes generation script and returns updated plan', async () => {
    const updatedData = {
      ...sampleDashboardData,
      dayPlan: { ...sampleDashboardData.dayPlan, accepted: false },
    }

    mockExecSync.mockReturnValue('')
    mockReadFileSync.mockReturnValue(JSON.stringify(updatedData))

    const response = await POST()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('generate-day-plan.mjs'),
      expect.objectContaining({
        timeout: 60_000,
      })
    )
    expect(data.dayPlan).toEqual(updatedData.dayPlan)
  })

  test('handles execSync timeout error', async () => {
    const timeoutError = new Error('Command timed out')
    mockExecSync.mockImplementation(() => {
      throw timeoutError
    })

    const response = await POST()
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toContain('Generation failed')
    expect(data.error).toContain('Command timed out')
  })

  test('handles script execution errors', async () => {
    const execError = new Error('Script failed: invalid input')
    mockExecSync.mockImplementation(() => {
      throw execError
    })

    const response = await POST()
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toContain('Script failed')
  })

  test('handles file read errors after generation', async () => {
    mockExecSync.mockReturnValue('')
    mockReadFileSync.mockImplementation(() => {
      throw new Error('File read failed')
    })

    const response = await POST()
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toContain('Generation failed')
  })
})

describe('PUT /api/day-plan', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-04-15T10:00:00Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test('accepts plan without calendar booking when bookCalendar is false', async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify(sampleDashboardData))
    mockWriteFileSync.mockReturnValue(undefined)

    const request = new NextRequest('http://localhost:3000/api/day-plan', {
      method: 'PUT',
      body: JSON.stringify({ bookCalendar: false }),
    })

    const response = await PUT(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.dayPlan.accepted).toBe(true)
    expect(data.bookedCount).toBe(0)
    expect(mockWriteFileSync).toHaveBeenCalled()
  })

  test('accepts plan with empty body (defaults to booking enabled)', async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify(sampleDashboardData))
    mockWriteFileSync.mockReturnValue(undefined)

    const request = new NextRequest('http://localhost:3000/api/day-plan', {
      method: 'PUT',
      body: JSON.stringify({}),
    })

    const response = await PUT(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.dayPlan.accepted).toBe(true)
  })

  test('returns 400 error when no day plan exists', async () => {
    const dataWithoutPlan = { timeTracker: {} }
    mockReadFileSync.mockReturnValue(JSON.stringify(dataWithoutPlan))

    const request = new NextRequest('http://localhost:3000/api/day-plan', {
      method: 'PUT',
      body: JSON.stringify({ bookCalendar: false }),
    })

    const response = await PUT(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('No day plan to accept')
  })

  test('books focus blocks via Graph API successfully', async () => {
    const graphTokenData = { access_token: 'test-token-123' }
    const responseData = {
      ...sampleDashboardData,
      dayPlan: {
        ...sampleDashboardData.dayPlan,
        blocks: [
          { ...sampleDashboardData.dayPlan.blocks[0], booked: false },
          { ...sampleDashboardData.dayPlan.blocks[1], booked: false },
        ],
      },
    }

    mockReadFileSync
      .mockReturnValueOnce(JSON.stringify(responseData)) // Initial read
      .mockReturnValueOnce(JSON.stringify(graphTokenData)) // Graph token read

    mockWriteFileSync.mockReturnValue(undefined)
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ id: 'event-123' }), { status: 200 })
    )

    const request = new NextRequest('http://localhost:3000/api/day-plan', {
      method: 'PUT',
      body: JSON.stringify({ bookCalendar: true }),
    })

    const response = await PUT(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.bookedCount).toBe(2)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://graph.microsoft.com/v1.0/me/events',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token-123',
        }),
      })
    )
  })

  test('stops Graph API booking on first failure', async () => {
    const graphTokenData = { access_token: 'test-token-123' }
    const responseData = {
      ...sampleDashboardData,
      dayPlan: {
        ...sampleDashboardData.dayPlan,
        blocks: [
          { ...sampleDashboardData.dayPlan.blocks[0], booked: false },
          { ...sampleDashboardData.dayPlan.blocks[1], booked: false },
        ],
      },
    }

    mockReadFileSync
      .mockReturnValueOnce(JSON.stringify(responseData))
      .mockReturnValueOnce(JSON.stringify(graphTokenData))

    mockWriteFileSync.mockReturnValue(undefined)
    mockFetch.mockResolvedValueOnce(
      new Response('Calendar busy', { status: 409 })
    )

    const request = new NextRequest('http://localhost:3000/api/day-plan', {
      method: 'PUT',
      body: JSON.stringify({ bookCalendar: true }),
    })

    const response = await PUT(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.bookedCount).toBe(0)
    expect(data.graphError).toContain('Graph API 409')
    // Only called once (stopped after first failure)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  test('falls back to Outlook when Graph API unavailable', async () => {
    const responseData = {
      ...sampleDashboardData,
      dayPlan: {
        ...sampleDashboardData.dayPlan,
        blocks: [
          { ...sampleDashboardData.dayPlan.blocks[0], booked: false },
          { ...sampleDashboardData.dayPlan.blocks[1], booked: false },
        ],
      },
    }

    mockReadFileSync.mockReturnValue(JSON.stringify(responseData))
    mockWriteFileSync.mockReturnValue(undefined)
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: JSON.stringify({
        bookedTimes: ['09:00', '11:00'],
        count: 2,
        errors: [],
      }),
    } as any)

    const request = new NextRequest('http://localhost:3000/api/day-plan', {
      method: 'PUT',
      body: JSON.stringify({ bookCalendar: true }),
    })

    const response = await PUT(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.bookedCount).toBe(2)
    expect(mockSpawnSync).toHaveBeenCalledWith(
      'powershell',
      expect.arrayContaining(['-File'])
    )
  })

  test('handles Outlook PowerShell script failure', async () => {
    const responseData = {
      ...sampleDashboardData,
      dayPlan: {
        ...sampleDashboardData.dayPlan,
        blocks: [{ ...sampleDashboardData.dayPlan.blocks[0], booked: false }],
      },
    }

    mockReadFileSync.mockReturnValue(JSON.stringify(responseData))
    mockWriteFileSync.mockReturnValue(undefined)
    mockSpawnSync.mockReturnValue({
      status: 1,
      stderr: 'PowerShell execution failed',
      stdout: '',
    } as any)

    const request = new NextRequest('http://localhost:3000/api/day-plan', {
      method: 'PUT',
      body: JSON.stringify({ bookCalendar: true }),
    })

    const response = await PUT(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.bookedCount).toBe(0)
    expect(data.graphError).toContain('PowerShell execution failed')
  })

  test('builds planned sessions with JIRA key extraction', async () => {
    const responseData = {
      ...sampleDashboardData,
      dayPlan: {
        ...sampleDashboardData.dayPlan,
        blocks: [
          {
            type: 'focus',
            time: '09:00',
            duration: 90,
            task: 'PROJ-123 Implementation',
            booked: true, // Already booked
          },
        ],
      },
    }

    mockReadFileSync.mockReturnValue(JSON.stringify(responseData))
    mockWriteFileSync.mockReturnValue(undefined)

    const request = new NextRequest('http://localhost:3000/api/day-plan', {
      method: 'PUT',
      body: JSON.stringify({ bookCalendar: false }),
    })

    const response = await PUT(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.dayPlan.accepted).toBe(true)

    // Verify writeData was called with updated timeTracker
    const writeCall = mockWriteFileSync.mock.calls[0][1]
    const writtenData = JSON.parse(writeCall as string)

    expect(writtenData.timeTracker.plannedSessions).toHaveLength(1)
    expect(writtenData.timeTracker.plannedSessions[0]).toMatchObject({
      label: 'PROJ-123 Implementation',
      jiraKey: 'PROJ-123',
      durationMinutes: 90,
      planned: true,
      source: 'day-plan',
    })
    expect(writtenData.timeTracker.plannedTodayMinutes).toBe(90)
  })

  test('generates correct ISO timestamps for planned sessions', async () => {
    const responseData = {
      ...sampleDashboardData,
      dayPlan: {
        ...sampleDashboardData.dayPlan,
        blocks: [
          {
            type: 'focus',
            time: '14:30',
            duration: 45,
            task: 'Test',
            booked: true,
          },
        ],
      },
    }

    mockReadFileSync.mockReturnValue(JSON.stringify(responseData))
    mockWriteFileSync.mockReturnValue(undefined)

    const request = new NextRequest('http://localhost:3000/api/day-plan', {
      method: 'PUT',
      body: JSON.stringify({ bookCalendar: false }),
    })

    const response = await PUT(request)
    await response.json()

    const writeCall = mockWriteFileSync.mock.calls[0][1]
    const writtenData = JSON.parse(writeCall as string)
    const session = writtenData.timeTracker.plannedSessions[0]

    expect(session.startedAt).toBe('2026-04-15T14:30:00.000Z')
    expect(session.endedAt).toBe('2026-04-15T15:15:00.000Z') // +45 minutes
  })

  test('handles malformed request body', async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify(sampleDashboardData))

    const request = new NextRequest('http://localhost:3000/api/day-plan', {
      method: 'PUT',
      body: 'not valid json {',
    })

    const response = await PUT(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    // Should treat as empty body and allow booking (bookCalendar defaults to true)
    expect(data.dayPlan.accepted).toBe(true)
  })

  test('handles Outlook output parsing failure', async () => {
    const responseData = {
      ...sampleDashboardData,
      dayPlan: {
        ...sampleDashboardData.dayPlan,
        blocks: [{ ...sampleDashboardData.dayPlan.blocks[0], booked: false }],
      },
    }

    mockReadFileSync.mockReturnValue(JSON.stringify(responseData))
    mockWriteFileSync.mockReturnValue(undefined)
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: 'invalid json output {',
    } as any)

    const request = new NextRequest('http://localhost:3000/api/day-plan', {
      method: 'PUT',
      body: JSON.stringify({ bookCalendar: true }),
    })

    const response = await PUT(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.graphError).toContain('Could not parse Outlook booking output')
  })

  test('updates only unbooked focus blocks in data', async () => {
    const responseData = {
      ...sampleDashboardData,
      dayPlan: {
        ...sampleDashboardData.dayPlan,
        blocks: [
          { ...sampleDashboardData.dayPlan.blocks[0], booked: false },
          { ...sampleDashboardData.dayPlan.blocks[1], booked: true }, // Already booked
        ],
      },
    }

    mockReadFileSync.mockReturnValue(JSON.stringify(responseData))
    mockWriteFileSync.mockReturnValue(undefined)
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ id: 'event-123' }), { status: 200 })
    )

    const request = new NextRequest('http://localhost:3000/api/day-plan', {
      method: 'PUT',
      body: JSON.stringify({ bookCalendar: true }),
    })

    const response = await PUT(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.bookedCount).toBe(1) // Only the first unbooked block
    expect(mockFetch).toHaveBeenCalledTimes(1) // Only 1 Graph API call

    // Verify written data
    const writeCall = mockWriteFileSync.mock.calls[0][1]
    const writtenData = JSON.parse(writeCall as string)
    expect(writtenData.dayPlan.blocks[0].booked).toBe(true)
    expect(writtenData.dayPlan.blocks[1].booked).toBe(true)
  })

  test('handles file read errors gracefully', async () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('Permission denied')
    })

    const request = new NextRequest('http://localhost:3000/api/day-plan', {
      method: 'PUT',
      body: JSON.stringify({ bookCalendar: false }),
    })

    const response = await PUT(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBe('Permission denied')
  })
})
