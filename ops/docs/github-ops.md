# GitHub & GitHub Actions — Operational Guide

## Repository Role
`lucassfreiree/autopilot` is the central control plane. All automation runs via GitHub Actions.

## Branch Strategy
- `main` — protected, requires PR + squash merge
- `claude/*` — agent working branches (auto-created, auto-cleaned)
- `autopilot-state` — runtime state (locks, audit, health, releases)
- `autopilot-backups` — state snapshots for rollback

## Workflows by Category

### Operational (new — ops/)
| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ops-cloud-diagnose.yml` | manual | Multi-cloud auth check and resource listing |
| `ops-tf-plan.yml` | manual | Terraform plan/validate/drift for any module |
| `ops-k8s-health.yml` | manual | K8s cluster health check via cloud provider |
| `ops-monitor-alerts.yml` | manual + schedule (6h) | Check active alerts across monitoring platforms |
| `ops-pipeline-diagnose.yml` | manual | Cross-platform pipeline failure analysis |

### Core (existing)
See CLAUDE.md for full workflow listing.

## Secrets Required

| Secret | Status | Used By |
|--------|--------|---------|
| `RELEASE_TOKEN` | Active | State operations, checkout |
| `BBVINET_TOKEN` | Active | Getronics corporate repos |
| `CIT_TOKEN` | **Pending** | CIT corporate repos |
| `AWS_ACCESS_KEY_ID` | **Pending** | Cloud ops workflows |
| `AWS_SECRET_ACCESS_KEY` | **Pending** | Cloud ops workflows |
| `AZURE_CREDENTIALS` | **Pending** | Cloud ops workflows |
| `GCP_SA_KEY` | **Pending** | Cloud ops workflows |
| `DD_API_KEY` | **Pending** | Monitoring workflows |
| `DD_APP_KEY` | **Pending** | Monitoring workflows |
| `GRAFANA_TOKEN` | **Pending** | Monitoring workflows |
| `SLACK_WEBHOOK_URL` | **Pending** | Alert notifications |

## Variables Required

| Variable | Status | Default |
|----------|--------|---------|
| `DD_SITE` | **Pending** | datadoghq.com |
| `GRAFANA_URL` | **Pending** | — |
| `PROMETHEUS_URL` | **Pending** | — |
| `AWS_DEFAULT_REGION` | **Pending** | us-east-1 |

## Workflow Conventions
- Name: `ops-<domain>-<action>.yml`
- Always declare `permissions:` block
- Always use `concurrency:` with `cancel-in-progress: true`
- Use `workflow_dispatch` for manual operational tasks
- Upload artifacts for all diagnostic output
- Use `continue-on-error: true` for non-critical diagnostic steps

## GitHub Actions Patterns for Cloud Auth

### AWS (OIDC — recommended)
```yaml
- uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
    aws-region: us-east-1
```

### Azure (OIDC — recommended)
```yaml
- uses: azure/login@v2
  with:
    client-id: ${{ secrets.AZURE_CLIENT_ID }}
    tenant-id: ${{ secrets.AZURE_TENANT_ID }}
    subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
```

### GCP (Workload Identity — recommended)
```yaml
- uses: google-github-actions/auth@v2
  with:
    workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
    service_account: ${{ secrets.GCP_SA_EMAIL }}
```
