param(
    [string]$ClientId = $env:GRAPH_CLIENT_ID
)

$ErrorActionPreference = 'Stop'

$COORDINATOR_PATH = Join-Path $PSScriptRoot '..' 'workspace' 'coordinator'
$TOKEN_FILE = Join-Path $COORDINATOR_PATH 'graph-token.json'
$TENANT = 'common'
$SCOPES = 'Calendars.ReadWrite offline_access User.Read'

function Write-Step { param([string]$msg) Write-Host "`n[*] $msg" -ForegroundColor Cyan }
function Write-OK   { param([string]$msg) Write-Host '[+] ' -ForegroundColor Green -NoNewline; Write-Host $msg }
function Write-Warn { param([string]$msg) Write-Host '[!] ' -ForegroundColor Yellow -NoNewline; Write-Host $msg }

# Ensure coordinator dir exists
if (-not (Test-Path $COORDINATOR_PATH)) {
    New-Item -ItemType Directory -Path $COORDINATOR_PATH | Out-Null
}

# Client ID
if (-not $ClientId) {
    Write-Host "`nNo Client ID supplied. Register an app in Azure first:" -ForegroundColor Yellow
    Write-Host '  1. https://portal.azure.com -> App registrations -> New registration'
    Write-Host '  2. Name: Productivity Tool  |  Accounts: any org + personal'
    Write-Host '  3. Redirect URI: Public client/native'
    Write-Host '     https://login.microsoftonline.com/common/oauth2/nativeclient'
    Write-Host '  4. Authentication -> Enable Allow public client flows'
    Write-Host ''
    $ClientId = Read-Host 'Paste your Application (client) ID'
}

if ($ClientId -notmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') {
    Write-Error 'Invalid client ID format (expected GUID).'
    exit 1
}

# Check existing token
if (Test-Path $TOKEN_FILE) {
    try {
        $existing = Get-Content $TOKEN_FILE -Raw | ConvertFrom-Json
        $expiresAt = [DateTimeOffset]::FromUnixTimeSeconds($existing.expires_at)
        if ($expiresAt -gt [DateTimeOffset]::UtcNow.AddMinutes(5)) {
            Write-OK "Valid token already exists (expires $($expiresAt.LocalDateTime.ToString('HH:mm dd/MM/yy')))"
            Write-OK "Authenticated as: $($existing.user_email)"
            $skip = Read-Host "`nRe-authenticate anyway? [y/N]"
            if ($skip -ne 'y' -and $skip -ne 'Y') {
                Write-Host 'Setup complete. Token is valid.' -ForegroundColor Green
                exit 0
            }
        }
    } catch { }
}

# Device code request
Write-Step 'Requesting device code from Microsoft...'

$deviceCodeBody = @{
    client_id = $ClientId
    scope     = $SCOPES
}

try {
    $dcResponse = Invoke-RestMethod `
        -Method Post `
        -Uri "https://login.microsoftonline.com/$TENANT/oauth2/v2.0/devicecode" `
        -Body $deviceCodeBody `
        -ContentType 'application/x-www-form-urlencoded'
} catch {
    Write-Error "Device code request failed: $($_.Exception.Message)"
    exit 1
}

# Prompt user
Write-Host ''
Write-Host ('=' * 60) -ForegroundColor White
Write-Host '  Open this URL in your browser:' -ForegroundColor Yellow
Write-Host "  $($dcResponse.verification_uri)" -ForegroundColor Cyan
Write-Host ''
Write-Host '  Enter this code:' -ForegroundColor Yellow
Write-Host "  $($dcResponse.user_code)" -ForegroundColor Green
Write-Host ('=' * 60) -ForegroundColor White
Write-Host ''

try { Start-Process $dcResponse.verification_uri } catch { }

# Poll for token
Write-Step 'Waiting for you to sign in...'

$pollBody = @{
    grant_type  = 'urn:ietf:params:oauth:grant-type:device_code'
    client_id   = $ClientId
    device_code = $dcResponse.device_code
}

$interval    = if ($dcResponse.interval)   { [int]$dcResponse.interval }   else { 5 }
$expiresIn   = if ($dcResponse.expires_in) { [int]$dcResponse.expires_in } else { 900 }
$deadline    = (Get-Date).AddSeconds($expiresIn)
$tokenResult = $null

while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds $interval
    Write-Host '.' -NoNewline

    try {
        $tokenResult = Invoke-RestMethod `
            -Method Post `
            -Uri "https://login.microsoftonline.com/$TENANT/oauth2/v2.0/token" `
            -Body $pollBody `
            -ContentType 'application/x-www-form-urlencoded' `
            -ErrorAction Stop
        Write-Host ''
        break
    } catch {
        $errBody = $null
        try { $errBody = $_.ErrorDetails.Message | ConvertFrom-Json } catch { }
        $errCode = if ($errBody) { $errBody.error } else { '' }

        if     ($errCode -eq 'authorization_pending') { continue }
        elseif ($errCode -eq 'slow_down')             { $interval += 5; continue }
        elseif ($errCode -eq 'expired_token') {
            Write-Host ''
            Write-Error 'Code expired. Please run the script again.'
            exit 1
        } else {
            Write-Host ''
            Write-Error "Token poll failed: $($_.Exception.Message)"
            exit 1
        }
    }
}

if (-not $tokenResult) {
    Write-Error 'Authentication timed out. Please run the script again.'
    exit 1
}

# Verify with Graph
Write-Step 'Verifying token with Microsoft Graph...'

try {
    $me = Invoke-RestMethod `
        -Method Get `
        -Uri 'https://graph.microsoft.com/v1.0/me' `
        -Headers @{ Authorization = "Bearer $($tokenResult.access_token)" }
} catch {
    Write-Error "Graph verification failed: $($_.Exception.Message)"
    exit 1
}

# Save token
Write-Step 'Saving token...'

$expiresAt = [DateTimeOffset]::UtcNow.AddSeconds([int]$tokenResult.expires_in).ToUnixTimeSeconds()

$tokenData = [ordered]@{
    access_token  = $tokenResult.access_token
    refresh_token = $tokenResult.refresh_token
    expires_at    = $expiresAt
    token_type    = $tokenResult.token_type
    scope         = $tokenResult.scope
    client_id     = $ClientId
    tenant_id     = $TENANT
    user_name     = $me.displayName
    user_email    = if ($me.mail) { $me.mail } else { $me.userPrincipalName }
    saved_at      = (Get-Date -Format 'o')
}

$tokenData | ConvertTo-Json | Set-Content $TOKEN_FILE -Encoding UTF8

Write-OK "Token saved to: $TOKEN_FILE"
Write-OK "Authenticated as: $($tokenData.user_email)"
Write-OK "Expires: $([DateTimeOffset]::FromUnixTimeSeconds($expiresAt).LocalDateTime.ToString('HH:mm dd/MM/yy'))"
Write-Host "`nSetup complete. The dashboard calendar panel and /focus command are ready to use." -ForegroundColor Green