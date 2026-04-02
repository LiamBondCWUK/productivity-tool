@echo off
REM Overnight Analysis Runner
REM Called by Windows Task Scheduler at 02:00 Mon-Fri
REM Loads ANTHROPIC_API_KEY from .env file in the project root

set SCRIPT_DIR=C:\Users\liam.bond\Documents\Productivity Tool
set ENV_FILE=%SCRIPT_DIR%\.env
set LOG_FILE=%SCRIPT_DIR%\workspace\coordinator\overnight-analysis.log

REM Load .env file if it exists
if exist "%ENV_FILE%" (
  for /f "tokens=1,* delims==" %%A in (%ENV_FILE%) do (
    if not "%%A"=="" if not "%%A:~0,1%"=="#" (
      set "%%A=%%B"
    )
  )
)

REM Redirect output to log file
echo [%DATE% %TIME%] Starting overnight analysis >> "%LOG_FILE%"
node "%SCRIPT_DIR%\scripts\overnight-analysis.mjs" >> "%LOG_FILE%" 2>&1
echo [%DATE% %TIME%] Overnight analysis complete >> "%LOG_FILE%"
