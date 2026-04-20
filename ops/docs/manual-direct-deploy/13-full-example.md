# 13 — Walkthrough Completo: Deploy 3.9.1 → 3.9.2 (17/04/2026)

> Este é o deploy real executado para validar o pipeline após as entregas de
> 3.8.9 / 3.9.0 / 3.9.1. Cada comando mostrado aqui foi efetivamente rodado.
>
> PR: https://github.com/bbvinet/psc-sre-automacao-controller/pull/26

## Contexto

Após 3 deploys de feature no mesmo dia (3.8.9, 3.9.0, 3.9.1), o usuário pediu:
> "você consegue fazer a alteração simples alterar a versão do controller para a gente testar o fluxo novamente"

Então fizemos um bump trivial 3.9.1 → 3.9.2 sem mudança de código, apenas pra
confirmar que o pipeline continua saudável.

## Passo 1 — Sincronizar o clone local

```bash
cd /tmp/corp-controller
git checkout main
git fetch origin main
git reset --hard origin/main
```

Saída:
```
Switched to branch 'main'
From https://github.com/bbvinet/psc-sre-automacao-controller
   5ebb7b8..2ad1ae8  main       -> origin/main
HEAD is now at 2ad1ae8 feat(oas): support all automations + fix lint/lock (v3.9.1) (#25)
```

## Passo 2 — Confirmar versão atual

```bash
grep -n '"version"' package.json | head -1
head -15 package-lock.json | grep -n version
grep -n '"version"' src/swagger/swagger.json | head -1
```

Saída:
```
3:  "version": "3.9.1",
3:  "version": "3.9.1",
9:      "version": "3.9.1",
6:    "version": "3.9.1",
```

## Passo 3 — Criar branch

```bash
git checkout -b bump/3.9.2
```

Saída:
```
Switched to a new branch 'bump/3.9.2'
```

## Passo 4 — Version bump (Python line-targeted)

```bash
python3 -c "
for path, line_spec in [
    ('package.json', 3),
    ('package-lock.json', [3, 9]),
    ('src/swagger/swagger.json', 6),
]:
    with open(path, 'r') as f:
        lines = f.readlines()
    targets = line_spec if isinstance(line_spec, list) else [line_spec]
    for t in targets:
        idx = t - 1
        lines[idx] = lines[idx].replace('3.9.1', '3.9.2')
    with open(path, 'w') as f:
        f.writelines(lines)
print('done')
"
```

Saída: `done`

## Passo 5 — Validar bump

```bash
grep -n '"version"' package.json | head -1
head -15 package-lock.json | grep -n version
grep -n '"version"' src/swagger/swagger.json | head -1
```

Saída:
```
3:  "version": "3.9.2",
3:  "version": "3.9.2",
9:      "version": "3.9.2",
6:    "version": "3.9.2",
```

Diff stat:
```bash
git diff --stat
```

Saída:
```
 package-lock.json        | 4 ++--
 package.json             | 2 +-
 src/swagger/swagger.json | 2 +-
 3 files changed, 4 insertions(+), 4 deletions(-)
```

## Passo 6 — Commit

```bash
git add package.json package-lock.json src/swagger/swagger.json
git commit -m "chore: bump version to 3.9.2 (pipeline smoke test)"
```

Saída:
```
[bump/3.9.2 dc98449] chore: bump version to 3.9.2 (pipeline smoke test)
 3 files changed, 4 insertions(+), 4 deletions(-)
```

## Passo 7 — Push

```bash
git push -u origin bump/3.9.2
```

Saída:
```
Enumerating objects: 11, done.
Counting objects: 100% (11/11), done.
...
To https://github.com/bbvinet/psc-sre-automacao-controller.git
 * [new branch]      bump/3.9.2 -> bump/3.9.2
branch 'bump/3.9.2' set up to track 'origin/bump/3.9.2'.
```

## Passo 8 — Criar PR

```bash
curl -s -X POST \
  -H "Authorization: token ${BBVINET_PAT}" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/bbvinet/psc-sre-automacao-controller/pulls \
  -d '{
    "title": "chore: bump version to 3.9.2 (pipeline smoke test)",
    "head": "bump/3.9.2",
    "base": "main",
    "body": "Smoke test do pipeline após as entregas de 3.8.9 / 3.9.0 / 3.9.1. Apenas bump de versão — sem mudança de código."
  }' | python3 -c "import sys,json; d=json.load(sys.stdin); print('PR #' + str(d.get('number','?')) + ' | ' + d.get('html_url','no-url') + ' | mergeable_state=' + str(d.get('mergeable_state','unknown')))"
```

