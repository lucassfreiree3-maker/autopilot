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
| Promote | Updates CAP values.yaml (agent + controller — BOTH auto-promote via GitHub API) | Check workspace.json CAP config |
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
# Output: {"version": "3.6.3", "run": 53}

# 2. Create branch
git fetch origin main && git checkout -B codex/deploy-v3.6.4 origin/main

# 3. Create/update patch file
# (edit patches/oas-sre-controller.controller.ts with the fix)

# 4. Update trigger (ALWAYS INCREMENT run!)
# Edit trigger/source-change.json with new version, new run, new changes array

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

# 9. Monitor (poll every 30-60s)
gh api repos/lucassfreiree/autopilot/actions/workflows/apply-source-change.yml/runs?per_page=1 \
  --jq '.workflow_runs[0] | {status, conclusion}'
```

---

## ADVANCED: Deploy Multi-Component (Agent + Controller)

When a historia requires changes in BOTH agent and controller repos, you MUST do **2 separate deploys** because `apply-source-change.yml` operates on ONE component at a time.

### Strategy: Sequential Deploys
```
Deploy 1: Controller changes (version X.Y.Z)
  → Wait for workflow + corporate CI to pass
  → Promote updates controller CAP tag automatically

Deploy 2: Agent changes (version X.Y.Z)
  → Wait for workflow + corporate CI to pass
  → Promote updates agent CAP tag automatically
```

### trigger/source-change.json for each:
```json
// Deploy 1: Controller
{
  "_context": "GETRONICS | ws-default | BBVINET_TOKEN",
  "workspace_id": "ws-default",
  "component": "controller",
  "change_type": "multi-file",
  "version": "3.6.4",
  "changes": [...],
  "promote": true,
  "run": 54
}

// Deploy 2: Agent (AFTER controller succeeds)
{
  "_context": "GETRONICS | ws-default | BBVINET_TOKEN",
  "workspace_id": "ws-default",
  "component": "agent",
  "change_type": "multi-file",
  "version": "3.6.4",
  "changes": [...],
  "promote": true,
  "run": 55
}
```

### Alternative: component "both"
If BOTH repos get the EXACT SAME change (rare), you can use `"component": "both"`. But for different changes per repo, use sequential deploys.

### Version Coordination
When deploying to BOTH repos for the SAME historia:
- Use the SAME version (e.g., 3.6.4) for both
- Controller goes first (the endpoint consumers depend on it)
- Agent goes second (it calls the controller)
- If one fails, fix it before doing the other

---

## ADVANCED: Corporate Codebase Patterns (NestJS)

Both controller and agent repos use **NestJS** with specific patterns:

### Project Structure (Controller)
```
src/
  controllers/           # Route handlers (*.controller.ts)
  middlewares/            # Auth, validation middleware (*.ts)
  swagger/               # swagger.json (OpenAPI 3.0.3)
  utils/                 # Shared utilities
  __tests__/unit/        # Jest unit tests
package.json             # Version + dependencies
```

### Project Structure (Agent)
```
src/
  controllers/           # Route handlers
  services/              # Business logic services
  middlewares/            # Auth middleware
  swagger/               # swagger.json
  utils/                 # Shared utilities
  __tests__/             # Jest tests
package.json
```

### Key Coding Patterns

**1. Route Registration (Controller)**
Routes are registered in controller files. Each HTTP endpoint = one function:
```typescript
// src/controllers/my-endpoint.controller.ts
import { Router, Request, Response } from 'express';
const router = Router();

router.post('/api/my-endpoint', async (req: Request, res: Response) => {
  try {
    // validate input
    // business logic
    res.json({ status: 'ok', data: result });
  } catch (error) {
    console.error('[my-endpoint] Error:', error);
    res.status(500).json({ error: 'Internal error', detail: sanitizeForOutput(error.message) });
  }
});

