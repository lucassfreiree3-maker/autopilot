# 09 — Monitorar a Esteira Corporativa

> Após o merge, a Esteira de Build NPM dispara automaticamente. Aqui está como
> acompanhar até a imagem Docker ser publicada no registry.

## Quando a esteira dispara

Imediatamente após o push/merge na branch `main` do repo source. O GitHub leva
~10-30 segundos para enfileirar o run.

## Onde ver

### Via navegador

https://github.com/bbvinet/psc-sre-automacao-controller/actions

Procurar o workflow "⚙ Esteira de Build NPM" com o SHA do merge.

### Via API

Listar os 3 runs mais recentes:

```bash
curl -s -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/bbvinet/psc-sre-automacao-controller/actions/runs?per_page=3" \
  | python3 -c "
import sys, json
for r in json.load(sys.stdin).get('workflow_runs', [])[:3]:
    print(f\"{r['id']} | {r['name']} | {r['status']}/{r.get('conclusion','-')} | sha={r['head_sha'][:8]} | {r['html_url']}\")
"
```

Saída esperada (exemplo):
```
24668801765 | ⚙ Esteira de Build NPM | in_progress/None | sha=a0ec12dd | https://github.com/bbvinet/psc-sre-automacao-controller/actions/runs/24668801765
24668788506 | ⚙ Esteira de Build NPM | in_progress/None | sha=dc984497 | ...
24571204733 | ⚙ Esteira de Build NPM | completed/success | sha=2ad1ae80 | ...
```

Observar o primeiro da lista — deve ter o SHA do commit de merge.

## Identificar o run certo

Se sabe o SHA do merge:

```bash
MERGE_SHA="a0ec12dd9b..."   # do response do merge API

curl -s -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/bbvinet/psc-sre-automacao-controller/actions/runs?per_page=5" \
  | python3 -c "
import sys, json
sha = '$MERGE_SHA'
for r in json.load(sys.stdin).get('workflow_runs', []):
    if r['head_sha'].startswith(sha[:8]):
        print(f\"run_id={r['id']} | status={r['status']} | conclusion={r.get('conclusion','-')}\")
        break
"
```

## Ler detalhes de um run específico

```bash
RUN_ID=24668801765

curl -s -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/bbvinet/psc-sre-automacao-controller/actions/runs/${RUN_ID}" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f\"Name: {d.get('name')}\")
print(f\"Status: {d.get('status')} / {d.get('conclusion','-')}\")
print(f\"Branch: {d.get('head_branch')}\")
print(f\"SHA: {d.get('head_sha','')[:10]}\")
print(f\"Event: {d.get('event')}\")
print(f\"Started: {d.get('run_started_at')}\")
print(f\"URL: {d.get('html_url')}\")
"
```

### Campos importantes

| Campo | Valores |
|-------|---------|
| `status` | `queued`, `in_progress`, `completed`, `waiting` |
| `conclusion` | `success`, `failure`, `cancelled`, `skipped`, `timed_out`, `action_required`, `null` (quando status != completed) |

## Loop de polling até completar

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
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f\"status={d.get('status')} | conclusion={d.get('conclusion')} | url={d.get('html_url')}\")
"
```

### Duração típica

| Cenário | Duração |
|---------|---------|
| Bump de versão simples (só muda 4 linhas) | ~12-15 min |
| Feature com novos arquivos/testes | ~15-20 min |
| Falha em build/test (falha early) | ~2-5 min |
| Esteira "queued" muito tempo (runner ocupado) | variável — aceitável até ~30 min |

## Inspecionar jobs de um run

Cada run tem múltiplos jobs (workflow-npm, xRay, SonarQube, Checkmarx, etc.).

```bash
RUN_ID=24668801765

curl -s -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/bbvinet/psc-sre-automacao-controller/actions/runs/${RUN_ID}/jobs" \
  | python3 -c "
