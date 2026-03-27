# Fase 05 — Version Bump (5 Arquivos)

## Objetivo

Atualizar a versao em **TODOS os 5 lugares** onde ela aparece. Se qualquer um ficar desatualizado, a esteira corporativa pode falhar ou o deploy fica inconsistente.

## Os 5 Arquivos de Versao

### Arquivo 1: package.json (linha 3)

**Localizacao no repo corporativo:** `package.json`
**Campo:** `"version": "X.Y.Z"`
**Metodo de atualizacao:** search-replace no trigger

```json
{
  "name": "psc-sre-automacao-controller",
  "version": "3.6.6",   <-- AQUI (1 ocorrencia)
  ...
}
```

**Trigger change:**
```json
{
  "action": "search-replace",
  "target_path": "package.json",
  "search": "\"version\": \"3.6.6\"",
  "replace": "\"version\": \"3.6.7\""
}
```

### Arquivo 2: package-lock.json (linha 3 — topo)

**Localizacao no repo corporativo:** `package-lock.json`
**Campo:** `"version": "X.Y.Z"` (primeira ocorrencia, topo do arquivo)
**Metodo de atualizacao:** search-replace no trigger (com flag `g` pega ambas ocorrencias)

```json
{
  "name": "psc-sre-automacao-controller",
  "version": "3.6.6",   <-- AQUI (1a ocorrencia — topo)
  "lockfileVersion": 3,
  ...
}
```

### Arquivo 3: package-lock.json (linha ~9 — packages[""])

**Localizacao no repo corporativo:** `package-lock.json`
**Campo:** `"version": "X.Y.Z"` (segunda ocorrencia, dentro de `packages[""]`)
**Metodo de atualizacao:** O mesmo search-replace do arquivo 2 ja pega esta (sed com flag `g`)

```json
{
  ...
  "packages": {
    "": {
      "name": "psc-sre-automacao-controller",
      "version": "3.6.6",   <-- AQUI (2a ocorrencia — packages)
      ...
    }
  }
}
```

**NOTA IMPORTANTE**: Um unico search-replace no package-lock.json com flag `g` (que o workflow ja usa: `sed -i "s|SEARCH|REPLACE|g"`) atualiza AMBAS as ocorrencias.

**Trigger change (unico para ambas):**
```json
{
  "action": "search-replace",
  "target_path": "package-lock.json",
  "search": "\"version\": \"3.6.6\"",
  "replace": "\"version\": \"3.6.7\""
}
```

### Arquivo 4: src/swagger/swagger.json

**Localizacao no repo corporativo:** `src/swagger/swagger.json`
**Campo:** `info.version`
**Metodo de atualizacao:** replace-file (SEMPRE arquivo completo)

```json
{
  "openapi": "3.0.3",
  "info": {
    "title": "PSC SRE Automacao Controller",
    "version": "3.6.6",   <-- AQUI
    ...
  }
}
```

**POR QUE replace-file e nao search-replace?**

A versao no swagger pode estar **DIFERENTE** da versao no package.json. Exemplo real:
- package.json: `3.6.4`
- swagger.json: `3.5.14` (ficou para tras em um deploy anterior)

Se usar search-replace com `"3.6.6"` e o swagger estiver com `"3.5.14"`, o sed nao encontra o padrao e **nao faz nada** (warning silencioso). Por isso, SEMPRE usar `replace-file` com o swagger completo.

**Trigger change:**
```json
{
  "action": "replace-file",
  "target_path": "src/swagger/swagger.json",
  "content_ref": "patches/controller-swagger.json"
}
```

### Arquivo 5: references/controller-cap/values.yaml

**Localizacao no autopilot (NAO no repo corporativo):** `references/controller-cap/values.yaml`
**Campo:** Comentario de tag e referencia local
**Metodo de atualizacao:** Edicao manual no autopilot

```yaml
# Controller CAP Values - GitHub (auto-promote enabled)
# ...
# Current tag: 3.6.6   <-- Atualizar aqui
```

