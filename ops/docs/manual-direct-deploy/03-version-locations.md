# 03 — Os 4 Lugares Onde a Versão Vive

> Todo deploy precisa sincronizar a versão nos 4 pontos abaixo. Se qualquer um
> ficar dessincronizado, o CI falha ou a imagem publica com versão errada.

## Tabela dos 4 lugares (controller)

| # | Arquivo | Linha | Campo | Formato |
|---|---------|-------|-------|---------|
| 1 | `package.json` | 3 | `version` | `"version": "3.9.2"` |
| 2 | `package-lock.json` | 3 | top-level `version` | `"version": "3.9.2"` |
| 3 | `package-lock.json` | 9 | `packages[""].version` | `"version": "3.9.2"` |
| 4 | `src/swagger/swagger.json` | 6 | `info.version` | `"version": "3.9.2"` |

## Por que 4 e não 3?

`package-lock.json` tem **duas ocorrências** da versão do próprio pacote (topo do arquivo + dentro de `packages[""]`). As duas precisam bater senão `npm ci` reclama.

## O arquivo do CAP também muda, mas é em OUTRO repo

Não conta como "version location no repo source", mas faz parte do deploy:

| Arquivo | Repo | Linha | Campo |
|---------|------|-------|-------|
| `releases/openshift/hml/deploy/values.yaml` | `bbvinet/psc_releases_cap_sre-aut-controller` | ~128 | `image: .../controller:3.9.2` |

Este é atualizado **depois** do CI passar no repo source.

## Visualizando as 4 linhas (exemplo 3.9.2)

### 1. package.json (linha 3)

```json
{
  "name": "psc-sre-automacao-controller",
  "version": "3.9.2",
  ...
}
```

### 2-3. package-lock.json (linhas 3 e 9)

```json
{
  "name": "psc-sre-automacao-controller",
  "version": "3.9.2",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "psc-sre-automacao-controller",
      "version": "3.9.2",
      "license": "ISC",
      ...
    },
    "node_modules/@aws-crypto/crc32": {
      "version": "3.0.0",
      ...
    }
  }
}
```

**ATENÇÃO**: Observe as DEZENAS de outras linhas `"version": "X.Y.Z"` dentro de `node_modules/*` — essas são versões de pacotes terceiros (ex: `@aws-crypto/crc32@3.0.0`). **NÃO podem ser tocadas**.

### 4. src/swagger/swagger.json (linha 6)

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "PSC SRE Automacao Controller API",
    "description": "Controller...",
    "version": "3.9.2",
    ...
  }
}
```

**OBS**: No swagger tem uma segunda linha com `"version"` (tipicamente em definitions ou schemas internos). Aquela **não** deve ser tocada — é sempre na linha 6 (dentro do objeto `info`).

## Regra de ouro para o bump

**NUNCA** use `sed -i 's/"version": "3.9.1"/"version": "3.9.2"/g' package-lock.json`.

O flag `-g` faz replace global — e vai substituir qualquer linha `"version": "3.9.1"` dentro de packages terceiros que por acaso estejam nessa versão.

**Exemplo real que falhou em 15/04/2026 (v3.9.1)**:
- `ci-info@3.9.0` existia em node_modules
- sed bumpou 3.9.0 → 3.9.1 globalmente
- Substituiu `ci-info@3.9.0` → `ci-info@3.9.1` (que não existe no npm)
- `npm ci` falhou: `GET ci-info@3.9.1 — Not found`
- Precisou de PR de correção (PR #24)

**SEMPRE** use abordagem line-targeted:

### Abordagem 1: Python (mais seguro — recomendado)

```python
for path, line_spec in [
    ('package.json', 3),
    ('package-lock.json', [3, 9]),
    ('src/swagger/swagger.json', 6),
]:
    with open(path, 'r') as f:
        lines = f.readlines()
    targets = line_spec if isinstance(line_spec, list) else [line_spec]
    for t in targets:
        idx = t - 1  # converter linha 1-indexed para índice 0-indexed
        lines[idx] = lines[idx].replace('3.9.1', '3.9.2')
    with open(path, 'w') as f:
        f.writelines(lines)
