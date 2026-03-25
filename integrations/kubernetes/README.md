# Kubernetes Integration — Autopilot

> Zero cost to create. Deploy on any free-tier K8s cluster (Oracle Cloud Free, k3s, minikube).

## What it provides
Pre-built K8s manifests for running Autopilot infrastructure:
- **Self-hosted GitHub Actions runners** — cheaper than GitHub-hosted at scale
- **CronJobs** — replace `schedule:` triggers with K8s-native scheduling
- **Namespace isolation** — each workspace gets its own namespace

## Files
| File | Purpose |
|------|---------|
| `namespace.yml` | Workspace namespace + resource quotas |
| `runner-deployment.yml` | Self-hosted GitHub Actions runner (actions-runner-controller) |
| `cronjobs.yml` | Health check + improvement scan + metrics on schedule |
| `secrets.yml` | Template for required secrets (DO NOT commit values!) |
| `kustomization.yml` | Kustomize overlay for easy deployment |

## Quick Start
```bash
# 1. Create namespace
kubectl apply -f integrations/kubernetes/namespace.yml

# 2. Create secrets (edit with real values first!)
kubectl apply -f integrations/kubernetes/secrets.yml

# 3. Deploy everything
kubectl apply -k integrations/kubernetes/
```

## Requirements
- Any Kubernetes cluster (k3s, minikube, EKS, GKE, Oracle Cloud Free)
- `kubectl` configured
- GitHub PAT with `repo` + `workflow` scopes
