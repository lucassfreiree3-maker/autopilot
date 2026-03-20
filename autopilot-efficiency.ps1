[CmdletBinding()]
param(
  [ValidateSet('status', 'audit', 'apply', 'opportunistic')]
  [string]$Mode = 'status',
  [string]$PolicyPath = '',
  [switch]$Force,
  [switch]$Quiet
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($PolicyPath)) {
  $PolicyPath = Join-Path $PSScriptRoot 'efficiency-policy.json'
}

function Read-JsonFile {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    return $null
  }

  return Get-Content $Path -Raw | ConvertFrom-Json
}

function Write-JsonFile {
  param(
    [string]$Path,
    [object]$Value
  )

  $dir = Split-Path -Parent $Path
  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }

  $json = $Value | ConvertTo-Json -Depth 10
  [System.IO.File]::WriteAllText($Path, $json + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
}

function Ensure-Directory {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

function Resolve-PolicyPath {
  param([string]$RelativeOrAbsolutePath)

  if ([string]::IsNullOrWhiteSpace($RelativeOrAbsolutePath)) {
    return $null
  }

  if ([System.IO.Path]::IsPathRooted($RelativeOrAbsolutePath)) {
    return $RelativeOrAbsolutePath
  }

  return Join-Path $PSScriptRoot $RelativeOrAbsolutePath
}

function Get-DirectorySizeBytes {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    return 0
  }

  $sum = (Get-ChildItem $Path -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
  if ($null -eq $sum) {
    return 0
  }

  return [int64]$sum
}

function Convert-ToMB {
  param([int64]$Bytes)
  return [math]::Round(($Bytes / 1MB), 2)
}

function Get-ActiveTaskCount {
  param([object]$StateObject)

  if ($null -eq $StateObject) {
    return 0
  }

  $tasks = @($StateObject.activeTasks)
  return $tasks.Count
}

function Get-BlockingTaskSummary {
  param(
    [object]$StateObject,
    [double]$MaxAgeHours
  )

  $tasks = @($StateObject.activeTasks)
  $fresh = @()
  $stale = @()

  foreach ($task in $tasks) {
    $claimedAt = $null
    try {
      if ($task.claimedAt) {
        $claimedAt = [datetime]$task.claimedAt
      }
    } catch {
      $claimedAt = $null
    }

    if ($claimedAt) {
      $ageHours = (New-TimeSpan -Start $claimedAt -End (Get-Date)).TotalHours
      if ($ageHours -gt $MaxAgeHours) {
        $stale += $task
      } else {
        $fresh += $task
      }
    } else {
      $fresh += $task
    }
  }

  return [pscustomobject]@{
    fresh = @($fresh)
    stale = @($stale)
  }
}

function Get-IdleStatus {
  param([object]$Policy)

  $reasons = New-Object System.Collections.Generic.List[string]
  $busy = $false

  $controllerTasks = Read-JsonFile -Path (Join-Path $PSScriptRoot 'state\agent-tasks.json')
  $agentTasks = Read-JsonFile -Path (Join-Path $PSScriptRoot 'state\agent-project-tasks.json')
  $workspaceState = $null

  $workspaceRoot = Resolve-PolicyPath -RelativeOrAbsolutePath $Policy.workspace.root
  if ($workspaceRoot) {
    $workspaceState = Read-JsonFile -Path (Join-Path $workspaceRoot 'ai-sync\STATE.json')
  }

  $taskMaxAgeHours = [double]$Policy.busyTaskMaxAgeHours
  $controllerSummary = Get-BlockingTaskSummary -StateObject $controllerTasks -MaxAgeHours $taskMaxAgeHours
  $agentSummary = Get-BlockingTaskSummary -StateObject $agentTasks -MaxAgeHours $taskMaxAgeHours
  $workspaceSummary = Get-BlockingTaskSummary -StateObject $workspaceState -MaxAgeHours $taskMaxAgeHours

  $controllerCount = @($controllerSummary.fresh).Count
  if ($controllerCount -gt 0) {
    $busy = $true
    [void]$reasons.Add("controller_active_tasks=$controllerCount")
  }

  $agentCount = @($agentSummary.fresh).Count
  if ($agentCount -gt 0) {
    $busy = $true
    [void]$reasons.Add("agent_active_tasks=$agentCount")
  }

  $workspaceCount = @($workspaceSummary.fresh).Count
  if ($workspaceCount -gt 0) {
    $busy = $true
    [void]$reasons.Add("workspace_active_tasks=$workspaceCount")
  }

  return [pscustomobject]@{
    busy = $busy
    reasons = @($reasons)
    controllerActiveTasks = $controllerCount
    agentActiveTasks = $agentCount
    workspaceActiveTasks = $workspaceCount
    staleControllerTasks = @($controllerSummary.stale).Count
    staleAgentTasks = @($agentSummary.stale).Count
    staleWorkspaceTasks = @($workspaceSummary.stale).Count
  }
}

function Add-ActionRecord {
  param(
    [System.Collections.Generic.List[object]]$Actions,
    [string]$Type,
    [string]$Target,
    [string]$Outcome,
    [string]$Detail
  )

  $Actions.Add([pscustomobject]@{
    timestamp = (Get-Date).ToString('o')
    type = $Type
    target = $Target
    outcome = $Outcome
    detail = $Detail
  }) | Out-Null
}

function Get-ManagedGitRepos {
  $repos = New-Object System.Collections.Generic.List[string]
  foreach ($root in @('repos', 'cache')) {
    $absRoot = Join-Path $PSScriptRoot $root
    if (-not (Test-Path $absRoot)) {
      continue
    }

    foreach ($dir in Get-ChildItem $absRoot -Directory -Force -ErrorAction SilentlyContinue) {
      if (Test-Path (Join-Path $dir.FullName '.git')) {
        $repos.Add($dir.FullName) | Out-Null
      }
    }
  }

  return @($repos | Select-Object -Unique)
}

function Invoke-GitGcAuto {
  param([System.Collections.Generic.List[object]]$Actions)

  foreach ($repo in Get-ManagedGitRepos) {
    try {
      $output = git -C $repo gc --auto 2>&1 | Out-String
      Add-ActionRecord -Actions $Actions -Type 'git-gc' -Target $repo -Outcome 'ok' -Detail ($output.Trim())
    } catch {
      Add-ActionRecord -Actions $Actions -Type 'git-gc' -Target $repo -Outcome 'failed' -Detail $_.Exception.Message
    }
  }
}

function Rotate-LogFiles {
  param(
    [object]$Policy,
    [System.Collections.Generic.List[object]]$Actions,
    [string]$ArchiveRoot
  )

  Ensure-Directory -Path $ArchiveRoot

  foreach ($relativePath in @($Policy.logs.files)) {
    $path = Resolve-PolicyPath -RelativeOrAbsolutePath $relativePath
    if (-not (Test-Path $path)) {
      continue
    }

    $item = Get-Item $path -Force
    if ($item.Length -le [int64]$Policy.logs.maxBytes) {
      continue
    }

    $archiveName = '{0}-{1}.log' -f $item.BaseName, (Get-Date -Format 'yyyyMMdd-HHmmss')
    $archivePath = Join-Path $ArchiveRoot $archiveName
    Move-Item -Path $path -Destination $archivePath -Force
    New-Item -ItemType File -Path $path -Force | Out-Null
    Add-ActionRecord -Actions $Actions -Type 'log-rotation' -Target $path -Outcome 'ok' -Detail "Archived to $archivePath"
  }
}

function Trim-WorkspaceEvents {
  param(
    [object]$Policy,
    [System.Collections.Generic.List[object]]$Actions
  )

  $workspaceRoot = Resolve-PolicyPath -RelativeOrAbsolutePath $Policy.workspace.root
  if (-not $workspaceRoot) {
    return
  }

  $eventsPath = Join-Path $workspaceRoot $Policy.workspace.eventsPath
  if (-not (Test-Path $eventsPath)) {
    return
  }

  $lines = Get-Content $eventsPath
  $keepLines = [int]$Policy.workspace.eventsKeepLines
  if ($lines.Count -le $keepLines) {
    return
  }

  $archiveRoot = Join-Path $workspaceRoot 'ai-sync\archive'
  Ensure-Directory -Path $archiveRoot
  $headLines = $lines | Select-Object -First ($lines.Count - $keepLines)
  $tailLines = $lines | Select-Object -Last $keepLines
  $archivePath = Join-Path $archiveRoot ("EVENTS-{0}.jsonl" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
  [System.IO.File]::WriteAllLines($archivePath, $headLines, [System.Text.UTF8Encoding]::new($false))
  [System.IO.File]::WriteAllLines($eventsPath, $tailLines, [System.Text.UTF8Encoding]::new($false))
  Add-ActionRecord -Actions $Actions -Type 'events-trim' -Target $eventsPath -Outcome 'ok' -Detail "Archived $(($headLines | Measure-Object).Count) lines to $archivePath"

  $archives = Get-ChildItem $archiveRoot -File -Filter 'EVENTS-*.jsonl' | Sort-Object LastWriteTime -Descending
  $maxArchives = [int]$Policy.workspace.eventArchiveKeepFiles
  foreach ($staleArchive in ($archives | Select-Object -Skip $maxArchives)) {
    Remove-Item $staleArchive.FullName -Force
    Add-ActionRecord -Actions $Actions -Type 'archive-prune' -Target $staleArchive.FullName -Outcome 'ok' -Detail 'Removed old ai-sync event archive.'
  }
}

function Compress-And-RemoveItem {
  param(
    [System.IO.FileSystemInfo]$Item,
    [string]$ArchiveRoot,
    [System.Collections.Generic.List[object]]$Actions
  )

  Ensure-Directory -Path $ArchiveRoot
  $safeName = $Item.Name -replace '[^A-Za-z0-9._-]', '_'
  $archivePath = Join-Path $ArchiveRoot ("{0}-{1}.zip" -f $safeName, (Get-Date -Format 'yyyyMMdd-HHmmss'))
  Compress-Archive -LiteralPath $Item.FullName -DestinationPath $archivePath -CompressionLevel Optimal -Force
  Remove-Item -LiteralPath $Item.FullName -Recurse -Force
  Add-ActionRecord -Actions $Actions -Type 'archive-retention' -Target $Item.FullName -Outcome 'ok' -Detail "Archived to $archivePath"
}

function Apply-ReportRetention {
  param(
    [object]$Policy,
    [System.Collections.Generic.List[object]]$Actions
  )

  $archiveRoot = Resolve-PolicyPath -RelativeOrAbsolutePath $Policy.archiveRoot
  Ensure-Directory -Path $archiveRoot

  foreach ($target in @($Policy.retention.targets)) {
    $targetPath = Resolve-PolicyPath -RelativeOrAbsolutePath $target.path
    if (-not (Test-Path $targetPath)) {
      continue
    }

    $items = @(Get-ChildItem $targetPath -Force -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
    $skipCount = [int]$target.keepRecent
    $maxAgeDays = [int]$target.maxAgeDays
    $staleBefore = (Get-Date).AddDays(-$maxAgeDays)
    $candidates = $items | Select-Object -Skip $skipCount | Where-Object { $_.LastWriteTime -lt $staleBefore }

    foreach ($candidate in $candidates) {
      if ($target.archive -eq $true) {
        Compress-And-RemoveItem -Item $candidate -ArchiveRoot $archiveRoot -Actions $Actions
      }
    }
  }
}

function Remove-EmptyDirectories {
  param(
    [object]$Policy,
    [System.Collections.Generic.List[object]]$Actions
  )

  foreach ($relativeRoot in @($Policy.emptyDirRoots)) {
    $root = Resolve-PolicyPath -RelativeOrAbsolutePath $relativeRoot
    if (-not (Test-Path $root)) {
      continue
    }

    $dirs = Get-ChildItem $root -Recurse -Directory -Force -ErrorAction SilentlyContinue | Sort-Object FullName -Descending
    foreach ($dir in $dirs) {
      $children = @(Get-ChildItem $dir.FullName -Force -ErrorAction SilentlyContinue)
      if ($children.Count -eq 0) {
        Remove-Item $dir.FullName -Force
        Add-ActionRecord -Actions $Actions -Type 'empty-dir-prune' -Target $dir.FullName -Outcome 'ok' -Detail 'Removed empty directory.'
      }
    }
  }
}

function Get-ResourceSummary {
  $items = New-Object System.Collections.Generic.List[object]
  foreach ($relativePath in @('reports', 'cache', 'repos', 'docs', 'logs', 'state', 'portable-kit')) {
    $fullPath = Join-Path $PSScriptRoot $relativePath
    if (-not (Test-Path $fullPath)) {
      continue
    }

    $items.Add([pscustomobject]@{
      path = $fullPath
      sizeMB = Convert-ToMB -Bytes (Get-DirectorySizeBytes -Path $fullPath)
      files = @(Get-ChildItem $fullPath -Recurse -File -Force -ErrorAction SilentlyContinue).Count
      lastWriteTime = (Get-Item $fullPath).LastWriteTime
    }) | Out-Null
  }

  return @($items | Sort-Object sizeMB -Descending)
}

function Get-DocEconomySummary {
  param([object]$Policy)

  $docsDir = Join-Path $PSScriptRoot 'docs'
  if (-not (Test-Path $docsDir)) {
    return @()
  }

  $heavyThreshold = [int]$Policy.tokenEconomy.heavyDocLines
  $rareThreshold = [int]$Policy.tokenEconomy.rareDocLines

  $docs = foreach ($file in Get-ChildItem $docsDir -File -Force | Sort-Object Name) {
    $lineCount = (Get-Content $file.FullName).Count
    $recommendedMode = if ($lineCount -ge $rareThreshold) {
      'rare'
    } elseif ($lineCount -ge $heavyThreshold) {
      'on_demand'
    } else {
      'normal'
    }

    [pscustomobject]@{
      name = $file.Name
      path = $file.FullName
      lines = $lineCount
      bytes = $file.Length
      recommendedMode = $recommendedMode
    }
  }

  return @($docs | Sort-Object lines -Descending)
}

function Get-ImprovementFindings {
  param([object]$Policy)

  $findings = @()
  $resourceSummary = Get-ResourceSummary
  $docs = Get-DocEconomySummary -Policy $Policy
  $reportsEntry = $resourceSummary | Where-Object { $_.path -eq (Join-Path $PSScriptRoot 'reports') } | Select-Object -First 1
  if ($reportsEntry) {
    $findings += [pscustomobject]@{
      category = 'disk'
      severity = 'medium'
      title = 'Report history should stay under automated retention.'
      detail = "reports currently use $($reportsEntry.sizeMB) MB across $($reportsEntry.files) files."
    }
  }

  $heavyDocs = @($docs | Where-Object { $_.recommendedMode -ne 'normal' })
  foreach ($doc in ($heavyDocs | Select-Object -First 5)) {
    $findings += [pscustomobject]@{
      category = 'token'
      severity = 'medium'
      title = "Avoid eager loading $($doc.name)."
      detail = "$($doc.lines) lines. Recommended mode: $($doc.recommendedMode)."
    }
  }

  $nodeModulesPath = Join-Path $PSScriptRoot 'repos\your-controller\node_modules'
  if (Test-Path $nodeModulesPath) {
    $sizeMB = Convert-ToMB -Bytes (Get-DirectorySizeBytes -Path $nodeModulesPath)
    $findings += [pscustomobject]@{
      category = 'runtime'
      severity = 'low'
      title = 'node_modules is present in the managed controller clone.'
      detail = "$sizeMB MB. Treat as operational dependency; do not auto-delete, but keep git gc and report retention lean around it."
    }
  }

  $busyState = Get-IdleStatus -Policy $Policy
  if ($busyState.staleControllerTasks -gt 0) {
    $findings += [pscustomobject]@{
      category = 'governance'
      severity = 'medium'
      title = 'Controller task registry contains stale active entries.'
      detail = "$($busyState.staleControllerTasks) stale controller task(s) exceed the blocking age and should be reviewed."
    }
  }
  if ($busyState.staleAgentTasks -gt 0) {
    $findings += [pscustomobject]@{
      category = 'governance'
      severity = 'medium'
      title = 'Agent task registry contains stale active entries.'
      detail = "$($busyState.staleAgentTasks) stale agent task(s) exceed the blocking age and should be reviewed."
    }
  }

  return ,@($findings)
}

function Write-MarkdownReport {
  param(
    [string]$Path,
    [object]$RunState
  )

  $lines = New-Object System.Collections.Generic.List[string]
  [void]$lines.Add('# Autopilot Efficiency Report')
  [void]$lines.Add('')
  [void]$lines.Add("Updated: $($RunState.generatedAt)")
  [void]$lines.Add("Mode: $($RunState.mode)")
  [void]$lines.Add("Status: $($RunState.status)")
  [void]$lines.Add('')
  [void]$lines.Add('## Summary')
  [void]$lines.Add("- Busy state: $($RunState.busyState.busy)")
  if (@($RunState.busyState.reasons).Count -gt 0) {
    [void]$lines.Add("- Busy reasons: $((@($RunState.busyState.reasons)) -join ', ')")
  }
  [void]$lines.Add("- Stale task entries: controller=$($RunState.busyState.staleControllerTasks), agent=$($RunState.busyState.staleAgentTasks), workspace=$($RunState.busyState.staleWorkspaceTasks)")
  [void]$lines.Add("- Actions applied: $(@($RunState.actions).Count)")
  [void]$lines.Add("- Findings: $(@($RunState.findings).Count)")
  [void]$lines.Add('')
  [void]$lines.Add('## Improvement Findings')
  if (@($RunState.findings).Count -eq 0) {
    [void]$lines.Add('- No significant findings.')
  } else {
    foreach ($finding in @($RunState.findings)) {
      [void]$lines.Add("- [$($finding.severity)] $($finding.title) $($finding.detail)")
    }
  }
  [void]$lines.Add('')
  [void]$lines.Add('## Resource Summary')
  foreach ($entry in @($RunState.resourceSummary)) {
    [void]$lines.Add("- $($entry.path): $($entry.sizeMB) MB across $($entry.files) files")
  }
  [void]$lines.Add('')
  [void]$lines.Add('## Token Economy')
  foreach ($doc in (@($RunState.docSummary) | Select-Object -First 8)) {
    [void]$lines.Add("- $($doc.name): $($doc.lines) lines | mode=$($doc.recommendedMode)")
  }
  [void]$lines.Add('')
  [void]$lines.Add('## Actions Applied')
  if (@($RunState.actions).Count -eq 0) {
    [void]$lines.Add('- No cleanup action was required in this run.')
  } else {
    foreach ($action in @($RunState.actions)) {
      [void]$lines.Add("- [$($action.outcome)] $($action.type) | $($action.target) | $($action.detail)")
    }
  }

  [System.IO.File]::WriteAllText($Path, ($lines -join [Environment]::NewLine) + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
}

if (-not (Test-Path $PolicyPath)) {
  throw "Efficiency policy not found: $PolicyPath"
}

$policy = Get-Content $PolicyPath -Raw | ConvertFrom-Json
$reportRoot = Resolve-PolicyPath -RelativeOrAbsolutePath $policy.reportRoot
$archiveRoot = Resolve-PolicyPath -RelativeOrAbsolutePath $policy.archiveRoot
$statePath = Resolve-PolicyPath -RelativeOrAbsolutePath $policy.stateFile

Ensure-Directory -Path $reportRoot
Ensure-Directory -Path $archiveRoot

$previousState = Read-JsonFile -Path $statePath
$generatedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm zzz')
$actions = New-Object System.Collections.Generic.List[object]
$busyState = Get-IdleStatus -Policy $policy
$status = 'ok'
$effectiveMode = $Mode

if ($Mode -eq 'status') {
  if ($previousState) {
    $previousState | ConvertTo-Json -Depth 10
  } else {
    [pscustomobject]@{
      status = 'not_initialized'
      detail = 'No efficiency state recorded yet.'
    } | ConvertTo-Json -Depth 5
  }
  exit 0
}

if ($Mode -eq 'opportunistic') {
  if ($previousState -and $previousState.lastRunAt) {
    $lastRun = [datetime]$previousState.lastRunAt
    $minHours = [double]$policy.opportunisticMinHours
    if ((New-TimeSpan -Start $lastRun -End (Get-Date)).TotalHours -lt $minHours) {
      $status = 'skipped_recent'
      $effectiveMode = 'opportunistic-skip'
    }
  }

  if ($status -eq 'ok' -and $busyState.busy -and -not $Force) {
    $status = 'busy_audit_only'
    $effectiveMode = 'audit'
  } elseif ($status -eq 'ok') {
    $effectiveMode = 'apply'
  }
}

if ($Mode -eq 'apply' -and $busyState.busy -and -not $Force) {
  $status = 'busy_audit_only'
  $effectiveMode = 'audit'
}

if ($effectiveMode -eq 'apply') {
  Rotate-LogFiles -Policy $policy -Actions $actions -ArchiveRoot $archiveRoot
  Trim-WorkspaceEvents -Policy $policy -Actions $actions
  Apply-ReportRetention -Policy $policy -Actions $actions
  Remove-EmptyDirectories -Policy $policy -Actions $actions
  Invoke-GitGcAuto -Actions $actions
}

$resourceSummary = Get-ResourceSummary
$docSummary = Get-DocEconomySummary -Policy $policy
$findings = Get-ImprovementFindings -Policy $policy
$latestMdPath = Join-Path $reportRoot 'latest.md'
$latestJsonPath = Join-Path $reportRoot 'latest.json'
$normalizedBusyState = [pscustomobject]@{
  busy = [bool]$busyState.busy
  reasons = @($busyState.reasons)
  controllerActiveTasks = [int]$busyState.controllerActiveTasks
  agentActiveTasks = [int]$busyState.agentActiveTasks
  workspaceActiveTasks = [int]$busyState.workspaceActiveTasks
  staleControllerTasks = [int]$busyState.staleControllerTasks
  staleAgentTasks = [int]$busyState.staleAgentTasks
  staleWorkspaceTasks = [int]$busyState.staleWorkspaceTasks
}
$normalizedActions = @($actions.ToArray())

$runState = [pscustomobject]@{
  generatedAt = $generatedAt
  mode = $Mode
  effectiveMode = $effectiveMode
  status = $status
  busyState = $normalizedBusyState
  findings = $findings
  actions = $normalizedActions
  resourceSummary = $resourceSummary
  docSummary = $docSummary
  lastRunAt = (Get-Date).ToString('o')
}

Write-MarkdownReport -Path $latestMdPath -RunState $runState
Write-JsonFile -Path $latestJsonPath -Value $runState
Write-JsonFile -Path $statePath -Value ([pscustomobject]@{
  lastRunAt = (Get-Date).ToString('o')
  lastMode = $Mode
  effectiveMode = $effectiveMode
  status = $status
  latestReport = $latestMdPath
  latestJson = $latestJsonPath
  busyState = $normalizedBusyState
  actionCount = $normalizedActions.Count
  findingCount = @($findings).Count
})

if (-not $Quiet) {
  Write-Host "Status: $status"
  Write-Host "EffectiveMode: $effectiveMode"
  Write-Host "LatestReport: $latestMdPath"
  Write-Host "ActionCount: $($normalizedActions.Count)"
  Write-Host "FindingCount: $(@($findings).Count)"
}
