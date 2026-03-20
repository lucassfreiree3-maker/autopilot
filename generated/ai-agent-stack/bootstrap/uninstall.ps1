param(
  [string]$TargetHome = $env:USERPROFILE
)

$ErrorActionPreference = "Stop"
$backupsRoot = Join-Path $TargetHome "ai-agent-stack\\bootstrap\\backups"

if (-not (Test-Path $backupsRoot)) {
  Write-Warning "No backups found at $backupsRoot"
  exit 0
}

$latest = Get-ChildItem $backupsRoot -Directory | Sort-Object Name -Descending
foreach ($prefix in ".codex", ".claude", ".gemini") {
  $match = $latest | Where-Object { $_.Name -like "$prefix-*" } | Select-Object -First 1
  if ($null -ne $match) {
    $target = Join-Path $TargetHome $prefix
    if (Test-Path $target) {
      $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
      Rename-Item -Path $target -NewName "$prefix.after-ai-agent-stack-$stamp"
    }
    Copy-Item -Recurse -Force -Path $match.FullName -Destination $target
    Write-Host "Restored $target from $($match.Name)"
  }
}

Write-Host "Uninstall routine completed."
