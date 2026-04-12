#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Registers and configures scheduled tasks for Productivity Tool workflows.
#>

param(
    [switch]$DryRun,
    [switch]$Verify,
    [switch]$ListAll
)

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "This script requires administrator privileges. Rerun as admin." -ForegroundColor Yellow
    exit 1
}

$ErrorActionPreference = "Stop"
$docDir = "c:\Users\liam.bond\Documents"
$logDir = "$env:APPDATA\claude-logs"

if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

Write-Host "Productivity Tool Schedule Registration" -ForegroundColor Cyan
Write-Host "Workspace: $docDir" -ForegroundColor Gray

function Register-GmAutoTrigger {
    Write-Host "Task 1: GmAutoTrigger (shift to 07:15)" -ForegroundColor Cyan

    if (Get-ScheduledTask -TaskName "GmAutoTrigger" -ErrorAction SilentlyContinue) {
        if (-not $DryRun) {
            schtasks /change /tn "GmAutoTrigger" /st 07:15 | Out-Null
        }
        Write-Host "Set to 07:15" -ForegroundColor Green
    } else {
        Write-Host "Task not found; skipping" -ForegroundColor Yellow
    }
}

function Register-DocHealthCheck {
    Write-Host "Task 2: DocHealthCheck" -ForegroundColor Cyan

    $taskName = "DocHealthCheck"
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
        Write-Host "Already registered" -ForegroundColor Gray
        return
    }

    $scriptPath = "$docDir\Productivity Tool\scripts\doc-freshness-check.ps1"
    if (-not (Test-Path $scriptPath)) {
        Write-Host "Script not found: $scriptPath" -ForegroundColor Yellow
        return
    }

    if (-not $DryRun) {
        $taskAction = New-ScheduledTaskAction -Execute "powershell" -Argument "-ExecutionPolicy Bypass -File '$scriptPath' -WriteDashboard" -WorkingDirectory $docDir
        $taskTrigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 02:00am
        $taskSettings = New-ScheduledTaskSettingsSet -RunOnlyIfNetworkAvailable -StartWhenAvailable

        Register-ScheduledTask -TaskName $taskName `
            -Action $taskAction `
            -Trigger $taskTrigger `
            -Settings $taskSettings `
            -RunLevel Highest `
            -Force | Out-Null
    }

    Write-Host "Registered $taskName" -ForegroundColor Green
}

function Register-PropertySearchRefresh {
    Write-Host "Task 3: PropertySearchRefresh" -ForegroundColor Cyan

    $taskName = "PropertySearchRefresh"
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
        Write-Host "Already registered" -ForegroundColor Gray
        return
    }

    $workDir = "$docDir\Property Search Tool"
    if (-not (Test-Path $workDir)) {
        Write-Host "Project not found: $workDir" -ForegroundColor Yellow
        return
    }

    if (-not $DryRun) {
        $taskAction = New-ScheduledTaskAction -Execute "python" -Argument "-m src run" -WorkingDirectory $workDir
        $taskTrigger = New-ScheduledTaskTrigger -Daily -At 09:00am
        $taskSettings = New-ScheduledTaskSettingsSet -RunOnlyIfNetworkAvailable -StartWhenAvailable

        Register-ScheduledTask -TaskName $taskName `
            -Action $taskAction `
            -Trigger $taskTrigger `
            -Settings $taskSettings `
            -RunLevel Highest `
            -Force | Out-Null
    }

    Write-Host "Registered $taskName" -ForegroundColor Green
}

function Register-MonthlyGoalsRefresh {
    Write-Host "Task 4: MonthlyGoalsRefresh" -ForegroundColor Cyan

    $taskName = "MonthlyGoalsRefresh"
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
        Write-Host "Already registered" -ForegroundColor Gray
        return
    }

    if (-not $DryRun) {
        schtasks /create /tn "$taskName" /tr "powershell -ExecutionPolicy Bypass -File \"c:\Users\liam.bond\Documents\Productivity Tool\scripts\monthly-goals-refresh.ps1\"" /sc monthly /d 1 /st 02:00 /ru SYSTEM /f | Out-Null
    }

    Write-Host "Registered $taskName" -ForegroundColor Green
}

