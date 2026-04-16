# run-morning-orchestrator.ps1
# Unified morning sequence — runs at 6:30 AM daily via Task Scheduler.
# Replaces the direct WSL call in ClaudeMorningScan.
#
# Sequence:
#   1. Git sync (silent)
#   2. System health collect → system-health.json
#   3. Read overnight results
#   4. Run morning-scan-run.sh via WSL (news + tool suggestions)
#   5. Assemble unified morning-brief.md

$ProdToolDir     = "C:\Users\liam.bond\Documents\Productivity Tool"
$ClaudeDir       = "C:\Users\liam.bond\.claude"
$LogDir          = "$ClaudeDir\improvement-log"
$LogFile         = "$LogDir\morning-$(Get-Date -Format 'yyyy-MM-dd').log"
$BriefOutput     = "$ClaudeDir\morning-brief.md"
$HealthJson      = "$ProdToolDir\workspace\coordinator\system-health.json"
$OvernightReport = "$ProdToolDir\workspace\coordinator\overnight-report.md"
$NightlyLogFile  = "$LogDir\$(Get-Date -Format 'yyyy-MM-dd').md"
$GitMorningScript = "$ClaudeDir\scripts\git-morning.ps1"
$MorningScanSh   = "/mnt/c/Users/liam.bond/.claude/scripts/morning-scan-run.sh"

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }

function Log {
    param([string]$msg, [string]$color = "White")
    $line = "$(Get-Date -Format 'HH:mm:ss') $msg"
    Add-Content -Path $LogFile -Value $line
    Write-Host $line -ForegroundColor $color
}

Log "══════════════════════════════════════════" "Cyan"
Log "  MORNING ORCHESTRATOR  $(Get-Date -Format 'ddd dd MMM yyyy')" "Cyan"
Log "══════════════════════════════════════════" "Cyan"

# ── Step 1: Git sync ──────────────────────────────────────────────────────────
Log "[1/5] Git sync..."
if (Test-Path $GitMorningScript) {
    try {
        & powershell -NonInteractive -File $GitMorningScript 2>&1 |
            ForEach-Object { Add-Content -Path $LogFile -Value "  $_" }
        Log "  Git sync complete" "Green"
    } catch {
        Log "  Git sync skipped: $_" "Yellow"
    }
} else {
    Log "  git-morning.ps1 not found — skipping" "Yellow"
}

# ── Step 2: System health collect ────────────────────────────────────────────
Log "[2/5] System health collect..."
$healthScript = "$ProdToolDir\scripts\system-health-collect.ps1"
if (Test-Path $healthScript) {
    & powershell -NonInteractive -File $healthScript 2>&1 |
        Tee-Object -FilePath $LogFile -Append | Write-Host
    Log "  Health collect complete" "Green"
} else {
    Log "  system-health-collect.ps1 not found — skipping" "Yellow"
}

# ── Step 2b: Dashboard mail/calendar refresh (Outlook fallback) ─────────────
Log "[2b/5] Refreshing dashboard mail/calendar data..."

$outlookMailScript = "$ProdToolDir\scripts\outlook-mail-fetch.ps1"
if (Test-Path $outlookMailScript) {
    try {
        $mailOutput = & powershell -NonInteractive -ExecutionPolicy Bypass -File $outlookMailScript 2>&1 | Out-String
        Add-Content -Path $LogFile -Value $mailOutput
        Log "  Outlook mail refresh complete" "Green"
    } catch {
        Log "  Outlook mail refresh failed: $_" "Yellow"
    }
} else {
    Log "  outlook-mail-fetch.ps1 not found — skipping" "Yellow"
}

$outlookCalendarScript = "$ProdToolDir\scripts\outlook-calendar-fetch.ps1"
if (Test-Path $outlookCalendarScript) {
    try {
        $calendarOutput = & powershell -NonInteractive -ExecutionPolicy Bypass -File $outlookCalendarScript 2>&1 | Out-String
        Add-Content -Path $LogFile -Value $calendarOutput
        Log "  Outlook calendar refresh complete" "Green"
    } catch {
        Log "  Outlook calendar refresh failed: $_" "Yellow"
    }
} else {
    Log "  outlook-calendar-fetch.ps1 not found — skipping" "Yellow"
}

# ── Step 2c: Ingest Power Automate OneDrive exports ─────────────────────────
Log "[2c/5] Ingesting Power Automate exports (Teams messages + document signals)..."
$ingestScript = "$ProdToolDir\scripts\ingest-pa-exports.mjs"
if (Test-Path $ingestScript) {
    try {
        $ingestOutput = node $ingestScript 2>&1 | Out-String
        Add-Content -Path $LogFile -Value $ingestOutput
        Log "  PA exports ingested" "Green"
    } catch {
        Log "  PA export ingestion failed: $_" "Yellow"
    }
} else {
    Log "  ingest-pa-exports.mjs not found — skipping" "Yellow"
}

