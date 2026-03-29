# Autonomous Control Plane v1

> **Version:** 1.0.0 | **Repo:** `lucassfreiree/autopilot`

## Overview

The Autonomous Control Plane v1 operationalizes **prompt-to-operation** automation for the autopilot repository. It introduces four coordinated workflows that minimize manual gates while maintaining safety for irreversible or sensitive operations.

---

## Quickstart

### Trigger an operation via the dispatcher

```
GitHub UI → Actions → [Core] Autopilot Dispatcher → Run workflow
```

Enter your intent in Portuguese or English, e.g.:

| Intent | What happens |
|---|---|
| `implementar nova feature X` | Dispatches `codex-apply.yml` |
| `corrigir CI` | Dispatches `ci-self-heal.yml` |
| `monitorar deploy` | Dispatches `health-check.yml` |
| `promover release` | Dispatches `codex-deploy.yml` |
| `backup` | Dispatches `backup-state.yml` |

### Open a PR from an agent branch

Any PR opened from a branch named `copilot/*`, `codex/*`, or `claude/*` is automatically:
1. Labeled with `automerge` and `autonomous`
2. Configured for squash auto-merge
3. Merged automatically once all required checks pass

---

## Workflows

### A) Autonomous PR Lane — `autonomous-pr-lane.yml`

| Attribute | Value |
|---|---|
| Trigger | `pull_request_target`: opened, synchronize, reopened, labeled, ready_for_review |
| Scope | Branches: `copilot/**`, `codex/**`, `claude/**` (same-repo only, no forks) |
| Labels added | `automerge`, `autonomous` |
| Merge strategy | Squash auto-merge (enabled via GraphQL mutation) |

**How it works:**
1. Validates the PR is from the same repository (fork safety).
2. Skips draft PRs.
3. Ensures labels `automerge` and `autonomous` exist (creates them if missing).
4. Enables squash auto-merge via the GitHub GraphQL API.
5. GitHub merges automatically once all required status checks pass.

**How to disable:**
- Set the `AUTONOMOUS_PR_LANE_ENABLED` toggle to `false` in `ops/ops-config.json` (informational — for hard disable, remove the `pull_request_target` trigger or add a job-level `if` condition).

---

### B) CI Self-Heal — `ci-self-heal.yml`

| Attribute | Value |
|---|---|
| Trigger | `check_run` completed with failure/timeout; manual `workflow_dispatch` |
| Scope | Agent branches with open, unmerged PRs |
| Max attempts | 3 (configurable via `CI_SELF_HEAL_MAX_ATTEMPTS` toggle) |
| State path | `autopilot-state: state/ci-self-heal/pr-{N}/attempts` |

**Safe-fix categories (in order):**
1. **Lockfile drift** — runs `npm install --package-lock-only` and commits if `package-lock.json` changes
2. **ESLint autofix** — runs `npm run lint -- --fix` if lint script exists
3. **Prettier / formatter** — runs `npm run format` or `npx prettier --write .`

**Attempt guard:**
- Reads current attempt count from `autopilot-state`.
- Increments count after each attempt.
- After 3 failed attempts, writes a handoff record to `state/workspaces/handoffs/` on `autopilot-state` for manual/agent review.

**How to trigger manually:**
```
Actions → [Core] CI Self-Heal → Run workflow → pr_number + branch
```

**How to disable:**
- Remove the `check_run` trigger, or add `if: false` to the `gate` job.

---

### C) Post-Merge Monitor — `post-merge-monitor.yml`

| Attribute | Value |
|---|---|
| Trigger | `pull_request_target` closed (merged only) |
| Probes | State-branch accessibility, main-branch accessibility, recent failure rate |
| Audit path | `autopilot-state: state/audit/post-merge-pr{N}-{timestamp}.json` |
| Backup signal | `autopilot-backups: signals/post-merge-pr{N}-{timestamp}.json` |
| Rollback signal | `autopilot-state: state/audit/rollback-signal-pr{N}-{timestamp}.json` |

**Health check probes:**
1. `state-branch:ok/FAIL` — autopilot-state branch reachable
2. `main-branch:ok/FAIL` — main branch reachable
3. `recent-failures:ok(N)/HIGH(N)` — recent workflow failures on main (threshold: >3)

