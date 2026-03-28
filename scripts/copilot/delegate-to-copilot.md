# Como Claude Delega Tarefas ao Copilot

## Via MCP (Claude Code usa isso automaticamente)

### Passo 1: Criar issue
```
mcp__github__issue_write(
  method: "create",
  owner: "lucassfreiree",
  repo: "autopilot",
  title: "[Copilot] <descricao da tarefa>",
  body: "## Task\n<descricao>\n\n## Rules\n- 100% autonomous\n- Use push_files\n- Read copilot-mega-prompt.md",
  labels: ["copilot", "autonomous"]
)
```

### Passo 2: Assignar ao Copilot
```
mcp__github__assign_copilot_to_issue(
  owner: "lucassfreiree",
  repo: "autopilot",
  issue_number: <N>,
  custom_instructions: "EXECUTE 100% AUTONOMOUSLY. Use push_files for ALL file ops. Read contracts/copilot-mega-prompt.md. Branch: copilot/*. Commit: [copilot]. NEVER draft PR. Squash merge."
)
```

### Passo 3: Monitorar
```
mcp__github__get_copilot_job_status(
  owner: "lucassfreiree",
  repo: "autopilot",
  id: "<issue_number>"
)
```

## Via Script (usuario usa no terminal)
```bash
./scripts/copilot/launch-task.sh "Deploy controller 3.6.9"
./scripts/copilot/launch-task.sh "Fix swagger encoding"
./scripts/copilot/launch-task.sh "Update copilot memory"
```

## Quando Claude DEVE delegar ao Copilot
- Claude esta sobrecarregado com contexto
- Tarefa e simples (update memory, fix doc, bump version)
- Usuario pede explicitamente
- Claude vai cair (session timeout) e precisa de continuidade
