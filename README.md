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

## Segurança e isolamento

- Nunca misturar contextos entre workspaces.
- Sempre usar `workspace_id` explícito nas operações.
- Antes de qualquer alteração de estado, verificar lock de sessão em `state/workspaces/<ws_id>/locks/session-lock.json`.

## Fluxo web-only para correções de segurança

Para vulnerabilidades em controller/agent sem depender desta máquina:

1. Abra uma issue usando `.github/ISSUE_TEMPLATE/security-remediation.yml`
2. O workflow `.github/workflows/security-intake-dispatch.yml` classifica a issue e comenta `@claude` automaticamente
3. O workflow `.github/workflows/claude-assistant.yml` executa de forma autonoma e abre PR no `autopilot`
4. A PR ajusta patches/triggers no control plane
5. Merge em `main` dispara `.github/workflows/apply-source-change.yml`
6. O deploy passa por `.github/workflows/compliance-gate.yml`, promocao, auditoria e `autopilot-state`

Esse caminho existe para privilegiar execucao na web/GitHub Actions, com o minimo de dependencia da maquina local.

Para os achados de seguranca do controller citados pelo scanner, o control plane ja possui regras dedicadas no `compliance-gate.yml` para:

- `security-xss`
- `security-ssrf`
- `security-dos-loop`
