# Codex Deploy Guide — Using the Existing Pipeline

> This guide teaches Codex how to use the EXISTING deploy pipeline (`apply-source-change.yml`)
> to deploy code changes to corporate repos. NO new workflows needed.
> This is the SAME flow Claude uses. Follow it step by step.

## Prerequisites

Before deploying, you need:
- Access to the `lucassfreiree/autopilot` repo (via gh CLI or GitHub API)
- Knowledge of which workspace/company (check context: Getronics = ws-default, CIT = ws-cit)
- The code changes you want to deploy

## The Flow (Same as Claude)

```
1. Fetch current corporate files (know what exists today)
2. Create patch files in patches/
3. Update trigger/source-change.json (increment run!)
4. Push to codex/* branch → auto-pr-codex.yml creates PR
5. Merge PR → apply-source-change.yml triggers automatically
6. Monitor until complete
```

---

## Step 1: Fetch Current Corporate Files

Before creating patches, you MUST know the current state of the corporate repo.

```bash
# Option A: Use fetch-files workflow
# Edit trigger/fetch-files.json:
{
  "workspace_id": "ws-default",
  "component": "controller",
  "files": "src/controllers/oas-sre-controller.controller.ts,src/swagger/swagger.json",
  "run": <NEXT_RUN>
}
# Merge to main → files saved in autopilot-state branch

# Option B: Read already-fetched files from autopilot-state
gh api "repos/lucassfreiree/autopilot/contents/state/workspaces/ws-default/fetched-controller-src-controllers-oas-sre-controller.controller.ts?ref=autopilot-state" \
  --jq '.content' | base64 -d
```

**RULE**: ALWAYS work from the CURRENT corporate base. Never assume patches/ has the latest version.

---

## Step 2: Create Patch Files

Patch files go in `patches/` directory. Two types of patches:

### Type 1: Full File Replacement (replace-file)
Create the complete file in `patches/`:
```
patches/oas-sre-controller.controller.ts  → replaces src/controllers/oas-sre-controller.controller.ts
patches/swagger.json                       → replaces src/swagger/swagger.json
patches/execute.controller.fixed.ts        → replaces src/controllers/execute.controller.ts
```

### Type 2: Search-Replace (search-replace)
No file needed — configured directly in trigger/source-change.json:
```json
{"action": "search-replace", "target_path": "package.json", "search": "\"version\": \"3.6.3\"", "replace": "\"version\": \"3.6.4\""}
```

### Naming Convention
| Patch file | Target in corporate repo |
|-----------|-------------------------|
| `patches/<name>.controller.ts` | `src/controllers/<name>.controller.ts` |
| `patches/<name>.ts` (with middleware/auth) | `src/middlewares/<name>.ts` |
| `patches/swagger.json` | `src/swagger/swagger.json` |

---

## Step 3: Update trigger/source-change.json

This is the MOST IMPORTANT file. The workflow `apply-source-change.yml` reads this.

```json
{
  "_context": "GETRONICS | ws-default | BBVINET_TOKEN",
  "workspace_id": "ws-default",
  "component": "controller",
  "change_type": "multi-file",
  "version": "3.6.4",
  "changes": [
    {
      "action": "replace-file",
      "target_path": "src/controllers/oas-sre-controller.controller.ts",
      "content_ref": "patches/oas-sre-controller.controller.ts"
    },
    {
      "action": "search-replace",
      "target_path": "package.json",
      "search": "\"version\": \"3.6.3\"",
      "replace": "\"version\": \"3.6.4\""
    },
    {
      "action": "search-replace",
      "target_path": "package-lock.json",
      "search": "\"version\": \"3.6.3\"",
      "replace": "\"version\": \"3.6.4\""
    },
    {
      "action": "search-replace",
      "target_path": "src/swagger/swagger.json",
      "search": "\"version\": \"3.6.3\"",
      "replace": "\"version\": \"3.6.4\""
    }
  ],
  "commit_message": "feat: description of changes (3.6.4)",
  "skip_ci_wait": false,
  "promote": true,
  "run": 53
}
```

### CRITICAL Rules:
- `run` MUST be incremented from the previous value (check current: `jq '.run' trigger/source-change.json`)
- `version` MUST NOT duplicate an existing tag (CI rejects duplicates)
- Version pattern: after X.Y.9 → X.(Y+1).0 (NEVER X.Y.10)
- ALWAYS include version bump for: package.json, package-lock.json, swagger.json
- `content_ref` must point to a file that exists in `patches/`

---

## Step 4: Push to codex/* Branch

```bash
# Create branch from latest main
git fetch origin main
git checkout -B codex/deploy-v3.6.4 origin/main

# Stage all deploy files
git add patches/ trigger/source-change.json

# Also update references if version changed:
# - references/controller-cap/values.yaml (image tag)
# - contracts/claude-session-memory.json (versioningRules.currentVersion)
git add references/ contracts/

# Commit
git commit -m "deploy: description of changes (v3.6.4)"

# Push
git push -u origin codex/deploy-v3.6.4
```

**IMPORTANT**: Push to `codex/*` branch triggers `auto-pr-codex.yml` which automatically creates a PR.

### If auto-pr-codex doesn't create the PR:
```bash
gh pr create --base main --head codex/deploy-v3.6.4 \
  --title "deploy: controller v3.6.4" \
  --body "## Deploy\n- Version: 3.6.4\n- Changes: description"
```

---

## Step 5: Merge the PR

```bash
# Check PR status
gh pr view <PR_NUMBER>

# Merge (squash)
gh pr merge <PR_NUMBER> --squash
```

