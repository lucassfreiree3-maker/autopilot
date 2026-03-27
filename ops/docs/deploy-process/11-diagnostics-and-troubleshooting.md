# Fase 11 — Diagnostico e Troubleshooting

## Objetivo

Guia completo para diagnosticar e resolver QUALQUER problema que ocorra durante o processo de deploy. Baseado em casos reais ocorridos entre 2026-03-23 e 2026-03-27.

---

## Arvore de Decisao de Diagnostico

```
O deploy falhou?
  |
  +-- Workflow nao disparou?
  |     → Verificar se `run` foi incrementado (Problema #1)
  |     → Verificar se merge foi em main (Problema #2)
  |
  +-- Stage 1 (Setup) falhou?
  |     → JSON invalido no trigger (Problema #3)
  |     → workspace.json inacessivel (Problema #4)
  |
  +-- Stage 1.5 (Session Guard) falhou?
  |     → Outro agente com lock ativo (Problema #5)
  |
  +-- Stage 2 (Apply & Push) falhou?
  |     → Patch file not found (Problema #6)
  |     → Target file not found (Problema #7)
  |     → Push rejected (Problema #8)
  |
  +-- Stage 3 (CI Gate) falhou?
  |     → Esteira corporativa falhou (Problema #9)
  |     → CI Gate timeout (Problema #10)
  |
  +-- Stage 4 (Promote) falhou?
  |     → Pattern nao bateu (Problema #11)
  |     → CAP repo nao configurado (Problema #12)
  |
  +-- Esteira corporativa falhou (apos workflow OK)?
        → TypeScript error (Problema #13)
        → ESLint error (Problema #14)
        → Jest test failure (Problema #15)
        → Duplicate tag (Problema #16)
        → JWT scope error (Problema #17)
```

---

## Problemas e Solucoes Detalhadas

### Problema #1: Workflow NAO Disparou

**Sintoma**: Apos merge do PR, nenhum novo run aparece em GitHub Actions.

**Causa**: Campo `run` no `trigger/source-change.json` nao foi incrementado. O arquivo nao mudou efetivamente apos o merge (o git detecta que o conteudo e identico ao anterior).

**Diagnostico**:
```bash
# Verificar valor atual do run
gh api "repos/lucassfreiree/autopilot/contents/trigger/source-change.json" \
  --jq '.content' | base64 -d | jq '.run'

# Comparar com o valor no commit anterior
gh api "repos/lucassfreiree/autopilot/commits?per_page=2" \
  --jq '.[1].sha' | xargs -I{} gh api "repos/lucassfreiree/autopilot/contents/trigger/source-change.json?ref={}" \
  --jq '.content' | base64 -d | jq '.run'
```

**Solucao**:
1. Criar nova branch
2. Incrementar o campo `run` (valor atual + 1)
3. Commit → Push → PR → Merge

---

### Problema #2: Push para Branch Errada

**Sintoma**: `403 Forbidden` no git push.

**Causa**: A branch nao comeca com `claude/` ou `codex/`.

**Solucao**:
```bash
git branch -m <nome-atual> claude/<nome-correto>
git push -u origin claude/<nome-correto>
```

---

### Problema #3: JSON Invalido no Trigger

**Sintoma**: Stage 1 (Setup) falha com erro de parsing.

**Diagnostico**:
```bash
# Validar JSON localmente
cat trigger/source-change.json | jq .
```

**Causas comuns**:
- Virgula extra no final do array `changes`
- Aspas nao balanceadas
- Comentarios (JSON nao suporta comentarios)

---

### Problema #4: workspace.json Inacessivel

**Sintoma**: Setup falha ao ler workspace config.

**Diagnostico**:
```bash
gh api "repos/lucassfreiree/autopilot/contents/state/workspaces/ws-default/workspace.json?ref=autopilot-state" \
  --jq '.content' | base64 -d | jq .
```

**Solucao**: Se o arquivo nao existe, rodar `seed-workspace.yml` para criar.

---

### Problema #5: Bloqueado por Outro Agente

**Sintoma**: Stage 1.5 falha com `BLOCKED by <agent_id>`.

**Diagnostico**:
```bash
gh api "repos/lucassfreiree/autopilot/contents/state/workspaces/ws-default/locks/session-lock.json?ref=autopilot-state" \
  --jq '.content' | base64 -d | jq '{agentId, operation, expiresAt}'
```

**Solucao**:
- Esperar o lock expirar (TTL de 30 min)
- Se o agente nao esta mais ativo: `workspace-lock-gc.yml` limpa locks expirados
- Em emergencia: editar o lock manualmente no autopilot-state

---

### Problema #6: Patch File Not Found

**Sintoma**: Stage 2 falha com `Patch file not found: <content_ref>`.

**Causa**: O `content_ref` no trigger aponta para um arquivo que nao existe em `patches/`.

