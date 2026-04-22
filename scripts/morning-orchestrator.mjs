#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_FILE = join(ROOT, 'workspace', 'coordinator', 'dashboard-data.json');
const CLAUDE_DIR = join(process.env.USERPROFILE || process.env.HOME || '', '.claude');
const NEWS_ROOT = 'C:\\Users\\liam.bond\\Documents\\AI Breaking News Tool';
const NEVER_SUGGEST_FILE = join(NEWS_ROOT, 'never-suggest.md');
const GNEWS_SCRIPT = join(NEWS_ROOT, 'scripts', 'scrape-gnews.js');

function runGnewsScraper() {
  if (!existsSync(GNEWS_SCRIPT)) {
    console.warn('[gnews] scraper not found, skipping');
    return;
  }
  try {
    console.log('[gnews] running scraper…');
    execSync(`node "${GNEWS_SCRIPT}"`, {
      cwd: NEWS_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60_000,
    });
    console.log('[gnews] scraper done');
  } catch (err) {
    console.warn('[gnews] scraper failed (will use cached):', err.message?.split('\n')[0]);
  }
}

const AI_KEYWORDS = [
  'llm', 'gpt', 'claude', 'anthropic', 'openai', 'gemini', 'mcp',
  'agent', ' ai ', 'copilot', 'langchain', 'ollama', 'whisper',
  'vector', 'embedding', 'rag', 'transformer', 'hugging face',
  'mistral', 'llama', 'fine-tun', 'claude code', 'mcp server',
];

