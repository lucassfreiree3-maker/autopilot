#!/usr/bin/env bash
set -euo pipefail

# Automates branch -> PR -> check monitoring -> optional merge (official flow)
# Usage:
#   GH_TOKEN=xxx ./ops/scripts/github/auto-pr-stabilize.sh \
#     --repo lucassfreiree/autopilot --base main --head codex/my-branch \
#     --title "feat: ..." --body-file /tmp/pr.md --merge

REPO=""
BASE="main"
HEAD="$(git branch --show-current 2>/dev/null || true)"
TITLE=""
BODY_FILE=""
AUTO_MERGE="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO="$2"; shift 2 ;;
    --base) BASE="$2"; shift 2 ;;
    --head) HEAD="$2"; shift 2 ;;
    --title) TITLE="$2"; shift 2 ;;
    --body-file) BODY_FILE="$2"; shift 2 ;;
    --merge) AUTO_MERGE="true"; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [[ -z "${GH_TOKEN:-${GITHUB_TOKEN:-}}" ]]; then
  echo "GH_TOKEN or GITHUB_TOKEN is required"
  exit 1
fi
TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"

if [[ -z "$REPO" || -z "$HEAD" || -z "$TITLE" || -z "$BODY_FILE" ]]; then
  echo "Missing required args. --repo, --head, --title, --body-file"
  exit 1
fi

if [[ ! -f "$BODY_FILE" ]]; then
  echo "Body file not found: $BODY_FILE"
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree has uncommitted changes; commit before running."
  exit 1
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "Remote 'origin' not configured."
  exit 1
fi

if [[ "$HEAD" == "main" ]]; then
  echo "Refusing to operate from main. Use branch + PR flow."
  exit 1
fi

AUTH=(-H "Authorization: Bearer ${TOKEN}" -H "Accept: application/vnd.github+json")
API="https://api.github.com"

# Push branch

echo "Pushing branch: ${HEAD}"
git push -u origin "$HEAD"

# Find existing PR
PR_JSON=$(curl -sS "${AUTH[@]}" "${API}/repos/${REPO}/pulls?state=open&head=${REPO%%/*}:${HEAD}&base=${BASE}")
PR_NUMBER=$(echo "$PR_JSON" | jq -r '.[0].number // empty')

if [[ -z "$PR_NUMBER" ]]; then
  echo "Creating PR..."
  BODY_CONTENT=$(cat "$BODY_FILE")
  CREATE_PAYLOAD=$(jq -n --arg title "$TITLE" --arg head "$HEAD" --arg base "$BASE" --arg body "$BODY_CONTENT" \
    '{title:$title, head:$head, base:$base, body:$body, maintainer_can_modify:true, draft:false}')
  PR_NUMBER=$(curl -sS -X POST "${AUTH[@]}" "${API}/repos/${REPO}/pulls" -d "$CREATE_PAYLOAD" | jq -r '.number')
fi

echo "PR #${PR_NUMBER} ready"

# Monitor checks until green/failure/timeout
./ops/scripts/github/watch-pr-checks.sh "$REPO" "$PR_NUMBER"

if [[ "$AUTO_MERGE" == "true" ]]; then
  echo "Checks green, merging PR #${PR_NUMBER} (squash)..."
  MERGE_PAYLOAD=$(jq -n --arg method "squash" '{merge_method:$method}')
  curl -sS -X PUT "${AUTH[@]}" "${API}/repos/${REPO}/pulls/${PR_NUMBER}/merge" -d "$MERGE_PAYLOAD" | jq .
fi

echo "Flow completed."
