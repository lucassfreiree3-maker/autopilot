# Shared Agent Context (Codex + Claude + ChatGPT)

> Fonte de contexto operacional compartilhada entre workflows de agentes.
> Objetivo: reduzir perda de contexto entre execuções e padronizar decisões.

## 1) Modelo multi-workspace (isolamento obrigatório)

- Cada execução deve operar com `workspace_id` explícito.
- Workspaces suportados:
  - `ws-default` (Getronics)
  - `ws-cit` (CIT)
  - `ws-corp-1` (Corporate Workspace 1)
  - `ws-socnew` (SocNew)
- Nunca misturar estado, lock, métricas ou handoffs entre workspaces.

## 2) Regras operacionais essenciais

1. Verificar lock/sessão antes de operações que mudam estado.
2. Não armazenar segredos em commits, prompts, logs ou artefatos.
3. Estado em `autopilot-state` é a fonte de verdade.
4. Evitar suposições: usar inputs e arquivos de trigger como referência primária.

## 3) Fluxo padrão de mudança (alto nível)

1. Trigger atualizado (`trigger/*.json`) com `run` incrementado.
2. Workflow carrega contexto compartilhado.
3. Prompt de sistema recebe regras e contexto operacional.
4. Modelo retorna plano/mudanças no formato esperado.
5. Aplicação segura de mudanças (path validation).
6. Commit em branch `codex/*`.
7. PR + (opcional) auto-merge.
8. Resultado salvo em `autopilot-state`.

## 4) Segurança e autenticação

- Rejeitar caminhos absolutos e traversal (`..`).
- Nunca incluir credenciais no conteúdo gerado.
- Usar apenas secrets configurados no repositório para autenticação.

## 5) Padrões de erro conhecidos (resumo)

| Pattern | Causa comum | Ação recomendada |
|---|---|---|
| `HTTP 401/403` OpenAI | chave inválida/escopo | validar `OPENAI_API_KEY` e permissões |
| `HTTP 429` OpenAI | sem quota/rate limit | reexecutar após ajuste de quota/backoff |
| JSON inválido do modelo | saída fora do formato | reforçar prompt + validar com `jq` |
| `No changes were applied` | ações vazias/inválidas | revisar `changes[]` e paths |
| erro em push/PR | token sem permissão | validar `RELEASE_TOKEN` e permissions |

## 6) Arquivos-chave

- Contratos: `contracts/*.json`
- Triggers: `trigger/*.json`
- Workflows: `.github/workflows/*.yml`
- Estado: branch `autopilot-state` em `state/`

---

Última atualização: 2026-03-25
