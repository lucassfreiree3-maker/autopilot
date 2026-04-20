# 01 — Autenticação

> Todo o fluxo usa **um único Personal Access Token (PAT) corporativo** para
> autenticar tanto no git push quanto nas chamadas à GitHub REST API.
> Aqui está exatamente como obtê-lo, configurá-lo e usá-lo com segurança.

## 1. O Token

### Identificação

| Campo | Valor |
|-------|-------|
| Tipo | GitHub Personal Access Token (classic ou fine-grained) |
| Organização | `bbvinet` |
| Nome interno no autopilot | `BBVINET_TOKEN` |
| Nome recomendado como env var local | `BBVINET_PAT` |
| Scopes obrigatórios (classic) | `repo` (full control private repositories), `workflow` (opcional, se precisar editar workflows) |
| Scopes obrigatórios (fine-grained) | `Contents: Read and write`, `Pull requests: Read and write`, `Actions: Read`, `Metadata: Read` |
| Validade típica | 90 dias (renovar) |

### Repos que o token precisa acessar

- `bbvinet/psc-sre-automacao-controller`
- `bbvinet/psc-sre-automacao-agent`
- `bbvinet/psc_releases_cap_sre-aut-controller`
- `bbvinet/psc_releases_cap_sre-aut-agent`

## 2. Como obter o token

1. Acessar https://github.com/settings/tokens (classic) ou https://github.com/settings/personal-access-tokens/new (fine-grained)
2. Classic:
   - **Note**: `bbvinet-deploy-<YOUR-USER>`
   - **Expiration**: 90 days
   - **Scopes**: marcar `repo` inteiro e `workflow`
3. Fine-grained (recomendado para produção):
   - **Resource owner**: `bbvinet` (precisa aprovação de admin da org)
   - **Repository access**: selecionar os 4 repos acima
   - **Permissions**:
     - `Contents`: Read and write
     - `Pull requests`: Read and write
     - `Actions`: Read
     - `Metadata`: Read (auto)
4. Clicar **Generate token** e copiar o valor `ghp_...` ou `github_pat_...` — só aparece uma vez
5. Para fine-grained da org `bbvinet`: admin da org precisa **aprovar** o pedido na aba Settings → Personal access tokens → Pending requests

## 3. Configuração local (máquina pessoal)

### Opção A: Variável de ambiente no shell (recomendada)

Adicionar ao `~/.zshrc` ou `~/.bashrc`:

```bash
# Token corporativo bbvinet — NÃO COMMITAR
export BBVINET_PAT="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

Depois:

```bash
source ~/.zshrc   # ou ~/.bashrc
echo "$BBVINET_PAT" | head -c 10  # deve imprimir ghp_xxxxxx (teste)
```

### Opção B: macOS Keychain

```bash
security add-generic-password -a "$USER" -s "bbvinet-pat" -w "ghp_xxxx"
# Recuperar depois:
export BBVINET_PAT=$(security find-generic-password -a "$USER" -s "bbvinet-pat" -w)
```

### Opção C: 1Password CLI

```bash
export BBVINET_PAT=$(op read "op://Private/bbvinet-pat/credential")
```

### Opção D: Git credential helper (menos granular)

```bash
git config --global credential.helper store
echo "https://x-access-token:ghp_xxxx@github.com" >> ~/.git-credentials
chmod 600 ~/.git-credentials
```

## 4. Formato do remote URL com token embutido

Para clonar ou configurar remote em repos bbvinet:

```bash
# Formato
https://x-access-token:${BBVINET_PAT}@github.com/bbvinet/<repo-name>.git

