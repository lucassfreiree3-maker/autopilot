---
name: ci-fix
description: Diagnose and fix CI failures automatically. Use when CI/esteira fails or user reports build errors.
allowed-tools: Read, Bash, Edit, Write, Grep, Glob
---

# CI Fix — Auto-diagnose and repair

## Step 1: Identify failure
Read latest CI logs from autopilot-state branch or GitHub Actions.

## Step 2: Pattern match
| Error | Fix |
|-------|-----|
| `error TS` | Fix TypeScript types/imports |
| `no-restricted-syntax` for...of | Replace with .map/.filter/.reduce |
| `no-use-before-define` | Reorder functions |
| `Test Suites: X failed` | Update test expectations |
| `duplicate tag` | Bump version |
| `Reflected_XSS` | Add sanitizeForOutput() |
| `SSRF` | Add validateTrustedUrl() |
| `Server_DoS_by_Loop` | Add MAX_RESULTS bound |

## Step 3: Create fix patch
1. Read current corporate file via fetch-files
2. Create minimal diff patch in `patches/`
3. Update `trigger/source-change.json` (bump run)
4. Commit + PR + merge

## Step 4: Monitor fix
Poll CI until success or new failure. Repeat if needed.
