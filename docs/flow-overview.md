# Flow Overview

## Objective
Automate the controller and agent release cycles so the operator only needs to request the code change or trigger the managed flow.

## Persistent runtime
- `watch-and-release.ps1` is the always-on Gemini watcher for the controller release flow.
- `watch-agent-release.ps1` is the always-on Gemini watcher for the agent release flow.
- `autopilot-supervisor.ps1` keeps both watchers and the Gemini spooler alive through `services.json`.
- `agent-autosync.ps1` forwards watcher and spooler events into the canonical `ai-sync` memory consumed by Codex, Claude, and Gemini.

## Scope boundary
- The personal product repository is `https://github.com/lucassfreiree/autopilot/`.
- Do not keep canonical-only product state in `<USER_HOME>\OneDrive\AUTOMACAO`.
- If `AUTOMACAO/product-template/` exists, treat it as a disposable working export only.
- The corporate operational repositories remain under `your-org/*` and include controller, agent, deploy, and CAP mirrors.
- Do not treat the corporate repositories as part of the personal product.

## Managed repositories

### your-controller
- Source: `https://github.com/your-org/your-controller.git`
- Deploy: `https://github.com/your-org/deploy-your-controller.git`
- Source branch: `main`
- Deploy branch: `cloud/staging`
- Deploy file: `values.yaml`
- Push helpers: `push-controller-main.cmd`, `push-deploy-controller-hml.cmd`
- Tasks: `state/agent-tasks.json`
- Config: `controller-release-autopilot.json`

### your-agent
- Source: `https://github.com/your-org/your-agent.git`
- Deploy: `https://github.com/your-org/deploy-your-agent.git`
- CAP mirror: `https://github.com/your-org/cap-releases-your-agent.git`
- Source branch: `main`
- Deploy branch: `cloud/staging`
- CAP branch: `main`
- Deploy file: `values.yaml`
- CAP file: `releases/openshift/staging/deploy/values.yaml`
- Push helpers: `push-agent-main.cmd`, `push-deploy-agent-hml.cmd`, `push-cap-agent-main.cmd`
- Tasks: `state/agent-project-tasks.json`
- Config: `agent-release-autopilot.json`

When the user talks about "the controller", assume the controller pair. When the user talks about "the agent", assume the agent source plus its deploy/CAP promotion surfaces. If ambiguous, ask.

## Current fixed policy
- Controller source branch: `main`
- Controller deploy branch: `cloud/staging`
- Agent source branch: `main`
- Agent deploy branch: `cloud/staging`
- Agent CAP branch: `main`
- First commit of a cycle bumps release version
- Same-cycle fixes keep the same version
- Monitor the whole GitHub Actions run until `completed`
- The default completion point is deploy promotion; for the agent, CAP mirroring happens immediately after deploy promotion

## Controller end-to-end flow
1. Discover runtime settings from `autopilot-manifest.json`.
2. Refresh the managed repositories when needed.
3. Synchronize the canonical controller clone to `origin/main`.
4. Apply the requested controller change.
5. Bump release version on the first commit of the cycle.
6. Commit locally and push with `push-controller-main.cmd`, or run `controller-release-autopilot.cmd`.
7. Monitor the full GitHub Actions pipeline.
8. If CI fails, inspect logs, fix the problem, commit again on `main`, and push again without rebumping version.
9. When CI succeeds, update `deploy-your-controller` on `cloud/staging`, setting `deployment.containers.tag` to the same release version.
10. Persist state, reports, and diagnostics in the autopilot home.

## Agent end-to-end flow
1. Discover runtime settings from `autopilot-manifest-agent.json` and `agent-release-autopilot.json`.
2. Refresh the managed repositories when needed.
3. Synchronize the canonical agent clone to `origin/main`.
4. Apply the requested agent change.
5. Bump release version on the first commit of the cycle.
6. Commit locally and push with `push-agent-main.cmd`, or run `agent-release-autopilot.cmd`.
7. Monitor the full GitHub Actions pipeline.
8. If CI fails, inspect logs, fix the problem, commit again on `main`, and push again without rebumping version.
9. When CI succeeds, update `deploy-your-agent` on `cloud/staging`, setting `deployment.containers.tag` in `values.yaml` to the same release version.
10. Mirror the same version into `cap-releases-your-agent` by updating the image tag in `releases/openshift/staging/deploy/values.yaml` on `main`.
11. Persist state, reports, and diagnostics in the autopilot home.

## Configuration awareness
If a request changes any URL, branch, repo path, environment target, token location, deploy target, GitHub repo, or release-flow rule, update the full configuration surface consistently:
- `autopilot-manifest.json`
- `autopilot-manifest-agent.json`
- `controller-release-autopilot.json`
- `agent-release-autopilot.json`
- docs under `docs\`
- prompt library under `prompts\`
- portable kit under `portable-kit\`

## Output expectation
After a full cycle, report:
- what changed in the source repository
- the release version used
- the pushed commit SHA
- the GitHub Actions result
- whether deploy promotion was updated
- whether the agent CAP mirror was updated when applicable
- whether any autopilot configuration or docs were updated
