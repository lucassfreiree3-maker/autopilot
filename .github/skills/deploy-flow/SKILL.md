---
name: deploy-flow
description: Complete deploy flow for corporate repos via apply-source-change pipeline. Use when deploying code changes, version bumps, or patches.
---

# Deploy Flow Skill

## When to use
- User asks to deploy, release, or push code to corporate repos
- Version bump needed
- Patches to apply to controller or agent

## Quick Reference

### Current State
Read `trigger/source-change.json` for version and run.
Read `contracts/copilot-session-memory.json` for full context.

### Trigger Format
```json
{
  "workspace_id": "ws-default",
  "component": "controller",
  "change_type": "multi-file",
  "version": "X.Y.Z",
  "changes": [
    {"action": "replace-file", "target_path": "path", "content_ref": "patches/file"},
    {"action": "search-replace", "target_path": "path", "search": "old", "replace": "new"}
  ],
  "commit_message": "feat: description (NO agent prefix!)",
  "promote": true,
  "run": LAST + 1
}
```

### 7 Pipeline Stages
1. Setup → read workspace config
1.5 Session Guard → acquire lock
2. Apply & Push → clone corporate repo, apply patches, push
3. CI Gate → wait corporate CI (Esteira de Build NPM)
4. Promote → update CAP values.yaml (auto)
5. Save State → record on autopilot-state
6. Audit → trail + release lock

### Version Rules
- 5 files must be bumped
- After X.Y.9 → X.(Y+1).0 (NEVER X.Y.10)
- CI rejects duplicate tags

### Full Documentation
- Quick guide: `contracts/copilot-deploy-guide.md`
- Detailed (12 phases): `ops/docs/deploy-process/`
- Troubleshooting: `ops/docs/deploy-process/11-diagnostics-and-troubleshooting.md`
