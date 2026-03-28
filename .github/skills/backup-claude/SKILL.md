---
name: backup-claude
description: Protocolo de backup do Claude Code. Use quando Claude estiver indisponível, travado, ou quando precisar retomar uma tarefa que Claude deixou em andamento.
---

# Backup Claude Skill

## Quando usar
- Claude não responde há muito tempo
- Workflow travado com PR aberto do Claude
- Usuario menciona "Claude caiu", "assumir", "backup"
- `contracts/claude-live-status.json` mostra `status: idle` mas há PRs abertos

## Boot como Backup

### 1. Ler status do Claude
```
get_file_contents("contracts/claude-live-status.json")
→ Extrair: currentSession.status, currentSession.task, currentSession.phase
→ activeDeploy: version, component, triggerRun
→ openPRs: lista de PRs abertos
→ runningWorkflows: lista de workflows rodando
```

Se `claude-live-status.json` não existir → skip graceful, continuar com outros passos.

### 2. Ler memória completa do Claude
```
get_file_contents("contracts/claude-session-memory.json")
→ Extrair: versioningRules, workflowMonitoring, knownFailures
→ Identificar tarefa em andamento
```

**IMPORTANTE:** Ler apenas. NUNCA modificar esses arquivos.

### 3. Verificar PRs abertos do Claude
```
list_pull_requests(state: "open")
→ Filtrar: branches começando com "claude/"
→ Verificar: draft status, checks status
```

### 4. Verificar workflows rodando
```
list_workflow_runs(status: "in_progress", per_page: 10)
→ Identificar workflows do Claude ainda rodando
→ Aguardar ou continuar dependendo do estado
```

### 5. Mapear próximos passos

Com base no que Claude deixou, identificar:

| Estado encontrado | Ação |
|---|---|
| PR aberto do Claude, checks passando | Mergear via `merge_pull_request` |
| PR aberto do Claude, checks falhando | Analisar falha + criar fix em branch `copilot/fix-...` |
| apply-source-change rodando | Monitorar (skill: `monitor-workflow`) |
| apply-source-change falhou | Diagnosticar + fix (skill: `fix-ci-failure`) |
| Nenhum PR aberto, deploy incompleto | Retomar do ponto de parada |
| Tudo parece OK | Verificar se memoria precisa ser atualizada |

## Diferenças Copilot vs Claude

| Operação | Claude | Copilot |
|---|---|---|
| Branch prefix | `claude/*` | `copilot/*` |
| Commit prefix | `[claude]` | `[copilot]` |
| Files do Claude | Modifica | **NUNCA modifica** |
| claude-session-memory.json | Modifica | **NUNCA modifica** |

## Protocolo de Retomada

### Cenário A: Deploy em andamento
1. Verificar `trigger/source-change.json` — run e versão
2. Verificar `state/workspaces/ws-default/controller-release-state.json` (branch: autopilot-state)
3. Se apply-source-change não trigou: incrementar `run` novamente e criar novo PR `copilot/retry-deploy-...`
4. Monitorar até conclusão (skill: `monitor-workflow`)

### Cenário B: PR do Claude travado em draft
```
update_pull_request(
  pullNumber: PR_NUMBER,
  draft: false
)
→ autonomous-merge-direct.yml vai mergear automaticamente
```

### Cenário C: CI falhou após deploy do Claude
1. Usar skill: `fix-ci-failure` para diagnóstico
2. Criar patch de correção em `patches/`
3. Fazer novo deploy via `copilot/fix-ci-...`

### Cenário D: Nada em andamento
Verificar se há handoffs pendentes:
```
get_file_contents(
  path: "state/workspaces/ws-default/handoffs/",
  branch: "autopilot-state"
)
→ Executar handoff pendente se existir
```

## Referências
- Protocolo completo: `contracts/copilot-backup-protocol.md`
- Deploy guide: `contracts/copilot-deploy-guide.md`
- Deploy docs (12 fases): `ops/docs/deploy-process/`
