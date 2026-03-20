@echo off
cd /d "%~dp0"
powershell.exe -ExecutionPolicy Bypass -File gdrive-backup.ps1
