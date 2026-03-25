# n8n Integration — Autopilot

> Zero cost: n8n is 100% open-source. Self-host with Docker or K8s.

## What it provides
Visual automation workflows that connect Autopilot to external systems:
- **Slack/Discord alerts** on CI failures, releases, and health issues
- **Webhook receivers** for GitHub events
- **Human-in-the-loop** approval flows with interactive messages
- **Dashboard** — visual pipeline status in n8n UI

## Files
| File | Purpose |
|------|---------|
| `docker-compose.yml` | Run n8n locally with zero cost |
| `workflows/ci-failure-alert.json` | Alert on CI failure → Slack + auto-triage |
| `workflows/release-notify.json` | Notify on successful release |
| `workflows/health-monitor.json` | Periodic health check + alert if degraded |
| `workflows/approval-gate.json` | Interactive approval via Slack/webhook |

## Quick Start
```bash
# 1. Start n8n locally (free, self-hosted)
cd integrations/n8n
docker compose up -d

# 2. Open http://localhost:5678
# 3. Import workflows from workflows/ directory
# 4. Configure credentials (GitHub PAT, Slack webhook)
```

## n8n Cloud (optional, paid)
If you prefer managed hosting, n8n offers a cloud plan.
But self-hosted is 100% free and works identically.
