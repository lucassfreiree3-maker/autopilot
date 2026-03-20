param(
  [string]$ConfigPath,
  [string]$Version,
  [string]$CommitMessage,
  [switch]$SkipMonitor,
  [switch]$SkipDeployUpdate,
  [switch]$RunPreflight,
  [switch]$InstallDependencies,
  [switch]$AsJson
)

$ErrorActionPreference = 'Stop'

if (-not $ConfigPath) {
  $ConfigPath = Join-Path $PSScriptRoot 'controller-release-autopilot.json'
}

$auditUtilsPath = Join-Path $PSScriptRoot 'audit-utils.ps1'
if (Test-Path $auditUtilsPath) {
  . $auditUtilsPath
}

$session = $null
if (Get-Command New-AutopilotAuditSession -ErrorAction SilentlyContinue) {
  $session = New-AutopilotAuditSession -Operation 'bootstrap-controller-release-flow' -ManifestPath $ConfigPath -ScriptPath $PSCommandPath -Inputs @{
    configPath = $ConfigPath
    version = $Version
    commitMessage = $CommitMessage
    skipMonitor = [bool]$SkipMonitor
    skipDeployUpdate = [bool]$SkipDeployUpdate
    runPreflight = [bool]$RunPreflight
    installDependencies = [bool]$InstallDependencies
  }
}

function Invoke-CheckedProcess {
  param(
    [string]$FilePath,
    [string[]]$ArgumentList,
    [string]$WorkingDirectory
  )

  $stdoutPath = [System.IO.Path]::GetTempFileName()
  $stderrPath = [System.IO.Path]::GetTempFileName()
  try {
    $process = Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -WorkingDirectory $WorkingDirectory -Wait -NoNewWindow -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
    $stdout = if (Test-Path $stdoutPath) { Get-Content -Raw -Path $stdoutPath } else { '' }
    $stderr = if (Test-Path $stderrPath) { Get-Content -Raw -Path $stderrPath } else { '' }
    return [pscustomobject]@{
      exitCode = $process.ExitCode
      output = ([string]::Concat($stdout, $stderr)).Trim()
    }
  } finally {
    Remove-Item -Path $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
  }
}

function Save-BootstrapArtifact {
  param(
    [string]$Name,
    [object]$Content,
    [ValidateSet('json','text')][string]$Format = 'json'
  )

  if ($session -and (Get-Command Save-AutopilotAuditArtifact -ErrorAction SilentlyContinue)) {
    Save-AutopilotAuditArtifact -Session $session -Name $Name -Content $Content -Format $Format | Out-Null
  }
}

function Complete-BootstrapSession {
  param(
    [string]$Status,
    [string]$Message,
    [object]$Summary
  )

  if ($session -and (Get-Command Complete-AutopilotAuditSession -ErrorAction SilentlyContinue)) {
    Complete-AutopilotAuditSession -Session $session -Status $Status -Summary $Summary -Message $Message
  }
}

$refreshScript = Join-Path $PSScriptRoot 'refresh-managed-repos.ps1'
$prepareScript = Join-Path $PSScriptRoot 'prepare-controller-main.ps1'
$preflightScript = Join-Path $PSScriptRoot 'preflight-controller-ci.ps1'
$releaseScript = Join-Path $PSScriptRoot 'controller-release-autopilot.ps1'

$summary = [ordered]@{
  configPath = $ConfigPath
  runPreflight = [bool]$RunPreflight
  installDependencies = [bool]$InstallDependencies
  releaseExitCode = $null
}

try {
  $refreshResult = Invoke-CheckedProcess -FilePath 'powershell.exe' -ArgumentList @('-ExecutionPolicy','Bypass','-File',$refreshScript) -WorkingDirectory $PSScriptRoot
  Save-BootstrapArtifact -Name 'refresh-managed-repos.txt' -Content $refreshResult.output -Format text
  if ($refreshResult.exitCode -ne 0) {
    throw "refresh-managed-repos failed.`n$($refreshResult.output)"
  }

  $prepareResult = Invoke-CheckedProcess -FilePath 'powershell.exe' -ArgumentList @('-ExecutionPolicy','Bypass','-File',$prepareScript,'-ConfigPath',$ConfigPath) -WorkingDirectory $PSScriptRoot
  Save-BootstrapArtifact -Name 'prepare-controller-main.txt' -Content $prepareResult.output -Format text
  if ($prepareResult.exitCode -ne 0) {
    throw "prepare-controller-main failed.`n$($prepareResult.output)"
  }

  if ($RunPreflight) {
    $preflightArgs = @('-ExecutionPolicy','Bypass','-File',$preflightScript,'-ConfigPath',$ConfigPath)
    if ($InstallDependencies) {
      $preflightArgs += '-InstallDependencies'
    }
    $preflightResult = Invoke-CheckedProcess -FilePath 'powershell.exe' -ArgumentList $preflightArgs -WorkingDirectory $PSScriptRoot
    Save-BootstrapArtifact -Name 'preflight-controller-ci.txt' -Content $preflightResult.output -Format text
    if ($preflightResult.exitCode -ne 0) {
      throw "preflight-controller-ci failed.`n$($preflightResult.output)"
    }
  }

  $releaseArgs = @('-ExecutionPolicy','Bypass','-File',$releaseScript,'-ConfigPath',$ConfigPath)
  if ($Version) { $releaseArgs += @('-Version', $Version) }
  if ($CommitMessage) { $releaseArgs += @('-CommitMessage', $CommitMessage) }
  if ($SkipMonitor) { $releaseArgs += '-SkipMonitor' }
  if ($SkipDeployUpdate) { $releaseArgs += '-SkipDeployUpdate' }

  $releaseResult = Invoke-CheckedProcess -FilePath 'powershell.exe' -ArgumentList $releaseArgs -WorkingDirectory $PSScriptRoot
  $summary.releaseExitCode = $releaseResult.exitCode
  Save-BootstrapArtifact -Name 'controller-release-autopilot.txt' -Content $releaseResult.output -Format text
  if ($releaseResult.exitCode -ne 0) {
    throw "controller-release-autopilot failed.`n$($releaseResult.output)"
  }

  Complete-BootstrapSession -Status 'success' -Message 'Bootstrap controller release flow finished successfully.' -Summary ([pscustomobject]$summary)
  if ($AsJson) {
    [pscustomobject]@{
      status = 'success'
      configPath = $ConfigPath
      runPreflight = [bool]$RunPreflight
      installDependencies = [bool]$InstallDependencies
      releaseExitCode = $releaseResult.exitCode
      releaseOutput = $releaseResult.output
    } | ConvertTo-Json -Compress
  } else {
    Write-Host $releaseResult.output
  }
} catch {
  Complete-BootstrapSession -Status 'failed' -Message $_.Exception.Message -Summary ([pscustomobject]$summary)
  throw
}
