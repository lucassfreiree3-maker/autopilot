# 02 — Repositórios Envolvidos

> Mapa completo de todos os repos que você precisa conhecer para deployar o
> controller. Cada repo tem um papel distinto no pipeline.

## Diagrama do Pipeline de Repos

```
+---------------------------------------+
|  1. SOURCE CODE (onde você commita)    |
|  bbvinet/psc-sre-automacao-controller  |
+---------------------------------------+
              |
              | (push + merge → trigger CI)
              v
+---------------------------------------+
|  2. CI CORPORATIVA (Esteira NPM)       |
|  GitHub Actions do repo source         |
|  Publica Docker image no registry      |
+---------------------------------------+
              |
              | (imagem criada com sucesso)
              v
+---------------------------------------+
|  3. REGISTRY (Docker image)            |
|  docker.binarios.intranet.bb.com.br/   |
|    bb/psc/psc-sre-automacao-controller |
+---------------------------------------+
              |
              | (você atualiza image tag no values.yaml)
              v
+---------------------------------------+
|  4. CAP (deploy K8s)                   |
|  bbvinet/psc_releases_cap_sre-aut-     |
|    controller                          |
+---------------------------------------+
              |
              | (ArgoCD detecta mudança)
              v
+---------------------------------------+
|  5. CLUSTER K8S (pod rodando)          |
|  k8shmlbb111b (HML)                    |
+---------------------------------------+
```

## Repo 1 — Source Code do Controller

| Campo | Valor |
|-------|-------|
| URL | https://github.com/bbvinet/psc-sre-automacao-controller |
| Clone URL | `https://x-access-token:${BBVINET_PAT}@github.com/bbvinet/psc-sre-automacao-controller.git` |
| Default branch | `main` |
| Actions URL | https://github.com/bbvinet/psc-sre-automacao-controller/actions |
| PRs URL | https://github.com/bbvinet/psc-sre-automacao-controller/pulls |
| Stack | Node 22, TypeScript, Express, Jest, SQLite, S3 |
| Entry point | `src/index.ts` |
| Package manifest | `package.json` |
| Role | Código fonte do orquestrador de automações SRE |

### Arquivos críticos dentro deste repo

| Path | O que faz |
|------|-----------|
| `package.json` | Nome, versão, dependências |
| `package-lock.json` | Lockfile de dependências (NPM) |
| `src/swagger/swagger.json` | Spec OpenAPI 3.0 da API — `info.version` refletir versão do pacote |
| `src/index.ts` | Bootstrap do servidor Express |
| `src/routes/` | Definições de rotas HTTP |
| `src/controllers/` | Handlers das rotas |
| `src/auth/` | Middleware de autenticação (JWT, API Key, TechBB) |
| `src/util/` | Helpers (trusted-agent, auto-register, etc) |
| `src/__tests__/` | Testes Jest (unit + integration) |
| `Jenkinsfile` | Pipeline da esteira corporativa |
| `Dockerfile` | Build da imagem |
| `aic.json` | Config do aic-action (Git provider plugin) |
| `bbconfig.yaml` | Config de integração BB |

## Repo 2 — CI Corporativa (GitHub Actions)

A "Esteira de Build NPM" roda nos próprios workflows do repo source (não é repo separado).

| Campo | Valor |
|-------|-------|
| Arquivos de workflow | `.github/workflows/*.yml` dentro de `bbvinet/psc-sre-automacao-controller` |
| Lista de workflows | https://github.com/bbvinet/psc-sre-automacao-controller/actions |
| Main workflow | `⚙ Esteira de Build NPM` |
| Runs API | `GET /repos/bbvinet/psc-sre-automacao-controller/actions/runs` |
| Duração típica | ~12-15 min (build + test + lint + scans + push image) |

### Estágios típicos da esteira (ordem)

1. **valida-workflow** — lint do workflow YAML
2. **workflow-npm** — `npm ci` + `npm run build` (tsc) + `npm run lint` (eslint) + `npm test` (jest)
3. **xRay** — scan de vulnerabilidades nas dependências
4. **SonarQube** — análise de qualidade de código
5. **Checkmarx** — scan de segurança SAST
6. **CD (Continuous Deployment)** — build + push da imagem Docker ao registry

Cada estágio falha bloqueia os seguintes.

## Repo 3 — Registry Docker (não é repo git)

