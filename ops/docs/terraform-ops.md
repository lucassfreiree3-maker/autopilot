# Terraform & Terragrunt Operations

## Directory Structure
```
ops/terraform/
  modules/           # Reusable modules
  environments/
    dev/             # Dev environment
    staging/         # Staging environment
    production/      # Production environment
  global/            # Global resources (IAM, DNS)
```

## Key Files
- Config: `ops/config/terraform/terraform-config.json`
- Script: `ops/scripts/terraform/tf-ops.sh`
- Module template: `ops/templates/terraform/module-template/`
- Backend template: `ops/templates/terraform/backend-s3.tf`

## Common Operations
```bash
# Validate configuration
ops/scripts/terraform/tf-ops.sh validate ./path

# Run plan
ops/scripts/terraform/tf-ops.sh plan ./path

# Check formatting
ops/scripts/terraform/tf-ops.sh fmt ./path

# Detect drift
ops/scripts/terraform/tf-ops.sh drift ./path

# List state resources
ops/scripts/terraform/tf-ops.sh state-list ./path
```

## GitHub Actions Workflow
```
Workflow: ops-tf-plan.yml
Trigger: workflow_dispatch
Inputs: path, action (plan|validate|fmt-check|drift)
```

## State Backend (Pending)
State backend must be configured before first apply:
- **AWS**: S3 bucket + DynamoDB table for locking
- **Azure**: Blob Storage container
- **GCP**: GCS bucket

## Conventions
- Pin provider versions (`~> 5.0` not `>= 5.0`)
- Always use `locals` for common tags
- Always run `terraform fmt` before commit
- Module naming: lowercase, hyphens (e.g., `vpc-module`)
- Variable naming: snake_case (e.g., `instance_type`)

## What's Pending
- [ ] State backend configuration
- [ ] Cloud provider credentials
- [ ] First module creation
- [ ] Environment variable files
- [ ] CI/CD pipeline for plan on PR / apply on merge