function Register-WeeklyTeamStandupPrep {
    Write-Host "Task 5: WeeklyTeamStandupPrep" -ForegroundColor Cyan

    $taskName = "WeeklyTeamStandupPrep"
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
        Write-Host "Already registered" -ForegroundColor Gray
        return
    }

    $scriptPath = "c:\Users\liam.bond\Documents\CW UKCAUD Project Tracker\scripts\prepare-standup-checklist.ps1"
    if (-not (Test-Path $scriptPath)) {
        Write-Host "Standup script not found: $scriptPath" -ForegroundColor Yellow
        return
    }

    if (-not $DryRun) {
        schtasks /create /tn "$taskName" /tr "powershell -ExecutionPolicy Bypass -File \"$scriptPath\"" /sc weekly /d MON /st 07:00 /ru SYSTEM /f | Out-Null
    }

    Write-Host "Registered $taskName" -ForegroundColor Green
}

function Register-CeremonyDashboardHealthCheck {
    Write-Host "Task 6: CeremonyDashboardHealthCheck" -ForegroundColor Cyan

    $taskName = "CeremonyDashboardHealthCheck"
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
        Write-Host "Already registered" -ForegroundColor Gray
        return
    }

    $scriptPath = "c:\Users\liam.bond\Documents\CW UKCAUD Project Tracker\scripts\health-check-ceremony.ps1"
    if (-not (Test-Path $scriptPath)) {
        Write-Host "Health script not found: $scriptPath" -ForegroundColor Yellow
        return
    }

    if (-not $DryRun) {
        schtasks /create /tn "$taskName" /tr "powershell -ExecutionPolicy Bypass -File \"$scriptPath\"" /sc daily /st 03:00 /ru SYSTEM /f | Out-Null
    }

    Write-Host "Registered $taskName" -ForegroundColor Green
}

function Setup-PM2Services {
    Write-Host "PM2 services" -ForegroundColor Cyan

    $pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
    if (-not $pm2) {
        Write-Host "PM2 not installed. Install via npm install -g pm2" -ForegroundColor Yellow
        return
    }

    if (-not $DryRun) {
        Push-Location "$docDir\Productivity Tool"
        pm2 start ecosystem.config.js --update-env 2>&1 | Out-Null
        Pop-Location
        Write-Host "PM2 ecosystem started" -ForegroundColor Green
    }
}

function List-AllTasks {
    Get-ScheduledTask -TaskPath "\*" -ErrorAction SilentlyContinue |
        Where-Object { $_.TaskName -match "(AIMorning|GmAuto|DocHealth|PropertySearch|MonthlyGoals|WeeklyTeam|CeremonyDash)" } |
        Select-Object TaskName, State, LastRunTime, NextRunTime |
        Format-Table -AutoSize
}

function Verify-Installation {
    $checks = @(
        @{ Name = "Python installed"; Check = { Get-Command python -ErrorAction SilentlyContinue } },
        @{ Name = "Node.js installed"; Check = { Get-Command node -ErrorAction SilentlyContinue } },
        @{ Name = "PM2 installed"; Check = { Get-Command pm2 -ErrorAction SilentlyContinue } },
        @{ Name = "Claude CLI available"; Check = { Get-Command claude -ErrorAction SilentlyContinue } }
    )

    foreach ($check in $checks) {
        $result = & $check.Check
        $status = if ($result) { "OK" } else { "MISSING" }
        Write-Host "$status - $($check.Name)"
    }
}

if ($ListAll) {
    List-AllTasks
    exit 0
}

if ($Verify) {
    Verify-Installation
    exit 0
}

if ($DryRun) {
    Write-Host "DRY RUN mode enabled" -ForegroundColor Yellow
}

Register-GmAutoTrigger
Register-DocHealthCheck
Register-PropertySearchRefresh
Register-MonthlyGoalsRefresh
Register-WeeklyTeamStandupPrep
Register-CeremonyDashboardHealthCheck
Setup-PM2Services

Write-Host "Schedule registration complete" -ForegroundColor Green
