param(
    [string]$Date,
    [switch]$SkipAi,
    [switch]$ShowClaudeUi,
    [switch]$FullWorkflow
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-Path (Join-Path $scriptRoot '..')
$coordinatorPath = Join-Path $projectRoot 'workspace\coordinator'
$dashboardPath = Join-Path $coordinatorPath 'dashboard-data.json'

if (-not $Date) {
    $Date = (Get-Date).ToString('yyyy-MM-dd')
}

function Write-Step {
    param([string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Assert-Command {
    param([string]$Name)
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $cmd) {
        throw "Required command not found: $Name"
    }
}

Write-Host "Running IBP demo build test for $Date" -ForegroundColor Green
Write-Host "Project root: $projectRoot"

Write-Step "Preflight checks"
Assert-Command -Name node
Assert-Command -Name pwsh
$claudeCmd = Get-Command claude -ErrorAction SilentlyContinue
if (-not $claudeCmd -and -not $SkipAi) {
    Write-Host "[warn] claude CLI not found in PATH. AI narrative may fallback." -ForegroundColor Yellow
}
if (-not (Test-Path $dashboardPath)) {
    throw "Missing dashboard data file: $dashboardPath"
}

if ($FullWorkflow) {
    if (-not $claudeCmd) {
        throw "Full workflow requires 'claude' in PATH."
    }

    $promptFile = Join-Path $projectRoot 'prompts\demo-ibp-workflow.md'
    if (-not (Test-Path $promptFile)) {
        throw "Missing prompt file: $promptFile"
    }

    Write-Step "Run full autonomous Claude demo workflow"
    $rawPrompt = Get-Content -Path $promptFile -Raw
    $prompt = $rawPrompt.Replace('{{DATE}}', $Date)

    Push-Location $projectRoot
    try {
        & claude -p $prompt --dangerously-skip-permissions
    }
    finally {
        Pop-Location
    }

    $demoOutputFile = Join-Path $coordinatorPath ("demo-ibp-{0}.md" -f $Date)
    if (-not (Test-Path $demoOutputFile)) {
        throw "Demo IBP output not found: $demoOutputFile"
    }

    Write-Step "Full workflow result"
    Write-Host "[ok] Demo IBP built successfully: $demoOutputFile" -ForegroundColor Green
    Write-Host "[ok] Size: $((Get-Item $demoOutputFile).Length) bytes"
    Write-Host "`nPreview:"
    Get-Content -Path $demoOutputFile -TotalCount 30
    return
}

if ($ShowClaudeUi) {
    if (-not $claudeCmd) {
        throw "Cannot launch Claude UI because 'claude' is not available in PATH."
    }

    Write-Step "Launch Claude CLI UI"
    Write-Host "Claude CLI will open interactively now. Type /exit in Claude to continue the build demo." -ForegroundColor Yellow
    & claude
    Write-Host "Returned from Claude CLI interactive session." -ForegroundColor DarkGray
}

Write-Step "Fetch Outlook calendar"
& (Join-Path $scriptRoot 'outlook-calendar-fetch.ps1') -DashboardPath $dashboardPath -DaysAhead 7

Write-Step "Fetch Outlook priority/flagged mail"
& (Join-Path $scriptRoot 'outlook-mail-fetch.ps1') -DashboardPath $dashboardPath -Top 10 -LookbackDays 7

Write-Step "Merge activity sources"
Push-Location $scriptRoot
try {
    node .\merge-activity-log.mjs --date=$Date

    Write-Step "Generate IBP markdown"
    if ($SkipAi) {
        node .\generate-ibp.mjs --date=$Date --skip-ai
    }
    else {
        node .\generate-ibp.mjs --date=$Date
    }
}
finally {
    Pop-Location
}

$outputFile = Join-Path $coordinatorPath ("ibp-{0}.md" -f $Date)
if (-not (Test-Path $outputFile)) {
    throw "IBP output not found: $outputFile"
}

$content = Get-Content -Path $outputFile -Raw
if ([string]::IsNullOrWhiteSpace($content)) {
    throw "IBP output file is empty: $outputFile"
}

Write-Step "Build test result"
Write-Host "[ok] IBP built successfully: $outputFile" -ForegroundColor Green
Write-Host "[ok] Size: $((Get-Item $outputFile).Length) bytes"
Write-Host "`nPreview:"
Get-Content -Path $outputFile -TotalCount 20
