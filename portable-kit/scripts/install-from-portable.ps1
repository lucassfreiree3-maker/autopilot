param(
  [string]$TargetHome = "$env:LOCALAPPDATA\BBDevOpsAutopilot"
)

$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$portableRoot = Split-Path -Parent $sourceRoot
$manifestSource = Join-Path $portableRoot 'manifest\autopilot-manifest.json'
$docsSource = Join-Path $portableRoot 'docs'
$promptsSource = Join-Path $portableRoot 'prompts'
$skillSource = Join-Path $portableRoot 'skill'
$scriptsSource = Join-Path $portableRoot 'scripts'

New-Item -ItemType Directory -Force -Path $TargetHome | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $TargetHome 'docs'),(Join-Path $TargetHome 'prompts') | Out-Null
Copy-Item $manifestSource (Join-Path $TargetHome 'autopilot-manifest.json') -Force
Copy-Item "$docsSource\*" (Join-Path $TargetHome 'docs') -Recurse -Force
Copy-Item "$promptsSource\*" (Join-Path $TargetHome 'prompts') -Recurse -Force
Copy-Item "$scriptsSource\*" $TargetHome -Recurse -Force

$skillTarget = Join-Path $env:USERPROFILE '.codex\skills\local\bbdevops-controller-autopilot'
New-Item -ItemType Directory -Force -Path $skillTarget | Out-Null
Copy-Item "$skillSource\*" $skillTarget -Recurse -Force

[System.Environment]::SetEnvironmentVariable('BB_DEVOPS_AUTOPILOT_HOME', $TargetHome, 'User')
[System.Environment]::SetEnvironmentVariable('BB_DEVOPS_AUTOPILOT_MANIFEST', (Join-Path $TargetHome 'autopilot-manifest.json'), 'User')
Write-Host 'Portable autopilot installed. Save a fresh GitHub token and run refresh-managed-repos.cmd before releasing.'
