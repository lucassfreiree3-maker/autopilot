# 07 — Criar Pull Request via GitHub REST API

> Como criar um PR no repo corporativo usando `curl` + token PAT — sem precisar
> da web UI nem do `gh` CLI.

## Endpoint

```
POST https://api.github.com/repos/{owner}/{repo}/pulls
```

Docs oficiais: https://docs.github.com/en/rest/pulls/pulls#create-a-pull-request

## Payload mínimo

```json
{
  "title": "<título do PR>",
  "head": "<branch de feature>",
  "base": "<branch de destino, normalmente main>",
  "body": "<descrição opcional em markdown>"
}
```

## Comando canônico

```bash
NEW_VERSION="3.9.2"
BRANCH="bump/${NEW_VERSION}"

curl -s -X POST \
  -H "Authorization: token ${BBVINET_PAT}" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/bbvinet/psc-sre-automacao-controller/pulls \
  -d "$(cat <<EOF
{
  "title": "chore: bump version to ${NEW_VERSION} (pipeline smoke test)",
  "head": "${BRANCH}",
  "base": "main",
  "body": "Smoke test do pipeline.\n\nApenas bump de versão — sem mudança de código.\n\n- package.json: ${NEW_VERSION}\n- package-lock.json: ${NEW_VERSION} (2 ocorrências)\n- src/swagger/swagger.json: ${NEW_VERSION}"
}
EOF
)" | tee /tmp/pr-create-response.json | python3 -c "
import sys, json
d = json.load(sys.stdin)
if 'number' in d:
    print(f\"✓ PR #{d['number']} criado\")
    print(f\"  URL: {d['html_url']}\")
    print(f\"  State: {d.get('state')}\")
    print(f\"  Mergeable: {d.get('mergeable_state','unknown')}\")
else:
    print(f\"✗ Falha: {d.get('message','unknown error')}\")
    if 'errors' in d:
        for e in d['errors']:
            print(f\"    - {e.get('message','')}\")
"
```

### Saída esperada

```
✓ PR #26 criado
  URL: https://github.com/bbvinet/psc-sre-automacao-controller/pull/26
  State: open
  Mergeable: unknown
```

**Nota**: `mergeable_state = unknown` no momento da criação é esperado. O GitHub
computa mergeability assincronamente; após 5-10 segundos muda para `clean`,
`dirty`, `unstable`, etc.

## Campos adicionais úteis

| Campo | Tipo | Uso |
|-------|------|-----|
| `draft` | bool | `true` para criar como draft PR |
| `maintainer_can_modify` | bool | permite maintainers da base fazerem commits na head |
| `issue` | int | converter issue existente em PR (incompatível com title/body) |

### Exemplo com draft

```json
{
  "title": "WIP: feature X",
  "head": "feat/x",
  "base": "main",
  "draft": true
}
```

## Resposta completa (campos úteis)

```json
{
  "number": 26,
  "state": "open",
  "title": "chore: bump version to 3.9.2 (pipeline smoke test)",
  "html_url": "https://github.com/bbvinet/psc-sre-automacao-controller/pull/26",
  "diff_url": "https://github.com/bbvinet/psc-sre-automacao-controller/pull/26.diff",
  "head": {
    "ref": "bump/3.9.2",
    "sha": "dc984497...",
    "repo": { "full_name": "bbvinet/psc-sre-automacao-controller" }
  },
  "base": {
    "ref": "main",
    "sha": "2ad1ae80..."
  },
  "mergeable": null,
  "mergeable_state": "unknown",
  "merged": false,
  "draft": false,
  "commits": 1,
  "additions": 4,
  "deletions": 4,
  "changed_files": 3
}
```

## Extrair campos específicos

### Número do PR (para merge depois)

```bash
PR_NUMBER=$(curl -s -X POST \
  -H "Authorization: token ${BBVINET_PAT}" \
  https://api.github.com/repos/bbvinet/psc-sre-automacao-controller/pulls \
  -d '{"title":"...","head":"bump/3.9.2","base":"main","body":"..."}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['number'])")
echo "PR_NUMBER=$PR_NUMBER"
```

### SHA do commit do PR

```bash
curl -s -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/bbvinet/psc-sre-automacao-controller/pulls/${PR_NUMBER}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('head_sha=' + d['head']['sha'])"
```

## Aguardar mergeable_state ficar pronto

Após criar o PR, `mergeable_state` começa como `unknown`. Para esperar:

```bash
PR_NUMBER=26
until [ "$(curl -s -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/bbvinet/psc-sre-automacao-controller/pulls/${PR_NUMBER}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('mergeable_state','unknown'))")" != "unknown" ]; do
  sleep 2
done

# Imprimir estado final
curl -s -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/bbvinet/psc-sre-automacao-controller/pulls/${PR_NUMBER}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('mergeable_state:', d.get('mergeable_state'))"
```

## Estados possíveis de `mergeable_state`

| Estado | Significado | O que fazer |
|--------|-------------|-------------|
| `unknown` | GitHub ainda calculando | Esperar (2-10s) |
| `clean` | Pode mergear sem conflitos e com checks OK | Merge |
| `blocked` | Review ou check obrigatório pendente | Aguardar CI / review |
| `behind` | Branch está atrás do base | Update branch (rebase ou merge main) |
| `dirty` | Conflitos com a base | Resolver conflitos localmente e re-push |
| `unstable` | Sem conflitos mas algum check não-obrigatório falhou | Avaliar — pode mergear se status não-blocking |
| `has_hooks` | Rodando checks Branch Protection | Esperar |
| `draft` | PR é draft | Tirar do draft |

## Fluxo típico

```
[criar PR] → mergeable_state=unknown (5-10s)
          → mergeable_state=blocked (CI rodando)
          → mergeable_state=clean (CI passou)
          → [squash merge]
```

## Erros comuns

### `"Validation Failed"` + `"Invalid base branch"`

A branch base não existe. Verificar:
```bash
curl -s -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/bbvinet/psc-sre-automacao-controller/branches/main" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('name','NOT FOUND'))"
```

### `"Validation Failed"` + `"A pull request already exists for ..."`

Já tem um PR aberto na mesma branch. Listar:
```bash
curl -s -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/bbvinet/psc-sre-automacao-controller/pulls?state=open&head=bbvinet:bump/3.9.2" \
  | python3 -c "import sys,json; [print(f\"#{p['number']} {p['title']}\") for p in json.load(sys.stdin)]"
```

### `"Not Found"` (404)

- Repo errado (owner/repo incorreto)
- Token sem permissão de ler o repo

### `"Resource not accessible by integration"`

Token fine-grained sem `Pull requests: Write`. Reemitir com escopo correto.

## Alternativas (outras ferramentas)

### Via `gh` CLI (se tiver instalado)

```bash
gh pr create \
  --repo bbvinet/psc-sre-automacao-controller \
  --base main \
  --head bump/3.9.2 \
  --title "chore: bump version to 3.9.2" \
  --body "Smoke test"
```

### Via `hub` CLI (legado)

```bash
hub pull-request -m "chore: bump to 3.9.2"
```

Neste guia priorizamos **curl direto** porque:
- Zero dependências além de bash+curl+python3
- Mesmo padrão em macOS, Linux e WSL
- Fácil de debugar (resposta JSON completa)

---

Próximo: [08-merge-api.md](08-merge-api.md) — fazer squash merge via API
