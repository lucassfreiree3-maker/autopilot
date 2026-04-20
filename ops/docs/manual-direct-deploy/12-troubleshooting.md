# 12 — Troubleshooting — Erros Conhecidos

> Tabela de referência com erros reais vistos em deploys passados e como
> resolver cada um rapidamente.

## Erros de Autenticação

### `fatal: Authentication failed for ...`

**Sintoma**: `git push` ou `git clone` pede credencial ou retorna 401/403.

**Causas**:
1. Token expirou (classic: 90 dias típicos)
2. Token revogado
3. Token fine-grained sem permissão no repo (admin da org não aprovou)
4. Variável `$BBVINET_PAT` não está setada no shell

**Debug**:
```bash
echo "${BBVINET_PAT:0:10}..."   # tem que mostrar "ghp_xxxx..."
curl -s -H "Authorization: token ${BBVINET_PAT}" https://api.github.com/user | grep login
```

**Fix**: Re-emitir token em https://github.com/settings/tokens e atualizar env var.

---

### `remote: Permission to ... denied`

**Sintoma**: `git push` retorna 403 mesmo com token válido.

**Causa**: Token é fine-grained e não tem `Contents: Write` ou `Pull requests: Write`.

**Fix**: Editar token e adicionar permissões faltantes (ou voltar pra classic).

---

## Erros no Version Bump

### `npm error notarget No matching version found for <pacote>@X.Y.Z`

**Sintoma**: esteira falha em `npm ci` com erro tipo:
```
npm error notarget No matching version found for ci-info@3.9.1.
```

**Causa**: bump com `sed -g` corrompeu a versão de um pacote terceiro em `package-lock.json`. Aconteceu em 2026-04-15 no deploy v3.9.1.

**Fix**:
1. Abrir `package-lock.json` no repo corporativo
2. Localizar o pacote (ex: `ci-info`) e restaurar a versão correta consultando npm:
   ```bash
   npm view ci-info versions --json | python3 -c "import sys,json; print(json.load(sys.stdin)[-5:])"
   # ver qual versão realmente existe
   ```
3. Abrir PR de correção só com a linha revertida
4. Para futuros bumps: **sempre** usar script Python line-targeted ([05-version-bump.md](05-version-bump.md))

**Prevenção**: jamais usar `sed -g` em package-lock.json.

---

### `Tag X.Y.Z already exists`

**Sintoma**: esteira falha no step de push Docker image com mensagem tipo "tag already exists in registry".

**Causa**: você está tentando reusar uma versão já publicada.

**Fix**: bumpar pra próxima versão (ex: `3.9.2` → `3.9.3`) e re-deployar.

---

### Diff do bump mostra mudanças em node_modules/

**Sintoma**: depois de rodar o bump, `git diff --stat` mostra mais de `4 insertions(+), 4 deletions(-)`.

**Causa**: sed ou substituição global acidentalmente casou dentro de entradas de `node_modules/*`.

**Fix**:
```bash
git checkout -- .   # descartar bump
# refazer com abordagem line-targeted
```

---

## Erros de Compilação/Lint

### `error TS<número>: <mensagem>`

**Sintoma**: step `tsc --noEmit` da esteira falha.

**Causas comuns**:
- Tipagem incorreta (ex: passou `string` onde espera `number`)
- Import faltando
- Uso de API que não existe no tipo

**Fix**: baixar logs, identificar arquivo:linha, corrigir localmente, recommit, novo PR.

---

### `Unexpected use of ForOfStatement`

**Sintoma**: step `eslint` falha com:
```
src/controllers/X.ts:42:5  error  Unexpected use of ForOfStatement  no-restricted-syntax
```

**Causa**: o codebase proíbe `for...of` via regra ESLint `no-restricted-syntax`.

**Fix**: substituir por método funcional:

