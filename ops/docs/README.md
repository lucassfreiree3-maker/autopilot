# Operational Environment — Documentation

This directory contains per-tool operational documentation for agents (Claude, Codex, Copilot) and human operators.

## Structure

| Document | Tool | Purpose |
|----------|------|---------|
| [github-ops.md](github-ops.md) | GitHub & Actions | Repository operations, workflows, secrets, environments |
| [cloud-ops.md](cloud-ops.md) | AWS, Azure, GCP | Multi-cloud authentication, CLI patterns, troubleshooting |
| [terraform-ops.md](terraform-ops.md) | Terraform/Terragrunt | IaC operations, plan/apply, state management |
| [k8s-ops.md](k8s-ops.md) | Kubernetes | Cluster operations, troubleshooting, manifests |
| [ci-ops.md](ci-ops.md) | GitLab CI, Jenkins | Cross-platform pipeline operations |
| [monitoring-ops.md](monitoring-ops.md) | Datadog, Grafana, Prometheus | Observability, alerts, dashboards |
| [automation-ops.md](automation-ops.md) | Python, Shell, Node.js | Automation scripts, conventions, patterns |

## Quick Reference

```bash
# Run diagnostics
ops/scripts/troubleshooting/diagnose.sh system       # Local system
ops/scripts/troubleshooting/diagnose.sh endpoint URL  # HTTP endpoint
ops/scripts/k8s/cluster-health.sh NAMESPACE           # K8s cluster
ops/scripts/ci/analyze-pipeline.sh github REPO        # Pipeline
ops/scripts/cloud/cloud-check.sh all                  # All clouds
ops/scripts/monitoring/alert-check.sh all             # All alerts
ops/scripts/terraform/tf-ops.sh plan PATH             # Terraform plan
```

## For Agents (Claude, Codex, Copilot)

1. **Start here**: Read this README, then the relevant tool doc
2. **Configs**: `ops/config/<tool>/` — current state and pending items
3. **Scripts**: `ops/scripts/<domain>/` — executable operational tools
4. **Templates**: `ops/templates/<domain>/` — reusable bases
5. **Runbooks**: `ops/runbooks/<domain>/` — troubleshooting guides
6. **Inventory**: `ops/inventory/readiness.json` — what's ready vs pending
