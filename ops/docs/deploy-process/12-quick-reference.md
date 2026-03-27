# Fase 12 — Quick Reference

## Checklist Resumido de Deploy (Uma Pagina)

```
[ ] 1. git fetch origin main && git checkout -B claude/<desc> origin/main
[ ] 2. Verificar versao atual: jq '.version' trigger/source-change.json
[ ] 3. Verificar ultimo run: jq '.run' trigger/source-change.json
[ ] 4. Fetch arquivos corporativos (se necessario)
[ ] 5. Criar/editar patches em patches/
[ ] 6. Version bump nos 5 arquivos
[ ] 7. Editar trigger/source-change.json (run = ultimo + 1)
[ ] 8. git add patches/ trigger/ references/ contracts/ CLAUDE.md
[ ] 9. git commit -m "[claude] feat: <desc> + deploy vX.Y.Z"
[ ] 10. git push -u origin claude/<desc>
[ ] 11. Criar PR (MCP ou gh CLI)
[ ] 12. Verificar mergeable_state
[ ] 13. Merge (squash)
[ ] 14. Monitorar workflow (polling 30-60s)
[ ] 15. Monitorar esteira corporativa
[ ] 16. Verificar promote (tag no CAP)
[ ] 17. Atualizar session memory
[ ] 18. Notificar usuario
```

---

## Comandos Rapidos

### Estado Atual

```bash
# Versao atual
jq '.version' trigger/source-change.json

# Ultimo run
jq '.run' trigger/source-change.json

# Versao na memory
jq '.versioningRules.currentVersion' contracts/claude-session-memory.json

# Lock ativo
gh api "repos/lucassfreiree/autopilot/contents/state/workspaces/ws-default/locks/session-lock.json?ref=autopilot-state" \
  --jq '.content' | base64 -d 2>/dev/null | jq '{agentId, expiresAt}' || echo "Sem lock"

# Release state
gh api "repos/lucassfreiree/autopilot/contents/state/workspaces/ws-default/controller-release-state.json?ref=autopilot-state" \
  --jq '.content' | base64 -d | jq '{status, lastTag, promoted, ciResult}'
```

### Monitorar Workflow

```bash
# Listar runs recentes
gh api repos/lucassfreiree/autopilot/actions/workflows/apply-source-change.yml/runs?per_page=3 \
  --jq '.workflow_runs[] | {id, status, conclusion, created_at}'

# Detalhe dos jobs de um run
gh api repos/lucassfreiree/autopilot/actions/runs/<RUN_ID>/jobs \
  --jq '.jobs[] | {name, status, conclusion}'

# Steps de um job
gh api repos/lucassfreiree/autopilot/actions/runs/<RUN_ID>/jobs \
  --jq '.jobs[] | {name, steps: [.steps[] | {name, conclusion}]}'
```

### Monitorar Esteira Corporativa

```bash
# Check-runs do commit corporativo
gh api "repos/bbvinet/psc-sre-automacao-controller/commits/<SHA>/check-runs" \
  --jq '.check_runs[] | {name, status, conclusion}'

# SHA do commit corporativo (do release-state)
gh api "repos/lucassfreiree/autopilot/contents/state/workspaces/ws-default/controller-release-state.json?ref=autopilot-state" \
  --jq '.content' | base64 -d | jq -r '.lastReleasedSha'
```

### Diagnostico

```bash
# Logs da esteira (ultimo arquivo)
gh api "repos/lucassfreiree/autopilot/git/trees/autopilot-state" \
  --jq '.tree[] | select(.path | contains("ci-logs-controller")) | .path' | sort | tail -1

# Ler um log especifico
gh api "repos/lucassfreiree/autopilot/contents/state/workspaces/ws-default/<LOG_FILE>?ref=autopilot-state" \
  --jq '.content' | base64 -d

# Audit trail (ultimo)
gh api "repos/lucassfreiree/autopilot/git/trees/autopilot-state" \
  --jq '.tree[] | select(.path | contains("audit/source-change")) | .path' | sort | tail -1
```

### CAP Verify

```bash
# Tag atual no CAP controller
gh api "repos/bbvinet/psc_releases_cap_sre-aut-controller/contents/releases/openshift/hml/deploy/values.yaml" \
  --jq '.content' | base64 -d | grep "image:.*controller"

# Tag atual no CAP agent
gh api "repos/bbvinet/psc_releases_cap_sre-aut-agent/contents/releases/openshift/hml/deploy/values.yaml" \
  --jq '.content' | base64 -d | grep "image:.*agent"
```

---

## Mapa de Arquivos

### Arquivos que VOCE Edita (no autopilot)

| Arquivo | Quando editar | O que editar |
|---------|---------------|--------------|
| `patches/*.ts` | Novo codigo/fix | Arquivo completo (replace-file) |
| `patches/*-swagger.json` | Novas rotas/versao | Swagger completo |
| `trigger/source-change.json` | Todo deploy | changes, version, run, commit_message |
| `references/controller-cap/values.yaml` | Version bump | Tag da imagem + comentario |
| `contracts/claude-session-memory.json` | Version bump | currentVersion, previousVersion |
| `CLAUDE.md` | Version bump | Secao "Controller CAP" |

