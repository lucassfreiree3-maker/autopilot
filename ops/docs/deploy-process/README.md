# Deploy Process Guide — Complete End-to-End Documentation

> Documentacao completa e detalhada de TODO o processo de deploy do autopilot,
> desde o prompt inicial ate a confirmacao da imagem Docker no registry corporativo.
> Cada fase, cada comando, cada observacao e cada troubleshooting esta registrado aqui.

## Indice de Fases

| # | Fase | Arquivo | Descricao |
|---|------|---------|-----------|
| 01 | Overview e Pre-requisitos | [01-overview-and-prerequisites.md](01-overview-and-prerequisites.md) | Arquitetura geral, repos envolvidos, tokens, ferramentas necessarias |
| 02 | Clone e Setup Local | [02-clone-and-setup.md](02-clone-and-setup.md) | Clone do repo autopilot, criacao de branch, setup do ambiente |
| 03 | Fetch Arquivos Corporativos | [03-fetch-corporate-files.md](03-fetch-corporate-files.md) | Como buscar arquivos atuais do repo corporativo antes de criar patches |
| 04 | Alteracoes no Codigo e Patches | [04-code-changes-and-patches.md](04-code-changes-and-patches.md) | Criacao de patches, tipos (replace-file vs search-replace), convencoes |
| 05 | Version Bump (5 Arquivos) | [05-version-bump.md](05-version-bump.md) | Os 5 lugares EXATOS onde a versao deve ser alterada |
| 06 | Configurar Trigger de Deploy | [06-configure-trigger.md](06-configure-trigger.md) | Editar trigger/source-change.json — o arquivo que dispara tudo |
| 07 | Commit, Push, PR e Merge | [07-commit-push-pr-merge.md](07-commit-push-pr-merge.md) | Fluxo git completo: branch, commit, push, PR, merge |
| 08 | Monitorar Workflow Autopilot | [08-monitor-autopilot-workflow.md](08-monitor-autopilot-workflow.md) | Os 7 stages do apply-source-change.yml em detalhe |
| 09 | Monitorar Esteira Corporativa | [09-monitor-corporate-ci.md](09-monitor-corporate-ci.md) | Acompanhamento da Esteira de Build NPM separadamente |
| 10 | Promocao CAP (Tag de Deploy) | [10-cap-tag-promotion.md](10-cap-tag-promotion.md) | Atualizacao automatica da tag no values.yaml do CAP |
| 11 | Diagnostico e Troubleshooting | [11-diagnostics-and-troubleshooting.md](11-diagnostics-and-troubleshooting.md) | Erros comuns, como diagnosticar, como corrigir |
| 12 | Quick Reference | [12-quick-reference.md](12-quick-reference.md) | Comandos rapidos, checklist resumido, mapa de arquivos |

## Fluxo Visual Resumido

```
[Prompt do Usuario]
       |
       v
[Clone repo autopilot + criar branch claude/*]
       |
       v
[Fetch arquivos corporativos atuais via fetch-files.yml]
       |
       v
[Criar/editar patches em patches/]
       |
       v
[Version bump nos 5 arquivos]
       |
       v
[Editar trigger/source-change.json (incrementar run!)]
       |
       v
[Commit + Push + PR + Merge (squash)]
       |
       v
[Workflow apply-source-change.yml dispara automaticamente]
       |
       +---> Stage 1: Setup (le workspace config)
       +---> Stage 1.5: Session Guard (adquire lock)
       +---> Stage 2: Apply & Push (clona repo corp, aplica patches, push)
       +---> Stage 3: CI Gate (espera esteira corporativa)
       +---> Stage 4: Promote (atualiza tag no CAP values.yaml)
       +---> Stage 5: Save State (salva estado no autopilot-state)
       +---> Stage 6: Audit (registra trail + libera lock)
       |
       v
[Monitorar Esteira de Build NPM (build, test, lint, Docker image)]
       |
       v
[Imagem Docker publicada no registry = DEPLOY COMPLETO]
```

## Regras de Ouro

1. **NUNCA** push direto para main — sempre branch `claude/*` + PR + squash merge
2. **NUNCA** esquecer de incrementar o campo `run` no trigger — sem incremento o workflow NAO dispara
3. **NUNCA** assumir que o workflow rodou — SEMPRE monitorar e verificar
4. **NUNCA** criar patches sem ter a base corporativa ATUAL (fetch primeiro)
5. **SEMPRE** fazer version bump nos 5 arquivos
6. **SEMPRE** monitorar a esteira corporativa APOS o workflow do autopilot
7. **SEMPRE** registrar falhas e solucoes na session memory
8. Deploy so esta COMPLETO quando a imagem Docker e publicada no registry

## Contexto

- **Repo autopilot**: `lucassfreiree/autopilot` (control plane)
- **Repo controller**: `bbvinet/psc-sre-automacao-controller` (codigo fonte)
- **Repo agent**: `bbvinet/psc-sre-automacao-agent` (codigo fonte)
- **Repo CAP controller**: `bbvinet/psc_releases_cap_sre-aut-controller` (deploy K8s)
- **Repo CAP agent**: `bbvinet/psc_releases_cap_sre-aut-agent` (deploy K8s)
- **State branch**: `autopilot-state` (estado runtime, locks, audit)
- **Token corporativo**: `BBVINET_TOKEN` (acesso repos bbvinet)
- **Token autopilot**: `RELEASE_TOKEN` (acesso ao autopilot)

---

*Ultima atualizacao: 2026-03-27*
*Gerado a partir do processo validado e operacional nas sessoes de 2026-03-23 a 2026-03-27*
