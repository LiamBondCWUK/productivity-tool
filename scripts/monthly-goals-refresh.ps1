$ErrorActionPreference = "Stop"

$documentsRoot = "C:\Users\liam.bond\Documents"
$productivityRoot = Join-Path $documentsRoot "Productivity Tool"
$goalsPath = Join-Path $productivityRoot "context\goals.md"
$coordinatorDir = Join-Path $productivityRoot "workspace\coordinator"
$reportPath = Join-Path $coordinatorDir "monthly-goals-refresh-report.md"

if (-not (Test-Path $goalsPath)) {
    throw "Goals file not found: $goalsPath"
}

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
$goalsContent = Get-Content -Path $goalsPath -Raw

if ($goalsContent -match "Last updated:\s*\d{4}-\d{2}-\d{2}") {
    $goalsContent = [regex]::Replace(
        $goalsContent,
        "Last updated:\s*\d{4}-\d{2}-\d{2}",
        "Last updated: " + (Get-Date -Format "yyyy-MM-dd"),
        1
    )
}

Set-Content -Path $goalsPath -Value $goalsContent -Encoding UTF8

New-Item -Path $coordinatorDir -ItemType Directory -Force | Out-Null

$report = @(
    "# Monthly Goals Refresh Report",
    "",
    "Run at: $timestamp",
    "",
    "## Actions Performed",
    "- Updated goals metadata timestamp in context/goals.md",
    "- Trigger point for Jira cascading import is ready",
    "- Bamboo HR prompt required: paste latest personal goals and feedback prompts",
    "",
    "## Manual Follow-up",
    "1. Export Jira cascading goals summary",
    "2. Paste Bamboo HR personal goals into goals.md template section",
    "3. Add blockers/decisions into context/decisions.md",
    ""
)

$report -join "`n" | Set-Content -Path $reportPath -Encoding UTF8

Write-Host "Monthly goals refresh complete: $reportPath"