function isAiRelated(text = '') {
  const lower = text.toLowerCase();
  return AI_KEYWORDS.some((kw) => lower.includes(kw));
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ─────────────────────────────────────────
// LIVE INVENTORY: what's already installed
// ─────────────────────────────────────────

function buildLiveInventory() {
  const installed = new Set();

  // 1. MCP servers from ~/.claude/settings.json
  const settingsFile = join(CLAUDE_DIR, 'settings.json');
  if (existsSync(settingsFile)) {
    try {
      const settings = JSON.parse(readFileSync(settingsFile, 'utf8'));
      const mcpServers = settings.mcpServers ?? {};
      Object.keys(mcpServers).forEach((name) => installed.add(name.toLowerCase()));
      Object.values(mcpServers).forEach((cfg) => {
        const cmd = cfg?.command ?? '';
        const args = cfg?.args ?? [];
        [...args, cmd].forEach((a) => {
          if (typeof a === 'string' && a.startsWith('@')) installed.add(a.toLowerCase());
        });
      });
    } catch { /* ignore */ }
  }

  // 2. Installed skills/plugins from ~/.claude/plugins/cache/
  const pluginsCache = join(CLAUDE_DIR, 'plugins', 'cache');
  if (existsSync(pluginsCache)) {
    try {
      readdirSync(pluginsCache).forEach((d) => installed.add(d.toLowerCase()));
    } catch { /* ignore */ }
  }

  // 3. Skills from ~/.claude/skills/ if it exists
  const skillsDir = join(CLAUDE_DIR, 'skills');
  if (existsSync(skillsDir)) {
    try {
      readdirSync(skillsDir).forEach((f) =>
        installed.add(f.replace(/\.[^.]+$/, '').toLowerCase()),
      );
    } catch { /* ignore */ }
  }

  // 4. Global npm packages
  try {
    const npmOut = execSync('npm list -g --depth=0 --json', {
      encoding: 'utf8',
      timeout: 15_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const npmData = JSON.parse(npmOut);
    Object.keys(npmData.dependencies ?? {}).forEach((pkg) =>
      installed.add(pkg.toLowerCase()),
    );
  } catch { /* npm unavailable */ }

  // 5. setup-record.md keywords (best-effort)
  const setupRecord = join(NEWS_ROOT, 'setup-record.md');
  if (existsSync(setupRecord)) {
    readFileSync(setupRecord, 'utf8')
      .split('\n')
      .forEach((line) => {
        const match = line.match(/`([@\w/-]+)`/);
        if (match) installed.add(match[1].toLowerCase());
      });
  }

  // 6. never-suggest.md — treated as "installed" so items are skipped
  if (existsSync(NEVER_SUGGEST_FILE)) {
    readFileSync(NEVER_SUGGEST_FILE, 'utf8')
      .split('\n')
      .map((l) => l.replace(/^[-*#\s]+/, '').trim().toLowerCase())
      .filter(Boolean)
      .forEach((item) => installed.add(item));
  }

  console.log(`[inventory] ${installed.size} items in current setup`);
  return installed;
}

// ─────────────────────────────────────────
// SOURCE FETCHERS
// ─────────────────────────────────────────

async function fetchHackerNews() {
  try {
    const idsRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
    const ids = await idsRes.json();
    const items = await Promise.all(
      ids.slice(0, 80).map((id) =>
        fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
          .then((r) => r.json())
          .catch(() => null),
      ),
    );
    // Only stories from the last 48h to keep feed current
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    return items
      .filter((item) => item && item.score > 50 && isAiRelated(item.title) && item.time * 1000 > cutoff)
      .slice(0, 12)
      .map((item) => ({
        title: item.title,
        summary: `HN | ${item.score} points | ${item.descendants ?? 0} comments`,
        url: item.url ?? `https://news.ycombinator.com/item?id=${item.id}`,
        publishedAt: new Date(item.time * 1000).toISOString(),
        source: 'hackernews',
        rawTitle: item.title,
      }));
  } catch (err) {
    console.error('[HN] failed:', err.message);
    return [];
  }
}

async function fetchGitHubRepos() {
  const headers = { 'User-Agent': 'AI-Breaking-News-Tool/1.0' };
  if (process.env.GITHUB_TOKEN) headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;

  // Filter to repos pushed in the last 30 days so results stay trending/recent
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const queries = [
    `topic:mcp pushed:>${monthAgo}`,
    `topic:llm-tools pushed:>${monthAgo}`,
  ];

  const results = [];
  for (const q of queries) {
    try {
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=10`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        console.warn(`[GitHub repos] query "${q}" returned ${res.status}`);
        continue;
      }
      const data = await res.json();
      results.push(...(data.items ?? []));
    } catch (err) {
      console.error('[GitHub repos] failed:', err.message);
    }
  }

  // Deduplicate by repo id
  const seen = new Set();
  return results
    .filter((repo) => {
      if (seen.has(repo.id)) return false;
      seen.add(repo.id);
      return true;
    })
    .slice(0, 20)
    .map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      owner: repo.owner.login,
      url: repo.html_url,
      stars: repo.stargazers_count,
      description: repo.description,
      language: repo.language,
      topics: repo.topics ?? [],
      updatedAt: repo.updated_at,
    }));
}

async function fetchReddit() {
  const subs = 'ClaudeAI+ClaudeCode+mcp+LocalLLaMA';
  try {
    const res = await fetch(`https://www.reddit.com/r/${subs}/hot.json?limit=30`, {
      headers: { 'User-Agent': 'AI-Breaking-News-Tool/1.0' },
    });
    if (!res.ok) throw new Error(`Reddit ${res.status}`);
    const data = await res.json();
    return (data.data?.children ?? [])
      .map((c) => c.data)
      .filter((p) => p.score > 30 && !p.stickied)
      .slice(0, 10)
      .map((p) => ({
        title: p.title,
        source: 'reddit',
        summary: `r/${p.subreddit} | ${p.score} upvotes | ${p.num_comments} comments`,
        url: `https://www.reddit.com${p.permalink}`,
        publishedAt: new Date(p.created_utc * 1000).toISOString(),
        rawTitle: p.title,
      }));
  } catch (err) {
    console.error('[Reddit] failed:', err.message);
    return [];
  }
}

async function fetchAnthropicReleases() {
  const repos = [
    'anthropics/claude-code',
    'anthropics/anthropic-sdk-js',
    'anthropics/anthropic-sdk-python',
  ];
  const headers = { 'User-Agent': 'AI-Breaking-News-Tool/1.0' };
  if (process.env.GITHUB_TOKEN) headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
  const results = [];
  for (const repo of repos) {
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers });
      if (!res.ok) continue;
      const release = await res.json();
      results.push({
        title: `${repo} ${release.tag_name} released`,
        summary: (release.body ?? '').slice(0, 200).replace(/\n/g, ' '),
        url: release.html_url,
        publishedAt: release.published_at,
        source: 'anthropic-release',
        rawTitle: `${repo} ${release.tag_name}`,
        repo,
        version: release.tag_name,
      });
    } catch { /* skip */ }
  }
  return results;
}

async function fetchMcpRegistry() {
  const headers = { 'User-Agent': 'AI-Breaking-News-Tool/1.0' };
  if (process.env.GITHUB_TOKEN) headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
  try {
    const res = await fetch(
      'https://api.github.com/repos/punkpeye/awesome-mcp-servers/commits?per_page=5',
      { headers },
    );
    if (!res.ok) throw new Error(`MCP registry ${res.status}`);
    const commits = await res.json();
    return (commits ?? []).slice(0, 3).map((c) => ({
      title: `awesome-mcp-servers: ${c.commit.message.split('\n')[0]}`,
      summary: `New MCP server addition — ${new Date(c.commit.author.date).toLocaleDateString()}`,
      url: `https://github.com/punkpeye/awesome-mcp-servers/commit/${c.sha}`,
      publishedAt: c.commit.author.date,
      source: 'mcp-registry',
      rawTitle: c.commit.message,
    }));
  } catch (err) {
    console.error('[MCP registry] failed:', err.message);
    return [];
  }
}

async function fetchArxiv() {
  const TOOL_KEYWORDS = ['tool', 'agent', 'code', 'assistant', 'framework', 'benchmark', 'evaluation'];
  try {
    const res = await fetch('https://export.arxiv.org/rss/cs.AI', {
      headers: { 'User-Agent': 'AI-Breaking-News-Tool/1.0' },
    });
    if (!res.ok) throw new Error(`arXiv ${res.status}`);
    const xml = await res.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
      const get = (tag) => {
        const match = m[1].match(
          new RegExp(
            `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`,
          ),
        );
        return match ? (match[1] ?? match[2] ?? '').trim() : '';
      };
      return {
        title: get('title'),
        description: get('description'),
        link: get('link'),
        pubDate: get('pubDate'),
      };
    });
    const practical = items
      .filter((i) => TOOL_KEYWORDS.some((kw) => i.title.toLowerCase().includes(kw)))
      .slice(0, 5);
    return practical.map((i) => ({
      title: i.title,
      summary: i.description.slice(0, 180).replace(/<[^>]+>/g, ''),
      url: i.link,
      publishedAt: i.pubDate,
      source: 'arxiv',
      rawTitle: i.title,
    }));
  } catch (err) {
    console.error('[arXiv] failed:', err.message);
    return [];
  }
}