```typescript
// ANTES
for (const item of list) {
  doSomething(item);
}

// DEPOIS (escolher conforme intenção)
list.forEach((item) => doSomething(item));
list.map((item) => transform(item));
const found = list.find((item) => item.id === targetId);
const all = list.reduce((acc, item) => acc + item.value, 0);
```

**Nota histórica**: caiu em 2026-03-31 (v3.7.2), 2026-04-15 (v3.9.1).

---

### `Expected a function declaration`, `use-before-define`

**Sintoma**: eslint/tsc reclama que função está sendo usada antes da declaração.

**Fix**: mover declarações de função para **antes** do primeiro uso, ou transformar em `function declaration` (hoisted) se possível.

---

## Erros de Teste

### `TypeError: res.setHeader is not a function`

**Sintoma**: teste Jest falha quando middleware tenta chamar `res.setHeader`.

**Causa**: `MockResponse` do teste não tem `setHeader`.

**Fix**: adicionar `setHeader: jest.fn()` no mock:

```typescript
type MockResponse = {
  status: jest.Mock;
  json: jest.Mock;
  setHeader: jest.Mock;   // ADICIONAR
};

function createMockResponse(): MockResponse {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),   // ADICIONAR
  };
}
```

**Histórico**: caiu em 2026-04-15 no v3.8.9 (middleware de deprecation headers).

---

### `Test Suites: X failed, Y passed`

**Sintoma**: jest falha em testes existentes após sua mudança.

**Fix**: baixar logs, identificar teste, reproduzir localmente:

```bash
cd /tmp/corp-controller
npm ci
npm test -- --testPathPattern=<arquivo-do-teste>
```

Ajustar mocks/assertions conforme a mudança.

---

## Erros de PR/Merge

### `Pull Request is not mergeable` (HTTP 405)

**Causas possíveis**:
1. Conflito com base (`mergeable_state = dirty`)
2. Check obrigatório falhou (`mergeable_state = blocked`)
3. PR é draft

**Fix por caso**:

**Dirty**:
```bash
cd /tmp/corp-controller
git checkout bump/3.9.2
git fetch origin main
git rebase origin/main
# resolver conflitos
git push --force-with-lease
```

**Blocked**: esperar CI passar ou pedir review.

**Draft**:
```bash
curl -s -X PATCH \
  -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/bbvinet/psc-sre-automacao-controller/pulls/${PR_NUMBER}" \
  -d '{"draft": false}'
```

---

### `Head branch was modified` (HTTP 422) ao fazer merge

**Sintoma**: `PUT .../merge` retorna:
```
Head branch was modified. Review and try the merge again.
```

**Causa**: Alguém pushou na branch feature depois que você confirmou o PR.

**Fix**: simplesmente re-chamar o endpoint de merge. Se estiver OK, vai passar.
Se persistir, verificar `mergeable_state`.

---

### PR criado mas `mergeable_state = unknown` por muito tempo

**Causa**: GitHub está calculando (CI longo, repo grande).

**Fix**: aguardar com until-loop ([07-pull-request-api.md](07-pull-request-api.md)).

---

## Erros de CI/Esteira

### Run fica `queued` indefinidamente

**Causa**: Runner corporativo indisponível ou fila longa.

**Fix**:
1. Verificar dashboard de runners (se houver)
2. Contatar time de plataforma
3. Considerar cancelar e re-rodar em horário menos congestionado

```bash
curl -s -X POST \
  -H "Authorization: token ${BBVINET_PAT}" \
  "https://api.github.com/repos/bbvinet/psc-sre-automacao-controller/actions/runs/${RUN_ID}/cancel"
```

---

### `action_required` na conclusion

**Causa**: Workflow requer aprovação manual (Branch Protection / Deployment Environment).

**Fix**: Abrir a URL do run no navegador e aprovar.

---

### SonarQube/Checkmarx `new issues`

**Causa**: seu código introduziu hit de qualidade/segurança.

**Fix**: ler relatório na aba "Code scanning" do GitHub, ou direto no Sonar/Checkmarx. Ajustar código. Re-deployar.

