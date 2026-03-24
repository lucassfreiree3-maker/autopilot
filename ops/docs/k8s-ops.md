# Kubernetes Operations

## Key Files
- Config: `ops/config/k8s/k8s-config.json`
- Health script: `ops/scripts/k8s/cluster-health.sh`
- Diagnose: `ops/scripts/troubleshooting/diagnose.sh pod|service <name> [ns]`
- Deployment template: `ops/templates/k8s/deployment-template.yaml`
- Runbook: `ops/runbooks/k8s/k8s-common-issues.json`

## Cluster Access
```bash
# AWS EKS
aws eks update-kubeconfig --name CLUSTER --region REGION

# Azure AKS
az aks get-credentials --resource-group RG --name CLUSTER

# GCP GKE
gcloud container clusters get-credentials CLUSTER --zone ZONE
```

## Common Operations
```bash
# Full cluster health check
ops/scripts/k8s/cluster-health.sh --all-namespaces

# Diagnose a pod
ops/scripts/troubleshooting/diagnose.sh pod POD_NAME NAMESPACE

# Diagnose a service
ops/scripts/troubleshooting/diagnose.sh service SVC_NAME NAMESPACE
```

## GitHub Actions Workflow
```
Workflow: ops-k8s-health.yml
Trigger: workflow_dispatch
Inputs: cluster, provider (aws|azure|gcp), namespace
```

## Troubleshooting Quick Reference

| Issue | First Check | Script |
|-------|-------------|--------|
| Pod CrashLoop | `kubectl logs POD -n NS --previous` | diagnose.sh pod |
| ImagePullBackOff | `kubectl describe pod POD -n NS` | diagnose.sh pod |
| Pod Pending | `kubectl describe pod POD -n NS` (events) | diagnose.sh pod |
| Service no endpoints | `kubectl get endpoints SVC -n NS` | diagnose.sh service |
| HPA not scaling | `kubectl describe hpa -n NS` | cluster-health.sh |

## What's Pending
- [ ] Cluster access credentials
- [ ] kubeconfig per cluster
- [ ] Namespace list per environment
- [ ] Helm repositories
- [ ] RBAC for automation service account
