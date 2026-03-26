#!/usr/bin/env bash
set -euo pipefail

# Mandatory Autopilot product sync:
# local changes -> commit -> push -> PR -> merge -> wait for merged state

REPO="${REPO:-lucassfreiree/autopilot}"
WAIT_FOR_MERGE="${WAIT_FOR_MERGE:-true}"
WAIT_TIMEOUT_SECONDS="${WAIT_TIMEOUT_SECONDS:-900}"
POLL_INTERVAL_SECONDS="${POLL_INTERVAL_SECONDS:-15}"

if ! command -v gh >/dev/null 2>&1; then
  echo "[ERROR] gh CLI is required." >&2
  exit 1
fi

if [[ ! -x "scripts/codex/auto-pr-merge.sh" ]]; then
  echo "[ERROR] scripts/codex/auto-pr-merge.sh is required and must be executable." >&2
  exit 1
fi

if [[ -z "$(git status --porcelain)" ]]; then
  echo "[INFO] no local changes detected; nothing to sync."
  exit 0
fi

echo "[INFO] syncing local Autopilot changes to GitHub (${REPO})"
SYNC_OUTPUT="$(
  AUTO_COMMIT="${AUTO_COMMIT:-true}" \
  COMMIT_MESSAGE="${COMMIT_MESSAGE:-[codex-autopilot] chore: sync autopilot product state}" \
  PR_TITLE="${PR_TITLE:-[codex-autopilot] chore: sync autopilot product updates}" \
  PR_BODY="${PR_BODY:-Automatic sync executed by scripts/codex/sync-autopilot-product.sh}" \
  scripts/codex/auto-pr-merge.sh
)"

echo "$SYNC_OUTPUT"

PR_URL="$(printf "%s\n" "$SYNC_OUTPUT" | tail -n1 | sed 's/^\[DONE\] //')"
if [[ -z "$PR_URL" ]]; then
  echo "[WARN] PR url not found in auto-pr-merge output; skipping merge-state wait."
  exit 0
fi

if [[ "$WAIT_FOR_MERGE" != "true" ]]; then
  exit 0
fi

PR_NUMBER="$(gh pr view "$PR_URL" --repo "$REPO" --json number --jq .number)"
START_TS="$(date +%s)"

echo "[INFO] waiting for PR #${PR_NUMBER} to reach merged state"
while true; do
  PR_STATE="$(gh pr view "$PR_NUMBER" --repo "$REPO" --json state --jq .state)"
  if [[ "$PR_STATE" == "MERGED" ]]; then
    echo "[DONE] PR #${PR_NUMBER} merged successfully."
    exit 0
  fi

  NOW_TS="$(date +%s)"
  ELAPSED="$((NOW_TS - START_TS))"
  if (( ELAPSED >= WAIT_TIMEOUT_SECONDS )); then
    echo "[ERROR] timeout waiting merge for PR #${PR_NUMBER} (state=${PR_STATE})." >&2
    exit 1
  fi

  echo "[INFO] PR #${PR_NUMBER} state=${PR_STATE}; retrying in ${POLL_INTERVAL_SECONDS}s"
  sleep "$POLL_INTERVAL_SECONDS"
done
