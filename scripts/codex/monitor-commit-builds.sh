#!/usr/bin/env bash
set -euo pipefail

# Monitor workflow runs associated to a specific commit SHA.
# If a run fails, emit diagnostic context and fail the script.

REPO="${REPO:-lucassfreiree/autopilot}"
COMMIT_SHA="${COMMIT_SHA:-}"
POLL_INTERVAL_SECONDS="${POLL_INTERVAL_SECONDS:-20}"
WAIT_TIMEOUT_SECONDS="${WAIT_TIMEOUT_SECONDS:-1200}"
MIN_RUNS_EXPECTED="${MIN_RUNS_EXPECTED:-1}"

if ! command -v gh >/dev/null 2>&1; then
  echo "[ERROR] gh CLI is required." >&2
  exit 1
fi

if [[ -z "$COMMIT_SHA" ]]; then
  echo "[ERROR] COMMIT_SHA is required." >&2
  exit 1
fi

START_TS="$(date +%s)"

echo "[INFO] monitoring workflow runs for commit ${COMMIT_SHA} on ${REPO}"

while true; do
  NOW_TS="$(date +%s)"
  ELAPSED="$((NOW_TS - START_TS))"
  if (( ELAPSED >= WAIT_TIMEOUT_SECONDS )); then
    echo "[ERROR] timeout waiting workflow runs for commit ${COMMIT_SHA}" >&2
    exit 1
  fi

  RUNS_JSON="$(gh run list --repo "$REPO" --limit 100 --json databaseId,name,headSha,status,conclusion,url,event)"
  MATCHED_RUNS="$(printf '%s' "$RUNS_JSON" | jq --arg sha "$COMMIT_SHA" '[ .[] | select(.headSha == $sha) ]')"
  MATCHED_COUNT="$(printf '%s' "$MATCHED_RUNS" | jq 'length')"

  if (( MATCHED_COUNT < MIN_RUNS_EXPECTED )); then
    echo "[INFO] no runs yet for ${COMMIT_SHA} (found ${MATCHED_COUNT}), retrying in ${POLL_INTERVAL_SECONDS}s"
    sleep "$POLL_INTERVAL_SECONDS"
    continue
  fi

  PENDING_COUNT="$(printf '%s' "$MATCHED_RUNS" | jq '[ .[] | select(.status != "completed") ] | length')"
  if (( PENDING_COUNT > 0 )); then
    echo "[INFO] found ${MATCHED_COUNT} runs (${PENDING_COUNT} pending) for ${COMMIT_SHA}, waiting..."
    sleep "$POLL_INTERVAL_SECONDS"
    continue
  fi

  FAILED_COUNT="$(printf '%s' "$MATCHED_RUNS" | jq '[ .[] | select(.conclusion != "success" and .conclusion != "skipped") ] | length')"
  echo "[INFO] all ${MATCHED_COUNT} runs completed for ${COMMIT_SHA}"

  if (( FAILED_COUNT > 0 )); then
    echo "[ERROR] ${FAILED_COUNT} workflow run(s) failed for commit ${COMMIT_SHA}" >&2
    printf '%s' "$MATCHED_RUNS" | jq -r '.[] | select(.conclusion != "success" and .conclusion != "skipped") | "- \(.name) [\(.event)] status=\(.status) conclusion=\(.conclusion) url=\(.url)"' >&2

    FIRST_FAILED_ID="$(printf '%s' "$MATCHED_RUNS" | jq -r '.[] | select(.conclusion != "success" and .conclusion != "skipped") | .databaseId' | head -n1)"
    if [[ -n "$FIRST_FAILED_ID" ]]; then
      echo "[INFO] failed jobs summary for run ${FIRST_FAILED_ID}:"
      gh run view "$FIRST_FAILED_ID" --repo "$REPO" --log-failed || true
    fi
    exit 1
  fi

  printf '%s' "$MATCHED_RUNS" | jq -r '.[] | "- \(.name): \(.conclusion) (\(.url))"'
  echo "[DONE] workflow validation succeeded for ${COMMIT_SHA}"
  exit 0
done
