# Autopilot Dashboard — Prompt para GitHub Spark

> Abra o GitHub Spark (github.com/spark) e cole o prompt abaixo.
> Após criar, clique em "Create repository" para two-way sync.
> O repo criado será mantido automaticamente pelo Copilot Coding Agent.

## PROMPT PARA COLAR NO SPARK

```
Crie um dashboard de operações chamado "Autopilot Dashboard" para monitorar
um sistema de deploy CI/CD multi-agente. O app deve ter:

## Página principal: Status Overview
- Card com versão atual do Controller (ex: 3.6.8) e Agent (ex: 2.2.9)
- Card com último deploy (data, componente, versão, status: success/failed)
- Card com status do pipeline (idle/running/failed)
- Card com último trigger run (número)
- Indicador de qual agente está ativo (Claude/Copilot/idle)
- Timestamp da última atualização

## Página: Deploy History
- Tabela com histórico de deploys (data, componente, versão, status, run #, duração)
- Filtro por componente (controller/agent) e status (success/failed)
- Cada row clicável mostrando detalhes (stages, CI result, promoted)

## Página: Agent Activity
- Timeline de atividades dos agentes (Claude Code, Copilot, Codex)
- Sessões recentes com resumo do que fizeram
- Lessons learned (lista de erros conhecidos e fixes)
- Memória persistente do Copilot (sessões, decisões)

## Página: Workflows
- Lista de workflows do GitHub Actions com status (success/failed/running)
- Botão para disparar workflows comuns (deploy, CI check, health check)
- Log de runs recentes

## Página: Pipeline Monitor
- Visualização dos 7 stages do apply-source-change
- Status em tempo real de cada stage (pending/running/success/failed)
- Tempo decorrido em cada stage

## Dados
O app lê dados de um arquivo JSON em /api/state que contém:
{
  "controller": { "version": "3.6.8", "lastDeploy": "2026-03-27" },
  "agent": { "version": "2.2.9", "lastDeploy": "2026-03-26" },
  "pipeline": { "status": "idle", "lastRun": 66, "lastResult": "success" },
  "activeAgent": { "name": "idle", "task": null },
  "deploys": [...],
  "agents": { "claude": {...}, "copilot": {...} },
  "workflows": [...],
  "lessonsLearned": [...]
}

## Design
- Dark mode por padrão
- Cores: verde para success, vermelho para failed, amarelo para running, cinza para idle
- Sidebar com navegação entre páginas
- Responsivo (desktop e mobile)
- Refresh automático a cada 30 segundos
```

## APÓS CRIAR O APP NO SPARK

1. Clique em **"Create repository"** no Spark para criar o repo
2. Anote o nome do repo criado (ex: `lucassfreiree/autopilot-dashboard`)
3. Edite `integrations/spark/config.json` com o nome do repo
4. O workflow `spark-sync-state.yml` vai sincronizar dados automaticamente
5. O Copilot Coding Agent pode ser assignado a issues no repo do Spark para melhorar o dashboard

## TWO-WAY SYNC

```
Autopilot (autopilot-state branch)
  → spark-sync-state.yml (scheduled every 15 min)
  → Push state.json para repo do Spark
  → Spark app lê e exibe

Spark UI (edições visuais)
  → Push para repo do Spark (main)
  → Coding Agent pode iterar via issues
```
