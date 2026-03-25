#!/usr/bin/env bash
# =============================================================================
# alert-check.sh — Check active alerts across monitoring platforms
# Supports: Datadog, Grafana, Prometheus/Alertmanager
# Usage: ./alert-check.sh <platform> [options]
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
error()  { echo -e "${RED}[CRIT]${NC} $*"; }

check_datadog() {
  if [ -z "${DD_API_KEY:-}" ] || [ -z "${DD_APP_KEY:-}" ]; then
    warn "DD_API_KEY and DD_APP_KEY required for Datadog"
    return 1
  fi

  local dd_site="${DD_SITE:-datadoghq.com}"

  log "Fetching triggered monitors from Datadog..."
  curl -sS "https://api.$dd_site/api/v1/monitor?monitor_tags=*" \
    -H "DD-API-KEY: $DD_API_KEY" \
    -H "DD-APPLICATION-KEY: $DD_APP_KEY" | \
    jq -r '.[] | select(.overall_state != "OK") | {
      name: .name,
      state: .overall_state,
      type: .type,
      message: (.message | split("\n") | .[0]),
      tags: .tags
    }' 2>/dev/null
}

check_grafana() {
  local grafana_url="${GRAFANA_URL:-http://localhost:3000}"
  local grafana_token="${GRAFANA_TOKEN:-}"

  if [ -z "$grafana_token" ]; then
    warn "GRAFANA_TOKEN required"
    return 1
  fi

  log "Fetching firing alerts from Grafana..."
  curl -sS "$grafana_url/api/alertmanager/grafana/api/v2/alerts?active=true" \
    -H "Authorization: Bearer $grafana_token" | \
    jq -r '.[] | {
      name: .labels.alertname,
      severity: .labels.severity,
      state: .status.state,
      summary: .annotations.summary,
      starts: .startsAt
    }' 2>/dev/null
}

check_prometheus() {
  local prom_url="${PROMETHEUS_URL:-http://localhost:9090}"

  log "Fetching active alerts from Prometheus..."
  curl -sS "$prom_url/api/v1/alerts" | \
    jq -r '.data.alerts[] | select(.state == "firing") | {
      name: .labels.alertname,
      severity: .labels.severity,
      instance: .labels.instance,
      summary: .annotations.summary,
      active_since: .activeAt
    }' 2>/dev/null

  log "Fetching alerting rules..."
  curl -sS "$prom_url/api/v1/rules?type=alert" | \
    jq -r '.data.groups[].rules[] | select(.state == "firing") | {
      name: .name,
      state: .state,
      active_alerts: (.alerts | length),
      query: .query
    }' 2>/dev/null
}

check_alertmanager() {
  local am_url="${ALERTMANAGER_URL:-http://localhost:9093}"

  log "Fetching alerts from Alertmanager..."
  curl -sS "$am_url/api/v2/alerts?active=true" | \
    jq -r '.[] | {
      name: .labels.alertname,
      severity: .labels.severity,
      state: .status.state,
      starts: .startsAt,
      summary: .annotations.summary
    }' 2>/dev/null

  log "Active silences..."
  curl -sS "$am_url/api/v2/silences" | \
    jq -r '.[] | select(.status.state == "active") | {
      id: .id,
      created_by: .createdBy,
      comment: .comment,
      matchers: .matchers,
      ends: .endsAt
    }' 2>/dev/null
}

usage() {
  cat <<EOF
Usage: $(basename "$0") <platform>

Platforms:
  datadog           Check Datadog monitors (needs DD_API_KEY, DD_APP_KEY)
  grafana           Check Grafana alerts (needs GRAFANA_URL, GRAFANA_TOKEN)
  prometheus        Check Prometheus alerts (needs PROMETHEUS_URL)
  alertmanager      Check Alertmanager (needs ALERTMANAGER_URL)
  all               Check all configured platforms
EOF
}

# Main
PLATFORM="${1:-all}"

case "$PLATFORM" in
  datadog)      check_datadog ;;
  grafana)      check_grafana ;;
  prometheus)   check_prometheus ;;
  alertmanager) check_alertmanager ;;
  all)
    check_datadog 2>/dev/null || true
    check_grafana 2>/dev/null || true
    check_prometheus 2>/dev/null || true
    check_alertmanager 2>/dev/null || true
    ;;
  *) error "Unknown platform: $PLATFORM"; usage; exit 1 ;;
esac
