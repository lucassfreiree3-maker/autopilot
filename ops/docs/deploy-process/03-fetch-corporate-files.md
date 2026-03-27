# Fase 03 — Fetch Arquivos Corporativos

## Objetivo

Buscar os arquivos ATUAIS do repositorio corporativo antes de criar patches.
**NUNCA** criar patches baseado em versoes antigas. Sempre partir da base corporativa atual.

## Por que e Obrigatorio

O codigo no repo corporativo pode ter sido alterado por outros desenvolvedores ou deploys.
Se voce criar um patch baseado em uma versao antiga:
- O `search-replace` pode nao encontrar o texto esperado
- O `replace-file` pode sobrescrever alteracoes feitas por outros
- A esteira corporativa pode falhar por conflitos de tipagem ou imports

## Metodo 1: Via Workflow fetch-files.yml (Recomendado)

### Passo 1: Editar o trigger

Editar `trigger/fetch-files.json`:

```json
{
  "workspace_id": "ws-default",
  "component": "controller",
  "files": "src/controllers/oas-sre-controller.controller.ts,src/swagger/swagger.json,package.json",
  "run": 15
}
```

**Campos:**
| Campo | Descricao | Exemplo |
|-------|-----------|---------|
| `workspace_id` | Workspace alvo | `ws-default` |
| `component` | `controller` ou `agent` | `controller` |
| `files` | Lista de arquivos separados por virgula | `src/controllers/file.ts,package.json` |
| `run` | Incrementar do valor anterior | `15` (se anterior era `14`) |

### Passo 2: Commit e merge para main

O workflow `fetch-files.yml` so dispara quando o arquivo `trigger/fetch-files.json` e alterado na branch `main`.

```bash
git add trigger/fetch-files.json
git commit -m "[claude] chore: fetch corporate files for analysis"
git push -u origin claude/fetch-files
# Criar PR e mergear
```

### Passo 3: Aguardar o workflow

O workflow:
1. Clona o repo corporativo usando `BBVINET_TOKEN`
2. Para cada arquivo: le o conteudo e faz base64 encode
3. Salva no branch `autopilot-state` como:
   ```
   state/workspaces/ws-default/fetched-controller-<safe-filename>
   ```

**Nomenclatura dos arquivos salvos:**
| Arquivo original | Salvo como |
|-----------------|------------|
| `src/controllers/oas-sre-controller.controller.ts` | `fetched-controller-src-controllers-oas-sre-controller.controller.ts` |
| `src/swagger/swagger.json` | `fetched-controller-src-swagger-swagger.json` |
| `package.json` | `fetched-controller-package.json` |

### Passo 4: Ler os arquivos buscados

```bash
# Via GitHub API
gh api "repos/lucassfreiree/autopilot/contents/state/workspaces/ws-default/fetched-controller-package.json?ref=autopilot-state" \
  --jq '.content' | base64 -d

# Via MCP GitHub (para agentes)
# mcp__github__get_file_contents(
#   owner: "lucassfreiree",
#   repo: "autopilot",
#   path: "state/workspaces/ws-default/fetched-controller-package.json",
#   branch: "autopilot-state"
# )
```

## Metodo 2: Ler Arquivos Ja Buscados (Mais Rapido)

Se alguem ja fez fetch recentemente, os arquivos podem estar disponiveis no `autopilot-state`:

```bash
# Listar arquivos fetched disponiveis
gh api "repos/lucassfreiree/autopilot/git/trees/autopilot-state" \
  --jq '.tree[] | select(.path | startswith("state/workspaces/ws-default/fetched-")) | .path'
```

**CUIDADO**: Verificar a data do ultimo fetch. Se os arquivos foram buscados ha muito tempo, podem estar desatualizados.

## Metodo 3: Via MCP GitHub (Para Agentes)

Agentes com acesso ao MCP GitHub podem ler diretamente do repo corporativo:

```
mcp__github__get_file_contents(
  owner: "bbvinet",
  repo: "psc-sre-automacao-controller",
  path: "src/controllers/oas-sre-controller.controller.ts",
  branch: "main"
)
```

**NOTA**: Isto requer que o token do agente tenha acesso ao repo corporativo, o que nem sempre e o caso.

## Workflow fetch-files.yml — Detalhes Tecnicos

```yaml
# Trigger
on:
  push:
    branches: [main]
    paths: ['trigger/fetch-files.json']
  workflow_dispatch:
    inputs:
      workspace_id, component, files

# Fluxo interno
1. Le trigger/fetch-files.json OU inputs do dispatch
2. Le workspace.json do autopilot-state para obter sourceRepo
3. Clona o repo corporativo com BBVINET_TOKEN
4. Para cada arquivo na lista:
   a. Le o conteudo
   b. Base64 encode
   c. Salva no autopilot-state como fetched-<component>-<safe-name>
```

## Quais Arquivos Buscar

### Para alteracao de codigo no Controller
```
src/controllers/<arquivo-alvo>.controller.ts
src/middlewares/<middleware-alvo>.ts
src/swagger/swagger.json
src/__tests__/unit/<teste-correspondente>.test.ts
package.json
```

### Para alteracao de codigo no Agent
```
src/controllers/<arquivo-alvo>.controller.ts
src/services/<servico-alvo>.ts
src/swagger/swagger.json
src/__tests__/<teste-correspondente>.test.ts
package.json
```

### Para version bump apenas
```
package.json
package-lock.json
src/swagger/swagger.json
```

## Observacoes

1. **Versao do swagger pode divergir**: O `info.version` no swagger.json pode estar DIFERENTE da versao no package.json. Sempre verificar antes de fazer search-replace.

2. **package-lock.json**: Este arquivo e muito grande. Para version bump, usar `search-replace` (nao `replace-file`). O search-replace com sed troca todas as ocorrencias do padrao de versao.

3. **Arquivos de teste**: Se voce vai alterar um controller, SEMPRE buscar o teste correspondente tambem. Alteracoes no codigo podem quebrar testes existentes.

## Checklist da Fase 03

- [ ] Identificados os arquivos necessarios para a alteracao
- [ ] Arquivos corporativos buscados (via fetch-files ou API)
- [ ] Versao atual no package.json corporativo verificada
- [ ] Versao atual no swagger.json corporativo verificada (pode divergir!)
- [ ] Arquivos de teste correspondentes buscados (se aplicavel)

---

*Anterior: [02-clone-and-setup.md](02-clone-and-setup.md) | Proximo: [04-code-changes-and-patches.md](04-code-changes-and-patches.md)*
