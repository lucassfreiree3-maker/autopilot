# Agent Operational Parity (Claude ↔ Codex)

Este documento consolida um fluxo seguro para o Codex operar no Autopilot com a mesma disciplina operacional que o Claude, **sem alterar comportamento de pipelines existentes**.

## 1) Checklist de pré-operação (obrigatório)

1. Identificar o workspace pelo contexto da solicitação:
   - Getronics / bbvinet / NestJS / controller / agent → `ws-default`
   - CIT / Terraform / K8s / cloud / monitoring → `ws-cit`
2. Ler contratos:
   - `contracts/codex-agent-contract.json`
   - `contracts/shared-agent-contract.json`
3. Verificar lock de sessão **antes de qualquer mudança de estado**:
   - `state/workspaces/<ws_id>/locks/session-lock.json` (branch `autopilot-state`)
4. Se lock ativo por outro agente (`agentId != "none"` e `expiresAt > now`), **não forçar**:
   - criar handoff para Claude via `enqueue-agent-handoff.yml`

## 2) Princípios para não quebrar o funcionamento

- Não modificar schemas sem necessidade explícita.
- Não alterar nomes/inputs de workflows sem migração planejada.
- Não hardcodar organização/tenant em scripts; usar sempre `workspace_id`.
- Não assumir workspace padrão.
- Não persistir segredos, URLs internas ou código corporativo neste repositório.

## 3) Mapa rápido de execução (o que o Claude já fazia)

### A. Trigger file (preferido)

- Alterar arquivo em `trigger/*.json`
- Conferir `_context`
- Incrementar campo `run`

Exemplos:
- `trigger/source-change.json` → deploy de alteração no repo corporativo
- `trigger/fix-ci.json` → correção de lint no repo corporativo
- `trigger/full-test.json` → teste full flow

### B. workflow_dispatch (quando necessário)

- Disparar workflow com `workspace_id` explícito.
- Nunca omitir `workspace_id`.

### C. Handoff entre agentes

- Usar `enqueue-agent-handoff.yml` quando houver bloqueio, ambiguidade de contexto, ou necessidade de revisão arquitetural especializada.

## 4) Critérios de pronto operacional para Codex

O ambiente está em paridade operacional quando:

- Codex consegue identificar workspace corretamente.
- Codex respeita lock/session guard antes de mudança de estado.
- Codex usa triggers/workflows sem hardcode de tenant.
- Codex registra alterações via PR no repositório de control plane.
- Codex aciona handoff ao Claude quando aplicável.

## 5) Fluxo de melhoria contínua sem risco

1. Priorizar melhorias em documentação, runbooks e checklists.
2. Validar JSON/YAML alterados antes de commit.
3. Executar checagens locais de sintaxe e consistência.
4. Abrir PR com escopo pequeno e auditável.
5. Não mesclar mudanças de refatoração ampla sem validação incremental.

## 6) Loop obrigatório de estabilização de PR

Quando houver alteração de código/configuração, operar sempre em ciclo curto até estabilizar:

1. Criar branch e abrir PR (sem criar esteira nova se já existir workflow oficial).
2. Mapear checks esperados no PR (lint, testes, validações de workflow, deploy gates).
3. Acompanhar execução dos builds/checks até concluírem.
4. Resumir falhas de forma objetiva (causa provável, impacto e escopo).
5. Aplicar correção mínima necessária mantendo o padrão do repositório.
6. Repetir o ciclo (novo commit → novos checks) até todos os gates críticos ficarem verdes.
7. Considerar a pipeline corporativa como validação final de release.

### Template de status para fechamento

- Resumo do problema
- Mudanças realizadas
- Status dos checks
- Erros encontrados
- Correções aplicadas
- Riscos remanescentes
- Plano de rollback

## 7) Referências canônicas

- `AGENTS.md`
- `CLAUDE.md`
- `HANDOFF.md`
- `ops/docs/workspace-separation.md`
- `contracts/*.json`
- `schemas/*.json`
