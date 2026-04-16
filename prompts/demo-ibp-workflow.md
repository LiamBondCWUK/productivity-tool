You are running an end-to-end IBP demo for date {{DATE}} from the project root.

Goal:
1) Show a visible, step-by-step workflow.
2) Generate a Quinn-format IBP demo file only.
3) Fill the PowerApps Weekly IBP form fields automatically.
4) Never click Submit. Human reviewer clicks Submit manually.

Rules:
- Narrate each phase briefly before and after each command.
- If a command fails, explain the failure and try one safe retry.
- Do not overwrite the real IBP file.
- Write output to workspace/coordinator/demo-ibp-{{DATE}}.md.

Phase 1: Discovery
- Explain available data sources: Outlook calendar, Outlook mail, merged activity log, Jira snapshot, dashboard IBP tab.

Phase 2: Data Collection
Run these commands in order:
1. pwsh -NoProfile -File "scripts/outlook-calendar-fetch.ps1" -DashboardPath "workspace/coordinator/dashboard-data.json" -DaysAhead 7
2. pwsh -NoProfile -File "scripts/outlook-mail-fetch.ps1" -DashboardPath "workspace/coordinator/dashboard-data.json" -Top 10 -LookbackDays 7
3. node "scripts/merge-activity-log.mjs" --date={{DATE}}

Phase 3: Generate Quinn IBP Demo Output
4. node "scripts/generate-ibp.mjs" --date={{DATE}} --skip-ai --output=workspace/coordinator/demo-ibp-{{DATE}}.md

Phase 4: Confirm Dashboard Visibility
5. Explain that the dashboard IBP tab can be opened at http://localhost:3002?tab=ibp and will show the Quinn sections.

Phase 5: Fill PowerApps Form (No Submit)
6. node "scripts/playwright-ibp-submit.mjs" --date={{DATE}} --demo
- Explicitly state: Submit is never auto-clicked.
- Wait for manual reviewer to check and submit.

Phase 6: Final Confirmation
- Confirm file exists: workspace/coordinator/demo-ibp-{{DATE}}.md
- Print a short completion summary with the four Quinn headings.
