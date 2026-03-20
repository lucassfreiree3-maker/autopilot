# Auditability Model

## Scope
This autopilot must remain reviewable after the fact even though the installed operational flow ends at the `values.yaml` tag update. The installed operational scripts now write structured evidence under `reports\audit` for:
- `prepare-controller-main.ps1`
- `refresh-managed-repos.ps1`
- `controller-release-autopilot.ps1`
- `test-controller-release-tooling.ps1`
- `preflight-controller-ci.ps1`
- `run-controller-ci-failure-probes.ps1`

## Evidence Layout
- `state\controller-release-state.json`: current lifecycle status, target version, pushed commit, workflow run id, and timestamps.
- Managed Git history in the controller and deploy repos: origin, branch, commit lineage, and the exact `values.yaml` tag promotion.
- `reports\github-actions\<controller-commit>`: workflow polling snapshots and failure evidence for monitored runs.
- `reports\ci-failure-probes\<timestamp>-<traceId>`: baseline capture, probe patches, workflow jobs, logs, error excerpts, and recommendations for controlled CI failures on temporary branches.
- `reports\audit\<timestamp>-<traceId>`: optional shared-trace directory used only by maintenance tooling that explicitly opts into the audit helper.

## Trace Propagation
When a maintenance script uses the audit helper, it propagates a shared trace through:
- `BBDEVOPS_AUDIT_TRACE_ID`
- `BBDEVOPS_AUDIT_RUN_DIR`
- `BBDEVOPS_AUDIT_ROOT`

If no script opts in, the release remains auditable through Git history, the persistent state file, and GitHub Actions report directories.

## What Is Captured
- target release version and pushed controller commit
- workflow run id and GitHub Actions report directory
- deploy promotion state in `state\controller-release-state.json`
- `values.yaml` tag change in the managed deploy repository
- controller working-tree snapshots, staged file list, and version selection events
- structured session events and artifacts under `reports\audit`
- controlled-failure probe diffs, job maps, log excerpts, and cleanup status under `reports\ci-failure-probes`

## Auditability Improvements Implemented
- persistent release state outside the disposable workspace
- managed controller and deploy clones under a fixed autopilot home
- deterministic output boundary at the deploy `values.yaml` tag update
- shared-trace support for the installed operational scripts that use `audit-utils.ps1`
- dedicated CI probe reporting on temporary branches, with remote-branch cleanup by default

## Gaps And Residual Risks
- GitHub Actions diagnostic files still live in `reports\github-actions`; the audit session records where they are, but does not copy the whole report tree into `reports\audit`.
- Existing historical runs created for removed Argo/OneDrive experiments may still exist under old report folders. They remain evidence, but are no longer part of the supported operational path.

## Review Procedure
1. Find the relevant run in `reports\audit`.
2. Open `run.json` to confirm the trace root.
3. Review the latest `session.json`, `events.jsonl`, and `artifacts\`.
4. Check `state\controller-release-state.json` for the recorded lifecycle status, version, and commit.
5. Inspect the controller and deploy repo history for the exact code and `values.yaml` change.
6. Review `reports\github-actions` for workflow polling output and failure evidence.
