# 11 — Monitoria do Deploy no Cluster (ArgoCD + Pod)

> Depois que a tag foi promovida no CAP, o ArgoCD detecta a mudança e faz o
> rollout. Aqui está como acompanhar o rollout até o pod estar healthy com a
> nova versão.

## Como o ArgoCD funciona neste projeto

- **Observa**: `bbvinet/psc_releases_cap_sre-aut-controller` branch `main`
- **Intervalo de sincronização**: automático, ~2-5 min (quase imediato em push-driven)
- **Aplicação ArgoCD**: `psc-sre-automacao-controller` (ou nome configurado no ArgoCD)
- **Target cluster**: `k8shmlbb111b` (HML)
- **Namespace**: `psc-agent` (onde o controller roda)

## 3 formas de monitorar o rollout

| Via | Ferramenta | Quando usar |
|-----|-----------|-------------|
| A | ArgoCD UI | Acompanhar visualmente |
| B | kubectl (se tiver acesso) | Detalhe do pod, logs |
| C | Endpoint HTTP /health do controller | Validação end-to-end sem cluster access |

## Opção A — ArgoCD UI

URL da interface ArgoCD (interna, requer VPN):
- Produção: depende da instalação — verificar com time de plataforma
- Exemplo comum: `https://argocd.bb.com.br/applications/psc-sre-automacao-controller`

O que olhar:
1. **Sync Status**: `Synced` significa que ArgoCD aplicou o CAP atual
2. **Health Status**: `Healthy` significa que pods estão rodando OK
3. **Last Sync Result**: `OK` vs. `SyncFailed`
4. **Target Revision**: SHA do commit do CAP que o ArgoCD aplicou

### Timeline esperada após o push no CAP

```
T+0s       Push no CAP main
T+30-60s   ArgoCD detecta mudança (polling ou webhook)
T+1-2min   ArgoCD inicia sync → aplica Deployment com nova imagem
T+2-3min   K8s faz rolling update (pod antigo drena, novo sobe)
T+3-5min   Pod novo Ready → Application Healthy
```

## Opção B — kubectl (se tiver acesso ao cluster HML)

### Setup do contexto kubectl

```bash
# Configurar contexto (depende do seu acesso)
kubectl config use-context k8shmlbb111b-psc-agent
# ou
export KUBECONFIG=~/.kube/config-hml-k8shmlbb111b
```

### Ver o deployment e imagem atual

```bash
kubectl -n psc-agent get deployment psc-sre-automacao-controller -o jsonpath='{.spec.template.spec.containers[0].image}'
```

Saída:
```
docker.binarios.intranet.bb.com.br/bb/psc/psc-sre-automacao-controller:3.9.2
```

### Ver pods

```bash
kubectl -n psc-agent get pods -l app=psc-sre-automacao-controller
```

Saída durante rollout:
```
NAME                                              READY   STATUS              AGE
psc-sre-automacao-controller-5d7c48fb4b-abc12     1/1     Running             10m   # antigo (3.9.1)
psc-sre-automacao-controller-6e8f59ad2c-xyz34     0/1     ContainerCreating   30s   # novo (3.9.2)
```

Após ~2 min:
```
NAME                                              READY   STATUS    AGE
psc-sre-automacao-controller-6e8f59ad2c-xyz34     1/1     Running   3m
```

### Ver logs do pod novo

```bash
POD=$(kubectl -n psc-agent get pods -l app=psc-sre-automacao-controller -o jsonpath='{.items[0].metadata.name}')
kubectl -n psc-agent logs "$POD" --tail=50
```

Procurar por:
- `Server listening on port 3000` (ou similar)
- Mensagens de auto-register do agent
- Ausência de `Error:` críticos

### Watch do rollout em tempo real

```bash
kubectl -n psc-agent rollout status deployment/psc-sre-automacao-controller --watch
```

Saída:
```
Waiting for deployment "psc-sre-automacao-controller" rollout to finish: 1 out of 2 new replicas have been updated...
Waiting for deployment "psc-sre-automacao-controller" rollout to finish: 1 old replicas are pending termination...
deployment "psc-sre-automacao-controller" successfully rolled out
```

### Descrever pod em caso de problema

```bash
kubectl -n psc-agent describe pod "$POD" | tail -40
# Ver section "Events:" no final
```

Eventos comuns:
- `Normal   Scheduled` — pod agendado
- `Normal   Pulling image` — baixando imagem do registry
- `Normal   Pulled` — imagem baixada OK
- `Normal   Created` + `Normal Started` — container rodando
- `Warning  Unhealthy` — liveness/readiness probe falhou (olhar logs)
- `Warning  BackOff` — container crashando (olhar logs)
- `Warning  ErrImagePull` — não achou imagem (tag errada?)

### Ver events recentes

