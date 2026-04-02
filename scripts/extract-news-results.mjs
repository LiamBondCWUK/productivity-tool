#!/usr/bin/env node
/**
 * Extract AI Breaking News Tool results into dashboard-data.json
 * Reads morning-brief.md (daily) + ai-breaking-news-report.md (comprehensive)
 * Writes to dashboard-data.json under aiNewsResults
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';

const BASE_DIR = 'C:/Users/liam.bond/Documents/Productivity Tool';
const NEWS_TOOL_DIR = 'C:/Users/liam.bond/Documents/AI Breaking News Tool';
const DASHBOARD_DATA_FILE = join(
  BASE_DIR,
  'workspace/coordinator/dashboard-data.json',
);

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function fileModTime(filePath) {
  try {
    return statSync(filePath).mtime;
  } catch {
    return null;
  }
}

/**
 * Parse morning-brief.md — extracts numbered story list items.
 * Format: `1. **Title** — Source (date). Description. [Link](url)`
 */
function parseMorningBrief(content) {
  const stories = [];
  const lines = content.split('\n');

  // Extract date from title line
  const titleMatch = content.match(/^# Morning AI Brief — (\d{4}-\d{2}-\d{2})/m);
  const date = titleMatch ? titleMatch[1] : null;

  // Parse numbered items
  const itemRegex = /^\d+\.\s+\*\*(.+?)\*\*\s+[—–-]\s+(.+)/;
  for (const line of lines) {
    const match = line.match(itemRegex);
    if (!match) continue;

    const title = match[1].trim();
    let rest = match[2].trim();

    // Extract URL if present
    const urlMatch = rest.match(/\[Link\]\(([^)]+)\)/);
    const url = urlMatch ? urlMatch[1] : undefined;

    // Strip [Link](...) from summary
    const summary = rest.replace(/\s*\[Link\]\([^)]+\)\s*/g, '').trim();

    stories.push({ title, summary, url });
  }

  return { stories, date };
}

/**
 * Parse setup suggestions from morning-brief.md
 * Finds the "## Setup Suggestions" section and extracts bullet points.
 */
function parseSetupSuggestions(content) {
  const suggestions = [];
  const setupSection = content.match(
    /## Setup Suggestions[\s\S]*?(?=^## |\Z)/m,
  );
  if (!setupSection) return suggestions;

  const lines = setupSection[0].split('\n');
  for (const line of lines) {
    const match = line.match(/^-\s+\*\*(.+?)\*\*\s*[(:]/);
    if (match) {
      suggestions.push(match[1].trim());
    }
  }
  return suggestions;
}

function main() {
  const morningBriefPath = join(NEWS_TOOL_DIR, 'morning-brief.md');
  const reportPath = join(NEWS_TOOL_DIR, 'ai-breaking-news-report.md');

  // Prefer morning-brief if it exists (more recent)
  let topStories = [];
  let suggestions = [];
  let lastRun = null;

  if (existsSync(morningBriefPath)) {
    const content = readFileSync(morningBriefPath, 'utf-8');
    const { stories, date } = parseMorningBrief(content);
    topStories = stories;
    suggestions = parseSetupSuggestions(content);
    const mtime = fileModTime(morningBriefPath);
    lastRun = mtime ? mtime.toISOString() : date ? `${date}T07:30:00.000Z` : new Date().toISOString();
    console.log(`Parsed morning-brief.md: ${stories.length} stories, ${suggestions.length} suggestions`);
  } else if (existsSync(reportPath)) {
    // Fall back to comprehensive report — extract H3 section headings as stories
    const content = readFileSync(reportPath, 'utf-8');
    const dateMatch = content.match(/\*\*Date:\*\*\s*(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : null;

    const h3Regex = /^###\s+(.+)$/gm;
    let match;
    while ((match = h3Regex.exec(content)) !== null) {
      const title = match[1].trim();
      if (title.startsWith('Table of Contents') || title === '') continue;
      // Get first non-empty line after heading as summary
      const afterHeading = content.slice(match.index + match[0].length);
      const firstPara = afterHeading
        .split('\n')
        .slice(1)
        .find((l) => l.trim().length > 10 && !l.startsWith('#'));
      topStories.push({
        title,
        summary: firstPara ? firstPara.trim().replace(/^\|.*/, '').trim() : '',
      });
      if (topStories.length >= 8) break;
    }
    const mtime = fileModTime(reportPath);
    lastRun = mtime ? mtime.toISOString() : date ? `${date}T07:30:00.000Z` : new Date().toISOString();
    console.log(`Parsed ai-breaking-news-report.md: ${topStories.length} stories`);
  } else {
    console.warn('No AI Breaking News Tool output found at:', NEWS_TOOL_DIR);
    console.warn('Expected: morning-brief.md or ai-breaking-news-report.md');
  }

  const dashboardData = readJson(DASHBOARD_DATA_FILE) || {};
  dashboardData.aiNewsResults = {
    lastRun,
    topStories: topStories.slice(0, 10),
    suggestions,
  };

  writeFileSync(DASHBOARD_DATA_FILE, JSON.stringify(dashboardData, null, 2));
  console.log(
    `Wrote ${topStories.length} stories to dashboard-data.json aiNewsResults`,
  );
}

main();