```

### Abordagem 2: sed com número de linha específico

```bash
# package.json — linha 3
sed -i '3s/"version": "3.9.1"/"version": "3.9.2"/' package.json

# package-lock.json — linhas 3 e 9
sed -i '3s/"version": "3.9.1"/"version": "3.9.2"/;9s/"version": "3.9.1"/"version": "3.9.2"/' package-lock.json

# swagger.json — linha 6
sed -i '6s/"version": "3.9.1"/"version": "3.9.2"/' src/swagger/swagger.json
```

## Validação pós-bump

Sempre rodar esta verificação antes de commit:

```bash
cd /tmp/corp-controller
echo "=== package.json ==="
grep -n '"version"' package.json | head -1

echo "=== package-lock.json (top-level + packages[\"\"]) ==="
head -15 package-lock.json | grep -n version

echo "=== swagger.json ==="
grep -n '"version"' src/swagger/swagger.json | head -1
```

**Saída esperada para 3.9.2**:
```
=== package.json ===
3:  "version": "3.9.2",
=== package-lock.json (top-level + packages[""]) ===
3:  "version": "3.9.2",
9:      "version": "3.9.2",
=== swagger.json ===
6:    "version": "3.9.2",
```

Se qualquer linha mostrar versão diferente — PARE, algo está errado.

## Regras de versionamento semântico neste projeto

| Regra | Descrição |
|-------|-----------|
| Formato | `X.Y.Z` (major.minor.patch), sempre 3 dígitos |
| **CRÍTICO** | `X.Y.10` não existe — após `X.Y.9` vai para `X.(Y+1).0` |
| Patch bump | Fixes, smoke tests, bumps triviais |
| Minor bump | Features novas, rotas novas, mudanças compatíveis |
| Major bump | Breaking changes (quebra API) |
| Duplicata | CI rejeita tag que já existe no registry — sempre incrementar |

### Exemplos de sequência correta

```
3.8.9 → 3.9.0  (passou do 9, sobe minor)
3.9.0 → 3.9.1  (patch)
3.9.1 → 3.9.2  (patch)
...
3.9.9 → 3.10.0 (passou do 9, sobe minor)
3.10.0 → 3.10.1 (patch)
```

### ERRADO (nunca fazer)

```
3.9.9 → 3.9.10  ❌ (patch nunca passa de 9 neste projeto)
3.9.2 → 3.9.1   ❌ (nunca voltar — CI rejeita como duplicada)
```

## Script de bump pronto (copy-paste)

```bash
#!/usr/bin/env bash
# Uso: ./bump-version.sh <FROM> <TO>
# Exemplo: ./bump-version.sh 3.9.1 3.9.2

set -euo pipefail
FROM="${1:?usage: $0 <FROM> <TO>}"
TO="${2:?usage: $0 <FROM> <TO>}"

python3 -c "
for path, line_spec in [
    ('package.json', 3),
    ('package-lock.json', [3, 9]),
    ('src/swagger/swagger.json', 6),
]:
    with open(path, 'r') as f:
        lines = f.readlines()
    targets = line_spec if isinstance(line_spec, list) else [line_spec]
    for t in targets:
        idx = t - 1
        lines[idx] = lines[idx].replace('$FROM', '$TO')
    with open(path, 'w') as f:
        f.writelines(lines)
print('Bumped $FROM → $TO in 4 locations')
"

echo "Verifying..."
grep -n '"version"' package.json | head -1
head -15 package-lock.json | grep -n version
grep -n '"version"' src/swagger/swagger.json | head -1
```

---

Próximo: [04-clone-and-branch.md](04-clone-and-branch.md) — clone do repo + criação da branch