**Diagnostico**:
```bash
# Verificar se o arquivo existe
ls -la patches/<nome_do_arquivo>

# Verificar o content_ref no trigger
jq '.changes[] | select(.action=="replace-file") | .content_ref' trigger/source-change.json
```

**Solucao**: Criar o arquivo faltante ou corrigir o `content_ref`.

---

### Problema #7: Target File Not Found

**Sintoma**: Stage 2 falha com `File not found: <target_path>`.

**Causa**: O `target_path` no trigger aponta para um caminho que nao existe no repo corporativo.

**Diagnostico**:
```bash
# Verificar estrutura do repo corporativo
# (buscar via fetch-files ou API)
gh api "repos/bbvinet/psc-sre-automacao-controller/git/trees/main?recursive=1" \
  --jq '.tree[] | select(.path | startswith("src/")) | .path'
```

**Solucao**: Corrigir o `target_path` para o caminho correto.

---

### Problema #8: Push Rejected

**Sintoma**: Stage 2 falha no step Push.

**Causas**:
- Token sem permissao de push
- Branch protection no repo corporativo
- Conflito de merge

**Diagnostico**: Ler os logs do Step "Push" no workflow run.

---

### Problema #9: Esteira Corporativa Falhou (CI Gate Block)

**Sintoma**: Stage 3 reporta `decision=block` — nossa mudanca quebrou o CI.

**Diagnostico completo**:
```bash
# 1. Ver check-runs do commit corporativo
SHA="<sha_corporativo>"
gh api "repos/bbvinet/psc-sre-automacao-controller/commits/$SHA/check-runs" \
  --jq '.check_runs[] | {name, status, conclusion}'

# 2. Disparar ci-diagnose para logs detalhados
# Editar trigger/ci-diagnose.json com o SHA, mergear, aguardar

# 3. Ler logs salvos no autopilot-state
gh api "repos/lucassfreiree/autopilot/git/trees/autopilot-state" \
  --jq '.tree[] | select(.path | contains("ci-logs-controller")) | .path' | sort | tail -1
```

**Solucao**: Ver problemas #13-#17 conforme o tipo de erro.

---

### Problema #10: CI Gate Timeout

**Sintoma**: Stage 3 reporta `ci_result=timeout` (checks nao completaram em 20 min).

**Causa**: A esteira corporativa esta demorando mais que o esperado.

**Solucao**:
- Verificar manualmente se a esteira completou depois
- Se completou com sucesso: rodar promote-cap.yml manualmente
- Se ainda esta rodando: aguardar e verificar novamente

---

### Problema #11: Pattern Nao Bateu no Promote

**Sintoma**: Stage 4 reporta `Image pattern didn't match in values.yaml`.

**Causa**: O `imagePattern` no workspace.json nao bate com o formato da linha `image:` no values.yaml.

**Diagnostico**:
```bash
# Ver o pattern configurado
gh api "repos/lucassfreiree/autopilot/contents/state/workspaces/ws-default/workspace.json?ref=autopilot-state" \
  --jq '.content' | base64 -d | jq '.controller.imagePattern'

# Ver a linha image no values.yaml
gh api "repos/bbvinet/psc_releases_cap_sre-aut-controller/contents/releases/openshift/hml/deploy/values.yaml" \
  --jq '.content' | base64 -d | grep "image:"
```

**Solucao**: Corrigir o `imagePattern` no workspace.json para bater com o formato real.

---

### Problema #12: CAP Repo Nao Configurado

**Sintoma**: Stage 4 reporta `No CAP repo configured` ou `promoted=skipped`.

**Causa**: workspace.json nao tem o campo `capRepo` para o component.

**Solucao**: Adicionar `capRepo`, `capBranch`, `capValuesPath`, `imagePattern` ao workspace.json.

---

### Problema #13: TypeScript Error na Esteira

**Sintoma no log**: `error TS2769`, `error TS2304`, `error TS2688`

**Exemplos reais:**
```
error TS2769: No overload matches this call.
  Type 'string' is not assignable to type 'number | StringValue | undefined'
```

**Causa**: Tipo incorreto, import faltando, ou incompatibilidade com `@types/`.

**Solucao**:
1. Identificar o arquivo e linha do erro
2. Verificar os types esperados
3. Para `expiresIn` do JWT: usar `parseExpiresIn()` com cast
4. Corrigir no patch e re-deploy

---

### Problema #14: ESLint Error na Esteira

#### no-use-before-define
```
error  'readAuthDecision' was used before it was defined  no-use-before-define
```
**Fix**: Mover a funcao para ANTES de onde e chamada no arquivo.

#### no-unused-vars
```
error  'validateTrustedUrl' is defined but never used  no-unused-vars
```
**Fix**: Remover a funcao nao utilizada.

#### no-nested-ternary
```
error  Do not nest ternary expressions  no-nested-ternary
```
**Fix**: Substituir ternarios aninhados por if/else.

---

### Problema #15: Teste Jest Falhou

**Sintoma no log**: `FAIL src/__tests__/unit/...`

