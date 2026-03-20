param(
  [string]$TargetHome = $env:USERPROFILE,
  [switch]$InstallClaude
)

$ErrorActionPreference = "Stop"
$stack = Join-Path $TargetHome "ai-agent-stack"
$bootstrap = Join-Path $stack "bootstrap"
$binDir = Join-Path $stack "bin"

& (Join-Path $bootstrap "sync-context.ps1")

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (-not $userPath) { $userPath = "" }
if (($userPath -split ";") -notcontains $binDir) {
  $newPath = ($userPath.TrimEnd(";") + ";" + $binDir).Trim(";")
  [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
  Write-Host "Added $binDir to user PATH"
}

try { codex --version | Out-Host } catch { Write-Warning "Codex validation failed: $($_.Exception.Message)" }
try { & "C:\\Users\\<USERNAME>\\AppData\\Local\\Programs\\node-v22.22.0-win-x64\\gemini.cmd" --version | Out-Host } catch { Write-Warning "Gemini validation failed: $($_.Exception.Message)" }

if ($InstallClaude) {
  try {
    curl.exe -L https://claude.ai/install.ps1 -o "$env:TEMP\\claude-install.ps1"
    powershell -ExecutionPolicy Bypass -File "$env:TEMP\\claude-install.ps1"
  } catch {
    Write-Warning "Claude install failed on this host: $($_.Exception.Message)"
  }
}

try { claude --version | Out-Host } catch { Write-Warning "Claude validation unavailable on this host." }
Write-Host "Repair routine completed."
