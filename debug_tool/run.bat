@echo off
cd /d "%~dp0"
title Realtime Prompt Debugger

echo ================================================================
echo   Realtime Prompt Debugger - Local Server
echo ================================================================
echo.
echo [1/2] Opening browser at http://127.0.0.1:8765 ...
start "" cmd /c "ping -n 2 127.0.0.1 >nul & start http://127.0.0.1:8765"

echo [2/2] Starting Python server at http://127.0.0.1:8765 ...
echo.
python server.py

if errorlevel 1 (
    echo.
    echo [ERROR] Server exited with error.
    pause
)
