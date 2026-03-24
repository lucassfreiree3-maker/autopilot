# =============================================================================
# Terraform Module Template
# Duplicate and adapt for each module
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# --- Data Sources ---
data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

# --- Resources ---
# Add resources here

# --- Outputs ---
output "region" {
  description = "AWS region"
  value       = data.aws_region.current.name
}
