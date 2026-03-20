$ErrorActionPreference = "Stop"

$manifestPath = Join-Path $PSScriptRoot 'autopilot-manifest.json'
if (-not (Test-Path $manifestPath)) {
  Write-Error "Manifest not found: $manifestPath"
}
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$results = New-Object System.Collections.Generic.List[object]

function Add-Result {
  param([string]$Name,[bool]$Ok,[string]$Detail)
  $results.Add([pscustomobject]@{ Name = $Name; Status = $(if ($Ok) { 'OK' } else { 'FAIL' }); Detail = $Detail })
}

function Test-EquivalentPath {
  param(
    [string]$ReferencePath,
    [string]$CandidatePath
  )

  if ([string]::IsNullOrWhiteSpace($ReferencePath) -or [string]::IsNullOrWhiteSpace($CandidatePath)) {
    return $false
  }

  $referenceFull = [System.IO.Path]::GetFullPath($ReferencePath).TrimEnd('\')
  $candidateFull = [System.IO.Path]::GetFullPath($CandidatePath).TrimEnd('\')
  if ($referenceFull -eq $candidateFull) {
    return $true
  }

  if ((Test-Path $ReferencePath) -and (Test-Path $CandidatePath)) {
    $referenceItem = Get-Item -LiteralPath $ReferencePath -Force
    $candidateItem = Get-Item -LiteralPath $CandidatePath -Force
    if (-not $referenceItem.PSIsContainer -and -not $candidateItem.PSIsContainer) {
      return ((Get-FileHash -Algorithm SHA256 -Path $ReferencePath).Hash -eq (Get-FileHash -Algorithm SHA256 -Path $CandidatePath).Hash)
    }
  }

  return $false
}

$requiredPaths = @(
  $manifest.paths.home,
  $manifest.paths.config,
  $manifest.paths.token,
  $manifest.paths.state,
  $manifest.paths.promptsDir,
  $manifest.paths.skillDir,
  $manifest.paths.globalAgents,
  $manifest.commands.prepareControllerMain,
  $manifest.commands.refreshManagedRepos,
  $manifest.commands.runAutopilot,
  $manifest.commands.preflightControllerCi,
  $manifest.commands.runControllerCiFailureProbes,
  $manifest.commands.testControllerReleaseTooling,
  (Join-Path $manifest.paths.home 'autopilot-supervisor.ps1'),
  (Join-Path $manifest.paths.home 'services.json'),
  (Join-Path $manifest.paths.home 'autopilot-efficiency.cmd'),
  (Join-Path $manifest.paths.home 'autopilot-efficiency.ps1'),
  (Join-Path $manifest.paths.home 'efficiency-policy.json'),
  $manifest.commands.validate,
  $manifest.commands.repair,
  $manifest.commands.installFromPortable,
  $manifest.docs.flowOverview,
  $manifest.docs.configurationMap,
  $manifest.docs.repositoryMap,
  $manifest.docs.ciFailureProbes
)
foreach ($path in @($requiredPaths | Where-Object { $_ })) {
  Add-Result -Name "exists:$path" -Ok (Test-Path $path) -Detail $path
}

foreach ($prompt in $manifest.prompts) {
  $promptPath = Join-Path $manifest.paths.promptsDir $prompt
  Add-Result -Name "prompt:$prompt" -Ok (Test-Path $promptPath) -Detail $promptPath
}

Add-Result -Name 'manifest:controller-web-url' -Ok ($manifest.controller.webUrl -match '^https://github\.com\.mcas\.ms/') -Detail $manifest.controller.webUrl
Add-Result -Name 'manifest:deploy-web-url' -Ok ($manifest.deploy.webUrl -match '^https://github\.com\.mcas\.ms/') -Detail $manifest.deploy.webUrl
Add-Result -Name 'manifest:command:test-controller-release-tooling' -Ok ($manifest.commands.PSObject.Properties.Name -contains 'testControllerReleaseTooling') -Detail 'commands.testControllerReleaseTooling'
Add-Result -Name 'manifest:command:preflight-controller-ci' -Ok ($manifest.commands.PSObject.Properties.Name -contains 'preflightControllerCi') -Detail 'commands.preflightControllerCi'
Add-Result -Name 'manifest:command:run-controller-ci-failure-probes' -Ok ($manifest.commands.PSObject.Properties.Name -contains 'runControllerCiFailureProbes') -Detail 'commands.runControllerCiFailureProbes'
Add-Result -Name 'manifest:no-argocd-config' -Ok (-not ($manifest.PSObject.Properties.Name -contains 'argocd')) -Detail 'argocd removed from operational manifest'
Add-Result -Name 'manifest:no-bridge-config' -Ok (-not ($manifest.PSObject.Properties.Name -contains 'bridge')) -Detail 'bridge removed from operational manifest'
Add-Result -Name 'manifest:ci-failure-probes-enabled' -Ok ($manifest.policy.ciFailureProbesUseTemporaryBranches -eq $true -and $manifest.policy.ciFailureProbeMaxTests -eq 5) -Detail 'policy.ciFailureProbesUseTemporaryBranches / ciFailureProbeMaxTests'

$skillMdPath = Join-Path $manifest.paths.skillDir 'SKILL.md'
$skillYamlPath = Join-Path $manifest.paths.skillDir 'agents\openai.yaml'
$skillMd = if (Test-Path $skillMdPath) { Get-Content $skillMdPath -Raw } else { '' }
$skillYaml = if (Test-Path $skillYamlPath) { Get-Content $skillYamlPath -Raw } else { '' }
Add-Result -Name 'skill:SKILL.md' -Ok (Test-Path $skillMdPath) -Detail $skillMdPath
Add-Result -Name 'skill:openai.yaml' -Ok (Test-Path $skillYamlPath) -Detail $skillYamlPath
Add-Result -Name 'skill:frontmatter-name' -Ok ($skillMd -match '(?m)^name:\s+bbdevops-controller-autopilot\s*$') -Detail 'SKILL frontmatter name'
Add-Result -Name 'skill:frontmatter-description' -Ok ($skillMd -match '(?m)^description:\s+') -Detail 'SKILL frontmatter description'
Add-Result -Name 'skill:openai-display-name' -Ok ($skillYaml -match '(?m)^\s*display_name:\s+"BBDevOps Controller Autopilot"\s*$') -Detail 'agents/openai.yaml display_name'

$envHome = [System.Environment]::GetEnvironmentVariable('BB_DEVOPS_AUTOPILOT_HOME','User')
$envManifest = [System.Environment]::GetEnvironmentVariable('BB_DEVOPS_AUTOPILOT_MANIFEST','User')
Add-Result -Name 'env:BB_DEVOPS_AUTOPILOT_HOME' -Ok (Test-EquivalentPath -ReferencePath $manifest.paths.home -CandidatePath $envHome) -Detail $envHome
Add-Result -Name 'env:BB_DEVOPS_AUTOPILOT_MANIFEST' -Ok (Test-EquivalentPath -ReferencePath $manifestPath -CandidatePath $envManifest) -Detail $envManifest

$controllerRepo = $manifest.paths.controllerRepo
if (Test-Path $controllerRepo) {
  $branch = (git -C $controllerRepo rev-parse --abbrev-ref HEAD 2>$null).Trim()
  $origin = (git -C $controllerRepo remote get-url origin 2>$null).Trim()
  Add-Result -Name 'controllerRepo:branch' -Ok ($branch -eq $manifest.policy.controllerBranch) -Detail $branch
  Add-Result -Name 'controllerRepo:origin' -Ok ($origin -eq $manifest.controller.repoUrl) -Detail $origin
} else {
  Add-Result -Name 'controllerRepo:branch' -Ok $false -Detail 'repo missing'
  Add-Result -Name 'controllerRepo:origin' -Ok $false -Detail 'repo missing'
}

$deployRepo = $manifest.paths.deployRepo
if (Test-Path $deployRepo) {
  $branch = (git -C $deployRepo rev-parse --abbrev-ref HEAD 2>$null).Trim()
  $origin = (git -C $deployRepo remote get-url origin 2>$null).Trim()
  Add-Result -Name 'deployRepo:branch' -Ok ($branch -eq $manifest.deploy.branch) -Detail $branch
  Add-Result -Name 'deployRepo:origin' -Ok ($origin -eq $manifest.deploy.repoUrl) -Detail $origin
} else {
  Add-Result -Name 'deployRepo:branch' -Ok $false -Detail 'repo missing'
  Add-Result -Name 'deployRepo:origin' -Ok $false -Detail 'repo missing'
}

$hookPath = '<USER_HOME>\OneDrive\AUTOMACAO\your-controller\.git\hooks\post-push'
Add-Result -Name 'legacy:post-push-removed' -Ok (-not (Test-Path $hookPath)) -Detail $hookPath

$taskExists = $false
$null = cmd.exe /d /c 'schtasks /Query /TN "BBDevOpsAutopilot Controller Release" >nul 2>nul'
if ($LASTEXITCODE -eq 0) { $taskExists = $true }
Add-Result -Name 'legacy:scheduled-task-removed' -Ok (-not $taskExists) -Detail 'BBDevOpsAutopilot Controller Release'

$results | Format-Table -AutoSize
if ($results.Status -contains 'FAIL') { exit 1 }
