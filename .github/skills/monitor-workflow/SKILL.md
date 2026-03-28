---
name: monitor-workflow
description: Monitora workflows após deploy. Verifica apply-source-change (7 stages), esteira corporativa, e state do autopilot. Use após qualquer deploy.
---

# Monitor Workflow Skill

## Quando usar
- Imediatamente após merge de PR de deploy
- Quando usuario pergunta "como está o deploy?"
- Quando apply-source-change parece travado
- Quando CI gate falha ou demora muito

## Pipeline de 7 Stages (apply-source-change.yml)

```
Stage 1:   Setup          → Lê workspace config
Stage 1.5: Session Guard  → Adquire lock (bloqueia se outro agente ativo)
Stage 2:   Apply & Push   → Clona repo corporativo, aplica patches, faz push
Stage 3:   CI Gate        → Aguarda CI corporativo (Esteira de Build NPM)
Stage 4:   Promote        → Atualiza CAP values.yaml (auto-promote via GitHub API)
Stage 5:   Save State     → Grava no autopilot-state
Stage 6:   Audit          → Audit trail + libera lock
```

**Tempo esperado:** 8-15 minutos (CI Gate domina)

## Passo a passo de monitoramento

### 1. Verificar se workflow foi triggado
```
list_workflow_runs(
  workflow_id: "apply-source-change.yml",
  per_page: 3
)
→ Verificar se nova run apareceu após o merge
→ Status esperado: queued → in_progress → completed
```

### 2. Acompanhar stages
```
get_workflow_run(run_id: LATEST_RUN_ID)
→ conclusion: success | failure | null (ainda rodando)
→ status: queued | in_progress | completed
```

### 3. Verificar commit no autopilot-state
```
list_commits(
  sha: "autopilot-state",
  per_page: 10
)
→ Procurar: "state: controller source-change" ou "audit: source-change"
→ Sinal de que Stage 5 (Save State) e Stage 6 (Audit) completaram
```

### 4. Verificar release state
```
get_file_contents(
  path: "state/workspaces/ws-default/controller-release-state.json",
  branch: "autopilot-state"
)
→ Verificar:
  - version == versão deployada
  - status == "success"
  - promoted == true (se promote: true no trigger)
  - lastReleasedSha != null
```

### 5. Verificar CAP (se promoted)
```
get_file_contents(
  path: "references/controller-cap/values.yaml"
)
→ Verificar image tag atualizada
```

## Diagnóstico de Falhas por Stage

| Stage falhou | Diagnóstico | Ação |
|---|---|---|
| Stage 2 (Apply) | Patch não encontrado ou erro de sintaxe | Verificar `patches/` e trigger `changes[]` |
| Stage 3 (CI Gate) | Erro TypeScript, ESLint ou teste | Usar skill: `fix-ci-failure` |
| Stage 4 (Promote) | BBVINET_TOKEN sem acesso ao CAP repo | Verificar token + repo |
| Stage 5 (Save State) | RELEASE_TOKEN expirado | Renovar token |
| Session Guard trava | Lock não liberado de sessão anterior | Verificar `state/workspaces/ws-default/locks/session-lock.json` |

## Verificar Esteira Corporativa (após CI Gate OK)

**CRITICO:** apply-source-change SUCCESS nao significa deploy completo! A esteira roda independente.

```
list_commits(sha: "autopilot-state", per_page: 10)
→ Procurar arquivos: ci-logs-controller-*.txt
→ Ler o mais recente para logs reais da esteira
```

Ou:
```
get_file_contents(
  path: "state/workspaces/ws-default/ci-status-controller.json",
  branch: "autopilot-state"
)
→ Verificar status da esteira
```

## Sinais de Sucesso Completo

1. apply-source-change: `conclusion: success`
2. autopilot-state tem commit "state: controller source-change"
3. `controller-release-state.json`: `version == NEW`, `promoted: true`
4. `references/controller-cap/values.yaml`: tag atualizada
5. Esteira corporativa: build + test + lint passaram
6. Imagem Docker gerada no registry

## Timeout e Re-trigger

Se apply-source-change não aparecer em 2 minutos após merge:
```
→ Verificar se run foi incrementado no trigger
→ Verificar se merge foi squash (não merge commit)
→ Se necessário, editar trigger/source-change.json com run+1 novamente
```
