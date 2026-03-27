#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   GH_TOKEN=xxx ./ops/scripts/github/watch-pr-checks.sh lucassfreiree/autopilot 123

REPO="${1:-}"
PR_NUMBER="${2:-}"
INTERVAL_SEC="${INTERVAL_SEC:-20}"
MAX_POLLS="${MAX_POLLS:-90}"

if [[ -z "$REPO" || -z "$PR_NUMBER" ]]; then
  echo "Usage: GH_TOKEN=<token> $0 <owner/repo> <pr-number>"
  exit 1
fi

if [[ -z "${GH_TOKEN:-${GITHUB_TOKEN:-}}" ]]; then
  echo "GH_TOKEN or GITHUB_TOKEN is required"
  exit 1
fi

TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
API="https://api.github.com"
AUTH=(-H "Authorization: Bearer ${TOKEN}" -H "Accept: application/vnd.github+json")

head_sha() {
  curl -sS "${AUTH[@]}" "${API}/repos/${REPO}/pulls/${PR_NUMBER}" | jq -r '.head.sha'
}

print_checks() {
  local sha="$1"
  curl -sS "${AUTH[@]}" "${API}/repos/${REPO}/commits/${sha}/check-runs" | \
    jq -r '.check_runs[] | [(.name//"-"), (.status//"-"), (.conclusion//"pending"), (.details_url//"-")] | @tsv'
}

all_completed() {
  local sha="$1"
  curl -sS "${AUTH[@]}" "${API}/repos/${REPO}/commits/${sha}/check-runs" | \
    jq -e '(.check_runs | length) > 0 and ([.check_runs[].status] | all(. == "completed"))' >/dev/null
}

all_success() {
  local sha="$1"
  curl -sS "${AUTH[@]}" "${API}/repos/${REPO}/commits/${sha}/check-runs" | \
    jq -e '[.check_runs[].conclusion] | all(. == "success" or . == "neutral" or . == "skipped")' >/dev/null
}

SHA="$(head_sha)"
echo "Monitoring checks for ${REPO} PR #${PR_NUMBER} (head ${SHA})"

i=1
while [[ "$i" -le "$MAX_POLLS" ]]; do
  echo ""
  echo "[poll ${i}/${MAX_POLLS}] $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  print_checks "$SHA" | awk -F '\t' '{printf "- %s | %s | %s\n", $1, $2, $3}'

  if all_completed "$SHA"; then
    if all_success "$SHA"; then
      echo "All checks completed successfully."
      exit 0
    fi
    echo "Checks completed with failures."
    exit 2
  fi

  sleep "$INTERVAL_SEC"
  i=$((i + 1))
done

echo "Timeout waiting for checks completion."
exit 3
