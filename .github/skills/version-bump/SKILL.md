---
name: version-bump
description: Bump version across all 5 required files for controller or agent deploy.
---

# Version Bump Skill

## When to use
- Deploying new version of controller or agent
- CI rejected duplicate tag (need to bump)
- User asks for version bump

## The 5 Files (ALL mandatory)

| # | File | Location | Method |
|---|------|----------|--------|
| 1 | package.json | Corporate repo | search-replace in trigger |
| 2 | package-lock.json | Corporate repo | search-replace (flag g = 2 occurrences) |
| 3 | src/swagger/swagger.json | Corporate repo | replace-file (version may differ!) |
| 4 | references/controller-cap/values.yaml | Autopilot repo | Include in push_files |
| 5 | contracts/copilot-session-memory.json | Autopilot repo | Include in push_files |

## Version Rules
- Pattern: MAJOR.MINOR.PATCH (SemVer)
- After X.Y.9 → X.(Y+1).0 — NEVER X.Y.10
- CI rejects duplicate tags — always check before bumping

## How to configure in trigger

```json
{
  "changes": [
    {"action": "search-replace", "target_path": "package.json",
     "search": "\"version\": \"OLD\"", "replace": "\"version\": \"NEW\""},
    {"action": "search-replace", "target_path": "package-lock.json",
     "search": "\"version\": \"OLD\"", "replace": "\"version\": \"NEW\""},
    {"action": "replace-file", "target_path": "src/swagger/swagger.json",
     "content_ref": "patches/swagger.json"}
  ]
}
```

## WARNING: Swagger version may DIFFER from package.json
Always use replace-file for swagger. Never search-replace blindly.
The swagger info.version could be 3.5.14 while package.json is 3.6.8.

## Full docs: ops/docs/deploy-process/05-version-bump.md
