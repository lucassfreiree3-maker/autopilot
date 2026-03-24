#!/usr/bin/env bash
# =============================================================================
# diagnose.sh — Universal troubleshooting diagnostic script
# Usage: ./diagnose.sh <target> [options]
# Targets: service, pod, pipeline, endpoint, dns, cert, connectivity
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${SCRIPT_DIR}/../../logs"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
REPORT_FILE="${LOG_DIR}/diag-${TIMESTAMP}.log"

mkdir -p "$LOG_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()    { echo -e "${BLUE}[INFO]${NC} $*" | tee -a "$REPORT_FILE"; }
warn()   { echo -e "${YELLOW}[WARN]${NC} $*" | tee -a "$REPORT_FILE"; }
error()  { echo -e "${RED}[ERROR]${NC} $*" | tee -a "$REPORT_FILE"; }
ok()     { echo -e "${GREEN}[OK]${NC} $*" | tee -a "$REPORT_FILE"; }
header() { echo -e "\n${BLUE}═══════════════════════════════════════${NC}" | tee -a "$REPORT_FILE"
           echo -e "${BLUE} $*${NC}" | tee -a "$REPORT_FILE"
           echo -e "${BLUE}═══════════════════════════════════════${NC}" | tee -a "$REPORT_FILE"; }

usage() {
  cat <<EOF
Usage: $(basename "$0") <target> [options]

Targets:
  service <name> [namespace]     Diagnose a Kubernetes service
  pod <name> [namespace]         Diagnose a specific pod
  pipeline <url>                 Diagnose a CI/CD pipeline run
  endpoint <url>                 Diagnose an HTTP endpoint
  dns <domain>                   Diagnose DNS resolution
  cert <domain>                  Diagnose TLS certificate
  connectivity <host> <port>     Diagnose network connectivity
  node <name>                    Diagnose a Kubernetes node
  system                         Diagnose local system health

Options:
  --verbose                      Show detailed output
  --json                         Output in JSON format

Report saved to: $REPORT_FILE
EOF
}

diagnose_endpoint() {
  local url="$1"
  header "Endpoint Diagnosis: $url"

  log "Testing HTTP connectivity..."
  if curl -sS -o /dev/null -w "HTTP %{http_code} | Time: %{time_total}s | DNS: %{time_namelookup}s | Connect: %{time_connect}s | TLS: %{time_appconnect}s\n" \
    --max-time 30 "$url" 2>&1 | tee -a "$REPORT_FILE"; then
    ok "Endpoint reachable"
  else
    error "Endpoint unreachable (exit code: $?)"
  fi

  log "Checking DNS resolution..."
  local domain
  domain=$(echo "$url" | sed -E 's|https?://([^/:]+).*|\1|')
  if command -v dig &>/dev/null; then
    dig +short "$domain" 2>&1 | tee -a "$REPORT_FILE"
  elif command -v nslookup &>/dev/null; then
    nslookup "$domain" 2>&1 | tee -a "$REPORT_FILE"
  fi

  log "Checking TLS certificate..."
  if echo | openssl s_client -connect "${domain}:443" -servername "$domain" 2>/dev/null | openssl x509 -noout -dates -subject 2>&1 | tee -a "$REPORT_FILE"; then
    ok "TLS certificate valid"
  else
    warn "Could not retrieve TLS certificate"
  fi
}

diagnose_pod() {
  local name="$1"
  local ns="${2:-default}"
  header "Pod Diagnosis: $name (namespace: $ns)"

  log "Pod status..."
  kubectl get pod "$name" -n "$ns" -o wide 2>&1 | tee -a "$REPORT_FILE"

  log "Pod events..."
  kubectl get events -n "$ns" --field-selector "involvedObject.name=$name" --sort-by='.lastTimestamp' 2>&1 | tail -20 | tee -a "$REPORT_FILE"

  log "Pod describe (conditions + containers)..."
  kubectl describe pod "$name" -n "$ns" 2>&1 | grep -A 50 "Conditions:" | head -60 | tee -a "$REPORT_FILE"

  log "Container logs (last 50 lines)..."
  kubectl logs "$name" -n "$ns" --tail=50 2>&1 | tee -a "$REPORT_FILE" || warn "Could not fetch logs"

  log "Previous container logs (if restarted)..."
  kubectl logs "$name" -n "$ns" --previous --tail=30 2>&1 | tee -a "$REPORT_FILE" || true
}

