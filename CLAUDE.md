# Autopilot - Claude Code Instructions

## What is Autopilot
Web-only CI/CD control plane for multi-workspace, multi-agent release orchestration.
Zero local dependencies. 100% GitHub-native.

## Architecture
- **Repo**: `lucassfreiree/autopilot` (personal product / control plane)
- **State**: `autopilot-state` branch (runtime state, locks, audit, handoffs)
- **Backups**: `autopilot-backups` branch (snapshots for rollback)
- **Panel**: GitHub Pages (`panel/`) — deployed via `deploy-panel.yml`
- **Corporate repos**: Configured per workspace in `workspace.json`

## Key Files
- `schemas/` — JSON schemas for all state objects (release-state, health, lock, audit, etc.)
- `contracts/` — Agent contracts (shared + per-agent)
  - `contracts/shared-agent-context.md` — Shared context documentation for all agents
  - `contracts/codex-deploy-guide.md` — Codex-specific deploy guide
  - `contracts/codex-session-memory.json` — Codex cumulative session memory
- `.github/workflows/` — All automation workflows
- `AGENTS.md` — Legacy Codex prompt (workflow disabled, file kept for reference)
- `panel/` — GitHub Pages control plane UI (`panel/index.html`)
- `compliance/` — Data governance policies
  - `compliance/personal-product/product-compliance.policy.json` — Scans for corporate identifiers (`.intranet.` domains)
  - `compliance/personal-product/product-export.rules.json` — Export/data governance rules
- `trigger/` — Trigger input files for workflow dispatch (bumping `run` field triggers the workflow)
- `integrations/` — External tool integrations (LangChain, Kubernetes, n8n)
- `HANDOFF.md` — Bilingual handoff documentation for ChatGPT/Codex (contains corporate repo details, release history)
- `pending/` — Pending workflows not yet installed (e.g., `release-autopilot.yml`)
- `pending-workflows/` — Workflow drafts with installation guide (`INSTALL.md`, `agent-release.yml`, `init-state-branch.yml`)
- `snapshots/` — Local state snapshots for rollback (e.g., `snapshots/20260321-214500/`)
- `scripts/` — Utility scripts
  - `scripts/codex/sync-autopilot-product.sh` — Sync autopilot product changes to GitHub
  - `scripts/codex/auto-pr-merge.sh` — Auto create PR and merge for Codex branches
- `patches/` — Source code patches applied to corporate repos via apply-source-change pipeline
- `references/` — Reference files from corporate repos not yet migrated to GitHub
  - `references/controller-cap/values.yaml` — Controller CAP values.yaml (source: GitHub `bbvinet/psc_releases_cap_sre-aut-controller`, auto-promoted by Stage 4)
- `.claude/skills/` — Autonomous specialist skills (DevOps/SRE/Cloud/Observability/Security)
  - `.claude/skills/devops-sre-cloud.md` — K8s, Terraform, CI/CD, AWS/Azure/GCP, production IaC
  - `.claude/skills/observability.md` — Prometheus, Grafana, Loki, OpenTelemetry, SLO framework
  - `.claude/skills/security-expert.md` — OWASP, container hardening, supply chain, prompt injection
- `.claude/rules/` — Behavior rules for Claude Code
  - `.claude/rules/autonomous-devops-sre.md` — Autonomous DevOps/SRE specialist behavior
  - `.claude/rules/token-efficiency.md` — Token usage optimization rules
  - `.claude/rules/token-auto-optimization.md` — Auto-optimization for token costs
  - `.claude/rules/cost-reduction-mandate.md` — Owner directive for cost minimization
- `.claude/intelligence/` — Auto-generated community intelligence sync reports
- `ops/` — Operational environment (scripts, runbooks, templates, checklists)
  - `ops/ops-config.json` — Operational environment master config
  - `ops/scripts/` — Executable operational scripts by domain
  - `ops/runbooks/` — Operational runbooks by domain (incidents, pipelines, k8s, terraform, cloud, monitoring)
  - `ops/templates/` — Reusable templates (CI/CD, K8s, Terraform, monitoring)
  - `ops/checklists/` — Operational checklists (deploy, new-environment, troubleshooting)
  - `ops/logs/` — Auto-generated operational logs (gitignored)

### Schemas (full list)
| Schema | Validates |
|--------|-----------|
| `approval.schema.json` | Release approvals |
| `audit.schema.json` | Audit trail entries |
| `handoff.schema.json` | Agent handoff queue items |
| `health-state.schema.json` | Health check results |
| `improvement.schema.json` | Improvement records |
| `improvement-report.schema.json` | Improvement scan reports |
| `lock.schema.json` | Session and operation locks |
| `metrics.schema.json` | Daily metrics snapshots |
| `release-freeze.schema.json` | Release freeze state |
| `release-state.schema.json` | Release state (agent/controller) |
| `workspace.schema.json` | Workspace configuration |

## Integrations (all zero-cost, open-source)

### LangChain (`integrations/langchain/`)
Intelligent agent orchestration replacing rigid shell-script decision trees.
- `orchestrator.py` — Main LangChain agent with tool-calling loop
- `tools.py` — Custom tools (read state, trigger workflows, create handoffs)
- `memory.py` — RAG memory from autopilot-state branch
- `requirements.txt` — Python dependencies
- `README.md` — Integration guide
- Workflow: `langchain-orchestrator.yml` (runs in GitHub Actions)
- Tasks: `analyze-ci-failure`, `smart-release`, `triage-handoff`, `health-response`

### Kubernetes (`integrations/kubernetes/`)
K8s manifests for self-hosted infrastructure (deploy on any free cluster).
- `namespace.yml` — Workspace namespace + resource quotas
- `runner-deployment.yml` — Self-hosted GitHub Actions runner
- `cronjobs.yml` — Health check, improvement scan, backup, lock GC
- `secrets.yml` — Template for K8s secrets (tokens, API keys)
- `kustomization.yml` — Deploy all: `kubectl apply -k integrations/kubernetes/`
- `README.md` — Integration guide

### n8n (`integrations/n8n/`)
Visual automation and external integrations (100% self-hosted, open-source).
- `docker-compose.yml` — Run locally: `docker compose up -d`
- `workflows/ci-failure-alert.json` — CI failure → Slack + auto-fix
- `workflows/release-notify.json` — Release complete → Slack
- `workflows/health-monitor.json` — Periodic health → alert if degraded
- `workflows/approval-gate.json` — Interactive Slack approval for releases
- `README.md` — Integration guide

## Context Separation (CRITICAL — Multi-Company Isolation)

This control plane manages **multiple companies** from a single point. Each company is a **completely isolated context**.
Full separation guide: `ops/docs/workspace-separation.md`

> ⚠️ **ATENÇÃO:** `ws-socnew` e `ws-corp-1` pertencem a **terceiros** (irmão do proprietário). **NUNCA operar sem autorização explícita e escrita do proprietário da conta.** Ver seção "Workspaces Bloqueados" abaixo.

### Company Contexts

| | **Getronics** (ws-default) | **CIT** (ws-cit) |
|---|---|---|
| **Workspace** | `ws-default` | `ws-cit` |
| **Machine** | Getronics workstation | CIT workstation |
| **Stack** | Node/TypeScript (NestJS, Jest) | DevOps (K8s, Docker, Terraform, IaC, CI/CD) |
| **Repos** | `bbvinet/psc-sre-automacao-*` | To be configured |
| **Token** | `BBVINET_TOKEN` | `CIT_TOKEN` (when available) |
| **Data Classification** | Confidential | Internal |
| **Quick Index** | `ops/config/workspaces/ws-default.json` | `ops/config/workspaces/ws-cit.json` |
| **Trigger Label** | `_context: "GETRONICS \| ws-default \| BBVINET_TOKEN"` | `_context: "CIT \| ws-cit \| CIT_TOKEN"` |

