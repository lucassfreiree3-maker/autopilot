# COST REDUCTION MANDATE (Owner Directive — PERMANENT)

> **Priority**: MAXIMUM. This directive overrides all default behaviors.
> **Scope**: Every session, every operation, every tool call, every workflow.
> **Goal**: Minimize ALL costs (tokens, API calls, compute, storage, time) while maintaining maximum performance.

## Core Principle
**Zero waste, maximum output.** Every token spent must produce value. Every workflow run must be necessary. Every API call must be justified. If there's a cheaper way to achieve the same result — use it.

## Direct Cost Reduction Mechanisms

### 1. Token Cost (highest priority)
- Use **Haiku** ($0.80/1M) for: exploration, file search, simple lookups, pattern matching
- Use **Sonnet** ($3/1M) for: moderate research, code review, straightforward implementations
- Use **Opus** ($15/1M) ONLY for: complex multi-step tasks, architecture decisions, deploy flows
- NEVER use Opus when Haiku/Sonnet can achieve the same result
- Compact session memory daily (token-auto-optimize.yml)
- Read files with offset+limit — NEVER read entire large files
- Batch parallel tool calls — 1 message with 5 calls beats 5 messages with 1 call
- Skip re-reading files already in context
- Use jq for JSON fields instead of reading full files

### 2. Workflow Cost (GitHub Actions minutes)
- spark-sync-state: skip push when content unchanged (hash comparison)
- Don't trigger unnecessary workflow runs — check if action is actually needed
- Use `[skip ci]` on commits that don't need CI (docs, memory, state)
- Cancel stale workflow runs (cancel-in-progress: true)
- Combine related changes in 1 commit instead of multiple PRs

### 3. API Cost
- GitHub API: use `per_page=1` when only latest item needed
- Use `--jq` to filter fields server-side instead of fetching full payloads
- Cache results within session — don't re-fetch unchanged data
- Batch API calls where possible

### 4. Compute Cost
- Use lightweight checks before expensive operations (diff --stat before full diff)
- Run validation locally before triggering remote workflows
- Prefer targeted edits over full file rewrites

## Indirect Cost Reduction Mechanisms

### 5. Prevent Waste Through Quality
- Fix issues RIGHT the first time — each retry is wasted cost
- Validate patches BEFORE deploy (compliance-gate.yml catches errors pre-merge)
- Read session memory lessons — never repeat a mistake already documented
- Check version before bump — duplicate tags waste an entire deploy cycle

### 6. Autonomous Cost Monitoring
- token-auto-optimize.yml: daily memory compaction (saves ~40% per session start)
- emergency-watchdog.yml: prevents resource waste from stuck locks/stale state
- dashboard-auto-improve.yml: catches data inconsistencies before they cause bad decisions
- Track improvements in improvement-history.json with real before/after metrics

### 7. Smart Defaults
- Always default to the cheapest option that maintains quality
- When in doubt between two approaches, pick the one with fewer tool calls
- Consolidate multiple small changes into single commits
- Don't create unnecessary files, branches, or PRs

## What NOT to Sacrifice
- **Correctness**: Never skip validation to save tokens
- **Security**: Never skip compliance checks to save time
- **Monitoring**: Never skip post-deploy monitoring to save API calls
- **Memory**: Always record lessons learned (prevents costly repeat failures)

## Measurement
- Every optimization must be measurable (before/after in improvement-history.json)
- Token Intelligence dashboard tracks estimated costs
- token-optimization-rules.json tracks compaction metrics
- If you can't measure the saving, it's not a real optimization
