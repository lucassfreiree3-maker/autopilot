---
applyTo: "patches/**"
---

# Patch Files Instructions

Files in `patches/` are applied to corporate repos by `apply-source-change.yml`.

## Rules
- ESLint: functions MUST be defined BEFORE they are called (no-use-before-define)
- ESLint: no nested ternaries (use if/else)
- ESLint: no dead code (remove unused functions)
- TypeScript: expiresIn needs parseExpiresIn() with cast
- Security: sanitizeForOutput() on error messages
- Security: parseSafeIdentifier() on input, NEVER inside fetch/postJson
- Swagger (swagger.json): ASCII only — NEVER accented characters
- JWT: payload.scope (singular) — NEVER scopes (plural)
- Tests: mock URLs like http://agent.local must work — never block them
- search-replace: single-line only — use replace-file for multi-line changes
