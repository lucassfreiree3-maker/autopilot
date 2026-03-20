param(
  [string]$TargetHome = $env:USERPROFILE,
  [switch]$InstallGemini,
  [switch]$InstallClaude
)

$ErrorActionPreference = "Stop"

$packageRoot = Split-Path -Parent $PSScriptRoot
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $PSScriptRoot "backups"

function Ensure-Dir([string]$Path) {
  New-Item -ItemType Directory -Force -Path $Path | Out-Null
}

function Backup-IfExists([string]$SourcePath, [string]$Label) {
  if (Test-Path $SourcePath) {
    $dest = Join-Path $backupRoot "$Label-$timestamp"
    Copy-Item -Recurse -Force -Path $SourcePath -Destination $dest
    Write-Host "Backed up $SourcePath to $dest"
  }
}

Ensure-Dir $backupRoot
Backup-IfExists (Join-Path $TargetHome ".codex") ".codex"
Backup-IfExists (Join-Path $TargetHome ".claude") ".claude"
Backup-IfExists (Join-Path $TargetHome ".gemini") ".gemini"

$dirs = @(
  (Join-Path $TargetHome ".codex"),
  (Join-Path $TargetHome ".claude"),
  (Join-Path $TargetHome ".claude\\profiles"),
  (Join-Path $TargetHome ".gemini"),
  (Join-Path $TargetHome ".gemini\\policies"),
  (Join-Path $TargetHome "ai-agent-stack"),
  (Join-Path $TargetHome "ai-agent-stack\\bootstrap"),
  (Join-Path $TargetHome "ai-agent-stack\\bin"),
  (Join-Path $TargetHome "ai-agent-stack\\context")
)
foreach ($dir in $dirs) { Ensure-Dir $dir }

Copy-Item -Force (Join-Path $packageRoot "codex\\config.toml") (Join-Path $TargetHome ".codex\\config.toml")
Copy-Item -Force (Join-Path $packageRoot "claude\\settings.smart.json") (Join-Path $TargetHome ".claude\\settings.json")
Copy-Item -Force (Join-Path $packageRoot "claude\\settings.smart.json") (Join-Path $TargetHome ".claude\\profiles\\settings.smart.json")
Copy-Item -Force (Join-Path $packageRoot "claude\\settings.aggressive.json") (Join-Path $TargetHome ".claude\\profiles\\settings.aggressive.json")
Copy-Item -Force (Join-Path $packageRoot "gemini\\settings.json") (Join-Path $TargetHome ".gemini\\settings.json")
Copy-Item -Force (Join-Path $packageRoot "gemini\\policies\\10-safe-dev.toml") (Join-Path $TargetHome ".gemini\\policies\\10-safe-dev.toml")
Copy-Item -Force (Join-Path $packageRoot "gemini\\policies\\90-dangerous.toml") (Join-Path $TargetHome ".gemini\\policies\\90-dangerous.toml")

Copy-Item -Force (Join-Path $PSScriptRoot "common-context.md") (Join-Path $TargetHome "ai-agent-stack\\bootstrap\\common-context.md")
Copy-Item -Force (Join-Path $PSScriptRoot "repair.ps1") (Join-Path $TargetHome "ai-agent-stack\\bootstrap\\repair.ps1")
Copy-Item -Force (Join-Path $PSScriptRoot "uninstall.ps1") (Join-Path $TargetHome "ai-agent-stack\\bootstrap\\uninstall.ps1")
Copy-Item -Force (Join-Path $PSScriptRoot "sync-context.ps1") (Join-Path $TargetHome "ai-agent-stack\\bootstrap\\sync-context.ps1")
Copy-Item -Force (Join-Path $PSScriptRoot "README.md") (Join-Path $TargetHome "ai-agent-stack\\bootstrap\\README.md")
Copy-Item -Force (Join-Path $PSScriptRoot "diff-resumo.md") (Join-Path $TargetHome "ai-agent-stack\\bootstrap\\diff-resumo.md")

Copy-Item -Force (Join-Path $packageRoot "bin\\_claude-profile.cmd") (Join-Path $TargetHome "ai-agent-stack\\bin\\_claude-profile.cmd")
Copy-Item -Force (Join-Path $packageRoot "bin\\codex-smart.cmd") (Join-Path $TargetHome "ai-agent-stack\\bin\\codex-smart.cmd")
Copy-Item -Force (Join-Path $packageRoot "bin\\codex-noprompt.cmd") (Join-Path $TargetHome "ai-agent-stack\\bin\\codex-noprompt.cmd")
Copy-Item -Force (Join-Path $packageRoot "bin\\codex-yolo.cmd") (Join-Path $TargetHome "ai-agent-stack\\bin\\codex-yolo.cmd")
Copy-Item -Force (Join-Path $packageRoot "bin\\claude-smart.cmd") (Join-Path $TargetHome "ai-agent-stack\\bin\\claude-smart.cmd")
Copy-Item -Force (Join-Path $packageRoot "bin\\claude-yolo.cmd") (Join-Path $TargetHome "ai-agent-stack\\bin\\claude-yolo.cmd")
Copy-Item -Force (Join-Path $packageRoot "bin\\gemini-smart.cmd") (Join-Path $TargetHome "ai-agent-stack\\bin\\gemini-smart.cmd")
Copy-Item -Force (Join-Path $packageRoot "bin\\gemini-yolo.cmd") (Join-Path $TargetHome "ai-agent-stack\\bin\\gemini-yolo.cmd")

& (Join-Path $TargetHome "ai-agent-stack\\bootstrap\\sync-context.ps1")

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (-not $userPath) { $userPath = "" }
$binDir = Join-Path $TargetHome "ai-agent-stack\\bin"
if (($userPath -split ";") -notcontains $binDir) {
  $newPath = ($userPath.TrimEnd(";") + ";" + $binDir).Trim(";")
  [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
  Write-Host "Added $binDir to user PATH"
}

if ($InstallGemini) {
  npm.cmd install -g @google/gemini-cli --registry=https://registry.npmjs.org/
}

if ($InstallClaude) {
  curl.exe -L https://claude.ai/install.ps1 -o "$env:TEMP\\claude-install.ps1"
  powershell -ExecutionPolicy Bypass -File "$env:TEMP\\claude-install.ps1"
}

Write-Host "Install routine completed."