# Exemplo prático
git clone "https://x-access-token:${BBVINET_PAT}@github.com/bbvinet/psc-sre-automacao-controller.git" /tmp/corp-controller
```

**Por que `x-access-token:<TOKEN>` ao invés de só `<TOKEN>@`?**
- GitHub aceita qualquer string como username quando o password é um PAT
- `x-access-token` é a convenção oficial (GitHub App tokens, bots) e não vaza o usuário real do dono do token nos logs
- Com `<TOKEN>@github.com` (sem user), alguns clientes git registram o token como username nos logs

### Verificar o remote configurado

```bash
cd /tmp/corp-controller
git remote -v
# Deve mostrar:
# origin  https://x-access-token:ghp_xxxx@github.com/bbvinet/psc-sre-automacao-controller.git (fetch)
# origin  https://x-access-token:ghp_xxxx@github.com/bbvinet/psc-sre-automacao-controller.git (push)
```

## 5. Autenticação nas chamadas HTTP (curl)

Todas as chamadas à GitHub REST API usam o header `Authorization: token <PAT>`:

```bash
curl -s \
  -H "Authorization: token ${BBVINET_PAT}" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/bbvinet/psc-sre-automacao-controller
```

**Headers usados em todas as chamadas:**
- `Authorization: token <PAT>` — autenticação
- `Accept: application/vnd.github.v3+json` — força versão 3 da API e JSON de resposta

**Métodos usados neste fluxo:**
- `GET` — listar, ler conteúdo, ler status
- `POST` — criar PR
- `PUT` — atualizar arquivo (Contents API) OU fazer merge de PR

## 6. Segurança

### Regras obrigatórias

1. **NUNCA** commitar o token em nenhum arquivo — nem em `.env`, nem em script, nem em `.git/config` versionado
2. **NUNCA** incluir o token em logs, screenshots ou mensagens de erro compartilhadas
3. **NUNCA** passar o token como argumento de comando (fica no histórico do shell e em `/proc/*/cmdline`)
4. **SEMPRE** usar env var e recuperar com `${BBVINET_PAT}` (expansão do shell)
5. **ROTACIONAR** o token a cada 90 dias ou imediatamente se houver suspeita de vazamento
6. **REVOGAR** tokens antigos em https://github.com/settings/tokens após rotação

### Se o token vazar

1. Ir em https://github.com/settings/tokens
2. Clicar no token comprometido → **Revoke**
3. Gerar novo token com escopos mínimos
4. Atualizar env var local
5. Auditar histórico de commits/PRs dos últimos N dias no GitHub: https://github.com/bbvinet/psc-sre-automacao-controller/activity

### .gitignore recomendado (na home do user)

```
.env
.env.*
*.pem
credentials.json
.bbvinet-pat
```

## 7. Testar a autenticação

### Teste 1: API responde

```bash
curl -s -H "Authorization: token ${BBVINET_PAT}" https://api.github.com/user | python3 -c "import sys,json; d=json.load(sys.stdin); print('user:', d.get('login','FAIL'))"
```

Saída esperada: `user: <seu-usuario-github>`

### Teste 2: Acesso ao repo controller

```bash
curl -s -H "Authorization: token ${BBVINET_PAT}" \
  https://api.github.com/repos/bbvinet/psc-sre-automacao-controller \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('repo:', d.get('full_name','FAIL'), '| default:', d.get('default_branch','?'))"
```

Saída esperada: `repo: bbvinet/psc-sre-automacao-controller | default: main`

### Teste 3: Permissão de push (dry-run via GET de /actions/runs)

```bash
curl -s -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/bbvinet/psc-sre-automacao-controller/actions/runs?per_page=1" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('runs visible:', d.get('total_count','0'))"
```

Se retornar um número > 0, você tem acesso de leitura em Actions (necessário pra monitorar esteira).

## 8. Rate limit

A GitHub API tem limite de **5000 requests/hora por token autenticado**. Para monitorar:

```bash
curl -s -H "Authorization: token ${BBVINET_PAT}" https://api.github.com/rate_limit \
  | python3 -c "import sys,json; d=json.load(sys.stdin)['resources']['core']; print(f\"remaining={d['remaining']}/{d['limit']} | reset={d['reset']}\")"
```

Polling a cada 60s por 15 min gasta ~15 requests — muito longe do limite.

---

Próximo: [02-repositories.md](02-repositories.md) — os repos envolvidos no deploy
