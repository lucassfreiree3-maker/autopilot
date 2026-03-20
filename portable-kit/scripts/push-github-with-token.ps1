param(
  [string]$RepoPath = (Get-Location).Path,
  [string]$RemoteName = "origin",
  [string]$Branch,
  [string]$TokenPath
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "token-utils.ps1")

# Token via GitHub OAuth Device Flow — no local storage, no Credential Manager
$authScript = '<SAFE_ROOT>\..\bin\auth.ps1'
$token = (& $authScript -Silent)
if (-not $token) {
  throw "GitHub authentication failed. Run $authScript to authenticate."
}

$repoPathResolved = [System.IO.Path]::GetFullPath($RepoPath)
if (-not $Branch) {
  $Branch = (& git -c "safe.directory=$repoPathResolved" -C $repoPathResolved branch --show-current).Trim()
}
if (-not $Branch) {
  throw "Could not determine the current branch."
}

$remoteUrl = (& git -c "safe.directory=$repoPathResolved" -C $repoPathResolved remote get-url $RemoteName).Trim()
if ($remoteUrl -notmatch '^https://') {
  & git -c "safe.directory=$repoPathResolved" -C $repoPathResolved push $RemoteName "HEAD:$Branch"
  exit $LASTEXITCODE
}

$uri = [System.Uri]$remoteUrl
$extraHeader = Get-GitBasicExtraHeaderValue -Token $token
$configKey = "http.$($uri.Scheme)://$($uri.Host)/.extraheader"

# Route auth header through GIT_CONFIG_* env vars so the token
# never appears in process command-line arguments (git 2.32+).
$env:GIT_CONFIG_COUNT   = 1
$env:GIT_CONFIG_KEY_0   = $configKey
$env:GIT_CONFIG_VALUE_0 = $extraHeader
try {
  & git `
    -c "safe.directory=$repoPathResolved" `
    -c "http.sslBackend=openssl" `
    -C $repoPathResolved `
    push $RemoteName "HEAD:$Branch"
} finally {
  Remove-Item env:GIT_CONFIG_COUNT, env:GIT_CONFIG_KEY_0, env:GIT_CONFIG_VALUE_0 -ErrorAction SilentlyContinue
}

exit $LASTEXITCODE
