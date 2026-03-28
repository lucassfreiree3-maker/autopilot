---
name: memory-sync
description: Sync and update Copilot persistent memory at end of session or after important events.
---

# Memory Sync Skill

## When to use
- End of any session (MANDATORY)
- After completing a deploy
- After learning something new
- After encountering and fixing an error

## How to sync memory

### Read current memory
```
get_file_contents("contracts/copilot-session-memory.json")
```

### Update with new data
Add to the JSON:
- `sessionsLog[]`: new entry with date, summary, actions[], lessonsLearned[]
- `lessonsLearned[]`: any new lessons discovered
- `errorPatterns{}`: any new error patterns found
- `decisions[]`: any new decisions made
- `currentState`: update versions, runs, pipeline status
- `sessionCount`: increment by 1
- `lastUpdated`: current ISO timestamp
- `lastSessionId`: current session identifier

### Push update
```
push_files(
  branch: "copilot/update-memory",
  message: "[copilot] chore: update session memory",
  files: [{path: "contracts/copilot-session-memory.json", content: <updated JSON>}]
)
create_pull_request(head: "copilot/update-memory", base: "main", draft: false)
merge_pull_request(merge_method: "squash")
```

## CRITICAL: This triggers sync-copilot-prompt.yml which embeds memory into copilot-instructions.md
