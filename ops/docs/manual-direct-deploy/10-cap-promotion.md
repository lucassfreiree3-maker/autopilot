# 10 — Promoção do CAP (Deploy Repo) — Atualizar Image Tag

> Depois que a esteira publicou a imagem Docker no registry, é preciso atualizar
> o `values.yaml` do CAP para que o ArgoCD detecte e faça o rollout no cluster.

## Quando fazer

**Só depois** da esteira corporativa do source code estar `completed / success`
com a imagem Docker publicada no registry. Se você promover antes, o ArgoCD vai
tentar puxar uma imagem inexistente e o pod vai ficar em `ImagePullBackOff`.

Checklist:
- [ ] Esteira corporativa `completed / success` ([09-monitor-corporate-ci.md](09-monitor-corporate-ci.md))
- [ ] Imagem publicada (log contém `VERSAO:` ou `Docker image pushed`)
- [ ] Versão nova confirmada (`3.9.2`, não `3.9.1`)

## Repo alvo

| Campo | Valor |
|-------|-------|
| URL | https://github.com/bbvinet/psc_releases_cap_sre-aut-controller |
| Arquivo | `releases/openshift/hml/deploy/values.yaml` |
| Linha que muda | ~128 |
| Formato | `image: docker.binarios.intranet.bb.com.br/bb/psc/psc-sre-automacao-controller:<TAG>` |

## Opções de promoção

| Opção | Ferramenta | Quando usar |
|-------|-----------|-------------|
| A | GitHub Contents API via curl | Sem clonar — um comando, commit direto na main |
| B | Clone + sed + git push | Se quiser revisar diff localmente antes |
| C | Web UI do GitHub | Ad hoc, sem automação |

Neste guia cobrimos **A** (mais comum em scripts) e **B** (mais seguro para mudanças manuais).

## Opção A — Contents API via curl (recomendada)

### Passo 1: Buscar conteúdo atual e SHA do arquivo

```bash
CAP_PATH="releases/openshift/hml/deploy/values.yaml"

RESPONSE=$(curl -s -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/bbvinet/psc_releases_cap_sre-aut-controller/contents/${CAP_PATH}")

SHA=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['sha'])")
CONTENT=$(echo "$RESPONSE" | python3 -c "import sys,json,base64; print(base64.b64decode(json.load(sys.stdin)['content']).decode())")

echo "SHA atual do arquivo: $SHA"
echo "$CONTENT" | grep -n "image:.*psc-sre-automacao-controller"
```

Saída:
```
SHA atual do arquivo: abc1234...
128:              image: docker.binarios.intranet.bb.com.br/bb/psc/psc-sre-automacao-controller:3.9.1
```

### Passo 2: Substituir a tag no conteúdo em memória

```bash
OLD_TAG="3.9.1"
NEW_TAG="3.9.2"

NEW_CONTENT=$(echo "$CONTENT" | sed "s|psc-sre-automacao-controller:${OLD_TAG}|psc-sre-automacao-controller:${NEW_TAG}|g")

# Confirmar
echo "$NEW_CONTENT" | grep -n "image:.*psc-sre-automacao-controller"
```

Saída:
```
128:              image: docker.binarios.intranet.bb.com.br/bb/psc/psc-sre-automacao-controller:3.9.2
```

**NOTA**: no values.yaml do CAP, o `sed -g` é seguro aqui — o arquivo é pequeno
(~200 linhas) e a tag da imagem só aparece uma vez. Diferente do package-lock.json.

### Passo 3: Base64 encode do conteúdo novo

```bash
NEW_B64=$(echo "$NEW_CONTENT" | base64 -w0)   # Linux
# ou no macOS:
# NEW_B64=$(echo "$NEW_CONTENT" | base64)
```

### Passo 4: PUT Contents API com o novo conteúdo

```bash
PAYLOAD=$(python3 -c "
import json
print(json.dumps({
  'message': 'chore: promote controller to ${NEW_TAG}',
  'content': '$NEW_B64',
  'sha': '$SHA',
  'branch': 'main'
}))
")

curl -s -X PUT \
  -H "Authorization: token ${BBVINET_PAT}" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/bbvinet/psc_releases_cap_sre-aut-controller/contents/${CAP_PATH}" \
  -d "$PAYLOAD" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
c = d.get('commit', {})
print(f\"CAP commit: {c.get('sha','none')[:10]} | {c.get('html_url','no-url')}\")
"
```

Saída:
```
CAP commit: ef1b230085 | https://github.com/bbvinet/psc_releases_cap_sre-aut-controller/commit/ef1b230085...
```

### One-liner completo (copy-paste)

```bash
OLD_TAG="3.9.1"
NEW_TAG="3.9.2"
CAP_PATH="releases/openshift/hml/deploy/values.yaml"
CAP_REPO="bbvinet/psc_releases_cap_sre-aut-controller"

RESPONSE=$(curl -s -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/${CAP_REPO}/contents/${CAP_PATH}")

SHA=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['sha'])")
CONTENT=$(echo "$RESPONSE" | python3 -c "import sys,json,base64; print(base64.b64decode(json.load(sys.stdin)['content']).decode())")
NEW_CONTENT=$(echo "$CONTENT" | sed "s|psc-sre-automacao-controller:${OLD_TAG}|psc-sre-automacao-controller:${NEW_TAG}|g")
NEW_B64=$(echo "$NEW_CONTENT" | base64 -w0)

PAYLOAD=$(python3 -c "
import json
print(json.dumps({
  'message': 'chore: promote controller to ${NEW_TAG}',
  'content': '$NEW_B64',
  'sha': '$SHA',
  'branch': 'main'
}))
")

curl -s -X PUT \
  -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/${CAP_REPO}/contents/${CAP_PATH}" \
  -d "$PAYLOAD" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('OK:', d.get('commit', {}).get('html_url', 'FAIL'))
"
```

