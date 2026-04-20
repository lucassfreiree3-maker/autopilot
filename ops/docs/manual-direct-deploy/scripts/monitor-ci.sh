#!/usr/bin/env bash
#
# monitor-ci.sh — poll de um run de CI corporativo até completar
#
# Uso:
#   ./monitor-ci.sh <RUN_ID>
#   ./monitor-ci.sh --by-sha <SHA>        # descobre o run pelo SHA do commit
#   ./monitor-ci.sh --latest              # monitora o run mais recente
#
# Exemplo:
#   ./monitor-ci.sh 24668801765
#   ./monitor-ci.sh --by-sha a0ec12dd
#   ./monitor-ci.sh --latest

set -euo pipefail

: "${BBVINET_PAT:?ERROR: export BBVINET_PAT first}"

REPO="${REPO:-bbvinet/psc-sre-automacao-controller}"
INTERVAL="${INTERVAL:-60}"

log() { echo -e "\033[1;34m[$(date +%H:%M:%S)]\033[0m $*"; }

# ------------ descobrir RUN_ID ------------
if [[ "${1:-}" == "--by-sha" ]]; then
  SHA="${2:?usage: $0 --by-sha <SHA>}"
  RUN_ID=$(curl -s -H "Authorization: token ${BBVINET_PAT}" \
    "https://api.github.com/repos/${REPO}/actions/runs?per_page=20" \
    | python3 -c "
import sys, json
sha = '$SHA'
for r in json.load(sys.stdin).get('workflow_runs', []):
    if r['head_sha'].startswith(sha):
        print(r['id'])
        break
")
  [[ -n "$RUN_ID" ]] || { echo "Nenhum run encontrado para SHA $SHA"; exit 1; }
  log "Run localizado: $RUN_ID (sha=$SHA)"
elif [[ "${1:-}" == "--latest" ]]; then
  RUN_ID=$(curl -s -H "Authorization: token ${BBVINET_PAT}" \
    "https://api.github.com/repos/${REPO}/actions/runs?per_page=1" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['workflow_runs'][0]['id'])")
  log "Run mais recente: $RUN_ID"
else
  RUN_ID="${1:?usage: $0 <RUN_ID> | --by-sha <SHA> | --latest}"
fi

# ------------ polling ------------
URL="https://github.com/${REPO}/actions/runs/${RUN_ID}"
log "Monitorando $URL"

while true; do
  RESP=$(curl -s -H "Authorization: token ${BBVINET_PAT}" \
    "https://api.github.com/repos/${REPO}/actions/runs/$RUN_ID")
  STATUS=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))")
  CONCLUSION=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('conclusion','-'))")

  log "status=$STATUS / conclusion=$CONCLUSION"

  if [[ "$STATUS" == "completed" ]]; then
    break
  fi

  sleep "$INTERVAL"
done

# ------------ resumo ------------
echo ""
log "=== FINAL ==="
if [[ "$CONCLUSION" == "success" ]]; then
  echo -e "\033[1;32m✓ CI passou\033[0m"
else
  echo -e "\033[1;31m✗ CI falhou ($CONCLUSION)\033[0m"
  echo ""
  log "Jobs com falha:"
  curl -s -H "Authorization: token ${BBVINET_PAT}" \
    "https://api.github.com/repos/${REPO}/actions/runs/${RUN_ID}/jobs" \
    | python3 -c "
import sys, json
for j in json.load(sys.stdin).get('jobs', []):
    if j.get('conclusion') in ('failure', 'timed_out', 'cancelled'):
        print(f\"  ✗ {j['name']}  [{j.get('conclusion')}]  — id={j['id']}\")
        for s in j.get('steps', []):
            if s.get('conclusion') in ('failure', 'timed_out', 'cancelled'):
                print(f\"       {s['number']:2}. {s['name']}\")
"
  exit 1
fi
