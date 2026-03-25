#!/usr/bin/env bash
# =============================================================================
# cloud-check.sh — Multi-cloud authentication and resource checker
# Usage: ./cloud-check.sh <provider> [action]
# Providers: aws, azure, gcp, all
# =============================================================================
set -euo pipefail

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()    { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()     { echo -e "${GREEN}[ OK ]${NC} $*"; }
warn()   { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()  { echo -e "${RED}[FAIL]${NC} $*"; }
header() { echo -e "\n${BLUE}━━━ $* ━━━${NC}"; }

check_aws() {
  header "AWS"
  if ! command -v aws &>/dev/null; then
    warn "AWS CLI not installed"
    return
  fi

  log "Identity..."
  if aws sts get-caller-identity 2>/dev/null; then
    ok "AWS authenticated"
  else
    error "AWS not authenticated"
    return
  fi

  log "Region: ${AWS_DEFAULT_REGION:-${AWS_REGION:-not set}}"

  if [ "${1:-}" = "resources" ]; then
    log "EC2 instances..."
    aws ec2 describe-instances --query 'Reservations[].Instances[].{ID:InstanceId,State:State.Name,Type:InstanceType,Name:Tags[?Key==`Name`].Value|[0]}' --output table 2>/dev/null || true

    log "EKS clusters..."
    aws eks list-clusters --output text 2>/dev/null || true

    log "S3 buckets..."
    aws s3 ls 2>/dev/null | head -20 || true

    log "RDS instances..."
    aws rds describe-db-instances --query 'DBInstances[].{ID:DBInstanceIdentifier,Engine:Engine,Status:DBInstanceStatus,Class:DBInstanceClass}' --output table 2>/dev/null || true
  fi
}

check_azure() {
  header "Azure"
  if ! command -v az &>/dev/null; then
    warn "Azure CLI not installed"
    return
  fi

  log "Account..."
  if az account show 2>/dev/null; then
    ok "Azure authenticated"
  else
    error "Azure not authenticated"
    return
  fi

  if [ "${1:-}" = "resources" ]; then
    log "Resource groups..."
    az group list --output table 2>/dev/null | head -20 || true

    log "AKS clusters..."
    az aks list --output table 2>/dev/null || true

    log "VMs..."
    az vm list --output table 2>/dev/null | head -20 || true
  fi
}

check_gcp() {
  header "GCP"
  if ! command -v gcloud &>/dev/null; then
    warn "gcloud CLI not installed"
    return
  fi

  log "Account..."
  if gcloud auth list --filter=status:ACTIVE --format='table(account,status)' 2>/dev/null; then
    ok "GCP authenticated"
  else
    error "GCP not authenticated"
    return
  fi

  log "Project: $(gcloud config get-value project 2>/dev/null || echo 'not set')"

  if [ "${1:-}" = "resources" ]; then
    log "GKE clusters..."
    gcloud container clusters list 2>/dev/null || true

    log "Compute instances..."
    gcloud compute instances list 2>/dev/null | head -20 || true
  fi
}

usage() {
  cat <<EOF
Usage: $(basename "$0") <provider> [action]

Providers: aws, azure, gcp, all
Actions:   auth (default), resources

Examples:
  $(basename "$0") all                 Check auth for all providers
  $(basename "$0") aws resources       List AWS resources
  $(basename "$0") azure auth          Check Azure authentication
EOF
}

# Main
PROVIDER="${1:-all}"
ACTION="${2:-auth}"

case "$PROVIDER" in
  aws)   check_aws "$ACTION" ;;
  azure) check_azure "$ACTION" ;;
  gcp)   check_gcp "$ACTION" ;;
  all)   check_aws "$ACTION"; check_azure "$ACTION"; check_gcp "$ACTION" ;;
  *)     error "Unknown provider: $PROVIDER"; usage; exit 1 ;;
esac