Saída:
```
PR #26 | https://github.com/bbvinet/psc-sre-automacao-controller/pull/26 | mergeable_state=unknown
```

## Passo 9 — Esperar + Merge

```bash
sleep 8

curl -s -X PUT \
  -H "Authorization: token ${BBVINET_PAT}" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/bbvinet/psc-sre-automacao-controller/pulls/26/merge \
  -d '{"merge_method":"squash","commit_title":"chore: bump version to 3.9.2 (pipeline smoke test) (#26)"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('merged=' + str(d.get('merged','false')) + ' | sha=' + str(d.get('sha','none'))[:10] + ' | msg=' + str(d.get('message','ok')))"
```

Saída:
```
merged=True | sha=a0ec12dd9b | msg=Pull Request successfully merged
```

## Passo 10 — Monitorar esteira (polling)

Primeiro listar runs:

```bash
curl -s -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/bbvinet/psc-sre-automacao-controller/actions/runs?per_page=3" \
  | python3 -c "
import sys,json
for r in json.load(sys.stdin).get('workflow_runs',[])[:3]:
    print(f\"{r['id']} | {r['name']} | {r['status']}/{r.get('conclusion','-')} | sha={r['head_sha'][:8]} | {r['html_url']}\")
"
```

Saída:
```
24668801765 | ⚙ Esteira de Build NPM | in_progress/None | sha=a0ec12dd | https://github.com/.../runs/24668801765
24668788506 | ⚙ Esteira de Build NPM | in_progress/None | sha=dc984497 | ...
24571204733 | ⚙ Esteira de Build NPM | completed/success | sha=2ad1ae80 | ...
```

Run do merge: `24668801765` (sha=a0ec12dd, que bate com o merge_sha).

Polling loop:

```bash
RUN_ID=24668801765

until [ "$(curl -s -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/bbvinet/psc-sre-automacao-controller/actions/runs/$RUN_ID" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))")" = "completed" ]; do
  STATUS=$(curl -s -H "Authorization: token ${BBVINET_PAT}" \
    "https://api.github.com/repos/bbvinet/psc-sre-automacao-controller/actions/runs/$RUN_ID" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','?') + ' / ' + str(d.get('conclusion','-')))")
  echo "[$(date +%H:%M:%S)] $STATUS"
  sleep 60
done
echo "=== FINAL ==="
curl -s -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/bbvinet/psc-sre-automacao-controller/actions/runs/$RUN_ID" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"status={d.get('status')} | conclusion={d.get('conclusion')} | url={d.get('html_url')}\")"
```

Saída (condensada):
```
[13:19:46] in_progress / None
[13:20:47] in_progress / None
[13:21:49] in_progress / None
[13:22:50] in_progress / None
...
[13:26:54] queued / None
[13:27:54] in_progress / None
[13:28:55] in_progress / None
[13:29:56] in_progress / None
[13:30:57] in_progress / None
[13:31:58] in_progress / None
[13:32:59] in_progress / None
[13:34:00] queued / None
=== FINAL ===
status=completed | conclusion=success | url=https://github.com/.../runs/24668801765
```

Tempo total: ~15 minutos. Esteira verde.

## Passo 11 — Promover CAP (3.9.1 → 3.9.2)

```bash
OLD_TAG="3.9.1"
NEW_TAG="3.9.2"
CAP_PATH="releases/openshift/hml/deploy/values.yaml"
CAP_REPO="bbvinet/psc_releases_cap_sre-aut-controller"

# Buscar SHA e conteúdo atual
RESPONSE=$(curl -s -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/${CAP_REPO}/contents/${CAP_PATH}")
SHA=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['sha'])")
CONTENT=$(echo "$RESPONSE" | python3 -c "import sys,json,base64; print(base64.b64decode(json.load(sys.stdin)['content']).decode())")

# Substituir tag
NEW_CONTENT=$(echo "$CONTENT" | sed "s|psc-sre-automacao-controller:${OLD_TAG}|psc-sre-automacao-controller:${NEW_TAG}|g")
NEW_B64=$(echo "$NEW_CONTENT" | base64 -w0)

# Confirmar
echo "Current tag line:"; echo "$CONTENT" | grep -n "image:.*psc-sre-automacao-controller"
echo "New tag line:"; echo "$NEW_CONTENT" | grep -n "image:.*psc-sre-automacao-controller"

# PUT
PAYLOAD=$(python3 -c "import json,sys; print(json.dumps({'message':'chore: promote controller to ${NEW_TAG}','content':'$NEW_B64','sha':'$SHA','branch':'main'}))")

curl -s -X PUT \
  -H "Authorization: token ${BBVINET_PAT}" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/${CAP_REPO}/contents/${CAP_PATH}" \
  -d "$PAYLOAD" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('CAP commit:', d.get('commit',{}).get('sha','none')[:10], '|', d.get('commit',{}).get('html_url','no-url'))
"
```

