param(
  [string]$TargetHome = $env:USERPROFILE
)

$ErrorActionPreference = "Stop"
$stack = Join-Path $TargetHome "ai-agent-stack"
$bootstrap = Join-Path $stack "bootstrap"
$contextDir = Join-Path $stack "context"
$common = Join-Path $bootstrap "common-context.md"

if (-not (Test-Path $common)) {
  throw "Missing $common"
}

$content = Get-Content -Raw $common
$targets = @(
  @{ Path = Join-Path $TargetHome ".codex\\AGENTS.md"; Prefix = "<!-- Synced from ~/ai-agent-stack/bootstrap/common-context.md -->" },
  @{ Path = Join-Path $TargetHome ".claude\\CLAUDE.md"; Prefix = "<!-- Synced from ~/ai-agent-stack/bootstrap/common-context.md -->" },
  @{ Path = Join-Path $TargetHome ".gemini\\GEMINI.md"; Prefix = "<!-- Synced from ~/ai-agent-stack/bootstrap/common-context.md -->" },
  @{ Path = Join-Path $contextDir "AGENTS.md"; Prefix = "<!-- Shared context include -->" },
  @{ Path = Join-Path $contextDir "CLAUDE.md"; Prefix = "<!-- Shared context include -->" },
  @{ Path = Join-Path $contextDir "GEMINI.md"; Prefix = "<!-- Shared context include -->" }
)

foreach ($target in $targets) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target.Path) | Out-Null
  Set-Content -Path $target.Path -Value ($target.Prefix + "`r`n" + $content) -Encoding UTF8
}

Write-Host "Context synchronized."
