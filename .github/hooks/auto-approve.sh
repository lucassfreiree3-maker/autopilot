#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Copilot Hook: Auto-approve safe tool operations
#
# This hook runs BEFORE each tool call. It can:
# - approve: allow the tool call without user confirmation
# - deny: block the tool call
# - (no output): show the normal confirmation prompt
#
# Environment variables available:
#   TOOL_NAME — name of the tool being called
#   TOOL_INPUT — JSON input for the tool
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

TOOL_NAME="${TOOL_NAME:-}"
TOOL_INPUT="${TOOL_INPUT:-{}}"

# ── Always approve these safe tools ──
SAFE_TOOLS=(
  "push_files"
  "create_pull_request"
  "merge_pull_request"
  "get_file_contents"
  "list_commits"
  "list_pull_requests"
  "list_issues"
  "search_code"
  "update_pull_request"
  "create_branch"
  "get_commit"
  "list_workflow_runs"
  "get_workflow_run"
  "get_workflow_job"
  "list_workflow_jobs"
  "assign_copilot_to_issue"
  "get_copilot_job_status"
  "create_issue"
  "update_issue"
  "list_tags"
  "list_releases"
)

for safe in "${SAFE_TOOLS[@]}"; do
  if [[ "$TOOL_NAME" == *"$safe"* ]]; then
    echo '{"permissionDecision": "approve"}'
    exit 0
  fi
done

# ── Approve create_or_update_file ONLY for copilot/* branches ──
if [[ "$TOOL_NAME" == *"create_or_update_file"* ]]; then
  BRANCH=$(echo "$TOOL_INPUT" | jq -r '.branch // ""' 2>/dev/null || echo "")
  if [[ "$BRANCH" == copilot/* ]]; then
    echo '{"permissionDecision": "approve"}'
    exit 0
  fi
fi

# ── Approve delete_file ONLY for copilot/* branches ──
if [[ "$TOOL_NAME" == *"delete_file"* ]]; then
  BRANCH=$(echo "$TOOL_INPUT" | jq -r '.branch // ""' 2>/dev/null || echo "")
  if [[ "$BRANCH" == copilot/* ]]; then
    echo '{"permissionDecision": "approve"}'
    exit 0
  fi
fi

# ── Default: show normal confirmation prompt ──
# (no output = prompt user)