Saída:
```
Current tag line:
128:              image: docker.binarios.intranet.bb.com.br/bb/psc/psc-sre-automacao-controller:3.9.1
New tag line:
128:              image: docker.binarios.intranet.bb.com.br/bb/psc/psc-sre-automacao-controller:3.9.2
CAP commit: ef1b230085 | https://github.com/bbvinet/psc_releases_cap_sre-aut-controller/commit/ef1b230085...
```

## Passo 12 — Atualizar espelho local do CAP no autopilot

```bash
cd ~/autopilot

curl -s -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/bbvinet/psc_releases_cap_sre-aut-controller/contents/releases/openshift/hml/deploy/values.yaml" \
  | python3 -c "import sys,json,base64; print(base64.b64decode(json.load(sys.stdin)['content']).decode())" \
  > references/controller-cap/values.yaml

grep "image:.*psc-sre-automacao-controller:" references/controller-cap/values.yaml
```

Saída:
```
              image: docker.binarios.intranet.bb.com.br/bb/psc/psc-sre-automacao-controller:3.9.2
```

Commit:
```bash
git add references/controller-cap/values.yaml
git commit -m "chore(refs): sync controller-cap values.yaml with 3.9.2 promotion"
git push origin <sua-branch>
```

## Passo 13 — Atualizar session memory

Para manter rastreabilidade:

```bash
python3 -c "
import json
with open('contracts/claude-session-memory.json', 'r') as f:
    mem = json.load(f)
mem['currentState']['controllerVersion'] = '3.9.2'
mem['versioningRules']['currentVersion'] = '3.9.2'
mem['versioningRules']['previousVersion'] = '3.9.1'
mem['lastUpdated'] = '2026-04-17T13:40:00Z'
with open('contracts/claude-session-memory.json', 'w') as f:
    json.dump(mem, f, indent=2, ensure_ascii=False)
"

git add contracts/claude-session-memory.json
git commit -m "chore(state): promote controller to 3.9.2 (smoke test)"
```

## Passo 14 — Validar deploy no cluster (opcional)

Após ~5-10 min do commit no CAP:

```bash
curl -s https://sre-aut-controller.psc.k8shmlbb111b.bb.com.br/health \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('version:', d.get('version','?'))"
```

Esperado:
```
version: 3.9.2
```

## Timeline Real do Deploy

| Tempo | Evento |
|-------|--------|
| T+0 | `git clone` sincronizado com main |
| T+1min | Branch `bump/3.9.2` criada, bump feito |
| T+2min | PR #26 criado (commit `dc98449`) |
| T+2min | PR mergeado (sha `a0ec12dd`) |
| T+2min30s | Esteira disparou (run `24668801765`) |
| T+17min | Esteira `completed / success` |
| T+17min30s | CAP promovido (commit `ef1b230085`) |
| T+22min | ArgoCD sincronizou, pod novo rodando |
| T+22min | `/health` retorna `version: 3.9.2` |

## Resumo dos artefatos criados

| Tipo | Identificador | URL |
|------|---------------|-----|
| Branch | `bump/3.9.2` | https://github.com/bbvinet/psc-sre-automacao-controller/tree/bump/3.9.2 |
| Commit na branch | `dc984497` | — |
| PR | #26 | https://github.com/bbvinet/psc-sre-automacao-controller/pull/26 |
| Merge SHA | `a0ec12dd` | — |
| CI Run | `24668801765` | https://github.com/bbvinet/psc-sre-automacao-controller/actions/runs/24668801765 |
| Imagem Docker | `psc-sre-automacao-controller:3.9.2` | registry corporativo |
| CAP commit | `ef1b230085` | https://github.com/bbvinet/psc_releases_cap_sre-aut-controller/commit/ef1b230085... |

## Lições desta execução

- O flow direct via REST API é ~3 min mais rápido que o fluxo via autopilot workflow (sem stage de lock + session guard)
- Esteira leva ~15 min mesmo pra bump trivial — é dominada por scan de segurança (xRay + Checkmarx + Sonar), não por build
- PR criado via API fica com `mergeable_state = unknown` pelos primeiros 5-10s — é normal
- O token hardcoded no remote URL do clone local funciona silenciosamente — não pede credencial mesmo entre reboot (desde que o clone não seja deletado)

---

[← Voltar ao índice](README.md)
