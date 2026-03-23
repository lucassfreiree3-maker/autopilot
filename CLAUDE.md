# Autopilot - Claude Code Instructions

## What is Autopilot
Web-only CI/CD control plane for multi-workspace, multi-agent release orchestration.
Zero local dependencies. 100% GitHub-native.

## Architecture
- **Repo**: `lucassfreiree/autopilot` (personal product / control plane)
- **State**: `autopilot-state` branch (runtime state, locks, audit, handoffs)
- **Backups**: `autopilot-backups` branch (snapshots for rollback)
- **Panel**: GitHub Pages (`panel/`) — deployed via `deploy-panel.yml`
- **Corporate repos**: Configured per workspace in `workspace.json`

## Key Files
- `schemas/` — JSON schemas for all state objects (release-state, health, lock, audit, etc.)
- `contracts/` — Agent contracts (shared + per-agent)
- `.github/workflows/` — All automation workflows
- `panel/` — GitHub Pages control plane UI
- `compliance/` — Data governance policies
- `trigger/` — Trigger input files for workflow dispatch (bumping `run` field triggers the workflow)
- `integrations/` — External tool integrations (LangChain, Kubernetes, n8n)

## Integrations (all zero-cost, open-source)

### LangChain (`integrations/langchain/`)
Intelligent agent orchestration replacing rigid shell-script decision trees.
- `orchestrator.py` — Main LangChain agent with tool-calling loop
- `tools.py` — Custom tools (read state, trigger workflows, create handoffs)
- `memory.py` — RAG memory from autopilot-state branch
- Workflow: `langchain-orchestrator.yml` (runs in GitHub Actions)
- Tasks: `analyze-ci-failure`, `smart-release`, `triage-handoff`, `health-response`

### Kubernetes (`integrations/kubernetes/`)
K8s manifests for self-hosted infrastructure (deploy on any free cluster).
- `namespace.yml` — Workspace namespace + resource quotas
- `runner-deployment.yml` — Self-hosted GitHub Actions runner
- `cronjobs.yml` — Health check, improvement scan, backup, lock GC
- `kustomization.yml` — Deploy all: `kubectl apply -k integrations/kubernetes/`

### n8n (`integrations/n8n/`)
Visual automation and external integrations (100% self-hosted, open-source).
- `docker-compose.yml` — Run locally: `docker compose up -d`
- `workflows/ci-failure-alert.json` — CI failure → Slack + auto-fix
- `workflows/release-notify.json` — Release complete → Slack
- `workflows/health-monitor.json` — Periodic health → alert if degraded
- `workflows/approval-gate.json` — Interactive Slack approval for releases

## Rules
1. Never store corporate code, secrets, or internal URLs in this repo
2. Always use workspace_id — never hardcode tenant/org names
3. Read workspace.json for all repo/branch/path config
4. Acquire lock before writing release state, release after
5. Write audit entry after every state mutation
6. State on `autopilot-state` is source of truth, not agent memory
7. Never use regex to edit YAML in production — use structured tools
8. Never expose secrets in commit messages or logs
9. Always validate jq output with fallbacks: `jq -r '.field // ""' 2>/dev/null || echo ""`
10. Use base64 encoding when passing content between workflow jobs (avoids shell quoting issues)

## State Location
```
state/workspaces/<workspace_id>/
  workspace.json              # Workspace config (repos, branches, paths)
  controller-release-state.json
  agent-release-state.json
  health.json
  release-freeze.json         # Release freeze state
  locks/
    session-lock.json          # Multi-agent session lock
    <operation>-lock.json      # Per-operation locks (TTL-based)
  audit/
    <operation>-<timestamp>.json  # Immutable audit entries
  handoffs/                    # Agent handoff queue
  improvements/                # Improvement records
  approvals/                   # Release approvals
  metrics/
    YYYY-MM-DD.json            # Daily metrics snapshots
```

## Workflows

### Core Operations
| Workflow | Purpose |
|----------|---------|
| bootstrap.yml | Full setup (state branch, backup branch, workspace seed) |
| seed-workspace.yml | Create/update a workspace |
| health-check.yml | Hourly health validation |
| backup-state.yml | Snapshot state to backups branch |
| restore-state.yml | Rollback state from backups |
| workspace-lock-gc.yml | Clean up expired locks |

