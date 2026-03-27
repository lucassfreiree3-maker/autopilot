# Fase 01 — Overview e Pre-requisitos

## O que e o Autopilot

O Autopilot e um **control plane web-only** para orquestracao de releases multi-workspace e multi-agente.
Ele gerencia o ciclo completo de deploy de codigo para repositorios corporativos sem nenhuma dependencia local — 100% GitHub-native.

## Arquitetura Geral

```
+---------------------------+
|   lucassfreiree/autopilot |  <-- Control Plane (este repo)
|   (GitHub Actions)        |
+------------+--------------+
             |
             | BBVINET_TOKEN
             v
+---------------------------+     +---------------------------+
| bbvinet/psc-sre-automacao |     | bbvinet/psc-sre-automacao |
| -controller               |     | -agent                    |
| (Codigo fonte)            |     | (Codigo fonte)            |
+------------+--------------+     +------------+--------------+
             |                                 |
             | Esteira de Build NPM            | Esteira de Build NPM
             v                                 v
+---------------------------+     +---------------------------+
| Docker Registry           |     | Docker Registry           |
| (imagem controller)       |     | (imagem agent)            |
+------------+--------------+     +------------+--------------+
             |                                 |
             | Auto-promote (Stage 4)          | Auto-promote (Stage 4)
             v                                 v
+---------------------------+     +---------------------------+
| bbvinet/psc_releases_cap  |     | bbvinet/psc_releases_cap  |
| _sre-aut-controller       |     | _sre-aut-agent            |
| (values.yaml = tag)       |     | (values.yaml = tag)       |
+---------------------------+     +---------------------------+
             |                                 |
             v                                 v
+-------------------------------------------------------+
|              Cluster Kubernetes (HML)                  |
|  k8shmlbb111b.bb.com.br                               |
|  Namespaces: psc-sre-aut-controller, psc-sre-aut-agent|
+-------------------------------------------------------+
```

## Repositorios Envolvidos

### 1. Autopilot (Control Plane)
| Campo | Valor |
|-------|-------|
| Repo | `lucassfreiree/autopilot` |
| Branch principal | `main` |
| Branch de estado | `autopilot-state` |
| Branch de backups | `autopilot-backups` |
| Funcao | Orquestra deploys, armazena patches, triggers, estado, audit |
| Token | `RELEASE_TOKEN` (acesso ao proprio repo) |

### 2. Controller (Codigo Fonte)
| Campo | Valor |
|-------|-------|
| Repo | `bbvinet/psc-sre-automacao-controller` |
| Branch | `main` |
| Stack | Node 22, TypeScript, Express, Jest, SQLite, S3 |
| CI | Esteira de Build NPM (runner corporativo) |
| Token | `BBVINET_TOKEN` |
| Funcao | Orquestra automacoes, despacha para agents, gerencia logs |

### 3. Agent (Codigo Fonte)
| Campo | Valor |
|-------|-------|
| Repo | `bbvinet/psc-sre-automacao-agent` |
| Branch | `main` |
| Stack | Node 22, TypeScript, Express, Jest, K8s client |
| CI | Esteira de Build NPM (runner corporativo) |
| Token | `BBVINET_TOKEN` |
| Funcao | Executa automacoes nos clusters, recebe callbacks, envia logs |

### 4. Controller CAP (Deploy K8s)
| Campo | Valor |
|-------|-------|
| Repo | `bbvinet/psc_releases_cap_sre-aut-controller` |
| Branch | `main` |
| Arquivo chave | `releases/openshift/hml/deploy/values.yaml` |
| Funcao | Manifesto K8s (Deployment, Service, Ingress, RBAC, Secrets) |
| Atualizacao | Automatica pelo Stage 4 do apply-source-change |

### 5. Agent CAP (Deploy K8s)
| Campo | Valor |
|-------|-------|
| Repo | `bbvinet/psc_releases_cap_sre-aut-agent` |
| Branch | `main` |
| Arquivo chave | `releases/openshift/hml/deploy/values.yaml` |
| Funcao | Manifesto K8s de deploy do agent |
| Atualizacao | Automatica pelo Stage 4 do apply-source-change |

## Tokens e Secrets

