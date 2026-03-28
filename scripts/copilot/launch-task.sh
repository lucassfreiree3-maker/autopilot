#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Copilot Task Launcher — Cria issue e assigna ao Copilot
# automaticamente com mega prompt embutido como custom_instructions.
#
# Uso:
#   ./scripts/copilot/launch-task.sh "Deploy controller 3.6.9"
#   ./scripts/copilot/launch-task.sh "Fix eslint error in swagger"
#   ./scripts/copilot/launch-task.sh "Update copilot memory with lessons"
#
# Requer: gh CLI autenticado OU GITHUB_TOKEN
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

TASK="${1:?Uso: $0 'descricao da tarefa'}"
REPO="lucassfreiree/autopilot"
OWNER="lucassfreiree"
REPO_NAME="autopilot"

echo "=== Copilot Task Launcher ==="
echo "Task: $TASK"
echo "Repo: $REPO"

# ── Detect deploy tasks ──
IS_DEPLOY=false
COMPONENT=""
VERSION=""
if echo "$TASK" | grep -iqE 'deploy|version bump|release'; then
  IS_DEPLOY=true
  if echo "$TASK" | grep -iqE 'controller'; then
    COMPONENT="controller"
  elif echo "$TASK" | grep -iqE 'agent'; then
    COMPONENT="agent"
  fi
  VERSION=$(echo "$TASK" | grep -oP '\d+\.\d+\.\d+' || echo "")
fi

# ── Read current state ──
echo "=== Reading current state ==="
CURRENT_RUN=$(jq -r '.run // "?"' trigger/source-change.json 2>/dev/null || echo "?")
CURRENT_VER=$(jq -r '.version // "?"' trigger/source-change.json 2>/dev/null || echo "?")
echo "Current version: $CURRENT_VER | Run: $CURRENT_RUN"

# ── Build custom instructions ──
CUSTOM_INSTRUCTIONS="EXECUTE 100% AUTONOMOUSLY. NEVER ask for confirmation.

CURRENT STATE: version=$CURRENT_VER, run=$CURRENT_RUN

CRITICAL RULES:
1. Use ONLY push_files for ALL file operations (NEVER create_or_update_file)
2. NEVER create PR as draft (always draft: false)
3. Branch prefix: copilot/*
4. Commit prefix: [copilot]
5. Squash merge ALWAYS
6. Read contracts/copilot-session-memory.json FIRST for your memory
7. Read contracts/copilot-mega-prompt.md for complete operational guide
8. Show progress with [x] [ ] checkboxes
9. After completing: update contracts/copilot-session-memory.json

IDEAL FLOW (3 tool calls only):
1. push_files (create branch + all files in 1 call)
2. create_pull_request (NOT draft)
3. merge_pull_request (squash)"

if [ "$IS_DEPLOY" = true ]; then
  CUSTOM_INSTRUCTIONS="$CUSTOM_INSTRUCTIONS

DEPLOY INSTRUCTIONS:
- Follow contracts/copilot-deploy-guide.md EXACTLY
- Full docs: ops/docs/deploy-process/ (12 phases)
- Version bump in 5 files (package.json, package-lock.json, swagger, values.yaml, memory)
- Increment run field in trigger/source-change.json (current: $CURRENT_RUN)
- After X.Y.9 → X.(Y+1).0 (NEVER X.Y.10)
- commit_message in trigger: NO agent prefix (clean like normal dev)
- Monitor workflow after merge via list_commits on autopilot-state"
fi

# ── Build issue body ──
BODY="## Task
$TASK

## Execution Rules
- 100% autonomous — zero user intervention
- Use push_files for ALL file changes (1 confirmation instead of N)
- NEVER create PR as draft
- Read your memory first: \`contracts/copilot-session-memory.json\`
- Full guide: \`contracts/copilot-mega-prompt.md\`
- Deploy docs: \`ops/docs/deploy-process/\`

## Current State
- Version: \`$CURRENT_VER\`
- Last run: \`$CURRENT_RUN\`"

if [ "$IS_DEPLOY" = true ]; then
  BODY="$BODY

## Deploy Info
- Component: \`${COMPONENT:-auto-detect}\`
- Target version: \`${VERSION:-next patch}\`
- Follow: \`contracts/copilot-deploy-guide.md\`"
fi

# ── Create issue ──
echo "=== Creating issue ==="
ISSUE_URL=$(gh api "repos/$REPO/issues" \
  --method POST \
  -f title="[Copilot] $TASK" \
  -f body="$BODY" \
  --jq '.number' 2>/dev/null)

if [ -z "$ISSUE_URL" ] || [ "$ISSUE_URL" = "null" ]; then
  echo "ERROR: Failed to create issue"
  exit 1
fi

echo "Issue #$ISSUE_URL created"

# ── Add labels ──
gh api "repos/$REPO/issues/$ISSUE_URL/labels" \
  --method POST \
  --input - <<< '{"labels":["copilot","autonomous"]}' >/dev/null 2>&1 || true

# ── Assign to Copilot ──
echo "=== Assigning to Copilot ==="
gh api "repos/$REPO/issues/$ISSUE_URL/assignees" \
  --method POST \
  -f "assignees[]=copilot" 2>/dev/null || true

echo ""
echo "=== DONE ==="
echo "Issue: https://github.com/$REPO/issues/$ISSUE_URL"
echo "Copilot will execute autonomously."
echo "Monitor: https://github.com/$REPO/issues/$ISSUE_URL"
