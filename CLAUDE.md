# Autopilot - Claude Code Instructions

## What is Autopilot
Web-only CI/CD control plane for multi-workspace, multi-agent release orchestration.
Zero local dependencies. 100% GitHub-native.

## Architecture
- **Repo**: `lucassfreiree/autopilot` (personal product / control plane)
- **State**: `autopilot-state` branch (runtime state, locks, audit, handoffs)
- **Backups**: `autopilot-backups` branch (snapshots for rollback)
- **Panel**: GitHub Pages (`panel/`)
- **Corporate repos**: Configured per workspace in `workspace.json`

## Key Files
- `schemas/` — JSON schemas for all state objects
- `contracts/` — Agent contracts (shared + per-agent)
- `.github/workflows/` — All automation workflows
- `panel/` — GitHub Pages control plane UI
- `compliance/` — Data governance policies

## Rules
1. Never store corporate code, secrets, or internal URLs in this repo
2. Always use workspace_id — never hardcode tenant/org names
3. Read workspace.json for all repo/branch/path config
4. Acquire lock before writing release state, release after
5. Write audit entry after every state mutation
6. State on `autopilot-state` is source of truth, not agent memory
7. Never use regex to edit YAML in production — use structured tools
8. Never expose secrets in commit messages or logs

## State Location
```
state/workspaces/<workspace_id>/
  workspace.json              # Workspace config
  controller-release-state.json
  agent-release-state.json
  health.json
  release-freeze.json         # Release freeze state
  locks/                      # Active locks
  audit/                      # Audit trail
  handoffs/                   # Agent handoff queue
  improvements/               # Improvement records
  approvals/                  # Release approvals
  metrics/                    # Daily metrics (YYYY-MM-DD.json)
```

## Workflows
| Workflow | Purpose |
|----------|---------|
| bootstrap.yml | Full setup (state branch, backup branch, workspace seed) |
| seed-workspace.yml | Create/update a workspace |
| health-check.yml | Hourly health validation |
| backup-state.yml | Snapshot state to backups branch |
| restore-state.yml | Rollback state from backups |
| workspace-lock-gc.yml | Clean up expired locks |
| ci-failure-analysis.yml | Analyze CI failures |
| enqueue-agent-handoff.yml | Create agent handoff |
| record-improvement.yml | Record improvements |
| release-controller.yml | Controller release template (freeze-aware) |
| release-agent.yml | Agent release template (freeze-aware) |
| release-freeze.yml | Freeze/unfreeze releases per workspace |
| release-approval.yml | Manual approval gate for releases |
| release-metrics.yml | Daily metrics collection and SLO tracking |
| alert-notify.yml | Auto-create GitHub Issues on failures |
| drift-correction.yml | Detect and auto-correct source/deploy drift |
| deploy-panel.yml | Deploy GitHub Pages panel |

## Agent Compatibility
This architecture is operable by Claude, ChatGPT, and Codex web.
See `contracts/` for per-agent instructions.
