@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0set-workspace-github-token.ps1" %*
