# Autopilot

Control plane web-only para orquestração de CI/CD multi-workspace e multi-agente (Claude, Codex, ChatGPT e Copilot), operando de forma 100% GitHub-native.

## Objetivo

Este repositório centraliza:

- Workflows de automação do controle de releases (`.github/workflows/`)
- Contratos e regras dos agentes (`contracts/`)
- Schemas de estado e validação (`schemas/`)
- Gatilhos declarativos para workflows (`trigger/`)
- Ambiente operacional de DevOps/SRE (`ops/`)
- Integrações opcionais (`integrations/`)

## Fonte de verdade

- Branch `main`: código do control plane
- Branch `autopilot-state`: estado operacional (locks, audit, health, release state)
- Branch `autopilot-backups`: snapshots para rollback

## Leitura rápida para operação por agentes

1. `AGENTS.md` — regras obrigatórias para o Codex
2. `CLAUDE.md` — contexto completo deixado pelo Claude
3. `HANDOFF.md` — guia de handoff e arquitetura detalhada
4. `ops/docs/agent-operational-parity.md` — checklist prático para operar com o mesmo fluxo do Claude
   - inclui o loop de estabilização de PR (checks/builds/correções até verde) e template de reporte final

## GitHub MCP no Codex local

O operador local do Codex pode expor o servidor MCP oficial do GitHub para ampliar a autonomia em tarefas repo-native do `autopilot`.

- Registro global do Codex: `~/.codex/config.toml` em `[mcp_servers.github]`
- Launcher local: `~/.local/bin/codex-github-mcp`
- Autenticacao: reutiliza o token do `gh auth` local, evitando PAT hardcoded no repo
- Uso ideal: triagem de repositorio, leitura de PR/issues, metadados de workflows e outras operacoes GitHub nativas
- Limite real: permissao continua vindo da conta/token autenticado; MCP nao concede write onde a conta nao tem acesso

Validacao feita em 2026-04-01:

- `codex exec ... --json` mostrou `mcp_tool_call` no servidor `github`
- ferramentas observadas no runtime: `search_repositories`, `list_pull_requests`, `search_pull_requests`
- resposta curta validada: `SOURCE=github:lucassfreiree/autopilot default=main lang=TypeScript updated=2026-04-01T17:54:00Z`

## Segurança e isolamento

- Nunca misturar contextos entre workspaces.
- Sempre usar `workspace_id` explícito nas operações.
- Antes de qualquer alteração de estado, verificar lock de sessão em `state/workspaces/<ws_id>/locks/session-lock.json`.
