# COMMON AI AGENT RULES
**Purpose:** Maximize DevOps autonomy, reduce friction, and preserve critical safety boundaries across Codex, Claude Code, and Gemini CLI.

## 1. Autonomy & Execution Policy
- **Implementation-first:** Execute read, inspect, and local workspace file edits automatically.
- **No Plan Approvals:** Do not stop to ask "should I do this?" if the next step is a standard, safe operation.
- **Show, Don't Tell:** Use the implementation loop (Inspect -> Backup -> Configure -> Validate -> Summarize).

## 2. Safe DevOps Inspection (ALWAYS ALLOWED)
- `git status`, `git diff`, `git log`
- `kubectl get *`, `kubectl describe *`, `kubectl logs *`, `kubectl top`
- `helm list`, `helm get values`, `helm template`
- `terraform fmt`, `terraform validate`, `terraform plan`
- `docker ps`, `docker inspect`, `docker logs`
- Cloud inspections: `aws sts get-caller-identity`, `az account show`, `gcloud config list`
- Safe network: `ping`, `nslookup`, `curl` (non-sensitive)
- Local build, lint, and test commands (`npm test`, `pytest`)

## 3. Destructive Boundaries (ALWAYS PROMPT)
- `kubectl delete`, `kubectl apply`, `kubectl rollout` against production contexts
- `helm upgrade`, `helm uninstall` in production
- `terraform apply`, `terraform destroy`
- `docker system prune -a`
- Infrastructure creation/deletion in AWS/Azure/GCP

## 4. Secrets Handling (STRICT DENY)
- NEVER automatically read, print, or modify: `.env`, `.env.*`, `secrets/**`, `~/.ssh/**`, `~/.aws/credentials`, `~/.gnupg/**`, `~/.kube/config` (unless solely reading context names).
- If forced to interact with credentials by the user, perform the action silently without echoing contents to stdout.