# system-health-collect.ps1
# Collects Task Scheduler, PM2, Claude speed, port/ecosystem health.
# Outputs: workspace/coordinator/system-health.json

$ProdToolDir  = "C:\Users\liam.bond\Documents\Productivity Tool"
$OutputPath   = "$ProdToolDir\workspace\coordinator\system-health.json"
$HistoryPath  = "$ProdToolDir\workspace\coordinator\system-health-history.json"
$EcoFiles     = @(
    "$ProdToolDir\dashboard\ecosystem.config.js",
    "$ProdToolDir\workspace\coordinator\ecosystem.config.js",
    "$ProdToolDir\workspace\coordinator\ecosystem.config.cjs"
)

# ── Scheduled Tasks ───────────────────────────────────────────────────────────
function Get-ScheduledTasksHealth {
    $results = @()
    $tasks = Get-ScheduledTask -ErrorAction SilentlyContinue |
        Where-Object { $_.TaskName -match "Claude|Overnight|Nightly" }

    foreach ($task in $tasks) {
        $info = Get-ScheduledTaskInfo -TaskName $task.TaskName -ErrorAction SilentlyContinue
        $lastResult  = if ($info) { [long]$info.LastTaskResult } else { $null }
        $lastRunRaw  = if ($info) { $info.LastRunTime } else { $null }
        $nextRunRaw  = if ($info) { $info.NextRunTime } else { $null }

        $status = switch ($true) {
            ($null -eq $lastResult)   { "unknown" }
            ($lastResult -eq 0)       { "ok"      }
            default                   { "error"   }
        }

        if ($status -eq "ok" -and $lastRunRaw) {
            $hoursAgo = (Get-Date).Subtract($lastRunRaw).TotalHours
            if ($hoursAgo -gt 25) { $status = "overdue" }
        }

        $results += [ordered]@{
            name       = $task.TaskName
            state      = $task.State.ToString()
            lastRun    = if ($lastRunRaw)  { $lastRunRaw.ToString("o")  } else { $null }
            nextRun    = if ($nextRunRaw)  { $nextRunRaw.ToString("o")  } else { $null }
            lastResult = $lastResult
            status     = $status
        }
    }
    return , $results
}

# ── PM2 ───────────────────────────────────────────────────────────────────────
function Get-PM2Health {
    try {
        # pm2 jlist contains duplicate-cased env keys (USERNAME/username) that
        # break PowerShell's ConvertFrom-Json. Use Node to extract just the
        # fields we need — Node handles duplicate keys fine.
        $nodeScript = @"
try {
  const cp = require('child_process');
  const raw = cp.execSync('pm2 jlist', { encoding: 'utf8', timeout: 10000 });
  const procs = JSON.parse(raw);
  const out = procs.map(p => ({
    name: p.name, id: p.pm_id, status: p.pm2_env?.status,
    uptime: p.pm2_env?.pm_uptime, restarts: p.pm2_env?.restart_time ?? 0,
    memBytes: p.monit?.memory ?? 0, cpu: p.monit?.cpu ?? 0, pid: p.pid
  }));
  process.stdout.write(JSON.stringify(out));
} catch { process.stdout.write('[]'); }
"@
        $json = & node -e $nodeScript 2>$null
        if (-not $json) { return , @() }
        $procs = $json | ConvertFrom-Json
        $results = @()
        foreach ($p in $procs) {
            $results += [ordered]@{
                name     = $p.name
                id       = $p.id
                status   = $p.status
                uptime   = $p.uptime
                restarts = [int]$p.restarts
                memBytes = $p.memBytes
                cpu      = $p.cpu
                pid      = $p.pid
            }
        }
        return , $results
    } catch {
        return , @()
    }
}

