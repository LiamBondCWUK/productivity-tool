@echo off
REM Overnight Analysis Runner
REM Called by Windows Task Scheduler at 02:00 Mon-Fri
REM Uses Claude CLI OAuth session (run "claude login" once interactively)

set SCRIPT_DIR=C:\Users\liam.bond\Documents\Productivity Tool
set LOG_FILE=%SCRIPT_DIR%\workspace\coordinator\overnight-analysis.log

REM Redirect output to log file
echo [%DATE% %TIME%] Starting overnight analysis >> "%LOG_FILE%"
node "%SCRIPT_DIR%\scripts\overnight-analysis.mjs" >> "%LOG_FILE%" 2>&1
echo [%DATE% %TIME%] Overnight analysis complete >> "%LOG_FILE%"