### Release Management
| Workflow | Purpose |
|----------|---------|
| release-controller.yml | Controller release template (freeze-aware) |
| release-agent.yml | Agent release template (freeze-aware) |
| release-freeze.yml | Freeze/unfreeze releases per workspace |
| release-approval.yml | Manual approval gate for releases |
| release-metrics.yml | Daily metrics collection and SLO tracking |

### Source Code Operations
| Workflow | Purpose |
|----------|---------|
| apply-source-change.yml | Apply code changes to corporate repos (7-stage pipeline) |
| fix-corporate-ci.yml | Auto-fix lint errors in corporate repos |
| fix-and-validate.yml | Fix both repos + trigger full flow validation |
| drift-correction.yml | Detect and auto-correct source/deploy drift |

### Testing & Validation
| Workflow | Purpose |
|----------|---------|
| test-full-flow.yml | Full integration test (controller + agent + CAP) |
| test-corporate-flow.yml | Corporate flow test |

### Continuous Improvement
| Workflow | Purpose |
|----------|---------|
| continuous-improvement.yml | Weekly self-analysis: scan → auto-fix → learn → alert (6-stage pipeline) |

### Infrastructure
| Workflow | Purpose |
|----------|---------|
| sync-copilot-prompt.yml | Auto-regenerates Copilot prompt when project changes |
| session-guard.yml | Multi-agent lock acquisition and release |
| ci-failure-analysis.yml | Analyze CI failures with diagnostics |
| alert-notify.yml | Auto-create GitHub Issues on failures |
| agent-sync.yml | Sync agent state between Claude and ChatGPT |
| cleanup-branches.yml | Clean up stale/merged branches |
| deploy-panel.yml | Deploy GitHub Pages panel |
| enqueue-agent-handoff.yml | Create agent handoff |
| record-improvement.yml | Record improvements |
| langchain-orchestrator.yml | Intelligent agent orchestration via LangChain + Claude |
| check-repo-access.yml | Validate BBVINET_TOKEN access to corporate repos |
| ci-diagnose.yml | Diagnose CI failures with detailed analysis |
| fetch-files.yml | Fetch files from corporate repos using BBVINET_TOKEN |

### Trigger Files
| File | Triggers Workflow |
|------|-------------------|
| `trigger/source-change.json` | apply-source-change.yml |
| `trigger/full-test.json` | test-full-flow.yml |
| `trigger/e2e-test.json` | test-corporate-flow.yml |
| `trigger/agent-sync.json` | agent-sync.yml |
| `trigger/fix-and-validate.json` | fix-and-validate.yml |
| `trigger/improvement.json` | continuous-improvement.yml |
| `trigger/ci-diagnose.json` | ci-diagnose.yml |
| `trigger/fetch-files.json` | fetch-files.yml |
| `trigger/fix-ci.json` | fix-corporate-ci.yml |

## apply-source-change Pipeline (7 Stages)
```
1.   Setup          → Read workspace config
1.5  Session Guard  → Acquire lock (blocks if another agent active)
2.   Apply & Push   → Clone → Apply change → Fix lint → Push
3.   CI Gate        → Wait CI + Smart comparison (pre-existing detection)
4.   Promote        → Update CAP values.yaml
5.   Save State     → Record on autopilot-state
6.   Audit          → Audit trail + Release lock
```

## Continuous Improvement Pipeline (6 Stages)
```
1. Setup     → Read config + previous improvement report
2. Analyze   → Scan workflows, schemas, contracts, state for issues
3. Auto-Fix  → Apply fixes for auto-fixable issues (locks, schemas, triggers)
4. Learn     → Record report, calculate trends (improving/degrading/stable)
5. Alert     → Create GitHub Issue if critical issues or score drops
6. Audit     → Record in audit trail
```

**Health Score**: 0-100, deducts points per severity (critical=-20, high=-10, medium=-3, low=-1)

**Trend tracking**: Compares current score vs previous report. Stores both `latest-report.json` (overwritten) and `report-{timestamp}.json` (historical).

**Auto-fixable issues**: Expired locks, missing schemaVersion, outdated contract versions.

**Runs**: Weekly (Monday 06:00 UTC) + on demand + via trigger file.

## Multi-Agent Safety (CRITICAL)
Multiple agents (Claude Code, Codex) may share the same GitHub account.
To prevent conflicts:

