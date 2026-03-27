# Fase 02 — Clone e Setup Local

## Objetivo

Preparar o ambiente local com o repositorio autopilot atualizado e criar uma branch dedicada para o deploy.

## Passo 1: Clone do Repositorio (primeira vez)

```bash
# Clone do repo autopilot
git clone https://github.com/lucassfreiree/autopilot.git
cd autopilot
```

Se ja tem o repo clonado, apenas atualize:

```bash
cd autopilot
git fetch origin main
git checkout main
git pull origin main
```

## Passo 2: Verificar Estado Atual

Antes de qualquer alteracao, verificar o estado atual:

```bash
# Versao atual do controller
jq '.version' trigger/source-change.json
# Exemplo de saida: "3.6.6"

# Ultimo run number do trigger
jq '.run' trigger/source-change.json
# Exemplo de saida: 64

# Versao registrada na session memory
jq '.versioningRules.currentVersion' contracts/claude-session-memory.json
# Exemplo de saida: "3.6.6"

# Verificar se ha locks ativos (via GitHub API)
gh api "repos/lucassfreiree/autopilot/contents/state/workspaces/ws-default/locks/session-lock.json?ref=autopilot-state" \
  --jq '.content' | base64 -d 2>/dev/null || echo "Sem lock ativo"
```

**IMPORTANTE**: Se houver lock ativo de outro agente, **NAO** prosseguir. Esperar o lock expirar (TTL de 30 minutos) ou o outro agente terminar.

## Passo 3: Criar Branch Dedicada

```bash
# SEMPRE criar branch a partir do main ATUALIZADO
git fetch origin main
git checkout -B claude/<nome-descritivo> origin/main
```

### Convencao de Nomes de Branch

| Tipo | Formato | Exemplo |
|------|---------|---------|
| Claude Code | `claude/<descricao>` | `claude/deploy-controller-3.6.7` |
| Codex | `codex/<descricao>` | `codex/deploy-v3.6.7` |
| Feature | `claude/feat-<descricao>` | `claude/feat-cronjob-callback` |
| Fix | `claude/fix-<descricao>` | `claude/fix-eslint-error` |

**REGRA CRITICA**: Branches DEVEM comecar com `claude/` ou `codex/`. Qualquer outro prefixo retorna 403 no push.

## Passo 4: Estrutura do Diretorio de Trabalho

Apos o checkout, a estrutura relevante e:

```
autopilot/
  patches/                    # <-- Onde criar/editar patches
  trigger/
    source-change.json        # <-- Onde configurar o trigger de deploy
  references/
    controller-cap/
      values.yaml             # <-- Referencia do CAP (atualizar tag)
  contracts/
    claude-session-memory.json # <-- Memoria (atualizar versao)
  .github/workflows/
    apply-source-change.yml   # <-- NAO editar (workflow de deploy)
```

## Observacoes Importantes

### Push direto para main: BLOQUEADO
```bash
# ISTO NAO FUNCIONA:
git push origin main
# Resultado: HTTP 403 Forbidden
```

O repo autopilot tem protecao de branch. **Toda alteracao** deve passar por:
1. Branch `claude/*` ou `codex/*`
2. Pull Request
3. Squash merge

### Flag -B no checkout
Usar `git checkout -B` (com -B maiusculo) em vez de `-b`. O `-B` forca a criacao mesmo se a branch ja existir, evitando o erro `fatal: branch already exists`.

### Nunca usar reset --hard sem commitar antes
```bash
# PERIGO: isto perde trabalho nao commitado
git reset --hard origin/main   # NAO fazer sem commit/stash antes!

# SEGURO: commitar ou stash antes
git stash
git checkout -B claude/nova-branch origin/main
git stash pop  # se quiser recuperar as mudancas
```

## Checklist da Fase 02

- [ ] Repo autopilot clonado/atualizado
- [ ] `git fetch origin main` executado
- [ ] Versao atual verificada (`jq '.version' trigger/source-change.json`)
- [ ] Ultimo run verificado (`jq '.run' trigger/source-change.json`)
- [ ] Lock verificado (nenhum lock ativo de outro agente)
- [ ] Branch `claude/<descricao>` criada a partir de `origin/main`

---

*Anterior: [01-overview-and-prerequisites.md](01-overview-and-prerequisites.md) | Proximo: [03-fetch-corporate-files.md](03-fetch-corporate-files.md)*
