#!/usr/bin/env bash
set -euo pipefail

# Automates: checks -> commit (if needed) -> push -> PR create/update -> auto-merge enable.
# Usage:
#   ./ops/scripts/git/auto-pr-merge.sh "feat: message" "PR title" "PR body"
# Optional env vars:
#   AUTO_PR_REMOTE_URL   If 'origin' is missing, configure it with this URL.
#   AUTO_PR_BASE_BRANCH  Base branch for PR (default: main).

COMMIT_MSG="${1:-}"
PR_TITLE="${2:-}"
PR_BODY="${3:-}"
BASE_BRANCH="${AUTO_PR_BASE_BRANCH:-main}"
REMOTE_URL="${AUTO_PR_REMOTE_URL:-}"

if [[ -z "$COMMIT_MSG" || -z "$PR_TITLE" || -z "$PR_BODY" ]]; then
  echo "Usage: $0 \"<commit_message>\" \"<pr_title>\" \"<pr_body>\""
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) not found. Install/authenticate gh before using this automation."
  exit 2
fi

BRANCH="$(git branch --show-current)"
if [[ "$BRANCH" == "main" ]]; then
  echo "Refusing to run on main. Create/use a feature branch first."
  exit 1
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  if [[ -n "$REMOTE_URL" ]]; then
    git remote add origin "$REMOTE_URL"
    echo "Configured missing origin with AUTO_PR_REMOTE_URL."
  else
    echo "Remote 'origin' is missing. Set AUTO_PR_REMOTE_URL to configure it automatically."
    exit 2
  fi
fi

# Safety check: whitespace/conflict markers
if ! git diff --check >/dev/null; then
  echo "git diff --check failed. Resolve issues before continuing."
  exit 1
fi

# Commit only when there are staged/unstaged changes
if [[ -n "$(git status --porcelain)" ]]; then
  git add -A
  git commit -m "$COMMIT_MSG"
else
  echo "No local changes detected. Continuing with existing branch commits."
fi

git push -u origin "$BRANCH"

# Create PR if missing for current branch; otherwise continue with existing PR
if ! gh pr view "$BRANCH" --json number >/dev/null 2>&1; then
  gh pr create --base "$BASE_BRANCH" --head "$BRANCH" --title "$PR_TITLE" --body "$PR_BODY"
fi

# Enable auto-merge (squash). If branch protections block it, gh returns non-zero.
gh pr merge "$BRANCH" --auto --squash --delete-branch

echo "Done: PR is configured for auto-merge when required checks pass."
