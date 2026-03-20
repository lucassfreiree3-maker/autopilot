# AI Agent Stack Bootstrap

## O que foi instalado
- Referências locais em `~/ai-agent-stack/reference` para Codex, Gemini CLI, agents.md, rulesync e presets maduros de Claude/Codex.
- Gemini CLI via `npm install -g @google/gemini-cli --registry=https://registry.npmjs.org/`.
- Configurações unificadas em `~/.codex`, `~/.claude` e `~/.gemini`.
- Launchers em `~/ai-agent-stack/bin` para perfis `smart`, `noprompt` e `yolo`.
- Scripts reversíveis em `~/ai-agent-stack/bootstrap`.

## O que foi apenas referenciado
- `rulesync` e `ai-rules-sync`: avaliados, mas não instalados. A sincronização foi implementada com `sync-context.ps1` porque o escopo é pequeno e fica mais previsível e reversível.
- `claude-codex-settings`, `SuperClaude_Framework` e `awesome-claude-code`: usados como fonte de práticas de contexto, deny rules e organização de perfis, sem instalar plugins cegamente.
- `agents.md` e `openai/skills`: usados como referência de compatibilidade e organização.

## O que foi descartado por fragilidade ou insegurança
- Patching de binários.
- Relaxar a Execution Policy do PowerShell globalmente.
- Plugins, hooks e MCPs de terceiros instalados sem necessidade imediata.
- Reescrever credenciais existentes.
- Desabilitar sandbox ou approvals globais como padrão.

## Perfis
- Codex `smart`: `--full-auto` com sandbox `workspace-write`.
- Codex `noprompt`: `-a never -s workspace-write`.
- Codex `yolo`: sem sandbox e sem approvals. Alto risco; use só quando o ambiente já estiver isolado externamente.
- Claude `smart`: `bypassPermissions` com deny rules de segredos e sandbox ligado.
- Claude `aggressive`: mesma base, allowlist de rede mais ampla para dev.
- Gemini `smart`: `auto_edit` + policies locais para comandos comuns.
- Gemini `yolo`: `--approval-mode yolo`.

## Comandos de uso diário
- `codex-smart.cmd`
- `codex-noprompt.cmd`
- `codex-yolo.cmd`
- `claude-smart.cmd`
- `claude-yolo.cmd`
- `gemini-smart.cmd`
- `gemini-yolo.cmd`
- `powershell -ExecutionPolicy Bypass -File ~/ai-agent-stack/bootstrap/repair.ps1`

## Limitações reais
- Codex ainda pode pedir algo em escalada real de sandbox ou elicitação obrigatória.
- Claude ainda pode pedir em diretórios protegidos ou continuar indisponível se o instalador oficial falhar por TLS ou credenciais do host.
- Gemini YOLO pode não ser totalmente consistente entre versões e ainda depende das proteções internas do CLI.
- Neste host, o instalador oficial do Claude falhou por `SEC_E_NO_CREDENTIALS` no caminho TLS. O stack foi preparado para ele, mas a validação do binário depende de esse acesso funcionar.
