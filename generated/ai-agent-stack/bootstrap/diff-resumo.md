# Diff resumo

## Codex
- `~/.codex/config.toml`: mantido em `workspace-write`, rede liberada, granular approvals, `child_agents_md = true`.
- `~/.codex/AGENTS.md`: passa a ser sincronizado de uma fonte única.

## Claude
- `~/.claude/settings.json`: perfil smart com deny rules para segredos e sandbox habilitado.
- `~/.claude/profiles/settings.smart.json`: versão base estável.
- `~/.claude/profiles/settings.aggressive.json`: versão com rede mais ampla para dev.
- `~/.claude/CLAUDE.md`: sincronizado da fonte única.

## Gemini
- `~/.gemini/settings.json`: `auto_edit`, suporte a `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, include de `~/ai-agent-stack/context`, redaction habilitada.
- `~/.gemini/policies/10-safe-dev.toml`: allow automático para comandos comuns de desenvolvimento.
- `~/.gemini/policies/90-dangerous.toml`: ask/deny para padrões claramente perigosos.
- `~/.gemini/GEMINI.md`: sincronizado da fonte única.

## Bootstrap
- `install.ps1`, `repair.ps1`, `uninstall.ps1`, `sync-context.ps1`, `README.md`.
- Launchers `.cmd` em `~/ai-agent-stack/bin`.
