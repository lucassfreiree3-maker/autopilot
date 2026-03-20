@echo off
setlocal
set "CLAUDE_SETTINGS=%~1"
shift
set "CLAUDE_EXE=claude"
where %CLAUDE_EXE% >nul 2>nul
if errorlevel 1 (
  echo Claude CLI nao esta instalado ou nao esta no PATH.
  echo Rode: powershell -ExecutionPolicy Bypass -File "%USERPROFILE%\ai-agent-stack\bootstrap\repair.ps1" -InstallClaude
  exit /b 1
)
set "TARGET=%USERPROFILE%\.claude\settings.json"
set "BACKUP=%USERPROFILE%\.claude\settings.launcher.backup.json"
if exist "%TARGET%" copy /Y "%TARGET%" "%BACKUP%" >nul
copy /Y "%CLAUDE_SETTINGS%" "%TARGET%" >nul
%CLAUDE_EXE% %*
set "RC=%ERRORLEVEL%"
if exist "%BACKUP%" copy /Y "%BACKUP%" "%TARGET%" >nul
exit /b %RC%
