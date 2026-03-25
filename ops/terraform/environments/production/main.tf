# =============================================================================
# Production Environment — Terraform Configuration
# Status: Placeholder — configure backend and provider when ready
# CAUTION: Production changes require review and approval
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  # backend "s3" {
  #   bucket         = "terraform-state-ACCOUNT_ID"
  #   key            = "autopilot/production/terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  #   dynamodb_table = "terraform-locks"
  # }
}

variable "environment" {
  default = "production"
}

variable "project" {
  default = "autopilot"
}

locals {
  common_tags = {
    Environment = var.environment
    Project     = var.project
    ManagedBy   = "terraform"
    Workspace   = "ws-cit"
  }
}
