# Orquestração Multi-Empresa + Multi-Agente

> Este documento é a referência MESTRE para os 3 agentes (Claude, Codex, Copilot)
> operarem de forma 100% autônoma em múltiplas empresas sem intervenção do usuário.

## Modelo de Operação

```
Lucas (usuário) — ZERO intervenção
  |
  v
┌─────────────────────────────────────────────────────────────┐
│                   AUTOPILOT CONTROL PLANE                   │
│                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │  Claude   │    │  Codex   │    │ Copilot  │              │
│  │  Code     │    │          │    │          │              │
│  │ (primary) │◄──►│ (backup) │◄──►│ (backup) │              │
│  └─────┬─────┘    └─────┬────┘    └─────┬────┘              │
│        │                │               │                   │
│  ┌─────▼────────────────▼───────────────▼─────┐             │
│  │        WORKSPACE ROUTER                     │             │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐    │             │
│  │  │ws-default│ │ ws-cit   │ │ws-corp-1 │    │             │
│  │  │Getronics │ │   CIT    │ │ Empresa 3│    │             │
│  │  └──────────┘ └──────────┘ └──────────┘    │             │
│  └────────────────────────────────────────────┘             │
│                                                             │
│  ┌────────────────────────────────────────────┐             │
│  │          SPARK DASHBOARD                   │             │
│  │  Visão unificada de TODAS as empresas      │             │
│  │  lucassfreiree/spark-dashboard             │             │
│  └────────────────────────────────────────────┘             │
└─────────────────────────────────────────────────────────────┘
```

## Regras de Isolamento (INVIOLÁVEIS)

### Regra 1: Cada empresa é um contexto COMPLETAMENTE isolado
- NUNCA misturar dados, commits, credenciais ou estado entre empresas
- Cada workspace usa EXCLUSIVAMENTE seu próprio token
- Se um agente está trabalhando para Getronics, NÃO pode acessar dados da CIT

### Regra 2: Identificação OBRIGATÓRIA antes de qualquer ação
- Verificar workspace_id no contexto da conversa
- Se ambíguo: PARAR e verificar (não assumir)
- Pistas: Getronics = controller/agent/NestJS/bbvinet | CIT = DevOps/Terraform/K8s | Empresa 3 = TBD

