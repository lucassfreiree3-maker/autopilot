---
name: deploy-monitor
description: Monitor active deploy pipeline and report status. Use after triggering a deploy or when user asks about deploy status.
allowed-tools: Read, Bash, Grep
---

# Deploy Monitor

Monitor the active deploy pipeline end-to-end.

## Check Autopilot Workflow
```bash
# Latest apply-source-change run
curl -s "https://api.github.com/repos/lucassfreiree/autopilot/actions/workflows/apply-source-change.yml/runs?per_page=1" | jq '{id:.workflow_runs[0].id,status:.workflow_runs[0].status,conclusion:.workflow_runs[0].conclusion,created:.workflow_runs[0].created_at}'
```

## Check Corporate CI
Read the latest ci-logs file from autopilot-state branch:
- `state/workspaces/ws-default/ci-logs-controller-*.txt` (highest job ID = newest)
- Search for: `Test Suites:`, `FAIL `, `error TS`, `VERSAO:`

## CI Timing
| Duration | Meaning | Action |
|----------|---------|--------|
| < 5 min | CI failed | Read log, diagnose, fix |
| ~14 min | CI passed | Confirm image built |
| > 30 min | Stuck | Trigger ci-diagnose |

## Report Format
```
Deploy Status:
- Component: controller/agent
- Version: X.Y.Z
- Autopilot workflow: success/running/failed
- Corporate CI: passed/failed/pending
- CAP promoted: yes/no
- Action needed: none / fix required
```