## Opção B — Clone + sed + push

Se preferir o caminho tradicional:

```bash
CAP_DIR="/tmp/corp-cap-controller"

# Clone se ainda não tem
if [ ! -d "$CAP_DIR" ]; then
  git clone \
    "https://x-access-token:${BBVINET_PAT}@github.com/bbvinet/psc_releases_cap_sre-aut-controller.git" \
    "$CAP_DIR"
fi

cd "$CAP_DIR"
git checkout main
git fetch origin main
git reset --hard origin/main

# Substituir
sed -i "s|psc-sre-automacao-controller:3\\.9\\.1|psc-sre-automacao-controller:3.9.2|g" \
  releases/openshift/hml/deploy/values.yaml

# Confirmar
grep -n "image:.*psc-sre-automacao-controller" releases/openshift/hml/deploy/values.yaml

# Commit + push direto na main
git add releases/openshift/hml/deploy/values.yaml
git commit -m "chore: promote controller to 3.9.2"
git push origin main
```

**Observação**: o CAP repo geralmente permite push direto na `main` sem PR. Se
houver Branch Protection exigindo PR, usar o fluxo completo (branch feature →
PR → merge) como nos docs anteriores.

## Validar a promoção

### Ver o commit no GitHub

Abrir https://github.com/bbvinet/psc_releases_cap_sre-aut-controller/commits/main

### Ou via API

```bash
curl -s -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/bbvinet/psc_releases_cap_sre-aut-controller/commits?per_page=1" \
  | python3 -c "
import sys, json
c = json.load(sys.stdin)[0]
print(f\"sha={c['sha'][:10]} | {c['commit']['message']}\")
"
```

### Confirmar o conteúdo atualizado

```bash
curl -s -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/bbvinet/psc_releases_cap_sre-aut-controller/contents/${CAP_PATH}" \
  | python3 -c "
import sys, json, base64
c = base64.b64decode(json.load(sys.stdin)['content']).decode()
for line in c.splitlines():
    if 'psc-sre-automacao-controller:' in line:
        print(line.strip())
"
```

Saída esperada:
```
image: docker.binarios.intranet.bb.com.br/bb/psc/psc-sre-automacao-controller:3.9.2
```

## Atualizar o espelho local no autopilot

Para manter `references/controller-cap/values.yaml` sincronizado:

```bash
cd ~/autopilot   # ou o path onde está o autopilot

# Buscar conteúdo atualizado
curl -s -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/bbvinet/psc_releases_cap_sre-aut-controller/contents/releases/openshift/hml/deploy/values.yaml" \
  | python3 -c "import sys,json,base64; print(base64.b64decode(json.load(sys.stdin)['content']).decode())" \
  > references/controller-cap/values.yaml

git add references/controller-cap/values.yaml
git commit -m "chore(refs): sync controller-cap values.yaml with 3.9.2 promotion"
git push origin <sua-branch>
```

## Rollback (se precisar)

Se descobrir que a versão nova tem bug crítico e o cluster já subiu:

### Rollback rápido via CAP

```bash
# Voltar tag no values.yaml para a versão anterior
OLD_TAG="3.9.1"   # versão sã
BAD_TAG="3.9.2"   # versão com bug

# Usar Opção A com OLD_TAG/BAD_TAG invertidos
```

ArgoCD detecta a mudança e faz rollout da versão anterior em ~2-5 min.

### Rollback no cluster (mais imediato, sem esperar ArgoCD)

```bash
# Se tiver kubectl:
kubectl -n psc-agent rollout undo deployment/psc-sre-automacao-controller
```

## Troubleshooting

### `409 Conflict` ao fazer PUT

SHA do arquivo mudou entre o GET e o PUT (alguém alterou o values.yaml). Buscar
SHA atual de novo e refazer o PUT.

### `404 Not Found` no caminho do arquivo

Path errado. Confirmar:
```bash
curl -s -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/bbvinet/psc_releases_cap_sre-aut-controller/git/trees/main?recursive=1" \
  | python3 -c "
import sys, json
for n in json.load(sys.stdin).get('tree', []):
    if 'values.yaml' in n.get('path',''):
        print(n['path'])
"
```

### `422 Invalid request` com mensagem sobre base64

O base64 pode ter quebras de linha indevidas. No Linux usar `base64 -w0` para
uma linha única. No macOS usar `base64` sem args (padrão é uma linha).

### Após a promoção, pod não sobe (ImagePullBackOff)

- Imagem não foi publicada (esteira falhou antes do CD step)
- Tag errada no values.yaml (typo)
- Imagem existe mas registry está inacessível (problema de infra do cluster)

Checar:
```bash
kubectl -n psc-agent describe pod <pod-name>
kubectl -n psc-agent get events --sort-by='.lastTimestamp' | tail -10
```

---

Próximo: [11-deploy-monitoring.md](11-deploy-monitoring.md) — ArgoCD + health do pod