---

## Erros de CAP/ArgoCD

### Pod `ImagePullBackOff` após promoção CAP

**Sintoma**:
```
NAME                              READY   STATUS             RESTARTS   AGE
psc-sre-automacao-controller-xyz   0/1     ImagePullBackOff   0          3m
```

**Causas**:
1. Imagem não foi publicada (esteira não chegou ao step de CD)
2. Tag no values.yaml está errada (typo)
3. Registry inacessível do cluster (rede/auth)

**Fix**:
1. Verificar esteira: `completed / success` com step de push de imagem OK
2. Verificar values.yaml:
   ```bash
   curl -s -H "Authorization: token ${BBVINET_PAT}" \
     "https://api.github.com/repos/bbvinet/psc_releases_cap_sre-aut-controller/contents/releases/openshift/hml/deploy/values.yaml" \
     | python3 -c "import sys,json,base64; [print(l) for l in base64.b64decode(json.load(sys.stdin)['content']).decode().splitlines() if 'image:' in l]"
   ```
3. Se tag correta e imagem existe: contatar time de plataforma (problema de imagePullSecret no namespace)

---

### ArgoCD `OutOfSync` mas não sincroniza

**Causa**: Sync Policy Manual ou Health check falhando.

**Fix**:
- Na UI do ArgoCD, clicar em "Sync" manualmente
- Ou via CLI: `argocd app sync psc-sre-automacao-controller`

---

### `/health` ainda retorna versão antiga após 10min

**Causa**: ArgoCD não aplicou ou rollout travou.

**Fix**:
```bash
kubectl -n psc-agent rollout status deployment/psc-sre-automacao-controller
kubectl -n psc-agent describe deployment psc-sre-automacao-controller | grep -A5 "Pod Template"
```

Se aparecer `Progressing: False`, rollout parado — investigar.

---

## Erros de Rate Limit

### `API rate limit exceeded`

**Sintoma**: curl retorna 403 com:
```json
{
  "message": "API rate limit exceeded for user ID ..."
}
```

**Fix**: esperar reset (max 1h) ou usar outro token temporariamente.

Ver tempo de reset:
```bash
curl -s -H "Authorization: token ${BBVINET_PAT}" https://api.github.com/rate_limit \
  | python3 -c "import sys,json,time; r=json.load(sys.stdin)['resources']['core']; print(f\"remaining={r['remaining']}, reset em {r['reset']-int(time.time())}s\")"
```

---

## Erros de Ambiente Local

### `python3: command not found`

No macOS moderno tem `python3` nativo. Em alguns containers minimais pode faltar.

**Fix**:
```bash
# macOS
brew install python3

# Linux (apt)
sudo apt install python3

# Alternativa: usar jq + bash puro
```

---

### `base64: unrecognized option '-w0'`

macOS usa BSD base64 (não tem `-w0`).

**Fix**:
```bash
# Linux (GNU coreutils)
echo "x" | base64 -w0

# macOS (BSD)
echo "x" | base64
# já é single-line por padrão
```

Nos scripts do guia, usar detector:
```bash
if base64 --help 2>&1 | grep -q -- '-w'; then
  B64="base64 -w0"
else
  B64="base64"
fi
```

---

## Checklist: antes de pedir ajuda

Se bateu em erro desconhecido, antes de abrir issue:

- [ ] Mensagem de erro completa lida (não só a 1a linha)
- [ ] Logs da esteira baixados e procurados por `error`, `FAIL`, `fatal`
- [ ] Token testado (ver passo em [01-authentication.md](01-authentication.md))
- [ ] Rate limit checado
- [ ] Versão confirmada (`grep -n version package.json`)
- [ ] `git log --oneline -3` mostra os commits esperados
- [ ] API respondendo (`curl -s https://api.github.com/user`)

---

Próximo: [13-full-example.md](13-full-example.md) — walkthrough completo do deploy 3.9.1 → 3.9.2
