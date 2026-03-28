---
name: backup-claude
description: Resume work from Claude Code if it crashes or becomes unavailable. Read Claude's live status and continue where it stopped.
---

# Backup Claude Skill

## When to use
- User says "Claude caiu", "Claude parou", "Claude not responding"
- claude-live-status.json shows active session but lastUpdated > 30 min ago
- User asks Copilot to take over from Claude

## Resume Protocol

### Step 1: Read Claude's state
```
get_file_contents("contracts/claude-live-status.json")
```
Check: currentSession.status, activeDeploy, pendingWork, openPRs, runningWorkflows

### Step 2: Read Claude's full context
```
get_file_contents("contracts/claude-session-memory.json")
```
Extract: versions, deploy flow, error patterns, auth architecture

### Step 3: Check open PRs from Claude
```
list_pull_requests(state: "open")
→ Filter branches starting with "claude/"
→ If found: check if ready to merge
```

### Step 4: Resume by phase
| Phase | Action |
|-------|--------|
| prepare | Check patches/ for incomplete files |
| trigger | Check trigger/source-change.json |
| commit | Push pending changes via push_files |
| pr | Merge open PR (update_pull_request draft:false → merge) |
| merge | Check if workflow fired |
| monitor-workflow | Poll autopilot-state for audit commits |
| monitor-ci | Check release-state for CI result |
| fix | Apply pendingFixes and re-deploy |
| promote | Verify promoted=true in release-state |

### Step 5: Update live status
After completing, update `contracts/claude-live-status.json` with:
- lastUpdatedBy: "copilot"
- currentSession.status: current state
- lastCompletedAction: what you did

## Full protocol: contracts/copilot-backup-protocol.md
