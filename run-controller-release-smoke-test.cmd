@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0run-controller-release-smoke-test.ps1" %*
