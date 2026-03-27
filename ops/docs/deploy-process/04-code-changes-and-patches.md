# Fase 04 — Alteracoes no Codigo e Criacao de Patches

## Objetivo

Criar os arquivos de patch no diretorio `patches/` do autopilot. Estes patches serao aplicados ao repo corporativo pelo workflow `apply-source-change.yml`.

## Diretorio de Patches

Todos os patches ficam em:
```
autopilot/patches/
```

## Tipos de Patch

### Tipo 1: replace-file (Substituicao Completa)

Cria o arquivo COMPLETO na pasta `patches/`. O workflow copia este arquivo diretamente para o repo corporativo, substituindo o original.

**Quando usar:**
- Mudancas em multiplas linhas
- Adicao/remocao de funcoes
- Qualquer alteracao que envolva novas linhas ou remocao de linhas
- Swagger (sempre replace-file, nunca search-replace)
- Arquivos de teste

**Como funciona no workflow:**
```bash
# O workflow faz:
PATCH_PATH="/tmp/autopilot/patches/<content_ref>"
cp "$PATCH_PATH" "/tmp/source/<target_path>"
```

**Exemplo:**
```
# Arquivo no autopilot:
patches/oas-sre-controller.controller.ts

# Sera copiado para:
/tmp/source/src/controllers/oas-sre-controller.controller.ts
```

### Tipo 2: search-replace (Substituicao de Texto)

Nao precisa de arquivo de patch. Configurado diretamente no `trigger/source-change.json`.
Usa `sed` para substituir texto dentro de uma mesma linha.

**Quando usar:**
- Version bump (trocar `"3.6.6"` por `"3.6.7"`)
- Substituicoes simples de texto em uma unica linha
- Troca de valores de configuracao

**Como funciona no workflow:**
```bash
# O workflow faz:
sed -i "s|${SEARCH}|${REPLACE}|g" "$TARGET_PATH"
```

**LIMITACAO CRITICA**: search-replace **NAO funciona** com newlines (`\n`). O `sed` no workflow nao interpreta `\n` como quebra de linha. Para qualquer mudanca que envolva adicionar ou remover linhas, usar `replace-file`.

## Convencao de Nomes dos Patches

| Patch no autopilot | Target no repo corporativo |
|---------------------|---------------------------|
| `patches/<nome>.controller.ts` | `src/controllers/<nome>.controller.ts` |
| `patches/<nome>.ts` (middleware) | `src/middlewares/<nome>.ts` |
| `patches/controller-swagger.json` | `src/swagger/swagger.json` (controller) |
| `patches/agent-swagger.json` | `src/swagger/swagger.json` (agent) |
| `patches/<nome>.test.ts` | `src/__tests__/unit/<nome>.test.ts` ou `src/__tests__/<nome>.test.ts` |
| `patches/<nome>.ts` (service) | `src/services/<nome>.ts` |

**NOTA**: O nome do patch NAO precisa ser identico ao target_path. O mapeamento e feito no `trigger/source-change.json` via `content_ref` e `target_path`.

## Criando um Patch replace-file

### Passo 1: Partir da base corporativa

**OBRIGATORIO**: Sempre comecar do arquivo corporativo ATUAL (buscado na fase 03).

```bash
# Copiar o arquivo corporativo como base
cp fetched-controller-src-controllers-oas-sre-controller.controller.ts \
   patches/oas-sre-controller.controller.ts
```

### Passo 2: Fazer as alteracoes

Editar o arquivo em `patches/` com as mudancas necessarias.

### Passo 3: Validar (diff minimo)

```bash
# Comparar com o original para garantir mudancas minimas
diff fetched-controller-src-controllers-oas-sre-controller.controller.ts \
     patches/oas-sre-controller.controller.ts
```

**REGRA**: As alteracoes devem ser **MINIMAS**. Nao refatorar, nao melhorar, nao limpar codigo que nao faz parte da tarefa.

## Regras de Codigo (CRITICAS — Esteira Corporativa Valida)

### ESLint

| Regra | O que valida | Como evitar falha |
|-------|-------------|-------------------|
| `no-use-before-define` | Funcoes devem ser definidas ANTES de serem chamadas | Ordenar: funcoes auxiliares primeiro, funcoes que as usam depois |
| `no-unused-vars` | Variaveis/funcoes nao usadas | Remover dead code |
| `no-nested-ternary` | Ternarios aninhados proibidos | Usar if/else |
| `prefer-const` | Usar `const` quando possivel | Trocar `let` por `const` se nao reatribui |

