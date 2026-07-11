@echo off
setlocal
cd /d "%~dp0"

if exist "app-home.html" (
    start "" "%~dp0app-home.html"
) else (
    echo app-home.html not found
    pause
)
