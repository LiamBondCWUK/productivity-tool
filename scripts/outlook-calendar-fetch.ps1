param(
    [string]$DashboardPath,
    [int]$DaysAhead = 7,
    [int]$MaxToday = 20,
    [int]$MaxWeekAhead = 30
)

$ErrorActionPreference = 'Stop'

$rootPath = Resolve-Path (Join-Path $PSScriptRoot '..')
if (-not $DashboardPath) {
    $DashboardPath = Join-Path $rootPath 'workspace\coordinator\dashboard-data.json'
}

function Read-DashboardData {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        return [pscustomobject]@{}
    }

    $raw = Get-Content -Path $Path -Raw
    if ([string]::IsNullOrWhiteSpace($raw)) {
        return [pscustomobject]@{}
    }

    return ($raw | ConvertFrom-Json)
}

function Write-DashboardData {
    param(
        [string]$Path,
        [object]$Data
    )

    $Data | ConvertTo-Json -Depth 30 | Set-Content -Path $Path -Encoding UTF8
}

function Test-IsFocusBlock {
    param([string]$Title)

    if (-not $Title) {
        return $false
    }

    return ($Title -match '(?i)focus|deep work|heads down|no meetings|maker time')
}

function Get-CalendarEvents {
    param([int]$RangeDays)

    $outlook = New-Object -ComObject Outlook.Application
    $namespace = $outlook.GetNamespace('MAPI')
    $calendarFolder = $namespace.GetDefaultFolder(9)

    $items = $calendarFolder.Items
    $items.IncludeRecurrences = $true
    $items.Sort('[Start]')

    $rangeStart = (Get-Date).Date
    $rangeEnd = $rangeStart.AddDays($RangeDays + 1)

    # Outlook Restrict requires local date-time strings.
    $startFilter = $rangeStart.ToString('g')
    $endFilter = $rangeEnd.ToString('g')
    $filter = "[Start] >= '$startFilter' AND [Start] < '$endFilter'"

    $restrictedItems = $items.Restrict($filter)

    $todayEvents = @()
    $weekAheadEvents = @()

    $now = Get-Date
    $todayDate = $rangeStart.Date

    foreach ($item in $restrictedItems) {
        try {
            $startTime = [datetime]$item.Start
            $endTime = [datetime]$item.End
            $title = if ($item.Subject) { [string]$item.Subject } else { '(no title)' }

            $event = @{
                id = if ($item.EntryID) { [string]$item.EntryID } else { [guid]::NewGuid().ToString() }
                title = $title
                startTime = $startTime.ToString('o')
                endTime = $endTime.ToString('o')
                isFocusBlock = (Test-IsFocusBlock -Title $title)
                isCompleted = ($endTime -lt $now)
            }

            if ($startTime.Date -eq $todayDate) {
                if ($todayEvents.Count -lt $MaxToday) {
                    $todayEvents += $event
                }
            }
            else {
                if ($weekAheadEvents.Count -lt $MaxWeekAhead) {
                    $weekAheadEvents += $event
                }
            }
        }
        catch {
            continue
        }
    }

    return @{
        today = $todayEvents
        weekAhead = $weekAheadEvents
    }
}

$dashboardData = Read-DashboardData -Path $DashboardPath
$events = Get-CalendarEvents -RangeDays $DaysAhead

if (-not $dashboardData.PSObject.Properties['calendar'] -or $null -eq $dashboardData.calendar) {
    $dashboardData | Add-Member -NotePropertyName calendar -NotePropertyValue ([pscustomobject]@{}) -Force
}

$dashboardData.calendar | Add-Member -NotePropertyName lastRefreshed -NotePropertyValue (Get-Date).ToString('o') -Force
$dashboardData.calendar | Add-Member -NotePropertyName hasToken -NotePropertyValue $true -Force
$dashboardData.calendar | Add-Member -NotePropertyName today -NotePropertyValue $events.today -Force
$dashboardData.calendar | Add-Member -NotePropertyName weekAhead -NotePropertyValue $events.weekAhead -Force

Write-DashboardData -Path $DashboardPath -Data $dashboardData

Write-Host "[outlook-calendar-fetch] wrote $($events.today.Count) today events and $($events.weekAhead.Count) week-ahead events to $DashboardPath" -ForegroundColor Green
