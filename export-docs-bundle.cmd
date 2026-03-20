@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0export-docs-bundle.ps1" %*
