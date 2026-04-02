# setup-graph-token.ps1
# One-time OAuth2 device code flow for Microsoft Graph API access.
# Writes workspace/config/graph-token.json with access + refresh tokens.
#
# Required scopes: Calendars.ReadWrite, User.Read
#
# Usage: powershell -File scripts/setup-graph-token.ps1

$ErrorActionPreference = "Stop"

$configDir = "$PSScriptRoot\..\workspace\config"
$tokenFile = "$configDir\graph-token.json"

# ---------------------------------------------------------------------------
# Config — edit CLIENT_ID if you register a new Azure app
# ---------------------------------------------------------------------------
# To use your own app registration:
#   1. Go to portal.azure.com > Azure Active Directory > App registrations > New
#   2. Set Redirect URI: https://login.microsoftonline.com/common/oauth2/nativeclient
#   3. Add API permissions: Microsoft Graph > Delegated: Calendars.ReadWrite, User.Read
#   4. Copy the Application (client) ID and paste below
$clientId     = "d3590ed6-52b3-4102-aeff-aad2292ab01c"  # Microsoft Office mobile client (public)
$tenantId     = "common"
$scope        = "https://graph.microsoft.com/Calendars.ReadWrite https://graph.microsoft.com/User.Read offline_access"
$deviceCodeUrl = "https://login.microsoftonline.com/$tenantId/oauth2/v2.0/devicecode"
$tokenUrl      = "https://login.microsoftonline.com/$tenantId/oauth2/v2.0/token"

# ---------------------------------------------------------------------------
# Step 1: Request device code
# ---------------------------------------------------------------------------
Write-Host "`nRequesting device code from Microsoft..." -ForegroundColor Cyan

$deviceCodeResponse = Invoke-RestMethod -Method Post -Uri $deviceCodeUrl -Body @{
    client_id = $clientId
    scope     = $scope
}

Write-Host "`n========================================" -ForegroundColor Yellow
Write-Host "  Go to: $($deviceCodeResponse.verification_uri)" -ForegroundColor Green
Write-Host "  Enter: $($deviceCodeResponse.user_code)" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Yellow
Write-Host "Waiting for you to sign in..." -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# Step 2: Poll for token
# ---------------------------------------------------------------------------
$interval  = $deviceCodeResponse.interval
$expiresIn = $deviceCodeResponse.expires_in
$waited    = 0
$token     = $null

while ($waited -lt $expiresIn) {
    Start-Sleep -Seconds $interval
    $waited += $interval

    try {
        $tokenResponse = Invoke-RestMethod -Method Post -Uri $tokenUrl -Body @{
            client_id   = $clientId
            grant_type  = "urn:ietf:params:oauth:grant-type:device_code"
            device_code = $deviceCodeResponse.device_code
        }

        if ($tokenResponse.access_token) {
            $token = $tokenResponse
            break
        }
    } catch {
        $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
        if ($errorBody.error -eq "authorization_pending") {
            # Still waiting — continue polling
            continue
        } elseif ($errorBody.error -eq "authorization_declined") {
            Write-Host "Authorization declined." -ForegroundColor Red
            exit 1
        } elseif ($errorBody.error -eq "expired_token") {
            Write-Host "Device code expired. Please re-run this script." -ForegroundColor Red
            exit 1
        } else {
            Write-Host "Unexpected error: $($_.Exception.Message)" -ForegroundColor Red
            exit 1
        }
    }
}

if (-not $token) {
    Write-Host "Timed out waiting for sign-in. Please re-run this script." -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------------------
# Step 3: Verify token — fetch user info
# ---------------------------------------------------------------------------
try {
    $userInfo = Invoke-RestMethod -Uri "https://graph.microsoft.com/v1.0/me" -Headers @{
        Authorization = "Bearer $($token.access_token)"
    }
    Write-Host "Signed in as: $($userInfo.displayName) ($($userInfo.mail))" -ForegroundColor Green
} catch {
    Write-Host "Warning: Could not verify identity, but token was received." -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# Step 4: Write token file
# ---------------------------------------------------------------------------
$expiry = (Get-Date).AddSeconds($token.expires_in).ToString("o")

$tokenData = @{
    access_token  = $token.access_token
    refresh_token = $token.refresh_token
    expires_at    = $expiry
    scope         = $token.scope
    user          = $userInfo.mail
}

if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir | Out-Null
}

$tokenData | ConvertTo-Json | Set-Content -Path $tokenFile -Encoding UTF8

Write-Host "`nToken saved to: $tokenFile" -ForegroundColor Green
Write-Host "You can now use /focus to create calendar focus blocks." -ForegroundColor Cyan