**Diagnostico**:
1. Ler o log para ver qual `describe`/`it` falhou
2. Verificar se o teste espera comportamento antigo que foi mudado
3. Verificar se mock URLs estao sendo bloqueadas

**Caso real**: Testes usam `http://agent.local` como URL mock. Se adicionar `validateTrustedUrl()` dentro de `fetch()`, todos os testes quebram.

**Solucao**:
- Se o teste espera comportamento antigo: atualizar o teste tambem (adicionar como replace-file no trigger)
- Se o codigo tem URL validation no fetch: REMOVER (validar no input, nao no fetch)

---

### Problema #16: Duplicate Tag no Registry

**Sintoma**: Esteira falha na etapa de publish com "tag already exists" ou "duplicate".

**Causa**: A versao ja foi publicada em um deploy anterior.

**Solucao**:
1. Incrementar a versao (ex: 3.6.7 → 3.6.8)
2. Atualizar os 5 arquivos de versao
3. Bumpar `run` no trigger
4. Novo deploy

---

### Problema #17: JWT Scope Error

**Sintoma**: Agent retorna `403 Insufficient scope` ou `Forbidden`.

**Causa**: O claim JWT usa `scopes` (plural) em vez de `scope` (singular).

**Diagnostico**: Verificar o codigo que faz `jwt.sign()`:
```typescript
// ERRADO:
jwt.sign({ scopes: ['execute'] }, secret)

// CORRETO:
jwt.sign({ scope: 'execute' }, secret)
```

**Solucao**: Corrigir para `scope` (singular). O middleware do agent le `payload.scope`.

---

## Historico de Falhas Reais e Resolucoes

### Run #35 — JWT scope claim errado
- **Erro**: Agent 403 Insufficient scope
- **Causa**: `scopes` (plural) em vez de `scope` (singular)
- **Fix**: PR #104, corrigido para `scope`
- **Lesson**: SEMPRE verificar nome exato dos claims JWT

### Run #36 — TS2769 jwt.sign overload
- **Erro**: `No overload matches this call` no `jwt.sign()`
- **Causa**: `expiresIn` como `string` pura, `@types/jsonwebtoken@9.0.6` espera `StringValue`
- **Fix**: PR #108, adicionado `parseExpiresIn()` com cast
- **Lesson**: Sempre usar `as jwt.SignOptions['expiresIn']`

### Run #37 — ESLint no-use-before-define
- **Erro**: `readAuthDecision was used before it was defined`
- **Causa**: Funcao definida na linha 369, usada na linha 328
- **Fix**: PR #110, movido funcao para linha 320
- **Lesson**: Sempre ordenar funcoes auxiliares PRIMEIRO

### Runs #27-#30 — multi-file nao suportado
- **Erro**: Workflow ignorava `change_type=multi-file` silenciosamente
- **Causa**: O workflow so suportava add-file, modify-file, delete-lines
- **Fix**: Adicionado suporte a multi-file com search-replace e replace-file
- **Lesson**: Usar multi-file para deploys com multiplos arquivos

### Runs #43 — CI Gate bug pre-existing
- **Erro**: CI Gate reportou `ci-failed-preexisting` mas esteira PASSOU
- **Causa**: Bug na deteccao de pre-existing — nao e confiavel
- **Lesson**: Para resultado REAL, verificar logs da esteira (ci-logs)

---

## Ferramentas de Diagnostico

### ci-diagnose.yml
```json
// trigger/ci-diagnose.json
{
  "workspace_id": "ws-default",
  "component": "controller",
  "commit_sha": "<SHA>",
  "run": <NEXT_RUN>
}
```
Resultado: `ci-logs-controller-<job_id>.txt` no autopilot-state

### ci-status-check.yml
```json
// trigger/ci-status.json
{
  "workspace_id": "ws-default",
  "component": "controller",
  "commit_sha": "<SHA>",
  "run": <NEXT_RUN>
}
```
Resultado: `ci-status-controller.json` no autopilot-state

### validate-patches.yml (Pre-deploy)
Roda automaticamente em PRs que alteram `patches/` ou `trigger/source-change.json`.
Valida: npm ci → tsc → eslint → jest

### validate-patches-local.sh (Script local)
```bash
ops/scripts/ci/validate-patches-local.sh
```
Validacao rapida sem npm: diff, dead code, test refs.

## Checklist da Fase 11

- [ ] Tipo de falha identificado (qual stage/step)
- [ ] Logs obtidos (workflow logs ou ci-logs do autopilot-state)
- [ ] Causa raiz identificada
- [ ] Correcao aplicada no patch
- [ ] Versao bumpada (se necessario)
- [ ] Run incrementado no trigger
- [ ] Re-deploy iniciado (novo PR → merge)
- [ ] Falha registrada em session memory (knownFailures)

---

*Anterior: [10-cap-tag-promotion.md](10-cap-tag-promotion.md) | Proximo: [12-quick-reference.md](12-quick-reference.md)*
