# Fase 09 — Monitorar Esteira Corporativa (CI do Repo Corporativo)

## Objetivo

Acompanhar a Esteira de Build NPM que roda no repo corporativo APOS o push feito pelo Stage 2 do apply-source-change. Esta esteira e INDEPENDENTE do workflow do autopilot.

## CRITICO: apply-source-change SUCCESS != Deploy Completo

O workflow `apply-source-change.yml` verifica o CI Gate (Stage 3), mas isso e apenas uma verificacao basica dos check-runs. A esteira corporativa completa (Esteira de Build NPM) roda de forma independente e pode:

1. **Passar no CI Gate** mas falhar na esteira completa
2. Levar ate **20 minutos** para completar
3. Falhar em etapas posteriores (publish Docker image, etc.)

**O deploy so esta COMPLETO quando a imagem Docker e publicada no registry corporativo.**

## O que e a Esteira de Build NPM

A esteira corporativa e um pipeline CI/CD que roda em runner corporativo (nao no GitHub Actions do autopilot). Ela executa:

```
1. Checkout do codigo
2. npm ci (instala dependencias)
3. npm run build (compilacao TypeScript)
4. npm run lint (ESLint)
5. npm run test (Jest - todos os testes)
6. Docker build (gera imagem)
7. Docker push (publica no registry corporativo)
8. Tag no registry (ex: 3.6.7)
```

## Como Monitorar a Esteira

### Metodo 1: Via ci-status-check.yml (Recomendado)

Dispara o workflow `ci-status-check.yml` que verifica o status de CI no repo corporativo:

1. Editar `trigger/ci-status.json`:
```json
{
  "workspace_id": "ws-default",
  "component": "controller",
  "commit_sha": "<SHA_DO_COMMIT_CORPORATIVO>",
  "run": <PROXIMO_RUN>
}
```

2. Mergear em main
3. Resultado salvo em: `state/workspaces/ws-default/ci-status-controller.json` no `autopilot-state`

**Formato do resultado:**
```json
{
  "component": "controller",
  "commitSha": "abc1234",
  "overall": "success",
  "counts": {
    "total": 1,
    "success": 1,
    "failed": 0,
    "in_progress": 0
  },
  "checkRuns": [
    {
      "name": "Esteira de Build NPM",
      "status": "completed",
      "conclusion": "success"
    }
  ]
}
```

### Metodo 2: Via GitHub API Direta

```bash
# SHA do commit corporativo (output do Stage 2)
SHA="<sha_do_commit_no_repo_corporativo>"
REPO="bbvinet/psc-sre-automacao-controller"

# Verificar check-runs
gh api "repos/$REPO/commits/$SHA/check-runs" \
  --jq '.check_runs[] | {name, status, conclusion}'
```

### Metodo 3: Via Audit Trail no autopilot-state

Verificar commits recentes no branch `autopilot-state`:

```bash
# Listar commits recentes do autopilot-state
gh api "repos/lucassfreiree/autopilot/commits?sha=autopilot-state&per_page=10" \
  --jq '.[] | {sha: .sha[:7], message: .commit.message}'
```

Procurar por:
- `state: controller source-change -> 3.6.7` (Save State completou)
- `audit: source-change ...` (Audit registrado)
- `lock: session released` (Lock liberado)

### Metodo 4: Via ci-diagnose.yml (Para Falhas)

Se a esteira falhou, usar o workflow de diagnostico:

1. Editar `trigger/ci-diagnose.json`:
```json
{
  "workspace_id": "ws-default",
  "component": "controller",
  "commit_sha": "<SHA_DO_COMMIT>",
  "run": <PROXIMO_RUN>
}
```

2. Resultado salvo como `ci-logs-controller-<job_id>.txt` no `autopilot-state`

## Tempos Tipicos da Esteira

| Resultado | Duracao Tipica | Observacao |
|-----------|---------------|------------|
| Esteira PASSOU | 12-15 minutos | Build completo com Docker image |
| Esteira FALHOU (teste) | 3-5 minutos | Falha rapida em jest |
| Esteira FALHOU (lint) | 2-3 minutos | Falha rapida em ESLint |
| Esteira FALHOU (build) | 1-2 minutos | Erro TypeScript |
| Esteira FALHOU (publish) | 14+ minutos | Build OK mas publish falhou (ex: tag duplicada) |

**Dica**: Se a esteira levou 14+ minutos e reportou falha, pode ser que build e testes passaram mas o publish falhou (tag duplicada). Neste caso, basta bumpar versao.

## Acompanhamento por SHA

**IMPORTANTE**: O SHA do commit no repo CORPORATIVO e DIFERENTE do SHA do merge no AUTOPILOT.