async function fetchProductHunt() {
  try {
    const res = await fetch('https://www.producthunt.com/feed?category=artificial-intelligence', {
      headers: { 'User-Agent': 'AI-Breaking-News-Tool/1.0' },
    });
    if (!res.ok) throw new Error(`ProductHunt ${res.status}`);
    const xml = await res.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
      const title =
        (m[1].match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ?? [])[1] ?? '';
      const link = (m[1].match(/<link>(.*?)<\/link>/) ?? [])[1] ?? '';
      const desc =
        (m[1].match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ?? [])[1] ?? '';
      const pubDate = (m[1].match(/<pubDate>(.*?)<\/pubDate>/) ?? [])[1] ?? '';
      return { title, link, desc, pubDate };
    });
    return items.slice(0, 8).map((i) => ({
      title: i.title,
      summary: i.desc.replace(/<[^>]+>/g, '').slice(0, 180),
      url: i.link,
      publishedAt: i.pubDate,
      source: 'producthunt',
      rawTitle: i.title,
    }));
  } catch (err) {
    console.error('[ProductHunt] failed:', err.message);
    return [];
  }
}

function loadGNewsStories() {
  const gnewsFile = join(NEWS_ROOT, 'gnews-raw.json');
  if (!existsSync(gnewsFile)) return [];
  try {
    const raw = JSON.parse(readFileSync(gnewsFile, 'utf8'));
    const ageHours = (Date.now() - new Date(raw.scrapedAt).getTime()) / 36e5;
    if (ageHours > 24) return [];
    const articles = [
      ...(raw.personalisedFeed ?? []),
      ...Object.values(raw.rssSearches ?? {}).flat(),
    ];
    return articles.slice(0, 20).map((a) => ({
      title: a.title,
      summary: a.source ?? '',
      url: a.link ?? a.url ?? '',
      publishedAt: a.pubDate ?? null,
      source: 'gnews',
      rawTitle: a.title,
    }));
  } catch {
    return [];
  }
}

