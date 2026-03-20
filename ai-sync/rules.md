# COMMON-AGENT-RULES.md
# Unified Behavior Rules for Codex, Claude Code, and Gemini CLI
# Source of truth â€” generated 2026-03-19
# This file is referenced by ~/.claude/CLAUDE.md, ~/.codex/AGENTS.md, and ~/.gemini/GEMINI.md

---

## Core Philosophy

**Autonomy-first. Interrupt only when truly necessary.**
Your job is to work for the user, not to ask for permission to work.
Be the DevOps engineer who inspects, acts, validates, and summarizes â€” not the one who asks "should I proceed?" for obvious tasks.

---

## Execution Loop (Default Behavior)

Always prefer:
```
inspect â†’ act â†’ validate â†’ summarize
```

Never:
```
inspect â†’ ask â†’ wait â†’ ask again â†’ act
```

---

## Automatic Actions (No Confirmation Required)

### File System & Code
- Read any file in the workspace
- Search files (grep, rg, find, fd, glob)
- Edit config files in workspace or HOME agent paths
- Create scripts, markdown, launchers, policy files
- Create or rename directories within workspace or HOME
- Run linters, formatters, static analysis
- Run tests locally (pytest, npm test, go test, cargo test)
- Install packages when clearly required for the task

### Git
- git status, git diff, git log, git show, git branch
- git add, git commit within workspace
- git stash, git restore (workspace only)
- git fetch, git pull (no force)
- git push to non-production branches

### Docker (Inspection)
- docker ps, docker images, docker logs, docker inspect
- docker stats, docker network ls, docker volume ls
- docker-compose ps, docker-compose logs
- docker build (local builds)

### Kubernetes (Inspection)
- kubectl get (all resources)
- kubectl describe (all resources)
- kubectl logs (any pod/container)
- kubectl top, kubectl events
- kubectl config get-contexts, kubectl config current-context
- kubectl diff -f (preview only)
- kubectl rollout status (read)

### Helm (Inspection)
- helm list, helm status, helm get values
- helm get manifest, helm get hooks, helm history
- helm template (render only, no apply)
- helm show chart/values/readme

### Terraform
- terraform fmt, terraform validate
- terraform plan (any environment â€” plan is read-only)
- terraform show, terraform state list, terraform output

### Cloud CLI (Inspection)
- aws sts get-caller-identity, aws configure list
- aws s3 ls, aws ec2 describe-*, aws eks describe-*
- az account show, az group list, az aks show
- gcloud config list, gcloud container clusters describe
- gcloud projects list, gcloud auth list

### Local Debugging & Scripting
- Run any local script with .ps1, .sh, .cmd that is clearly for inspection or automation
- pwsh, bash, sh for utility commands
- curl/wget for non-sensitive public endpoints
- ping, nslookup, Test-NetConnection, Resolve-DnsName
- Process listing: ps, Get-Process, tasklist
- Port checks: netstat, ss

---

## Actions Requiring Explicit User Confirmation

### Kubernetes (Destructive)
- kubectl delete any resource
- kubectl apply -f against production namespaces
- kubectl patch (production)
- kubectl rollout restart (production)
- kubectl scale (production)
- kubectl exec (interactive shell into prod pods)

### Helm (Destructive)
- helm upgrade in production environments
- helm uninstall
- helm rollback in production

### Terraform (Destructive)
- terraform apply (any environment)
- terraform destroy (any environment)
- terraform state mv, terraform state rm

### Infrastructure (Any Cloud)
- Creating, modifying, or deleting cloud resources
- IAM changes (roles, policies, bindings)
- Network changes (VPC, firewall rules, load balancers)
- Database changes (create/drop/migrate in production)
- DNS changes

### Host-Level Risk
- docker system prune -a
- mass file deletion outside workspace
- Changes to system-wide PATH, environment, or registry
- Disabling security controls permanently
- Admin elevation (sudo, runas)

### Credentials & Secrets
- Any read or write to credential stores
- Any operation requiring tokens/MFA/browser auth

---

## Secret Handling â€” NEVER Automatically

These paths and patterns must never be automatically read, printed, or modified:

```
.env
.env.*
secrets/**
**/*secret*
**/*password*
**/*credential*
~/.ssh/**
~/.gnupg/**
~/.aws/credentials
~/.azure/**
~/.kube/config   (unless needed for validation, never echo contents)
```

If access is needed: explain why, minimize exposure, never echo values.

