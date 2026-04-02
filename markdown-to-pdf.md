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
/markdown-to-pdf C:/Users/liam.bond/Documents/Productivity Tool/workspace/coordinator/notes/2026-03-04-agent-framework-landscape-evaluation.md
/markdown-to-pdf C:/Users/liam.bond/Documents/Productivity Tool/workspace/initiatives/ukcaud/context.md --output C:/tmp/ukcaud-context.pdf
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

#### macOS/Linux:

1. **pandoc**: Install via `brew install pandoc`
2. **typst**: Install via `brew install typst` (lightweight modern PDF engine, no LaTeX needed)

#### Windows (PowerShell):

1. **pandoc**: Install via `winget install Pandoc.Pandoc` or download from https://pandoc.org/installing.html
2. **typst**: Install via `winget install typst.typst` or download from https://github.com/typst/typst/releases

Tell the user what's being installed and why. These are one-time installs.

### Step 4: Convert

Run the conversion script:

**macOS/Linux**:

```bash
scripts/md-to-pdf.sh <input-path> <output-path>
```

**Windows (PowerShell)**:

```powershell
# Alternative: Use pandoc directly if script is not available
pandoc <input-path> -o <output-path> --pdf-engine=typst --from=gfm+yaml_metadata_block --variable classoption=11pt
```

The conversion handles:

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
- Ask user if they want to open the PDF:
  - macOS: `open <path>`
  - Windows: `explorer <path>` (opens file explorer) or `Start-Process <path>` (opens in default viewer)
  - Linux: `xdg-open <path>`

## Error Handling

- **File not found**: Tell user and suggest checking the path
- **pandoc fails**: Show pandoc stderr output for diagnosis
- **Missing typst**: Install via platform-specific command (see Step 3)
- **Large file warning**: If input is >100KB, warn that conversion may take a moment
- **Windows path issues**: Windows uses backslashes and may have path length limits (260 chars). Use UNC paths or forward slashes if needed.

## Platform-Specific Notes

### Windows

- Path separator: Use forward slashes `/` or escaped backslashes `\\` in PowerShell
- Example: `C:/Users/liam.bond/Documents/Productivity Tool/workspace/coordinator/notes/file.md`
- If pandoc is not in PATH after install, add it manually:
  ```powershell
  $env:PATH += ";C:\Program Files\Pandoc"
  ```

### macOS/Linux

- Use standard Unix paths with forward slashes
- Ensure script has execute permissions: `chmod +x scripts/md-to-pdf.sh`

---

**Last Updated**: 2026-04-02
**Version**: 2.0 (Updated with Windows support and initiative name changes)
