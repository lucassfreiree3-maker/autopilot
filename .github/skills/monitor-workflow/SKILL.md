---
name: monitor-workflow
description: Monitor GitHub Actions workflow runs and corporate CI pipeline status after deploy.
---

# Monitor Workflow Skill

## When to use
- After merging a deploy PR (apply-source-change should auto-trigger)
- Checking status of any running workflow
- Verifying corporate CI (Esteira de Build NPM) result

## Monitor apply-source-change (7 stages)

### Check if workflow triggered
```
list_commits(sha: "autopilot-state", per_page: 5)
→ Look for: "lock: session claude-code" or "lock: session copilot"
→ This means Stage 1.5 (Session Guard) started
```

### Check workflow progress via audit trail
```
list_commits(sha: "autopilot-state", per_page: 10)
→ "state: controller source-change -> X.Y.Z" = Stage 5 completed
→ "audit: source-change" = Stage 6 completed
→ "lock: session released" = Lock freed
```

### Check release state for final result
```
get_file_contents(
  path: "state/workspaces/ws-default/controller-release-state.json",
  branch: "autopilot-state"
)
→ status: "promoted" = SUCCESS (CI passed + CAP updated)
→ status: "ci-failed" = CI FAILED (need auto-fix)
→ promoted: true = Tag updated in CAP values.yaml
```

## Monitor Corporate CI separately

CRITICAL: apply-source-change SUCCESS ≠ deploy complete!
The corporate Esteira de Build NPM runs INDEPENDENTLY.

### Timing reference
- CI FAILS fast: ~3-5 minutes (test/lint error)
- CI PASSES: ~12-15 minutes (full build + Docker image)
- CI PUBLISH fails: ~14+ minutes (build OK but tag duplicate)

### If CI failed: use fix-ci-failure skill

## Show progress to user
```
## Workflow: apply-source-change

[x] Stage 1: Setup (controller, vX.Y.Z)
[x] Stage 1.5: Session Guard (lock acquired)
[x] Stage 2: Apply & Push (SHA: abc1234)
[~] Stage 3: CI Gate (waiting corporate CI...)
[ ] Stage 4: Promote (update CAP values.yaml)
[ ] Stage 5: Save State
[ ] Stage 6: Audit + Release Lock
```

## Full docs: ops/docs/deploy-process/08-monitor-autopilot-workflow.md
