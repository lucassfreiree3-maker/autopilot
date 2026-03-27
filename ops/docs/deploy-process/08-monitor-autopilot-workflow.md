# Fase 08 — Monitorar Workflow Autopilot (apply-source-change.yml)

## Objetivo

Acompanhar o workflow `apply-source-change.yml` que foi disparado automaticamente pelo merge do PR. Este workflow tem 7 stages que devem ser monitorados ate a conclusao.

## Disparo Automatico

O workflow dispara quando `trigger/source-change.json` e alterado na branch `main`:

```yaml
on:
  push:
    branches: [main]
    paths: ['trigger/source-change.json']
```

**Concurrency**: O workflow usa `concurrency: { group: source-change, cancel-in-progress: true }`. Isto significa que se um novo run for disparado enquanto outro esta rodando, o anterior e CANCELADO.

## Como Verificar se o Workflow Disparou

### Via GitHub API
```bash
# Listar ultimos runs
curl -s "https://api.github.com/repos/lucassfreiree/autopilot/actions/workflows/apply-source-change.yml/runs?per_page=3" \
  | jq '.workflow_runs[] | {id, status, conclusion, created_at, head_sha}'
```

### Via gh CLI
```bash
gh api repos/lucassfreiree/autopilot/actions/workflows/apply-source-change.yml/runs?per_page=3 \
  --jq '.workflow_runs[] | {id, status, conclusion, created_at}'
```

### Via MCP GitHub (agentes)
```
mcp__github__list_commits(
  owner: "lucassfreiree",
  repo: "autopilot",
  sha: "autopilot-state"
)
# Procurar por commits recentes: "lock: session claude-code", "state: controller", "audit: source-change"
```

## Protocolo de Polling

| Momento | Intervalo | Acao |
|---------|-----------|------|
| Apos merge (0-1 min) | 30s | Verificar se workflow disparou |
| Durante execucao | 60s | Verificar status (in_progress/completed) |
| CI Gate (Stage 3) | 60s | Pode demorar ate 20 min (esteira corporativa) |
| Apos conclusao | Imediato | AVISAR usuario e verificar resultado |

**REGRA**: NUNCA usar sleep > 60s. Polling ativo e frequente.

## Os 7 Stages em Detalhe

---

### Stage 1: Setup

**Job name**: `1. Setup`
**Runner**: `ubuntu-latest`
**Duracao tipica**: 10-30 segundos

**O que faz:**
1. Checkout do repo autopilot
2. Le `trigger/source-change.json` (se disparado por push) OU inputs do dispatch
3. Extrai campos: workspace_id, component, change_type, changes, etc.
4. Le `workspace.json` do branch `autopilot-state` via GitHub API
5. Extrai config dos repos: sourceRepo, capRepo, capBranch, capValuesPath, imagePattern
6. Codifica changes em base64 para passar entre jobs (evita problemas de quoting)
7. Exporta todas as variaveis como outputs do job

**Outputs do Setup:**
| Output | Exemplo | Usado por |
|--------|---------|-----------|
| `ws_id` | `ws-default` | Todos os stages |
| `component` | `controller` | Stages 2, 3, 4, 5 |
| `components_json` | `["controller"]` | Matrix strategy |
| `change_type` | `multi-file` | Stage 2 |
| `changes_b64` | (base64 encoded) | Stage 2 |
| `commit_message` | `feat: ...` | Stage 2 |
| `skip_ci` | `false` | Stage 3 |
| `promote` | `true` | Stage 4 |
| `controller_repo` | `bbvinet/psc-sre-automacao-controller` | Stage 2 |
| `controller_cap_repo` | `bbvinet/psc_releases_cap_sre-aut-controller` | Stage 4 |
| `controller_cap_values` | `releases/openshift/hml/deploy/values.yaml` | Stage 4 |
| `controller_image_pattern` | `image: .*psc-sre-automacao-controller:` | Stage 4 |

**Se falhar:**
- Verificar se `trigger/source-change.json` e JSON valido
- Verificar se `workspace.json` existe no `autopilot-state`
- Verificar se `RELEASE_TOKEN` tem acesso ao repo

---

### Stage 1.5: Session Guard

**Job name**: `1.5 Session Guard`
**Runner**: `ubuntu-latest`
**Depends on**: Setup
**Duracao tipica**: 5-15 segundos

