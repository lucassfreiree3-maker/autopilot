$ErrorActionPreference = "Stop"
$autopilotHome = $PSScriptRoot
$docsDir = Join-Path $autopilotHome 'docs'
$portableDir = Join-Path $autopilotHome 'portable-kit'
$portablePrompts = Join-Path $portableDir 'prompts'
$portableDocs = Join-Path $portableDir 'docs'
$portableSkill = Join-Path $portableDir 'skill'
$portableScripts = Join-Path $portableDir 'scripts'
$skillDir = '<USER_HOME>\.codex\skills\local\bbdevops-controller-autopilot'
$manifestPath = Join-Path $autopilotHome 'autopilot-manifest.json'
$agentManifestPath = Join-Path $autopilotHome 'autopilot-manifest-agent.json'
$portableManifestDir = Join-Path $portableDir 'manifest'

New-Item -ItemType Directory -Force -Path $portableDir,$portablePrompts,$portableDocs,$portableSkill,$portableScripts,$portableManifestDir | Out-Null
Remove-Item -Path (Join-Path $portableDir 'worker-package') -Recurse -Force -ErrorAction SilentlyContinue
foreach ($dir in @($portablePrompts,$portableDocs,$portableSkill,$portableScripts,$portableManifestDir)) {
  Get-ChildItem -Path $dir -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}
Copy-Item $manifestPath (Join-Path $portableManifestDir 'autopilot-manifest.json') -Force
if (Test-Path $agentManifestPath) {
  Copy-Item $agentManifestPath (Join-Path $portableManifestDir 'autopilot-manifest-agent.json') -Force
}
Copy-Item (Join-Path $autopilotHome 'prompts\*') $portablePrompts -Recurse -Force
Copy-Item (Join-Path $docsDir '*') $portableDocs -Recurse -Force
Copy-Item (Join-Path $skillDir '*') $portableSkill -Recurse -Force

$runtimeFiles = @(
  'audit-utils.ps1',
  'agent-autosync.ps1',
  'agent-release-autopilot.cmd','agent-release-autopilot.json',
  'controller-release-autopilot.ps1','controller-release-autopilot.cmd','controller-release-autopilot.json',
  'prepare-agent-main.cmd',
  'prepare-controller-main.ps1','prepare-controller-main.cmd',
  'push-agent-main.cmd','push-cap-agent-main.cmd','push-controller-main.cmd','push-deploy-agent-hml.cmd','push-deploy-controller-hml.cmd','push-github-with-token.ps1',
  'refresh-agent-repos.cmd',
  'refresh-managed-repos.ps1','refresh-managed-repos.cmd',
  'preflight-controller-ci.ps1','preflight-controller-ci.cmd',
  'run-controller-ci-failure-probes.ps1','run-controller-ci-failure-probes.cmd',
  'test-controller-release-tooling.ps1','test-controller-release-tooling.cmd',
  'set-workspace-github-token.ps1','set-workspace-github-token.cmd',
  'validate-autopilot.ps1','validate-autopilot.cmd',
  'repair-autopilot.ps1','repair-autopilot.cmd',
  'export-portable-kit.ps1','export-portable-kit.cmd',
  'install-from-portable.ps1','install-from-portable.cmd'
)
foreach ($file in $runtimeFiles) {
  $source = Join-Path $autopilotHome $file
  if (Test-Path $source) {
    Copy-Item $source $portableScripts -Force
  }
}
Write-Host 'Portable kit refreshed.'
