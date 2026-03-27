#!/usr/bin/env bash
set -euo pipefail

# Autonomous mode for web environment:
# retries branch->PR->checks->merge until success or max attempts.
#
# Required env:
#   GH_TOKEN / GITHUB_TOKEN
# Args:
#   --repo owner/repo --head branch --title "..." --body-file file.md
# Optional:
#   --base main --attempts 20 --sleep-sec 90 --merge

REPO=""
BASE="main"
HEAD="$(git branch --show-current 2>/dev/null || true)"
TITLE=""
BODY_FILE=""
AUTO_MERGE="false"
ATTEMPTS=20
SLEEP_SEC=90

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO="$2"; shift 2 ;;
    --base) BASE="$2"; shift 2 ;;
    --head) HEAD="$2"; shift 2 ;;
    --title) TITLE="$2"; shift 2 ;;
    --body-file) BODY_FILE="$2"; shift 2 ;;
    --merge) AUTO_MERGE="true"; shift ;;
    --attempts) ATTEMPTS="$2"; shift 2 ;;
    --sleep-sec) SLEEP_SEC="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

for i in $(seq 1 "$ATTEMPTS"); do
  echo "[autonomous-sync] attempt ${i}/${ATTEMPTS} at $(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  if ! curl -sS https://api.github.com >/dev/null 2>&1; then
    echo "[autonomous-sync] GitHub API unreachable, retrying in ${SLEEP_SEC}s"
    sleep "$SLEEP_SEC"
    continue
  fi

  set +e
  ./ops/scripts/github/auto-pr-stabilize.sh \
    --repo "$REPO" \
    --base "$BASE" \
    --head "$HEAD" \
    --title "$TITLE" \
    --body-file "$BODY_FILE" \
    $( [[ "$AUTO_MERGE" == "true" ]] && echo "--merge" )
  RC=$?
  set -e

  if [[ "$RC" -eq 0 ]]; then
    echo "[autonomous-sync] completed successfully"
    exit 0
  fi

  echo "[autonomous-sync] failed with code ${RC}, retrying in ${SLEEP_SEC}s"
  sleep "$SLEEP_SEC"
done

echo "[autonomous-sync] exhausted retries"
exit 1