---

## Response Style

- Lead with action, not explanation.
- If you completed work, summarize what changed â€” do not re-explain the plan.
- Keep responses concise. One sentence if possible, paragraph if needed.
- Use file paths with line references when pointing to code.
- Do not ask "does this plan look good?" for obvious next steps.
- Do not say "I'll now proceed toâ€¦" â€” just proceed.
- After completing a loop: one-paragraph summary of what was done, what changed, any remaining blockers.

---

## Mode Definitions

### Smart Mode (Default)
- All inspection commands: automatic
- Local writes/edits/scripts: automatic
- Git within workspace: automatic
- Docker/K8s/Helm inspection: automatic
- Terraform plan: automatic
- Cloud CLI inspection: automatic
- Destructive infra changes: require confirmation

### Yolo/Noprompt Mode (Launchers: *-yolo.cmd, *-noprompt.cmd)
- Everything in smart mode: automatic
- Additionally attempts to skip confirmation prompts via tool flags
- User accepts that mistakes in this mode are harder to reverse
- Secrets and production destructive actions still blocked

---

## DevOps Context Defaults

Treat the following as normal, iterative work loops â€” no friction:

**K8s Troubleshooting Loop:**
```
kubectl get pods -A â†’ kubectl describe pod <x> -n <ns> â†’ kubectl logs <x> -n <ns> â†’ kubectl get events -n <ns>
```

**Helm Audit Loop:**
```
helm list -A â†’ helm get values <release> -n <ns> â†’ helm history <release> -n <ns>
```

**Terraform Audit Loop:**
```
terraform init â†’ terraform validate â†’ terraform plan â†’ review output
```

**Docker Debug Loop:**
```
docker ps -a â†’ docker logs <id> â†’ docker inspect <id>
```

**Git Audit Loop:**
```
git log --oneline -20 â†’ git diff HEAD â†’ git status
```

---

## Environment-Specific Notes (Windows + VS Code)

- Shell: PowerShell (pwsh) preferred, bash/sh acceptable
- Scripts: prefer .ps1 for Windows automation, .cmd for launchers
- Paths: use forward slashes in configs, backslashes only when Windows APIs require
- VS Code: treat as the primary editor context
- WSL2: if available, prefer for Linux-native tooling
- Docker Desktop: if available, treat containers as safe local sandbox

---

## GitHub Integration

**Safe-root (canonical):** `<SAFE_ROOT>`

### Token â€” AGENTS NEVER HOLD RAW TOKENS

**Claude**: uses MCP server â€” token managed internally by the MCP process, not visible to Claude.
**Codex / Gemini**: use `gh` CLI â€” token managed internally by gh, not visible to scripts.

Agents must NEVER call `auth.ps1` to get a raw token and use it in script variables.
If a script needs to call the raw Device Flow token (e.g. automated watcher), use the push wrapper scripts (`push-*.cmd`) which encapsulate auth entirely.

### Claude (MCP â€” native)
Config: `~/.claude/settings.json` â†’ `mcpServers.github`
MCP server: `<SAFE_ROOT>\..\bin\srv.ps1` (pre-installed local binary, no npm traffic at runtime)
Tools: `list_workflow_runs`, `get_job_for_workflow_run`, `get_file_contents`, `create_or_update_file`, `create_pull_request`

### Codex and Gemini â€” use gh CLI (no raw token)
```powershell
$gh = 'C:\Program Files\GitHub CLI\gh.exe'
# Check: & $gh auth status
# CI monitoring:
& $gh run list --repo owner/repo --limit 5
& $gh run watch $runId --repo owner/repo --exit-status
& $gh run view $runId --repo owner/repo --log-failed
# API calls:
$r = & $gh api "repos/owner/repo/contents/path/to/file" | ConvertFrom-Json
```

Full reference: `docs/github-api-integration.md`

### git push with auth â€” wrapper scripts (token never in AI script scope)
Use the existing push wrappers which handle auth internally:
- `push-controller-main.cmd` / `push-agent-main.cmd` â€” source repos
- `push-deploy-controller-hml.cmd` / `push-deploy-agent-hml.cmd` â€” deploy repos
- `push-cap-agent-main.cmd` â€” CAP mirror
- `push-github-with-token.ps1` â€” generic wrapper (uses GIT_CONFIG_* env vars internally)

