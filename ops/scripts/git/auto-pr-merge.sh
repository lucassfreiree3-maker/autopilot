#!/usr/bin/env bash
set -euo pipefail

# Automates: checks -> commit (if needed) -> push -> PR create/update -> auto-merge enable.
# Usage:
#   ./ops/scripts/git/auto-pr-merge.sh "feat: message" "PR title" "PR body"

COMMIT_MSG="${1:-}"
PR_TITLE="${2:-}"
PR_BODY="${3:-}"

if [[ -z "$COMMIT_MSG" || -z "$PR_TITLE" || -z "$PR_BODY" ]]; then
  echo "Usage: $0 \"<commit_message>\" \"<pr_title>\" \"<pr_body>\""
  exit 1
fi

BRANCH="$(git branch --show-current)"
if [[ "$BRANCH" == "main" ]]; then
  echo "Refusing to run on main. Create/use a feature branch first."
  exit 1
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
fi

git push -u origin "$BRANCH"

# Create PR if missing; otherwise continue with existing PR
if ! gh pr view --json number >/dev/null 2>&1; then
  gh pr create --title "$PR_TITLE" --body "$PR_BODY"
fi

# Enable auto-merge (squash). If branch protections block it, gh returns non-zero.
gh pr merge --auto --squash --delete-branch

echo "Done: PR is configured for auto-merge when required checks pass."
