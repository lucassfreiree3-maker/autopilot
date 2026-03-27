# Fase 06 — Configurar Trigger de Deploy

## Objetivo

Editar o arquivo `trigger/source-change.json` que e o mecanismo que dispara o workflow `apply-source-change.yml`. Este e o arquivo MAIS IMPORTANTE de todo o fluxo.

## O Arquivo trigger/source-change.json

### Estrutura Completa

```json
{
  "_context": "GETRONICS | ws-default | BBVINET_TOKEN",
  "workspace_id": "ws-default",
  "component": "controller",
  "change_type": "multi-file",
  "version": "3.6.7",
  "changes": [
    {
      "action": "replace-file",
      "target_path": "src/controllers/cronjob-result.controller.ts",
      "content_ref": "patches/cronjob-result.controller.ts"
    },
    {
      "action": "replace-file",
      "target_path": "src/swagger/swagger.json",
      "content_ref": "patches/controller-swagger.json"
    },
    {
      "action": "search-replace",
      "target_path": "package.json",
      "search": "\"version\": \"3.6.6\"",
      "replace": "\"version\": \"3.6.7\""
    },
    {
      "action": "search-replace",
      "target_path": "package-lock.json",
      "search": "\"version\": \"3.6.6\"",
      "replace": "\"version\": \"3.6.7\""
    }
  ],
  "commit_message": "feat(controller): add cronjob status endpoint + version 3.6.7",
  "skip_ci_wait": false,
  "promote": true,
  "run": 65
}
```

## Descricao de Cada Campo

### Campos de Identificacao

| Campo | Tipo | Obrigatorio | Descricao |
|-------|------|:-----------:|-----------|
| `_context` | string | Nao | Label visual para identificar empresa/workspace/token. Formato: `"EMPRESA \| workspace_id \| TOKEN"`. NAO e lido pelo workflow — apenas para documentacao. |
| `workspace_id` | string | Sim | ID do workspace alvo. Determina qual workspace.json o workflow le. |
| `component` | string | Sim | `"controller"`, `"agent"` ou `"both"`. Determina qual repo corporativo recebe as mudancas. |

### Campos de Mudanca

| Campo | Tipo | Obrigatorio | Descricao |
|-------|------|:-----------:|-----------|
| `change_type` | string | Sim | Tipo de mudanca: `"multi-file"`, `"add-file"`, `"modify-file"`, `"delete-lines"`. Para deploys, usar sempre `"multi-file"`. |
| `version` | string | Nao | Versao alvo do deploy. Usado em logs e summaries. |
| `changes` | array | Sim (multi-file) | Array de objetos descrevendo cada mudanca individual. |
| `target_path` | string | Sim (single) | Caminho do arquivo alvo (somente para change_type != multi-file). |
| `file_content` | string | Nao | Conteudo do arquivo (somente para add-file/modify-file sem multi-file). |

### Campos de Controle

| Campo | Tipo | Obrigatorio | Descricao |
|-------|------|:-----------:|-----------|
| `commit_message` | string | Sim | Mensagem do commit no repo CORPORATIVO. Sem prefixo de agente! |
| `skip_ci_wait` | boolean | Nao | Se `true`, pula o CI Gate (Stage 3). Default: `false`. **NAO USAR em deploys normais.** |
| `promote` | boolean | Nao | Se `true`, atualiza tag no CAP values.yaml (Stage 4). Default: `true`. |
| `run` | integer | **CRITICO** | Numero de sequencia. **DEVE** ser incrementado a cada deploy. Sem incremento, o workflow NAO dispara. |

### Objeto change (dentro do array `changes`)

#### Acao: search-replace
```json
{
  "action": "search-replace",
  "target_path": "package.json",
  "search": "\"version\": \"3.6.6\"",
  "replace": "\"version\": \"3.6.7\""
}
```

| Campo | Descricao |
|-------|-----------|
| `action` | `"search-replace"` |
| `target_path` | Caminho relativo do arquivo no repo corporativo |
| `search` | Texto exato a ser encontrado (sed pattern) |
| `replace` | Texto de substituicao |

**Execucao no workflow:**
```bash
sed -i "s|${SEARCH}|${REPLACE}|g" "$TARGET_PATH"
```
Usa `|` como delimitador do sed (evita conflito com `/` em paths).

#### Acao: replace-file
```json
{
  "action": "replace-file",
  "target_path": "src/swagger/swagger.json",
  "content_ref": "patches/controller-swagger.json"
}
```

| Campo | Descricao |
|-------|-----------|
| `action` | `"replace-file"` |
| `target_path` | Caminho relativo do arquivo no repo corporativo |
| `content_ref` | Caminho do arquivo de patch no autopilot (relativo a raiz) |

**Execucao no workflow:**
```bash
PATCH_PATH="/tmp/autopilot/${CONTENT_REF}"
cp "$PATCH_PATH" "/tmp/source/${TARGET_PATH}"
```

## O Campo run (CRITICO)

### Como funciona o disparo

O workflow `apply-source-change.yml` tem este trigger:
```yaml
on:
  push:
    branches: [main]
    paths: ['trigger/source-change.json']
```

Ou seja: o workflow dispara quando `trigger/source-change.json` e alterado na branch `main`. O campo `run` serve para GARANTIR que o arquivo muda (mesmo que o payload seja identico ao anterior).

