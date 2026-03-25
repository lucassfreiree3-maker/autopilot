#!/usr/bin/env bash
# =============================================================================
# ops-logger.sh — Operational action logger
# Logs all operations to ops/logs/ops-log.jsonl for traceability
# Usage: source ops-logger.sh; ops_log "action" "description" "result" "details"
# =============================================================================

OPS_LOG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../logs"
OPS_LOG_FILE="${OPS_LOG_DIR}/ops-log.jsonl"

mkdir -p "$OPS_LOG_DIR"

ops_log() {
  local action="${1:-unknown}"
  local description="${2:-}"
  local result="${3:-info}"
  local details="${4:-}"
  local workspace="${OPS_WORKSPACE:-ws-cit}"
  local agent="${OPS_AGENT:-claude-code}"
  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  local entry
  entry=$(jq -nc \
    --arg ts "$timestamp" \
    --arg ws "$workspace" \
    --arg agent "$agent" \
    --arg action "$action" \
    --arg desc "$description" \
    --arg result "$result" \
    --arg details "$details" \
    '{
      timestamp: $ts,
      workspace: $ws,
      agent: $agent,
      action: $action,
      description: $desc,
      result: $result,
      details: $details
    }')

  echo "$entry" >> "$OPS_LOG_FILE"
  echo "$entry"
}

ops_log_start() {
  ops_log "session_start" "Operational session started" "info" "$(hostname 2>/dev/null || echo 'unknown')"
}

ops_log_end() {
  ops_log "session_end" "Operational session ended" "info" "${1:-normal}"
}

ops_log_error() {
  ops_log "$1" "$2" "error" "$3"
}

ops_log_success() {
  ops_log "$1" "$2" "success" "$3"
}

# Show recent log entries
ops_log_tail() {
  local count="${1:-20}"
  if [ -f "$OPS_LOG_FILE" ]; then
    tail -n "$count" "$OPS_LOG_FILE" | jq '.'
  else
    echo "No log entries found"
  fi
}

# Search log entries
ops_log_search() {
  local query="$1"
  if [ -f "$OPS_LOG_FILE" ]; then
    grep -i "$query" "$OPS_LOG_FILE" | jq '.'
  fi
}