export default router;
```

**2. Auth Pattern**
Two auth modes exist:
- **JWT Bearer**: `Authorization: Bearer <token>` — validated by `requireJwt()` + `requireScopes()`
- **Internal Origin**: `x-techbb-namespace` + `x-techbb-service-account` headers — validated by `evaluateOasOriginAuth()`
```typescript
// Internal origin check
if (req.headers['x-techbb-namespace'] === process.env.OAS_TRUSTED_NAMESPACE &&
    req.headers['x-techbb-service-account'] === process.env.OAS_TRUSTED_SERVICE_ACCOUNT) {
  // trusted internal caller
}
```

**3. Agent ↔ Controller Communication**
Controller calls Agent via HTTP. Agent calls Controller via `pushAgentExecutionLogs()`:
```typescript
// Agent pushing logs to Controller
async function pushAgentExecutionLogs(controllerUrl, execId, payload, token) {
  await postJson(`${controllerUrl}/api/agent-execution-logs`, {
    execId,
    ...payload
  }, { Authorization: `Bearer ${token}` });
}
```

**4. Security Rules (CRITICAL)**
- NEVER reflect user input in responses without `sanitizeForOutput()`
- NEVER use `validateTrustedUrl()` inside `fetch()` or `postJson()` — breaks test mocks
- NEVER loop without MAX_RESULTS limit
- ALWAYS define functions BEFORE calling them (ESLint no-use-before-define)
- ALWAYS remove dead code (unused functions = ESLint error)
- JWT scope claim is `payload.scope` (SINGULAR), never `scopes` (plural)

**5. Swagger Rules**
- File: `src/swagger/swagger.json` (OpenAPI 3.0.3)
- NEVER use accents/special chars — ASCII only
- Version in swagger MUST match package.json version
- Validate: `grep -P '[\x80-\xFF]' patches/swagger.json` (should return nothing)

---

## ADVANCED: Common CI Failures and Auto-Fix

When the corporate CI (Esteira de Build NPM) fails after deploy, follow this pattern:

### Diagnosis Flow
```bash
# 1. List CI logs saved in autopilot-state
gh api "repos/lucassfreiree/autopilot/git/trees/autopilot-state" \
  --jq '.tree[] | select(.path | startswith("state/workspaces/ws-default/ci-logs-controller")) | .path' \
  | sort | tail -1

# 2. Read the latest log
gh api "repos/lucassfreiree/autopilot/contents/state/workspaces/ws-default/<LATEST_LOG>?ref=autopilot-state" \
  --jq '.content' | base64 -d

