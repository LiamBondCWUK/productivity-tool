# Register Overnight Analysis v2 Task in Windows Task Scheduler
# Run this script as Administrator once to set up the 02:00 Mon-Fri schedule
#
# Pipeline: project-discovery → health-check → LLM synthesis ($5 cap) → kanban push → dashboard write
# Budget:   $5.00 hard ceiling (set OVERNIGHT_BUDGET env to override)
# Model:    Haiku (default) / Sonnet (large+complex projects only)

$TaskName  = "OvernightAnalysis"
$ScriptPath = "C:\Users\liam.bond\Documents\Productivity Tool\scripts\run-overnight-analysis.bat"

# Remove existing task if present
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# Trigger: Mon-Fri at 02:00
$Trigger = New-ScheduledTaskTrigger `
  -Weekly `
  -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday `
  -At "02:00"

# Action: run the bat wrapper (sets OVERNIGHT_BUDGET env before calling node)
$Action = New-ScheduledTaskAction `
  -Execute "cmd.exe" `
  -Argument "/c `"$ScriptPath`""

# Settings: run even if on battery, start if missed in window, 1hr ceiling
$Settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
  -StartWhenAvailable `
  -RunOnlyIfNetworkAvailable

Register-ScheduledTask `
  -TaskName $TaskName `
  -Trigger $Trigger `
  -Action $Action `
  -Settings $Settings `
  -RunLevel Limited `
  -Description "Overnight project health pipeline v2 — tiered LLM, `$5 budget cap, kanban push"

Write-Host "Task '$TaskName' registered (Mon-Fri at 02:00)." -ForegroundColor Green
Write-Host ""
Write-Host "Hard guardrails in place:" -ForegroundColor Cyan
Write-Host "  - `$5.00 nightly budget ceiling (OVERNIGHT_BUDGET env to override)" -ForegroundColor Cyan
Write-Host "  - 8k token input cap per project" -ForegroundColor Cyan
Write-Host "  - Haiku default, Sonnet only for large+complex projects" -ForegroundColor Cyan
Write-Host "  - Only projects with findings go to LLM" -ForegroundColor Cyan
Write-Host "  - Cards saved to pending-kanban-cards.json (push when vibe-kanban configured)" -ForegroundColor Cyan
Write-Host ""
Write-Host "IMPORTANT: ensure Claude CLI OAuth is logged in:" -ForegroundColor Yellow
Write-Host "  claude login" -ForegroundColor Yellow
Write-Host ""
Write-Host "To set up vibe-kanban card push:" -ForegroundColor Yellow
Write-Host "  npm run vibe-kanban  # start + create project in UI" -ForegroundColor Yellow
Write-Host "  npm run vibe-kanban:discover  # auto-populate projectId" -ForegroundColor Yellow
