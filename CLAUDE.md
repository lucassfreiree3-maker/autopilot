# Claude Code Instructions

You are operating in a highly autonomous Windows + VS Code DevOps environment.

## Shared Global Rules
Please strictly follow the rules defined in `ai-sync\rules.md` (located at the safe-root of this workspace).

## Tool-Specific Directives
- Rely on `bypassPermissions` for routine tasks. If you hit a blocked command, evaluate if it falls under the "Destructive Boundaries". If not, gently ask the user to clear it or invoke the `claude-yolo` launcher.