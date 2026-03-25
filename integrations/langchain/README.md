# LangChain Integration — Autopilot

> Zero-cost: runs inside GitHub Actions with `pip install langchain-anthropic`

## What it does
Replaces rigid shell-script decision-making with intelligent LangChain agents that:
- Analyze CI failures semantically (not just regex)
- Decide next actions based on context
- Maintain memory of past decisions via state branch
- Coordinate multi-agent handoffs intelligently

## Files
| File | Purpose |
|------|---------|
| `orchestrator.py` | Main LangChain agent with tools for Autopilot operations |
| `tools.py` | Custom LangChain tools (read state, trigger workflows, create handoffs) |
| `memory.py` | RAG memory backed by autopilot-state branch |
| `requirements.txt` | Python dependencies (all free/open-source) |
| `../../.github/workflows/langchain-orchestrator.yml` | Workflow to run the agent |

## Usage
Triggered via workflow_dispatch or by other workflows that need intelligent decision-making.

```bash
gh api repos/lucassfreiree/autopilot/actions/workflows/langchain-orchestrator.yml/dispatches \
  --method POST -f ref=main \
  -f "inputs[workspace_id]=ws-default" \
  -f "inputs[task]=analyze-ci-failure" \
  -f "inputs[context]=Build failed on agent repo - npm test exit code 1"
```
