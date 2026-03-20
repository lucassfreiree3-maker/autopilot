[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$startupDir = [Environment]::GetFolderPath('Startup')
$launcherPath = Join-Path $startupDir 'BBDevOpsAutopilot_Efficiency.cmd'
$scriptPath = Join-Path $PSScriptRoot 'autopilot-efficiency.ps1'

if (-not (Test-Path $startupDir)) {
  New-Item -ItemType Directory -Path $startupDir -Force | Out-Null
}

$content = @"
@echo off
powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "$scriptPath" -Mode apply -Quiet
"@

[System.IO.File]::WriteAllText($launcherPath, $content + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
if (-not (Test-Path $launcherPath)) {
  throw "Failed to create Startup launcher: $launcherPath"
}

Write-Host "Installed Startup launcher: $launcherPath"
