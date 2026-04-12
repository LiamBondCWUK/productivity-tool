#!/usr/bin/env node
/**
 * Overnight Analysis Agent
 * Runs at 02:00 Mon-Fri via Windows Task Scheduler
 * Reads all personal projects, calls Claude API, writes suggestions to dashboard-data.json
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync, spawnSync } from 'child_process';

const BASE_DIR = 'C:/Users/liam.bond/Documents/Productivity Tool';
const REGISTRY_FILE = join(BASE_DIR, 'workspace/coordinator/project-registry.json');
const DASHBOARD_DATA_FILE = join(BASE_DIR, 'workspace/coordinator/dashboard-data.json');
const OVERNIGHT_REPORT_FILE = join(BASE_DIR, 'workspace/coordinator/overnight-report.md');
const DOC_HEALTH_SCRIPT = join(BASE_DIR, 'scripts/doc-freshness-check.ps1');
const DOC_HEALTH_REPORT_FILE = join(BASE_DIR, 'workspace/coordinator/doc-health-report.json');


function slugify(name) {
  return name.toLowerCase().replace(/\s+/g, '-');
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function readTextFile(filePath, maxLines = 100) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    if (lines.length <= maxLines) return content;
    return lines.slice(0, maxLines).join('\n') + '\n[...truncated]';
  } catch {
    return null;
  }
}

function runDocHealthCheck() {
  if (!existsSync(DOC_HEALTH_SCRIPT)) {
    return null;
  }

  try {
    execSync(
      `powershell -ExecutionPolicy Bypass -File "${DOC_HEALTH_SCRIPT}" -StaleDays 21 -WriteDashboard`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );

    if (!existsSync(DOC_HEALTH_REPORT_FILE)) {
      return null;
    }

    return readJson(DOC_HEALTH_REPORT_FILE);
  } catch {
    return null;
  }
}

function gitLog(gitDir) {
  try {
    return execSync(
      'git log --since="7 days ago" --oneline',
      { cwd: gitDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim().slice(0, 2000);
  } catch {
    return null;
  }
}

function globMarkdownFiles(dir) {
  try {
    const result = execSync(
      `find "${dir}" -name "*.md" -type f 2>/dev/null`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return result.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function collectProjectContext(entry) {
  const sections = [];
  const slug = slugify(entry.name);
  sections.push(`## Project: ${entry.name} (key: ${slug})`);
  sections.push(`Phase: ${entry.phase} | HasGit: ${entry.hasGit} | HasClaude: ${entry.hasClaude}`);
  sections.push(`Description: ${entry.description || 'none'}`);
  sections.push(`Last commit: ${entry.lastCommit || 'none'}`);
  if (entry.lastCommitMsg) sections.push(`Last commit message: ${entry.lastCommitMsg}`);

  if (entry.hasGit && entry.path && existsSync(entry.path)) {
    const log = gitLog(entry.path);
    if (log) {
      sections.push(`\n### Git Log (last 7 days)\n${log}`);
    } else {
      sections.push('\n### Git Log: no commits in last 7 days');
    }
  }

  if (entry.path && existsSync(entry.path)) {
    const devActiveDir = join(entry.path, 'dev', 'active');
    if (existsSync(devActiveDir)) {
      const mdFiles = globMarkdownFiles(devActiveDir);
      for (const filePath of mdFiles.slice(0, 3)) {
        const fileContent = readTextFile(filePath, 80);
        if (fileContent) {
          const filename = filePath.split('/').pop();
          sections.push(`\n### Dev Doc: ${filename}\n${fileContent}`);
        }
      }
    }

    const commandsDir = join(entry.path, 'commands');
    if (existsSync(commandsDir)) {
      const cmdFiles = globMarkdownFiles(commandsDir);
      const cmdList = cmdFiles.map(f => f.split('/').pop().replace('.md', '')).join(', ');
      if (cmdList) sections.push(`\n### Commands Available\n${cmdList}`);
    }

    const changelogFile = join(entry.path, 'CHANGELOG-PENDING.md');
    const changelog = readTextFile(changelogFile, 50);
    if (changelog) sections.push(`\n### CHANGELOG-PENDING\n${changelog}`);
  }

  return sections.join('\n');
}


function callClaudeViaCLI(systemPrompt, userPrompt) {
  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
  const result = spawnSync('claude', ['--print'], {
    input: fullPrompt,
    encoding: 'utf-8',
    timeout: 180000,
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.error) throw new Error(`Claude CLI error: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`Claude CLI exited ${result.status}: ${result.stderr}`);
  return result.stdout.trim();
}

function analyseProjects() {
  const registry = readJson(REGISTRY_FILE);
  if (!registry || !registry.projects) {
    console.error('Could not read project-registry.json — run node scripts/project-discovery.mjs first');
    process.exit(1);
  }
  const projects = registry.projects;

  const projectContexts = projects.map(collectProjectContext).join('\n\n---\n\n');

  const systemPrompt = `You are an AI assistant performing a nightly deep-dive analysis of a developer's personal projects.
Analyse the provided project data and generate actionable suggestions.
Be specific and concrete — not vague. Reference actual file names, command names, or git activity where relevant.
Focus on what will have the highest impact in the next 1-2 days.`;

  const userPrompt = `Analyse these personal AI projects. For each project, provide:
1. Current state summary (1 sentence)
2. Top 3 suggested next actions (ranked by impact, be specific)
3. Any quality issues in commands/skills found (specific improvements)
4. Cross-project dependency flags (does one project block another?)
5. What has been neglected (not touched in 5+ days, incomplete tasks)

Respond ONLY as JSON with this exact structure (no markdown wrapper):
{
  "projects": {
    "<project-name-slug>": {
      "state": "string",
      "suggestions": [
        { "priority": "HIGH|MED|LOW", "action": "string", "effort": "S|M|L" }
      ],
      "qualityIssues": ["string"],
      "neglected": ["string"],
      "crossProjectDeps": ["string"]
    }
  },
  "globalInsights": ["string"],
  "topPriorityAction": "string"
}

PROJECT DATA:
${projectContexts}`;

  console.log('Calling Claude CLI for overnight analysis...');

  let analysisResult;
  try {
    const responseText = callClaudeViaCLI(systemPrompt, userPrompt);

    const jsonMatch = responseText.match(/```json\n?([\s\S]*?)\n?```/) ||
                      responseText.match(/(\{[\s\S]*\})/);
    const jsonStr = jsonMatch ? jsonMatch[1] : responseText;
    analysisResult = JSON.parse(jsonStr.trim());
  } catch (error) {
    console.error('Claude API call or parse failed:', error.message);
    analysisResult = {
      projects: {},
      globalInsights: [`Analysis failed: ${error.message}`],
      topPriorityAction: 'Check overnight analysis logs for errors',
    };
  }

  const dashboardData = readJson(DASHBOARD_DATA_FILE) || {};
  const docHealth = runDocHealthCheck();

  if (docHealth) {
    dashboardData.docHealth = {
      lastRun: docHealth.generatedAt,
      staleDocs: docHealth.staleDocs || [],
    };
  }

  dashboardData.overnightAnalysis = {
    generatedAt: new Date().toISOString(),
    projects: analysisResult.projects || {},
    globalInsights: analysisResult.globalInsights || [],
    topPriorityAction: analysisResult.topPriorityAction || '',
  };

  if (!dashboardData.priorityInbox) {
    dashboardData.priorityInbox = {
      urgent: [],
      aiSuggested: [],
      today: [],
      backlog: [],
    };
  }

  if (!Array.isArray(dashboardData.priorityInbox.aiSuggested)) {
    dashboardData.priorityInbox.aiSuggested = [];
  }

  dashboardData.priorityInbox.aiSuggested = dashboardData.priorityInbox.aiSuggested.filter(
    item => !(typeof item?.id === 'string' && item.id.startsWith('doc-health-'))
  );

  if (docHealth?.staleDocs?.length) {
    const topDocs = docHealth.staleDocs.slice(0, 5);
    const docSuggestions = topDocs.map((doc) => ({
      id: `doc-health-${doc.id}`,
      title: `Refresh stale doc: ${doc.filePath}`,
      type: 'ai-suggestion',
      source: 'doc-health-check',
      priority: doc.priority === 'HIGH' ? 'urgent' : 'today',
      addedAt: new Date().toISOString(),
      reasoning: `${doc.daysSinceUpdate} days since last update (${doc.reason})`,
      link: undefined,
    }));

    dashboardData.priorityInbox.aiSuggested.unshift(...docSuggestions);
  }

  if (dashboardData.personalProjects?.projects) {
    dashboardData.personalProjects.projects = dashboardData.personalProjects.projects.map(project => {
      const key = slugify(project.name);
      const analysis = analysisResult.projects?.[key];
      if (!analysis) return project;
      return {
        ...project,
        state: analysis.state,
        suggestions: analysis.suggestions || [],
        neglected: analysis.neglected || [],
        crossProjectDeps: analysis.crossProjectDeps || [],
      };
    });
  }

  writeFileSync(DASHBOARD_DATA_FILE, JSON.stringify(dashboardData, null, 2));
  console.log('Updated dashboard-data.json with overnight analysis');

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  let report = `# Overnight Analysis Report\n## ${dateStr} at ${timeStr}\n\n`;

  if (analysisResult.topPriorityAction) {
    report += `## Top Priority Action\n${analysisResult.topPriorityAction}\n\n`;
  }

  if (analysisResult.globalInsights?.length) {
    report += `## Global Insights\n${analysisResult.globalInsights.map(i => `- ${i}`).join('\n')}\n\n`;
  }

  if (docHealth) {
    report += `## Documentation Freshness\n`;
    report += `- Last run: ${docHealth.generatedAt}\n`;
    report += `- Stale docs: ${docHealth.summary?.staleCount ?? 0}\n`;
    report += `- High priority stale docs: ${docHealth.summary?.highPriorityCount ?? 0}\n\n`;

    if (Array.isArray(docHealth.staleDocs) && docHealth.staleDocs.length > 0) {
      report += `### Top stale docs\n`;
      for (const doc of docHealth.staleDocs.slice(0, 5)) {
        report += `- [${doc.priority}] ${doc.filePath} (${doc.daysSinceUpdate} days)\n`;
      }
      report += '\n';
    }
  }

  for (const entry of projects) {
    const key = slugify(entry.name);
    const analysis = analysisResult.projects?.[key];
    if (!analysis) continue;

    report += `## ${entry.name} (${entry.phase})\n`;
    report += `**State:** ${analysis.state}\n\n`;

    if (analysis.suggestions?.length) {
      report += `**Suggestions:**\n`;
      for (const s of analysis.suggestions) {
        report += `- [${s.priority}] [${s.effort}] ${s.action}\n`;
      }
      report += '\n';
    }

    if (analysis.qualityIssues?.length) {
      report += `**Quality Issues:** ${analysis.qualityIssues.join('; ')}\n\n`;
    }

    if (analysis.neglected?.length) {
      report += `**Neglected:** ${analysis.neglected.join(', ')}\n\n`;
    }

    if (analysis.crossProjectDeps?.length) {
      report += `**Cross-project deps:** ${analysis.crossProjectDeps.join(', ')}\n\n`;
    }
  }

  writeFileSync(OVERNIGHT_REPORT_FILE, report);
  console.log(`Overnight report written to ${OVERNIGHT_REPORT_FILE}`);
  console.log('Overnight analysis complete.');
}

try {
  analyseProjects();
} catch (error) {
  console.error('Fatal error in overnight analysis:', error);
  process.exit(1);
}