### Regra de incremento

```bash
# Verificar valor atual
jq '.run' trigger/source-change.json
# Resultado: 64

# Proximo valor DEVE ser: 65
```

**SE ESQUECER DE INCREMENTAR**: O workflow NAO dispara, e nada acontece. Este e o erro mais comum.

### Conflitos no campo run

O arquivo `trigger/source-change.json` e editado por VARIOS workflows e agentes. Conflitos sao COMUNS.

**Ao resolver conflito de merge:**
```bash
# Pegar o MAIOR valor entre HEAD e main, e somar 1
run = max(HEAD_run, MAIN_run) + 1
```

## Cenarios de Payload

### Cenario 1: Somente version bump
```json
{
  "_context": "GETRONICS | ws-default | BBVINET_TOKEN",
  "workspace_id": "ws-default",
  "component": "controller",
  "change_type": "multi-file",
  "version": "3.6.7",
  "changes": [
    {"action": "search-replace", "target_path": "package.json", "search": "\"version\": \"3.6.6\"", "replace": "\"version\": \"3.6.7\""},
    {"action": "search-replace", "target_path": "package-lock.json", "search": "\"version\": \"3.6.6\"", "replace": "\"version\": \"3.6.7\""},
    {"action": "replace-file", "target_path": "src/swagger/swagger.json", "content_ref": "patches/controller-swagger.json"}
  ],
  "commit_message": "chore: version bump 3.6.7",
  "skip_ci_wait": false,
  "promote": true,
  "run": 65
}
```

### Cenario 2: Novo endpoint + version bump
```json
{
  "_context": "GETRONICS | ws-default | BBVINET_TOKEN",
  "workspace_id": "ws-default",
  "component": "controller",
  "change_type": "multi-file",
  "version": "3.6.7",
  "changes": [
    {"action": "replace-file", "target_path": "src/controllers/cronjob-result.controller.ts", "content_ref": "patches/cronjob-result.controller.ts"},
    {"action": "replace-file", "target_path": "src/__tests__/controllers/cronjob-result.controller.test.ts", "content_ref": "patches/cronjob-result.controller.test.ts"},
    {"action": "replace-file", "target_path": "src/swagger/swagger.json", "content_ref": "patches/controller-swagger.json"},
    {"action": "search-replace", "target_path": "package.json", "search": "\"version\": \"3.6.6\"", "replace": "\"version\": \"3.6.7\""},
    {"action": "search-replace", "target_path": "package-lock.json", "search": "\"version\": \"3.6.6\"", "replace": "\"version\": \"3.6.7\""}
  ],
  "commit_message": "feat(controller): add cronjob status endpoint + version 3.6.7",
  "skip_ci_wait": false,
  "promote": true,
  "run": 65
}
```

### Cenario 3: Deploy para o Agent
```json
{
  "_context": "GETRONICS | ws-default | BBVINET_TOKEN",
  "workspace_id": "ws-default",
  "component": "agent",
  "change_type": "multi-file",
  "version": "2.2.9",
  "changes": [
    {"action": "replace-file", "target_path": "src/controllers/cronjob-callback.ts", "content_ref": "patches/cronjob-callback.ts"},
    {"action": "replace-file", "target_path": "src/swagger/swagger.json", "content_ref": "patches/agent-swagger.json"},
    {"action": "search-replace", "target_path": "package.json", "search": "\"version\": \"2.2.8\"", "replace": "\"version\": \"2.2.9\""},
    {"action": "search-replace", "target_path": "package-lock.json", "search": "\"version\": \"2.2.8\"", "replace": "\"version\": \"2.2.9\""}
  ],
  "commit_message": "feat(agent): add cronjob callback endpoint + version 2.2.9",
  "skip_ci_wait": false,
  "promote": true,
  "run": 66
}
```

## Commit Message do Repo Corporativo

A `commit_message` no trigger e a mensagem que aparece no repo CORPORATIVO. Regras:

| Regra | Exemplo |
|-------|---------|
| **SEM** prefixo de agente | `feat: add cronjob endpoint` (NAO `[claude] feat: ...`) |
| Mensagem limpa como dev normal | `fix: resolve 401 on internal-origin calls` |
| Incluir versao se version bump | `feat(controller): add security fixes + version 3.6.3` |
| Usar conventional commits | `feat:`, `fix:`, `chore:`, `test:`, `refactor:` |

## Checklist da Fase 06

- [ ] `workspace_id` correto (`ws-default` para Getronics)
- [ ] `component` correto (`controller` ou `agent`)
- [ ] `change_type` como `multi-file`
- [ ] Array `changes` com todas as mudancas (replace-file + search-replace)
- [ ] Todos os `content_ref` apontam para arquivos que existem em `patches/`
- [ ] Todos os `target_path` sao caminhos validos no repo corporativo
- [ ] `commit_message` limpa, sem prefixo de agente
- [ ] `skip_ci_wait` como `false`
- [ ] `promote` como `true`
- [ ] `run` incrementado (valor anterior + 1)
- [ ] Version bump inclui: package.json + package-lock.json + swagger

---

*Anterior: [05-version-bump.md](05-version-bump.md) | Proximo: [07-commit-push-pr-merge.md](07-commit-push-pr-merge.md)*
