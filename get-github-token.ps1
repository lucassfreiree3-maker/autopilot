# get-github-token.ps1
# Returns the GitHub OAuth token via Device Flow (browser + MFA).
# Token exists in process memory only — nothing stored locally.

param([string]$Hostname = "github.com")

$authScript = '<SAFE_ROOT>\..\bin\auth.ps1'
if (-not (Test-Path $authScript)) {
  Write-Error "Auth script not found: $authScript"
  exit 1
}

$token = & $authScript -Silent
if (-not $token) {
  Write-Error "GitHub authentication failed."
  exit 1
}

return $token.Trim()
