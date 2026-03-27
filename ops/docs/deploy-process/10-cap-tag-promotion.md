# Fase 10 — Promocao CAP (Tag de Deploy)

## Objetivo

Verificar e confirmar que a tag da imagem Docker foi atualizada no arquivo `values.yaml` do repositorio CAP. Esta e a etapa que efetivamente atualiza qual versao esta deployada no cluster Kubernetes.

## O que e o CAP

CAP (Configuracao de Aplicacao para Producao) e o repositorio que contem os manifestos Kubernetes (Deployment, Service, Ingress, RBAC, Secrets) para deploy no cluster.

O arquivo chave e o `values.yaml` que contem a tag da imagem Docker:

```yaml
# Linha relevante no values.yaml:
image: docker.binarios.intranet.bb.com.br/bb/psc/psc-sre-automacao-controller:3.6.7
#                                                                              ^^^^^
#                                                                              Esta tag
```

## Repos CAP

| Component | CAP Repo | Values Path |
|-----------|----------|-------------|
| Controller | `bbvinet/psc_releases_cap_sre-aut-controller` | `releases/openshift/hml/deploy/values.yaml` |
| Agent | `bbvinet/psc_releases_cap_sre-aut-agent` | `releases/openshift/hml/deploy/values.yaml` |

## Como a Promocao Funciona (Auto-promote)

### Stage 4 do apply-source-change.yml

O Stage 4 (Promote) roda **automaticamente** se `promote=true` no trigger E o CI Gate passou.

**Fluxo interno:**

```
1. Le versao do package.json do repo corporativo (source of truth)
   → gh api "repos/$SOURCE_REPO/contents/package.json?ref=main" | jq '.version'
   → Resultado: "3.6.7"

2. Le values.yaml atual do CAP repo
   → gh api "repos/$CAP_REPO/contents/$CAP_VALUES?ref=$CAP_BRANCH"
   → Decodifica base64 → conteudo do values.yaml

3. Substitui a tag usando sed com imagePattern
   → sed "s|${IMAGE_PATTERN}.*|${IMAGE_PATTERN}${TAG}|"
   → Pattern: "image: .*psc-sre-automacao-controller:"
   → Resultado: "image: .*psc-sre-automacao-controller:3.6.7"

4. Se houve mudanca, faz commit via GitHub API
   → gh api "repos/$CAP_REPO/contents/$CAP_VALUES" --method PUT
   → Commit message: "chore(release): controller -> 3.6.7 (source change)"
   → Token: BBVINET_TOKEN
```

### Commit no CAP Repo

O commit e feito pelo bot `github-actions` via API:
```
Author: github-actions
Message: chore(release): controller -> 3.6.7 (source change)
Branch: main
```

## Verificar se a Promocao Ocorreu

### Metodo 1: Via Release State

```bash
gh api "repos/lucassfreiree/autopilot/contents/state/workspaces/ws-default/controller-release-state.json?ref=autopilot-state" \
  --jq '.content' | base64 -d | jq '{status, promoted, lastTag}'
```

Resultado esperado:
```json
{
  "status": "promoted",
  "promoted": true,
  "lastTag": "3.6.7"
}
```

### Metodo 2: Via CAP Repo Direto

```bash
# Controller CAP
gh api "repos/bbvinet/psc_releases_cap_sre-aut-controller/contents/releases/openshift/hml/deploy/values.yaml" \
  --jq '.content' | base64 -d | grep "image:"

# Agent CAP
gh api "repos/bbvinet/psc_releases_cap_sre-aut-agent/contents/releases/openshift/hml/deploy/values.yaml" \
  --jq '.content' | base64 -d | grep "image:"
```

### Metodo 3: Via Audit Trail

```bash
# Procurar audit de promote
gh api "repos/lucassfreiree/autopilot/git/trees/autopilot-state" \
  --jq '.tree[] | select(.path | contains("audit/source-change")) | .path' | sort | tail -1
```

Ler o ultimo audit e verificar:
```json
{
  "promoted": true,
  "stages": {
    "promote": "success"
  }
}
```

## Promocao Manual (Se Auto-promote Falhar)

Se o Stage 4 falhar por algum motivo, usar o workflow standalone `promote-cap.yml`:

### Editar trigger/promote-cap.json:
```json
{
  "workspace_id": "ws-default",
  "component": "controller",
  "version": "3.6.7",
  "run": 5
}
```

### Mergear em main:
O workflow `promote-cap.yml` dispara e atualiza a tag no CAP repo.

## Atualizar Referencia Local

Apos promote confirmado, atualizar a referencia local no autopilot:

```yaml
# references/controller-cap/values.yaml
# Linha de comentario no topo:
# Current tag: 3.6.7   <-- Atualizar
```

E a linha da imagem:
```yaml
image: docker.binarios.intranet.bb.com.br/bb/psc/psc-sre-automacao-controller:3.6.7
```

## Fluxo Completo: Do Push ao Deploy no Cluster

```
1. Push para repo corporativo (Stage 2)
   → Commit SHA: def5678
   → Branch: main

2. Esteira de Build NPM roda (CI corporativo)
   → npm ci → build → lint → test → Docker build → Docker push
   → Imagem: docker.binarios.intranet.bb.com.br/bb/psc/psc-sre-automacao-controller:3.6.7

3. CI Gate detecta success (Stage 3)
   → check-runs: all completed, all success

4. Promote atualiza CAP (Stage 4)
   → values.yaml: image tag → 3.6.7
   → Commit no CAP repo

5. Pipeline de deploy do cluster le o CAP (externo ao autopilot)
   → Detecta mudanca no values.yaml
   → Faz rolling update do Deployment
   → Pod com nova imagem 3.6.7 sobe

6. Aplicacao rodando com versao 3.6.7
   → Verificar: curl -s https://sre-aut-controller.psc.k8shmlbb111b.bb.com.br/health
```

## Problemas Comuns no Promote

| Problema | Causa | Solucao |
|----------|-------|---------|
| `No CAP repo configured` | workspace.json nao tem `capRepo` | Adicionar campo ao workspace.json |
| `Image pattern didn't match` | Pattern do workspace.json nao bate | Verificar `imagePattern` |
| `promoted=false` (sem erro) | sed nao encontrou o padrao | Verificar formato da linha `image:` no values.yaml |
| `promoted=skipped` | Component nao tem CAP configurado | Configurar capRepo no workspace.json |
| 403 no commit | Token sem permissao de escrita no CAP | Verificar scopes do BBVINET_TOKEN |

## Checklist da Fase 10

- [ ] Stage 4 (Promote) completou com `promoted=true`
- [ ] Tag no CAP values.yaml atualizada para nova versao
- [ ] Release state no autopilot-state mostra `status: "promoted"`
- [ ] Referencia local (`references/controller-cap/values.yaml`) atualizada
- [ ] Audit trail registra `promoted: true`

---

*Anterior: [09-monitor-corporate-ci.md](09-monitor-corporate-ci.md) | Proximo: [11-diagnostics-and-troubleshooting.md](11-diagnostics-and-troubleshooting.md)*
