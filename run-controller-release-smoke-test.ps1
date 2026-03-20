param(
  [string]$ConfigPath,
  [string]$Label = 'autopilot-smoke-test',
  [switch]$ExecuteRelease,
  [switch]$RunPreflight,
  [switch]$InstallDependencies,
  [switch]$SkipMonitor,
  [switch]$SkipDeployUpdate,
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
  $session = New-AutopilotAuditSession -Operation 'run-controller-release-smoke-test' -ManifestPath $ConfigPath -ScriptPath $PSCommandPath -Inputs @{
    configPath = $ConfigPath
    label = $Label
    executeRelease = [bool]$ExecuteRelease
    runPreflight = [bool]$RunPreflight
    installDependencies = [bool]$InstallDependencies
    skipMonitor = [bool]$SkipMonitor
    skipDeployUpdate = [bool]$SkipDeployUpdate
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

function Invoke-Git {
  param(
    [string]$RepoPath,
    [string[]]$Arguments
  )

  return Invoke-CheckedProcess -FilePath 'git.exe' -ArgumentList (@('-C', $RepoPath) + $Arguments) -WorkingDirectory $RepoPath
}

function Save-SmokeArtifact {
  param(
    [string]$Name,
    [object]$Content,
    [ValidateSet('json','text')][string]$Format = 'json'
  )

  if ($session -and (Get-Command Save-AutopilotAuditArtifact -ErrorAction SilentlyContinue)) {
    Save-AutopilotAuditArtifact -Session $session -Name $Name -Content $Content -Format $Format | Out-Null
  }
}

function Complete-SmokeSession {
  param(
    [string]$Status,
    [string]$Message,
    [object]$Summary
  )

  if ($session -and (Get-Command Complete-AutopilotAuditSession -ErrorAction SilentlyContinue)) {
    Complete-AutopilotAuditSession -Session $session -Status $Status -Summary $Summary -Message $Message
  }
}

function Resolve-AbsolutePath {
  param(
    [string]$BasePath,
    [string]$PathValue
  )

  if ([System.IO.Path]::IsPathRooted($PathValue)) {
    return $PathValue
  }

  return [System.IO.Path]::GetFullPath((Join-Path $BasePath $PathValue))
}

function Set-ChangelogSmokeMarker {
  param(
    [string]$FilePath,
    [string]$Label
  )

  $markerStart = '<!-- autopilot-smoke-test:start -->'
  $markerEnd = '<!-- autopilot-smoke-test:end -->'
  $timestamp = (Get-Date).ToString('s')
  $payload = "autopilot-smoke-test label=$Label generatedAt=$timestamp"
  $lines = [System.Collections.Generic.List[string]](Get-Content -Path $FilePath)

  $startIndex = -1
  $endIndex = -1
  for ($i = 0; $i -lt $lines.Count; $i += 1) {
    if ($lines[$i] -eq $markerStart) {
      $startIndex = $i
    }
    if ($lines[$i] -eq $markerEnd) {
      $endIndex = $i
      break
    }
  }

  if ($startIndex -ge 0 -and $endIndex -gt $startIndex) {
    $lines.RemoveRange($startIndex, ($endIndex - $startIndex) + 1)
    $lines.Insert($startIndex, $markerEnd)
    $lines.Insert($startIndex, $payload)
    $lines.Insert($startIndex, $markerStart)
  } else {
    $insertIndex = 1
    $lines.Insert($insertIndex, $markerEnd)
    $lines.Insert($insertIndex, $payload)
    $lines.Insert($insertIndex, $markerStart)
  }

  [System.IO.File]::WriteAllText($FilePath, ([string]::Join([Environment]::NewLine, $lines) + [Environment]::NewLine))
  return [pscustomobject]@{
    label = $Label
    generatedAt = $timestamp
    filePath = $FilePath
  }
}

$configBase = Split-Path -Parent $ConfigPath
$config = Get-Content -Raw -Path $ConfigPath | ConvertFrom-Json
$controllerRepoPath = Resolve-AbsolutePath -BasePath $configBase -PathValue $config.controller.repoPath
$prepareScript = Join-Path $PSScriptRoot 'prepare-controller-main.ps1'
$refreshScript = Join-Path $PSScriptRoot 'refresh-managed-repos.ps1'
$preflightScript = Join-Path $PSScriptRoot 'preflight-controller-ci.ps1'
$releaseScript = Join-Path $PSScriptRoot 'controller-release-autopilot.ps1'
$changelogPath = Join-Path $controllerRepoPath 'CHANGELOG.md'

$summary = [ordered]@{
  configPath = $ConfigPath
  controllerRepoPath = $controllerRepoPath
  changelogPath = $changelogPath
  executeRelease = [bool]$ExecuteRelease
  runPreflight = [bool]$RunPreflight
  installDependencies = [bool]$InstallDependencies
}

try {
  $refreshResult = Invoke-CheckedProcess -FilePath 'powershell.exe' -ArgumentList @('-ExecutionPolicy','Bypass','-File',$refreshScript) -WorkingDirectory $PSScriptRoot
  Save-SmokeArtifact -Name 'refresh-managed-repos.txt' -Content $refreshResult.output -Format text
  if ($refreshResult.exitCode -ne 0) {
    throw "refresh-managed-repos failed.`n$($refreshResult.output)"
  }

  $prepareResult = Invoke-CheckedProcess -FilePath 'powershell.exe' -ArgumentList @('-ExecutionPolicy','Bypass','-File',$prepareScript,'-ConfigPath',$ConfigPath) -WorkingDirectory $PSScriptRoot
  Save-SmokeArtifact -Name 'prepare-controller-main.txt' -Content $prepareResult.output -Format text
  if ($prepareResult.exitCode -ne 0) {
    throw "prepare-controller-main failed.`n$($prepareResult.output)"
  }

  $marker = Set-ChangelogSmokeMarker -FilePath $changelogPath -Label $Label
  Save-SmokeArtifact -Name 'smoke-marker.json' -Content $marker
  Save-SmokeArtifact -Name 'changelog-after-marker.txt' -Content (Get-Content -Raw -Path $changelogPath) -Format text

  $diffResult = Invoke-Git -RepoPath $controllerRepoPath -Arguments @('diff', '--', 'CHANGELOG.md')
  Save-SmokeArtifact -Name 'smoke-diff.patch' -Content $diffResult.output -Format text
  $summary.gitDiffPresent = -not [string]::IsNullOrWhiteSpace($diffResult.output)

  if ($RunPreflight) {
    $preflightArgs = @('-ExecutionPolicy','Bypass','-File',$preflightScript,'-ConfigPath',$ConfigPath)
    if ($InstallDependencies) {
      $preflightArgs += '-InstallDependencies'
    }
    $preflightResult = Invoke-CheckedProcess -FilePath 'powershell.exe' -ArgumentList $preflightArgs -WorkingDirectory $PSScriptRoot
    Save-SmokeArtifact -Name 'preflight-controller-ci.txt' -Content $preflightResult.output -Format text
    if ($preflightResult.exitCode -ne 0) {
      throw "preflight-controller-ci failed.`n$($preflightResult.output)"
    }
  }

  if (-not $ExecuteRelease) {
    $restoreResult = Invoke-Git -RepoPath $controllerRepoPath -Arguments @('restore', '--source=HEAD', '--worktree', '--', 'CHANGELOG.md')
    if ($restoreResult.exitCode -ne 0) {
      throw "Failed to restore CHANGELOG.md after dry-run.`n$($restoreResult.output)"
    }

    Complete-SmokeSession -Status 'success' -Message 'Smoke test patch was generated and reverted successfully.' -Summary ([pscustomobject]$summary)
    if ($AsJson) {
      [pscustomobject]@{
        status = 'success'
        mode = 'dry-run'
        controllerRepoPath = $controllerRepoPath
        changelogPath = $changelogPath
        marker = $marker
      } | ConvertTo-Json -Compress
    } else {
      Write-Host 'Smoke test patch generated and reverted successfully.'
    }
    exit 0
  }

  $releaseArgs = @('-ExecutionPolicy','Bypass','-File',$releaseScript,'-ConfigPath',$ConfigPath)
  if ($SkipMonitor) { $releaseArgs += '-SkipMonitor' }
  if ($SkipDeployUpdate) { $releaseArgs += '-SkipDeployUpdate' }
  $releaseResult = Invoke-CheckedProcess -FilePath 'powershell.exe' -ArgumentList $releaseArgs -WorkingDirectory $PSScriptRoot
  Save-SmokeArtifact -Name 'controller-release-autopilot.txt' -Content $releaseResult.output -Format text
  if ($releaseResult.exitCode -ne 0) {
    throw "controller-release-autopilot failed.`n$($releaseResult.output)"
  }

  Complete-SmokeSession -Status 'success' -Message 'Smoke test release finished successfully.' -Summary ([pscustomobject]$summary)
  if ($AsJson) {
    [pscustomobject]@{
      status = 'success'
      mode = 'execute-release'
      releaseOutput = $releaseResult.output
      marker = $marker
    } | ConvertTo-Json -Compress
  } else {
    Write-Host $releaseResult.output
  }
} catch {
  Complete-SmokeSession -Status 'failed' -Message $_.Exception.Message -Summary ([pscustomobject]$summary)
  throw
}
