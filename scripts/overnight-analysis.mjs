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
const PROJECTS_FILE = join(BASE_DIR, 'workspace/config/personal-projects.json');
const DASHBOARD_DATA_FILE = join(BASE_DIR, 'workspace/coordinator/dashboard-data.json');
const OVERNIGHT_REPORT_FILE = join(BASE_DIR, 'workspace/coordinator/overnight-report.md');

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

function collectProjectContext(project) {
  const sections = [];
  sections.push(`## Project: ${project.name} (id: ${project.id})`);
  sections.push(`Phase: ${project.phase} | Completion: ${project.completionPercent}%`);
  sections.push(`Tags: ${(project.tags || []).join(', ')}`);
  sections.push(`Description: ${project.description}`);

  if (project.gitDir && existsSync(project.gitDir)) {
    const log = gitLog(project.gitDir);
    if (log) {
      sections.push(`\n### Git Log (last 7 days)\n${log}`);
    } else {
      sections.push('\n### Git Log: no commits in last 7 days');
    }
  }

  if (project.dir && existsSync(project.dir)) {
    if (project.devDocsDir) {
      const devDir = join(project.dir, project.devDocsDir);
      if (existsSync(devDir)) {
        const mdFiles = globMarkdownFiles(devDir);
        for (const filePath of mdFiles.slice(0, 3)) {
          const content = readTextFile(filePath, 80);
          if (content) {
            const filename = filePath.split('/').pop();
            sections.push(`\n### Dev Doc: ${filename}\n${content}`);
          }
        }
      }
    }

    const commandsDir = join(project.dir, 'commands');
    if (existsSync(commandsDir)) {
      const cmdFiles = globMarkdownFiles(commandsDir);
      const cmdList = cmdFiles.map(f => f.split('/').pop().replace('.md', '')).join(', ');
      if (cmdList) sections.push(`\n### Commands Available\n${cmdList}`);
    }

    const changelogFile = join(project.dir, 'CHANGELOG-PENDING.md');
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
  const projects = readJson(PROJECTS_FILE);
  if (!projects) {
    console.error('Could not read personal-projects.json');
    process.exit(1);
  }

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
    "<project-id>": {
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
  dashboardData.overnightAnalysis = {
    generatedAt: new Date().toISOString(),
    projects: analysisResult.projects || {},
    globalInsights: analysisResult.globalInsights || [],
    topPriorityAction: analysisResult.topPriorityAction || '',
  };

  if (dashboardData.personalProjects?.projects) {
    dashboardData.personalProjects.projects = dashboardData.personalProjects.projects.map(project => {
      const analysis = analysisResult.projects?.[project.id];
      if (!analysis) return project;
      return {
        ...project,
        overnightState: analysis.state,
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

  for (const project of projects) {
    const analysis = analysisResult.projects?.[project.id];
    if (!analysis) continue;

    report += `## ${project.name} (${project.phase})\n`;
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
