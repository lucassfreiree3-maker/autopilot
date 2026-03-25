# Workflow Topology & Observability Report

- Total workflows: **37**
- Workspace-aware (`workflow_dispatch.inputs.workspace_id`): **29**

## Workflows by Category

| Category | Count |
|---|---:|
| Ops | 6 |
| [Agent] | 4 |
| [Core] | 7 |
| [Corp] | 10 |
| [Infra] | 5 |
| [Release] | 5 |

## Workflow Inventory

| Workflow | File | Triggers | Jobs | Workspace | Tools/Integrations |
|---|---|---|---:|---|---|
| [Agent] CI Failure Analysis | `.github/workflows/ci-failure-analysis.yml` | workflow_dispatch | 1 | yes | github, node |
| [Agent] Enqueue Handoff | `.github/workflows/enqueue-agent-handoff.yml` | workflow_dispatch | 1 | yes | github |
| [Agent] LangChain Orchestrator | `.github/workflows/langchain-orchestrator.yml` | workflow_call, workflow_dispatch | 1 | yes | github, python |
| [Agent] Record Improvement | `.github/workflows/record-improvement.yml` | workflow_dispatch | 1 | yes | github |
| [Core] Backup: State Snapshot | `.github/workflows/backup-state.yml` | schedule, workflow_dispatch | 1 | no | github |
| [Core] Bootstrap: Full Setup | `.github/workflows/bootstrap.yml` | workflow_dispatch | 1 | yes | github |
| [Core] Health Check | `.github/workflows/health-check.yml` | schedule, workflow_dispatch | 1 | yes | github |
| [Core] Lock GC | `.github/workflows/workspace-lock-gc.yml` | schedule, workflow_dispatch | 1 | no | github |
| [Core] Restore: State Rollback | `.github/workflows/restore-state.yml` | workflow_dispatch | 1 | yes | github |
| [Core] Seed Workspace | `.github/workflows/seed-workspace.yml` | workflow_dispatch | 1 | yes | github |
| [Core] Session Guard | `.github/workflows/session-guard.yml` | workflow_call | 1 | no | github, python |
| [Corp] Agent Sync: Claude + ChatGPT | `.github/workflows/agent-sync.yml` | push, workflow_dispatch | 1 | yes | github, node, python |
| [Corp] Check: Repo Access | `.github/workflows/check-repo-access.yml` | push, workflow_dispatch | 1 | no | github, python |
| [Corp] CI: Diagnose Error Logs | `.github/workflows/ci-diagnose.yml` | push, workflow_dispatch | 1 | yes | github, node, python |
| [Corp] Deploy: Apply Source Change | `.github/workflows/apply-source-change.yml` | push, workflow_dispatch | 7 | yes | github, node, python |
| [Corp] Drift Correction | `.github/workflows/drift-correction.yml` | schedule, workflow_dispatch | 1 | yes | github |
| [Corp] Fetch: Source Files | `.github/workflows/fetch-files.yml` | push, workflow_dispatch | 1 | yes | github, python |
| [Corp] Fix: CI + Validate Full Flow | `.github/workflows/fix-and-validate.yml` | push, workflow_dispatch | 3 | yes | github, node, python |
| [Corp] Fix: CI Lint Errors | `.github/workflows/fix-corporate-ci.yml` | push, workflow_dispatch | 1 | yes | github, node, python |
| [Corp] Test: Corporate E2E Flow | `.github/workflows/test-corporate-flow.yml` | push, workflow_dispatch | 1 | yes | github, python |
| [Corp] Test: Full Flow (Controller + Agent) | `.github/workflows/test-full-flow.yml` | push, workflow_dispatch | 4 | yes | github, python |
| [Infra] Alert & Notify | `.github/workflows/alert-notify.yml` | workflow_dispatch, workflow_run | 1 | no | github |
| [Infra] Cleanup: Stale Branches | `.github/workflows/cleanup-branches.yml` | pull_request, schedule, workflow_dispatch | 2 | no | github |
| [Infra] Continuous Improvement | `.github/workflows/continuous-improvement.yml` | push, schedule, workflow_dispatch | 6 | yes | github, python |
| [Infra] Deploy Panel (GitHub Pages) | `.github/workflows/deploy-panel.yml` | push, workflow_dispatch | 1 | no | github |
| [Infra] Sync Codex Prompt | `.github/workflows/sync-codex-prompt.yml` | push, workflow_dispatch | 2 | no | github, kubernetes, python, terraform |
| [Release] Agent | `.github/workflows/release-agent.yml` | workflow_dispatch, workflow_run | 2 | yes | github |
| [Release] Approval Gate | `.github/workflows/release-approval.yml` | workflow_dispatch | 1 | yes | github |
| [Release] Controller | `.github/workflows/release-controller.yml` | workflow_dispatch, workflow_run | 2 | yes | github |
| [Release] Freeze / Unfreeze | `.github/workflows/release-freeze.yml` | workflow_dispatch | 1 | yes | github |
| [Release] Metrics | `.github/workflows/release-metrics.yml` | schedule, workflow_dispatch | 1 | yes | github |
| Ops: Check Active Alerts | `.github/workflows/ops-monitor-alerts.yml` | schedule, workflow_dispatch | 1 | yes | github |
| Ops: Cloud Diagnostics | `.github/workflows/ops-cloud-diagnose.yml` | workflow_dispatch | 1 | yes | cloud-aws, cloud-azure, cloud-gcp, github |
| Ops: K8s Cluster Health | `.github/workflows/ops-k8s-health.yml` | workflow_dispatch | 1 | yes | cloud-aws, cloud-azure, cloud-gcp, github, kubernetes |
| Ops: Pipeline Diagnostics | `.github/workflows/ops-pipeline-diagnose.yml` | workflow_dispatch | 1 | yes | github, python |
| Ops: Terraform Plan | `.github/workflows/ops-tf-plan.yml` | workflow_dispatch | 1 | yes | github, terraform |
| Ops: Workflow Observability Report | `.github/workflows/ops-workflow-observability.yml` | schedule, workflow_dispatch | 1 | yes | github, python |

## Notes

- This report is read-only and does not alter any workflow behavior.
- Use this inventory to spot low-visibility flows, missing workspace context, and integration concentration.