# 3. Look for these patterns in logs:
```

### Error → Fix Map
| Log Pattern | Cause | Fix |
|-------------|-------|-----|
| `error TS2769` | TypeScript type mismatch | Check `@types/` versions, add proper casts |
| `error TS2304: Cannot find name` | Missing import | Add import statement |
| `error TS2688` | Missing type definition | Add `@types/` package |
| `no-use-before-define` | Function used before declaration | Move function definition UP |
| `no-unused-vars` | Dead code (function defined, never used) | Remove the unused function |
| `FAIL src/__tests__` | Test failure | Read test, check if it expects old behavior |
| `duplicate tag` | Version already in registry | Bump version again |
| `Insufficient scope` | JWT scope claim wrong | Use `scope` (singular), never `scopes` |
| `Reflected_XSS` (Checkmarx) | User input in response | Use `sanitizeForOutput()` |

### Auto-Fix Protocol
```
1. Read CI log → identify error pattern
2. Fetch the failing file from corporate repo (if not in patches/)
3. Create/update patch with minimal fix
4. Bump trigger run +1 (SAME version if the fix is for same deploy)
5. New commit → push → PR → merge → monitor
6. Repeat until CI passes
7. Record the failure + fix in session memory
```

---

## ADVANCED: CAP Promote (Auto-promote for Agent + Controller)

Stage 4 of `apply-source-change.yml` now auto-promotes BOTH components:

| Component | CAP Repo (GitHub) | Values Path |
|-----------|-------------------|-------------|
| Agent | `bbvinet/psc_releases_cap_sre-aut-agent` | `releases/openshift/hml/deploy/values.yaml` |
| Controller | `bbvinet/psc_releases_cap_sre-aut-controller` | `releases/openshift/hml/deploy/values.yaml` |

### How it works:
1. After CI Gate passes (corporate CI green)
2. Workflow reads `workspace.json` for CAP config (agent.capRepo or controller.capRepo)
3. Reads current `values.yaml` from GitHub
4. Updates image tag line: `image: docker.binarios.intranet.bb.com.br/bb/psc/psc-sre-automacao-<component>:<NEW_TAG>`
5. Commits to CAP repo via GitHub API with `BBVINET_TOKEN`

### When promote=true in trigger:
- Promote runs AUTOMATICALLY after CI passes
- No manual intervention needed
- Both agent and controller CAP repos are on GitHub

### Image line in values.yaml:
```yaml
# Controller
image: docker.binarios.intranet.bb.com.br/bb/psc/psc-sre-automacao-controller:3.6.4
# Agent
image: docker.binarios.intranet.bb.com.br/bb/psc/psc-sre-automacao-agent:3.6.4
```

---

## ADVANCED: Handling Test Failures

Corporate repos have Jest tests. When your patch breaks a test:

### Strategy
1. **Fetch the test file** via `fetch-files.yml` or read from autopilot-state
2. **Understand what the test expects** — read the `describe()` and `it()` blocks
3. **Determine if**:
   - Your code change broke the expected behavior → fix your code
   - The test expects OLD behavior that you intentionally changed → update the test too
4. **If updating test**: add the test file as another `replace-file` change in trigger

### Example: Adding a test update to deploy
```json
{
  "changes": [
    {"action": "replace-file", "target_path": "src/controllers/my-controller.ts", "content_ref": "patches/my-controller.ts"},
    {"action": "replace-file", "target_path": "src/__tests__/unit/my-controller.test.ts", "content_ref": "patches/my-controller.test.ts"},
    {"action": "search-replace", "target_path": "package.json", "search": "\"version\": \"3.6.3\"", "replace": "\"version\": \"3.6.4\""}
  ]
}
```

### Test Mocking Pattern
Tests use mock URLs like `http://agent.local` or `http://controller.local`. These are NOT real URLs.
- NEVER add URL validation that blocks mock URLs in tests
- `fetch()` and `postJson()` must accept ANY URL (mocked in tests)
- Input validation goes on the REQUEST input (parseSafeIdentifier), NOT on the fetch URL

---

## GOLDEN RULES (Non-Negotiable)

1. **ALWAYS fetch corporate files first** — never assume patches/ is current
2. **ALWAYS increment `run`** in trigger/source-change.json — without this, nothing happens
3. **NEVER push to main** — always branch + PR + squash merge
4. **NEVER deploy without version bump** — CI rejects duplicate tags
5. **NEVER use accents in swagger** — ASCII only
6. **NEVER add validateTrustedUrl inside fetch()** — breaks ALL test mocks
7. **ALWAYS define functions before calling them** — ESLint rejects hoisting
8. **ALWAYS monitor after deploy** — poll workflow every 30-60s, then poll corporate CI
9. **ALWAYS fix CI failures automatically** — read logs, create fix, re-deploy
10. **ALWAYS update session memory** after successful deploy
11. **ALWAYS use `sanitizeForOutput()` on error messages** — Checkmarx detects XSS
12. **Version pattern: after X.Y.9 goes X.(Y+1).0** — NEVER X.Y.10
13. **JWT scope claim is `scope` (singular)** — agent reads `payload.scope`, never `scopes`
14. **Commits on autopilot repo**: prefix with `[codex]` for identification
15. **Commits on corporate repos**: NO agent references, clean message like a normal dev
