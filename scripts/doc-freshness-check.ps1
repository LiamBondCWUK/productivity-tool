param(
    [int]$StaleDays = 21,
    [switch]$WriteDashboard
)

$ErrorActionPreference = "Stop"

$documentsRoot = "C:\Users\liam.bond\Documents"
$productivityRoot = Join-Path $documentsRoot "Productivity Tool"
$coordinatorDir = Join-Path $productivityRoot "workspace\coordinator"
$reportJsonPath = Join-Path $coordinatorDir "doc-health-report.json"
$reportMdPath = Join-Path $coordinatorDir "doc-health-report.md"
$coordinatorDashboardPath = Join-Path $coordinatorDir "dashboard-data.json"
$dashboardUiPath = Join-Path $productivityRoot "dashboard\data\dashboard-data.json"

$skipDirs = @(
    ".git",
    "node_modules",
    "_archive",
    "My Music",
    "My Pictures",
    "My Videos",
    "archived-browser-dumps"
)

function Get-Priority([int]$daysSinceUpdate) {
    if ($daysSinceUpdate -ge 60) { return "HIGH" }
    if ($daysSinceUpdate -ge 30) { return "MED" }
    return "LOW"
}

function Get-ProjectName([string]$fullPath) {
    $relative = $fullPath.Replace($documentsRoot, "").TrimStart("\\")
    if ($relative.Contains("\\")) {
        return $relative.Split("\\")[0]
    }
    return $relative
}

$cutoffDate = (Get-Date).AddDays(-$StaleDays)
$projectDirs = Get-ChildItem -Path $documentsRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { $skipDirs -notcontains $_.Name }

$targetFiles = foreach ($projectDir in $projectDirs) {
    Get-ChildItem -Path $projectDir.FullName -File -Recurse -Depth 3 -ErrorAction SilentlyContinue |
        Where-Object {
            ($_.Name -eq "README.md" -or $_.Name -eq "CHANGELOG.md" -or $_.Name -eq "CHANGELOG-PENDING.md") -and
            ($_.FullName -notmatch "\\node_modules\\") -and
            ($_.FullName -notmatch "\\\.git\\") -and
            ($_.FullName -notmatch "\\_archive\\")
        }
}

$staleDocs = @()
foreach ($file in $targetFiles) {
    if ($file.LastWriteTime -gt $cutoffDate) {
        continue
    }

    $daysSinceUpdate = [int]((Get-Date) - $file.LastWriteTime).TotalDays
    $project = Get-ProjectName -fullPath $file.FullName
    $relativePath = $file.FullName.Replace($documentsRoot + "\\", "")

    $staleDocs += [PSCustomObject]@{
        id = "doc-" + ([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($relativePath)).Replace("=", "").Replace("/", "-").Replace("+", "_"))
        project = $project
        filePath = $relativePath.Replace("\\", "/")
        reason = "No documentation update in $daysSinceUpdate days"
        daysSinceUpdate = $daysSinceUpdate
        lastModified = $file.LastWriteTime.ToString("yyyy-MM-dd")
        priority = Get-Priority -daysSinceUpdate $daysSinceUpdate
    }
}

$staleDocs = $staleDocs | Sort-Object -Property daysSinceUpdate -Descending

$report = [PSCustomObject]@{
    generatedAt = (Get-Date).ToString("o")
    staleThresholdDays = $StaleDays
    staleDocs = $staleDocs
    summary = [PSCustomObject]@{
        totalScanned = $targetFiles.Count
        staleCount = $staleDocs.Count
        highPriorityCount = ($staleDocs | Where-Object { $_.priority -eq "HIGH" }).Count
    }
}

New-Item -Path $coordinatorDir -ItemType Directory -Force | Out-Null
$report | ConvertTo-Json -Depth 8 | Set-Content -Path $reportJsonPath -Encoding UTF8

$mdLines = @(
    "# Doc Health Report",
    "",
    "Generated: $($report.generatedAt)",
    "Stale threshold: $StaleDays days",
    "Scanned files: $($targetFiles.Count)",
    "Stale files: $($staleDocs.Count)",
    ""
)

if ($staleDocs.Count -eq 0) {
    $mdLines += "No stale documentation files detected."
} else {
    $mdLines += "| Priority | Project | File | Days | Last Modified |"
    $mdLines += "|---|---|---|---:|---|"
    foreach ($item in $staleDocs) {
        $mdLines += "| $($item.priority) | $($item.project) | $($item.filePath) | $($item.daysSinceUpdate) | $($item.lastModified) |"
    }
}

$mdLines -join "`n" | Set-Content -Path $reportMdPath -Encoding UTF8

function Update-DashboardDocHealth([string]$path, [object]$docHealth) {
    if (-not (Test-Path $path)) {
        return
    }

    try {
        $data = Get-Content -Path $path -Raw | ConvertFrom-Json
        $data | Add-Member -NotePropertyName docHealth -NotePropertyValue $docHealth -Force
        if ($null -eq $data.meta) {
            $data | Add-Member -NotePropertyName meta -NotePropertyValue ([PSCustomObject]@{}) -Force
        }
        $data.meta.lastUpdated = (Get-Date).ToString("o")
        $data | ConvertTo-Json -Depth 20 | Set-Content -Path $path -Encoding UTF8
    } catch {
        Write-Warning "Failed to update docHealth in ${path}: $($_.Exception.Message)"
    }
}

if ($WriteDashboard) {
    $docHealthPayload = [PSCustomObject]@{
        lastRun = $report.generatedAt
        staleDocs = $staleDocs
    }
    Update-DashboardDocHealth -path $coordinatorDashboardPath -docHealth $docHealthPayload
    Update-DashboardDocHealth -path $dashboardUiPath -docHealth $docHealthPayload
}

Write-Host "Doc freshness check complete."
Write-Host "Scanned: $($targetFiles.Count) files"
Write-Host "Stale: $($staleDocs.Count) files"
Write-Host "Report: $reportJsonPath"
