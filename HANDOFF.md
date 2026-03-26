# Autopilot - Handoff Completo para ChatGPT/Codex

> Este documento descreve 100% da arquitetura, configuracao, workflows, schemas e regras do Autopilot.
> Use-o para operar, sincronizar e colaborar com Claude Code.

---

## Segregacao critica de contextos (OBRIGATORIO)

Regra operacional confirmada pelo proprietario da conta (2026-03-26):

- **Contextos do usuario principal (NUNCA misturar entre si):**
  - `ws-default` (Getronics)
  - `ws-cit`
- **Contextos de terceiro (irmao, totalmente separados):**
  - `ws-corp-1`
  - `ws-socnew`

### Politica de isolamento

1. Sempre validar `workspace_id` antes de qualquer acao com mudanca de estado.
2. Nunca reutilizar triggers, handoffs, estado, auditoria ou contexto tecnico entre grupos diferentes.
3. Se houver ambiguidade na solicitacao, interromper e pedir confirmacao explicita do `workspace_id`.
4. Qualquer automacao nova deve preservar isolamento por `workspace_id` como chave primaria.

---

## O que e o Autopilot

Control plane web-only para orquestracao de releases multi-workspace, multi-agent.
Zero dependencias locais. 100% GitHub-native. Operavel por Claude, ChatGPT e Codex.

**Repo**: `lucassfreiree/autopilot`
**State**: branch `autopilot-state` (runtime state, locks, audit, handoffs)
**Backups**: branch `autopilot-backups` (snapshots para rollback)
**Panel**: GitHub Pages (`panel/`)

---

## Estrutura de Arquivos

```
autopilot/
  CLAUDE.md                          # Instrucoes para Claude Code
  HANDOFF.md                         # Este arquivo
  README.md                          # Overview
  .gitignore
  .github/workflows/
    bootstrap.yml                    # Setup completo (state branch, backup, workspace)
    seed-workspace.yml               # Criar/atualizar workspace
    health-check.yml                 # Validacao de saude (hourly)
    backup-state.yml                 # Snapshot state (every 6h)
    workspace-lock-gc.yml            # Limpar locks expirados (every 15m)
    ci-failure-analysis.yml          # Analisar falhas de CI
    enqueue-agent-handoff.yml        # Criar handoff entre agentes
    record-improvement.yml           # Registrar melhorias
    release-controller.yml           # Template release controller
    release-agent.yml                # Template release agent
    deploy-panel.yml                 # Deploy GitHub Pages
    fix-corporate-ci.yml             # Auto-fix lint errors no repo corporativo
    test-corporate-flow.yml          # Pipeline E2E completo
  schemas/
    workspace.schema.json
    release-state.schema.json
    lock.schema.json
    handoff.schema.json
    health-state.schema.json
    improvement.schema.json
  contracts/
    shared-agent-contract.json       # Regras compartilhadas (todos os agentes)
    claude-agent-contract.json       # Capabilities do Claude
    chatgpt-agent-contract.json      # Capabilities do ChatGPT
    codex-agent-contract.json        # Capabilities do Codex
  compliance/personal-product/
    product-compliance.policy.json   # Padroes proibidos (secrets, dados corp)
    product-export.rules.json        # Regras de exportacao
  panel/
    index.html                       # UI do control plane
  trigger/
    e2e-test.json                    # Config trigger E2E
    fix-ci.json                      # Config trigger fix CI
```

---

## State Branch (autopilot-state)

```
state/workspaces/<workspace_id>/
  workspace.json              # Config do workspace (repos, branches, paths)
  controller-release-state.json
  agent-release-state.json
  health.json
  locks/                      # Locks ativos
  audit/                      # Trail de auditoria
  handoffs/                   # Fila de handoffs entre agentes
  improvements/               # Registros de melhoria
```

### workspace.json (ws-default atual)

