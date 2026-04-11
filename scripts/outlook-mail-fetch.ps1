param(
    [string]$DashboardPath,
    [int]$Top = 10,
    [int]$LookbackDays = 7
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

function Get-FlaggedOrImportantEmails {
    param(
        [int]$MaxItems,
        [int]$DaysBack
    )

    $cutoff = (Get-Date).AddDays(-$DaysBack)

    $outlook = New-Object -ComObject Outlook.Application
    $namespace = $outlook.GetNamespace('MAPI')
    $inbox = $namespace.GetDefaultFolder(6)

    $items = $inbox.Items
    $items.Sort('[ReceivedTime]', $true)

    $results = @()

    foreach ($item in $items) {
        if ($results.Count -ge $MaxItems) {
            break
        }

        try {
            $receivedTime = [datetime]$item.ReceivedTime
            if ($receivedTime -lt $cutoff) {
                break
            }

            $isUnread = [bool]$item.UnRead
            $isFlagged = ([int]$item.FlagStatus -eq 2)
            $isHighImportance = ([int]$item.Importance -eq 2)

            if (-not ($isUnread -or $isFlagged -or $isHighImportance)) {
                continue
            }

            $from = if ($item.SenderName) { [string]$item.SenderName } else { 'Unknown' }
            $subject = if ($item.Subject) { [string]$item.Subject } else { '(no subject)' }

            $results += @{
                id = [string]$item.EntryID
                subject = $subject
                from = $from
                webLink = ''
                receivedAt = $receivedTime.ToString('o')
            }
        }
        catch {
            continue
        }
    }

    return ,$results
}

$dashboardData = Read-DashboardData -Path $DashboardPath
$emails = Get-FlaggedOrImportantEmails -MaxItems $Top -DaysBack $LookbackDays

$dashboardData | Add-Member -NotePropertyName flaggedEmails -NotePropertyValue @($emails) -Force
$dashboardData | Add-Member -NotePropertyName flaggedEmailsFetchedAt -NotePropertyValue (Get-Date).ToString('o') -Force

Write-DashboardData -Path $DashboardPath -Data $dashboardData

Write-Host "[outlook-mail-fetch] wrote $($emails.Count) emails to $DashboardPath" -ForegroundColor Green
