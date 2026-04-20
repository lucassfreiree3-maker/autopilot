# Manual Direct Deploy — Fluxo de Deploy Direto sem Autopilot Workflows

> Guia completo e detalhado para fazer deploy do controller (e agent) **diretamente
> no repo corporativo via GitHub REST API**, sem passar pelos workflows do autopilot.
>
> Este é o fluxo usado quando você está **operando da sua máquina local** e quer
> controle total sobre cada passo — sem depender de runners do GitHub Actions nem
> da orquestração do apply-source-change.yml.

## Quando usar este fluxo

| Situação | Use |
|----------|-----|
| Estou na minha máquina local, quero controle manual | **Este guia (manual-direct-deploy)** |
| Estou dentro de uma sessão do Claude Code com autopilot | `deploy-process/` (fluxo via apply-source-change.yml) |
| Bump simples de versão (smoke test, patch urgente) | **Este guia** |
| Deploy complexo com múltiplos patches + validação | `deploy-process/` |
| Pipeline do autopilot está fora do ar | **Este guia** (fallback) |

## Fluxo Visual End-to-End

```
[1. Exportar token PAT corporativo (env var)]
       |
       v
[2. Clone do repo corporativo com token embutido]
       |
       v
[3. Criar branch feature/bump/X.Y.Z]
       |
       v
[4. Version bump EXATO em 4 posições (script Python seguro)]
       |
       v
[5. git commit + git push (usa token do remote)]
       |
       v
[6. POST /repos/.../pulls (curl) → cria PR]
       |
       v
[7. PUT /repos/.../pulls/{N}/merge (curl) → squash merge]
       |
       v
[8. Poll GET /repos/.../actions/runs (curl + until-loop) → esteira corporativa]
       |
       +---> workflow-npm (build, test, eslint, jest)
       +---> xRay scan
       +---> SonarQube
       +---> Checkmarx
       +---> Docker image publicada no registry
       |
       v
[9. Atualizar tag no CAP values.yaml (Contents API)]
       |
       v
[10. ArgoCD sincroniza no cluster (~5 min)]
       |
       v
[DEPLOY COMPLETO]
```

## Índice de Documentos

| # | Arquivo | O que cobre |
|---|---------|-------------|
| 01 | [01-authentication.md](01-authentication.md) | Token PAT corporativo, como obter, permissões, formato do remote URL, segurança |
| 02 | [02-repositories.md](02-repositories.md) | Todos os repos envolvidos (source, CAP, registry), links, branches, paths |
| 03 | [03-version-locations.md](03-version-locations.md) | Os 4 lugares EXATOS onde a versão vive no código fonte |
| 04 | [04-clone-and-branch.md](04-clone-and-branch.md) | Clone com token embutido, fetch, criar branch de feature |
| 05 | [05-version-bump.md](05-version-bump.md) | Script Python SEGURO para bump (evita corromper package-lock.json) |
| 06 | [06-commit-push.md](06-commit-push.md) | git commit + git push com autenticação embutida |
| 07 | [07-pull-request-api.md](07-pull-request-api.md) | Criar PR via `POST /repos/.../pulls` com curl |
| 08 | [08-merge-api.md](08-merge-api.md) | Squash merge via `PUT /repos/.../pulls/{N}/merge` |
| 09 | [09-monitor-corporate-ci.md](09-monitor-corporate-ci.md) | Polling da Esteira de Build NPM via `GET /actions/runs` |
| 10 | [10-cap-promotion.md](10-cap-promotion.md) | Atualizar image tag no CAP values.yaml via Contents API |
| 11 | [11-deploy-monitoring.md](11-deploy-monitoring.md) | Verificar sincronização do ArgoCD e health do pod |
| 12 | [12-troubleshooting.md](12-troubleshooting.md) | Erros conhecidos: sed corruption, for...of ESLint, merge conflicts |
| 13 | [13-full-example.md](13-full-example.md) | Walkthrough completo do deploy 3.9.1 → 3.9.2 feito em 17/04/2026 |

## Scripts Auxiliares

| Script | Path | Uso |
|--------|------|-----|
| Deploy completo controller | `scripts/deploy-controller.sh` | `./deploy-controller.sh <new-version>` executa todos os passos 2-10 |
| Monitor esteira | `scripts/monitor-ci.sh` | `./monitor-ci.sh <run_id>` polling simples |
| Promover CAP | `scripts/promote-cap.sh` | `./promote-cap.sh <component> <new-tag>` atualiza values.yaml |

## Regras de Ouro

1. **NUNCA** commitar o token PAT em nenhum arquivo versionado — sempre via env var
2. **NUNCA** usar `sed -i 's/X/Y/g'` em `package-lock.json` para bump de versão — corrompe versões de pacotes terceiros
3. **NUNCA** usar `for...of` em TypeScript neste codebase — ESLint rejeita (use `.find()`, `.forEach()`, `.map()`)
4. **SEMPRE** verificar a versão atual antes de bumpar — CI rejeita tag duplicada
5. **SEMPRE** validar se branch pushou com sucesso antes de criar PR
6. **SEMPRE** monitorar esteira corporativa até `completed/success` antes de promover CAP
7. **NUNCA** promover CAP antes da imagem Docker ter sido publicada no registry
8. **SEMPRE** atualizar `references/controller-cap/values.yaml` no autopilot em paralelo com a promoção no repo CAP

## Contexto Aplicável

Este guia cobre o **workspace ws-default (Getronics)**. Para outras empresas:
- `ws-cit` (CIT): não tem esse fluxo, stack é DevOps/IaC — não aplica
- `ws-socnew`, `ws-corp-1`: **BLOQUEADOS** — terceiros, não operar

---

*Documentado em 2026-04-17 com base no deploy real 3.9.1 → 3.9.2 (PR #26) executado em sessão ao vivo.*
