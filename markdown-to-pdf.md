# Markdown to PDF Skill

## Description

Converts a local markdown file to a clean, functional PDF using pandoc. Installs dependencies on first use if missing.

## Usage

```bash
/markdown-to-pdf <file-path> [--output <output-path>]
```

**Parameters:**
- `<file-path>`: Path to the markdown file (relative to workspace root or absolute)
- `--output`: Optional output path. Default: same directory, same name with `.pdf` extension

**Examples:**
```bash
/markdown-to-pdf coordinator/notes/2026-03-04-agent-framework-landscape-evaluation.md
/markdown-to-pdf initiatives/aida/context.md --output /tmp/aida-context.pdf
```

## Workflow

### Step 1: Parse Arguments

Extract file path and optional output path from the user's command.

- If `--output` is provided, use that path
- Otherwise, replace `.md` extension with `.pdf` in the same directory
- Resolve relative paths against the workspace root

### Step 2: Validate Input

- Verify the file exists
- Verify it has a `.md` extension
- Confirm the output directory exists

### Step 3: Check and Install Dependencies

Run `scripts/md-to-pdf.sh --check` to verify dependencies. If missing:

1. **pandoc**: Install via `brew install pandoc`
2. **typst**: Install via `brew install typst` (lightweight modern PDF engine, no LaTeX needed)

Tell the user what's being installed and why. These are one-time installs.

### Step 4: Convert

Run the conversion script:

```bash
scripts/md-to-pdf.sh <input-path> <output-path>
```

The script handles:
- GFM input format (tables, fenced code blocks, strikethrough)
- PDF output via typst (lightweight, no LaTeX needed)
- 11pt Helvetica Neue font
- Table of contents from headings
- Syntax highlighting for code blocks
- Clickable colored links
- YAML frontmatter stripping (pandoc handles natively)

### Step 5: Report

- Confirm PDF was created successfully
- Show output path and file size
- Ask user if they want to open the PDF (`open <path>` on macOS)

## Error Handling

- **File not found**: Tell user and suggest checking the path
- **pandoc fails**: Show pandoc stderr output for diagnosis
- **Missing typst**: Install via `brew install typst`
- **Large file warning**: If input is >100KB, warn that conversion may take a moment