# ── Claude Speed ──────────────────────────────────────────────────────────────
function Get-ClaudeSpeed {
    # Load rolling history
    $history = @()
    if (Test-Path $HistoryPath) {
        try {
            $stored = Get-Content $HistoryPath -Raw | ConvertFrom-Json
            if ($stored.claudeSpeedHistory) {
                $history = @($stored.claudeSpeedHistory | Select-Object -Last 7)
            }
        } catch {}
    }

    $latestMs = $null
    try {
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $null = & claude -p "ping" --no-tools 2>$null
        $sw.Stop()
        $latestMs = [int]$sw.ElapsedMilliseconds
    } catch {}

    $avg7d = $null
    $trend = "unknown"
    $flag  = $false

    if ($history.Count -gt 0) {
        $avg7d = [int](($history | ForEach-Object { $_.ms } | Measure-Object -Average).Average)
    }

    if ($latestMs -and $avg7d) {
        $ratio = $latestMs / $avg7d
        $trend = switch ($true) {
            ($ratio -gt 2.0) { "degraded"; $flag = $true; break }
            ($ratio -gt 1.3) { "slow";  break }
            ($ratio -lt 0.7) { "fast";  break }
            default           { "normal" }
        }
    } elseif ($latestMs) {
        $trend = "normal"
    }

    return [ordered]@{
        latestMs = $latestMs
        avg7dMs  = $avg7d
        trend    = $trend
        flag     = $flag
    }
}

# ── Port Mismatches ───────────────────────────────────────────────────────────
function Get-PortMismatches {
    $results = @()

    # command-center: ecosystem.config.js says 3000, process runs on 3002
    $configPort   = 3000
    $expectedPort = 3002
    $listening3000 = netstat -ano 2>$null | Select-String "TCP.*:${configPort}\s" | Select-Object -First 1

    if (-not $listening3000) {
        $results += [ordered]@{
            process    = "command-center"
            configPort = $configPort
            actualPort = $expectedPort
            message    = "ecosystem.config.js PORT=$configPort but server listens on $expectedPort"
            resolution = "Update $ProdToolDir\dashboard\ecosystem.config.js PORT from $configPort to $expectedPort"
        }
    }

    return , $results
}

# ── Ecosystem Conflicts ───────────────────────────────────────────────────────
function Get-EcosystemConflicts {
    $seen     = @{}
    $results  = @()

    foreach ($file in $EcoFiles) {
        if (-not (Test-Path $file)) { continue }
        $content = Get-Content $file -Raw
        $matches  = [regex]::Matches($content, 'name:\s*["\x27]([^"'']+)["\x27]')
        foreach ($m in $matches) {
            $name = $m.Groups[1].Value
            if ($seen.ContainsKey($name)) {
                $results += [ordered]@{
                    processName = $name
                    file1       = $seen[$name]
                    file2       = $file
                    message     = "Process '$name' defined in both $(Split-Path $seen[$name] -Leaf) and $(Split-Path $file -Leaf)"
                    resolution  = "Delete or consolidate $file (keep the primary config)"
                }
            } else {
                $seen[$name] = $file
            }
        }
    }

    return , $results
}

