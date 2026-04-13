<#
.SYNOPSIS
    Gathers evidence from Microsoft Teams and Outlook for performance reviews.
.DESCRIPTION
    Uses Microsoft Graph API (delegated auth) to search:
    - Teams 1:1 chats with specified people
    - Teams channel messages mentioning specified people
    - Outlook emails to/from specified people
    - Teams meeting transcripts (if available)
    Outputs structured evidence files per person.
.PARAMETER People
    Array of hashtables with Name, Email, Role for each person.
.PARAMETER MonthsBack
    How many months of history to search. Default: 12.
.PARAMETER OutputDir
    Directory for evidence output files. Default: ../outputs/review-evidence/
.PARAMETER DryRun
    Show what would be searched without executing.
#>

[CmdletBinding()]
param(
    [int]$MonthsBack = 12,
    [string]$OutputDir,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

# --- Configuration ---
$People = @(
    @{ Name = "Jonathan Millar";      Email = "jonathan.millar@caseware.com";   Role = "Audit Product Manager" }
    @{ Name = "Adam Martin";          Email = "adam.martin@caseware.com";       Role = "Test Team Lead" }
    @{ Name = "Will Walker";          Email = "will.walker@caseware.com";       Role = "Software Developer II" }
    @{ Name = "Federico Marchionni";  Email = "federico.marchionni@caseware.com"; Role = "Solution Author II" }
)

if (-not $OutputDir) {
    $OutputDir = Join-Path $PSScriptRoot "..\outputs\review-evidence"
}

$Since = (Get-Date).AddMonths(-$MonthsBack).ToString("yyyy-MM-ddTHH:mm:ssZ")
$Now = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")

# --- Functions ---

function Connect-GraphIfNeeded {
    $ctx = Get-MgContext
    if (-not $ctx) {
        Write-Host "[AUTH] No active Graph session. Connecting with delegated permissions..." -ForegroundColor Yellow
        Write-Host "[AUTH] A browser window will open for Microsoft SSO login." -ForegroundColor Yellow
        Connect-MgGraph -Scopes @(
            "Chat.Read",
            "ChannelMessage.Read.All",
            "Mail.Read",
            "User.Read",
            "OnlineMeetingTranscript.Read.All",
            "Calendars.Read"
        ) -NoWelcome
        $ctx = Get-MgContext
        if (-not $ctx) {
            throw "Failed to authenticate with Microsoft Graph."
        }
    }
    Write-Host "[AUTH] Connected as: $($ctx.Account)" -ForegroundColor Green
    Write-Host "[AUTH] Scopes: $($ctx.Scopes -join ', ')" -ForegroundColor DarkGray
    return $ctx
}

function Get-TeamsChatMessages {
    param(
        [string]$PersonEmail,
        [string]$PersonName,
        [string]$SinceDate
    )

    Write-Host "  [TEAMS CHATS] Searching 1:1 and group chats with $PersonName..." -ForegroundColor Cyan

    $messages = @()

    try {
        # Get all chats
        $chats = Get-MgChat -All -ExpandProperty "members" 2>$null
        if (-not $chats) {
            Write-Host "    No chats found or insufficient permissions." -ForegroundColor DarkYellow
            return $messages
        }

        # Filter to chats that include the target person
        $relevantChats = $chats | Where-Object {
            $_.Members | Where-Object {
                $member = $_
                $memberEmail = $member.AdditionalProperties['email']
                $memberEmail -eq $PersonEmail
            }
        }

        Write-Host "    Found $($relevantChats.Count) chats involving $PersonName" -ForegroundColor DarkGray

        foreach ($chat in $relevantChats) {
            try {
                $chatMsgs = Get-MgChatMessage -ChatId $chat.Id -Top 50 -Filter "lastModifiedDateTime ge $SinceDate" 2>$null
                foreach ($msg in $chatMsgs) {
                    if ($msg.Body.Content -and $msg.Body.Content.Length -gt 5) {
                        $plainText = $msg.Body.Content -replace '<[^>]+>', '' -replace '&nbsp;', ' ' -replace '&amp;', '&' -replace '&#\d+;', ''
                        if ($plainText.Trim().Length -gt 5) {
                            $messages += @{
                                Source    = "Teams Chat ($($chat.ChatType))"
                                Date      = $msg.CreatedDateTime.ToString("yyyy-MM-dd HH:mm")
                                From      = $msg.From.User.DisplayName
                                Content   = $plainText.Trim().Substring(0, [Math]::Min(500, $plainText.Trim().Length))
                                ChatId    = $chat.Id
                            }
                        }
                    }
                }
            }
            catch {
                Write-Host "    Skipping chat $($chat.Id): $($_.Exception.Message)" -ForegroundColor DarkYellow
            }
        }
    }
    catch {
        Write-Host "    Chat search error: $($_.Exception.Message)" -ForegroundColor Red
    }

    Write-Host "    Collected $($messages.Count) chat messages" -ForegroundColor DarkGray
    return $messages
}

function Get-TeamsChannelMessages {
    param(
        [string]$PersonName,
        [string]$SinceDate
    )

    Write-Host "  [TEAMS CHANNELS] Searching channel messages mentioning $PersonName..." -ForegroundColor Cyan

    $messages = @()

    try {
        # Get teams the current user is a member of
        $teams = Get-MgUserJoinedTeam -UserId "me" 2>$null
        if (-not $teams) {
            Write-Host "    No teams found or insufficient permissions." -ForegroundColor DarkYellow
            return $messages
        }

        Write-Host "    Searching across $($teams.Count) teams..." -ForegroundColor DarkGray

        foreach ($team in $teams) {
            try {
                $channels = Get-MgTeamChannel -TeamId $team.Id 2>$null
                foreach ($channel in $channels) {
                    try {
                        $channelMsgs = Get-MgTeamChannelMessage -TeamId $team.Id -ChannelId $channel.Id -Top 50 2>$null
                        foreach ($msg in $channelMsgs) {
                            $plainText = ''
                            if ($msg.Body.Content) {
                                $plainText = $msg.Body.Content -replace '<[^>]+>', '' -replace '&nbsp;', ' ' -replace '&amp;', '&'
                            }
                            # Check if message is from or mentions the person
                            $isRelevant = ($msg.From.User.DisplayName -match [regex]::Escape($PersonName)) -or
                                          ($plainText -match [regex]::Escape($PersonName))

                            if ($isRelevant -and $plainText.Trim().Length -gt 5) {
                                $messages += @{
                                    Source  = "Teams Channel: $($team.DisplayName) > $($channel.DisplayName)"
                                    Date    = if ($msg.CreatedDateTime) { $msg.CreatedDateTime.ToString("yyyy-MM-dd HH:mm") } else { "unknown" }
                                    From    = $msg.From.User.DisplayName
                                    Content = $plainText.Trim().Substring(0, [Math]::Min(500, $plainText.Trim().Length))
                                }
                            }
                        }
                    }
                    catch {
                        # Silently skip channels we can't read
                    }
                }
            }
            catch {
                Write-Host "    Skipping team $($team.DisplayName): $($_.Exception.Message)" -ForegroundColor DarkYellow
            }
        }
    }
    catch {
        Write-Host "    Channel search error: $($_.Exception.Message)" -ForegroundColor Red
    }

    Write-Host "    Collected $($messages.Count) channel messages" -ForegroundColor DarkGray
    return $messages
}

function Get-OutlookEvidence {
    param(
        [string]$PersonEmail,
        [string]$PersonName,
        [string]$SinceDate
    )

    Write-Host "  [OUTLOOK] Searching emails with $PersonName..." -ForegroundColor Cyan

    $emails = @()

    try {
        # Search for emails from the person
        $fromFilter = "from/emailAddress/address eq '$PersonEmail' and receivedDateTime ge $SinceDate"
        $fromMsgs = Get-MgUserMessage -UserId "me" -Filter $fromFilter -Top 50 -Property "subject,from,receivedDateTime,bodyPreview" 2>$null

        foreach ($msg in $fromMsgs) {
            if ($msg.BodyPreview -and $msg.BodyPreview.Length -gt 10) {
                $emails += @{
                    Source    = "Email (from $PersonName)"
                    Date      = $msg.ReceivedDateTime.ToString("yyyy-MM-dd HH:mm")
                    Subject   = $msg.Subject
                    Content   = $msg.BodyPreview.Substring(0, [Math]::Min(500, $msg.BodyPreview.Length))
                }
            }
        }

        # Search for emails TO the person
        $toFilter = "toRecipients/any(r:r/emailAddress/address eq '$PersonEmail') and sentDateTime ge $SinceDate"
        $toMsgs = Get-MgUserMessage -UserId "me" -Filter $toFilter -Top 50 -Property "subject,toRecipients,sentDateTime,bodyPreview" 2>$null

        foreach ($msg in $toMsgs) {
            if ($msg.BodyPreview -and $msg.BodyPreview.Length -gt 10) {
                $emails += @{
                    Source    = "Email (to $PersonName)"
                    Date      = $msg.SentDateTime.ToString("yyyy-MM-dd HH:mm")
                    Subject   = $msg.Subject
                    Content   = $msg.BodyPreview.Substring(0, [Math]::Min(500, $msg.BodyPreview.Length))
                }
            }
        }

        # Search using $search for mentions in email body
        $searchMsgs = Get-MgUserMessage -UserId "me" -Search "`"$PersonName`"" -Top 30 -Property "subject,from,receivedDateTime,bodyPreview" 2>$null

        foreach ($msg in $searchMsgs) {
            $isDuplicate = $emails | Where-Object { $_.Subject -eq $msg.Subject -and $_.Date -eq $msg.ReceivedDateTime.ToString("yyyy-MM-dd HH:mm") }
            if (-not $isDuplicate -and $msg.BodyPreview -and $msg.BodyPreview.Length -gt 10) {
                $emails += @{
                    Source    = "Email (mentions $PersonName)"
                    Date      = $msg.ReceivedDateTime.ToString("yyyy-MM-dd HH:mm")
                    Subject   = $msg.Subject
                    Content   = $msg.BodyPreview.Substring(0, [Math]::Min(500, $msg.BodyPreview.Length))
                }
            }
        }
    }
    catch {
        Write-Host "    Email search error: $($_.Exception.Message)" -ForegroundColor Red
    }

    Write-Host "    Collected $($emails.Count) emails" -ForegroundColor DarkGray
    return $emails
}

function Get-MeetingTranscripts {
    param(
        [string]$PersonName,
        [string]$SinceDate
    )

    Write-Host "  [MEETINGS] Searching meeting transcripts mentioning $PersonName..." -ForegroundColor Cyan

    $transcripts = @()

    try {
        # Get calendar events (meetings) in the date range
        $events = Get-MgUserEvent -UserId "me" -Filter "start/dateTime ge '$SinceDate' and isOnlineMeeting eq true" -Top 100 -Property "subject,start,end,onlineMeeting,attendees,bodyPreview" 2>$null

        # Filter to meetings where the person was an attendee
        $relevantMeetings = $events | Where-Object {
            $_.Attendees | Where-Object {
                $_.EmailAddress.Address -match [regex]::Escape($PersonName.Split(' ')[1]) -or
                $_.EmailAddress.Name -match [regex]::Escape($PersonName)
            }
        }

        Write-Host "    Found $($relevantMeetings.Count) meetings with $PersonName" -ForegroundColor DarkGray

        foreach ($meeting in $relevantMeetings) {
            $transcripts += @{
                Source  = "Meeting"
                Date    = $meeting.Start.DateTime.Substring(0, 16)
                Subject = $meeting.Subject
                Content = "Attendees: $(($meeting.Attendees | ForEach-Object { $_.EmailAddress.Name }) -join ', ')"
            }

            # Try to get transcript if online meeting ID exists
            if ($meeting.OnlineMeeting -and $meeting.OnlineMeeting.JoinUrl) {
                try {
                    $joinUrl = $meeting.OnlineMeeting.JoinUrl
                    # Note: Transcript access requires specific permissions and may not be available
                    # for all meetings. We capture the meeting metadata regardless.
                }
                catch {}
            }
        }
    }
    catch {
        Write-Host "    Meeting search error: $($_.Exception.Message)" -ForegroundColor Red
    }

    Write-Host "    Collected $($transcripts.Count) meeting records" -ForegroundColor DarkGray
    return $transcripts
}

function Write-EvidenceFile {
    param(
        [hashtable]$Person,
        [array]$ChatMessages,
        [array]$ChannelMessages,
        [array]$Emails,
        [array]$Meetings,
        [string]$OutputPath
    )

    $sb = [System.Text.StringBuilder]::new()
    [void]$sb.AppendLine("# Evidence Dossier: $($Person.Name)")
    [void]$sb.AppendLine("**Role:** $($Person.Role)")
    [void]$sb.AppendLine("**Email:** $($Person.Email)")
    [void]$sb.AppendLine("**Generated:** $(Get-Date -Format 'yyyy-MM-dd HH:mm')")
    [void]$sb.AppendLine("**Period:** Last $MonthsBack months")
    [void]$sb.AppendLine("")
    [void]$sb.AppendLine("---")
    [void]$sb.AppendLine("")

    # Summary counts
    [void]$sb.AppendLine("## Summary")
    [void]$sb.AppendLine("| Source | Count |")
    [void]$sb.AppendLine("|--------|-------|")
    [void]$sb.AppendLine("| Teams Chats | $($ChatMessages.Count) |")
    [void]$sb.AppendLine("| Teams Channels | $($ChannelMessages.Count) |")
    [void]$sb.AppendLine("| Emails | $($Emails.Count) |")
    [void]$sb.AppendLine("| Meetings | $($Meetings.Count) |")
    [void]$sb.AppendLine("| **Total** | **$($ChatMessages.Count + $ChannelMessages.Count + $Emails.Count + $Meetings.Count)** |")
    [void]$sb.AppendLine("")

    # Teams Chat Messages
    if ($ChatMessages.Count -gt 0) {
        [void]$sb.AppendLine("## Teams Chat Messages")
        [void]$sb.AppendLine("")
        foreach ($msg in ($ChatMessages | Sort-Object { $_.Date } -Descending)) {
            [void]$sb.AppendLine("**$($msg.Date)** | $($msg.From) | _$($msg.Source)_")
            [void]$sb.AppendLine("> $($msg.Content)")
            [void]$sb.AppendLine("")
        }
    }

    # Teams Channel Messages
    if ($ChannelMessages.Count -gt 0) {
        [void]$sb.AppendLine("## Teams Channel Messages")
        [void]$sb.AppendLine("")
        foreach ($msg in ($ChannelMessages | Sort-Object { $_.Date } -Descending)) {
            [void]$sb.AppendLine("**$($msg.Date)** | $($msg.From) | _$($msg.Source)_")
            [void]$sb.AppendLine("> $($msg.Content)")
            [void]$sb.AppendLine("")
        }
    }

    # Emails
    if ($Emails.Count -gt 0) {
        [void]$sb.AppendLine("## Emails")
        [void]$sb.AppendLine("")
        foreach ($email in ($Emails | Sort-Object { $_.Date } -Descending)) {
            [void]$sb.AppendLine("**$($email.Date)** | $($email.Source) | Subject: _$($email.Subject)_")
            [void]$sb.AppendLine("> $($email.Content)")
            [void]$sb.AppendLine("")
        }
    }

    # Meetings
    if ($Meetings.Count -gt 0) {
        [void]$sb.AppendLine("## Meetings")
        [void]$sb.AppendLine("")
        foreach ($mtg in ($Meetings | Sort-Object { $_.Date } -Descending)) {
            [void]$sb.AppendLine("**$($mtg.Date)** | $($mtg.Subject)")
            [void]$sb.AppendLine("> $($mtg.Content)")
            [void]$sb.AppendLine("")
        }
    }

    $sb.ToString() | Set-Content -Path $OutputPath -Encoding UTF8
    Write-Host "  [OUTPUT] Written to: $OutputPath" -ForegroundColor Green
}

# --- Main ---

Write-Host "`n========================================" -ForegroundColor White
Write-Host "  Review Evidence Gatherer (Graph API)" -ForegroundColor White
Write-Host "========================================`n" -ForegroundColor White
Write-Host "People: $($People.Count)" -ForegroundColor DarkGray
Write-Host "Period: Last $MonthsBack months (since $($Since.Substring(0,10)))" -ForegroundColor DarkGray
Write-Host "Output: $OutputDir" -ForegroundColor DarkGray
Write-Host ""

if ($DryRun) {
    Write-Host "[DRY RUN] Would search:" -ForegroundColor Yellow
    foreach ($person in $People) {
        Write-Host "  - $($person.Name) ($($person.Email))" -ForegroundColor Yellow
        Write-Host "    Teams 1:1 chats, group chats, channel mentions" -ForegroundColor DarkYellow
        Write-Host "    Outlook emails from/to/mentioning" -ForegroundColor DarkYellow
        Write-Host "    Meeting transcripts with attendee" -ForegroundColor DarkYellow
    }
    Write-Host "`n[DRY RUN] No data fetched." -ForegroundColor Yellow
    exit 0
}

# Authenticate
$ctx = Connect-GraphIfNeeded

# Create output directory
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

# Gather evidence for each person
foreach ($person in $People) {
    Write-Host "`n--- $($person.Name) ($($person.Role)) ---" -ForegroundColor White

    $chatMsgs    = Get-TeamsChatMessages -PersonEmail $person.Email -PersonName $person.Name -SinceDate $Since
    $channelMsgs = Get-TeamsChannelMessages -PersonName $person.Name -SinceDate $Since
    $emails      = Get-OutlookEvidence -PersonEmail $person.Email -PersonName $person.Name -SinceDate $Since
    $meetings    = Get-MeetingTranscripts -PersonName $person.Name -SinceDate $Since

    $safeName = $person.Name -replace '\s+', '-'
    $outFile = Join-Path $OutputDir "evidence-$safeName-$(Get-Date -Format 'yyyy-MM-dd').md"

    Write-EvidenceFile -Person $person -ChatMessages $chatMsgs -ChannelMessages $channelMsgs -Emails $emails -Meetings $meetings -OutputPath $outFile
}

# Write combined summary
$summaryPath = Join-Path $OutputDir "evidence-summary-$(Get-Date -Format 'yyyy-MM-dd').md"
$summary = @"
# Review Evidence Summary
Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm')
Period: Last $MonthsBack months

## Files Generated
$(foreach ($person in $People) {
    $safeName = $person.Name -replace '\s+', '-'
    "- evidence-$safeName-$(Get-Date -Format 'yyyy-MM-dd').md"
})

## Data Sources
- Microsoft Teams: 1:1 chats, group chats, channel messages
- Outlook: emails sent/received/mentioning
- Calendar: meetings with attendee matching

## Auth Context
Account: $($ctx.Account)
Scopes: $($ctx.Scopes -join ', ')
"@
$summary | Set-Content -Path $summaryPath -Encoding UTF8

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  Evidence gathering complete!" -ForegroundColor Green
Write-Host "  Output: $OutputDir" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Green