**Rollback signal:**
- Emitted when health status is `degraded`.
- Contains: PR number, merge SHA, failure details, timestamp.
- Status is `pending-review` — **destructive rollback requires manual approval** (see [Manual Gates](#manual-gates-policy)).

**How to disable:**
- Add `if: false` to the `check-merged` job.

---

### D) Autopilot Dispatcher — `autopilot-dispatcher.yml`

| Attribute | Value |
|---|---|
| Trigger | `workflow_dispatch` with `intent` (required) and `payload` (optional JSON) |
| Routing | Pattern matching on lowercased intent string |

**Route table:**

| Intent pattern | Route | Workflow |
|---|---|---|
| `implementar`, `criar`, `desenvolver`, `codificar` | codex-apply | `codex-apply.yml` |
| `corrigir ci`, `fix ci`, `self-heal`, `ci falhou` | ci-self-heal | `ci-self-heal.yml` |
| `corrigir`, `consertar`, `reparar`, `resolver` | ci-self-heal | `ci-self-heal.yml` |
| `promover release`, `promote cap`, `deploy release` | codex-deploy | `codex-deploy.yml` |
| `monitorar deploy`, `observabilidade`, `monitor` | health-observability | `health-check.yml` |
| `health check`, `verificar saude` | health-observability | `health-check.yml` |
| `backup`, `snapshot`, `salvar estado` | backup | `backup-state.yml` |
| `sincronizar agente`, `agent sync` | agent-sync | `agent-sync.yml` |
| `melhoria`, `improvement`, `melhorar` | continuous-improvement | `continuous-improvement.yml` |
| *(unrecognized)* | triage-fallback | handoff to `autopilot-state` |

**Fallback:** Unknown intents write a handoff record to `state/workspaces/handoffs/` on `autopilot-state` for agent triage.

---

## Manual Gates Policy

### Operations requiring manual human approval

| Operation | Workflow | Reason |
|---|---|---|
| Release freeze/unfreeze | `release-freeze.yml` | Blocks all autonomous deploy flows |
| Corporate release approval | `release-approval.yml` | Production release requires explicit sign-off |
| Destructive rollback | `restore-state.yml` | Irreversible without a new deploy |

These gates are reflected in `ops/ops-config.json` under `autonomousControlPlane.manualGatesPolicy.manualOnly`.

### Everything else is automated

- PR labeling and auto-merge
- CI self-healing
- Post-merge health monitoring
- Audit and backup writes
- Codex code application
- Health checks
- Continuous improvement scans

---

## Security & Permissions

| Workflow | Permissions |
|---|---|
| `autonomous-pr-lane.yml` | `contents: read`, `pull-requests: write` |
| `ci-self-heal.yml` | `contents: write`, `pull-requests: read`, `checks: read` |
| `post-merge-monitor.yml` | `contents: write`, `pull-requests: read` |
| `autopilot-dispatcher.yml` | `contents: read`, `actions: write` |

- Fork PRs are never trusted by `autonomous-pr-lane` or `post-merge-monitor`.
- `ci-self-heal` only applies to open, unmerged PRs on designated agent branches.
- `RELEASE_TOKEN` is used as a fallback for state-branch writes (falls back to `GITHUB_TOKEN` if not set).

---

## Observability

All workflows write to `GITHUB_STEP_SUMMARY` with structured tables.

Persistent artifacts:
- **Audit trail:** `autopilot-state/state/audit/`
- **Self-heal state:** `autopilot-state/state/ci-self-heal/`
- **Backup signals:** `autopilot-backups/signals/`
- **Handoffs:** `autopilot-state/state/workspaces/handoffs/`

---

## Test Plan

| Scenario | Expected behavior |
|---|---|
| Open PR from `copilot/my-feature` | Labels added, auto-merge enabled |
| Open PR from `main` or `feature/x` | No action taken |
| PR from fork | Skipped (fork safety guard) |
| Draft PR opened | Skipped; re-evaluated on `ready_for_review` |
| `check_run` fails on `codex/fix-x` | Self-heal triggered; fix committed if applicable |
| Self-heal reaches 3 attempts | Handoff written to state; no more attempts |
| PR merged into main | Post-merge monitor runs, audit written |
| Health probes fail after merge | Rollback signal emitted in audit |
| Dispatcher: `implementar nova API` | Routes to `codex-apply.yml` |
| Dispatcher: `corrigir CI do PR 42` | Routes to `ci-self-heal.yml` |
| Dispatcher: `xyz desconhecido` | Triage handoff written |

---

## Disabling a Lane

To disable any lane without deleting the workflow file, add the following condition to its first (or only) job:

```yaml
jobs:
  my-job:
    if: false   # lane disabled
```

Or use the toggle flags in `ops/ops-config.json` as documentation of intent, combined with a job-level condition that reads from a repository variable.
