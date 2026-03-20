# GitHub API Integration — Guia Unificado (Claude / Codex / Gemini)

> Referência para todos os agentes interagirem com o GitHub.
> **Regra fundamental**: nenhum agente deve segurar token bruto em memória ou variável de script.
> Toda chamada à API passa pelo `gh` CLI, que gerencia autenticação internamente.

---

## Como cada agente acessa o GitHub

| Agente | Método | Token visível ao agente? |
|---|---|---|
| **Claude** | MCP `@modelcontextprotocol/server-github` | Não — MCP server gerencia internamente |
| **Codex** | `gh api` / `gh run` CLI | Não — `gh` CLI gerencia internamente |
| **Gemini** | `gh api` / `gh run` CLI | Não — `gh` CLI gerencia internamente |

**gh CLI path:** `C:\Program Files\GitHub CLI\gh.exe`
**Autenticação única:** `gh auth login` (browser + MFA, uma vez por sessão de máquina)

---

## Autenticação do gh CLI

```powershell
$gh = 'C:\Program Files\GitHub CLI\gh.exe'
# Verificar se já autenticado
& $gh auth status
# Se não autenticado:
& $gh auth login --web
```

O gh CLI armazena o token de forma segura e interna. Agentes **nunca** veem o valor do token.

---

## Operações de CI (Codex e Gemini)

### Listar últimas runs
```powershell
$gh = 'C:\Program Files\GitHub CLI\gh.exe'
$repo = 'your-org/your-repo'  # substitua pelo repo correto
& $gh run list --repo $repo --limit 5
```

### Ver status de run específica
```powershell
& $gh run view $runId --repo $repo
```

### Monitorar run até concluir
```powershell
& $gh run watch $runId --repo $repo --exit-status
# --exit-status: retorna código 0 em success, 1 em failure
```

### Ver logs de falha
```powershell
& $gh run view $runId --repo $repo --log-failed
```

### Loop de monitoramento (quando gh run watch não for suficiente)
```powershell
$gh = 'C:\Program Files\GitHub CLI\gh.exe'
do {
    Start-Sleep 30
    $status = & $gh run view $runId --repo $repo --json status,conclusion | ConvertFrom-Json
    Write-Host (Get-Date -Format 'HH:mm:ss') $status.status $status.conclusion
} while ($status.status -ne 'completed')

if ($status.conclusion -eq 'success') {
    Write-Host 'CI passou — promover tag'
} else {
    Write-Host 'CI falhou — analisar e corrigir'
}
```

---

## Operações de arquivo via API (Codex e Gemini)

### Ler arquivo
```powershell
$gh = 'C:\Program Files\GitHub CLI\gh.exe'
$repo = 'your-org/your-deploy-repo'
$path = 'path/to/values.yaml'
$r = & $gh api "repos/$repo/contents/$path" | ConvertFrom-Json
$content = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($r.content -replace '\s'))
$sha = $r.sha
```

### Atualizar arquivo (commit via API)
```powershell
function Update-GitHubFile($repo, $path, $content, $sha, $message) {
    $gh = 'C:\Program Files\GitHub CLI\gh.exe'
    $encoded = [System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($content))
    $body = @{ message = $message; content = $encoded; sha = $sha } | ConvertTo-Json -Compress
    $result = & $gh api "repos/$repo/contents/$path" --method PUT --input - <<< $body | ConvertFrom-Json
    return $result.commit.sha
}
```

### Alternativa — via arquivo temporário (Windows/PowerShell)
```powershell
function Update-GitHubFile($repo, $path, $content, $sha, $message) {
    $gh = 'C:\Program Files\GitHub CLI\gh.exe'
    $encoded = [System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($content))
    $body = @{ message = $message; content = $encoded; sha = $sha } | ConvertTo-Json
    $tmp = [System.IO.Path]::GetTempFileName()
    $body | Set-Content $tmp -Encoding utf8
    try {
        $result = & $gh api "repos/$repo/contents/$path" --method PUT --input $tmp | ConvertFrom-Json
        return $result.commit.sha
    } finally {
        Remove-Item $tmp -ErrorAction SilentlyContinue
    }
}
```

### Verificar se tag já existe
```powershell
function Tag-Exists($repo, $tag) {
    $gh = 'C:\Program Files\GitHub CLI\gh.exe'
    $exit = & $gh api "repos/$repo/git/ref/tags/$tag" 2>&1
    return $LASTEXITCODE -eq 0
}
```

---

## Claude MCP — Ferramentas disponíveis (sem PowerShell)

Quando Claude usa MCP GitHub, as ferramentas são chamadas diretamente:

| Ferramenta MCP | Equivalente gh CLI |
|---|---|
| `list_workflow_runs` | `gh run list --repo owner/repo` |
| `get_job_for_workflow_run` | `gh run view $id --log-failed --repo owner/repo` |
| `get_file_contents` | `gh api repos/{owner}/{repo}/contents/{path}` |
| `create_or_update_file` | `gh api repos/{owner}/{repo}/contents/{path} --method PUT` |
| `list_tags` | `gh api repos/{owner}/{repo}/tags` |
| `create_pull_request` | `gh pr create --repo owner/repo` |

---

## Troubleshooting

| Problema | Causa | Solução |
|---|---|---|
| `gh: Not logged in` | Sessão expirada | `gh auth login --web` |
| `422 sha mismatch` | Arquivo mudou entre leitura e escrita | Reler arquivo antes de atualizar |
| `404 Not Found` | Repo ou path errado | Verificar nome do repo e path |
| MCP não conecta | Node.js não no PATH | Launcher usa path absoluto, não depende de PATH |
| `gh run watch` timeout | CI demorou mais de 10 min | Usar loop manual com `gh run view --json` |
