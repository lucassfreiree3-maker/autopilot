# 05 — Version Bump Seguro nos 4 Lugares

> Como mudar a versão em `package.json`, `package-lock.json` (2 ocorrências) e
> `src/swagger/swagger.json` SEM corromper o lockfile.

## O que você está fazendo

Atualizando a versão do pacote de `CURRENT` para `NEW` nos 4 pontos listados em
[03-version-locations.md](03-version-locations.md).

## Regra absoluta: nunca use `sed -g` em package-lock.json

```bash
# ❌ ERRADO — corrompe pacotes terceiros que casualmente estão na mesma versão
sed -i 's/"version": "3.9.1"/"version": "3.9.2"/g' package-lock.json
```

Caso real de 2026-04-15 (deploy v3.9.1): `ci-info@3.9.0` existia em node_modules.
Quando tentamos bumpar de 3.9.0 → 3.9.1 com sed -g, substituiu `ci-info@3.9.0` por
`ci-info@3.9.1` (que não existe no npm registry). CI falhou com:

```
npm error notarget No matching version found for ci-info@3.9.1.
```

## Script canônico (Python — recomendado)

```bash
cd /tmp/corp-controller
FROM="3.9.1"
TO="3.9.2"

python3 <<PYEOF
FROM = "$FROM"
TO = "$TO"
changes = [
    ('package.json', [3]),
    ('package-lock.json', [3, 9]),
    ('src/swagger/swagger.json', [6]),
]
for path, lines in changes:
    with open(path, 'r') as f:
        content = f.readlines()
    for ln in lines:
        idx = ln - 1
        before = content[idx]
        content[idx] = content[idx].replace(FROM, TO)
        after = content[idx]
        print(f'{path}:{ln}')
        print(f'  - {before.rstrip()}')
        print(f'  + {after.rstrip()}')
    with open(path, 'w') as f:
        f.writelines(content)
PYEOF
```

### Saída esperada (exemplo bump 3.9.1 → 3.9.2)

```
package.json:3
  -   "version": "3.9.1",
  +   "version": "3.9.2",
package-lock.json:3
  -   "version": "3.9.1",
  +   "version": "3.9.2",
package-lock.json:9
  -       "version": "3.9.1",
  +       "version": "3.9.2",
src/swagger/swagger.json:6
  -     "version": "3.9.1",
  +     "version": "3.9.2",
```

## Alternativa 1: sed com linha específica

```bash
FROM="3.9.1"
TO="3.9.2"

sed -i "3s/\"version\": \"$FROM\"/\"version\": \"$TO\"/" package.json
sed -i "3s/\"version\": \"$FROM\"/\"version\": \"$TO\"/" package-lock.json
sed -i "9s/\"version\": \"$FROM\"/\"version\": \"$TO\"/" package-lock.json
sed -i "6s/\"version\": \"$FROM\"/\"version\": \"$TO\"/" src/swagger/swagger.json
```

Sintaxe: `<LINHA>s/<padrão>/<substituição>/` (sem flag `g`).

## Alternativa 2: jq (só funciona para package.json e swagger.json)

```bash
FROM="3.9.1"
TO="3.9.2"

# package.json (jq preserva formatação básica mas pode reordenar chaves)
jq --arg v "$TO" '.version = $v' package.json > package.json.tmp && mv package.json.tmp package.json

# swagger.json
jq --arg v "$TO" '.info.version = $v' src/swagger/swagger.json > src/swagger/swagger.json.tmp && mv src/swagger/swagger.json.tmp src/swagger/swagger.json
```

**NÃO usar jq em package-lock.json** — o arquivo é gigante (~15k linhas) e jq reformata tudo, mesmo com `--indent 2`. Diff fica ilegível e pode quebrar validação do npm.

## Validação pós-bump

Sempre rodar imediatamente após o script:

```bash
echo "=== package.json ==="
sed -n '3p' package.json
echo "=== package-lock.json (linhas 3 e 9) ==="
sed -n '3p;9p' package-lock.json
echo "=== swagger.json ==="
sed -n '6p' src/swagger/swagger.json
echo ""
echo "=== git diff stat ==="
git diff --stat
```