import sys, json
for j in json.load(sys.stdin).get('jobs', []):
    print(f\"{j['id']} | {j['name']} | {j['status']}/{j.get('conclusion','-')}\")
    for s in j.get('steps', []):
        print(f\"    {s['number']:2}. {s['name']} — {s['status']}/{s.get('conclusion','-')}\")
"
```

Saída exemplo:
```
12345 | valida-workflow | completed/success
   1. Set up job — completed/success
   2. Checkout — completed/success
   3. Validate workflow YAML — completed/success
   4. Post Checkout — completed/success
   5. Complete job — completed/success
12346 | workflow-npm | in_progress/-
   1. Set up job — completed/success
   2. Checkout — completed/success
   3. Setup Node — completed/success
   4. npm ci — completed/success
   5. tsc --noEmit — completed/success
   6. eslint — in_progress/-
...
```

## Baixar logs de um job (em caso de falha)

```bash
JOB_ID=12346

curl -s -L \
  -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/bbvinet/psc-sre-automacao-controller/actions/jobs/${JOB_ID}/logs" \
  > /tmp/job-${JOB_ID}-logs.txt

wc -l /tmp/job-${JOB_ID}-logs.txt
grep -E "FAIL|error|Error:|Tests:|Test Suites:" /tmp/job-${JOB_ID}-logs.txt | head -30
```

## Cancelar um run (se precisar)

```bash
RUN_ID=24668801765

curl -s -X POST \
  -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/bbvinet/psc-sre-automacao-controller/actions/runs/${RUN_ID}/cancel" \
  -w "%{http_code}\n"
```

HTTP 202 = aceitou o pedido de cancelamento.

## Re-run de um job que falhou

```bash
RUN_ID=24668801765

# Re-rodar apenas jobs que falharam
curl -s -X POST \
  -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/bbvinet/psc-sre-automacao-controller/actions/runs/${RUN_ID}/rerun-failed-jobs"

# Ou re-rodar o run inteiro
curl -s -X POST \
  -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/bbvinet/psc-sre-automacao-controller/actions/runs/${RUN_ID}/rerun"
```

## Padrões a procurar nos logs

| Pattern | Significado | Ação |
|---------|-------------|------|
| `Test Suites: X failed` | Testes jest falharam | Ver log, corrigir teste |
| `error TS` | Erro de compilação TypeScript | Ver log, corrigir tipagem |
| `X problems (X errors)` | Lint error | Ver linha reportada, corrigir |
| `npm error notarget` | Versão de pacote não existe no registry | Checkar package-lock.json (ver [05-version-bump.md](05-version-bump.md)) |
| `Unexpected use of ForOfStatement` | for...of no código — bloqueio ESLint | Trocar por `.forEach()`, `.find()`, `.map()` |
| `DuplicateVersionException` ou `already exists` | Tag Docker já publicada | Incrementar versão e redeployar |
| `Test Suites: X passed, 0 failed` | Testes OK | Continuar |
| `Docker image pushed` ou `VERSAO:` | Imagem publicada | Esteira verde — ir pro [10-cap-promotion](10-cap-promotion.md) |

## Quando considerar "esteira OK"

A esteira está completa quando:
1. `status = completed`
2. `conclusion = success`
3. Todos os jobs (workflow-npm, xRay, SonarQube, Checkmarx, CD) passaram

Só aí a imagem Docker estará publicada no registry com a nova tag.

## Troubleshooting avançado

### Run não aparece após o merge

Checar se:
1. O merge realmente foi feito (response da API deu `merged: true`)
2. O SHA do merge está como `origin/main`:
   ```bash
   curl -s -H "Authorization: token ${BBVINET_PAT}" \
     "https://api.github.com/repos/bbvinet/psc-sre-automacao-controller/branches/main" \
     | python3 -c "import sys,json; print(json.load(sys.stdin)['commit']['sha'])"
   ```
3. O workflow não foi desabilitado na aba Actions (muito raro)

### Runs ficam em `queued` eternamente

Runner corporativo indisponível. Esperar ou contatar o time de plataforma.

### `action_required` na conclusion

Workflow precisa de aprovação manual. Isso pode ser Branch Protection exigindo
check list. Abrir o link e aprovar.

---

Próximo: [10-cap-promotion.md](10-cap-promotion.md) — atualizar tag no CAP
