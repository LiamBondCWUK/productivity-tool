# Morning Auto-Trigger
# Called by Windows Task Scheduler at 08:45 Mon-Fri
# Runs /gm via Claude CLI, which populates dashboard-data.json and opens localhost:3000

$LogFile = "C:\Users\liam.bond\Documents\Productivity Tool\workspace\coordinator\gm-auto.log"
$ProjectDir = "C:\Users\liam.bond\Documents\Productivity Tool"

Add-Content -Path $LogFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Starting /gm auto-trigger"

# Step 1: Fetch Jira @mention + doc comment notifications
try {
    $notifResult = & node "$ProjectDir\scripts\fetch-notifications.mjs" 2>&1
    Add-Content -Path $LogFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] fetch-notifications: $notifResult"
} catch {
    Add-Content -Path $LogFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] fetch-notifications ERROR: $($_.Exception.Message)"
}

# Step 2: Generate AI day plan
try {
    $planResult = & node "$ProjectDir\scripts\generate-day-plan.mjs" 2>&1
    Add-Content -Path $LogFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] generate-day-plan: $planResult"
} catch {
    Add-Content -Path $LogFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] generate-day-plan ERROR: $($_.Exception.Message)"
}

# Step 3: Run /gm via Claude CLI
try {
    $result = & claude "/gm" 2>&1
    Add-Content -Path $LogFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] /gm completed"
    Add-Content -Path $LogFile -Value $result
} catch {
    Add-Content -Path $LogFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] /gm ERROR: $($_.Exception.Message)"
}
