@echo off
REM Overnight Analysis Runner v2 — budget-guarded tiered pipeline
REM Called by Windows Task Scheduler at 02:00 Mon-Fri
REM Uses Claude CLI OAuth session (run "claude login" once interactively)
REM
REM Hard guardrails: $5.00 budget ceiling, 8k token cap per project,
REM Haiku default / Sonnet for large+complex, no subagents, sequential only
REM Cards saved to pending-kanban-cards.json (auto-pushed if vibe-kanban configured)

set SCRIPT_DIR=C:\Users\liam.bond\Documents\Productivity Tool
set LOG_FILE=%SCRIPT_DIR%\workspace\coordinator\overnight-analysis.log
set OVERNIGHT_BUDGET=5.00

REM Redirect output to log file
echo [%DATE% %TIME%] Starting overnight analysis v2 >> "%LOG_FILE%"
node "%SCRIPT_DIR%\scripts\overnight-analysis.mjs" >> "%LOG_FILE%" 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo [%DATE% %TIME%] Overnight analysis FAILED with exit code %ERRORLEVEL% >> "%LOG_FILE%"
) else (
  echo [%DATE% %TIME%] Overnight analysis complete >> "%LOG_FILE%"
)
