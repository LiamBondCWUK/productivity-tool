# Skill: /review-github-code

## Description

Fetch and analyze code from one or more GitHub URLs. Extracts repository structure, reads key source files, and produces a structured summary of what the code does — with special focus on UK delivery integration patterns when reviewing Caseware partner code.

**Requires**: GitHub MCP server configured in `.mcp.json` with `GITHUB_TOKEN` env var set.

**Windows Setup**: Set GitHub token in PowerShell:

```powershell
[Environment]::SetEnvironmentVariable("GITHUB_TOKEN", (gh auth token), "User")
# Then restart Claude Code or manually export: $env:GITHUB_TOKEN = (gh auth token)
```

---

## Usage

```
/review-github-code <github-url> [<github-url2> ...]
```

**Examples**:

```
/review-github-code https://github.com/caseware/fr-code/tree/main/customForms/formUIIMPORT/1

/review-github-code \
  https://github.com/caseware/fr-code/tree/f649b1c/customForms/formUIIMPORT/1 \
  https://github.com/caseware/fr-code/tree/f649b1c/customForms/formREVANA5/1 \
  https://github.com/caseware/fr-code/tree/f649b1c/customForms/formUIPDF/1
```

---

## Workflow

### Step 1: Parse URLs

For each GitHub URL, extract:

- **owner**: e.g. `caseware`
- **repo**: e.g. `fr-code`
- **ref**: branch name or commit SHA (e.g. `main`, `f649b1c`)
- **path**: directory or file path within repo (e.g. `customForms/formUIIMPORT/1`)

GitHub URL formats handled:

- `https://github.com/{owner}/{repo}/tree/{ref}/{path}` → directory
- `https://github.com/{owner}/{repo}/blob/{ref}/{path}` → single file
- `https://github.com/{owner}/{repo}` → repo root

### Step 2: Fetch Directory Structure

Use `mcp__github__get_file_contents` or list directory to understand what's in the path.

If the path is a directory:

- List all files at that path
- Identify relevant source files by extension: `.js`, `.ts`, `.json`, `.xml`, `.yaml`, config files
- Note SE Builder form configs specifically (`.xml`, form definition files)

### Step 3: Read Key Files

Fetch file contents for relevant files. Prioritize:

1. Entry points (`index.js`, `main.js`, `app.js`, `index.ts`)
2. UK delivery-related files (anything with "delivery", "integration", "connector" in filename)
3. Form definition files (SE Builder config)
4. Integration/API files (files that call external services)

**Limit**: ~5 files per URL to stay within token budget. If more exist, note them and explain the selection.

### Step 4: Analyze

**For UK delivery integration code** (Caseware partner / `caseware/fr-code`):

Analyze in context of the UK delivery integration pattern:

- How does the code integrate with UK delivery? (API endpoints, request structure, auth)
- What does it do with output? (display, transform, store)
- Where does the manual integration step appear? (manual step between output and SE Builder)
- What would a native SE Builder integration need to replace the manual step?
- Does it use alternative integrations or other services?

**For general GitHub code**:

- What does this code do? (purpose and scope)
- What are the key patterns? (architecture, main logic flow)
- What are the dependencies? (external packages, services)
- Any notable implementation details?

### Step 5: Output Structured Summary

#### For UK Delivery Integration Code

```
## [Form/Component Name] — UK Delivery Integration Analysis

**What it does**: [1-2 sentence summary of the form/component's purpose]

**Integration pattern**:
- How UK delivery is called: [API endpoint, request format, parameters]
- What is returned: [output format, data structure]
- How output is used: [display logic, transformation, storage]

**SE Builder form details**:
- Form structure: [key fields, layout, data bindings]
- Data flow: [how data moves through the form]

**Integration point (manual friction)**:
- Where the manual step occurs: [specific point in workflow]
- What the user must do manually: [exact action]
- What native integration would need: [API capability or SE Builder feature required]

**Alternative integrations**: [if applicable — note any non-primary integration usage]

**Relevant files**:
- `path/to/file.js` — [purpose]
- `path/to/config.xml` — [purpose]
```

#### For General Code

```
## [Repo/Path Name] — Code Summary

**What it does**: [1-2 sentence summary]

**Key patterns**: [architecture patterns, main logic]

**Dependencies**: [notable external packages or services]

**Notable details**: [anything worth flagging — security, performance, design decisions]

**Files reviewed**:
- `path/to/file.js` — [purpose]
```

---

## Error Handling

**"Repository not found" or 403**: Private repo access requires `repo` scope on token.

**On macOS/Linux**:

```bash
gh auth refresh -s repo
source ~/.zprofile
# Retry the command
```

**On Windows (PowerShell)**:

```powershell
gh auth refresh -s repo
$env:GITHUB_TOKEN = (gh auth token)
# Restart Claude Code or retry the command
```

**GitHub MCP not connected**: Check `/mcp` in Claude Code. If `github` not listed:

- Verify `GITHUB_TOKEN` is set:
  - macOS/Linux: `echo $GITHUB_TOKEN`
  - Windows: `$env:GITHUB_TOKEN`
- If empty:
  - macOS/Linux: `export GITHUB_TOKEN=$(gh auth token)` then restart Claude Code
  - Windows: Set via PowerShell as documented above
- Restart Claude Code

**Rate limiting**: GitHub API is rate-limited. If hitting limits, wait 60 seconds and retry.

---

## Notes

- Uses `--read-only` flag — no write operations, no PR creation, safe for partner repos
- Token is sourced from `$GITHUB_TOKEN` env var (set via `~/.zprofile` on Unix or PowerShell on Windows) — never stored in files
- Works with any GitHub repo the authenticated account has access to (public or private)
- For very large repos, focus on the specific path provided rather than exploring broadly

---

**Last Updated**: 2026-04-02
**Requires**: GitHub MCP server in `.mcp.json`, `GITHUB_TOKEN` env var (Windows setup instructions included)
