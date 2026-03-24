# =============================================================================
# Dev Environment — Terraform Configuration
# Status: Placeholder — configure backend and provider when ready
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  # Uncomment and configure backend when state bucket is ready:
  # backend "s3" {
  #   bucket         = "terraform-state-ACCOUNT_ID"
  #   key            = "autopilot/dev/terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  #   dynamodb_table = "terraform-locks"
  # }

  required_providers {
    # Uncomment the provider(s) you need:
    # aws = {
    #   source  = "hashicorp/aws"
    #   version = "~> 5.0"
    # }
    # azurerm = {
    #   source  = "hashicorp/azurerm"
    #   version = "~> 3.0"
    # }
    # google = {
    #   source  = "hashicorp/google"
    #   version = "~> 5.0"
    # }
  }
}

variable "environment" {
  default = "dev"
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

# Add resources here when ready
