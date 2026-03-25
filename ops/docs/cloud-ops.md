# Multi-Cloud Operations — AWS, Azure, GCP

## Principle
Each cloud provider is treated as an independent context. Never mix credentials or configurations between providers.

## Configuration Files
- AWS: `ops/config/cloud/aws/aws-config.json`
- Azure: `ops/config/cloud/azure/azure-config.json`
- GCP: `ops/config/cloud/gcp/gcp-config.json`

## Authentication Quick Reference

| Provider | CLI Login | Env Vars | GitHub Actions |
|----------|-----------|----------|----------------|
| AWS | `aws configure` or `aws sso login` | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | `aws-actions/configure-aws-credentials@v4` |
| Azure | `az login` | `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID` | `azure/login@v2` |
| GCP | `gcloud auth login` | `GOOGLE_APPLICATION_CREDENTIALS` | `google-github-actions/auth@v2` |

## Diagnostic Script
```bash
# Check auth for all providers
ops/scripts/cloud/cloud-check.sh all

# Check specific provider with resources
ops/scripts/cloud/cloud-check.sh aws resources
```

## GitHub Actions Workflow
```
Workflow: ops-cloud-diagnose.yml
Trigger: workflow_dispatch
Inputs: provider (aws|azure|gcp|all), action (auth|resources)
```

## What's Pending
- [ ] AWS account ID and credentials
- [ ] Azure subscription and service principal
- [ ] GCP project and service account
- [ ] OIDC federation for all 3 providers
- [ ] Default region/zone per provider

## Security Rules
1. **Never** commit credentials to the repo
2. **Always** use GitHub Secrets for tokens and keys
3. **Prefer** OIDC federation over long-lived keys
4. **Rotate** credentials regularly
5. **Use** least-privilege IAM policies