**After merge**: `apply-source-change.yml` triggers AUTOMATICALLY because `trigger/source-change.json` changed.

---

## Step 6: Monitor the Deploy

```bash
# Check if workflow triggered (wait ~30s after merge)
gh api repos/lucassfreiree/autopilot/actions/workflows/apply-source-change.yml/runs?per_page=1 \
  --jq '.workflow_runs[0] | {id, status, conclusion, created_at}'

# If in_progress, wait and check again:
gh api repos/lucassfreiree/autopilot/actions/runs/<RUN_ID>/jobs \
  --jq '.jobs[0] | {name, status, conclusion, steps: [.steps[] | {name, conclusion}]}'
```

### What Each Stage Does:
| Stage | What | If fails |
|-------|------|----------|
| Setup | Reads workspace config | Check workspace.json |
| Session Guard | Acquires lock | Wait if another agent has lock |
| Apply & Push | Clone corporate repo, apply patches, push | Check patches are valid |
| CI Gate | Waits for corporate CI (Esteira de Build NPM) | Check ci-logs |
| Promote | Updates CAP values.yaml | GitLab limitation (manual) |
| Save State | Records in autopilot-state | Retry |
| Audit | Audit trail + release lock | Usually succeeds |

### If Deploy Fails:
1. Check which step failed: `gh api repos/lucassfreiree/autopilot/actions/runs/<RUN_ID>/jobs`
2. Read CI logs: `gh api "repos/lucassfreiree/autopilot/contents/state/workspaces/ws-default/ci-logs-controller-<NNNNN>.txt?ref=autopilot-state" --jq '.content' | base64 -d`
3. Fix the patch
4. Increment `run` in trigger/source-change.json
5. New commit, push, PR, merge, monitor again

---

## Quick Reference: Current State

Read these BEFORE deploying:

```bash
# Current version
jq '.version' trigger/source-change.json

# Current trigger run number
jq '.run' trigger/source-change.json

# Session memory version
jq '.versioningRules.currentVersion' contracts/claude-session-memory.json

# Check locks
gh api "repos/lucassfreiree/autopilot/contents/state/workspaces/ws-default/locks/session-lock.json?ref=autopilot-state" --jq '.content' | base64 -d 2>/dev/null || echo "No lock"
```

---

## Common Mistakes (AVOID THESE)

| Mistake | What happens | Fix |
|---------|-------------|-----|
| Forgot to increment `run` | Workflow does NOT trigger | Always check and increment |
| Push to main directly | 403 Forbidden | Always use branch + PR |
| Branch not codex/* | auto-pr doesn't trigger | Use `codex/deploy-*` prefix |
| Duplicate version tag | CI rejects | Check registry, use next version |
| Patch based on old code | Patch doesn't apply | Fetch current files first |
| Missing version bump in swagger | Version mismatch | Always bump all 3: package.json, package-lock.json, swagger.json |
| validateTrustedUrl in fetch | Tests break (mock URLs) | NEVER — use parseSafeIdentifier on input |
| ESLint no-use-before-define | CI fails | Define functions BEFORE using them |

---

## Files You Need to Know

| File | Purpose | When to update |
|------|---------|---------------|
| `trigger/source-change.json` | Deploy trigger (MAIN file) | Every deploy — increment run |
| `patches/*.ts` | Code patches to apply | When code changes |
| `patches/swagger.json` | API documentation | When routes change |
| `references/controller-cap/values.yaml` | K8s deployment values | When version changes |
| `contracts/claude-session-memory.json` | Shared memory | When version changes |
| `contracts/shared-agent-context.md` | Context for all agents | When major changes happen |

---

## Example: Complete Deploy of a Bug Fix

```bash
# 1. Check current state
jq '{version, run}' trigger/source-change.json
# Output: {"version": "3.6.3", "run": 52}

# 2. Create branch
git fetch origin main && git checkout -B codex/deploy-v3.6.4 origin/main

# 3. Create/update patch file
# (edit patches/oas-sre-controller.controller.ts with the fix)

# 4. Update trigger
jq '.version = "3.6.4" | .run = 53 | .changes = [
  {"action":"replace-file","target_path":"src/controllers/oas-sre-controller.controller.ts","content_ref":"patches/oas-sre-controller.controller.ts"},
  {"action":"search-replace","target_path":"package.json","search":"\"version\": \"3.6.3\"","replace":"\"version\": \"3.6.4\""},
  {"action":"search-replace","target_path":"package-lock.json","search":"\"version\": \"3.6.3\"","replace":"\"version\": \"3.6.4\""},
  {"action":"search-replace","target_path":"src/swagger/swagger.json","search":"\"version\": \"3.6.3\"","replace":"\"version\": \"3.6.4\""}
] | .commit_message = "fix: bug description (3.6.4)"' trigger/source-change.json > /tmp/t.json && mv /tmp/t.json trigger/source-change.json

# 5. Update CAP values
sed -i 's/psc-sre-automacao-controller:3.6.3/psc-sre-automacao-controller:3.6.4/g' references/controller-cap/values.yaml

# 6. Commit and push
git add patches/ trigger/source-change.json references/
git commit -m "fix: bug description + deploy v3.6.4"
git push -u origin codex/deploy-v3.6.4

# 7. Create PR (if auto-pr didn't trigger)
gh pr create --base main --head codex/deploy-v3.6.4 --title "fix: deploy v3.6.4"

# 8. Merge
gh pr merge --squash

# 9. Monitor
sleep 30
gh api repos/lucassfreiree/autopilot/actions/workflows/apply-source-change.yml/runs?per_page=1 \
  --jq '.workflow_runs[0] | {status, conclusion}'
```