### TypeScript

| Padrao | Detalhe |
|--------|---------|
| `expiresIn` no JWT | Usar `parseExpiresIn()` com cast `as jwt.SignOptions['expiresIn']` |
| Imports | Verificar que todos os imports existem no projeto |
| Tipos | `@types/jsonwebtoken@9.0.6` — `expiresIn` deve ser `number \| StringValue` |

### Seguranca (Checkmarx)

| Regra | Detalhe |
|-------|---------|
| XSS Reflected | NUNCA refletir input do usuario em responses sem `sanitizeForOutput()` |
| SSRF | Validar URLs de entrada com `parseSafeIdentifier()`, NAO dentro de `fetch()` |
| DoS por Loop | NUNCA usar input do usuario para controlar iteracoes sem `MAX_RESULTS` |
| Info Disclosure | NUNCA retornar `error.message` direto — usar `sanitizeForOutput(msg)` |

### Swagger (swagger.json)

| Regra | Detalhe |
|-------|---------|
| Encoding | ASCII puro. **NUNCA** acentos (UTF-8 nao-ASCII) |
| Versao | `info.version` DEVE coincidir com a versao no package.json |
| Validacao | `grep -P '[\x80-\xFF]' patches/swagger.json` deve retornar vazio |
| Formato | OpenAPI 3.0.3 |

### JWT

| Regra | Detalhe |
|-------|---------|
| Scope claim | `payload.scope` (singular). **NUNCA** `scopes` (plural) |
| Agent middleware | Le `payload.scope` — se for `scopes`, agent retorna 403 |

### Testes (Jest)

| Regra | Detalhe |
|-------|---------|
| Mock URLs | Testes usam URLs mock como `http://agent.local`. NAO bloquear |
| Fake timers | Usar `jest.advanceTimersByTimeAsync()` (nao `advanceTimersByTime` sync) |
| Mensagens de erro | Se mudar uma mensagem de erro, buscar TODOS os testes que a verificam |

## Exemplo Completo: Patch de Novo Endpoint

### 1. Criar o controller (replace-file)
```
patches/cronjob-callback.ts
```
Conteudo: Arquivo completo do novo controller com todas as funcoes.

### 2. Criar o teste (replace-file)
```
patches/cronjob-callback.test.ts
```
Conteudo: Arquivo completo de testes Jest.

### 3. Atualizar o swagger (replace-file)
```
patches/controller-swagger.json
```
Conteudo: Swagger completo com as novas rotas adicionadas.

### 4. Atualizar o router (replace-file)
```
patches/agentsRouter.ts
```
Conteudo: Router atualizado com import e registro da nova rota.

### 5. Version bump (search-replace — sem arquivo de patch)
Configurado no trigger diretamente:
```json
{"action": "search-replace", "target_path": "package.json", "search": "\"version\": \"3.6.6\"", "replace": "\"version\": \"3.6.7\""}
```

## Exemplo: Estrutura de Patches para Historia #930217

```
patches/
  cronjob-callback.ts                     # Novo endpoint POST /api/cronjob/callback (agent)
  cronjob-callback.test.ts                # Testes do callback
  cronjob-result.controller.ts            # Novo endpoint GET /api/cronjob/status/:execId (controller)
  cronjob-result.controller.test.ts       # Testes do status
  agents-execute-logs.controller.ts       # Controller atualizado com adapter compliance→log
  agentsRouter.ts                         # Router com novas rotas registradas
  agentsRouter.test.ts                    # Testes do router atualizado
  controller-swagger.json                 # Swagger controller com rotas cronjob
  agent-swagger.json                      # Swagger agent com rota callback
```

## Checklist da Fase 04

- [ ] Base corporativa obtida na fase 03
- [ ] Patches criados em `patches/` (replace-file) ou texto definido (search-replace)
- [ ] Diff minimo verificado (somente alteracoes necessarias)
- [ ] Funcoes definidas ANTES de serem usadas (no-use-before-define)
- [ ] Sem dead code (no-unused-vars)
- [ ] Sem ternarios aninhados (no-nested-ternary)
- [ ] `sanitizeForOutput()` em error messages
- [ ] Swagger em ASCII puro (sem acentos)
- [ ] JWT scope como `scope` (singular)
- [ ] Testes correspondentes criados/atualizados
- [ ] Mock URLs nao bloqueadas

---

*Anterior: [03-fetch-corporate-files.md](03-fetch-corporate-files.md) | Proximo: [05-version-bump.md](05-version-bump.md)*
