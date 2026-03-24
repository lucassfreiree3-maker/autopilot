#!/usr/bin/env bash
# =============================================================================
# tf-ops.sh — Terraform/Terragrunt operational wrapper
# Usage: ./tf-ops.sh <action> <path> [options]
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

TOOL="terraform"
if [ -f "terragrunt.hcl" ] || [ "${USE_TERRAGRUNT:-}" = "true" ]; then
  TOOL="terragrunt"
fi

usage() {
  cat <<EOF
Usage: $(basename "$0") <action> [path] [options]

Actions:
  plan [path]              Run plan with output saved
  apply [path]             Run apply (requires confirmation)
  destroy [path]           Run destroy (requires confirmation)
  validate [path]          Validate configuration
  fmt [path]               Format all .tf files
  state-list [path]        List resources in state
  state-show <resource>    Show specific resource in state
  drift [path]             Detect drift (plan with no changes expected)
  cost [path]              Estimate cost with infracost (if installed)
  docs [path]              Generate docs with terraform-docs (if installed)
  unlock <lock-id>         Force unlock state
  import <addr> <id>       Import existing resource

Options:
  --tg                     Force terragrunt
  --tf                     Force terraform
  --auto-approve           Skip confirmation (apply/destroy)

Detected tool: $TOOL
EOF
}

ensure_init() {
  local path="${1:-.}"
  if [ ! -d "$path/.terraform" ]; then
    log "Running $TOOL init..."
    (cd "$path" && $TOOL init -input=false 2>&1)
  fi
}

tf_plan() {
  local path="${1:-.}"
  local plan_file="$path/tfplan-$(date +%Y%m%d-%H%M%S)"
  ensure_init "$path"

  log "Running plan in $path..."
  (cd "$path" && $TOOL plan -out="$plan_file" -input=false 2>&1)
  ok "Plan saved to: $plan_file"
  echo "$plan_file"
}

tf_apply() {
  local path="${1:-.}"
  local auto_approve="${2:-}"
  ensure_init "$path"

  if [ "$auto_approve" = "--auto-approve" ]; then
    log "Applying with auto-approve in $path..."
    (cd "$path" && $TOOL apply -auto-approve -input=false 2>&1)
  else
    log "Applying in $path (interactive)..."
    (cd "$path" && $TOOL apply -input=false 2>&1)
  fi
}

tf_validate() {
  local path="${1:-.}"
  ensure_init "$path"

  log "Validating in $path..."
  if (cd "$path" && $TOOL validate 2>&1); then
    ok "Configuration is valid"
  else
    error "Configuration has errors"
    return 1
  fi
}

tf_drift() {
  local path="${1:-.}"
  ensure_init "$path"

  log "Checking for drift in $path..."
  local output
  output=$(cd "$path" && $TOOL plan -detailed-exitcode -input=false 2>&1) || {
    local exit_code=$?
    if [ $exit_code -eq 2 ]; then
      warn "DRIFT DETECTED — infrastructure has changed outside of Terraform"
      echo "$output"
      return 2
    else
      error "Plan failed"
      echo "$output"
      return 1
    fi
  }
  ok "No drift detected"
}

tf_state_list() {
  local path="${1:-.}"
  log "Listing state resources in $path..."
  (cd "$path" && $TOOL state list 2>&1)
}

tf_fmt() {
  local path="${1:-.}"
  log "Formatting .tf files in $path..."
  (cd "$path" && $TOOL fmt -recursive 2>&1)
  ok "Formatting complete"
}

# Main
if [ $# -lt 1 ]; then usage; exit 1; fi

# Parse global flags
for arg in "$@"; do
  case "$arg" in
    --tg) TOOL="terragrunt" ;;
    --tf) TOOL="terraform" ;;
  esac
done

ACTION="$1"
shift

case "$ACTION" in
  plan)       tf_plan "$@" ;;
  apply)      tf_apply "$@" ;;
  validate)   tf_validate "$@" ;;
  fmt)        tf_fmt "$@" ;;
  drift)      tf_drift "$@" ;;
  state-list) tf_state_list "$@" ;;
  state-show) (cd "${2:-.}" && $TOOL state show "$1" 2>&1) ;;
  destroy)    (cd "${1:-.}" && $TOOL destroy -input=false "$@" 2>&1) ;;
  unlock)     (cd "${2:-.}" && $TOOL force-unlock "$1" 2>&1) ;;
  import)     (cd "${3:-.}" && $TOOL import "$1" "$2" 2>&1) ;;
  docs)       terraform-docs markdown "${1:-.}" 2>&1 || warn "terraform-docs not installed" ;;
  cost)       infracost breakdown --path "${1:-.}" 2>&1 || warn "infracost not installed" ;;
  *)          error "Unknown action: $ACTION"; usage; exit 1 ;;
esac
