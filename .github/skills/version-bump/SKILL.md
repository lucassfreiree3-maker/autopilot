---
name: version-bump
description: Version bump nos 5 arquivos obrigatórios para deploy de nova versão. Use antes de qualquer deploy ao repositório corporativo.
---

# Version Bump Skill

## Quando usar
- Antes de qualquer deploy (controller ou agent)
- Quando CI rejeita por tag duplicada (bump necessário)
- Quando usuario pede "nova versão" ou "bump"

## Regra de Versionamento

```
X.Y.Z
├── Após X.Y.9 → próxima = X.(Y+1).0   (NUNCA X.Y.10!)
├── Patch normal → X.Y.(Z+1)
└── CI REJEITA tags duplicadas — sempre verificar antes
```

**Exemplos:**
- `3.6.8` → `3.6.9`
- `3.6.9` → `3.7.0` (NOT 3.6.10!)
- `2.2.9` → `2.3.0`

## 5 Arquivos Obrigatórios

### Controller
| # | Arquivo | Método | Notas |
|---|---------|--------|-------|
| 1 | `package.json` | search-replace no trigger | campo `"version"` |
| 2 | `package-lock.json` | search-replace com flag `g` | 2 ocorrências (top-level + packages[""]) |
| 3 | `src/swagger/swagger.json` | replace-file | versão pode ser diferente; ASCII only, sem acentos |
| 4 | `references/controller-cap/values.yaml` | push_files direto | linha da tag de imagem |
| 5 | `contracts/copilot-session-memory.json` | push_files direto | campo `currentState.controllerVersion` |

### Agent
| # | Arquivo | Método | Notas |
|---|---------|--------|-------|
| 1 | `package.json` | search-replace no trigger | campo `"version"` |
| 2 | `package-lock.json` | search-replace com flag `g` | 2 ocorrências |
| 3 | `src/swagger/swagger.json` | replace-file | ASCII only |
| 4 | `references/agent-cap/values.yaml` | push_files direto | linha da tag de imagem |
| 5 | `contracts/copilot-session-memory.json` | push_files direto | campo `currentState.agentVersion` |

## Trigger Format para Version Bump

```json
{
  "_context": "GETRONICS | ws-default | BBVINET_TOKEN",
  "workspace_id": "ws-default",
  "component": "controller",
  "change_type": "multi-file",
  "version": "X.Y.Z",
  "changes": [
    {
      "action": "search-replace",
      "target_path": "package.json",
      "search": "\"version\": \"OLD\"",
      "replace": "\"version\": \"NEW\""
    },
    {
      "action": "search-replace",
      "target_path": "package-lock.json",
      "search": "\"version\": \"OLD\"",
      "replace": "\"version\": \"NEW\"",
      "flags": "g"
    },
    {
      "action": "replace-file",
      "target_path": "src/swagger/swagger.json",
      "content_ref": "patches/swagger.json"
    }
  ],
  "commit_message": "chore: bump version to X.Y.Z",
  "promote": true,
  "run": LAST_RUN_PLUS_1
}
```

## Passo a passo

### 1. Verificar versão atual
```
get_file_contents("trigger/source-change.json")
→ campo "version" = versão atual
```

### 2. Calcular próxima versão
```
current = "3.6.8"
patch = 8
patch < 9 → novo = "3.6.9"

current = "3.6.9"
patch = 9 → bump minor → novo = "3.7.0"  (NUNCA 3.6.10)
```

### 3. Preparar patches
Para `swagger.json`: criar/atualizar `patches/swagger.json` com nova versão (ASCII only!)

### 4. Atualizar references
```
references/controller-cap/values.yaml:
  linha: image: docker.binarios.intranet.bb.com.br/bb/psc/psc-sre-automacao-controller:OLD
  →     image: docker.binarios.intranet.bb.com.br/bb/psc/psc-sre-automacao-controller:NEW
```

### 5. Incrementar run
```
trigger/source-change.json: "run": LAST + 1
```

### 6. push_files com TUDO (1 confirmação)
Incluir em um único push_files:
- `patches/swagger.json` (se controller)
- `trigger/source-change.json`
- `references/controller-cap/values.yaml`
- `contracts/copilot-session-memory.json`

## Verificação pós-deploy
```
get_file_contents(
  path: "state/workspaces/ws-default/controller-release-state.json",
  branch: "autopilot-state"
)
→ Verificar: version == NEW, promoted == true
```