| Campo | Valor |
|-------|-------|
| URL do registry | `docker.binarios.intranet.bb.com.br` |
| Path da imagem | `bb/psc/psc-sre-automacao-controller` |
| Formato de tag | Versão semântica do `package.json` (ex: `3.9.2`) |
| Pull full path | `docker.binarios.intranet.bb.com.br/bb/psc/psc-sre-automacao-controller:3.9.2` |
| Acesso | Somente via VPN corporativa ou runner corporativo |
| Retention | Tags não são deletadas — tag duplicada falha no push |

**CRÍTICO**: a esteira RECUSA publicar uma tag que já existe. Isso é por segurança.
Por isso SEMPRE incrementar a versão antes de cada deploy.

## Repo 4 — CAP (deploy K8s do Controller)

| Campo | Valor |
|-------|-------|
| URL | https://github.com/bbvinet/psc_releases_cap_sre-aut-controller |
| Clone URL | `https://x-access-token:${BBVINET_PAT}@github.com/bbvinet/psc_releases_cap_sre-aut-controller.git` |
| Default branch | `main` |
| Role | Manifesto K8s — Deployment, Service, Ingress, RBAC, Secrets |
| Gerenciado por | ArgoCD (observa este repo, aplica mudanças no cluster) |

### Arquivo crítico neste repo

| Path | O que faz |
|------|-----------|
| `releases/openshift/hml/deploy/values.yaml` | Values do Helm com **image tag** que ArgoCD lê |

### Linha que muda em cada deploy

```yaml
# releases/openshift/hml/deploy/values.yaml — linha ~128
image: docker.binarios.intranet.bb.com.br/bb/psc/psc-sre-automacao-controller:3.9.2
```

Você só muda o número da tag (ex: `3.9.1` → `3.9.2`). O resto fica igual.

## Repo 5 — Source Code do Agent (paralelo ao controller)

Para referência — funciona da mesma forma que o controller:

| Campo | Valor |
|-------|-------|
| URL | https://github.com/bbvinet/psc-sre-automacao-agent |
| CAP URL | https://github.com/bbvinet/psc_releases_cap_sre-aut-agent |
| Image | `docker.binarios.intranet.bb.com.br/bb/psc/psc-sre-automacao-agent` |
| Default branch | `main` |
| Versão atual | `2.4.4` |

## Repo 6 — Autopilot (seu control plane)

| Campo | Valor |
|-------|-------|
| URL | https://github.com/lucassfreiree3-maker/autopilot |
| Role | Control plane onde você documenta, orquestra e mantém estado |
| Branches especiais | `main` (código/docs), `autopilot-state` (runtime state) |
| Feature branches | `claude/<descritivo>` |

### Arquivos do autopilot que refletem o deploy

| Path | Atualizar quando? |
|------|------------------|
| `references/controller-cap/values.yaml` | Sempre espelhar o CAP atual (mesmo tag) |
| `contracts/claude-session-memory.json` | Atualizar `currentState.controllerVersion` após cada deploy |
| `CLAUDE.md` (seção "Controller CAP") | Atualizar "Current deployed tag" após cada deploy |
| `ops/docs/manual-direct-deploy/13-full-example.md` | Adicionar entry com cada deploy significativo |

## Cluster K8S (destino final)

| Campo | Valor |
|-------|-------|
| Nome | `k8shmlbb111b` (HML) |
| Host público do controller | `sre-aut-controller.psc.k8shmlbb111b.bb.com.br` |
| Namespace do controller (runtime) | `psc-agent` (nome histórico, abriga o controller) |
| ArgoCD sync | automático, detecta push no CAP repo em ~2-5 min |

## Matriz Resumo — O que mexer quando

| Mudança no controller | Repos afetados |
|-----------------------|----------------|
| Só bump de versão (smoke test) | 1 (source) + 2 (CI roda) + 4 (CAP) + 6 (autopilot docs) |
| Fix de código + bump | 1 (source + patch) + 2 (CI) + 4 (CAP) + 6 (autopilot) |
| Deploy do agent | 5 (agent source) + agent CAP + 6 (autopilot) |
| Rollback (sem republicar) | Apenas 4 (CAP) + 6 (autopilot) — voltar tag pro anterior |

---

Próximo: [03-version-locations.md](03-version-locations.md) — os 4 lugares EXATOS onde a versão vive
