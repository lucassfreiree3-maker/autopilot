# Terraform Infrastructure

## Structure
```
terraform/
  modules/                    # Reusable modules
  environments/
    dev/                      # Development (lowest risk)
    staging/                  # Pre-production
    production/               # Production (highest protection)
  global/                     # Shared resources (IAM, DNS)
```

## Getting Started

1. **Configure backend**: Copy template from `ops/templates/terraform/backend-s3.tf`
2. **Set credentials**: Configure cloud auth (see `ops/config/cloud/`)
3. **Create module**: Copy from `ops/templates/terraform/module-template/`
4. **Plan**: `ops/scripts/terraform/tf-ops.sh plan <path>`
5. **Apply**: `ops/scripts/terraform/tf-ops.sh apply <path>`

## Conventions
- Always pin provider versions
- Always use remote state with locking
- Always tag resources with `ManagedBy=terraform`
- Always run `terraform fmt` before commit
- Review plan output before apply

## CI/CD
Use `ops-tf-plan.yml` workflow for automated plan on PR.