### Blocked Workspaces (Third-Party — DO NOT OPERATE)
| Workspace | Owner | Policy |
|-----------|-------|--------|
| `ws-socnew` | Terceiro (irmão do proprietário) | 🔴 **BLOQUEADO** — NÃO OPERAR SEM AUTORIZAÇÃO EXPLÍCITA |
| `ws-corp-1` | Terceiro | 🔴 **BLOQUEADO** — NÃO OPERAR SEM AUTORIZAÇÃO EXPLÍCITA |

### Workspace Navigation (for agents)
| What you need | Where to find |
|---------------|---------------|
| Which company am I working with? | Check `workspace_id` in trigger file or user context |
| Company config and repos | `state/workspaces/<ws_id>/workspace.json` |
| Quick visual index | `ops/config/workspaces/<ws_id>.json` |
| Which token to use | `workspace.json → credentials.tokenSecretName` |
| Which workflows work for this workspace | `ops/config/workspaces/<ws_id>.json → workflows_that_use_this_workspace` |
| Full separation rules | `ops/docs/workspace-separation.md` |

### Workflow Scope Classification
| Prefix | Scope | Safe for all workspaces? |
|--------|-------|--------------------------|
| `[Corp]` | Corporate pipeline operations | **NO** — currently hardcoded to BBVINET_TOKEN (ws-default only) |
| `[Core]` | Control plane operations | **YES** — workspace-aware, reads from state |
| `[Release]` | Release management | **YES** — reads workspace.json dynamically |
| `[Infra]` | Infrastructure/maintenance | **PARTIAL** — some hardcoded to ws-default |
| `[Agent]` | Agent coordination | **PARTIAL** — check per workflow |
| `Ops:` | Operational tasks (CIT focus) | **YES** — shared, accepts workspace_id input |

### Autopilot vs Corporate Context (per company)

| | **Autopilot (Control Plane)** | **Corporate (per workspace)** |
|---|---|---|
| **Repo** | `lucassfreiree/autopilot` | Configured in workspace.json `repos[]` |
| **Commits** | PRs do Claude (`claude/*` → PR → squash merge) | Commits via workspace token |
| **CI** | GitHub Actions do autopilot | CI pipeline da empresa (configurado por workspace) |
| **SHAs** | SHA do merge no autopilot | SHA do commit no repo corporativo (DIFERENTE!) |

### Workspace Identification (MANDATORY — Before ANY Operation)
**Nenhum workspace e "default".** O agente DEVE identificar qual empresa/workspace pelo contexto da conversa antes de qualquer acao.
1. Identificar pistas no contexto: nome da empresa, repos, stack, ferramentas mencionadas
2. Se Getronics/controller/agent/NestJS/bbvinet/esteira → `ws-default`
3. Se CIT/DevOps/Terraform/K8s/cloud/monitoring/infra → `ws-cit`
4. Se SocNew/socnew → `ws-socnew` → **PARAR — workspace de terceiro, solicitar autorização**
5. Se Corp-1/corp1 → `ws-corp-1` → **PARAR — workspace de terceiro, solicitar autorização**
6. Se ambiguo → **PERGUNTAR ao usuario** antes de prosseguir
7. Uma vez identificado, ler `state/workspaces/<ws_id>/workspace.json` para config
8. Quick index: `ops/config/workspaces/<ws_id>.json`

### Workspaces Bloqueados (POLÍTICA CRÍTICA)
`ws-socnew` e `ws-corp-1` **pertencem a terceiros** (irmão do proprietário da conta `lucassfreiree`).

**NUNCA:**
- Executar operações nesses workspaces sem autorização **explícita e escrita** do proprietário
- Ler, escrever ou modificar `state/workspaces/ws-socnew/` ou `state/workspaces/ws-corp-1/`
- Usar repos corporativos de `ws-socnew` ou `ws-corp-1`
- Executar workflows em nome desses workspaces
- Disparar triggers com `workspace_id: ws-socnew` ou `workspace_id: ws-corp-1`

**Em caso de dúvida: NÃO OPERAR. Perguntar primeiro.**

Esta política deve ser aplicada por TODOS os agentes (Claude, Codex, Copilot, ChatGPT) e documentada em todos os artefatos agentic.

### Isolation Rules
1. **NUNCA** assumir um workspace como padrao — sempre identificar pelo contexto
2. **NUNCA** misturar dados, commits, credenciais ou estado entre empresas
3. **Cada workspace** usa exclusivamente seu proprio token (secret name em `credentials.tokenSecretName`)
4. **Monitorar SEPARADAMENTE**: workflow do autopilot vs CI de cada empresa
5. Quando usuario menciona CI/esteira → identificar QUAL empresa antes de agir
6. **Sucesso do apply-source-change NAO garante sucesso do CI corporativo** (vale para todas as empresas)
7. **Em caso de duvida, o padrao e isolamento** — nunca assumir que contextos podem ser compartilhados
8. Os SHAs sao DIFERENTES entre autopilot e cada repo corporativo
9. **`ws-socnew` e `ws-corp-1` sao de TERCEIROS** — NUNCA operar sem autorização explícita e documentada de `lucassfreiree`

### Getronics-Specific Rules
1. Esteira de Build NPM (runner corporativo) — monitorar via `ci-diagnose.yml`
2. Logs reais: `ci-logs-controller-*.txt` no autopilot-state (NAO `ci-diagnosis-controller.json`)
3. CI Gate pode passar com "pre-existing detection" mesmo quando esteira falha
4. Controller CAP now on GitHub (`bbvinet/psc_releases_cap_sre-aut-controller`) — auto-promote ENABLED in Stage 4 after corporate CI passes

### CIT-Specific Rules
1. Stack DevOps — foco em infraestrutura, automacao, containers, IaC
2. Repos e pipelines serao configurados conforme demanda
3. Operacoes iniciais nao requerem deploy pipeline — foco em organizacao e tooling
4. Ambiente operacional completo em `ops/` — scripts, runbooks, templates, checklists
5. Multi-cloud ready: AWS, Azure, GCP (conforme acessos disponiveis)
6. Multi-CI ready: GitLab CI, GitHub Actions, Jenkins
7. IaC: Terraform + Terragrunt com templates e wrappers operacionais
8. Monitoring: Datadog, Grafana, Prometheus, Alertmanager com templates de alertas e dashboards

## Operational Environment (`ops/`)

Centro operacional para atividades de DevOps, SRE, Cloud e Automation. Compartilhado entre workspaces, com foco inicial na CIT.

### Scripts Operacionais
| Script | Path | Uso |
|--------|------|-----|
| Universal Diagnostics | `ops/scripts/troubleshooting/diagnose.sh` | `./diagnose.sh endpoint\|pod\|service\|dns\|node\|system` |
| Pipeline Analyzer | `ops/scripts/ci/analyze-pipeline.sh` | `./analyze-pipeline.sh github\|gitlab\|jenkins <args>` |
| Cluster Health | `ops/scripts/k8s/cluster-health.sh` | `./cluster-health.sh [namespace\|--all-namespaces]` |
| Terraform Ops | `ops/scripts/terraform/tf-ops.sh` | `./tf-ops.sh plan\|apply\|validate\|drift\|fmt <path>` |
| Cloud Auth Check | `ops/scripts/cloud/cloud-check.sh` | `./cloud-check.sh aws\|azure\|gcp\|all [resources]` |
| Alert Check | `ops/scripts/monitoring/alert-check.sh` | `./alert-check.sh datadog\|grafana\|prometheus\|alertmanager` |
| Ops Logger | `ops/scripts/utils/ops-logger.sh` | `source ops-logger.sh; ops_log "action" "desc" "result"` |

