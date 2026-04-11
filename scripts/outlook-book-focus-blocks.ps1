param(
    [Parameter(Mandatory = $true)]
    [string]$BlocksBase64
)

$ErrorActionPreference = 'Stop'

try {
    $json = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($BlocksBase64))
    $blocks = $json | ConvertFrom-Json
} catch {
    $result = @{
        bookedTimes = @()
        count = 0
        errors = @("Invalid booking payload")
    }
    $result | ConvertTo-Json -Compress
    exit 1
}

if ($null -eq $blocks) {
    $result = @{
        bookedTimes = @()
        count = 0
        errors = @()
    }
    $result | ConvertTo-Json -Compress
    exit 0
}

if (-not ($blocks -is [System.Collections.IEnumerable])) {
    $blocks = @($blocks)
}

$outlook = New-Object -ComObject Outlook.Application
$namespace = $outlook.GetNamespace('MAPI')
$calendarFolder = $namespace.GetDefaultFolder(9)

$today = (Get-Date).Date
$bookedTimes = @()
$errors = @()

foreach ($block in $blocks) {
    try {
        if ($block.time -notmatch '^\d{2}:\d{2}$') {
            continue
        }

        $parts = $block.time.Split(':')
        $hour = [int]$parts[0]
        $minute = [int]$parts[1]
        $duration = if ($block.duration) { [int]$block.duration } else { 60 }
        if ($duration -le 0) {
            $duration = 60
        }

        $start = $today.AddHours($hour).AddMinutes($minute)
        $end = $start.AddMinutes($duration)

        $subjectSource = if ($block.task) { [string]$block.task } elseif ($block.label) { [string]$block.label } else { 'Focus block' }
        $subject = "[FOCUS] $subjectSource"

        $body = if ($block.rationale) {
            "AI day-plan block`r`n`r`n$($block.rationale)"
        } else {
            "AI day-plan block"
        }

        $appointment = $outlook.CreateItem(1)
        $appointment.Subject = $subject
        $appointment.Start = $start
        $appointment.End = $end
        $appointment.BusyStatus = 2
        $appointment.ReminderSet = $false
        $appointment.Categories = 'CommandCenter-Focus'
        $appointment.Body = $body
        $appointment.Save()

        $bookedTimes += [string]$block.time
    } catch {
        $errors += "Failed to book $($block.time): $($_.Exception.Message)"
    }
}

$result = @{
    bookedTimes = $bookedTimes
    count = $bookedTimes.Count
    errors = $errors
}

$result | ConvertTo-Json -Compress