| SHA | Onde vem | Para que |
|-----|----------|---------|
| SHA do merge no autopilot | Output do squash merge do PR | Identificar o workflow run no autopilot |
| SHA do commit corporativo | Output do Stage 2 (Apply & Push) | Monitorar a esteira corporativa |

Para obter o SHA corporativo:
```bash
# No workflow summary (Stage 2)
# Ou via release-state no autopilot-state:
gh api "repos/lucassfreiree/autopilot/contents/state/workspaces/ws-default/controller-release-state.json?ref=autopilot-state" \
  --jq '.content' | base64 -d | jq -r '.lastReleasedSha'
```

## Builds e Commits Especificos

### Rastreando o Commit Correto

```
Autopilot PR merge → SHA autopilot (ex: abc1234)
  ↓
apply-source-change.yml dispara
  ↓
Stage 2: Clone repo corp + apply patches + push
  ↓
Commit no repo corporativo → SHA corporativo (ex: def5678)
  ↓
Esteira de Build NPM roda para SHA def5678
  ↓
Check-runs: gh api "repos/bbvinet/psc-sre-automacao-controller/commits/def5678/check-runs"
```

### Mapa de Rastreamento

| O que voce quer saber | Onde encontrar |
|----------------------|----------------|
| Workflow run do autopilot | `gh api repos/lucassfreiree/autopilot/actions/runs/<run_id>` |
| SHA do commit corporativo | `controller-release-state.json` no autopilot-state, campo `lastReleasedSha` |
| Status da esteira | `ci-status-controller.json` no autopilot-state |
| Logs da esteira | `ci-logs-controller-<job_id>.txt` no autopilot-state |
| Tag promovida no CAP | `audit/source-change-*.json` no autopilot-state, campo `promoted` |

## Se a Esteira Falhar

### Protocolo de Auto-Fix

1. **Identificar o erro** — Ler logs (ci-logs-controller-*.txt)
2. **Classificar** — TypeScript? ESLint? Jest? Publish?
3. **Corrigir** — Atualizar patch em patches/
4. **Bumpar versao** — Se a tag ja foi gerada, incrementar patch
5. **Bumpar run** — Incrementar o campo `run` no trigger
6. **Novo deploy** — Commit → Push → PR → Merge → Monitorar
7. **Registrar** — Adicionar falha em `knownFailures` na session memory

### Erros Comuns da Esteira

| Erro | Padrao no log | Causa | Fix |
|------|---------------|-------|-----|
| TypeScript | `error TS2769`, `error TS2304` | Tipo incorreto, import faltando | Corrigir types/imports no patch |
| ESLint | `no-use-before-define` | Funcao usada antes de definir | Mover funcao para cima |
| ESLint | `no-unused-vars` | Dead code | Remover funcao nao usada |
| ESLint | `no-nested-ternary` | Ternario aninhado | Usar if/else |
| Jest | `FAIL src/__tests__` | Teste espera comportamento antigo | Atualizar teste |
| Publish | `duplicate tag` | Versao ja existe no registry | Incrementar versao |
| JWT | `Insufficient scope` | Claim `scopes` em vez de `scope` | Usar `scope` (singular) |

## Separacao de Monitoramento

### Esteira Controller vs Agent

Se deployou para AMBOS repos, monitorar SEPARADAMENTE:

```
Controller:
  SHA: <sha_controller>
  Repo: bbvinet/psc-sre-automacao-controller
  Check-runs: gh api "repos/bbvinet/psc-sre-automacao-controller/commits/<sha>/check-runs"
  Logs: ci-logs-controller-*.txt

Agent:
  SHA: <sha_agent>
  Repo: bbvinet/psc-sre-automacao-agent
  Check-runs: gh api "repos/bbvinet/psc-sre-automacao-agent/commits/<sha>/check-runs"
  Logs: ci-logs-agent-*.txt
```

**NUNCA** misturar SHAs entre controller e agent.

## Checklist da Fase 09

- [ ] SHA do commit corporativo identificado (output do Stage 2)
- [ ] Esteira de Build NPM acionada (check-runs aparecendo)
- [ ] Status monitorado ate conclusao (success ou failure)
- [ ] Se failure: logs baixados e analisados
- [ ] Se failure: patch corrigido e re-deploy iniciado
- [ ] Imagem Docker publicada no registry (deploy COMPLETO)
- [ ] Resultado registrado na session memory

---

*Anterior: [08-monitor-autopilot-workflow.md](08-monitor-autopilot-workflow.md) | Proximo: [10-cap-tag-promotion.md](10-cap-tag-promotion.md)*