### Runbooks
| Runbook | Path | Conteudo |
|---------|------|----------|
| Incident Response | `ops/runbooks/incidents/incident-response.json` | SOP completo P1-P4 com 5 fases |
| Pipeline Troubleshooting | `ops/runbooks/pipelines/pipeline-troubleshooting.json` | Falhas comuns GitHub/GitLab/Jenkins |
| K8s Common Issues | `ops/runbooks/k8s/k8s-common-issues.json` | CrashLoop, ImagePull, Pending, HPA, Ingress |
| Terraform Operations | `ops/runbooks/terraform/terraform-operations.json` | State lock, drift, import, best practices |
| Cloud Operations | `ops/runbooks/cloud/cloud-operations.json` | AWS/Azure/GCP common tasks e troubleshooting |
| Monitoring Setup | `ops/runbooks/monitoring/monitoring-setup.json` | Datadog, Prometheus/Grafana, SLO framework |

### Templates
| Template | Path | Para que |
|----------|------|---------|
| GitLab CI | `ops/templates/ci/gitlab-ci-template.yml` | Pipeline multi-stage com security scan |
| GitHub Actions | `ops/templates/ci/github-actions-template.yml` | CI/CD com build, test, deploy |
| Jenkinsfile | `ops/templates/ci/jenkinsfile-template.groovy` | Declarative pipeline com parallel stages |
| Terraform Module | `ops/templates/terraform/module-template/` | Modulo base com variables e outputs |
| S3 Backend | `ops/templates/terraform/backend-s3.tf` | Remote state com DynamoDB locking |
| K8s Deployment | `ops/templates/k8s/deployment-template.yaml` | Deployment + Service + HPA production-ready |
| Prometheus Alerts | `ops/templates/monitoring/prometheus-alerts-template.yml` | Alertas infra + K8s + application |
| Grafana Dashboard | `ops/templates/monitoring/grafana-dashboard-template.json` | Dashboard de servico com RED metrics |

### Checklists
| Checklist | Path | Quando usar |
|-----------|------|-------------|
| New Environment | `ops/checklists/new-environment.json` | Setup de novo ambiente (infra, CI, monitoring, security) |
| Deploy | `ops/checklists/deploy-checklist.json` | Pre-deploy, during, post-deploy, rollback triggers |
| Troubleshooting | `ops/checklists/troubleshooting-checklist.json` | Metodologia estruturada de troubleshooting |

### Operational Logging
- Log file: `ops/logs/ops-log.jsonl` (gitignored, local only)
- Format: JSON Lines (one entry per line)
- Usage: `source ops/scripts/utils/ops-logger.sh && ops_log "action" "description" "result" "details"`
- Search: `ops_log_search "keyword"` | View recent: `ops_log_tail 20`

### Per-Tool Configuration (`ops/config/`)
| Config | Path | Status |
|--------|------|--------|
| AWS | `ops/config/cloud/aws/aws-config.json` | Placeholder (awaiting credentials) |
| Azure | `ops/config/cloud/azure/azure-config.json` | Placeholder (awaiting credentials) |
| GCP | `ops/config/cloud/gcp/gcp-config.json` | Placeholder (awaiting credentials) |
| GitHub | `ops/config/ci/github/github-config.json` | Active |
| GitLab CI | `ops/config/ci/gitlab/gitlab-config.json` | Placeholder |
| Jenkins | `ops/config/ci/jenkins/jenkins-config.json` | Placeholder |
| Kubernetes | `ops/config/k8s/k8s-config.json` | Placeholder (awaiting cluster access) |
| Terraform | `ops/config/terraform/terraform-config.json` | Placeholder (awaiting backend) |
| Datadog | `ops/config/monitoring/datadog/datadog-config.json` | Placeholder |
| Grafana | `ops/config/monitoring/grafana/grafana-config.json` | Placeholder |
| Prometheus | `ops/config/monitoring/prometheus/prometheus-config.json` | Placeholder |

### Operational Workflows (GitHub Actions)
| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ops-cloud-diagnose.yml` | manual | Multi-cloud auth check and resource listing |
| `ops-tf-plan.yml` | manual | Terraform plan/validate/drift for any module |
| `ops-k8s-health.yml` | manual | K8s cluster health check via cloud provider |
| `ops-monitor-alerts.yml` | manual + schedule (6h) | Check active alerts across monitoring platforms |
| `ops-pipeline-diagnose.yml` | manual | Cross-platform pipeline failure analysis |

### Integration Registry
- Registry file: `ops/integrations/registry.json`
- Webhook contracts: `ops/integrations/contracts/`
- Supported integrations: Slack, Datadog, Grafana, Prometheus, Terraform Cloud, GitHub API

### Automation Runtimes
| Runtime | Location | Setup |
|---------|----------|-------|
| Shell (primary) | `ops/scripts/<domain>/` | Ready — all scripts executable |
| Python | `ops/scripts/python/` | `pip install -r requirements.txt` |
| Node.js | `ops/scripts/node/` | `npm install` |
| Shared utilities | `ops_utils.py` / `ops-utils.js` | OpsLogger, apiRequest, loadConfig |

### Terraform Structure
```
ops/terraform/
  README.md                   # Terraform setup guide
  environments/dev/           # Dev environment (placeholder)
  environments/staging/       # Staging environment (placeholder)
  environments/production/    # Production environment (placeholder)
