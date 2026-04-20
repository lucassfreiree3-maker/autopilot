#!/usr/bin/env bash
#
# deploy-controller.sh — deploy end-to-end do controller (bump de versão)
#
# Uso:
#   ./deploy-controller.sh <FROM_VERSION> <TO_VERSION> [--skip-cap]
#
# Exemplo:
#   ./deploy-controller.sh 3.9.1 3.9.2
#   ./deploy-controller.sh 3.9.1 3.9.2 --skip-cap   # não promove CAP automaticamente
#
# Pré-requisitos:
#   - BBVINET_PAT exportado como env var
#   - python3 + curl + git instalados
#   - Clone de /tmp/corp-controller (ou definido via $CLONE_DIR)
#
# Passos executados:
#   1. Sincronizar clone com main
#   2. Criar branch bump/<TO_VERSION>
#   3. Bump de versão (line-targeted)
#   4. Commit + push
#   5. Criar PR via REST API
#   6. Merge (squash)
#   7. Polling da esteira até completar
#   8. Promover CAP (se não --skip-cap)

set -euo pipefail

FROM="${1:?usage: $0 <FROM> <TO> [--skip-cap]}"
TO="${2:?usage: $0 <FROM> <TO> [--skip-cap]}"
SKIP_CAP=false
[[ "${3:-}" == "--skip-cap" ]] && SKIP_CAP=true

: "${BBVINET_PAT:?ERROR: export BBVINET_PAT first}"

CLONE_DIR="${CLONE_DIR:-/tmp/corp-controller}"
REPO="bbvinet/psc-sre-automacao-controller"
CAP_REPO="bbvinet/psc_releases_cap_sre-aut-controller"
CAP_PATH="releases/openshift/hml/deploy/values.yaml"

BRANCH="bump/${TO}"

# ------------ utils ------------
log() { echo -e "\033[1;34m[$(date +%H:%M:%S)]\033[0m $*"; }
fail() { echo -e "\033[1;31m[FAIL]\033[0m $*" >&2; exit 1; }

# ------------ passo 1: clone/sync ------------
if [[ ! -d "$CLONE_DIR/.git" ]]; then
  log "Clonando ${REPO} em ${CLONE_DIR}..."
  git clone "https://x-access-token:${BBVINET_PAT}@github.com/${REPO}.git" "$CLONE_DIR"
fi

cd "$CLONE_DIR"
log "Sincronizando main..."
git checkout main -q
git fetch origin main -q
git reset --hard origin/main -q

# Confirmar versão atual
CURRENT=$(sed -n '3p' package.json | python3 -c "import sys,re; m=re.search(r'\"version\":\s*\"([^\"]+)\"', sys.stdin.read()); print(m.group(1) if m else 'NONE')")
[[ "$CURRENT" == "$FROM" ]] || fail "Versão atual é $CURRENT, esperado $FROM"
log "Versão atual confirmada: $FROM"

# ------------ passo 2: branch ------------
log "Criando branch $BRANCH..."
git checkout -b "$BRANCH" -q 2>/dev/null || git checkout "$BRANCH" -q

# ------------ passo 3: bump ------------
log "Bumpando $FROM → $TO em 4 locações..."
python3 - <<PYEOF
FROM = "$FROM"
TO = "$TO"
changes = [
    ('package.json', [3]),
    ('package-lock.json', [3, 9]),
    ('src/swagger/swagger.json', [6]),
]
for path, lines in changes:
    with open(path, 'r') as f:
        content = f.readlines()
    for ln in lines:
        content[ln - 1] = content[ln - 1].replace(FROM, TO)
    with open(path, 'w') as f:
        f.writelines(content)
PYEOF

# Validar
V_PKG=$(sed -n '3p' package.json | grep -oE '"[0-9]+\.[0-9]+\.[0-9]+"' | tr -d '"')
V_LOCK1=$(sed -n '3p' package-lock.json | grep -oE '"[0-9]+\.[0-9]+\.[0-9]+"' | tr -d '"')
V_LOCK2=$(sed -n '9p' package-lock.json | grep -oE '"[0-9]+\.[0-9]+\.[0-9]+"' | tr -d '"')
V_SWAGGER=$(sed -n '6p' src/swagger/swagger.json | grep -oE '"[0-9]+\.[0-9]+\.[0-9]+"' | tr -d '"')

[[ "$V_PKG" == "$TO" && "$V_LOCK1" == "$TO" && "$V_LOCK2" == "$TO" && "$V_SWAGGER" == "$TO" ]] \
  || fail "Versões não casam: pkg=$V_PKG lock1=$V_LOCK1 lock2=$V_LOCK2 swagger=$V_SWAGGER"
log "Bump validado: $TO em todos os 4 lugares"

# ------------ passo 4: commit + push ------------
log "Commit + push..."
git add package.json package-lock.json src/swagger/swagger.json
git commit -m "chore: bump version to $TO (pipeline smoke test)" -q
git push -u origin "$BRANCH" -q 2>&1 | grep -E "\[new branch\]|Everything up-to-date" || true

