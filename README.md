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
   - inclui comandos práticos para descobrir/acompanhar checks e acionar workflows oficiais de diagnóstico/correção

## Segurança e isolamento

- Nunca misturar contextos entre workspaces.
- Sempre usar `workspace_id` explícito nas operações.
- Antes de qualquer alteração de estado, verificar lock de sessão em `state/workspaces/<ws_id>/locks/session-lock.json`.
