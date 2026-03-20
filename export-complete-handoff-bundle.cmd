@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0export-complete-handoff-bundle.ps1" %*