**O que faz:**
1. Define agente como `claude-code` e operacao como `source-change`
2. Le lock existente no path `state/workspaces/<ws>/locks/session-lock.json` do `autopilot-state`
3. Se lock existe e NAO expirou e e de OUTRO agente → **BLOQUEADO** (exit 1)
4. Se lock existe mas expirou → Override (sobrescreve)
5. Se lock existe do MESMO agente → Refresh (atualiza expiracao)
6. Se nenhum lock → Adquire novo lock
7. Lock tem TTL de 30 minutos (`expiresAt`)
8. Salva lock no `autopilot-state` via GitHub API

**Formato do lock:**
```json
{
  "lockId": "claude-code-1711234567-12345",
  "agentId": "claude-code",
  "operation": "source-change",
  "workspaceId": "ws-default",
  "acquiredAt": "2026-03-27T10:00:00Z",
  "expiresAt": "2026-03-27T10:30:00Z",
  "runId": "23458334088"
}
```

**Se falhar (BLOCKED):**
- Outro agente (ex: Codex) esta fazendo operacao no mesmo workspace
- Opcoes: esperar TTL expirar (30 min) ou verificar se o outro agente realmente esta ativo
- O workflow aborta com erro `BLOCKED by <agent_id>`

---

### Stage 2: Apply & Push

**Job name**: `2. Apply & Push (<component>)`
**Runner**: `ubuntu-latest`
**Depends on**: Setup, Session Guard
**Duracao tipica**: 1-5 minutos (inclui npm install para lint)

**Steps internos:**

#### Step 2.1: Resolve repo
Determina qual repo corporativo usar baseado no component:
- `controller` → `bbvinet/psc-sre-automacao-controller`
- `agent` → `bbvinet/psc-sre-automacao-agent`

#### Step 2.2: Clone
```bash
git clone "https://x-access-token:${BBVINET_TOKEN}@github.com/${REPO}.git" /tmp/source
cd /tmp/source
git config user.name "github-actions"
git config user.email "github-actions@github.com"
```

#### Step 2.3: Checkout autopilot (para patch files)
Somente para `multi-file`:
```bash
git clone --depth 1 "https://x-access-token:${RELEASE_TOKEN}@github.com/lucassfreiree/autopilot.git" /tmp/autopilot
```
Isso disponibiliza os arquivos em `patches/` para o step de apply.

#### Step 2.4: Apply change
Para `multi-file`, itera sobre o array de changes:

```bash
for i in $(seq 0 $((COUNT - 1))); do
  ITEM=$(echo "$CHANGES" | jq -c ".[$i]")
  ACTION=$(echo "$ITEM" | jq -r '.action')
  TPATH=$(echo "$ITEM" | jq -r '.target_path')

  case "$ACTION" in
    search-replace)
      SEARCH=$(echo "$ITEM" | jq -r '.search')
      REPLACE=$(echo "$ITEM" | jq -r '.replace')
      sed -i "s|${SEARCH}|${REPLACE}|g" "$TPATH"
      ;;
    replace-file)
      CONTENT_REF=$(echo "$ITEM" | jq -r '.content_ref')
      cp "/tmp/autopilot/${CONTENT_REF}" "$TPATH"
      ;;
  esac
done
```

#### Step 2.5: Lint check (per-file)
Para single-file changes, roda ESLint no arquivo alterado.
Para multi-file, **PULA** este step (defer para o proximo).

#### Step 2.6: Fix pre-existing lint errors
3 fases de lint:
1. **eslint --fix**: Corrige automaticamente o que pode
2. **Verificar remaining**: Se 0 erros, pronto
3. **eslint-disable comments**: Para erros nao auto-fixaveis, adiciona `// eslint-disable-next-line <rule>` na linha anterior

#### Step 2.7: Push
```bash
git add -A
git commit -m "$COMMIT_MESSAGE"
git push origin main
SHA=$(git rev-parse HEAD)
```

**Outputs:**
| Output | Descricao |
|--------|-----------|
| `sha` | SHA do commit no repo corporativo |
| `pushed` | `true` se houve mudancas para commitar |
| `repo` | Nome do repo corporativo |

**Se falhar:**
- `Patch file not found`: Verificar `content_ref` no trigger aponta para arquivo existente
- `File not found: <path>`: O `target_path` nao existe no repo corporativo
- `Pattern not found`: O texto do `search` nao existe no arquivo (warning, nao erro fatal)
- Lint errors: O step de fix tenta resolver; se nao conseguir, o push vai assim mesmo
- Push rejected: Token sem permissao ou branch protection

