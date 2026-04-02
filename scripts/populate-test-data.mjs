#!/usr/bin/env node
/**
 * populate-test-data.mjs
 *
 * Fills dashboard-data.json with rich, realistic test data
 * so all dashboard panels render visibly.
 *
 * Run: node scripts/populate-test-data.mjs
 */

import { writeFileSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../');
const DASHBOARD_DATA = join(ROOT, 'workspace/coordinator/dashboard-data.json');

const now = new Date();
const today = now.toISOString().split('T')[0];

function hoursAgo(h) {
  return new Date(Date.now() - h * 3600000).toISOString();
}
function todayAt(h, m = 0) {
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}
function tomorrowAt(h, m = 0) {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}
function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString();
}

const data = {
  meta: {
    version: "1.0.0",
    lastUpdated: now.toISOString(),
    lastUpdatedBy: "populate-test-data"
  },

  priorityInbox: {
    urgent: [
      {
        id: "ukcas-789",
        title: "UKCAS-789 — SLA breach in 45 min: Client login failing after patch",
        type: "jira",
        source: "jira",
        link: "https://caseware.atlassian.net/browse/UKCAS-789",
        priority: "urgent",
        addedAt: hoursAgo(2),
        dueAt: new Date(Date.now() + 45 * 60000).toISOString(),
        labels: ["L3-Escalation", "UKCAUD_BUGS_DEV/QA"],
        project: "UKCAS"
      },
      {
        id: "ukcaud-1024",
        title: "UKCAUD-1024 — PR review blocking sprint close (2 reviewers needed)",
        type: "jira",
        source: "jira",
        link: "https://caseware.atlassian.net/browse/UKCAUD-1024",
        priority: "urgent",
        addedAt: hoursAgo(1),
        labels: ["UKCAUD_CONTENT/PEERREVIEW"],
        project: "UKCAUD"
      }
    ],
    aiSuggested: [
      {
        id: "ai-jira-rule-1",
        title: "Deploy Jira Rule 1 — UKCAS→UKJPD routing (unblocked, ~10 min)",
        type: "ai-suggestion",
        source: "overnight",
        priority: "high",
        effort: "S",
        addedAt: hoursAgo(6),
        reasoning: "Rule has been ready for 5 days. No dependencies. Directly unblocks 3 open UKJPD enhancements."
      },
      {
        id: "ai-ukjpd-triage",
        title: "UKJPD triage batch — 56 UPFR items, Product Area fields empty",
        type: "ai-suggestion",
        source: "overnight",
        priority: "medium",
        effort: "M",
        addedAt: hoursAgo(6),
        reasoning: "38 items have been untriaged for >7 days. Triage window closes Thursday."
      },
      {
        id: "ai-ticket-enhance",
        title: "Enhance /ticket — merge create-epic.md logic into epic sub-command",
        type: "ai-suggestion",
        source: "overnight",
        priority: "medium",
        effort: "M",
        addedAt: hoursAgo(6),
        reasoning: "Two overlapping code paths. Consolidation saves ~15min per epic creation."
      }
    ],
    today: [
      {
        id: "ukcaud-989",
        title: "UKCAUD-989 — Review subtask completion for Lead Schedule story",
        type: "jira",
        source: "jira",
        link: "https://caseware.atlassian.net/browse/UKCAUD-989",
        priority: "today",
        addedAt: hoursAgo(7),
        labels: ["UKCAUD_CONTENT/QA"],
        project: "UKCAUD"
      },
      {
        id: "teams-ukteam-post",
        title: "Post escalation update in #uk-team (UKCAS-789 status)",
        type: "teams",
        source: "manual",
        priority: "today",
        addedAt: hoursAgo(1)
      },
      {
        id: "daily-ibp-notes",
        title: "Add IBP-notable items to daily log before EOD",
        type: "task",
        source: "manual",
        priority: "today",
        addedAt: hoursAgo(8)
      }
    ],
    backlog: [
      {
        id: "standing-ukjpd-review",
        title: "UKJPD review — 56 UPFR items need triage",
        type: "standing",
        source: "manual",
        link: null,
        addedAt: daysAgo(5)
      },
      {
        id: "standing-ukpfr-crossover",
        title: "UKPFR crossover — 82 ideas in crossover view",
        type: "standing",
        source: "manual",
        link: null,
        addedAt: daysAgo(5)
      },
      {
        id: "standing-teams-config",
        title: "Teams channel config — teams-channels.json has stubbed TODOs",
        type: "standing",
        source: "manual",
        link: null,
        addedAt: daysAgo(3)
      },
      {
        id: "standing-jira-rules",
        title: "Jira Rules 1 + 2 ready to deploy (UKCAS→UKJPD, UKCAUD→UKJPD)",
        type: "standing",
        source: "manual",
        link: null,
        addedAt: daysAgo(3)
      },
      {
        id: "ukjpd-55-review",
        title: "UKJPD-55 — Review Forecasting Enhancement request",
        type: "jira",
        source: "jira",
        link: "https://caseware.atlassian.net/browse/UKJPD-55",
        priority: "backlog",
        addedAt: daysAgo(1)
      }
    ]
  },

  personalProjects: {
    lastRefreshed: now.toISOString(),
    projects: [
      {
        id: "command-center",
        name: "Command Center",
        description: "Personal AI command center — dashboard, priority inbox, time tracker",
        phase: "Building",
        completionPercent: 95,
        dir: "C:/Users/liam.bond/Documents/Productivity Tool",
        gitDir: "C:/Users/liam.bond/Documents/Productivity Tool",
        devDocsDir: "dev/active/command-center",
        tags: ["ai", "dashboard", "productivity"],
        lastActivity: hoursAgo(2),
        lastCommitSubject: "feat: complete command center phases 4-7 — CLI consolidation, EOD pipeline, focus blocks",
        suggestions: [
          { priority: "HIGH", action: "Add Replit deployment config (.replit + run command)", effort: "S", addedAt: hoursAgo(6) },
          { priority: "MED", action: "Wire /eod command to write time-log.json entries", effort: "M", addedAt: hoursAgo(6) },
          { priority: "LOW", action: "Add compact mode toggle to ProjectsBoard cards", effort: "S", addedAt: hoursAgo(6) }
        ],
        state: "All 7 phases built. Dashboard live at localhost:3000. Replit deployment pending.",
        crossProjectDeps: ["Productivity Tool CLI commands must stay in sync"],
        neglected: false
      },
      {
        id: "productivity-tool",
        name: "Productivity Tool",
        description: "Claude CLI commands for Jira, morning brief, EOD capture, IBP",
        phase: "Building",
        completionPercent: 82,
        dir: "C:/Users/liam.bond/Documents/Productivity Tool",
        gitDir: "C:/Users/liam.bond/Documents/Productivity Tool",
        devDocsDir: null,
        tags: ["cli", "jira", "productivity"],
        lastActivity: hoursAgo(3),
        lastCommitSubject: "feat: add /ticket epic, /clone --preset, /focus, /log commands",
        suggestions: [
          { priority: "HIGH", action: "Deploy Jira Rule 1 (UKCAS→UKJPD routing) — unblocked, 10min", effort: "S", addedAt: hoursAgo(6) },
          { priority: "MED", action: "Update /eod to pull Microsoft Graph calendar events", effort: "M", addedAt: hoursAgo(6) }
        ],
        state: "Core commands complete. /focus command needs Graph token setup.",
        crossProjectDeps: ["Command Center reads commands/*.md for suggestion analysis"],
        neglected: false
      },
      {
        id: "ai-breaking-news",
        name: "AI Breaking News Tool",
        description: "Daily AI news digest email — automated scraping and formatting",
        phase: "Done",
        completionPercent: 95,
        dir: "C:/Users/liam.bond/Documents/AI Breaking News Tool",
        gitDir: "C:/Users/liam.bond/Documents/AI Breaking News Tool",
        devDocsDir: null,
        tags: ["ai", "email", "automation"],
        lastActivity: daysAgo(3),
        lastCommitSubject: "fix: handle rate limiting in scraper",
        suggestions: [
          { priority: "LOW", action: "Add Perplexity as backup source when primary APIs are down", effort: "S", addedAt: hoursAgo(6) }
        ],
        state: "Running daily. Last issue sent successfully 3 days ago.",
        crossProjectDeps: [],
        neglected: false
      },
      {
        id: "ukjpd-workflows",
        name: "CW UKJPD Workflows",
        description: "Jira automation for UKJPD feature request delivery",
        phase: "Done",
        completionPercent: 90,
        dir: "C:/Users/liam.bond/Documents/CW UKJPD Workflows",
        gitDir: null,
        devDocsDir: null,
        tags: ["caseware", "jira", "automation"],
        lastActivity: daysAgo(5),
        lastCommitSubject: null,
        suggestions: [
          { priority: "HIGH", action: "Deploy Jira Rule 2 (UKCAUD→UKJPD sync) — review before deploying", effort: "S", addedAt: hoursAgo(6) },
          { priority: "MED", action: "Triage 56 UPFR items — Product Area/Line fields empty", effort: "L", addedAt: hoursAgo(6) }
        ],
        state: "Rules 1 & 2 staged. Deployment blocked pending review.",
        crossProjectDeps: ["Jira Rule 1 deployment unblocks /discover command"],
        neglected: true
      },
      {
        id: "lead-schedules",
        name: "Lead Schedules",
        description: "UKCAUD lead schedule ticket management and automation",
        phase: "Building",
        completionPercent: 30,
        dir: null,
        gitDir: null,
        devDocsDir: null,
        tags: ["caseware", "ukcaud"],
        lastActivity: daysAgo(1),
        lastCommitSubject: null,
        suggestions: [
          { priority: "HIGH", action: "Create clone preset for lead schedule story variants", effort: "S", addedAt: hoursAgo(6) },
          { priority: "HIGH", action: "UKCAUD-989 subtask completion — Content + QA subtasks pending", effort: "S", addedAt: hoursAgo(6) },
          { priority: "MED", action: "Review UKCAUD-1012 acceptance criteria against spec", effort: "S", addedAt: hoursAgo(6) },
          { priority: "LOW", action: "Update context.md with Q2 scope changes from last Monday", effort: "XS", addedAt: hoursAgo(6) }
        ],
        state: "3 stories in progress. 2 subtasks blocked on QA resource.",
        crossProjectDeps: ["Blocked on DIST admin access for Rule 3 deployment"],
        neglected: false
      }
    ]
  },

  calendar: {
    lastRefreshed: now.toISOString(),
    source: "mock",
    events: [
      {
        id: "cal-standup",
        title: "Sprint standup",
        start: todayAt(9, 30),
        end: todayAt(9, 45),
        isOnlineMeeting: true,
        isFocusBlock: false,
        organizer: "scrum-bot",
        status: "accepted",
        past: now.getHours() >= 9
      },
      {
        id: "cal-focus-ukcaud",
        title: "[FOCUS] UKCAUD-989 — Lead Schedule review",
        start: todayAt(10, 0),
        end: todayAt(11, 30),
        isOnlineMeeting: false,
        isFocusBlock: true,
        organizer: "liam.bond",
        status: "accepted",
        past: now.getHours() >= 11
      },
      {
        id: "cal-product-review",
        title: "Product review — Q2 roadmap alignment",
        start: todayAt(14, 0),
        end: todayAt(15, 0),
        isOnlineMeeting: true,
        isFocusBlock: false,
        organizer: "peter.smith",
        status: "accepted",
        past: now.getHours() >= 15
      },
      {
        id: "cal-1on1",
        title: "1:1 with Kirsten",
        start: todayAt(15, 30),
        end: todayAt(16, 0),
        isOnlineMeeting: true,
        isFocusBlock: false,
        organizer: "kirsten.jones",
        status: "tentative",
        past: now.getHours() >= 16
      },
      {
        id: "cal-tomorrow-release",
        title: "Release review — v2024.3",
        start: tomorrowAt(10, 0),
        end: tomorrowAt(11, 0),
        isOnlineMeeting: true,
        isFocusBlock: false,
        organizer: "andrew.blake",
        status: "accepted",
        past: false
      },
      {
        id: "cal-friday-retro",
        title: "Sprint retro",
        start: tomorrowAt(14, 0),
        end: tomorrowAt(15, 0),
        isOnlineMeeting: true,
        isFocusBlock: false,
        organizer: "scrum-bot",
        status: "accepted",
        past: false
      }
    ]
  },

  timeTracker: {
    currentTask: null,
    currentTaskStart: null,
    todaySessions: [
      {
        id: "sess-1",
        label: "UKCAUD-989",
        start: todayAt(9, 50),
        end: todayAt(10, 0),
        durationMs: 10 * 60000,
        note: "Review subtask status"
      },
      {
        id: "sess-2",
        label: "Sprint standup",
        start: todayAt(9, 30),
        end: todayAt(9, 45),
        durationMs: 15 * 60000,
        note: ""
      },
      {
        id: "sess-3",
        label: "UKJPD triage",
        start: todayAt(8, 30),
        end: todayAt(9, 15),
        durationMs: 45 * 60000,
        note: "Reviewed 12 items, tagged 8"
      }
    ],
    weekSessions: [
      { date: daysAgo(4).split('T')[0], totalMs: 5 * 3600000 + 20 * 60000 },
      { date: daysAgo(3).split('T')[0], totalMs: 6 * 3600000 + 45 * 60000 },
      { date: daysAgo(2).split('T')[0], totalMs: 4 * 3600000 + 10 * 60000 },
      { date: daysAgo(1).split('T')[0], totalMs: 7 * 3600000 },
      { date: today, totalMs: 70 * 60000 }
    ]
  },

  overnightAnalysis: {
    generatedAt: hoursAgo(6),
    reportPath: "workspace/coordinator/overnight-report.md",
    summary: "5 projects analysed. 3 high-priority actions identified. Lead Schedules has 4 neglected tasks. Jira Rule 1 remains undeployed after 5 days.",
    projects: {
      "command-center": {
        state: "All 7 phases built and committed. Dashboard live at localhost:3000.",
        suggestions: [
          { priority: "HIGH", action: "Add Replit deployment config", effort: "S" },
          { priority: "MED", action: "Wire /eod to time-log.json entries", effort: "M" },
          { priority: "LOW", action: "Add compact mode toggle to ProjectsBoard", effort: "S" }
        ],
        neglected: [],
        crossProjectDeps: ["Productivity Tool CLI commands must stay in sync"]
      },
      "productivity-tool": {
        state: "Core commands complete. /focus needs Graph token.",
        suggestions: [
          { priority: "HIGH", action: "Deploy Jira Rule 1 — unblocked, 10min", effort: "S" },
          { priority: "MED", action: "Update /eod to pull Graph calendar", effort: "M" }
        ],
        neglected: [],
        crossProjectDeps: []
      },
      "ukjpd-workflows": {
        state: "Rules staged. Deployment pending review.",
        suggestions: [
          { priority: "HIGH", action: "Deploy Jira Rule 2 before Thursday sprint close", effort: "S" },
          { priority: "MED", action: "Triage 56 UPFR items — Product Area fields empty", effort: "L" }
        ],
        neglected: ["teams-channels.json has been stubbed for 8 days"],
        crossProjectDeps: ["Rule 1 deployment unblocks /discover command"]
      },
      "lead-schedules": {
        state: "3 stories in progress. 2 subtasks blocked on QA.",
        suggestions: [
          { priority: "HIGH", action: "Create clone preset for lead schedule variants", effort: "S" },
          { priority: "HIGH", action: "UKCAUD-989 subtask completion", effort: "S" },
          { priority: "MED", action: "Review UKCAUD-1012 acceptance criteria", effort: "S" },
          { priority: "LOW", action: "Update context.md with Q2 scope changes", effort: "XS" }
        ],
        neglected: ["context.md not updated in 6 days"],
        crossProjectDeps: ["Blocked on DIST admin for Rule 3"]
      },
      "ai-breaking-news": {
        state: "Running daily. Last issue sent 3 days ago.",
        suggestions: [
          { priority: "LOW", action: "Add Perplexity as backup source", effort: "S" }
        ],
        neglected: [],
        crossProjectDeps: []
      }
    }
  },

  tasks: [
    {
      id: "task-1",
      title: "Post escalation update for UKCAS-789 in #uk-team",
      status: "pending",
      priority: "urgent",
      source: "manual",
      addedAt: hoursAgo(1),
      dueAt: new Date(Date.now() + 30 * 60000).toISOString()
    },
    {
      id: "task-2",
      title: "Review UKCAUD-989 Content subtask — confirm QA assignment",
      status: "pending",
      priority: "today",
      source: "jira",
      addedAt: hoursAgo(3)
    },
    {
      id: "task-3",
      title: "Triage 10 UKJPD items (batch from UPFR crossover)",
      status: "pending",
      priority: "today",
      source: "ai",
      addedAt: hoursAgo(6)
    },
    {
      id: "task-4",
      title: "Run /eod after product review meeting",
      status: "pending",
      priority: "today",
      source: "recurring",
      addedAt: hoursAgo(8),
      dueAt: todayAt(17, 0)
    },
    {
      id: "task-5",
      title: "Prepare sprint retro notes (retrospective items become tickets within 24h)",
      status: "pending",
      priority: "backlog",
      source: "manual",
      addedAt: hoursAgo(24)
    }
  ]
};

writeFileSync(DASHBOARD_DATA, JSON.stringify(data, null, 2));
console.log(`[populate-test-data] Written to ${DASHBOARD_DATA}`);
console.log(`  Priority inbox: ${data.priorityInbox.urgent.length} urgent, ${data.priorityInbox.aiSuggested.length} AI suggested, ${data.priorityInbox.today.length} today, ${data.priorityInbox.backlog.length} backlog`);
console.log(`  Projects: ${data.personalProjects.projects.length} (${data.personalProjects.projects.map(p => p.name).join(', ')})`);
console.log(`  Calendar: ${data.calendar.events.length} events`);
console.log(`  Time tracker: ${data.timeTracker.todaySessions.length} sessions today`);
console.log(`  Tasks: ${data.tasks.length}`);
console.log(`  Overnight analysis: ${Object.keys(data.overnightAnalysis.projects).length} projects analysed`);