```

### Operational Documentation
| Doc | Path |
|-----|------|
| Overview | `ops/docs/README.md` |
| GitHub & Actions | `ops/docs/github-ops.md` |
| Cloud (AWS/Azure/GCP) | `ops/docs/cloud-ops.md` |
| Terraform | `ops/docs/terraform-ops.md` |
| Kubernetes | `ops/docs/k8s-ops.md` |
| CI/CD (GitLab/Jenkins) | `ops/docs/ci-ops.md` |
| Monitoring | `ops/docs/monitoring-ops.md` |
| Automation Scripts | `ops/docs/automation-ops.md` |
| Workspace Separation | `ops/docs/workspace-separation.md` |
| Agent Parity | `ops/docs/agent-operational-parity.md` |
| **Deploy Process Guide** | `ops/docs/deploy-process/` (12 docs) |

### Deploy Process Guide (`ops/docs/deploy-process/`)

Documentacao completa e detalhada de TODO o processo de deploy end-to-end, dividida em 12 fases:

| # | Fase | Arquivo |
|---|------|---------|
| 01 | Overview e Pre-requisitos | `ops/docs/deploy-process/01-overview-and-prerequisites.md` |
| 02 | Clone e Setup Local | `ops/docs/deploy-process/02-clone-and-setup.md` |
| 03 | Fetch Arquivos Corporativos | `ops/docs/deploy-process/03-fetch-corporate-files.md` |
| 04 | Alteracoes no Codigo e Patches | `ops/docs/deploy-process/04-code-changes-and-patches.md` |
| 05 | Version Bump (5 Arquivos) | `ops/docs/deploy-process/05-version-bump.md` |
| 06 | Configurar Trigger de Deploy | `ops/docs/deploy-process/06-configure-trigger.md` |
| 07 | Commit, Push, PR e Merge | `ops/docs/deploy-process/07-commit-push-pr-merge.md` |
| 08 | Monitorar Workflow Autopilot (7 Stages) | `ops/docs/deploy-process/08-monitor-autopilot-workflow.md` |
| 09 | Monitorar Esteira Corporativa | `ops/docs/deploy-process/09-monitor-corporate-ci.md` |
| 10 | Promocao CAP (Tag de Deploy) | `ops/docs/deploy-process/10-cap-tag-promotion.md` |
| 11 | Diagnostico e Troubleshooting | `ops/docs/deploy-process/11-diagnostics-and-troubleshooting.md` |
| 12 | Quick Reference | `ops/docs/deploy-process/12-quick-reference.md` |

### Operational Readiness Tracker
- File: `ops/inventory/readiness.json`
- Tracks per-tool: structure, config, scripts, workflows, docs, credentials
- Agent operational memory: `ops/inventory/agent-operational-memory.md`
- Workflow topology: `ops/inventory/workflow-topology.json` + `ops/inventory/workflow-topology.md`
- Current readiness: **17%** (2/12 tools fully ready, structure 100% complete)

## Rules
1. Never store corporate code, secrets, or internal URLs in this repo
2. Always use workspace_id — never hardcode tenant/org names
3. Read workspace.json for all repo/branch/path config
4. Acquire lock before writing release state, release after
5. Write audit entry after every state mutation
6. State on `autopilot-state` is source of truth, not agent memory
7. Never use regex to edit YAML in production — use structured tools
8. Never expose secrets in commit messages or logs
9. Always validate jq output with fallbacks: `jq -r '.field // ""' 2>/dev/null || echo ""`
10. Use base64 encoding when passing content between workflow jobs (avoids shell quoting issues)

## Corporate Repos — Getronics (ws-default)

All 4 repos below are on GitHub under `bbvinet` org. Access via `BBVINET_TOKEN`.

### Source Code Repos (where application code lives)

| Repo | Role | Current Version | Stack | CI |
|------|------|-----------------|-------|----|
| [`bbvinet/psc-sre-automacao-controller`](https://github.com/bbvinet/psc-sre-automacao-controller) | Controller — orchestrates automations, dispatches to agents, manages execution logs | 3.7.3 | Node 22, TypeScript, Express, Jest | Esteira de Build NPM (corporate runner) |
| [`bbvinet/psc-sre-automacao-agent`](https://github.com/bbvinet/psc-sre-automacao-agent) | Agent — executes automations on clusters, receives cronjob callbacks, pushes logs to controller | 2.3.3 | Node 22, TypeScript, Express, Jest, K8s client | Esteira de Build NPM (corporate runner) |

**How to work with source repos:**
- **Read files**: `fetch-files.yml` workflow (trigger via `trigger/fetch-files.json`)
- **Push changes**: `apply-source-change.yml` workflow (trigger via `trigger/source-change.json`)
- **Check CI status**: `ci-status-check.yml` (trigger via `trigger/ci-status.json`) — reads check-runs + workflow-runs for a commit
- **Diagnose CI failure**: `ci-diagnose.yml` (trigger via `trigger/ci-diagnose.json`) — downloads logs, reproduces locally
- **CI logs**: saved in `state/workspaces/ws-default/ci-logs-<component>-<job_id>.txt` on autopilot-state
- **CI status result**: saved in `state/workspaces/ws-default/ci-status-<component>.json` on autopilot-state
- **NEVER push directly** — always via `apply-source-change.yml` with `BBVINET_TOKEN`

### CAP/Deploy Repos (where K8s deploy manifests live)

| Repo | Role | Values Path | Auto-Promote |
|------|------|-------------|:---:|
| [`bbvinet/psc_releases_cap_sre-aut-controller`](https://github.com/bbvinet/psc_releases_cap_sre-aut-controller) | Controller CAP — K8s deployment manifest (Deployment, Service, Ingress, RBAC, Secrets) | `releases/openshift/hml/deploy/values.yaml` | Yes (Stage 4) |
| [`bbvinet/psc_releases_cap_sre-aut-agent`](https://github.com/bbvinet/psc_releases_cap_sre-aut-agent) | Agent CAP — K8s deployment manifest | `releases/openshift/hml/deploy/values.yaml` | Yes (Stage 4) |

**How to work with CAP repos:**
- **Auto-promote**: Stage 4 of `apply-source-change.yml` updates image tag after corporate CI passes
- **Manual promote**: `promote-cap.yml` workflow (trigger via `trigger/promote-cap.json`)
- **Image tag line**: `image: docker.binarios.intranet.bb.com.br/bb/psc/psc-sre-automacao-<component>:<TAG>`
- **Config source**: `workspace.json` fields `controller.capRepo` / `agent.capRepo` (on autopilot-state branch)
- **Reference file**: `references/controller-cap/values.yaml` (local copy for reference)

### Workspace Config Location
```
# autopilot-state branch (SOURCE OF TRUTH for workflows)
state/workspaces/ws-default/workspace.json
  → controller.sourceRepo, controller.capRepo, controller.capValuesPath, controller.imagePattern
  → agent.sourceRepo, agent.capRepo, agent.capValuesPath, agent.imagePattern

# main branch (local reference, may be in .gitignore)
state/workspaces/ws-default/workspace.json
```

**CRITICAL**: When adding new fields to workspace.json, update BOTH the local file AND the autopilot-state branch via GitHub API.

## Controller CAP (GitHub — auto-promote enabled)
- **CAP repo**: `bbvinet/psc_releases_cap_sre-aut-controller` (GitHub)
- **CAP values path**: `releases/openshift/hml/deploy/values.yaml`
- **Reference file**: `references/controller-cap/values.yaml`
- **Image**: `docker.binarios.intranet.bb.com.br/bb/psc/psc-sre-automacao-controller`
- **Current deployed tag**: `3.7.3`
- **Image line**: `image: docker.binarios.intranet.bb.com.br/bb/psc/psc-sre-automacao-controller:<TAG>`
- **K8s Secret**: `psc-sre-automacao-controller-runtime` (11 keys: JWT_SECRET, AUTH_API_KEYS_SCOPES, SCOPE_*, AWS_REGION, OSS_*)
- **K8s Secret**: `sre-controller-auth` (4 keys: OAS_TRUSTED_NAMESPACE, OAS_TRUSTED_SERVICE_ACCOUNT, OAS_ORIGIN_NAMESPACE_HEADERS, OAS_ORIGIN_SERVICE_ACCOUNT_HEADERS)
- **Trusted caller**: namespace=`sgh-oaas-playbook-jobs`, serviceAccount=`default`, header=`x-techbb-namespace`/`x-techbb-service-account`
- **Auto-promote**: Stage 4 of `apply-source-change.yml` updates tag in CAP repo **after corporate CI passes** (Esteira de Build NPM green). Reads `controller.capRepo` from `workspace.json`, uses `BBVINET_TOKEN` to commit via GitHub API.

## Workspaces

### Active Workspaces
| Workspace ID | Company | Status | Stack | Description |
|-------------|---------|--------|-------|-------------|
| `ws-default` | Getronics | Active | Node/TypeScript | Primary workspace (bbvinet corporate repos) |
| `ws-cit` | CIT | Active | DevOps | DevOps workspace (K8s, Docker, Terraform, CI/CD) |
| `ws-socnew` | SocNew (terceiro) | **🔒 LOCKED — NÃO OPERAR** | — | Pertence a terceiro — requer autorização explícita |
| `ws-corp-1` | Corp-1 (terceiro) | **🔒 LOCKED — NÃO OPERAR** | — | Pertence a terceiro — requer autorização explícita |

### Workspaces de Terceiros (BLOQUEADOS)

| Workspace ID | Status | Razão |
|---|---|---|
| `ws-socnew` | **BLOQUEADO — NÃO TOCAR** | Pertence a terceiro (irmão do proprietário) — requer autorização explícita |
| `ws-corp-1` | **BLOQUEADO — NÃO TOCAR** | Pertence a terceiro — requer autorização explícita |

**Regra**: Qualquer operação nesses workspaces SOMENTE pode ser executada com confirmação explícita e documentada do proprietário da conta (`lucassfreiree`). Mesmo que o workspace apareça na lista de workspaces disponíveis, tratá-lo como LOCKED. Isso inclui: ler state, disparar workflows, criar issues, modificar configuração, ou qualquer outra ação.

### State Location
```
state/workspaces/<workspace_id>/
  workspace.json              # Workspace config (repos, branches, paths)
  controller-release-state.json
  agent-release-state.json
  health.json
  release-freeze.json         # Release freeze state (created on demand)
  locks/                      # Created on demand by session-guard
    session-lock.json          # Multi-agent session lock
    <operation>-lock.json      # Per-operation locks (TTL-based)
  audit/
    <operation>-<timestamp>.json  # Immutable audit entries
  handoffs/                    # Agent handoff queue
  improvements/                # Improvement records
  approvals/                   # Release approvals (created on demand)
  metrics/                     # Created on demand by release-metrics
    YYYY-MM-DD.json            # Daily metrics snapshots