# ── Build Issues List ─────────────────────────────────────────────────────────
function Build-Issues {
    param($portMismatches, $ecosystemConflicts, $tasks, $claudeSpeed, $pm2Processes)

    $issues = @()

    foreach ($m in $portMismatches) {
        $issues += [ordered]@{ severity = "error"; category = "config";      message = $m.message;    resolution = $m.resolution }
    }
    foreach ($c in $ecosystemConflicts) {
        $issues += [ordered]@{ severity = "warn";  category = "config";      message = $c.message;    resolution = $c.resolution }
    }
    foreach ($t in $tasks) {
        if ($t.status -eq "error") {
            $issues += [ordered]@{ severity = "error"; category = "scheduler"; message = "Task '$($t.name)' last run failed (exit $($t.lastResult))"; resolution = "Check Event Viewer > Task Scheduler for details" }
        } elseif ($t.status -eq "overdue") {
            $hoursAgo = [math]::Round((Get-Date).Subtract([datetime]$t.lastRun).TotalHours, 1)
            $issues += [ordered]@{ severity = "warn";  category = "scheduler"; message = "Task '$($t.name)' overdue (last ran ${hoursAgo}h ago)"; resolution = "Run task manually or check Task Scheduler" }
        }
    }
    if ($claudeSpeed.flag) {
        $pct = [math]::Round(($claudeSpeed.latestMs / $claudeSpeed.avg7dMs - 1) * 100)
        $issues += [ordered]@{ severity = "warn"; category = "performance"; message = "Claude ${pct}% slower than 7-day avg ($($claudeSpeed.latestMs)ms vs avg $($claudeSpeed.avg7dMs)ms)"; resolution = "Check network, status.anthropic.com, or local CPU/memory pressure" }
    }
    foreach ($p in $pm2Processes) {
        if ($p.status -ne "online") {
            $issues += [ordered]@{ severity = "error"; category = "pm2"; message = "PM2 '$($p.name)' is $($p.status)"; resolution = "Run: pm2 restart $($p.name)" }
        } elseif ($p.restarts -gt 5) {
            $issues += [ordered]@{ severity = "warn"; category = "pm2"; message = "PM2 '$($p.name)' restarted $($p.restarts) times"; resolution = "Check logs: pm2 logs $($p.name)" }
        }
    }

    return , $issues
}

# ── Main ──────────────────────────────────────────────────────────────────────
Write-Host "Collecting system health..." -ForegroundColor Cyan

$tasks             = Get-ScheduledTasksHealth
$pm2Processes      = Get-PM2Health
$claudeSpeed       = Get-ClaudeSpeed
$portMismatches    = Get-PortMismatches
$ecosystemConflicts = Get-EcosystemConflicts
$issues            = Build-Issues -portMismatches $portMismatches -ecosystemConflicts $ecosystemConflicts `
                                  -tasks $tasks -claudeSpeed $claudeSpeed -pm2Processes $pm2Processes

$health = [ordered]@{
    collectedAt         = (Get-Date).ToString("o")
    scheduledTasks      = $tasks
    pm2Processes        = $pm2Processes
    claudeSpeed         = $claudeSpeed
    portMismatches      = $portMismatches
    ecosystemConflicts  = $ecosystemConflicts
    issues              = $issues
}

[System.IO.File]::WriteAllText($OutputPath, ($health | ConvertTo-Json -Depth 10))
Write-Host "Written: $OutputPath" -ForegroundColor Green

# Append to rolling speed history
if ($claudeSpeed.latestMs) {
    $histData = [ordered]@{ claudeSpeedHistory = @() }
    if (Test-Path $HistoryPath) {
        try {
            $raw = Get-Content $HistoryPath -Raw | ConvertFrom-Json
            if ($raw.claudeSpeedHistory) {
                $histData.claudeSpeedHistory = @($raw.claudeSpeedHistory | Select-Object -Last 29)
            }
        } catch {}
    }
    $histData.claudeSpeedHistory += [ordered]@{ timestamp = (Get-Date).ToString("o"); ms = $claudeSpeed.latestMs }
    [System.IO.File]::WriteAllText($HistoryPath, ($histData | ConvertTo-Json -Depth 5))
}

# Summary
$errCount  = ($issues | Where-Object { $_.severity -eq "error" }).Count
$warnCount = ($issues | Where-Object { $_.severity -eq "warn"  }).Count
Write-Host "Issues: $errCount errors, $warnCount warnings" -ForegroundColor $(if ($errCount -gt 0) { "Red" } elseif ($warnCount -gt 0) { "Yellow" } else { "Green" })
foreach ($i in $issues) {
    $icon  = if ($i.severity -eq "error") { "  [ERR]" } else { "  [WARN]" }
    $color = if ($i.severity -eq "error") { "Red" } else { "Yellow" }
    Write-Host "$icon $($i.message)" -ForegroundColor $color
}
if ($issues.Count -eq 0) { Write-Host "  [OK] All systems OK" -ForegroundColor Green }
