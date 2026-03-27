# Fase 07 — Commit, Push, PR e Merge

## Objetivo

Fazer commit de todas as alteracoes, push para a branch, criar Pull Request e fazer merge (squash) para main. O merge em main dispara automaticamente o workflow de deploy.

## Passo 1: Staging dos Arquivos

Adicionar TODOS os arquivos relevantes ao staging:

```bash
# Patches (codigo a ser aplicado no repo corporativo)
git add patches/

# Trigger (dispara o workflow)
git add trigger/source-change.json

# Referencias (tag do CAP)
git add references/controller-cap/values.yaml

# Memoria (versao atualizada)
git add contracts/claude-session-memory.json

# CLAUDE.md (se a versao deployed mudou)
git add CLAUDE.md
```

**DICA**: Tudo em 1 commit. Nao separar patches do trigger — eles devem ir juntos.

**CUIDADO**: Nao usar `git add -A` ou `git add .` — pode incluir arquivos indesejados (secrets, .env, etc).

## Passo 2: Commit

```bash
git commit -m "[claude] feat: description + deploy vX.Y.Z"
```

### Convencao de Commit no Autopilot

| Prefixo | Contexto | Exemplo |
|---------|----------|---------|
| `[claude]` | Commit feito pelo Claude Code | `[claude] feat: add cronjob endpoint + deploy 3.6.7` |
| `[codex]` | Commit feito pelo Codex | `[codex] fix: eslint error + deploy 3.6.8` |
| Sem prefixo | Commit manual do usuario | `feat: update deploy trigger` |

**IMPORTANTE**: O prefixo `[claude]` ou `[codex]` e SOMENTE para commits no autopilot. Commits no repo corporativo NUNCA tem prefixo de agente.

## Passo 3: Push

```bash
git push -u origin claude/<nome-da-branch>
```

### Se o push falhar

| Erro | Causa | Solucao |
|------|-------|---------|
| `403 Forbidden` | Branch nao comeca com `claude/` | Renomear branch |
| `rejected (non-fast-forward)` | Branch desatualizada | `git pull origin claude/<branch> --rebase` |
| Erro de rede | Timeout/DNS | Retry com backoff: 2s, 4s, 8s, 16s (ate 4 tentativas) |

## Passo 4: Criar Pull Request

### Via MCP GitHub (agentes)
```
mcp__github__create_pull_request(
  owner: "lucassfreiree",
  repo: "autopilot",
  title: "feat: add cronjob endpoint + deploy controller 3.6.7",
  body: "## Deploy Controller 3.6.7\n\n- New: POST /api/cronjob/status/:execId\n- Version bump 3.6.6 → 3.6.7\n- Swagger updated\n\n## Changes\n- patches/cronjob-result.controller.ts\n- patches/controller-swagger.json\n- trigger/source-change.json (run 65)",
  head: "claude/deploy-controller-3.6.7",
  base: "main"
)
```

### Via gh CLI (humano)
```bash
gh pr create \
  --base main \
  --head claude/deploy-controller-3.6.7 \
  --title "feat: add cronjob endpoint + deploy controller 3.6.7" \
  --body "## Deploy Controller 3.6.7
- New: POST /api/cronjob/status/:execId
- Version bump 3.6.6 → 3.6.7

## Changes
- patches/cronjob-result.controller.ts
- trigger/source-change.json (run 65)"
```

## Passo 5: Verificar Mergeable State

Antes de mergear, verificar se o PR esta "limpo":

### Via MCP GitHub
```
mcp__github__pull_request_read(
  owner: "lucassfreiree",
  repo: "autopilot",
  pullNumber: <PR_NUMBER>
)
# Verificar campo mergeable_state
```

### Via gh CLI
```bash
gh pr view <PR_NUMBER> --json mergeable,mergeStateStatus
```

### Mergeable States

| State | Significado | Acao |
|-------|-------------|------|
| `clean` | Pode mergear | Prosseguir com merge |
| `dirty` | Conflitos com main | Resolver conflitos (ver abaixo) |
| `blocked` | Checks obrigatorios pendentes | Esperar checks passarem |
| `unstable` | Checks falharam | Verificar quais checks falharam |

### Resolver Conflitos (se dirty)

