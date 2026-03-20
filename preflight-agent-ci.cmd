@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0preflight-controller-ci.ps1" -ConfigPath "%~dp0agent-release-autopilot.json" %*