---

### Stage 3: CI Gate

**Job name**: `3. CI Gate (<component>)`
**Runner**: `ubuntu-latest`
**Depends on**: Setup, Apply & Push
**Condicao**: `pushed == 'true'` AND `skip_ci != 'true'`
**Duracao tipica**: 5-20 minutos (depende da esteira corporativa)

**O que faz:**

#### Fase 1: Discovery (ate 180s)
Espera ate os check-runs aparecerem no commit pushado:
```bash
# Backoff: 3s → 6s → 12s → 24s → 30s
COUNT=$(gh api "repos/$REPO/commits/$SHA/check-runs" --jq '.total_count')
```

Se nenhum check aparecer em 180s: `ci_result=no-ci` (prossegue sem CI).

#### Fase 2: Completion (ate 1200s = 20 min)
Monitora os check-runs ate todos completarem:
```bash
# Backoff: 5s → 10s → 20s → 30s
# Early exit on failure
DATA=$(gh api "repos/$REPO/commits/$SHA/check-runs" --jq '{
  t:.total_count,
  c:[.check_runs[]|select(.status=="completed")]|length,
  s:[.check_runs[]|select(.conclusion=="success")]|length,
  f:[.check_runs[]|select(.conclusion=="failure")]|length
}')
```

| Resultado | Significado | Proxima acao |
|-----------|-------------|--------------|
| `success` | Todos os checks passaram | Prosseguir para Stage 4 |
| `failure` | Algum check falhou | Verificar se pre-existente |
| `no-ci` | Nenhum check encontrado | Prosseguir com warning |
| `timeout` | Checks nao completaram em 20 min | Prosseguir com warning |

#### Fase 3: Smart CI — Pre-existing Detection
Se CI falhou, verifica se a falha ja existia ANTES do nosso commit:

1. Busca o commit pai (HEAD~1)
2. Verifica check-runs do pai
3. Se pai tambem falhou → Falha PRE-EXISTENTE (nao foi causada por nos)
4. Se pai passou → Nossa mudanca QUEBROU o CI

**Gate Decision:**
| CI Result | Pre-existing | Decision | Acao |
|-----------|:------------:|----------|------|
| success | - | `pass` | Continua normalmente |
| no-ci | - | `pass` | Continua com warning |
| failure | true | `pass-preexisting` | Continua (falha nao e nossa) |
| failure | unknown | `pass-unknown` | Continua com cautela |
| failure | false | `block` | **PARA** — nossa mudanca quebrou o CI |

**ATENCAO**: A deteccao de pre-existing tem um bug conhecido. Pode reportar `failure` mesmo quando a esteira passou. Para resultado REAL, verificar os logs da esteira corporativa (ver fase 09).

---

### Stage 4: Promote (CAP)

**Job name**: `4. Promote to CAP (<component>)`
**Runner**: `ubuntu-latest`
**Depends on**: Setup, Apply & Push, CI Gate
**Condicao**: `promote == 'true'` AND CI Gate nao falhou
**Duracao tipica**: 10-30 segundos

**O que faz:**
1. Le a versao do `package.json` do repo corporativo (source of truth)
2. Le o `values.yaml` atual do repo CAP via GitHub API
3. Substitui a tag da imagem Docker usando sed com o `imagePattern`
4. Faz commit no CAP repo via GitHub API

**Para Controller:**
```bash
# Pattern: image: .*psc-sre-automacao-controller:
# Substitui por: image: .*psc-sre-automacao-controller:3.6.7
CAP_REPO="bbvinet/psc_releases_cap_sre-aut-controller"
VALUES_PATH="releases/openshift/hml/deploy/values.yaml"
```

**Para Agent:**
```bash
CAP_REPO="bbvinet/psc_releases_cap_sre-aut-agent"
VALUES_PATH="releases/openshift/hml/deploy/values.yaml"
```

**Se falhar:**
- `No CAP repo configured`: `workspace.json` nao tem `capRepo` configurado
- `Image pattern didn't match`: O `imagePattern` do workspace.json nao bate com a linha no values.yaml
- Token sem permissao: `BBVINET_TOKEN` sem acesso ao CAP repo

