# BBDevOpsAutopilot

This directory is the persistent source of truth for the local controller and agent release automation.

## What is stored here
- Installed scripts and wrappers
- Canonical controller clone on `main`
- Cached deploy clone on `cloud/staging`
- Encrypted GitHub token
- Release state
- GitHub Actions diagnostics
- Prompt library for controller-change and autopilot-maintenance requests
- Machine-readable manifest for future chat discovery
- Persistent docs with flow map, repository map, configuration map, portability guide, runbook, auditability guide, audit checklist, and handoff template
- Portable kit with copied docs, prompts, skill, runtime scripts, and bootstrap assets

## Safe deletion model
- `ai-devops-workspace` can be deleted.
- `<USER_HOME>\OneDrive\AUTOMACAO` can be emptied without breaking the installed autopilot.
- Deleting this directory breaks the installed autopilot and removes its state.

## Root launcher
- Use `<USER_HOME>\START.cmd` as the stable entry point in future chats or VS Code sessions.
- `START.cmd` sets the safe-root environment variables, runs validation by default, and exposes the main operational commands:
  - `START.cmd validate`
  - `START.cmd bootstrap`
  - `START.cmd release`
  - `START.cmd smoke`
  - `START.cmd preflight`
  - `START.cmd probes`
  - `START.cmd bundle`
  - `START.cmd docs`
  - `START.cmd efficiency`

## GitHub token and automatic push
- Save the GitHub token with `set-workspace-github-token.cmd`.
- The preferred storage format is a secure plain-text file `secrets\github-token.txt` or environment variables, avoiding DPAPI to prevent SOC false-positive alerts.
- Git push automation should use `push-github-with-token.ps1` or a repo-specific wrapper such as `push-agent-main.cmd`.
- The push helper injects an ephemeral HTTP authorization header for the git process and does not rewrite the repository remote URL with the token.
- Do not write tokens into `ai-sync`, docs, prompts, or git remotes.

## Product boundary
- The personal product repository is `https://github.com/lucassfreiree/autopilot/`.
- Do not keep canonical-only product state in `<USER_HOME>\OneDrive\AUTOMACAO`.
- If `AUTOMACAO\product-template` exists, treat it as a disposable working export only.
- Corporate repositories under `your-org/*` are operational company surfaces and must not be treated as part of the personal product.
- Company-specific implementation belongs only in the managed controller and agent repositories under `repos\` and `cache\`.

## Google Drive backup
- The canonical backup source is this safe-root Autopilot home, not the `AUTOMACAO` workspace.
- The configured Google Drive destination is `https://drive.google.com/drive/u/1/folders/1Vx0vXKGkZcj7jRv5dThLti4MlTHk6eo9`.
- Use `setup-gdrive-auth.cmd` once to authorize `rclone` and register the backup watcher.
- The `rclone` OAuth/config file should live in `secrets\rclone.conf` inside the safe-root Autopilot home.
- Use `backup-now.cmd` for an immediate upload; the watcher continues to back up the safe-root Autopilot automatically after changes.

## Managed repositories
- Controller source and release-version files:
  - web: `https://github.com/your-org/your-controller`
  - clone: `https://github.com/your-org/your-controller.git`
- Deploy promotion and `values.yaml` tag:
  - web: `https://github.com/your-org/deploy-your-controller`
  - clone: `https://github.com/your-org/deploy-your-controller.git`
- Agent source and release-version files:
  - web: `https://github.com/your-org/your-agent`
  - clone: `https://github.com/your-org/your-agent.git`
- Agent deploy promotion and `values.yaml` tag:
  - web: `https://github.com/your-org/deploy-your-agent`
  - clone: `https://github.com/your-org/deploy-your-agent.git`
- Agent CAP image-tag mirror:
  - web: `https://github.com/your-org/cap-releases-your-agent`
  - clone: `https://github.com/your-org/cap-releases-your-agent.git`

## Persistent runtime
- `autopilot-supervisor.ps1` and `services.json` keep the long-running Gemini services alive.
- Controller release watcher: `watch-and-release.ps1`
- Agent release watcher: `watch-agent-release.ps1`
- Gemini spooler runtime: `docs\start-agent-spooler.ps1`
- When the supervisor is healthy, both controller and agent release cycles can resume automatically after new saves or in-flight CI monitoring.

If those links change, update the manifest, runtime config, docs, prompts, skill, and portable kit together.

## Standard release flow
1. Run `refresh-managed-repos.cmd` if you need both managed repos refreshed.
2. Run `prepare-controller-main.cmd`.
3. Edit code in `repos\your-controller`.
4. Commit locally and push with `push-controller-main.cmd`, or run `controller-release-autopilot.cmd`.
5. The autopilot stops after promoting `cloud/staging` by updating `deployment.containers.tag` in `values.yaml`.
6. No cluster-side sync, pod restart, or remote execution is part of the default release flow.

