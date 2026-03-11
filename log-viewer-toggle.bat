@echo off
:: Toggle Claude Log Viewer — start if stopped, stop if running

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3333.*LISTENING"') do set PID=%%a

if defined PID (
    echo Stopping Log Viewer (PID %PID%)...
    taskkill /PID %PID% /F >nul 2>&1
    echo Log Viewer stopped.
) else (
    echo Starting Log Viewer on http://localhost:3333 ...
    start /B node "%USERPROFILE%\.claude\log-viewer.js"
    timeout /t 1 /nobreak >nul
    start http://localhost:3333
    echo Log Viewer running. Run this again to stop.
)