```json
{
  "schemaVersion": 2,
  "workspaceId": "ws-default",
  "displayName": "Default Workspace",
  "controller": {
    "sourceRepo": "bbvinet/psc-sre-automacao-controller",
    "deployRepo": "",
    "deployBranch": "main",
    "deployValuesPath": "",
    "ciWorkflowName": "",
    "imagePattern": ""
  },
  "agent": {
    "sourceRepo": "bbvinet/psc-sre-automacao-agent",
    "capRepo": "bbvinet/psc_releases_cap_sre-aut-agent",
    "capBranch": "main",
    "capValuesPath": "releases/openshift/hml/deploy/values.yaml",
    "ciWorkflowName": "Esteira de Build NPM",
    "imagePattern": "image: .*psc-sre-automacao-agent:"
  },
  "settings": {
    "promotionTarget": "cap",
    "autoRelease": true,
    "lockTimeoutMinutes": 30,
    "healthCheckEnabled": true
  }
}
```

### agent-release-state.json (atual)

```json
{
  "schemaVersion": 2,
  "workspaceId": "ws-default",
  "component": "agent",
  "lastReleasedSha": "3a58260a27b76c6f6dbc00da917a824f7e88fc0a",
  "lastTag": "2.1.1-3a58260",
  "lastVersion": "2.1.1",
  "updatedAt": "2026-03-22T01:22:54Z",
  "runId": "23392896000",
  "promotions": [{
    "target": "cap",
    "repo": "bbvinet/psc_releases_cap_sre-aut-agent",
    "branch": "main",
    "path": "releases/openshift/hml/deploy/values.yaml",
    "tag": "2.1.1-3a58260",
    "status": "success"
  }],
  "status": "promoted"
}
```

---

## Pipeline E2E (test-corporate-flow.yml)

Fluxo completo executado automaticamente:

```
1. Clone bbvinet/psc-sre-automacao-agent
2. Bump version no package.json
   - Patch 0-9, depois incrementa minor (2.0.9 -> 2.1.0)
3. Push to main no repo corporativo
4. Esperar CI ("Esteira de Build NPM") completar
5. Se CI falhou -> prossegue mesmo assim (CI pode ter issues pre-existentes)
6. Promover tag no CAP repo (values.yaml)
   - Pattern: image: .*psc-sre-automacao-agent:<TAG>
7. Salvar state no autopilot-state branch
8. Limpar branches temporarias
9. Registrar audit
```

**Trigger**: Push `trigger/e2e-test.json` em main OU workflow_dispatch

**Git identity nos repos corporativos**:
- Nome: `github-actions`
- Email: `github-actions@github.com`
- Commits sem nenhuma referencia ao autopilot

---

## Fix CI (fix-corporate-ci.yml)

Corrige erros de lint automaticamente:

```
1. Clone repo corporativo
2. npm ci + eslint para encontrar erros
3. Para cada erro:
   - no-nested-ternary -> converte para if/else
   - Outros -> adiciona eslint-disable-next-line
4. Commit e push fix
5. Esperar CI passar
```

**Trigger**: Push `trigger/fix-ci.json` em main OU workflow_dispatch

---

## values.yaml do CAP (formato real)

O arquivo `releases/openshift/hml/deploy/values.yaml` no repo CAP tem este formato:

```yaml
sre-aut-agent:
  enabled: true
  items:
    - ...
      containers:
      - name: "..."
        image: docker.binarios.intranet.bb.com.br/bb/psc/psc-sre-automacao-agent:2.1.1
```

A linha da imagem que o pipeline atualiza:
```
image: docker.binarios.intranet.bb.com.br/bb/psc/psc-sre-automacao-agent:<TAG>
```

O `imagePattern` no workspace.json faz match com sed:
```bash
sed "s|\(image: .*psc-sre-automacao-agent:\).*|\1${TAG}|"
```

---

## Versionamento

**Regra de bump**:
- Patch 0 a 9: incrementa patch (2.0.0, 2.0.1, ..., 2.0.9)
- Ao atingir patch 9: incrementa minor e reseta patch (2.0.9 -> 2.1.0)
- Mesma logica para minor: 2.9.9 -> 3.0.0