## Standard agent release flow
1. Run `refresh-agent-repos.cmd` if you need the managed agent repos refreshed.
2. Run `prepare-agent-main.cmd`.
3. Edit code in `repos\your-agent`.
4. Commit locally and push with `push-agent-main.cmd`, or run `agent-release-autopilot.cmd`.
5. After source CI succeeds, the autopilot promotes `deployment.containers.tag` in `cache\deploy-github-your-agent\values.yaml` on `cloud/staging`.
6. After deploy promotion, the autopilot mirrors the same version into `cache\deploy-your-agent\releases\openshift\hml\deploy\values.yaml` on `main`.
7. No cluster-side sync, pod restart, or remote execution is part of the default agent release flow.

## Autonomous bootstrap flow
- Run `bootstrap-controller-release-flow.cmd` when you want the autopilot to ensure the managed repositories are cloned/synchronized first and then continue into the normal controller release flow.
- This command operates from the persistent autopilot home and does not depend on the `AUTOMACAO` workspace contents.
- Optional flags:
  - `-RunPreflight`
  - `-InstallDependencies`
  - `-SkipMonitor`
  - `-SkipDeployUpdate`

## Controlled smoke test flow
- Run `run-controller-release-smoke-test.cmd` to generate a controlled change in `CHANGELOG.md` on the canonical controller clone and capture the diff in the audit trail.
- By default this command is a dry-run: it reverts the smoke patch after generating the evidence.
- Use `-ExecuteRelease` only when you intentionally want that controlled patch to enter the real release flow and reach the CI pipeline.

## Tooling test
- Run `test-controller-release-tooling.cmd` to validate the installed release tooling, manifest, portable kit export, and removal of unsupported subsystems without triggering a real release.

## Docs bundle
- Run `export-docs-bundle.cmd` to generate a transportable zip with docs, manifest, prompts, scripts, skill files, and discovery `AGENTS.md` references for configuring the flow in another AI or VS Code environment.
- The docs bundle intentionally excludes secrets, managed repository clones, and audit history.

## Complete handoff bundle
- Run `export-complete-handoff-bundle.cmd` to generate a fuller handoff zip with runtime scripts, config, docs, prompts, skill files, audit traces, CI probe reports, GitHub Actions reports, state snapshot, discovery files, and the portable kit.
- The complete handoff bundle still excludes secrets and managed repository clones by design.

## CI probe tooling
- Run `preflight-controller-ci.cmd` to catch package manifest, lint/typecheck, and Jest failures locally before pushing a fix or release cycle.
- Run `run-controller-ci-failure-probes.cmd` to launch controlled failures on temporary controller branches, capture GitHub Actions evidence, and map CI-stage behavior without touching `main`.
- Treat `run-controller-ci-failure-probes.cmd` as the regression suite whenever the pipeline YAML, reusable workflow, or CI build chain changes.

## Current policy
- Controller branch: `main`
- Deploy branch: `cloud/staging`
- First commit in a cycle bumps release version
- Corrective commits in the same failed cycle do not bump version again
- Monitor the full GitHub Actions run until completion
- The default completion point is the `values.yaml` tag update on `cloud/staging`

## Configuration awareness
If the user wants to change any URL, branch, repo, target environment, token location, or release-flow rule, update the manifest, runtime config, global discovery file, docs, prompt library, skill, and portable kit together.

## Audit trail
- Shared audit traces are written to `reports\audit` by the installed operational scripts, including `prepare-controller-main.ps1`, `refresh-managed-repos.ps1`, `controller-release-autopilot.ps1`, and `test-controller-release-tooling.ps1`.
- Managed Git history, `state\controller-release-state.json`, and GitHub Actions reports under `reports\github-actions` remain the primary evidence of what was actually released.
- Controlled CI probe evidence is written to `reports\ci-failure-probes`.

## Automatic efficiency routine
- Run `START.cmd efficiency` to audit token economy, disk usage, report retention, log rotation, and low-risk cleanup.
- Policy: `efficiency-policy.json`
- Latest report: `reports\efficiency\latest.md`
- State: `state\efficiency-state.json`
- The routine is conservative by default: it rotates oversized logs, trims shared event history, prunes empty directories, archives stale report directories after retention, and runs `git gc --auto` on managed repositories.
- It must not delete managed repository clones, secrets, active task state, or current release artifacts.

## Output expectation
A completed cycle should tell the operator what changed in the controller, which release version was used, which commit was pushed, what GitHub Actions concluded, whether `cloud/staging` was updated, and whether any autopilot configuration or docs changed.

## Recovery backup
- Recovery zip: `<USER_HOME>\Downloads\BBDevOpsAutopilot-recovery-kit.zip`
- Restore launcher: `<USER_HOME>\Downloads\BBDevOpsAutopilot-restore-from-backup.cmd`
- The recovery kit intentionally excludes the GitHub token. After restore, save a fresh token again.

## Discovery layers
- Global instructions: `<USER_HOME>\.ops\AGENTS.md`
- Manifest: `autopilot-manifest.json`
- Prompt library: `prompts\`
- Persistent docs: `docs\`
- Portable kit: `portable-kit\`
- Local Codex skill: `bbdevops-controller-autopilot`

