# Audit Checklist

## Before Execution
- Confirm `autopilot-manifest.json` exists and points to the canonical repos.
- Confirm `state\controller-release-state.json` is writable.
- Confirm `reports\github-actions` is writable when workflow monitoring is enabled.
- Confirm the expected version source is known (`values.yaml` or explicit parameter).

## During Execution
- Verify the controller commit was created on `main`.
- Verify the persisted release state records the pushed commit and target version.
- Verify the GitHub Actions report directory was created when monitoring is enabled.
- Verify the deploy repo `values.yaml` tag is updated only after CI success.

## After Execution
- Verify `state\controller-release-state.json` ends in a clear status such as `build_failed` or `deploy_updated`.
- Verify the final controller version, commit SHA, and workflow run id can be reconstructed.
- Verify failures include the exact workflow report directory or commit that failed.
- Verify the deploy repo contains the intended `deployment.containers.tag` after successful completion.

## Handoff Minimum
- trace ID / run directory
- exact expected version
- controller commit SHA
- deploy commit or `values.yaml` diff reference
- final result
- remaining blocker, if any
- evidence files reviewed