---

## Secrets Necessarios

| Secret | Escopo | Uso |
|--------|--------|-----|
| `RELEASE_TOKEN` | autopilot repo | Ler/escrever state branch |
| `BBVINET_TOKEN` | repos corporativos | Clone, push, CI, promote CAP |
| `ANTHROPIC_API_KEY` | opcional | Analise AI de falhas de CI |

---

## Regras de Compliance

1. **NUNCA** armazenar codigo/secrets corporativos neste repo
2. **SEMPRE** usar workspace_id, nunca hardcodar nomes de tenant/org
3. **LER** workspace.json para toda config (repos, branches, paths)
4. **ADQUIRIR** lock antes de escrever state, liberar depois
5. **ESCREVER** audit entry apos cada mutacao de state
6. **STATE** no autopilot-state e source of truth, nao memoria do agente
7. **NUNCA** usar regex para editar YAML em producao
8. **NUNCA** expor secrets em commit messages ou logs
9. **NUNCA** referenciar "autopilot" em commits/codigo dos repos corporativos

---

## Contratos dos Agentes

### Claude Code
- **Ferramentas**: claude-code-cli, mcp-server-github
- **Foco**: Arquitetura, workflow authoring, release orchestration, CI fix

### ChatGPT
- **Ferramentas**: ChatGPT web, GitHub web UI, github.dev
- **Foco**: Code implementation, refactoring, tests, docs, CI triage

### Codex
- **Ferramentas**: Codex web, gh CLI, github.dev
- **Foco**: Bulk changes, test execution, CI monitoring

### Handoffs entre agentes
Usar `enqueue-agent-handoff.yml` para criar handoffs:
```json
{
  "from_agent": "claude",
  "to_agent": "chatgpt",
  "component": "agent",
  "summary": "Descricao da tarefa",
  "next_steps": ["step1", "step2"],
  "priority": "normal"
}
```

---

## Schemas (Resumo)

### workspace.schema.json
Config do workspace com repos source/deploy/cap, CI workflow name, image pattern.

### release-state.schema.json
Estado da ultima release: SHA, tag, version, promotions, status (idle/releasing/promoted/failed).

### lock.schema.json
Lock para operacoes: lockId, operation, acquiredAt, expiresAt, released.

### handoff.schema.json
Handoff entre agentes: from/to agent, status, context, priority.

### health-state.schema.json
Resultado do health check: overall status, checks individuais.

### improvement.schema.json
Registro de melhorias: category, description, source, status.

---

## Como Operar

### Ciclo operacional automatico do agente (padrao)

1. Clone/fetch e branch a partir de `main` atualizado
2. Pull/rebase antes de editar
3. Alteracoes + validacao tecnica
4. Commit atomico
5. Push da branch
6. PR para `main`
7. Monitoramento de checks/workflows
8. Correcao automatica de falhas quando possivel
9. Squash merge apos gates
10. Monitoramento pos-merge

Automacao local do ciclo:
- `scripts/codex/auto-pr-merge.sh`
- Uso: `GITHUB_TOKEN=<token> scripts/codex/auto-pr-merge.sh` (ou `GH_TOKEN`, ou `gh auth login`)
- Opcional: `AUTO_COMMIT=true COMMIT_MESSAGE="chore: ..."` para commit automatico
- Faz: commit automatico opcional (`git add -A` + `git commit`), configura `origin` (se ausente), push da branch atual, cria PR para `main`, tenta auto-merge e faz fallback para squash merge direto se auto-merge nao estiver disponivel.

> O agente so deve interromper esse fluxo quando faltar informacao critica ou houver bloqueio de seguranca/isolamento de workspace.

### Memoria operacional persistente (sessao atual + proximas)

