# set-workspace-github-token.ps1
# Authentication is via GitHub OAuth Device Flow.
# No tokens are stored in files, environment variables, or Credential Manager.

Write-Host ""
Write-Host "GitHub authentication uses OAuth Device Flow."
Write-Host "No tokens are stored anywhere on disk."
Write-Host ""
Write-Host "To authenticate, run:"
Write-Host "  <SAFE_ROOT>\..\bin\auth.ps1"
Write-Host ""
Write-Host "A browser will open. Complete login + MFA. Token stays in process memory only."
