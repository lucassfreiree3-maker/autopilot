$script:AutopilotAuditUtilsVersion = '2026-03-14-audit-1'

function Ensure-AutopilotDirectory {
  param([Parameter(Mandatory = $true)][string]$Path)
  New-Item -ItemType Directory -Force -Path $Path | Out-Null
}

function ConvertTo-AutopilotAuditSafeName {
  param([Parameter(Mandatory = $true)][string]$Value)

  $safe = $Value -replace '[^A-Za-z0-9._-]+', '-'
  $safe = $safe.Trim('-')
  if (-not $safe) {
    return 'item'
  }
  return $safe.ToLowerInvariant()
}

function Get-AutopilotAuditRoot {
  param([string]$ManifestPath)

  if ($env:BBDEVOPS_AUDIT_ROOT) {
    return $env:BBDEVOPS_AUDIT_ROOT
  }

  if ($ManifestPath -and (Test-Path $ManifestPath)) {
    try {
      $manifest = Get-Content -Raw $ManifestPath | ConvertFrom-Json
      if ($manifest.paths -and $manifest.paths.audit) {
        return [string]$manifest.paths.audit
      }
      if ($manifest.paths -and $manifest.paths.auditDir) {
        return [string]$manifest.paths.auditDir
      }
      if ($manifest.paths -and $manifest.paths.home) {
        return (Join-Path $manifest.paths.home 'reports\audit')
      }
    } catch {
    }
  }

  return (Join-Path $PSScriptRoot 'reports\audit')
}

function Initialize-AutopilotAuditRun {
  param([string]$AuditRoot,[string]$ManifestPath)

  Ensure-AutopilotDirectory -Path $AuditRoot

  if (-not $env:BBDEVOPS_AUDIT_TRACE_ID) {
    $env:BBDEVOPS_AUDIT_TRACE_ID = 'trace-' + (Get-Date -Format 'yyyyMMddHHmmss') + '-' + ([guid]::NewGuid().ToString('N').Substring(0, 8))
  }

  if (-not $env:BBDEVOPS_AUDIT_RUN_DIR) {
    $runName = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + $env:BBDEVOPS_AUDIT_TRACE_ID
    $env:BBDEVOPS_AUDIT_RUN_DIR = Join-Path $AuditRoot $runName
  }

  Ensure-AutopilotDirectory -Path $env:BBDEVOPS_AUDIT_RUN_DIR

  $runFile = Join-Path $env:BBDEVOPS_AUDIT_RUN_DIR 'run.json'
  if (-not (Test-Path $runFile)) {
    $runRecord = [ordered]@{
      traceId = $env:BBDEVOPS_AUDIT_TRACE_ID
      startedAt = (Get-Date).ToString('o')
      host = $env:COMPUTERNAME
      user = $env:USERNAME
      auditRoot = $AuditRoot
      runDir = $env:BBDEVOPS_AUDIT_RUN_DIR
      manifestPath = $ManifestPath
      auditUtilsVersion = $script:AutopilotAuditUtilsVersion
    }
    $runRecord | ConvertTo-Json -Depth 20 | Set-Content -Path $runFile -Encoding UTF8
  }

  return $env:BBDEVOPS_AUDIT_RUN_DIR
}

function New-AutopilotAuditSession {
  param(
    [Parameter(Mandatory = $true)][string]$Operation,
    [string]$ManifestPath,
    [string]$ScriptPath,
    [object]$Inputs,
    [string[]]$Tags
  )

  $auditRoot = Get-AutopilotAuditRoot -ManifestPath $ManifestPath
  $runDir = Initialize-AutopilotAuditRun -AuditRoot $auditRoot -ManifestPath $ManifestPath
  $sessionId = 'session-' + ([guid]::NewGuid().ToString('N').Substring(0, 10))
  $sessionName = (Get-Date -Format 'yyyyMMdd-HHmmssfff') + '-' + (ConvertTo-AutopilotAuditSafeName -Value $Operation)
  $sessionDir = Join-Path $runDir $sessionName
  $artifactsDir = Join-Path $sessionDir 'artifacts'
  $normalizedTags = @()
  if ($Tags) {
    $normalizedTags = @($Tags | Where-Object { $_ })
  }

  Ensure-AutopilotDirectory -Path $sessionDir
  Ensure-AutopilotDirectory -Path $artifactsDir

  $session = [pscustomobject]@{
    traceId = $env:BBDEVOPS_AUDIT_TRACE_ID
    auditRoot = $auditRoot
    runDir = $runDir
    sessionId = $sessionId
    operation = $Operation
    scriptPath = $ScriptPath
    manifestPath = $ManifestPath
    startedAt = (Get-Date).ToString('o')
    host = $env:COMPUTERNAME
    user = $env:USERNAME
    pid = $PID
    cwd = (Get-Location).Path
    artifactsDir = $artifactsDir
    sessionFile = (Join-Path $sessionDir 'session.json')
    eventsFile = (Join-Path $sessionDir 'events.jsonl')
    tags = $normalizedTags
    inputs = $Inputs
  }

  $record = [ordered]@{
    traceId = $session.traceId
    sessionId = $session.sessionId
    operation = $session.operation
    status = 'running'
    startedAt = $session.startedAt
    scriptPath = $session.scriptPath
    manifestPath = $session.manifestPath
    host = $session.host
    user = $session.user
    pid = $session.pid
    cwd = $session.cwd
    artifactsDir = $session.artifactsDir
    tags = @($session.tags)
    inputs = $session.inputs
    auditUtilsVersion = $script:AutopilotAuditUtilsVersion
  }
  $record | ConvertTo-Json -Depth 30 | Set-Content -Path $session.sessionFile -Encoding UTF8

  Write-AutopilotAuditEvent -Session $session -Event 'session_started' -Message 'Audit session started.' -Data $Inputs | Out-Null
  return $session
}

