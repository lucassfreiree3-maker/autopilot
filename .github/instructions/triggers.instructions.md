---
applyTo: "trigger/**"
---

# Trigger Files Instructions

Trigger files dispatch workflows when edited on the `main` branch.

## Critical Rules
- The `run` field MUST be incremented — without increment, workflow does NOT trigger
- The `_context` field identifies the workspace (verify before editing)
- `commit_message` in source-change.json: NO agent prefix (clean like normal dev)
- After editing: commit to branch copilot/* → PR → squash merge → workflow auto-triggers
