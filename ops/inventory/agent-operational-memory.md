# Agent Operational Memory (Codex)

> Objetivo: registrar contexto técnico persistente entre sessões para operação autônoma, segura e sem regressão.

## Estado atual do ambiente (2026-03-25)

- Repositório local operacional em `/workspace/autopilot`.
- Branch de trabalho atual: `work`.
- Remote `origin` configurado para `https://github.com/lucassfreiree/autopilot.git`.
- Conectividade de saída HTTPS para GitHub bloqueada neste runner (`CONNECT tunnel failed, response 403`).
- `gh` CLI indisponível no ambiente e instalação via `apt` bloqueada por proxy.

## Decisões técnicas já aplicadas

1. **Visibilidade no Actions**
   - `run-name` padronizado com contexto de workflow/event/workspace/ref.
2. **Observabilidade de workflows**
   - Workflow dedicado de inventário (`ops-workflow-observability.yml`).
   - Gerador `workflow-observability-report.py` com saídas Markdown/JSON.
3. **Automação de PR (resiliência a ambiente sem gh)**
   - `auto-pr-merge.sh` com fallback via API (`CODEX_TOKEN`/`GITHUB_TOKEN`) quando `gh` não existir.

## Restrições e armadilhas conhecidas

- Push/merge remoto pode falhar mesmo com URL correta, devido ao bloqueio de egress do ambiente.
- Token nunca deve ser salvo em arquivo/repo; uso apenas em runtime via secret/env.
- Em ausência de `gh`, auto-merge completo depende de etapa posterior com GraphQL/CLI disponível.

## Comandos úteis validados

```bash
# Validação de workflow YAML
python - <<'PY'
import yaml,glob
for f in glob.glob('.github/workflows/*.yml'):
    with open(f) as fh:
        yaml.safe_load(fh)
print('workflow yaml parse: OK')
PY

# Inventário observability
python ops/scripts/ci/workflow-observability-report.py

# Sanidade de patch
git diff --check

# Sanidade do helper de PR
bash -n ops/scripts/git/auto-pr-merge.sh
```

## Próximas melhorias seguras (backlog)

1. Adicionar summary padrão por job (início/fim/status/contexto/workspace) nos workflows críticos.
2. Gerar relatório de gaps de `workspace_id` por workflow e sugerir correções não disruptivas.
3. Implementar checklist automático de pré-execução (locks, inputs obrigatórios, contexto).
4. Publicar matriz de integrações (GitHub/GitLab/Jenkins/Cloud/K8s/Terraform) com cobertura por workflow.


## Integração declarada: Agent Bridge (Claude ↔ Codex)

Contexto informado pelo operador:

- Workflow: `agent-bridge.yml`
- Trigger: `trigger/agent-bridge.json`
- Entrada esperada: `task`, `model`, `include_session_memory`, `include_patches`, `run`
- Fluxo declarado: trigger em `main` → chamada OpenAI API com contexto → resposta salva em `autopilot-state` (`agent-bridge-latest.json`)

Observação operacional:
- Neste ambiente local atual, os artefatos do Agent Bridge ainda não estão presentes no working tree local (provável divergência por falta de sincronização remota).
- Assim que houver sincronização com remoto, validar o fluxo com uma execução de trigger controlada.
