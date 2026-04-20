# 06 — Commit e Push com Autenticação

> Como registrar as alterações no git local e enviar a branch ao repo corporativo
> usando o token embutido no remote URL.

## Pré-requisitos

- Estar dentro do clone do repo (`/tmp/corp-controller`)
- Estar na feature branch (ex: `bump/3.9.2`)
- Version bump já feito e validado ([05-version-bump.md](05-version-bump.md))

## Passo 1 — Revisar o que vai ser commitado

```bash
cd /tmp/corp-controller
git status --short
git diff --stat
```

Saída esperada (smoke test de versão):
```
M  package-lock.json
M  package.json
M  src/swagger/swagger.json

 package-lock.json        | 4 ++--
 package.json             | 2 +-
 src/swagger/swagger.json | 2 +-
 3 files changed, 4 insertions(+), 4 deletions(-)
```

## Passo 2 — Stage dos arquivos

Sempre nomear os arquivos explicitamente (não usar `git add .`):

```bash
git add package.json package-lock.json src/swagger/swagger.json
```

**Por que não `git add .` ou `git add -A`?**
- `.` e `-A` podem incluir arquivos acidentais (ex: `.env`, `node_modules/` se não gitignored, arquivos de editor IDE)
- Nomear explicitamente é auditável e seguro

## Passo 3 — Commit com mensagem padronizada

```bash
git commit -m "chore: bump version to 3.9.2 (pipeline smoke test)"
```

### Convenção de commit messages

| Prefixo | Quando usar | Exemplo |
|---------|-------------|---------|
| `chore` | Manutenção que não muda comportamento | `chore: bump version to 3.9.2` |
| `fix` | Correção de bug | `fix(execute): resolve agent by cluster only (v3.8.5)` |
| `feat` | Nova funcionalidade | `feat(oas): support all automations (v3.9.1)` |
| `fix(security)` | Correção de segurança | `fix(security): XSS sanitize output (v3.7.7)` |
| `docs` | Apenas documentação | `docs: add deploy guide` |
| `refactor` | Mudança de estrutura sem mudar comportamento | `refactor: extract trusted-agent helper` |
| `test` | Ajuste em testes | `test: add namespace validation cases` |

### Formato completo

```
<tipo>(<escopo opcional>): <descrição curta em minúsculo> (<vX.Y.Z>)

<corpo opcional — use para explicar o PORQUÊ da mudança>
```

### Exemplo com corpo (fix complexo)

```bash
git commit -m "$(cat <<'EOF'
fix(execute): resolve agent by cluster only (v3.8.5)

The /agent/execute and /oas/sre/execute routes were matching the
registered agent on (cluster + namespace), but the namespace in the
request payload is the TARGET namespace for the automation (injected
as NAMESPACE env var into the Job), NOT the agent's pod namespace.
This always produced 404 "Agent not registered for given cluster/
namespace".

Fix: use resolveTrustedRegisteredAgentExecuteUrlByCluster(cluster).
EOF
)"
```

**NÃO adicionar** `Co-authored-by: Claude` ou footers de máquina. O commit autor
é pego do `git config user.email` local — sua identidade real.

## Passo 4 — Verificar o commit

```bash
git log --oneline -1
```

Saída:
```
dc98449 chore: bump version to 3.9.2 (pipeline smoke test)
```

## Passo 5 — Push (já autenticado via remote URL)

```bash
git push -u origin bump/3.9.2
```

### O que acontece

O git usa a URL configurada em `.git/config`:
```
[remote "origin"]
    url = https://x-access-token:ghp_xxxxx@github.com/bbvinet/psc-sre-automacao-controller.git
```

O token embutido é enviado como Basic Auth no HTTP. Sem popup de credenciais.

### Flag `-u`

`-u` (short for `--set-upstream`) configura a branch local para rastrear
`origin/bump/3.9.2`. Depois disso, você pode usar apenas `git push` (sem args).

### Saída esperada

```
Enumerating objects: 11, done.
Counting objects: 100% (11/11), done.
Delta compression using up to 8 threads
Compressing objects: 100% (5/5), done.
Writing objects: 100% (6/6), 545 bytes | 272.00 KiB/s, done.
Total 6 (delta 5), reused 1 (delta 0), pack-reused 0 (from 0)
remote: Resolving deltas: 100% (5/5), completed with 5 local objects.
remote:
remote: Create a pull request for 'bump/3.9.2' on GitHub by visiting:
remote:      https://github.com/bbvinet/psc-sre-automacao-controller/pull/new/bump/3.9.2
remote:
To https://github.com/bbvinet/psc-sre-automacao-controller.git
 * [new branch]      bump/3.9.2 -> bump/3.9.2
branch 'bump/3.9.2' set up to track 'origin/bump/3.9.2'.
```

## Passo 6 — Confirmar que o push chegou

### Via GitHub API

```bash
curl -s -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/bbvinet/psc-sre-automacao-controller/branches/bump/3.9.2" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('branch:', d.get('name','FAIL'), '| sha:', d.get('commit',{}).get('sha','FAIL')[:10])"
```

Saída esperada:
```
branch: bump/3.9.2 | sha: dc98449f2a
```

### Via navegador

https://github.com/bbvinet/psc-sre-automacao-controller/tree/bump/3.9.2

## Troubleshooting

### Erro: `remote: Permission to ... denied`

Token sem permissão de push. Causas comuns:
1. Token é read-only
2. Token é fine-grained e não tem `Contents: Write`
3. Token expirou
4. Token não foi aprovado pelo admin da org (fine-grained)

Testar:
```bash
curl -s -X POST -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/bbvinet/psc-sre-automacao-controller/git/refs" \
  -d '{"ref":"refs/heads/test-permission","sha":"<sha-qualquer>"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message','OK'))"
```

### Erro: `rejected non-fast-forward`

Branch remoto avançou. Você tem 2 opções:

```bash
# Opção 1: rebase (limpa, preferida)
git pull --rebase origin bump/3.9.2
git push

# Opção 2: force push (só se você tem certeza)
git push --force-with-lease origin bump/3.9.2
```

**NUNCA** usar `--force` sem `--force-with-lease`. A flag `--force-with-lease`
protege contra overwrite de trabalho de colega.

### Erro: `failed to push some refs to 'https://...' The requested URL returned error: 403`

Igual ao primeiro caso — token sem permissão. Checar:
```bash
git remote -v  # confirmar URL correta
echo "${BBVINET_PAT:0:10}..."  # token está setado?
```

### Erro: `fatal: unable to access '...': SSL certificate problem`

Em rede corporativa com proxy:
```bash
git config --global http.sslVerify false  # TEMPORÁRIO — revogar depois
# ou configurar certificado:
git config --global http.sslCAInfo /path/to/corporate-ca.pem
```

## Checklist Final deste Passo

- [ ] `git status` mostra árvore limpa após commit
- [ ] `git log --oneline -1` mostra o commit criado
- [ ] `git push -u origin <branch>` concluiu sem erro
- [ ] Branch visível no GitHub via API ou navegador
- [ ] SHA do HEAD local == SHA do remote (checar com `git rev-parse HEAD` vs API)

---

Próximo: [07-pull-request-api.md](07-pull-request-api.md) — criar PR via curl