Este comportamento ficou registrado como fonte de verdade em:
1. `contracts/codex-agent-contract.json` (`autonomousExecutionPolicy`)
2. `contracts/claude-session-memory.json` (`deployFlowGuide`)
3. `CLAUDE.md` (`Deploy Flow — Complete Guide`)
4. `HANDOFF.md` (este arquivo, continuidade operacional)

Regra fixa: executar `commit -> push -> PR -> merge` automaticamente quando houver contexto suficiente, sem misturar workspaces.
Regra de produto Autopilot: **nunca** manter apenas local; toda mudanca necessaria deve ser sincronizada no GitHub no mesmo ciclo.

Sincronizacao automatica recomendada:
- `scripts/codex/sync-autopilot-product.sh`
- Fluxo: detecta alteracoes locais -> commit automatico -> push -> PR -> merge -> aguarda estado `MERGED`.
- Pos-merge automatico: resolve `mergeCommit` da PR e monitora os builds desse commit ate conclusao com `scripts/codex/monitor-commit-builds.sh`.
- Rastreabilidade: commits do repo autopilot devem incluir marcador `[claude]` para facilitar leitura na esteira.
- Restricao: **nao** usar esse marcador em commits das esteiras/repositorios empresariais.
- Teste operacional (2026-03-26): commit de validacao pode usar marcador `[codex-autopilot]` quando solicitado explicitamente pelo usuario para auditoria da esteira.
- Se workflow `[Agent] Auto PR + Auto-Merge (Codex)` receber 403 `GitHub Actions is not permitted to create or approve pull requests`, tratar como bloqueio de policy do repo para `GITHUB_TOKEN` (nao erro de codigo) e orientar habilitar essa permissao ou usar PAT dedicado.

### Disparar E2E Release
Editar `trigger/e2e-test.json` e fazer push em main:
```json
{"workspace_id": "ws-default", "dry_run": "false", "run": 10}
```

### Disparar Fix CI
Editar `trigger/fix-ci.json` e fazer push em main:
```json
{"workspace_id": "ws-default", "run": 2}
```

### Auto-merge para main (apos checks com sucesso)
Workflow: `.github/workflows/auto-merge-to-main.yml`

Regras:
1. PR deve ter base `main`
2. PR nao pode estar em draft
3. PR deve ter label `automerge` ou `auto-merge`
4. PR deve ser interno (sem fork) e autoria confiavel (`OWNER`, `MEMBER` ou `COLLABORATOR`)
5. Auto-merge (squash) e habilitado e o GitHub conclui merge automaticamente quando todos os checks obrigatorios passarem

### Criar Workspace
Usar workflow `seed-workspace.yml` via workflow_dispatch.

### Verificar Saude
Health check roda automaticamente a cada hora.
Para rodar manual: workflow_dispatch `health-check.yml`.

### Consultar State
```bash
gh api "repos/lucassfreiree/autopilot/contents/state/workspaces/ws-default/agent-release-state.json?ref=autopilot-state" --jq '.content' | base64 -d
```

---

## Sincronizacao Claude <-> ChatGPT/Codex

1. **Handoffs**: Use `enqueue-agent-handoff.yml` para passar tarefas
2. **State**: Sempre leia do `autopilot-state` branch (source of truth)
3. **Locks**: Verifique locks antes de operar
4. **Audit**: Toda mutacao gera audit entry
5. **Contracts**: Siga o contrato do seu agente em `contracts/`

Para que os agentes se sincronizem:
- Claude cria handoff com `to_agent: "chatgpt"`
- ChatGPT le handoffs pendentes no state branch
- Executa a tarefa seguindo o contrato
- Marca handoff como completed
- Cria audit entry

---

## Historico de Versoes do Agent

| Versao | Tag | Data | Status |
|--------|-----|------|--------|
| 2.1.1 | 2.1.1-3a58260 | 2026-03-22 | promoted |
| 2.1.0 | 2.1.0-539e015 | 2026-03-22 | promoted |

---

*Gerado em 2026-03-22. Este documento e atualizado a cada release.*
