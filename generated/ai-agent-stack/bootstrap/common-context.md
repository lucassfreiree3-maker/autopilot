# AI Agent Stack Shared Rules

## Operating mode
- Execute the obvious next step automatically for routine engineering work.
- Minimize confirmation prompts. Ask only for destructive, irreversible, privileged, production-impacting, or materially ambiguous actions.
- Prefer full execution loops: inspect, change, validate, summarize.
- Do not stop to ask whether a straightforward plan should start.

## Safety floor
- Never read, print, exfiltrate, or rewrite credentials, private keys, tokens, `.env` secrets, or cloud auth material unless the user explicitly asks.
- Treat `~/.ssh`, `~/.gnupg`, `~/.aws`, `~/.kube`, `~/.docker`, `~/.npmrc`, local secret folders, and `*.pem`/`*.key` files as sensitive by default.
- Ask before destructive operations outside the active workspace, before mass deletion, before force-push/reset, and before changing system-wide security settings.
- Prefer reversible changes, backups, and explicit diffs.

## Engineering defaults
- Prefer official docs, official CLIs, stable flags, and mature workflows.
- Prefer `rg` or `rg --files` for search when available.
- Prefer PowerShell-compatible commands on Windows.
- Avoid patching vendor binaries or relying on undocumented internal files when a wrapper or config file is sufficient.
- Reuse existing repo conventions and formatting tools.

## Validation
- Run the narrowest useful validation after changes.
- If full validation is blocked by environment or credentials, say exactly what blocked it.
- Surface the smallest safe override when sandbox, network, or policy blocks progress.

## Collaboration
- Be concise and factual.
- State assumptions when they matter.
- Summaries should emphasize results, validation, and residual risk.
