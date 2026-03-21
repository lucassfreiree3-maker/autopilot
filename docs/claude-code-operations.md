# Claude Code — Guia Operacional BBDevOpsAutopilot

> **Aplica-se a: Claude Code (CLI e Web)**
> Referência completa para operar o autopilot usando Claude Code.
> Leitura obrigatória antes de qualquer sessão operacional.

---

## 1. Visão Geral

Claude Code é o agente CLI/Web da Anthropic com acesso completo ao filesystem, git e APIs.
No contexto do BBDevOpsAutopilot, Claude Code atua como engenheiro SRE executor — inspeciona, age, valida e resume.

### Capacidades no autopilot

| Capacidade | Como |
|---|---|
| Clonar e gerenciar repositórios | `git clone`, `git pull`, `git push` via workspace |
| Criar, editar e commitar arquivos | Ferramentas nativas Read/Edit/Write + git |
| Monitorar CI/CD | MCP server GitHub ou `gh` CLI |
| Coordenar com outros agentes | `state/agent-tasks.json` (protocolo multi-agente) |
| Release automation | Scripts do autopilot (`*-release-autopilot.ps1`) |

---

## 2. Acesso ao GitHub

Claude Code usa o **MCP server** (`@modelcontextprotocol/server-github`) para interagir com o GitHub.

- **Token**: gerenciado internamente pelo MCP server — Claude **nunca** vê o token bruto
- **Config**: `~/.claude/settings.json` → `mcpServers.github`
- **Servidor local**: `<SAFE_ROOT>\..\bin\srv.ps1`

### Ferramentas MCP disponíveis

| Ferramenta | Uso |
|---|---|
| `get_file_contents` | Ler arquivos do repositório remoto |
| `create_or_update_file` | Criar/atualizar arquivos via API |
| `create_pull_request` | Criar PRs programaticamente |
| `list_workflow_runs` | Listar runs do GitHub Actions |
| `get_job_for_workflow_run` | Detalhes de jobs de CI |

### Alternativa: gh CLI

Quando o MCP server não estiver disponível, usar `gh` CLI:

```bash
gh run list --repo owner/repo --limit 5
gh run view $runId --repo owner/repo
gh api repos/owner/repo/contents/path/to/file
```

---

## 3. Autenticação e Push

### Regras fundamentais

1. **NUNCA** segurar token bruto em variável de script
2. **NUNCA** usar `-c http.*.extraheader=AUTHORIZATION:...` como argumento git
3. **SEMPRE** usar push wrappers ou `GIT_CONFIG_*` env vars

### Push wrappers disponíveis

| Wrapper | Projeto |
|---|---|
| `push-controller-main.cmd` | Controller source → `main` |
| `push-deploy-controller-hml.cmd` | Controller deploy → `cloud/staging` |
| `push-agent-main.cmd` | Agent source → `main` |
| `push-deploy-agent-hml.cmd` | Agent deploy → `cloud/staging` |
| `push-cap-agent-main.cmd` | CAP mirror → `main` |
| `push-github-with-token.ps1` | Wrapper genérico |

### Push no repositório pessoal (autopilot)

O repositório pessoal `https://github.com/lucassfreiree/autopilot/` é o produto.
Push direto via `git push` é permitido quando autenticado via `gh auth` ou MCP.

---

## 4. Protocolo Multi-Agente (Claude Code)

Antes de qualquer ação nos repositórios gerenciados, seguir o protocolo completo em `docs/agent-coordination-protocol.md`.

### Resumo do fluxo

```
1. Ler state/agent-tasks.json
2. Verificar activeTasks (claim ativo de outro agente?)
3. Verificar recentCompleted (tarefa já feita?)
4. Fazer claim da tarefa
5. Executar trabalho
6. Atualizar agent-tasks.json ao concluir
```

### Identificação do agente

Usar `"claimedBy": "claude-code"` em todos os claims e completions.

---

## 5. Ordem de Leitura ao Iniciar Sessão

Ao iniciar uma nova sessão Claude Code no autopilot:

```
1. CLAUDE.md                              → Instruções do agente
2. ai-sync/rules.md                       → Regras compartilhadas
3. docs/agent-coordination-protocol.md    → Protocolo multi-agente
4. docs/agent-shared-learnings.md         → Aprendizados compartilhados
5. docs/claude-code-operations.md         → Este guia (referência)
6. docs/github-api-integration.md         → API GitHub (se necessário)
```

---

## 6. Fluxo de Release — Controller

```
1. Ler state/agent-tasks.json (verificar conflitos)
2. Fazer claim da tarefa
3. git pull origin main no clone local (repos/your-controller)
4. Editar código conforme solicitado
5. Bump de versão em package.json, package-lock.json, swagger.json
6. git add + git commit
7. Push via push-controller-main.cmd
8. Monitorar CI via MCP (list_workflow_runs → aguardar conclusion: success)
9. Promover tag em deploy repo (values.yaml no cloud/staging)
10. Push deploy via push-deploy-controller-hml.cmd
11. Atualizar agent-tasks.json (release da tarefa)
```