# ------------ passo 5: criar PR ------------
log "Criando PR..."
PR_BODY="Smoke test do pipeline. Apenas bump de versão — sem mudança de código.\n\n- package.json: $TO\n- package-lock.json: $TO (2 ocorrências)\n- src/swagger/swagger.json: $TO"

PR_NUMBER=$(curl -s -X POST \
  -H "Authorization: token ${BBVINET_PAT}" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/${REPO}/pulls" \
  -d "$(python3 -c "
import json
print(json.dumps({
  'title': 'chore: bump version to $TO (pipeline smoke test)',
  'head': '$BRANCH',
  'base': 'main',
  'body': '$PR_BODY'
}))
")" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('number',''))")

[[ -n "$PR_NUMBER" ]] || fail "Falha ao criar PR"
log "PR #$PR_NUMBER criado: https://github.com/${REPO}/pull/${PR_NUMBER}"

# ------------ passo 6: merge ------------
log "Aguardando mergeable_state..."
sleep 8

MERGE_RESULT=$(curl -s -X PUT \
  -H "Authorization: token ${BBVINET_PAT}" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/${REPO}/pulls/${PR_NUMBER}/merge" \
  -d "$(python3 -c "
import json
print(json.dumps({
  'merge_method': 'squash',
  'commit_title': 'chore: bump version to $TO (pipeline smoke test) (#$PR_NUMBER)'
}))
")")

MERGED=$(echo "$MERGE_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('merged','false'))")
[[ "$MERGED" == "True" || "$MERGED" == "true" ]] || fail "Merge falhou: $MERGE_RESULT"
MERGE_SHA=$(echo "$MERGE_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('sha','')[:10])")
log "PR #$PR_NUMBER mergeado (sha=$MERGE_SHA)"

# ------------ passo 7: polling CI ------------
log "Aguardando CI iniciar..."
sleep 30

RUN_ID=$(curl -s -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/${REPO}/actions/runs?per_page=5" \
  | python3 -c "
import sys, json
runs = json.load(sys.stdin).get('workflow_runs', [])
for r in runs:
    if r['head_sha'].startswith('$MERGE_SHA'):
        print(r['id'])
        break
")

[[ -n "$RUN_ID" ]] || fail "Não encontrei CI run para sha $MERGE_SHA"
log "CI run: $RUN_ID — https://github.com/${REPO}/actions/runs/${RUN_ID}"

log "Polling CI até completar (~15 min)..."
until STATUS=$(curl -s -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/${REPO}/actions/runs/$RUN_ID" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))") && \
  [[ "$STATUS" == "completed" ]]; do
  FULL=$(curl -s -H "Authorization: token ${BBVINET_PAT}" \
    "https://api.github.com/repos/${REPO}/actions/runs/$RUN_ID" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','?') + ' / ' + str(d.get('conclusion','-')))")
  log "CI: $FULL"
  sleep 60
done

CONCLUSION=$(curl -s -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/${REPO}/actions/runs/$RUN_ID" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('conclusion','?'))")

[[ "$CONCLUSION" == "success" ]] || fail "CI conclusion: $CONCLUSION"
log "✓ CI passou — imagem $TO publicada no registry"

# ------------ passo 8: promover CAP ------------
if [[ "$SKIP_CAP" == "true" ]]; then
  log "--skip-cap: pulando promoção do CAP"
  exit 0
fi

log "Promovendo CAP $FROM → $TO..."
RESPONSE=$(curl -s -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/${CAP_REPO}/contents/${CAP_PATH}")
SHA=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['sha'])")
CONTENT=$(echo "$RESPONSE" | python3 -c "import sys,json,base64; print(base64.b64decode(json.load(sys.stdin)['content']).decode())")
NEW_CONTENT=$(echo "$CONTENT" | sed "s|psc-sre-automacao-controller:${FROM}|psc-sre-automacao-controller:${TO}|g")
NEW_B64=$(echo "$NEW_CONTENT" | base64 -w0 2>/dev/null || echo "$NEW_CONTENT" | base64)

PAYLOAD=$(python3 -c "
import json
print(json.dumps({
  'message': 'chore: promote controller to $TO',
  'content': '$NEW_B64',
  'sha': '$SHA',
  'branch': 'main'
}))
")

CAP_RESULT=$(curl -s -X PUT \
  -H "Authorization: token ${BBVINET_PAT}" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/${CAP_REPO}/contents/${CAP_PATH}" \
  -d "$PAYLOAD")

CAP_SHA=$(echo "$CAP_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('commit',{}).get('sha','')[:10])")
[[ -n "$CAP_SHA" ]] || fail "Falha ao promover CAP: $CAP_RESULT"
log "✓ CAP promovido (commit=$CAP_SHA) — ArgoCD vai sincronizar em ~5 min"

log ""
log "=============================================="
log "DEPLOY $TO COMPLETO"
log "  PR:     https://github.com/${REPO}/pull/${PR_NUMBER}"
log "  CI:     https://github.com/${REPO}/actions/runs/${RUN_ID}"
log "  Image:  docker.binarios.intranet.bb.com.br/bb/psc/psc-sre-automacao-controller:${TO}"
log "  CAP:    https://github.com/${CAP_REPO}/commit/${CAP_SHA}"
log "=============================================="
