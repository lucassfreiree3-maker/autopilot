# token-utils.ps1
# Utility functions for git authentication.
# DPAPI-based token storage removed (SOC compliance, 2026-03).
# Authentication is now handled by GitHub CLI: gh auth login (browser OAuth).

function Get-GitBasicExtraHeaderValue {
  param([Parameter(Mandatory = $true)][string]$Token)

  $basic = [Convert]::ToBase64String(
    [System.Text.Encoding]::ASCII.GetBytes("x-access-token:$Token")
  )
  return "AUTHORIZATION: basic $basic"
}
