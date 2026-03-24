# Workspace Context Separation — Visual Guide

## Golden Rule
**Nenhum workspace e "default". Cada empresa e um contexto COMPLETAMENTE ISOLADO.**
O agente DEVE identificar qual empresa pelo contexto da conversa antes de qualquer acao.

## Workspace Identification Protocol (MANDATORY)

1. **ANTES de qualquer operacao**: identificar qual empresa/workspace o usuario esta falando
2. **Pistas de contexto**:
   - Getronics: controller, agent, NestJS, bbvinet, psc-sre, swagger, Jest, ESLint, esteira, build NPM
   - CIT: DevOps, Terraform, Kubernetes, K8s, Docker, cloud, AWS, Azure, GCP, monitoring, Datadog, Grafana, infra, IaC
3. **Se ambiguo**: PERGUNTAR ao usuario antes de prosseguir
4. **Uma vez identificado**: ler `state/workspaces/<ws_id>/workspace.json` para config
5. **Quick index**: `ops/config/workspaces/<ws_id>.json`

## Quick Identification

| Indicador | Getronics (ws-default) | CIT (ws-cit) |
|-----------|----------------------|--------------|
| **Workspace ID** | `ws-default` | `ws-cit` |
| **Token** | `BBVINET_TOKEN` | `CIT_TOKEN` |
| **Stack** | Node/TypeScript (NestJS) | DevOps (K8s, Terraform, Cloud) |
| **Repos** | `bbvinet/psc-sre-automacao-*` | A configurar |
| **Data Classification** | Confidential | Internal |
| **Machine** | Getronics workstation | CIT workstation |
| **State Path** | `state/workspaces/ws-default/` | `state/workspaces/ws-cit/` |

## Workflow Classification by Scope

### [Corp] — Corporate Pipeline Workflows (WORKSPACE-SPECIFIC)
**ATENCAO: Estes workflows operam em repos CORPORATIVOS. Sempre verificar workspace_id.**

| Workflow | Default ws | Token Usado | Funciona com ws-cit? |
|----------|-----------|-------------|---------------------|
| `apply-source-change.yml` | ws-default | BBVINET_TOKEN (hardcoded) | NAO ate CIT_TOKEN configurado |
| `ci-diagnose.yml` | ws-default | BBVINET_TOKEN (hardcoded) | NAO ate CIT_TOKEN configurado |
| `fix-corporate-ci.yml` | ws-default | BBVINET_TOKEN (hardcoded) | NAO ate CIT_TOKEN configurado |
| `fetch-files.yml` | ws-default | BBVINET_TOKEN (hardcoded) | NAO ate CIT_TOKEN configurado |
| `drift-correction.yml` | ws-default | BBVINET_TOKEN (hardcoded) | NAO ate CIT_TOKEN configurado |
| `fix-and-validate.yml` | ws-default | BBVINET_TOKEN (hardcoded) | NAO ate CIT_TOKEN configurado |
| `agent-sync.yml` | ws-default | BBVINET_TOKEN (hardcoded) | NAO ate CIT_TOKEN configurado |
| `check-repo-access.yml` | — | BBVINET_TOKEN (hardcoded) | NAO (repos hardcoded) |
| `test-full-flow.yml` | ws-default | BBVINET_TOKEN | NAO ate CIT_TOKEN configurado |
| `test-corporate-flow.yml` | ws-default | BBVINET_TOKEN | NAO ate CIT_TOKEN configurado |

### [Core] — Control Plane Workflows (WORKSPACE-AWARE)
**Estes workflows ja suportam multiplos workspaces corretamente.**

| Workflow | Multi-workspace? | Como? |
|----------|-----------------|-------|
| `health-check.yml` | SIM | Descobre workspaces do state branch |
| `backup-state.yml` | SIM | Faz backup de todos os workspaces |
| `restore-state.yml` | SIM | Aceita workspace_id |
| `bootstrap.yml` | SIM | Aceita workspace_id |
| `seed-workspace.yml` | SIM | Requer workspace_id |
| `session-guard.yml` | SIM | Aceita workspace_id |
| `workspace-lock-gc.yml` | SIM | Itera todos os workspaces |

### [Release] — Release Management (WORKSPACE-AWARE)
| Workflow | Multi-workspace? |
|----------|-----------------|
| `release-controller.yml` | SIM — le workspace.json |
| `release-agent.yml` | SIM — le workspace.json |
| `release-freeze.yml` | SIM — aceita workspace_id |
| `release-approval.yml` | SIM — aceita workspace_id |
| `release-metrics.yml` | SIM — aceita workspace_id |

### [Infra] — Infrastructure Workflows (GLOBAL)
| Workflow | Scope |
|----------|-------|
| `continuous-improvement.yml` | Hardcoded ws-default (scheduled) |
| `alert-notify.yml` | Global |
| `deploy-panel.yml` | Global |
| `sync-copilot-prompt.yml` | Global |
| `cleanup-branches.yml` | Global |

### Ops: — Operational Workflows (SHARED)
| Workflow | Scope |
|----------|-------|
| `ops-cloud-diagnose.yml` | Shared (aceita workspace_id) |
| `ops-tf-plan.yml` | Shared (aceita workspace_id) |
| `ops-k8s-health.yml` | Shared (aceita workspace_id) |
| `ops-monitor-alerts.yml` | Shared |
| `ops-pipeline-diagnose.yml` | Shared |

## Trigger Files — Workspace Scope

Todos os trigger files atualmente apontam para `ws-default` (Getronics).
**NUNCA alterar o workspace_id de um trigger sem confirmar o contexto.**

| Trigger | Workspace | Workflow |
|---------|-----------|---------|
| `trigger/source-change.json` | ws-default | apply-source-change.yml |
| `trigger/ci-diagnose.json` | ws-default | ci-diagnose.yml |
| `trigger/fetch-files.json` | ws-default | fetch-files.yml |
| `trigger/fix-ci.json` | ws-default | fix-corporate-ci.yml |
| `trigger/fix-and-validate.json` | ws-default | fix-and-validate.yml |
| `trigger/full-test.json` | ws-default | test-full-flow.yml |
| `trigger/e2e-test.json` | ws-default | test-corporate-flow.yml |
| `trigger/agent-sync.json` | ws-default | agent-sync.yml |
| `trigger/improvement.json` | ws-default | continuous-improvement.yml |

## How Agents Must Operate

### Before ANY corporate operation:
1. **Identificar** qual empresa o usuario esta pedindo (Getronics ou CIT)
2. **Verificar** workspace_id no trigger file
3. **Verificar** qual token o workflow usa
4. **Confirmar** que o token corresponde a empresa correta

### Red Flags (PARAR e verificar):
- Trigger file com workspace_id diferente do contexto da conversa
- Workflow usando BBVINET_TOKEN para operacao CIT (ou vice-versa)
- Commit que mistura arquivos de ws-default com ws-cit
- Deploy que referencia repos de outra empresa

## Known Limitations (Token Hardcoding)

Os workflows `[Corp]` atualmente tem `BBVINET_TOKEN` hardcoded. Isso significa:
- Eles **so funcionam** para o workspace ws-default (Getronics)
- Para usar com ws-cit, sera necessario **adaptar os workflows** para selecionar token dinamicamente
- Essa adaptacao sera feita quando o CIT_TOKEN e repos estiverem disponiveis
- **Enquanto isso**: workflows [Corp] = exclusivos Getronics. Nao tentar usar para CIT.
