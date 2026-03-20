@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0autopilot-efficiency.ps1" %*
exit /b %errorlevel%
