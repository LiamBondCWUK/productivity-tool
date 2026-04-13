import { NextRequest, NextResponse } from 'next/server'
import { readDashboardData, writeDashboardData } from '../../../lib/dashboardData'
import type { AutomationRule, AutomationRuleStatus } from '../../../types/dashboard'

export async function GET() {
  const data = readDashboardData()
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

  const data = readDashboardData()
  if (!data.automationRules) {
    return NextResponse.json({ error: 'automationRules not found' }, { status: 404 })
  }

  const idx: number = data.automationRules.rules.findIndex(
    (r: AutomationRule) => r.id === body.ruleId,
  )
  if (idx === -1) {
    return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
  }

  const existingRule: AutomationRule = data.automationRules.rules[idx]
  const updatedRule: AutomationRule = {
    ...existingRule,
    status: body.status,
    ...(body.status === 'deployed'
      ? { deployedAt: body.deployedAt ?? new Date().toISOString(), blockedReason: undefined }
      : {}),
    ...(body.status === 'blocked' ? { blockedReason: body.blockedReason } : {}),
  }

  const updatedRules = data.automationRules.rules.map((r: AutomationRule, i: number) =>
    i === idx ? updatedRule : r,
  )

  writeDashboardData({
    ...data,
    automationRules: {
      lastChecked: new Date().toISOString(),
      rules: updatedRules,
    },
  })

  return NextResponse.json(updatedRule)
}