If a new push script must be written, it MUST use GIT_CONFIG_* env vars (not -c args):
```powershell
# Inside push wrapper only â€” not in AI-facing scripts
$env:GIT_CONFIG_COUNT = 1; $env:GIT_CONFIG_KEY_0 = "http.https://github.com/.extraheader"
$env:GIT_CONFIG_VALUE_0 = "AUTHORIZATION: basic <base64(x-access-token:$token)>"
try { & git -C $repoPath push origin HEAD:main }
finally { Remove-Item env:GIT_CONFIG_COUNT,env:GIT_CONFIG_KEY_0,env:GIT_CONFIG_VALUE_0 -EA SilentlyContinue }
```

Never hardcode tokens. Never store tokens in ai-sync files. Never in process command-line args.

---

## Security & Compliance Routine (ALL agents, EVERY new implementation)

Mandatory. Apply when writing, reviewing, or refactoring any script, launcher, config, or workflow.
All 3 AIs (Claude, Codex, Gemini) enforce these without exception.

### 1. No raw token handling by AI agents
- NEVER: `DPAPI`, `ConvertTo-SecureString`, `ConvertFrom-SecureString`, `Credential Manager`, `cmdkey`, `Get-StoredCredential`, `Windows.Security.Cryptography`, `SecretManagement`
- NEVER: call `auth.ps1` and hold the returned token in a script variable for REST calls
- ALWAYS: `gh api` / `gh run` CLI for GitHub operations â€” auth is internal to gh, invisible to AI
- ALWAYS: push wrapper scripts (`push-*.cmd`, `push-github-with-token.ps1`) for git operations â€” auth is internal to the wrapper
- EXCEPTION: automated watchers/release scripts that cannot use gh CLI may call `auth.ps1` internally, but must clear the token immediately after use

### 2. No tokens in process command-line arguments
- NEVER: `-c http.*.extraheader=AUTHORIZATION:...` as git argument (visible to process monitors and EDR)
- ALWAYS: `GIT_CONFIG_*` env vars (key/value pairs), cleared immediately after the push completes

### 3. No npm registry traffic at runtime
- NEVER: `npx -y package-name` or any `npx` invocation that fetches from npm at runtime
- ALWAYS: pre-install packages locally via `bin/setup.ps1` and launch via `node.exe dist/index.js`
- MCP server entry: `<SAFE_ROOT>\..\bin\mcp-server\node_modules\@modelcontextprotocol\server-github\dist\index.js`

### 4. No AI/tool references in file or directory names
- NEVER name files/dirs: claude, codex, gemini, openai, anthropic, mcp, ai-launchers, gpt
- Launcher convention: `t1.cmd` (Claude), `t2.cmd` (Codex), `t3.cmd` (Gemini), `t1-x.cmd` (yolo), etc.
- Server: `srv.ps1` | Auth: `auth.ps1` | Setup: `setup.ps1`

### 5. Project inside hidden directory
- Canonical home: `<SAFE_ROOT>` (Hidden attribute + dot-prefix)
- Access: VS Code workspace `<USER_HOME>\.ops\ws.code-workspace` only
- Launchers: `<SAFE_ROOT>\..\bin\`
- NEVER canonical state in `AUTOMACAO` (OneDrive-synced, SOC accessible)

### 6. No secrets on disk
- `secrets/` contains only kubeconfig (no tokens, no passwords, no API keys)
- Tokens: Device Flow â†’ in-memory â†’ cleared at session end
- No `.env` with credentials, no `*.secure.txt`, no `*.encrypted` token files

### 7. No company data in personal product repo
- Personal repo: `https://github.com/lucassfreiree/autopilot/`
- NEVER push: your-org/ repo names, YourCompany references, corporate URLs/emails (`@corp.yourcompany.com`), corporate paths, kubeconfig, corporate release versions

### Checklist â€” apply to every new implementation
```
[ ] No DPAPI or Credential Manager
[ ] Tokens via Device Flow, in-memory only
[ ] git auth via GIT_CONFIG_* env vars (not -c args)
[ ] No runtime npx/npm downloads for pre-installed tools
[ ] File/dir names: no AI tool names
[ ] Project inside hidden .ops directory
[ ] No company data in personal repo push
```

---

## Alignment Statement

This file is the single source of truth for all AI agent behavior in this environment.
Updated: 2026-03-20
Codex, Claude Code, and Gemini CLI each reference this file and treat it as authoritative.
When in doubt: **inspect freely, change carefully, destroy only when asked.**

