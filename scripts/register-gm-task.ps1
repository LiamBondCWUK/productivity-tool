# Register Morning /gm Auto-Trigger Task in Windows Task Scheduler
# Run this script as Administrator once to set up the 08:45 Mon-Fri schedule

$TaskName = "GmAutoTrigger"
$ScriptPath = "C:\Users\liam.bond\Documents\Productivity Tool\scripts\gm-auto.ps1"

# Remove existing task if present
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# Trigger: Mon-Fri at 08:45
$Trigger = New-ScheduledTaskTrigger `
  -Weekly `
  -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday `
  -At "08:45"

# Action: run the PowerShell script
$Action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NonInteractive -WindowStyle Hidden -File `"$ScriptPath`""

# Settings: start if missed within 1h window
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
  -Description "Morning /gm via Claude CLI — populates dashboard priority inbox at 08:45"

Write-Host "Task '$TaskName' registered successfully." -ForegroundColor Green
Write-Host "It will run Mon-Fri at 08:45." -ForegroundColor Green