1. **Session Guard**: All state-changing workflows MUST call `session-guard.yml` first
2. **Lock before write**: Acquire session lock before modifying corporate repos or state
3. **Agent identification**: Every commit must identify the agent (claude-code or codex)
4. **Protected repos**: NEVER modify these without session lock:
   - Corporate source repos (agent, controller)
   - CAP/deploy repos
   - `autopilot-state` branch
5. **Concurrent protection**: If another agent holds a lock, WAIT or ABORT — never force

### Protected Operations
| Operation | Requires Lock | Agent Must Identify |
|-----------|:---:|:---:|
| Push to corporate repo | Yes | Yes |
| Modify state branch | Yes | Yes |
| Promote to CAP | Yes | Yes |
| Seed workspace | Yes | Yes |
| Backup/restore state | Yes | Yes |
| Freeze/unfreeze releases | Yes | Yes |
| Read workspace config | No | No |
| Run health check | No | No |
| Read audit/metrics | No | No |
| View panel | No | No |

## Error Handling Standards
- Always add `2>/dev/null || echo "fallback"` to jq calls
- Use `set -euo pipefail` at start of all scripts
- Log warnings with `echo "::warning ::"` for non-fatal issues
- Log errors with `echo "::error ::"` for fatal issues
- Never silently swallow errors with `|| true` — always log first

## Session Startup (IMPORTANT — Run at every new session)
Every new Claude Code session MUST:
1. **Check corporate repo access**: Trigger `check-repo-access.yml` workflow (via workflow_dispatch or push) to validate `BBVINET_TOKEN` has access to all corporate repos (`agent`, `controller`, `CAP`).
2. **Read workspace config**: Load `state/workspaces/ws-default/workspace.json` to understand current workspace setup.
3. **Check active locks**: Verify no other agent holds a session lock before performing state-changing operations.

### Workflow: check-repo-access.yml
| Trigger | Secret Used | Repos Checked |
|---------|-------------|---------------|
| `workflow_dispatch` or push to `main` (self-path) | `BBVINET_TOKEN` | `bbvinet/psc-sre-automacao-agent`, `bbvinet/psc-sre-automacao-controller`, `bbvinet/psc_releases_cap_sre-aut-agent` |

### Repository Secrets Available
| Secret | Purpose |
|--------|---------|
| `BBVINET_TOKEN` | PAT with access to corporate repos (bbvinet org) |
| `RELEASE_TOKEN` | Token for release operations |
| `OPENAI_API_KEY` | OpenAI API key for LangChain orchestrator |

### Auto-Mapping for Future Sessions (MANDATORY — No user intervention required)
Claude Code MUST automatically and proactively keep this file (CLAUDE.md) up to date. This is NOT optional and does NOT require the user to ask.

**At session start:**
1. Scan `.github/workflows/` for any workflow NOT listed in the Workflows tables above — if found, add it immediately.
2. Scan `trigger/` for any trigger file NOT listed in the Trigger Files table — if found, add it immediately.
3. Scan `integrations/` for any new integration NOT documented — if found, add it immediately.
4. Check repository secrets/variables referenced in workflows against the "Repository Secrets Available" table — if missing, flag and add.

**During the session:**
- Whenever a new workflow, trigger file, secret, integration, schema, contract, or operational procedure is created or discovered, update CLAUDE.md **in the same commit or immediately after** — do NOT wait until session end.
- Whenever existing documentation is found to be outdated or incomplete, fix it immediately.

**Before session end:**
- Do a final scan to confirm all new items created during the session are mapped. Commit any missing updates.

**Rule**: If it exists in the repo but not in CLAUDE.md, it is a bug. Fix it automatically without asking.

## Agent Compatibility
This architecture is operable by Claude, ChatGPT, Codex, and GitHub Copilot.
See `contracts/` for per-agent instructions.

| Agent | Contract | Prompt File | Primary Role |
|-------|----------|-------------|--------------|
| Claude Code | `contracts/claude-agent-contract.json` | `CLAUDE.md` | Architecture, workflows, complex implementations |
| Codex | `contracts/codex-agent-contract.json` | — | Code implementation, refactoring, bulk changes |
| ChatGPT | `contracts/chatgpt-agent-contract.json` | — | Documentation, triage, handoff consumption |
| **Copilot** | `contracts/copilot-agent-contract.json` | `.github/copilot-instructions.md` | Dispatch, review, coordination between agents |