diagnose_service() {
  local name="$1"
  local ns="${2:-default}"
  header "Service Diagnosis: $name (namespace: $ns)"

  log "Service details..."
  kubectl get svc "$name" -n "$ns" -o wide 2>&1 | tee -a "$REPORT_FILE"

  log "Endpoints..."
  kubectl get endpoints "$name" -n "$ns" 2>&1 | tee -a "$REPORT_FILE"

  log "Pods backing the service..."
  local selector
  selector=$(kubectl get svc "$name" -n "$ns" -o jsonpath='{.spec.selector}' 2>/dev/null | jq -r 'to_entries | map(.key + "=" + .value) | join(",")' 2>/dev/null || echo "")
  if [ -n "$selector" ]; then
    kubectl get pods -n "$ns" -l "$selector" -o wide 2>&1 | tee -a "$REPORT_FILE"
  else
    warn "Could not determine pod selector"
  fi
}

diagnose_dns() {
  local domain="$1"
  header "DNS Diagnosis: $domain"

  for tool in dig nslookup host; do
    if command -v "$tool" &>/dev/null; then
      log "Using $tool..."
      case "$tool" in
        dig)  dig "$domain" +trace 2>&1 | tee -a "$REPORT_FILE" ;;
        nslookup) nslookup "$domain" 2>&1 | tee -a "$REPORT_FILE" ;;
        host) host -v "$domain" 2>&1 | tee -a "$REPORT_FILE" ;;
      esac
      break
    fi
  done
}

diagnose_connectivity() {
  local host="$1"
  local port="$2"
  header "Connectivity Diagnosis: $host:$port"

  log "TCP connection test..."
  if timeout 10 bash -c "echo > /dev/tcp/$host/$port" 2>/dev/null; then
    ok "Port $port is open on $host"
  else
    error "Port $port is closed or unreachable on $host"
  fi

  log "Traceroute..."
  if command -v traceroute &>/dev/null; then
    traceroute -m 15 "$host" 2>&1 | tee -a "$REPORT_FILE"
  elif command -v tracepath &>/dev/null; then
    tracepath "$host" 2>&1 | head -20 | tee -a "$REPORT_FILE"
  fi
}

diagnose_node() {
  local name="$1"
  header "Node Diagnosis: $name"

  log "Node status..."
  kubectl get node "$name" -o wide 2>&1 | tee -a "$REPORT_FILE"

  log "Node conditions..."
  kubectl get node "$name" -o jsonpath='{range .status.conditions[*]}{.type}: {.status} ({.reason}){"\n"}{end}' 2>&1 | tee -a "$REPORT_FILE"

  log "Resource usage..."
  kubectl top node "$name" 2>&1 | tee -a "$REPORT_FILE" || warn "metrics-server not available"

  log "Pods on node..."
  kubectl get pods --all-namespaces --field-selector "spec.nodeName=$name" -o wide 2>&1 | tee -a "$REPORT_FILE"
}

diagnose_system() {
  header "System Health Diagnosis"

  log "OS info..."
  uname -a 2>&1 | tee -a "$REPORT_FILE"

  log "Disk usage..."
  df -h 2>&1 | tee -a "$REPORT_FILE"

  log "Memory..."
  free -h 2>&1 | tee -a "$REPORT_FILE"

  log "CPU load..."
  uptime 2>&1 | tee -a "$REPORT_FILE"

  log "Top processes by CPU..."
  ps aux --sort=-%cpu 2>/dev/null | head -10 | tee -a "$REPORT_FILE"

  log "Top processes by memory..."
  ps aux --sort=-%mem 2>/dev/null | head -10 | tee -a "$REPORT_FILE"

  log "Available tools..."
  for tool in kubectl helm terraform terragrunt docker aws az gcloud python3 node jq yq curl git; do
    if command -v "$tool" &>/dev/null; then
      local ver
      ver=$("$tool" --version 2>/dev/null | head -1 || echo "installed")
      ok "$tool: $ver"
    else
      warn "$tool: not found"
    fi
  done
}

# Main
if [ $# -lt 1 ]; then
  usage
  exit 1
fi

TARGET="$1"
shift

case "$TARGET" in
  endpoint)     diagnose_endpoint "$@" ;;
  pod)          diagnose_pod "$@" ;;
  service)      diagnose_service "$@" ;;
  dns)          diagnose_dns "$@" ;;
  connectivity) diagnose_connectivity "$@" ;;
  node)         diagnose_node "$@" ;;
  cert)         diagnose_endpoint "https://$1" ;;
  system)       diagnose_system ;;
  *)            error "Unknown target: $TARGET"; usage; exit 1 ;;
esac

echo ""
log "Report saved to: $REPORT_FILE"