### Arquivos que o WORKFLOW Edita (nos repos corporativos)

| Arquivo | Editado por | Como |
|---------|-------------|------|
| `package.json` | search-replace | sed |
| `package-lock.json` | search-replace | sed (flag g, 2 ocorrencias) |
| `src/swagger/swagger.json` | replace-file | cp |
| `src/controllers/*.ts` | replace-file | cp |
| `src/middlewares/*.ts` | replace-file | cp |
| `src/__tests__/**/*.test.ts` | replace-file | cp |

### Arquivos que o WORKFLOW Edita (no autopilot-state)

| Arquivo | Editado por | Stage |
|---------|-------------|-------|
| `locks/session-lock.json` | Session Guard | 1.5 e 6 |
| `<component>-release-state.json` | Save State | 5 |
| `audit/source-change-*.json` | Audit | 6 |
| `ci-status-<component>.json` | ci-status-check | (separado) |
| `ci-logs-<component>-*.txt` | ci-diagnose | (separado) |

### Arquivos que o WORKFLOW Edita (nos repos CAP)

| Arquivo | Editado por | Stage |
|---------|-------------|-------|
| `releases/openshift/hml/deploy/values.yaml` | Promote | 4 |

---

## Tabela de Versao: Onde Atualizar

| # | Arquivo | Repo | Metodo | Campo |
|---|---------|------|--------|-------|
| 1 | `package.json` | Corporativo | search-replace | `"version": "X.Y.Z"` |
| 2 | `package-lock.json` | Corporativo | search-replace | `"version": "X.Y.Z"` (2x) |
| 3 | `src/swagger/swagger.json` | Corporativo | replace-file | `info.version` |
| 4 | `references/controller-cap/values.yaml` | Autopilot | Manual | Comentario + image tag |
| 5 | `contracts/claude-session-memory.json` | Autopilot | Manual | `versioningRules.currentVersion` |

---

## Tabela de Tokens

| Token | Usado em | Para que |
|-------|----------|---------|
| `BBVINET_TOKEN` | Stages 2, 3, 4 | Clone/push repo corp, check-runs, commit CAP |
| `RELEASE_TOKEN` | Stages 1, 1.5, 5, 6 | Ler/escrever autopilot-state |

---

## Tabela de Workflows

| Workflow | Trigger File | Disparo | Resultado |
|----------|-------------|---------|-----------|
| `apply-source-change.yml` | `trigger/source-change.json` | Push main | Deploy completo (7 stages) |
| `fetch-files.yml` | `trigger/fetch-files.json` | Push main | Arquivos salvos no autopilot-state |
| `ci-diagnose.yml` | `trigger/ci-diagnose.json` | Push main | Logs salvos no autopilot-state |
| `ci-status-check.yml` | `trigger/ci-status.json` | Push main | Status salvo no autopilot-state |
| `promote-cap.yml` | `trigger/promote-cap.json` | Push main | Tag atualizada no CAP |
| `validate-patches.yml` | (automatico em PRs) | PR com patches/ | Validacao pre-deploy |

---

## Tempos Tipicos

| Fase | Duracao | Observacao |
|------|---------|------------|
| Setup (Stage 1) | 10-30s | Le config |
| Session Guard (Stage 1.5) | 5-15s | Adquire lock |
| Apply & Push (Stage 2) | 1-5 min | Inclui npm install para lint |
| CI Gate (Stage 3) | 5-20 min | Espera esteira corporativa |
| Promote (Stage 4) | 10-30s | Atualiza CAP |
| Save State (Stage 5) | 5-15s | Salva estado |
| Audit (Stage 6) | 5-15s | Registra trail |
| **Total workflow** | **7-25 min** | Depende da esteira |
| Esteira corporativa (build+test) | 12-15 min | Se tudo OK |
| **Total end-to-end** | **20-40 min** | Do merge ao deploy completo |

---

## Regras de Ouro (Resumo)

1. NUNCA push direto para main
2. NUNCA esquecer de incrementar `run`
3. NUNCA assumir que workflow rodou — verificar
4. NUNCA criar patches sem base corporativa atual
5. NUNCA usar search-replace com newlines
6. NUNCA usar acentos no swagger
7. NUNCA usar `scopes` (plural) no JWT — usar `scope`
8. SEMPRE version bump nos 5 arquivos
9. SEMPRE monitorar esteira corporativa apos workflow
10. SEMPRE registrar falhas na session memory
11. SEMPRE definir funcoes antes de usa-las
12. Versao apos X.Y.9 = X.(Y+1).0

---

*Anterior: [11-diagnostics-and-troubleshooting.md](11-diagnostics-and-troubleshooting.md) | Voltar: [README.md](README.md)*