Saída esperada para 3.9.1 → 3.9.2:

```
=== package.json ===
  "version": "3.9.2",
=== package-lock.json (linhas 3 e 9) ===
  "version": "3.9.2",
      "version": "3.9.2",
=== swagger.json ===
    "version": "3.9.2",

=== git diff stat ===
 package-lock.json        | 4 ++--
 package.json             | 2 +-
 src/swagger/swagger.json | 2 +-
 3 files changed, 4 insertions(+), 4 deletions(-)
```

**Se o `git diff --stat` mostrar mais de `4 insertions(+), 4 deletions(-)` → algo foi substituído errado. REVERTER e refazer:**

```bash
git checkout -- .
```

## Double-check: nenhum pacote terceiro foi modificado

```bash
# Ver o diff completo do lockfile
git diff package-lock.json | head -30
```

Deve mostrar APENAS duas alterações:

```diff
-  "version": "3.9.1",
+  "version": "3.9.2",
...
-      "version": "3.9.1",
+      "version": "3.9.2",
```

Se aparecer qualquer mudança em `"node_modules/..."` → REVERTER:

```bash
git checkout -- package-lock.json
# e refazer o bump com abordagem line-targeted
```

## Linhas podem mudar em versões futuras?

O número das linhas (3, 9, 6) reflete o formato atual dos arquivos. Se alguém
renumerar o lockfile (ex: adicionar campo novo no topo), as linhas podem
deslocar. Para robustez, pode-se usar um finder dinâmico:

```bash
# Descobrir dinamicamente as 2 linhas do lockfile que têm a versão do pacote raiz
python3 -c "
import json
with open('package-lock.json') as f:
    j = json.load(f)
print('Top-level version:', j['version'])
print('packages[\"\"] version:', j['packages']['']['version'])
"
```

Mas na prática, o formato do lockfile (npm 9+) é estável e as linhas 3 e 9 são
confiáveis.

## Script canônico pronto (`bump-version.sh`)

Salvar em `~/bin/bump-version.sh` e dar `chmod +x`:

```bash
#!/usr/bin/env bash
set -euo pipefail

FROM="${1:?usage: $0 <FROM_VERSION> <TO_VERSION>}"
TO="${2:?usage: $0 <FROM_VERSION> <TO_VERSION>}"

[[ ! -f package.json ]] && { echo "ERROR: run from repo root (package.json not found)"; exit 1; }

echo "Bumping $FROM → $TO in 4 locations..."

python3 <<PYEOF
FROM = "$FROM"
TO = "$TO"
changes = [
    ('package.json', [3]),
    ('package-lock.json', [3, 9]),
    ('src/swagger/swagger.json', [6]),
]
for path, lines in changes:
    with open(path, 'r') as f:
        content = f.readlines()
    for ln in lines:
        idx = ln - 1
        content[idx] = content[idx].replace(FROM, TO)
    with open(path, 'w') as f:
        f.writelines(content)
print('Done.')
PYEOF

echo ""
echo "Verification:"
sed -n '3p' package.json | grep -q "\"$TO\"" && echo "  ✓ package.json:3 = $TO" || { echo "  ✗ package.json:3 MISMATCH"; exit 1; }
sed -n '3p' package-lock.json | grep -q "\"$TO\"" && echo "  ✓ package-lock.json:3 = $TO" || { echo "  ✗ package-lock.json:3 MISMATCH"; exit 1; }
sed -n '9p' package-lock.json | grep -q "\"$TO\"" && echo "  ✓ package-lock.json:9 = $TO" || { echo "  ✗ package-lock.json:9 MISMATCH"; exit 1; }
sed -n '6p' src/swagger/swagger.json | grep -q "\"$TO\"" && echo "  ✓ swagger.json:6 = $TO" || { echo "  ✗ swagger.json:6 MISMATCH"; exit 1; }

echo ""
echo "Diff summary:"
git diff --stat
```

Uso:

```bash
cd /tmp/corp-controller
~/bin/bump-version.sh 3.9.1 3.9.2
```

---

Próximo: [06-commit-push.md](06-commit-push.md) — commit e push com autenticação