# ── Step 3: Read overnight results ───────────────────────────────────────────
Log "[3/5] Reading overnight results..."
$overnightSummary = "(no overnight report found)"
if (Test-Path $OvernightReport) {
    $age = (Get-Date).Subtract((Get-Item $OvernightReport).LastWriteTime).TotalHours
    if ($age -lt 10) {
        $overnightSummary = (Get-Content $OvernightReport | Select-Object -First 40) -join "`n"
        Log "  Overnight report: $(Get-Item $OvernightReport).LastWriteTime" "Green"
    } else {
        Log "  Overnight report is ${age}h old — may be stale (weekend?)" "Yellow"
        $overnightSummary = "(overnight report is ${age}h old)`n" + ((Get-Content $OvernightReport | Select-Object -First 20) -join "`n")
    }
} else {
    Log "  No overnight report (expected on weekdays at 02:00)" "Yellow"
}

$nightlySummary = "(no nightly improvement log found)"
if (Test-Path $NightlyLogFile) {
    $nightlySummary = (Get-Content $NightlyLogFile | Select-Object -First 25) -join "`n"
    Log "  Nightly improvement log found" "Green"
}

# ── Step 4: Morning scan via WSL ─────────────────────────────────────────────
Log "[4/5] Running morning scan (news + tool suggestions)..."
try {
    $scanOutput = wsl -d Ubuntu -- bash $MorningScanSh 2>&1 | Out-String
    Add-Content -Path $LogFile -Value $scanOutput
    Log "  Morning scan complete" "Green"
} catch {
    Log "  Morning scan error: $_" "Red"
}

# ── Step 5: Assemble morning brief ───────────────────────────────────────────
Log "[5/5] Assembling morning brief..."

$issueLines = ""
$taskLines  = ""
$pm2Lines   = ""
$speedLine  = "Speed data unavailable"

if (Test-Path $HealthJson) {
    $h = Get-Content $HealthJson -Raw | ConvertFrom-Json

    foreach ($issue in $h.issues) {
        $icon = if ($issue.severity -eq "error") { "🔴" } else { "🟡" }
        $issueLines += "- $icon **$($issue.message)**`n  → $($issue.resolution)`n"
    }
    if (-not $issueLines) { $issueLines = "- ✅ No issues detected`n" }

    foreach ($t in $h.scheduledTasks) {
        $icon = switch ($t.status) {
            "ok"      { "✅" }
            "error"   { "🔴" }
            "overdue" { "🟡" }
            default   { "⚪" }
        }
        $lastStr = if ($t.lastRun) { [datetime]$t.lastRun | Get-Date -Format "ddd HH:mm" } else { "never" }
        $taskLines += "- $icon **$($t.name)** — last ran $lastStr`n"
    }

    foreach ($p in $h.pm2Processes) {
        $icon  = if ($p.status -eq "online") { "🟢" } else { "🔴" }
        $memMb = if ($p.memBytes) { "$([math]::Round($p.memBytes / 1MB, 0))MB" } else { "?" }
        $pm2Lines += "- $icon **$($p.name)** — $($p.status), $memMb, $($p.restarts) restarts`n"
    }

    if ($h.claudeSpeed.latestMs) {
        $ms    = $h.claudeSpeed.latestMs
        $avg   = $h.claudeSpeed.avg7dMs
        $trend = $h.claudeSpeed.trend
        $trendIcon = switch ($trend) { "degraded" { "⚠️" } "slow" { "🟡" } "fast" { "🚀" } default { "✅" } }
        $speedLine = "Latest: **${ms}ms** | 7-day avg: $(if ($avg) { "${avg}ms" } else { "n/a" }) | $trendIcon $trend"
    }
}

$date  = Get-Date -Format "dddd, MMMM d yyyy"
$time  = Get-Date -Format "HH:mm"

$brief = @"
# Morning Brief — $date ($time)

## ⚡ System Health

### Issues
$issueLines
### Scheduled Tasks
$taskLines
### PM2 Processes
$pm2Lines
### Claude Performance
$speedLine

---

## 🧠 Overnight Analysis
$overnightSummary

---

## 🔧 Nightly Self-Improvement
$nightlySummary

---

*Generated by run-morning-orchestrator.ps1 at $time — log: $LogFile*
"@

$brief | Set-Content $BriefOutput -Encoding UTF8
Log "  Brief written → $BriefOutput" "Green"

Log "══════════════════════════════════════════" "Cyan"
Log "  ORCHESTRATOR COMPLETE" "Cyan"
Log "══════════════════════════════════════════" "Cyan"