```bash
# Atualizar com main
git fetch origin main
git merge origin/main

# Se conflito no trigger/source-change.json:
# Regra: run = max(HEAD_run, main_run) + 1
# Manter o payload do nosso deploy

# Resolver conflitos no editor
# Depois:
git add .
git commit -m "[claude] chore: resolve merge conflicts"
git push origin claude/<branch>
```

**Conflito mais comum**: `trigger/source-change.json` — porque outros agentes/workflows tambem editam este arquivo.

## Passo 6: Merge (Squash)

### Via MCP GitHub (agentes)
```
mcp__github__merge_pull_request(
  owner: "lucassfreiree",
  repo: "autopilot",
  pullNumber: <PR_NUMBER>,
  merge_method: "squash"
)
```

### Via gh CLI (humano)
```bash
gh pr merge <PR_NUMBER> --squash
```

**POR QUE squash?** Para manter historico limpo no main. Todos os commits da branch viram um unico commit no main.

## O que Acontece Apos o Merge

1. O PR e mergeado em `main` (squash)
2. O arquivo `trigger/source-change.json` foi alterado em `main`
3. O GitHub Actions detecta a mudanca no path `trigger/source-change.json`
4. O workflow `apply-source-change.yml` dispara AUTOMATICAMENTE
5. O deploy comeca (ver fase 08)

**NENHUMA acao manual e necessaria** para disparar o workflow. O merge e suficiente.

## Workflow validate-patches.yml (Roda no PR)

Quando o PR altera arquivos em `patches/` ou `trigger/source-change.json`, o workflow `validate-patches.yml` roda automaticamente no PR.

### O que ele faz:
1. Clona o repo corporativo com `BBVINET_TOKEN`
2. Aplica os patches (replace-file + search-replace)
3. Roda `npm ci` (instala dependencias)
4. Roda `tsc --noEmit` (TypeScript compilation check)
5. Roda `eslint` nos arquivos alterados
6. Roda `jest --ci` (todos os testes)

### Se validate-patches falhar:
O PR mostra check failed. **NAO MERGEAR** ate corrigir.

| Step que falhou | Causa provavel | Correcao |
|-----------------|----------------|----------|
| Apply patches | `content_ref` invalido | Verificar que o arquivo existe em patches/ |
| npm ci | Dependencia faltando | Verificar imports no patch |
| tsc --noEmit | Erro TypeScript | Corrigir types, imports |
| eslint | Regra ESLint violada | Corrigir no patch |
| jest --ci | Teste quebrado | Atualizar teste ou corrigir codigo |

## Deploy Sequencial (Controller + Agent)

Quando uma historia requer mudancas em AMBOS repos:

```
Deploy 1: Controller (versao X.Y.Z)
  Branch: claude/deploy-controller-X.Y.Z
  Trigger: component=controller, run=N
  → Esperar workflow + esteira corporativa passar
  → CAP controller atualizado automaticamente

Deploy 2: Agent (versao A.B.C)
  Branch: claude/deploy-agent-A.B.C
  Trigger: component=agent, run=N+1
  → Esperar workflow + esteira corporativa passar
  → CAP agent atualizado automaticamente
```

**REGRA**: Controller PRIMEIRO, Agent SEGUNDO (agent chama controller).
**REGRA**: NUNCA mergear o PR do agent enquanto o pipeline do controller esta rodando.
**REGRA**: Cada PR = 1 proposito, 1 commit de deploy.

## Checklist da Fase 07

- [ ] Todos os arquivos adicionados ao staging (patches, trigger, references, contracts)
- [ ] Commit com mensagem descritiva e prefixo de agente
- [ ] Push para branch `claude/<descricao>` (sem erros 403)
- [ ] PR criado com titulo e descricao claros
- [ ] validate-patches passou (se aplicavel)
- [ ] Mergeable state e `clean`
- [ ] Conflitos resolvidos (se houver)
- [ ] Merge (squash) executado
- [ ] Workflow apply-source-change disparou (verificar na fase 08)

---

*Anterior: [06-configure-trigger.md](06-configure-trigger.md) | Proximo: [08-monitor-autopilot-workflow.md](08-monitor-autopilot-workflow.md)*
