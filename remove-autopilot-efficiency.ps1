[CmdletBinding()]
param()

$launcherPath = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\BBDevOpsAutopilot_Efficiency.cmd'
if (Test-Path $launcherPath) {
  Remove-Item $launcherPath -Force
  Write-Host "Removed Startup launcher: $launcherPath"
} else {
  Write-Host "Startup launcher not found: $launcherPath"
}
