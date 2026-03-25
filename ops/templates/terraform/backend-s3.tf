# =============================================================================
# S3 Backend Template — Remote state with locking
# =============================================================================

terraform {
  backend "s3" {
    bucket         = "terraform-state-ACCOUNT_ID"
    key            = "PROJECT/ENVIRONMENT/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-locks"

    # Uncomment for assume role
    # role_arn     = "arn:aws:iam::ACCOUNT_ID:role/terraform-state-role"
  }
}
