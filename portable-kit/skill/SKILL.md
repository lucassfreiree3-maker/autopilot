---
name: bbdevops-controller-autopilot
description: Persistent local workflow for changing `your-controller` with a deterministic release cycle on `main`: sync the canonical clone, edit code, bump the release on the first commit, push, monitor the full GitHub Actions pipeline to completion, fix CI failures without rebumping the same cycle, and promote `deploy-your-controller` on `cloud/staging`. The operational flow ends at the `values.yaml` tag update. Use when the user wants controller code changes plus autonomous release/build/deploy follow-through, when the release-flow configuration itself must change, or when the persistent autopilot setup must be validated, repaired, documented, or moved to another machine.
---

# BBDevOps Controller Autopilot

## Overview
Use the persistent autopilot installation in `<SAFE_ROOT>` as the source of truth. Do not depend on `AUTOMACAO`; that workspace may be missing.

## Workflow
1. Read `<SAFE_ROOT>\autopilot-manifest.json` to discover canonical paths, repo URLs, repo web links, policy, docs, prompt library, and commands.
2. If the setup looks suspicious, run `validate-autopilot.cmd` from the autopilot home before touching code.
3. If needed, run `refresh-managed-repos.cmd` to sync the managed controller and deploy repos from their mapped clone URLs.
4. Synchronize the canonical controller clone to `origin/main` with `prepare-controller-main.cmd`.
5. Edit code only in `repos\your-controller` under the autopilot home.
6. On the first commit of a release cycle, bump the version in `package.json` and `package-lock.json`. Also align `src\swagger\swagger.json` if the UI version is displayed there.
7. Push only to `main`.
8. Monitor the full GitHub Actions run for the pushed SHA until it reaches `completed`. Keep watching through long image-build stages.
9. If CI fails, inspect the reports and the failed jobs/steps, fix the problem in the same canonical clone, commit again on `main`, and keep the same release version for that corrective cycle.
10. After CI finishes with success, update `deploy-your-controller` on branch `cloud/staging`, setting `deployment.containers.tag` in `values.yaml` to the same release version.
11. Stop the default release flow once `cloud/staging` has the updated `deployment.containers.tag`.
12. Do not add cluster-side sync, pod restart, or remote VM execution to the default installed flow.
13. Persist and reuse state from `state\controller-release-state.json` to avoid duplicate promotions or accidental reversion.

## Configuration Changes
When the user asks to change a URL, branch, target environment, repo path, token location, or any other release-flow setting, update the full configuration surface consistently:
- `autopilot-manifest.json`
- `controller-release-autopilot.json`
- `<USER_HOME>\.ops\AGENTS.md`
- docs under `docs\`
- prompt library under `prompts\`
- the portable kit under `portable-kit\`
- this skill if the behavior description changed materially

## References
- Read `references/persistent-layout.md` for durable layout, commands, and persistence rules.
- Read `references/prompt-library.md` for reusable prompt templates.
- Read `references/portability.md` for cross-machine and cross-IA usage.
