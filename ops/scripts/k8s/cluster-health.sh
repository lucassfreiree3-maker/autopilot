#!/usr/bin/env bash
# =============================================================================
# cluster-health.sh — Kubernetes cluster health check
# Usage: ./cluster-health.sh [namespace] [--all-namespaces]
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

NS="${1:---all-namespaces}"
NS_FLAG=""
if [ "$NS" = "--all-namespaces" ] || [ "$NS" = "-A" ]; then
  NS_FLAG="--all-namespaces"
else
  NS_FLAG="-n $NS"
fi

header "Cluster Info"
kubectl cluster-info 2>/dev/null | head -3 || error "Cannot connect to cluster"

header "Node Status"
kubectl get nodes -o wide 2>/dev/null || error "Cannot list nodes"

header "Node Conditions"
kubectl get nodes -o json 2>/dev/null | jq -r '
  .items[] |
  .metadata.name as $name |
  .status.conditions[] |
  select(.status != "False" and .type != "Ready") |
  "\($name): \(.type)=\(.status) (\(.reason))"
' 2>/dev/null | while read -r line; do
  warn "$line"
done

header "Node Resources"
kubectl top nodes 2>/dev/null || warn "metrics-server not available"

header "Pod Status (Non-Running)"
kubectl get pods $NS_FLAG -o wide 2>/dev/null | grep -v "Running\|Completed\|NAME" | head -30 || ok "All pods running"

header "Pod Restart Counts (>3)"
kubectl get pods $NS_FLAG -o json 2>/dev/null | jq -r '
  .items[] |
  .metadata.namespace as $ns |
  .metadata.name as $name |
  .status.containerStatuses[]? |
  select(.restartCount > 3) |
  "\($ns)/\($name): \(.name) restarts=\(.restartCount)"
' 2>/dev/null | while read -r line; do
  warn "$line"
done

header "Recent Events (Warnings)"
kubectl get events $NS_FLAG --sort-by='.lastTimestamp' --field-selector type=Warning 2>/dev/null | tail -20

header "PVC Status"
kubectl get pvc $NS_FLAG 2>/dev/null | grep -v "Bound\|NAME" | head -10 || ok "All PVCs bound"

header "Services Without Endpoints"
kubectl get endpoints $NS_FLAG -o json 2>/dev/null | jq -r '
  .items[] |
  select((.subsets // []) | length == 0) |
  "\(.metadata.namespace)/\(.metadata.name): NO ENDPOINTS"
' 2>/dev/null | while read -r line; do
  warn "$line"
done

header "Resource Quotas"
kubectl get resourcequotas $NS_FLAG 2>/dev/null || log "No resource quotas found"

header "Summary"
TOTAL_PODS=$(kubectl get pods $NS_FLAG --no-headers 2>/dev/null | wc -l)
RUNNING_PODS=$(kubectl get pods $NS_FLAG --no-headers 2>/dev/null | grep -c "Running" || true)
FAILED_PODS=$(kubectl get pods $NS_FLAG --no-headers 2>/dev/null | grep -cE "Error|CrashLoop|Failed|ImagePull" || true)
NODES_READY=$(kubectl get nodes --no-headers 2>/dev/null | grep -c " Ready" || true)
NODES_TOTAL=$(kubectl get nodes --no-headers 2>/dev/null | wc -l)

echo "Nodes:  $NODES_READY/$NODES_TOTAL ready"
echo "Pods:   $RUNNING_PODS/$TOTAL_PODS running"
[ "$FAILED_PODS" -gt 0 ] && error "Failed pods: $FAILED_PODS" || ok "No failed pods"
