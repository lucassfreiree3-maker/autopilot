# =============================================================================
# Staging Environment — Terraform Configuration
# Status: Placeholder — configure backend and provider when ready
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  # backend "s3" {
  #   bucket         = "terraform-state-ACCOUNT_ID"
  #   key            = "autopilot/staging/terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  #   dynamodb_table = "terraform-locks"
  # }
}

variable "environment" {
  default = "staging"
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
