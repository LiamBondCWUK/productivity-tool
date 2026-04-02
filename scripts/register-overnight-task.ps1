# Register Overnight Analysis Task in Windows Task Scheduler
# Run this script as Administrator once to set up the 02:00 Mon-Fri schedule

$TaskName = "OvernightAnalysis"
$ScriptPath = "C:\Users\liam.bond\Documents\Productivity Tool\scripts\run-overnight-analysis.bat"

# Remove existing task if present
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# Trigger: Mon-Fri at 02:00
$Trigger = New-ScheduledTaskTrigger `
  -Weekly `
  -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday `
  -At "02:00"

# Action: run the bat wrapper
$Action = New-ScheduledTaskAction `
  -Execute "cmd.exe" `
  -Argument "/c `"$ScriptPath`""

# Settings: run even if on battery, start if missed
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
  -Description "Nightly deep-dive analysis of personal AI projects via Claude API"

Write-Host "Task '$TaskName' registered successfully." -ForegroundColor Green
Write-Host "It will run Mon-Fri at 02:00." -ForegroundColor Green
Write-Host ""
Write-Host "IMPORTANT: Make sure ANTHROPIC_API_KEY is set in:" -ForegroundColor Yellow
Write-Host "  C:\Users\liam.bond\Documents\Productivity Tool\.env" -ForegroundColor Yellow
Write-Host "  Format: ANTHROPIC_API_KEY=sk-ant-..." -ForegroundColor Yellow
