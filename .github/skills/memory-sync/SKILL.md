---
name: memory-sync
description: Sincroniza a memória persistente do Copilot. Use ao final de cada sessão ou quando precisar gravar lições, decisões e estado atual.
---

# Memory Sync Skill

## Quando usar
- Final de cada sessão (obrigatório)
- Após aprender uma nova lição ou erro
- Quando o estado (versão, run) mudar
- Quando uma nova decisão importante for tomada
- Ao receber instrução de "aprenda" ou "grave na memória"

## Passo a passo

### 1. Ler estado atual
```
get_file_contents("contracts/copilot-session-memory.json")
→ Extrair: sessionCount, currentState, sessionsLog
```

### 2. Ler estado do trigger
```
get_file_contents("trigger/source-change.json")
→ Extrair: version, run
```

### 3. Preparar atualização
Construir JSON atualizado com:
- `sessionCount`: sessionCount + 1
- `lastUpdated`: timestamp atual (ISO 8601)
- `lastSessionId`: `"session-{DATE}-{TASK}"`
- `currentState.lastTriggerRun`: run atual
- `currentState.pipelineStatus`: status atual
- Novo item em `sessionsLog[]` com date, summary, actions, lessons
- Novos items em `lessonsLearned[]` se houver lições
- Novos items em `decisions[]` se houver decisões
- Novos items em `errorPatterns{}` se houver novos erros

### 4. Push via push_files
```
push_files(
  owner: "lucassfreiree",
  repo: "autopilot",
  branch: "copilot/update-memory-{DATE}",
  message: "[copilot] chore: update session memory — session {N}",
  files: [
    {
      path: "contracts/copilot-session-memory.json",
      content: "<updated JSON>"
    }
  ]
)
```

### 5. Criar PR e mergear
```
create_pull_request(draft: false, title: "[copilot] chore: update session memory")
merge_pull_request(merge_method: "squash")
```

## Template de entrada no sessionsLog

```json
{
  "date": "2026-MM-DD",
  "summary": "Descrição curta do que foi feito",
  "actions": [
    "action-1",
    "action-2"
  ],
  "triggeredBy": "Issue #N ou usuário — motivo",
  "lessonsLearned": [
    "Lição importante aprendida"
  ]
}
```

## Campos que NUNCA devem ser modificados
- `schemaVersion`
- `description`

## Isolamento
NUNCA modificar:
- `contracts/claude-session-memory.json`
- `contracts/claude-agent-contract.json`
- `CLAUDE.md`
- `AGENTS.md`