### Regras de versionamento

- Verificar `currentVersion` em `agent-tasks.json` e `package.json`
- Primeiro commit do ciclo: bump patch (ex: `3.4.0` → `3.4.1`)
- Commits corretivos no mesmo ciclo: **não** bump novamente
- `package-lock.json`: usar JSON estruturado, nunca regex global
- `swagger.json`: campo `"version":  "X.Y.Z"` com **dois espaços**

---

## 7. Fluxo de Release — Agent

```
1. Ler state/agent-project-tasks.json (verificar conflitos)
2. Fazer claim da tarefa
3. git pull origin main no clone local (repos/your-agent)
4. Editar código
5. Bump de versão
6. git add + git commit
7. Push via push-agent-main.cmd
8. Monitorar CI (GitHub Actions)
9. Promover tag em deploy-your-agent (values.yaml no cloud/staging)
10. Espelhar versão em cap-releases (values.yaml no main)
11. Push via push-deploy-agent-hml.cmd e push-cap-agent-main.cmd
12. Atualizar agent-project-tasks.json
```

---

## 8. Arquivos Sensíveis — Regras Específicas

| Arquivo | Regra |
|---|---|
| `static/swagger-helmfire.css` / `.js` | **DELETADOS** — não recriar |
| `src/swagger/swagger.json` | UTF-8 puro, sem U+FFFD, dois espaços antes do valor da versão |
| `package-lock.json` | JSON estruturado, atualizar apenas root e `packages[""]` |
| `secrets/*` | Nunca ler, imprimir ou modificar automaticamente |
| `.env` / `.env.*` | Nunca acessar sem justificativa explícita |

---

## 9. Segurança e Compliance

Checklist obrigatório para cada implementação:

```
[ ] Sem DPAPI ou Credential Manager
[ ] Tokens via Device Flow, in-memory only
[ ] git auth via GIT_CONFIG_* env vars (não -c args)
[ ] Sem runtime npx/npm downloads para tools pré-instaladas
[ ] Nomes de arquivo/diretório: sem nomes de ferramentas AI
[ ] Projeto dentro do diretório hidden .ops
[ ] Sem dados corporativos no push ao repo pessoal
```

---

## 10. Economia de Tokens

Claude Code deve minimizar consumo de tokens:

- **Lazy loading**: carregar docs sob demanda, não todos de uma vez
- **Respostas concisas**: liderar com ação, não explicação
- **Evitar re-leitura**: manter contexto relevante, não reler arquivos já processados
- **Paralelizar**: usar chamadas paralelas quando possível

---

## 11. Diferenças entre Claude Code CLI e Web

| Aspecto | CLI | Web |
|---|---|---|
| Ambiente | Terminal local (PowerShell/bash) | Browser em claude.ai/code |
| Filesystem | Acesso direto ao filesystem local | Acesso ao workspace do projeto |
| Git | Comandos git nativos | Comandos git via sandbox |
| MCP | Config via `~/.claude/settings.json` | Configurado no projeto |
| Ideal para | Sessões longas, automação pesada | Setup rápido, edições pontuais |

---

## 12. Troubleshooting

### MCP server não responde
1. Verificar se `srv.ps1` está rodando
2. Verificar config em `~/.claude/settings.json`
3. Fallback: usar `gh` CLI diretamente

### Push rejeitado (non-fast-forward)
1. `git fetch origin main`
2. Inspecionar commits: `git log HEAD..origin/main --oneline`
3. Se mesma tarefa: `git reset --hard origin/main` (não pushar)
4. Se tarefa diferente: `git rebase origin/main`, resolver conflitos, pushar
5. **Nunca** usar `--force` em `main`

### CI falhou
1. Verificar logs: `gh run view $runId --repo owner/repo --log-failed`
2. Ou via MCP: `get_job_for_workflow_run`
3. Corrigir localmente, commit corretivo (sem re-bump de versão)
4. Push novamente via wrapper

---

## 13. Comandos Úteis de Referência Rápida

```bash
# Status do autopilot
validate-autopilot.cmd

# Bootstrap completo
bootstrap-controller-release-flow.cmd

# Smoke test (dry-run)
run-controller-release-smoke-test.cmd

# Preflight CI local
preflight-controller-ci.cmd

# Export docs bundle
export-docs-bundle.cmd

# Backup manual
backup-now.cmd

# Eficiência e cleanup
autopilot-efficiency.cmd
```

---

## Referências

- Regras compartilhadas: `ai-sync/rules.md`
- Protocolo multi-agente: `docs/agent-coordination-protocol.md`
- Aprendizados: `docs/agent-shared-learnings.md`
- API GitHub: `docs/github-api-integration.md`
- Flow overview: `docs/flow-overview.md`
- README: `README.md`
