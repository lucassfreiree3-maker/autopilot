# 08 — Fazer Squash Merge via GitHub REST API

> Como fechar o PR com squash merge via curl + token PAT.

## Endpoint

```
PUT https://api.github.com/repos/{owner}/{repo}/pulls/{pull_number}/merge
```

Docs oficiais: https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request

## Métodos de merge disponíveis

| merge_method | O que faz |
|--------------|-----------|
| `merge` | Cria um merge commit (padrão) — preserva todos os commits da branch |
| `squash` | Squasha todos os commits em 1 e faz fast-forward — **recomendado neste projeto** |
| `rebase` | Faz rebase de todos os commits em cima do base — linear mas preserva cada commit |

Neste projeto usamos sempre `squash`: histórico de main fica limpo, 1 commit por PR.

## Payload mínimo

```json
{
  "merge_method": "squash",
  "commit_title": "<título final do commit — normalmente = título do PR + (#N)>",
  "commit_message": "<corpo opcional>"
}
```

## Comando canônico

```bash
PR_NUMBER=26
NEW_VERSION="3.9.2"

curl -s -X PUT \
  -H "Authorization: token ${BBVINET_PAT}" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/bbvinet/psc-sre-automacao-controller/pulls/${PR_NUMBER}/merge" \
  -d "$(cat <<EOF
{
  "merge_method": "squash",
  "commit_title": "chore: bump version to ${NEW_VERSION} (pipeline smoke test) (#${PR_NUMBER})"
}
EOF
)" | tee /tmp/pr-merge-response.json | python3 -c "
import sys, json
d = json.load(sys.stdin)
if d.get('merged'):
    print(f\"✓ PR #${PR_NUMBER} merged\")
    print(f\"  SHA: {d['sha']}\")
    print(f\"  Message: {d.get('message','')}\")
else:
    print(f\"✗ Merge falhou: {d.get('message','unknown')}\")
"
```

### Saída esperada

```
✓ PR #26 merged
  SHA: a0ec12dd9b...
  Message: Pull Request successfully merged
```

## O que acontece após o merge

1. **Branch feature fica órfã**: pode deletar (opcional)
2. **Main avança**: novo commit na HEAD com o título que você passou
3. **CI dispara automaticamente**: `on: push` a main no workflow corporativo

Dentro de ~30 segundos você verá um novo run da Esteira de Build NPM para o SHA do merge.

## Deletar a branch feature após merge

Boa prática pra não poluir a lista de branches:

### Via API

```bash
BRANCH="bump/3.9.2"
curl -s -X DELETE \
  -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/bbvinet/psc-sre-automacao-controller/git/refs/heads/${BRANCH}" \
  -w "%{http_code}\n"
```

HTTP 204 = sucesso.

### Via git local (se quiser limpar também)

```bash
git branch -d bump/3.9.2
```

## Aguardar mergeable_state antes de tentar merge

Se `mergeable_state != "clean"`, o merge falha. Sempre esperar:

```bash
PR_NUMBER=26

# Esperar state sair de 'unknown'
until STATE=$(curl -s -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/bbvinet/psc-sre-automacao-controller/pulls/${PR_NUMBER}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('mergeable_state','unknown'))") && \
  [ "$STATE" != "unknown" ]; do
  sleep 2
done
echo "State: $STATE"

if [ "$STATE" = "clean" ]; then
  # Merge
  curl -s -X PUT ...
elif [ "$STATE" = "dirty" ]; then
  echo "Conflict! Fix locally and re-push."
elif [ "$STATE" = "behind" ]; then
  echo "Branch behind main. Update via: curl -X PUT .../update-branch"
elif [ "$STATE" = "blocked" ]; then
  echo "Waiting for required checks or reviews..."
fi
```

## Atualizar branch se `mergeable_state = behind`

Quando `main` avançou após seu PR, o estado vira `behind`. Atualizar:

```bash
PR_NUMBER=26

curl -s -X PUT \
  -H "Authorization: token ${BBVINET_PAT}" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/bbvinet/psc-sre-automacao-controller/pulls/${PR_NUMBER}/update-branch"
```

Isso faz merge da `main` na branch do PR via API (não precisa clonar).

## Resolver conflitos se `mergeable_state = dirty`

API não resolve conflito — tem que ser no clone local:

```bash
cd /tmp/corp-controller
git checkout bump/3.9.2
git fetch origin main
git rebase origin/main
# resolver conflitos com editor
git add <arquivos>
git rebase --continue
git push --force-with-lease origin bump/3.9.2
```

Depois voltar para o fluxo de merge.

## Códigos HTTP da API de merge

| Código | Significado |
|--------|-------------|
| 200 | Merged com sucesso |
| 405 | Method Not Allowed — PR não é mergeable (conflito, draft, check bloqueado) |
| 409 | Conflict — estado mudou entre chamadas (race) |
| 422 | Unprocessable Entity — commit_title inválido, ou SHA do base divergiu |

### Exemplo de erro 405

```json
{
  "message": "Pull Request is not mergeable",
  "documentation_url": "..."
}
```

Causa: `mergeable_state = dirty` ou `blocked`.

### Exemplo de erro 422

```json
{
  "message": "Head branch was modified. Review and try the merge again.",
  "documentation_url": "..."
}
```

Alguém pushou na branch depois que você criou o PR. Re-chamar o endpoint de merge resolve (desde que mergeable).

## Verificar que o merge foi refletido na main

```bash
MERGE_SHA=$(cat /tmp/pr-merge-response.json | python3 -c "import sys,json; print(json.load(sys.stdin).get('sha','FAIL'))")
echo "Merge SHA: $MERGE_SHA"

curl -s -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/bbvinet/psc-sre-automacao-controller/branches/main" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('main HEAD:', d['commit']['sha'][:10])"

# Deve bater com MERGE_SHA
```

## Depois do merge — o que monitorar

Depois do merge, o CI corporativo dispara no SHA do merge. Ir direto pro
[09-monitor-corporate-ci.md](09-monitor-corporate-ci.md).

---

Próximo: [09-monitor-corporate-ci.md](09-monitor-corporate-ci.md) — monitorar esteira até imagem Docker ser publicada