---

### Stage 5: Save State

**Job name**: `5. Save State (<component>)`
**Runner**: `ubuntu-latest`
**Depends on**: Setup, Apply & Push, CI Gate, Promote
**Condicao**: `pushed == 'true'` (sempre roda se houve push)
**Duracao tipica**: 5-15 segundos

**O que faz:**
Salva o estado da release no branch `autopilot-state`:
```
state/workspaces/<ws_id>/<component>-release-state.json
```

**Formato do estado:**
```json
{
  "schemaVersion": 2,
  "workspaceId": "ws-default",
  "component": "controller",
  "lastReleasedSha": "abc1234...",
  "lastTag": "3.6.7",
  "updatedAt": "2026-03-27T10:15:00Z",
  "runId": "23458334088",
  "runUrl": "https://github.com/lucassfreiree/autopilot/actions/runs/23458334088",
  "ciResult": "success",
  "status": "promoted",
  "changeType": "source-code",
  "commitMessage": "feat: ...",
  "promoted": true,
  "preExistingFailure": false,
  "gateDecision": "pass"
}
```

**Status possiveis:**
| Status | Significado |
|--------|-------------|
| `promoted` | CI passou + CAP atualizado |
| `promoted-preexisting-ci-fail` | CI falhou (pre-existente) + CAP atualizado |
| `ci-passed` | CI passou, promote nao habilitado |
| `ci-failed-preexisting` | CI falhou (pre-existente), sem promote |
| `ci-failed` | CI falhou por nossa mudanca |
| `pending` | Status indefinido |

---

### Stage 6: Audit & Release Lock

**Job name**: `6. Audit & Release Lock`
**Runner**: `ubuntu-latest`
**Depends on**: Todos os stages anteriores
**Condicao**: Sempre roda (`if: always()`)
**Duracao tipica**: 5-15 segundos

**O que faz:**

#### Step 6.1: Release session lock
Sobrescreve o lock com um "released" marker:
```json
{
  "lockId": "released",
  "agentId": "none",
  "operation": "none",
  "acquiredAt": "2026-03-27T10:15:00Z",
  "expiresAt": "2026-03-27T10:15:00Z"
}
```

#### Step 6.2: Record audit
Salva registro de audit no branch `autopilot-state`:
```
state/workspaces/<ws_id>/audit/source-change-<timestamp>.json
```

**Formato do audit:**
```json
{
  "operation": "source-code-change",
  "workspaceId": "ws-default",
  "timestamp": "2026-03-27T10:15:00Z",
  "runId": "23458334088",
  "component": "controller",
  "changeType": "multi-file",
  "commitMessage": "feat: ...",
  "commitSha": "abc1234...",
  "ciResult": "success",
  "promoted": true,
  "stages": {
    "apply": "success",
    "ci": "success",
    "promote": "success",
    "state": "success"
  }
}
```

## Pipeline Summary (GitHub Actions)

Ao final, o workflow gera um summary na aba do run com tabela de resultados:

```
| Stage           | Result  |
|-----------------|---------|
| 1. Setup        | success |
| 2. Apply & Push | success |
| 3. CI Gate      | success |
| 4. Promote      | success |
| 5. Save State   | success |
| 6. Audit        | running |
```

## Como Verificar Jobs de um Run

```bash
# Listar jobs do run
gh api repos/lucassfreiree/autopilot/actions/runs/<RUN_ID>/jobs \
  --jq '.jobs[] | {name, status, conclusion, steps: [.steps[] | {name, conclusion}]}'
```

## Checklist da Fase 08

- [ ] Workflow disparou apos merge (verificar em 30s)
- [ ] Stage 1 (Setup) completou com sucesso
- [ ] Stage 1.5 (Session Guard) adquiriu lock
- [ ] Stage 2 (Apply & Push) pushou com sucesso (sha != null)
- [ ] Stage 3 (CI Gate) completou (success/pass-preexisting)
- [ ] Stage 4 (Promote) atualizou tag no CAP
- [ ] Stage 5 (Save State) salvou estado
- [ ] Stage 6 (Audit) registrou trail e liberou lock
- [ ] Usuario notificado do resultado

---

*Anterior: [07-commit-push-pr-merge.md](07-commit-push-pr-merge.md) | Proximo: [09-monitor-corporate-ci.md](09-monitor-corporate-ci.md)*
