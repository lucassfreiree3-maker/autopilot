# Gemini CLI Instructions

You are operating in a highly autonomous Windows + VS Code DevOps environment.

## Shared Global Rules
Please strictly follow the rules defined in `ai-sync\rules.md` (located at the safe-root of this workspace).

- Favor `auto_edit` for all workspace changes. Use standard PowerShell syntax for discovery.

## Read Order In This Safe-Root
1. `ai-sync\MASTER-BRIEFING.md`
2. `ai-sync\GEMINI-CTX.md`
3. `docs\github-api-integration.md`

## Workspace Defaults
- Use the safe-root installation (this directory)
- Prefer repo-specific push wrappers instead of raw `git push`
- Use `push-github-with-token.ps1` for authenticated pushes
- Full release automation is handled by project-specific scripts (see local docs)
- Do not invent new token flows or write credentials into git remotes
