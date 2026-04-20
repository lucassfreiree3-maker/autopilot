# 04 — Clone do Repo Corporativo e Criação da Branch

> Como clonar o repo com token embutido, sincronizar com main, e criar uma
> feature branch para o deploy.

## Pré-requisito

- `$BBVINET_PAT` exportado como env var (ver [01-authentication.md](01-authentication.md))
- `git` instalado (qualquer versão ≥ 2.28)
- Rede aberta para https://github.com

## Passo 1 — Decidir onde clonar

Recomendação: `/tmp/corp-controller` (fora do path do autopilot, evita confusão).

```bash
CLONE_DIR="${CLONE_DIR:-/tmp/corp-controller}"
```

Por que `/tmp`? É limpo a cada reboot e deixa claro que é um espaço de trabalho efêmero.

## Passo 2 — Clonar (primeira vez)

```bash
git clone \
  "https://x-access-token:${BBVINET_PAT}@github.com/bbvinet/psc-sre-automacao-controller.git" \
  "${CLONE_DIR}"
```

**Importante**:
- O token fica gravado no `.git/config` do clone local, em `remote.origin.url`
- Isso permite push sem pedir credenciais — **não commitar esse diretório em lugar nenhum**
- Se preferir token fora do URL: use `git config credential.helper` em vez disso

### Verificar o clone

```bash
cd "${CLONE_DIR}"
git log --oneline -3
```

Saída esperada (exemplo):
```
2ad1ae8 feat(oas): support all automations + fix lint/lock (v3.9.1) (#25)
5ebb7b8 fix(lock): restore ci-info version to 3.9.0 (v3.9.1) (#24)
fe27fa8 Alteração automática de arquivo executada pela action aic-action-commit
```

## Passo 3 — Sincronizar com main (se já clonado antes)

Se já clonou antes, sincronize antes de criar a branch:

```bash
cd "${CLONE_DIR}"
git checkout main
git fetch origin main
git reset --hard origin/main
```

**Por que `reset --hard`?**
O commit `aic-action-commit` (automação interna) frequentemente recompleta o lockfile/changelog na main — `git pull` pode gerar conflitos. `reset --hard` garante estado idêntico ao remote.

## Passo 4 — Descobrir a versão atual

```bash
CURRENT_VERSION=$(grep -m1 '"version"' package.json | python3 -c "import sys,re; print(re.search(r'\"version\":\s*\"([^\"]+)\"', sys.stdin.read()).group(1))")
echo "Current version: $CURRENT_VERSION"
# Output: Current version: 3.9.1
```

Ou via GitHub API (não precisa de clone):
```bash
curl -s -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/bbvinet/psc-sre-automacao-controller/contents/package.json" \
  | python3 -c "import sys,json,base64,re; c=base64.b64decode(json.load(sys.stdin)['content']).decode(); print(re.search(r'\"version\":\s*\"([^\"]+)\"', c).group(1))"
```

## Passo 5 — Decidir a nova versão

Regras:
- Patch bump (`X.Y.Z` → `X.Y.Z+1`) para smoke test, fix trivial
- Quando `Z=9`, subir minor e resetar patch: `3.9.9` → `3.10.0`
- NÃO repetir versão já publicada

```bash
NEW_VERSION="3.9.2"   # ajuste conforme decisão
```

## Passo 6 — Criar a feature branch

Convenção de nomes:

| Tipo | Prefixo | Exemplo |
|------|---------|---------|
| Bump simples / smoke test | `bump/` | `bump/3.9.2` |
| Feature / funcionalidade | `feat/` | `feat/oas-all-automations` |
| Bugfix | `fix/` | `fix/execute-404` |
| Chore (limpeza) | `chore/` | `chore/remove-unused-routes` |
| Segurança | `sec/` | `sec/xss-sanitize-output` |

Criação:

```bash
git checkout -b "bump/${NEW_VERSION}"
```

Verificar:

```bash
git branch --show-current
# Output: bump/3.9.2
```

## Passo 7 — Resumo dos comandos em um bloco

```bash
# Variáveis
export BBVINET_PAT="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
CLONE_DIR="/tmp/corp-controller"
NEW_VERSION="3.9.2"
BRANCH="bump/${NEW_VERSION}"

# Se ainda não clonou:
if [ ! -d "${CLONE_DIR}" ]; then
  git clone "https://x-access-token:${BBVINET_PAT}@github.com/bbvinet/psc-sre-automacao-controller.git" "${CLONE_DIR}"
fi

cd "${CLONE_DIR}"
git checkout main
git fetch origin main
git reset --hard origin/main

# Descobrir versão atual e confirmar que NEW_VERSION é maior
CURRENT=$(grep -m1 '"version"' package.json | python3 -c "import sys,re; print(re.search(r'\"version\":\s*\"([^\"]+)\"', sys.stdin.read()).group(1))")
echo "Current: $CURRENT | New: $NEW_VERSION"

# Criar branch
git checkout -b "${BRANCH}"

# Confirmar
git branch --show-current
git log --oneline -1
```

## Troubleshooting

### Erro: `fatal: Authentication failed`

O token é inválido, expirou ou não tem permissão no repo.

```bash
# Teste a authorization:
curl -s -H "Authorization: token ${BBVINET_PAT}" https://api.github.com/user | grep login
# Teste acesso ao repo:
curl -s -H "Authorization: token ${BBVINET_PAT}" https://api.github.com/repos/bbvinet/psc-sre-automacao-controller | grep full_name
```

Se o primeiro funciona e o segundo não → token não tem acesso ao repo da org `bbvinet` (precisa ser aprovado pelo admin).

### Erro: `error: pathspec 'main' did not match any file(s) known to git`

Clone foi mal feito. Deletar e refazer:

```bash
rm -rf /tmp/corp-controller
# executar clone novamente
```

### Erro: `Your branch and 'origin/main' have diverged`

Alguma coisa local divergiu da remote (ex: commit local sem push, rebase mal feito).

```bash
git fetch origin main
git reset --hard origin/main
```

### Erro: branch `bump/3.9.2` já existe localmente

```bash
git branch -D bump/3.9.2   # deletar local
git push origin --delete bump/3.9.2   # deletar remote (CUIDADO)
# depois recriar
git checkout -b bump/3.9.2
```

---

Próximo: [05-version-bump.md](05-version-bump.md) — fazer o bump nos 4 lugares com segurança