| Secret | Armazenado em | Acesso a |
|--------|---------------|----------|
| `BBVINET_TOKEN` | GitHub Secrets (autopilot) | Repos `bbvinet/*` (clone, push, API) |
| `RELEASE_TOKEN` | GitHub Secrets (autopilot) | Repo `lucassfreiree/autopilot` (state branch, locks, audit) |
| `OPENAI_API_KEY` | GitHub Secrets (autopilot) | LangChain orchestrator (opcional) |

## Ferramentas Necessarias

### Para agentes (Claude Code, Codex, Copilot)
- Acesso ao repo `lucassfreiree/autopilot` via git ou GitHub API/MCP
- Capacidade de criar branches, commits, PRs e fazer merge
- Capacidade de monitorar GitHub Actions (API ou MCP)
- Acesso a leitura do branch `autopilot-state` (para estado e audit)

### Para operacao manual (humano)
- `git` CLI
- `gh` CLI (GitHub CLI) ou acesso web ao GitHub
- `jq` (para manipular JSON)
- `base64` (para decodificar conteudo da API)
- Editor de texto (para criar/editar patches)

## Workspace e Contexto

Antes de qualquer operacao, e **OBRIGATORIO** identificar qual workspace/empresa:

| Pista no contexto | Workspace | Token |
|-------------------|-----------|-------|
| Controller, agent, NestJS, bbvinet, esteira | `ws-default` (Getronics) | `BBVINET_TOKEN` |
| DevOps, Terraform, K8s, cloud, monitoring | `ws-cit` (CIT) | `CIT_TOKEN` |

**Regra**: Se o contexto for ambiguo, **PERGUNTAR** ao usuario antes de prosseguir.

O arquivo de configuracao de cada workspace fica em:
```
state/workspaces/<workspace_id>/workspace.json   (branch autopilot-state)
```

## Estrutura de Arquivos Relevantes no Autopilot

```
autopilot/
  patches/                          # Arquivos de patch (codigo a aplicar no repo corp)
    oas-sre-controller.controller.ts
    swagger.json
    cronjob-callback.ts
    ...
  trigger/
    source-change.json              # TRIGGER PRINCIPAL — dispara apply-source-change
    fetch-files.json                # Trigger para buscar arquivos do repo corp
    ci-diagnose.json                # Trigger para diagnosticar CI
    ci-status.json                  # Trigger para checar status CI
    promote-cap.json                # Trigger para promote manual
    ...
  references/
    controller-cap/
      values.yaml                   # Referencia local do values.yaml do CAP
  contracts/
    claude-session-memory.json      # Memoria cumulativa (versoes, historico, lessons)
  .github/workflows/
    apply-source-change.yml         # WORKFLOW PRINCIPAL — 7 stages de deploy
    fetch-files.yml                 # Busca arquivos do repo corporativo
    ci-diagnose.yml                 # Diagnostica falhas de CI
    ci-status-check.yml             # Checa status de CI
    promote-cap.yml                 # Promote standalone para CAP
    validate-patches.yml            # Validacao pre-deploy (roda em PRs)
    ...
  state/workspaces/
    ws-default/
      workspace.json                # Config do workspace Getronics
    ws-cit/
      workspace.json                # Config do workspace CIT
```

## Fluxo de Dados

```
1. Patches (autopilot/patches/)
   --> Trigger (autopilot/trigger/source-change.json)
   --> Workflow (apply-source-change.yml)
   --> Clone repo corporativo (BBVINET_TOKEN)
   --> Aplica patches no clone
   --> Push para main do repo corporativo
   --> Esteira de Build NPM roda (CI corporativo)
   --> Se CI passou: atualiza tag no CAP (auto-promote)
   --> Salva estado no autopilot-state
   --> Registra audit trail
```

## Versioning

| Regra | Detalhe |
|-------|---------|
| Padrao | SemVer: `MAJOR.MINOR.PATCH` (ex: 3.6.5) |
| Incremento | Sempre incrementar PATCH para cada deploy |
| Apos X.Y.9 | Proximo e X.(Y+1).0 — **NUNCA** X.Y.10 |
| CI rejeita | Tags duplicadas no registry |
| 5 arquivos | Versao deve ser atualizada em 5 lugares (ver fase 05) |

---

*Proximo: [02-clone-and-setup.md](02-clone-and-setup.md)*