function runInternalIntel() {
  const script = join(ROOT, 'scripts', 'collect-internal-intel.mjs');
  if (!existsSync(script)) {
    console.warn('[internal-intel] collect-internal-intel.mjs not found, skipping');
    return null;
  }
  try {
    execSync(`node "${script}"`, { stdio: 'inherit', timeout: 60_000 });
    const data = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
    return data.aiNewsResults?.internalIntel ?? null;
  } catch (err) {
    console.error('[internal-intel] failed:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────
// SUGGESTION EXTRACTION → recommendedInstalls
// Uses RecommendedInstall type: { id, name, category, priority, description, signal, installCommand?, status, addedAt }
// category: "MCP" | "Plugin" | "VSCode" | "npm" | "App" | "Architecture"
// status: "PENDING" | "INSTALLED" | "SKIPPED"
// priority: "HIGH" | "MED" | "LOW"
// ─────────────────────────────────────────

function extractInstallSuggestions(allItems, githubRepos, installed) {
  const suggestions = [];

  // 1. MCP server mentions in HN/Reddit/ProductHunt titles
  const mcpPattern = /\b([\w-]+-mcp|mcp-[\w-]+)\b/gi;
  for (const item of allItems) {
    const text = (item.rawTitle ?? item.title ?? '') + ' ' + (item.summary ?? '');
    for (const match of text.matchAll(mcpPattern)) {
      const name = match[1].toLowerCase().replace(/\s+/g, '-');
      const id = slugify(name);
      if (installed.has(id) || installed.has(name)) continue;
      suggestions.push({
        id,
        name: match[1],
        category: 'MCP',
        priority: 'MED',
        description: `Mentioned in ${item.source}: "${(item.rawTitle ?? item.title ?? '').slice(0, 80)}"`,
        signal: item.url ?? '',
        installCommand: `# Investigate: ${item.url}\n# claude mcp add ${name} npx -y <package>`,
        status: 'PENDING',
        addedAt: new Date().toISOString(),
      });
    }
  }

  // 2. New GitHub repos with mcp/claude/llm topics
  for (const repo of githubRepos.slice(0, 8)) {
    const id = slugify(repo.fullName);
    if (installed.has(id) || installed.has(repo.name.toLowerCase())) continue;
    const isMcp = repo.topics.some((t) => t.includes('mcp'));
    suggestions.push({
      id,
      name: repo.fullName,
      category: isMcp ? 'MCP' : 'App',
      priority: repo.stars > 500 ? 'HIGH' : 'MED',
      description: repo.description
        ? `${repo.description.slice(0, 140)} (⭐${repo.stars})`
        : `New ${repo.language ?? 'AI'} repo (⭐${repo.stars})`,
      signal: repo.url,
      installCommand: isMcp
        ? `claude mcp add ${repo.name} npx -y <lookup-package-for-${repo.name}>`
        : `gh repo clone ${repo.fullName}`,
      status: 'PENDING',
      addedAt: new Date().toISOString(),
    });
  }

  // 3. Anthropic tool updates (claude-code itself, SDKs)
  for (const item of allItems.filter((i) => i.source === 'anthropic-release')) {
    const id = slugify(item.rawTitle ?? item.title ?? '');
    const isClaudeCode = (item.repo ?? '').includes('claude-code');
    const isSdkJs = (item.repo ?? '').includes('anthropic-sdk-js');
    const isSdkPy = (item.repo ?? '').includes('anthropic-sdk-python');
    let installCommand = `gh release view --repo ${item.repo ?? 'anthropics/claude-code'}`;
    if (isClaudeCode) installCommand = 'npm update -g @anthropic-ai/claude-code';
    else if (isSdkJs) installCommand = 'npm update @anthropic-ai/sdk';
    else if (isSdkPy) installCommand = 'pip install --upgrade anthropic';
    suggestions.push({
      id,
      name: item.title,
      category: isClaudeCode ? 'App' : 'npm',
      priority: 'HIGH',
      description: item.summary ? item.summary.slice(0, 200) : 'New release from Anthropic',
      signal: item.url ?? '',
      installCommand,
      status: 'PENDING',
      addedAt: new Date().toISOString(),
    });
  }

  // 4. GNews articles about tools/products worth evaluating for setup
  const GNEWS_TOOL_SIGNALS = [
    'release', 'launch', 'open source', 'open-source', 'plugin', 'extension',
    ' cli ', 'command line', 'mcp', 'npm package', 'framework', ' sdk', ' api ',
    'cursor', 'windsurf', 'continue.dev', 'cline', 'copilot', 'devin',
    'vs code', 'vscode', 'neovim', 'jetbrains', 'zed editor',
    'claude code', 'claude desktop', 'anthropic',
    'model context', 'agent tool', 'coding assistant', 'ai tool',
  ];
  const GNEWS_SKIP_SIGNALS = [
    'raises', 'funding', 'valuation', 'lawsuit', 'regulation', 'policy',
    'stock', 'shares', 'acquisition', 'merger', 'layoff', 'job',
  ];

  for (const item of allItems.filter((i) => i.source === 'gnews')) {
    const text = ((item.rawTitle ?? item.title ?? '') + ' ' + (item.summary ?? '')).toLowerCase();
    const isToolRelated = GNEWS_TOOL_SIGNALS.some((sig) => text.includes(sig));
    const isNoise = GNEWS_SKIP_SIGNALS.some((sig) => text.includes(sig));
    if (!isToolRelated || isNoise) continue;

    const id = 'gnews-' + slugify((item.rawTitle ?? item.title ?? '').slice(0, 60));
    if (installed.has(id)) continue;

    const isMcp = text.includes('mcp') || text.includes('model context');
    const isVSCode = text.includes('vs code') || text.includes('vscode') || text.includes('extension');
    const isNpm = text.includes('npm') || text.includes('package') || text.includes('framework') || text.includes(' sdk');
    const category = isMcp ? 'MCP' : isVSCode ? 'VSCode' : isNpm ? 'npm' : 'App';

    suggestions.push({
      id,
      name: (item.rawTitle ?? item.title ?? '').slice(0, 80),
      category,
      priority: 'MED',
      description: `Google News: ${(item.summary ?? '').slice(0, 140) || (item.rawTitle ?? item.title ?? '')}`,
      signal: item.url ?? '',
      installCommand: `# Read then evaluate:\n# ${item.url}`,
      status: 'PENDING',
      addedAt: new Date().toISOString(),
    });
  }

  // Deduplicate by id, keep first occurrence
  const seen = new Set();
  return suggestions
    .filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    })
    .slice(0, 30);
}

// ─────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────

async function main() {
  console.log('[morning-orchestrator] Starting...');

  // Step 1: build live inventory FIRST
  const installed = buildLiveInventory();

  // Step 2: fetch all sources in parallel
  const [
    hnStories,
    githubRepos,
    redditPosts,
    anthropicReleases,
    mcpRegistry,
    arxivPapers,
    phProducts,
  ] = await Promise.all([
    fetchHackerNews(),
    fetchGitHubRepos(),
    fetchReddit(),
    fetchAnthropicReleases(),
    fetchMcpRegistry(),
    fetchArxiv(),
    fetchProductHunt(),
  ]);

  runGnewsScraper();
  const gnewsStories = loadGNewsStories();

  // Step 3: run internal intel (Teams/Confluence/Newsletters)
  const internalIntel = runInternalIntel();

  // Step 4: build top stories (all external sources merged, de-duped by URL)
  const allExternal = [
    ...gnewsStories,
    ...hnStories,
    ...redditPosts,
    ...anthropicReleases,
    ...mcpRegistry,
    ...arxivPapers,
    ...phProducts,
  ];
  const seenUrls = new Set();
  const topStories = allExternal
    .filter((s) => {
      if (!s.url || seenUrls.has(s.url)) return false;
      seenUrls.add(s.url);
      return true;
    })
    // Sort by publishedAt descending so today's content appears first
    .sort((a, b) => {
      const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return tb - ta;
    })
    .slice(0, 25);

  // Step 5: extract install suggestions (net-new only)
  const newSuggestions = extractInstallSuggestions(allExternal, githubRepos, installed);

  // Step 6: merge with existing recommendedInstalls (preserve status of existing items)
  const existing = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  const existingInstalls = existing.recommendedInstalls?.items ?? [];
  const existingById = new Map(existingInstalls.map((i) => [i.id, i]));

  for (const suggestion of newSuggestions) {
    if (!existingById.has(suggestion.id)) {
      existingById.set(suggestion.id, suggestion);
    }
  }

  existing.recommendedInstalls = {
    lastUpdated: new Date().toISOString(),
    items: [...existingById.values()],
  };

  // Step 7: write aiNewsResults
  existing.aiNewsResults = {
    ...(existing.aiNewsResults ?? {}),
    lastRun: new Date().toISOString(),
    topStories,
    popularRepos: githubRepos,
    internalIntel: internalIntel ?? existing.aiNewsResults?.internalIntel ?? {},
  };

  writeFileSync(DATA_FILE, JSON.stringify(existing, null, 2));

  console.log(`[morning-orchestrator] Done.`);
  console.log(
    `  Sources: HN:${hnStories.length} GH:${githubRepos.length} Reddit:${redditPosts.length} Anthropic:${anthropicReleases.length} MCP:${mcpRegistry.length} arXiv:${arxivPapers.length} PH:${phProducts.length} GNews:${gnewsStories.length}`,
  );
  console.log(
    `  Net-new suggestions: ${newSuggestions.length} | Total install queue: ${existingById.size}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