### Regra 3: Token por empresa
| Empresa | Workspace | Token | Repos |
|---------|-----------|-------|-------|
| Getronics | ws-default | BBVINET_TOKEN | bbvinet/* |
| CIT | ws-cit | CIT_TOKEN | TBD |
| Empresa 3 | ws-corp-1 | TBD | TBD |

## Hierarquia dos Agentes

### Claude Code (PRIMARY)
- **Papel**: Arquiteto, orquestrador principal, decisões complexas
- **Quando usa**: Deploys complexos, troubleshooting, novas features, arquitetura
- **Workspace**: Qualquer (identifica pelo contexto)
- **Delega para**: Copilot (tarefas simples), Codex (bulk changes)

### Copilot (BACKUP + TASKS)
- **Papel**: Backup do Claude, tarefas autônomas via issues, dashboard
- **Quando usa**: Claude caiu, tarefas simples (docs, memory, version bump), monitoring
- **Workspace**: Qualquer (identifica pelo contexto)
- **Recebe de**: Claude (via issue assignment), usuário (via issue)

### Codex (SPECIALIST)
- **Papel**: Implementação de código, refactoring, bulk changes
- **Quando usa**: Mudanças em múltiplos arquivos, refactoring, testes
- **Workspace**: Qualquer (identifica pelo contexto)
- **Recebe de**: Claude (via handoff), usuário (via issue)

## Coordenação Automática

### Cenário 1: Deploy na Getronics (ws-default)
```
1. Qualquer agente identifica workspace = ws-default
2. Verifica lock (session-lock.json) — se outro agente ativo, ESPERA
3. Adquire lock via Session Guard
4. Executa deploy (patches → trigger → PR → merge → monitor)
5. Libera lock
6. Atualiza SUA memória com resultado
7. Spark dashboard atualiza automaticamente
```

### Cenário 2: Task na CIT (ws-cit)
```
1. Qualquer agente identifica workspace = ws-cit
2. Verifica lock para ws-cit
3. Executa task (DevOps: Terraform, K8s, CI/CD, monitoring)
4. Usa CIT_TOKEN (quando disponível)
5. Atualiza memória
```

### Cenário 3: Claude cai
```
1. Copilot detecta (claude-live-status.json → status active + lastUpdated > 30 min)
2. Copilot lê live-status → identifica tarefa e fase
3. Copilot retoma de onde Claude parou
4. Copilot atualiza live-status com lastUpdatedBy=copilot
5. Quando Claude voltar, lê live-status e vê que Copilot completou
```

### Cenário 4: Tarefa grande → Delegação
```
Claude recebe tarefa complexa para Getronics
  → Identifica sub-tarefas
  → Delega código para Codex (via handoff)
  → Delega docs para Copilot (via issue)
  → Claude monitora e coordena
  → Todos atualizam suas memórias
```

## Memória Compartilhada

### Arquivos que TODOS leem (mas NÃO modificam)
| Arquivo | Quem atualiza | O que contém |
|---------|---------------|-------------|
| `claude-live-status.json` | Claude | Tarefa atual, fase, próximos passos |
| `claude-session-memory.json` | Claude | Histórico completo do projeto |

### Arquivos EXCLUSIVOS de cada agente
| Agente | Memória | Embutida em |
|--------|---------|-------------|
| Claude | `claude-session-memory.json` | CLAUDE.md (hooks) |
| Codex | `codex-session-memory.json` | AGENTS.md (sync-codex-prompt) |
| Copilot | `copilot-session-memory.json` | copilot-instructions.md (sync-copilot-prompt) |

### O que cada agente NUNCA toca
| Agente | NÃO TOCA |
|--------|----------|
| Claude | copilot-session-memory.json, copilot-*.md |
| Codex | claude-session-memory.json, copilot-session-memory.json, CLAUDE.md |
| Copilot | claude-session-memory.json, codex-session-memory.json, CLAUDE.md, AGENTS.md |

## Spark Dashboard (Visão Unificada)

O dashboard em `lucassfreiree/spark-dashboard` mostra:
- **Dashboard**: Status de TODAS as empresas (versões, pipeline, agente ativo)
- **Deploy History**: Histórico por empresa
- **Agent Activity**: O que cada agente está fazendo
- **Workflows**: Status de todos os workflows
- **Pipeline Monitor**: 7 stages do deploy em tempo real

### Sync automático
- `spark-sync-state.yml` roda a cada 15 min + após cada deploy
- Lê: release-state, trigger, memórias, claude-live-status
- Pusha: state.json para o repo do Spark

## Como adicionar uma nova empresa

### Passo 1: Criar workspace
```bash
# Via workflow seed-workspace
gh api repos/lucassfreiree/autopilot/actions/workflows/seed-workspace.yml/dispatches \
  --method POST -f ref=main \
  -f "inputs[workspace_id]=ws-empresa3" \
  -f "inputs[display_name]=Empresa 3"
```

### Passo 2: Configurar token
- Adicionar secret `EMPRESA3_TOKEN` no repo autopilot
- Atualizar workspace.json com `credentials.tokenSecretName`

### Passo 3: Adicionar repos
- Atualizar workspace.json com repos[] da empresa
- Se tiver deploy pipeline: configurar apply-source-change ou adaptar

### Passo 4: Atualizar agents
- Adicionar pistas de contexto em CLAUDE.md, AGENTS.md, copilot-instructions.md
- Pistas: nome da empresa, stack, ferramentas, repos

### Passo 5: Dashboard
- Spark dashboard auto-detecta novos workspaces via state sync

## Fluxo de Trabalho Diário (Zero Intervenção)

```
06:00 — health-check.yml roda (todas as empresas)
        → Se algo degradado: alert-notify.yml cria issue
        → Copilot ou Claude auto-fix

08:00 — continuous-improvement.yml roda (scan semanal)
        → Auto-fix de locks expirados, schemas, triggers
        → Report com score de saúde

Todo deploy:
  1. Agente identifica empresa pelo contexto
  2. Verifica lock → adquire
  3. Executa deploy (7 stages)
  4. Monitora esteira corporativa
  5. Verifica promote
  6. Atualiza memória
  7. Spark dashboard atualiza
  8. Agente disponível para próxima tarefa

Claude cai:
  → Copilot assume em < 30 min
  → Retoma exatamente de onde parou
  → Sem perda de contexto
```

## Documentação por Agente

| Agente | Docs principais |
|--------|----------------|
| Claude | CLAUDE.md, claude-session-memory.json, ops/docs/deploy-process/ |
| Codex | AGENTS.md, codex-deploy-guide.md, codex-session-memory.json, ops/docs/deploy-process/ |
| Copilot | copilot-instructions.md, copilot-mega-prompt.md, copilot-deploy-guide.md, copilot-session-memory.json, ops/docs/deploy-process/ |
| Todos | ops/docs/deploy-process/ (12 fases), contracts/shared-agent-contract.json |
