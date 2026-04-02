# launch-chrome-debug.ps1
param([int]$Port = 9222)

$chromePath = @(
    "$env:PROGRAMFILES\Google\Chrome\Application\chrome.exe",
    "${env:PROGRAMFILES(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $chromePath) {
    Write-Error 'Chrome not found.'
    exit 1
}

$userDataDir = "$env:LOCALAPPDATA\Google\Chrome\User Data"

$debugCheck = try {
    (Invoke-WebRequest "http://localhost:$Port/json/version" -TimeoutSec 2 -ErrorAction Stop).StatusCode -eq 200
} catch { $false }

if ($debugCheck) {
    Write-Host ('Chrome already running with debug port ' + $Port) -ForegroundColor Green
    exit 0
}

$existing = Get-Process chrome -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host 'Closing existing Chrome processes...' -ForegroundColor Yellow
    $existing | Stop-Process -Force
    Start-Sleep -Seconds 2
}

Write-Host ('Launching Chrome with remote debugging on port ' + $Port + '...') -ForegroundColor Cyan
Start-Process $chromePath -ArgumentList @(
    "--remote-debugging-port=$Port",
    "--user-data-dir=`"$userDataDir`"",
    '--no-first-run',
    '--no-default-browser-check',
    'https://caseware.atlassian.net'
)

Write-Host 'Waiting for CDP endpoint...' -ForegroundColor Cyan
$ready = $false
for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 1
    try {
        $response = Invoke-WebRequest "http://localhost:$Port/json/version" -TimeoutSec 2 -ErrorAction Stop
        if ($response.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
}

if ($ready) {
    Write-Host ('Chrome is ready on http://localhost:' + $Port) -ForegroundColor Green
    Write-Host ''
    Write-Host 'Now run:' -ForegroundColor White
    Write-Host '  node scripts/jira-automation-full-deploy.mjs --cdp' -ForegroundColor Yellow
} else {
    Write-Host 'Chrome did not expose CDP in time.' -ForegroundColor Red
    Write-Host ('  node scripts/jira-automation-full-deploy.mjs --cdp --cdp-port ' + $Port) -ForegroundColor Yellow
}
