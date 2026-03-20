$ErrorActionPreference = "Stop"
$manifestPath = Join-Path $PSScriptRoot 'autopilot-manifest.json'
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json

[System.Environment]::SetEnvironmentVariable('BB_DEVOPS_AUTOPILOT_HOME', $manifest.paths.home, 'User')
[System.Environment]::SetEnvironmentVariable('BB_DEVOPS_AUTOPILOT_MANIFEST', $manifestPath, 'User')

$globalAgents = @"
# Global Codex Instructions

## BBDevOpsAutopilot Discovery
- Persistent source of truth: $($manifest.paths.home)
- Machine-readable manifest: $manifestPath
- Local skill: bbdevops-controller-autopilot
- Persistent docs: $($manifest.docs.docsDir)
- Portable kit: $($manifest.exports.portableRoot)
- Secure token file: $($manifest.paths.token)
- This setup must continue to work even if `<USER_HOME>\OneDrive\AUTOMACAO` is deleted.

## Mandatory Controller Release Flow
- When the request is about changing `your-controller`, use the persistent BBDevOpsAutopilot setup.
- Work only in the canonical clone at `$($manifest.paths.controllerRepo)`.
- Always synchronize `main` first by running `prepare-controller-main.cmd` from the autopilot home.
- Make code changes only after the canonical clone is aligned to `origin/main`.
- The first commit of the release cycle must bump the release version in `package.json` and `package-lock.json`, and also in `src\swagger\swagger.json` when that UI version exists there.
- Corrective commits in the same failed CI cycle must keep the same release version.
- After pushing `main`, monitor the full GitHub Actions run until it reaches `completed`, because failures may happen in any stage and image generation may take significant time.
- If the build succeeds, update `deploy-your-controller` on branch `$($manifest.policy.deployBranch)`, setting `deployment.containers.tag` in `values.yaml` to the same release version.

## Configuration Change Awareness
- If the user says they want to change some URL, branch, repo, target environment, or release-flow setting, inspect:
  - `autopilot-manifest.json`
  - `controller-release-autopilot.json`
  - `docs\configuration-map.md`
  - `prompts\controller-change-superprompt.md`
  - the local skill `bbdevops-controller-autopilot`
  - the copied assets in portable-kit\
"@
$globalAgents | Set-Content '<USER_HOME>\.ops\AGENTS.md' -Encoding UTF8
Write-Host 'Global discovery and user environment variables repaired.'
