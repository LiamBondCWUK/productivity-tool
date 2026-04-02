import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { AutomationRule, AutomationRuleStatus } from '../../../types/dashboard'

const DASHBOARD_FILE = join(process.cwd(), '..', 'workspace', 'coordinator', 'dashboard-data.json')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readData(): any {
  return JSON.parse(readFileSync(DASHBOARD_FILE, 'utf-8'))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function writeData(data: any): void {
  writeFileSync(DASHBOARD_FILE, JSON.stringify(data, null, 2))
}

export async function GET() {
  const data = readData()
  return NextResponse.json(data.automationRules ?? { lastChecked: null, rules: [] })
}

export async function PATCH(req: NextRequest) {
  const body: {
    ruleId: string
    status: AutomationRuleStatus
    deployedAt?: string
    blockedReason?: string
  } = await req.json()

  if (!body.ruleId || !body.status) {
    return NextResponse.json({ error: 'Missing ruleId or status' }, { status: 400 })
  }

  const validStatuses: AutomationRuleStatus[] = ['pending', 'deployed', 'blocked', 'disabled']
  if (!validStatuses.includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const data = readData()
  if (!data.automationRules) {
    return NextResponse.json({ error: 'automationRules not found' }, { status: 404 })
  }

  const idx: number = data.automationRules.rules.findIndex(
    (r: AutomationRule) => r.id === body.ruleId,
  )
  if (idx === -1) {
    return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
  }

  const rule: AutomationRule = data.automationRules.rules[idx]
  rule.status = body.status

  if (body.status === 'deployed') {
    rule.deployedAt = body.deployedAt ?? new Date().toISOString()
    delete rule.blockedReason
  } else if (body.status === 'blocked') {
    rule.blockedReason = body.blockedReason
  }

  data.automationRules.rules[idx] = rule
  data.automationRules.lastChecked = new Date().toISOString()
  writeData(data)

  return NextResponse.json(rule)
}