```

Note: Some directories (`locks/`, `approvals/`, `metrics/`, `release-freeze.json`) are created on demand by their respective workflows and may not exist until first use.

## Workflows

### Core Operations
| Workflow | Purpose |
|----------|---------|
| bootstrap.yml | Full setup (state branch, backup branch, workspace seed) |
| seed-workspace.yml | Create/update a workspace |
| health-check.yml | Hourly health validation |
| backup-state.yml | Snapshot state to backups branch |
| restore-state.yml | Rollback state from backups |
| workspace-lock-gc.yml | Clean up expired locks |

### Release Management
| Workflow | Purpose |
|----------|---------|
| release-controller.yml | Controller release template (freeze-aware) |
| release-agent.yml | Agent release template (freeze-aware) |
| release-freeze.yml | Freeze/unfreeze releases per workspace |
| release-approval.yml | Manual approval gate for releases |
| release-metrics.yml | Daily metrics collection and SLO tracking |

### Source Code Operations
| Workflow | Purpose |
|----------|---------|
| apply-source-change.yml | Apply code changes to corporate repos (7-stage pipeline) |
| fix-corporate-ci.yml | Auto-fix lint errors in corporate repos |
| fix-and-validate.yml | Fix both repos + trigger full flow validation |
| drift-correction.yml | Detect and auto-correct source/deploy drift |

### Testing & Validation
| Workflow | Purpose |
|----------|---------|
| compliance-gate.yml | **COMPLIANCE GATE** — 14 static checks + pull corporate + npm ci + tsc + eslint + jest + tag validation. Blocks merge. |
| post-deploy-validation.yml | **POST-DEPLOY** — Verifies source version, CAP tag, autopilot state, corporate CI result. Creates Issue on failure. |
| deploy-auto-learn.yml | **AUTO-LEARN** — Maps errors to patterns, generates learning report, updates compliance rules. |
| test-full-flow.yml | Full integration test (controller + agent + CAP) |
| test-corporate-flow.yml | Corporate flow test |

### Deploy Compliance Pipeline (OBRIGATORIO — 4 stages)
**NUNCA deployar sem validar primeiro.** O pipeline de compliance roda automaticamente em PRs e pos-deploy.

```
PR Created → Compliance Gate (14 checks) → apply-source-change (7 stages) → Post-Deploy Validation → Auto-Learn
```

#### Stage 1: Compliance Gate (PRE-DEPLOY — compliance-gate.yml)
| # | Rule | What | Severity |
|---|------|------|----------|
| 1 | version-format | No X.Y.10+ | error |
| 2 | version-4-files | Version in pkg, lock, swagger, cap | error |
| 3 | swagger-ascii | No accented characters | error |
| 4 | jwt-scope-singular | scope not scopes | error |
| 5 | no-validate-in-fetch | Breaks mock tests | error |
| 6 | no-nested-ternary | ESLint rejects | error |
| 7 | search-replace-newlines | sed can't handle | error |
| 8 | run-not-incremented | Workflow won't fire | error |
| 9 | blocked-workspace | Third-party isolation | error |
| 10 | security-xss | Input reflected without sanitize | error |
| 11 | security-ssrf | User input in fetch | error |
| 12 | security-dos-loop | Loop without MAX_RESULTS | error |
| 13 | hardcoded-secret | Secrets in patches | error |
| 14 | use-before-define | Function before definition | error |

**Pull & Test** (with BBVINET_TOKEN): Clone corporate → apply patches → npm ci → tsc → eslint → jest
**Tag Check**: Duplicate tag? → CAP current tag? → Reference values.yaml?

#### Stage 2: apply-source-change (DURING DEPLOY — 7 stages)
Setup → Session Guard → Apply & Push → CI Gate → Promote → Save State → Audit

#### Stage 3: Post-Deploy Validation (post-deploy-validation.yml)
| Check | What |
|-------|------|
| Source version | package.json in corporate repo matches expected |
| CAP tag | values.yaml image tag was promoted |
| Autopilot state | release-state.json updated correctly |
| Corporate CI | Esteira de Build NPM result |

#### Stage 4: Auto-Learn (deploy-auto-learn.yml)
Maps errors to known patterns, generates learning report with pipeline visualization, records improvements.
| npm ci | Instala dependencias reais | Dependencia faltando |
| tsc --noEmit | TypeScript build check | Erro de compilacao |
| eslint | Lint nos arquivos alterados | Regra ESLint violada |
| jest --ci | Roda TODOS os testes | Teste quebrado pelo patch |

**Script local**: `ops/scripts/ci/validate-patches-local.sh` — validacao rapida sem npm (diff, dead code, test refs)

**Regras**:
1. SEMPRE partir da base corporativa ATUAL (buscar via fetch-files)
2. SEMPRE diff patch vs corporativo — mudancas devem ser MINIMAS
3. NUNCA adicionar validateTrustedUrl dentro de fetch/postJson (quebra testes mock)
4. NUNCA mudar assinaturas de funcoes existentes sem atualizar testes
5. Dead code (funcoes definidas mas nao usadas) = ESLint vai reclamar

### Continuous Improvement
| Workflow | Purpose |
|----------|---------|
| continuous-improvement.yml | Weekly self-analysis: scan → auto-fix → learn → alert (6-stage pipeline) |

### Intelligent Monitoring Stack (5 layers of self-healing)
| Workflow | Schedule | Purpose |
|----------|----------|---------|
| builds-validation-gate.yml | On PR + weekly | **Layer 1 (Prevention)**: Validates ALL workflow YAML syntax, deprecated actions, missing concurrency, hardcoded secrets. Blocks broken workflows. |
| workflow-health-monitor.yml | 30min / 2h | **Layer 2 (Detection)**: Scans ALL 69+ workflows, detects consecutive failures, calculates fail rates, creates alert Issues. |
| workflow-auto-repair.yml | On-demand | **Layer 3 (Repair)**: Auto-fixes disabled workflows, stuck runs (>60min), expired locks, queued pile-ups. Triggered by health-monitor. |
| intelligent-orchestrator.yml | 15min / 30min / 1h | **Layer 4 (Brain)**: OBSERVE → DECIDE → ACT → LEARN loop. Persistent knowledge base on autopilot-state. Learns from outcomes. |
| workflow-sentinel.yml | 4h | **Layer 5 (Meta-monitor)**: Watches the monitoring stack itself. Re-enables disabled monitors, re-runs failed monitors, escalates via Issue. |

### Infrastructure
| Workflow | Purpose |
|----------|---------|
| session-guard.yml | Multi-agent lock acquisition and release |
| ci-failure-analysis.yml | Analyze CI failures with diagnostics |
| alert-notify.yml | Auto-create GitHub Issues on failures |
| cleanup-branches.yml | Clean up stale/merged branches |
| deploy-panel.yml | Deploy GitHub Pages panel |
| enqueue-agent-handoff.yml | Create agent handoff |
| record-improvement.yml | Record improvements |
| langchain-orchestrator.yml | Intelligent agent orchestration via LangChain + Claude |
| check-repo-access.yml | Validate BBVINET_TOKEN access to corporate repos |
| ci-diagnose.yml | Diagnose CI failures with detailed analysis |
| fetch-files.yml | Fetch files from corporate repos using BBVINET_TOKEN |
| auto-merge-to-main.yml | Auto-merge PRs from claude/* branches to main (squash) |
| autonomous-merge-direct.yml | Direct autonomous merge for agent PRs (bypasses branch protection auto-merge requirement) |
| ops-workflow-observability.yml | Workflow run observability and metrics |
| ci-self-heal.yml | Auto-heal CI failures with pattern matching |
| ci-status-check.yml | Check corporate CI status for a commit (trigger via `trigger/ci-status.json`) |
| ci-monitor-loop.yml | Continuous CI monitoring loop — polls corporate CI, on success promotes CAP, on failure triggers ci-diagnose + fix-corporate-ci |
| deploy-pipeline-monitor.yml | **Level 1 Pipeline Watcher** — detects stuck pipelines, auto-dispatches ci-monitor-loop |
| clone-corporate-repos.yml | Clone corporate repos locally (trigger via `trigger/clone-repos.json`) |
| auto-merge-sweeper.yml | Sweep and auto-merge eligible agent PRs |
| repo-cleanup.yml | Clean up unused files and branches |
| promote-cap.yml | Manual CAP promotion (trigger via `trigger/promote-cap.json`) |
| spark-sync-state.yml | Sync state.json to Spark dashboard repo (every 5/15 min) |
| post-merge-monitor.yml | Monitor workflows after PR merge |
| dashboard-auto-improve.yml | Daily dashboard data accuracy validation |
| auto-dispatch-task.yml | Auto-dispatch tasks from Issues to appropriate agents |
| dispatch-proxy.yml | Operations dispatch proxy for multi-workspace routing |
| token-auto-optimize.yml | Daily token usage optimization (compact memory, archive old sessions) |
| sync-spark-dashboard.yml | Sync workflows + HTML from autopilot references to spark-dashboard repo |
| sync-community-resources.yml | Weekly auto-sync intelligence from anthropics/skills, awesome-claude-code, a-list-of-agents |
| emergency-watchdog.yml | Emergency watchdog — detects critical failures, stuck states, and auto-escalates |

### Disabled Workflows (Codex/Copilot/Agent-Bridge — centralized in Claude Code)
All Codex, Copilot, Gemini, and multi-agent bridge workflows have been **disabled** (renamed to `.yml.disabled`).
Operations are now centralized in **Claude Code + GitHub Actions** only.

Disabled files (preserved for reference in `.github/workflows/*.yml.disabled`):
- `codex-apply.yml.disabled`, `codex-deploy.yml.disabled`, `codex-autonomous-pr.yml.disabled`
- `sync-codex-prompt.yml.disabled`, `auto-pr-codex.yml.disabled`
- `copilot-post-deploy-sync.yml.disabled`, `copilot-setup-steps.yml.disabled`, `copilot-task-dispatch.yml.disabled`
- `sync-copilot-prompt.yml.disabled`
- `agent-bridge.yml.disabled`, `agent-sync.yml.disabled`, `autopilot-dispatcher.yml.disabled`

### Trigger Files
| File | Triggers Workflow |
|------|-------------------|
| `trigger/source-change.json` | apply-source-change.yml |
| `trigger/full-test.json` | test-full-flow.yml |
| `trigger/e2e-test.json` | test-corporate-flow.yml |
| `trigger/fix-and-validate.json` | fix-and-validate.yml |
| `trigger/improvement.json` | continuous-improvement.yml |
| `trigger/ci-diagnose.json` | ci-diagnose.yml |
| `trigger/fetch-files.json` | fetch-files.yml |
| `trigger/fix-ci.json` | fix-corporate-ci.yml |
| `trigger/promote-cap.json` | promote-cap.yml |
| `trigger/clone-repos.json` | clone-corporate-repos.yml |
| `trigger/ci-status.json` | ci-status-check.yml |
| `trigger/agent-bridge.json` | agent-bridge.yml (DISABLED — legacy) |
| `trigger/agent-sync.json` | agent-sync.yml (DISABLED — legacy) |
| `trigger/codex-commit.json` | codex-apply.yml (DISABLED — legacy) |
| `trigger/codex-deploy.json` | codex-deploy.yml (DISABLED — legacy) |
| `trigger/copilot-task.json` | copilot-task-dispatch.yml (DISABLED — legacy) |

## Deploy Flow — Complete Guide (Claude Code only)

This is the **official, tested, end-to-end deploy flow** for pushing code changes to corporate repos.
Centralized in Claude Code. Last successful run: **#81 (controller 3.7.3)**. Agent 2.3.3 deployed.

### Phase 1: Prepare
```
1. git fetch origin main && git checkout -B claude/<descriptive-name> origin/main
2. Check versioningRules.currentVersion in session memory → decide new version (patch+1)
3. Create/update patch files in patches/ (source code to apply to corporate repo)
4. For each change: decide action type:
   - search-replace: for simple text substitutions (sed-based)
   - replace-file: for full file replacement (copies from patches/)
```

### Phase 2: Configure Trigger
Edit `trigger/source-change.json`:
```json
{
  "workspace_id": "ws-default",
  "component": "controller",
  "change_type": "multi-file",
  "version": "<NEW_VERSION>",
  "changes": [
    { "action": "search-replace", "target_path": "package.json", "search": "old", "replace": "new" },
    { "action": "replace-file", "target_path": "src/swagger/swagger.json", "content_ref": "patches/swagger.json" }
  ],
  "commit_message": "feat: description of changes",
  "skip_ci_wait": false,
  "promote": true,
  "run": <LAST_RUN + 1>
}
```
**CRITICAL**: `run` field MUST be incremented — without increment, workflow does NOT trigger.

### Phase 3: Update References
```
1. Update references/controller-cap/values.yaml with new image tag
2. Update CLAUDE.md "Controller CAP" section with new deployed tag
3. Update contracts/claude-session-memory.json versioningRules.currentVersion
```

### Phase 4: Commit + PR + Merge

**Autonomy rule:** com contexto suficiente, executar `commit -> push -> PR -> merge` sem pedir confirmacao adicional ao usuario.
**Product sync rule:** para mudancas no repo `autopilot`, nunca deixar alteracoes apenas locais; sincronizar no GitHub no mesmo ciclo (preferencialmente com `scripts/codex/sync-autopilot-product.sh`).
```
1. git add patches/ trigger/source-change.json references/ CLAUDE.md contracts/
2. git commit -m "feat: <description> + deploy <version>"
3. git push -u origin claude/<branch-name>
4. Create PR via MCP GitHub (mcp__github__create_pull_request)
5. If mergeable_state=dirty: git pull origin main, resolve conflicts, push
6. Merge PR (squash) via MCP GitHub (mcp__github__merge_pull_request)
7. The merge to main with trigger/source-change.json change AUTO-TRIGGERS apply-source-change.yml
```

### Phase 5: Monitor Autopilot Workflow (MANDATORY)
```
1. After merge: WebFetch https://api.github.com/repos/lucassfreiree/autopilot/actions/workflows/apply-source-change.yml/runs?per_page=3
2. Verify new run appeared (status: queued/in_progress)
3. Poll every 2-3 minutes
4. If completed+success: proceed to Phase 5b
5. If completed+failure: check job details, diagnose, fix, re-trigger AUTOMATICALLY
6. ALWAYS notify user on completion (success or failure)
```

### Phase 5b: Monitor Corporate CI Pipeline (MANDATORY — DO NOT SKIP)
```
CRITICAL: apply-source-change SUCCESS does NOT mean deploy is done!
The corporate "Esteira de Build NPM" runs INDEPENDENTLY after code is pushed.

1. After apply-source-change SUCCESS: the corporate CI was already checked in CI Gate step
2. If CI Gate passed: corporate CI already validated build+test+lint
3. Monitor if Docker image is being generated (Esteira de Build NPM)
4. If corporate CI FAILS at any point:
   a. Download logs and diagnose the error AUTOMATICALLY (DO NOT ask user)
   b. Common failures: TypeScript errors, test failures, lint errors, duplicate tags
   c. Create fix patch, bump trigger run, new PR, merge, re-monitor
   d. Repeat until success
5. ALWAYS notify user with final result (image generated or failure diagnosed)
6. Record EVERY failure in session memory knownFailures + errorRecovery
```

### Phase 6: Post-Deploy
```
1. Update session memory: lastTriggerRun, lastSuccessfulRun, pipelineStatus
2. Add new run to workflowMonitoring.successfulRuns
3. Register session in executionHistory
4. Commit updated memory
```

### Golden Rules
| Rule | Why |
|------|-----|
| NEVER push directly to main | Returns 403. Always branch `claude/*` + PR + squash merge |
| NEVER assume workflow succeeded | ALWAYS monitor and verify via API |
| NEVER forget to increment `run` | Without increment, workflow does NOT trigger |
| ALWAYS notify user on completion | User expects immediate feedback |
| ALWAYS check version before bump | CI rejects duplicate tags |
| ALWAYS fetch origin/main first | Prevents merge conflicts |
| ALWAYS do everything in 1 commit | Patches + trigger + references + memory together |
| NEVER ask user about code issues | Download, analyze, fix, and deploy AUTOMATICALLY |
| NEVER consider deploy done after apply-source-change | Corporate CI (Esteira de Build NPM) runs AFTER and can FAIL independently |
| ALWAYS monitor corporate CI after deploy | Poll until Docker image is generated or failure is diagnosed |
| ALWAYS diagnose and fix CI failures automatically | Download logs, analyze, create fix, re-deploy — NO user intervention |
| ALWAYS map errors and solutions | Record in session memory knownFailures + errorRecovery for fast resolution |
| ALWAYS verify JWT claim names | Agent reads `payload.scope` (singular), never `scopes` (plural) |
| **ALWAYS monitor ALL pipelines LIVE every session** | Never wait for user to report a failure. At session start AND after every deploy: actively poll ci-logs, autopilot workflows, AND esteira corporativa every 2-3 min until confirmed success or failure |

## Live Monitoring Protocol (MANDATORY — Every Session)

> **This is not optional.** Active live monitoring of ALL pipelines is required in every session.
> Failure to monitor = failure to deploy. The user must NEVER have to report a CI failure to Claude.

### At Session Start — ALWAYS run these checks:
1. Read `state/workspaces/ws-default/ci-monitor-controller.json` → last `ciOutcome`
2. Read `state/workspaces/ws-default/ci-monitor-agent.json` → last `ciOutcome`
3. Read `state/workspaces/ws-default/controller-release-state.json` → `status`, `ciResult`
4. Read `state/workspaces/ws-default/agent-release-state.json` → `status`, `ciResult`
5. Check `ci-logs-controller-*.txt` (latest) for test/lint/build errors
6. Check `ci-logs-agent-*.txt` (latest) for errors
7. If ANY outstanding failure: diagnose and fix IMMEDIATELY without waiting for user to ask

### After Every Deploy — Active Polling Protocol:
```
1. After PR merge: wait 30s, then check apply-source-change run status
2. Every 2-3 minutes: poll ci-logs for new files (higher job ID = newer)
3. Pattern "Test Suites: X failed" → IMMEDIATE FIX (don't wait for user)
4. Pattern "error TS" → IMMEDIATE FIX
5. Pattern "X problems (X errors)" → IMMEDIATE FIX
6. Pattern "Test Suites: X passed, 0 failed" + no errors → SUCCESS → update memory
7. Timeout: after 30 min without new log → trigger ci-diagnose manually
```

### CI Timing Guide:
| Duration | Meaning | Action |
|----------|---------|--------|
| < 5 min | CI failed (test/lint error) | Check latest ci-log immediately |
| ~14 min | CI passed | Confirm Docker image built, promote CAP |
| > 30 min no log | CI stuck or not triggered | Trigger ci-diagnose manually |

### How to Check CI Status Quickly:
```bash
# List latest ci-logs (sort by job ID — higher = newer)
# Via MCP: get_file_contents owner=lucassfreiree repo=autopilot path=state/workspaces/ws-default ref=autopilot-state
# Find files matching ci-logs-controller-*.txt, sort by name, read the largest job ID

# Read latest log:
# get_file_contents path=state/workspaces/ws-default/ci-logs-controller-<highest_id>.txt
# Search for: "Test Suites:", "Tests:", "FAIL ", "error TS", "problems (", "VERSAO:"
```

### Autonomous Loop Status:
- `ci-monitor-loop.yml` → polls corporate CI, on failure triggers `fix-corporate-ci` + `ci-diagnose` + creates Issue
- `fix-corporate-ci.yml` → auto-fixes lint errors, re-dispatches `ci-monitor-loop` with fix SHA
- `deploy-pipeline-monitor.yml` → every 10min, detects stuck pipelines, auto-dispatches
- `workflow-sentinel.yml` → every 4h, ensures monitoring stack is running

> **Even with autonomous workflows**: Claude MUST personally verify — autonomous workflows can fail silently.
> Do NOT rely solely on automation. ALWAYS verify manually during active sessions.

## apply-source-change Pipeline (7 Stages)
```
1.   Setup          → Read workspace config
1.5  Session Guard  → Acquire lock (blocks if another agent active)
2.   Apply & Push   → Clone → Apply change → Fix lint → Push
3.   CI Gate        → Wait CI + Smart comparison (pre-existing detection)
4.   Promote        → Update CAP values.yaml (agent + controller — both auto-promote via GitHub API)
5.   Save State     → Record on autopilot-state
6.   Audit          → Audit trail + Release lock
7.   CI Monitor     → Dispatch ci-monitor-loop explicitly (ALWAYS fires, regardless of CI Gate result)
```
**CRITICAL**: Stage 7 ensures ci-monitor-loop always activates after every deploy. deploy-pipeline-monitor (Level 1) is backup: if ci-monitor still missing after 30min, auto-dispatches again.

## Continuous Improvement Pipeline (6 Stages)
```
1. Setup     → Read config + previous improvement report
2. Analyze   → Scan workflows, schemas, contracts, state for issues
3. Auto-Fix  → Apply fixes for auto-fixable issues (locks, schemas, triggers)
4. Learn     → Record report, calculate trends (improving/degrading/stable)
5. Alert     → Create GitHub Issue if critical issues or score drops
6. Audit     → Record in audit trail
```

**Health Score**: 0-100, deducts points per severity (critical=-20, high=-10, medium=-3, low=-1)

**Trend tracking**: Compares current score vs previous report. Stores both `latest-report.json` (overwritten) and `report-{timestamp}.json` (historical).

**Auto-fixable issues**: Expired locks, missing schemaVersion, outdated contract versions.

**Runs**: Weekly (Monday 06:00 UTC) + on demand + via trigger file.

## Multi-Agent Safety (CRITICAL)
Multiple agents (Claude Code, Codex) may share the same GitHub account.
To prevent conflicts:

1. **Session Guard**: All state-changing workflows MUST call `session-guard.yml` first
2. **Lock before write**: Acquire session lock before modifying corporate repos or state
3. **Agent identification**: Every commit must identify the agent (claude-code or codex)
4. **Protected repos**: NEVER modify these without session lock:
   - Corporate source repos (agent, controller)
   - CAP/deploy repos
   - `autopilot-state` branch
5. **Concurrent protection**: If another agent holds a lock, WAIT or ABORT — never force

### Protected Operations
| Operation | Requires Lock | Agent Must Identify |
|-----------|:---:|:---:|
| Push to corporate repo | Yes | Yes |
| Modify state branch | Yes | Yes |
| Promote to CAP | Yes | Yes |
| Seed workspace | Yes | Yes |
| Backup/restore state | Yes | Yes |
| Freeze/unfreeze releases | Yes | Yes |
| Read workspace config | No | No |
| Run health check | No | No |
| Read audit/metrics | No | No |
| View panel | No | No |

## Error Handling Standards
- Always add `2>/dev/null || echo "fallback"` to jq calls
- Use `set -euo pipefail` at start of all scripts
- Log warnings with `echo "::warning ::"` for non-fatal issues
- Log errors with `echo "::error ::"` for fatal issues
- Never silently swallow errors with `|| true` — always log first

## Session Startup (IMPORTANT — Run at every new session)
Every new Claude Code session MUST:
1. **Read session memory**: Load `contracts/claude-session-memory.json` (injected by hook).
2. **Identify workspace context**: Determine which company/workspace the user needs from conversation context. **No workspace is default** — always identify before acting. If ambiguous, ASK.
3. **Read workspace config**: Load `state/workspaces/<identified_ws_id>/workspace.json` for the relevant workspace.
4. **Check active locks**: Verify no other agent holds a session lock before performing state-changing operations.
5. **Check corporate repo access** (if workspace has repos): Verify token has access to workspace repos.

### Workflow: check-repo-access.yml
| Trigger | Secret Used | Repos Checked |
|---------|-------------|---------------|
| `workflow_dispatch` or push to `main` (self-path) | `BBVINET_TOKEN` | `bbvinet/psc-sre-automacao-agent`, `bbvinet/psc-sre-automacao-controller`, `bbvinet/psc_releases_cap_sre-aut-agent`, `bbvinet/psc_releases_cap_sre-aut-controller` |

### Repository Secrets Available
| Secret | Company | Purpose |
|--------|---------|---------|
| `BBVINET_TOKEN` | Getronics | PAT with access to corporate repos (bbvinet org) |
| `RELEASE_TOKEN` | Shared | Token for release operations and autopilot checkout |
| `OPENAI_API_KEY` | Shared | OpenAI API key for LangChain orchestrator |
| `CIT_TOKEN` | CIT | PAT for CIT corporate repos (to be configured) |

### Centralized Operation Model (Claude Code + GitHub)
All operations are centralized in **Claude Code** as the single autonomous agent.
Codex, Copilot, Gemini, and ChatGPT delegation workflows have been **disabled**.
Claude Code handles all tasks directly: deploys, CI monitoring, fixes, documentation, and operational work.

### Auto-Mapping for Future Sessions (MANDATORY — No user intervention required)
Claude Code MUST automatically and proactively keep this file (CLAUDE.md) up to date. This is NOT optional and does NOT require the user to ask.

**At session start:**
1. Scan `.github/workflows/` for any workflow NOT listed in the Workflows tables above — if found, add it immediately.
2. Scan `trigger/` for any trigger file NOT listed in the Trigger Files table — if found, add it immediately.
3. Scan `integrations/` for any new integration NOT documented — if found, add it immediately.
4. Check repository secrets/variables referenced in workflows against the "Repository Secrets Available" table — if missing, flag and add.

**During the session:**
- Whenever a new workflow, trigger file, secret, integration, schema, contract, or operational procedure is created or discovered, update CLAUDE.md **in the same commit or immediately after** — do NOT wait until session end.
- Whenever existing documentation is found to be outdated or incomplete, fix it immediately.

**Before session end:**
- Do a final scan to confirm all new items created during the session are mapped. Commit any missing updates.

**Rule**: If it exists in the repo but not in CLAUDE.md, it is a bug. Fix it automatically without asking.

## Session Memory (CRITICAL — Intelligent Learning System)

Claude Code maintains a **cumulative memory file** at `contracts/claude-session-memory.json` that persists decisions, patterns, and lessons learned across all sessions.

### How it works
```
Session Start → Read memory → Apply learned patterns → Avoid past mistakes
During Session → Record new decisions, rules, lessons in real-time
Session End → Update memory → Commit → Available for next session
```

### What gets recorded automatically
| Category | Examples |
|----------|---------|
| **Versioning rules** | Current version, 4 version file locations, CI duplicate tag rejection |
| **Deploy flow** | Step-by-step pipeline, trigger mechanism, GitLab limitations |
| **Auth architecture** | Secrets, auth flow, trusted callers, middleware behavior |
| **Swagger rules** | Encoding (ASCII only), no accents, patch reference |
| **Historia completions** | Status of each item, PO decisions, scope exclusions |
| **Error patterns** | Common failures and how to fix them |
| **Common patterns** | How to create patches, fetch files, handle CI |

### Memory file location
- **File**: `contracts/claude-session-memory.json`
- **Referenced by**: `contracts/claude-agent-contract.json` (contextFiles + sessionMemory)
- **Protocol**: Read on start, update during session, commit on end

### Rules
1. **ALWAYS** read `claude-session-memory.json` at session start
2. **NEVER** repeat a mistake that is documented in `lesson` fields
3. **ALWAYS** update memory when a new decision or pattern is discovered
4. **ALWAYS** record completed historias with item-by-item status
5. Memory is append-only for lessons — never delete learned patterns

## Agent Model — Centralized (Claude Code Only)
Operations are **centralized in Claude Code** as the single autonomous agent.
Codex, Copilot, Gemini, and ChatGPT workflows are **disabled**. Contracts are preserved for reference.

| Agent | Contract | Status | Role |
|-------|----------|--------|------|
| **Claude Code** | `contracts/claude-agent-contract.json` + `CLAUDE.md` | **ACTIVE** | All operations: architecture, deploys, CI, fixes, docs, operational work |
| Codex | `contracts/codex-agent-contract.json` | DISABLED | Workflows disabled (.yml.disabled) |
| ChatGPT | `contracts/chatgpt-agent-contract.json` | DISABLED | No active workflows |
| Copilot | `contracts/copilot-agent-contract.json` | DISABLED | Workflows disabled (.yml.disabled) |

### Custom Subagents (`.claude/agents/`)
Specialized agents that Claude Code can delegate to for focused tasks:

| Agent | File | Model | Purpose |
|-------|------|-------|---------|
| **deploy-agent** | `.claude/agents/deploy-agent.md` | Opus | Full deploy pipeline execution (10-step autonomous) |
| **ci-debugger** | `.claude/agents/ci-debugger.md` | Sonnet | CI failure diagnosis and auto-fix |
| **dashboard-monitor** | `.claude/agents/dashboard-monitor.md` | Sonnet | Dashboard sync validation and repair |
| **workspace-ops** | `.claude/agents/workspace-ops.md` | Sonnet | Health checks, locks, state management |

### Custom Skills (`.claude/skills/`)
| Skill | File | Purpose |
|-------|------|---------|
| DevOps/SRE/Cloud | `.claude/skills/devops-sre-cloud.md` | K8s, Terraform, CI/CD, cloud platforms |
| Observability | `.claude/skills/observability.md` | Metrics, logs, traces, alerting, SLOs |
| Security Expert | `.claude/skills/security-expert.md` | OWASP, container security, secrets |
| Deploy Monitor | `.claude/skills/deploy-monitor.md` | Monitor active deploy pipeline status |
| CI Fix | `.claude/skills/ci-fix.md` | Auto-diagnose and repair CI failures |

### GitHub `@claude` Integration
Workflow `claude-assistant.yml` responds to `@claude` mentions in Issues and PRs.
Requires `ANTHROPIC_API_KEY` secret. Runs `anthropics/claude-code-action@v1`.