function Write-AutopilotAuditEvent {
  param(
    [object]$Session,
    [Parameter(Mandatory = $true)][string]$Event,
    [string]$Level = 'info',
    [string]$Message = '',
    [object]$Data
  )

  if (-not $Session) {
    return $null
  }

  $eventRecord = [ordered]@{
    timestamp = (Get-Date).ToString('o')
    event = $Event
    level = $Level
    message = $Message
    data = $Data
  }
  ($eventRecord | ConvertTo-Json -Depth 30 -Compress) | Add-Content -Path $Session.eventsFile -Encoding UTF8
  return [pscustomobject]$eventRecord
}

function Save-AutopilotAuditArtifact {
  param(
    [object]$Session,
    [Parameter(Mandatory = $true)][string]$Name,
    [object]$Content,
    [ValidateSet('json','text')][string]$Format = 'json',
    [string]$SourcePath
  )

  if (-not $Session) {
    return $null
  }

  $safeName = ConvertTo-AutopilotAuditSafeName -Value ([System.IO.Path]::GetFileNameWithoutExtension($Name))
  $extension = [System.IO.Path]::GetExtension($Name)
  if (-not $extension) {
    if ($SourcePath) {
      $extension = [System.IO.Path]::GetExtension($SourcePath)
    } elseif ($Format -eq 'text') {
      $extension = '.txt'
    } else {
      $extension = '.json'
    }
  }
  $destination = Join-Path $Session.artifactsDir ($safeName + $extension)

  if ($SourcePath) {
    Copy-Item -Path $SourcePath -Destination $destination -Force
  } elseif ($Format -eq 'text') {
    if ($null -eq $Content) {
      '' | Set-Content -Path $destination -Encoding UTF8
    } else {
      ($Content | Out-String) | Set-Content -Path $destination -Encoding UTF8
    }
  } else {
    $Content | ConvertTo-Json -Depth 50 | Set-Content -Path $destination -Encoding UTF8
  }

  if ($SourcePath) {
    $artifactFormat = 'copy'
  } else {
    $artifactFormat = $Format
  }
  Write-AutopilotAuditEvent -Session $Session -Event 'artifact_saved' -Message "Saved audit artifact '$Name'." -Data @{
    name = $Name
    path = $destination
    format = $artifactFormat
  } | Out-Null

  return $destination
}

function Complete-AutopilotAuditSession {
  param(
    [object]$Session,
    [Parameter(Mandatory = $true)][string]$Status,
    [object]$Summary,
    [string]$Message
  )

  if (-not $Session) {
    return
  }

  $completionTime = (Get-Date).ToString('o')
  if ($Status -eq 'success') {
    $completionLevel = 'info'
  } else {
    $completionLevel = 'warning'
  }
  Write-AutopilotAuditEvent -Session $Session -Event 'session_completed' -Level $completionLevel -Message $Message -Data @{
    status = $Status
    summary = $Summary
  } | Out-Null

  $record = [ordered]@{
    traceId = $Session.traceId
    sessionId = $Session.sessionId
    operation = $Session.operation
    status = $Status
    startedAt = $Session.startedAt
    completedAt = $completionTime
    scriptPath = $Session.scriptPath
    manifestPath = $Session.manifestPath
    host = $Session.host
    user = $Session.user
    pid = $Session.pid
    cwd = $Session.cwd
    artifactsDir = $Session.artifactsDir
    tags = @($Session.tags)
    inputs = $Session.inputs
    message = $Message
    summary = $Summary
    auditUtilsVersion = $script:AutopilotAuditUtilsVersion
  }
  $record | ConvertTo-Json -Depth 50 | Set-Content -Path $Session.sessionFile -Encoding UTF8
}