**NOTA**: Este arquivo e uma referencia LOCAL. A atualizacao REAL no CAP repo e feita automaticamente pelo Stage 4 (Promote) do workflow. Mas e importante manter a referencia local atualizada.

Alem disso, a tag da imagem Docker dentro do values.yaml:
```yaml
image: docker.binarios.intranet.bb.com.br/bb/psc/psc-sre-automacao-controller:3.6.6
#                                                                              ^^^^^ tag
```

## Regras de Versionamento

### Padrao de Incremento
```
3.6.5 → 3.6.6  (patch normal)
3.6.6 → 3.6.7  (patch normal)
3.6.8 → 3.6.9  (patch normal)
3.6.9 → 3.7.0  (NUNCA 3.6.10!)
3.9.9 → 3.10.0 (NUNCA 3.9.10!)
```

**REGRA CRITICA**: Apos X.Y.9, a proxima versao e X.(Y+1).0. O terceiro digito (patch) vai de 0 a 9 APENAS.

### Verificar Antes de Bumpar

```bash
# Verificar qual a ultima versao no trigger
jq '.version' trigger/source-change.json

# Verificar na session memory
jq '.versioningRules.currentVersion' contracts/claude-session-memory.json

# Verificar no repo corporativo (via arquivo buscado)
# O package.json corporativo tem a versao REAL
```

**Se a versao do repo corporativo for DIFERENTE da session memory**, usar a versao do repo corporativo como base. Isto acontece quando alguem fez deploy fora do autopilot.

### CI Rejeita Tags Duplicadas

Se a esteira ja gerou imagem para uma versao (ex: 3.6.6), tentar deployar 3.6.6 novamente faz a esteira falhar com "duplicate tag". Neste caso, incrementar para 3.6.7.

## Exemplo Completo de Version Bump

De 3.6.6 para 3.6.7:

### No trigger/source-change.json (changes array):
```json
[
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
  },
  {
    "action": "replace-file",
    "target_path": "src/swagger/swagger.json",
    "content_ref": "patches/controller-swagger.json"
  }
]
```

### No patches/controller-swagger.json:
Incluir `"version": "3.6.7"` no campo `info.version`.

### No references/controller-cap/values.yaml:
```yaml
# Current tag: 3.6.7
```

### No contracts/claude-session-memory.json:
```json
"versioningRules": {
  "currentVersion": "3.6.7",
  "previousVersion": "3.6.6"
}
```

## Tabela Resumo dos 5 Arquivos

| # | Arquivo | Localizacao | Metodo | Ocorrencias | Observacao |
|---|---------|-------------|--------|-------------|------------|
| 1 | `package.json` | Repo corporativo | search-replace | 1 | Linha 3 |
| 2 | `package-lock.json` (topo) | Repo corporativo | search-replace | 2 (com flag g) | Linha 3 |
| 3 | `package-lock.json` (packages) | Repo corporativo | (mesmo que #2) | (coberto pelo #2) | Linha ~9 |
| 4 | `src/swagger/swagger.json` | Repo corporativo | replace-file | 1 | Pode divergir! |
| 5 | `references/controller-cap/values.yaml` | Autopilot (local) | Edicao manual | 1 | Referencia local |

## Checklist da Fase 05

- [ ] Versao atual verificada no repo corporativo
- [ ] Nova versao decidida (patch+1, respeitando regra X.Y.9 → X.(Y+1).0)
- [ ] `package.json`: search-replace configurado
- [ ] `package-lock.json`: search-replace configurado (pega ambas ocorrencias)
- [ ] `swagger.json`: replace-file com versao correta no `info.version`
- [ ] `references/controller-cap/values.yaml`: tag atualizada
- [ ] `contracts/claude-session-memory.json`: `currentVersion` atualizada
- [ ] Verificado que a versao NAO existe no registry (evitar duplicate tag)

---

*Anterior: [04-code-changes-and-patches.md](04-code-changes-and-patches.md) | Proximo: [06-configure-trigger.md](06-configure-trigger.md)*