```bash
kubectl -n psc-agent get events --sort-by='.lastTimestamp' | tail -20
```

## Opção C — Endpoint HTTP (sem cluster access)

O controller expõe um endpoint de health que retorna a versão rodando.

### URL

```
https://sre-aut-controller.psc.k8shmlbb111b.bb.com.br/health
```

(Depende de VPN corporativa.)

### Verificar versão rodando

```bash
curl -s https://sre-aut-controller.psc.k8shmlbb111b.bb.com.br/health \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('version:', d.get('version','?'), '| status:', d.get('status','?'))"
```

Saída esperada após rollout:
```
version: 3.9.2 | status: ok
```

### Polling até versão nova estar rodando

```bash
TARGET_VERSION="3.9.2"

until [ "$(curl -s https://sre-aut-controller.psc.k8shmlbb111b.bb.com.br/health \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('version','?'))" 2>/dev/null)" = "$TARGET_VERSION" ]; do
  CURRENT=$(curl -s https://sre-aut-controller.psc.k8shmlbb111b.bb.com.br/health \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('version','?'))" 2>/dev/null)
  echo "[$(date +%H:%M:%S)] version=${CURRENT} (esperando ${TARGET_VERSION})"
  sleep 30
done

echo "✓ Versão ${TARGET_VERSION} está rodando"
```

### Testar que a nova rota/feature funciona

Exemplo para o deploy 3.9.1 (feature `POST /oas/sre-controller` para todas automações):

```bash
curl -s -X POST \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  https://sre-aut-controller.psc.k8shmlbb111b.bb.com.br/oas/sre-controller \
  -d '{
    "cluster": "k8shmlbb111b",
    "namespace": "test-ns",
    "function": "manage_namespace_origem",
    "envs": { "ACTION": "create" }
  }'
```

Esperado: `200 OK` ou `202 Accepted` com execId.

## Smoke test completo após deploy

Script para validar que o deploy foi realmente bem-sucedido:

```bash
#!/usr/bin/env bash
set -euo pipefail

TARGET_VERSION="${1:?usage: $0 <VERSION>}"
HOST="https://sre-aut-controller.psc.k8shmlbb111b.bb.com.br"

echo "1. /health responde?"
curl -sf "${HOST}/health" >/dev/null && echo "   ✓ OK" || { echo "   ✗ FAIL"; exit 1; }

echo "2. Versão rodando é ${TARGET_VERSION}?"
RUNNING=$(curl -s "${HOST}/health" | python3 -c "import sys,json; print(json.load(sys.stdin).get('version','?'))")
[ "$RUNNING" = "$TARGET_VERSION" ] && echo "   ✓ ${RUNNING}" || { echo "   ✗ Rodando ${RUNNING}, esperado ${TARGET_VERSION}"; exit 1; }

echo "3. Swagger UI disponível?"
curl -sf "${HOST}/docs" >/dev/null && echo "   ✓ OK" || { echo "   ✗ FAIL"; exit 1; }

echo "4. Smoke test finalizado com sucesso"
```

Uso:

```bash
./smoke-test.sh 3.9.2
```

## Alerta se rollout demorar

Se passaram mais de **10 minutos** após push no CAP e a versão nova ainda não
está no `/health`, investigar:

1. Imagem foi realmente publicada no registry?
   ```bash
   curl -s -H "Authorization: token ${BBVINET_PAT}" \
     "https://api.github.com/repos/bbvinet/psc-sre-automacao-controller/actions/runs?per_page=3" \
     | python3 -c "import sys,json; [print(r['conclusion']) for r in json.load(sys.stdin)['workflow_runs']]"
   ```

2. ArgoCD está com auto-sync ligado?
   - Se estava com `Sync Policy: Manual`, precisa clicar "Sync" na UI

3. Pod novo está em erro? (requer kubectl)
   ```bash
   kubectl -n psc-agent get pods -l app=psc-sre-automacao-controller
   ```

4. Cluster está saudável?
   ```bash
   kubectl get nodes
   kubectl top pods -n psc-agent
   ```

## Logging de deploys

Para auditoria interna, registrar cada deploy em `autopilot-state`:

```bash
# Dentro do clone do autopilot (branch autopilot-state):
cat > state/workspaces/ws-default/controller-release-state.json <<EOF
{
  "status": "deployed",
  "lastTag": "3.9.2",
  "previousTag": "3.9.1",
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "deployedBy": "manual-direct-deploy",
  "mergeSha": "a0ec12dd9b...",
  "capSha": "ef1b230085...",
  "ciResult": "success",
  "actor": "${USER}"
}
EOF

git add state/workspaces/ws-default/controller-release-state.json
git commit -m "chore(state): promote controller to 3.9.2"
git push origin autopilot-state
```

---

Próximo: [12-troubleshooting.md](12-troubleshooting.md) — tabela de erros conhecidos
