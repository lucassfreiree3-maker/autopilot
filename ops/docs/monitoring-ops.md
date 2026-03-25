# Monitoring & Observability Operations

## Platforms
- **Datadog**: Full-stack monitoring (metrics, APM, logs, dashboards)
- **Prometheus + Grafana**: Open-source metrics and visualization
- **Alertmanager**: Alert routing and notification

## Key Files
- Datadog config: `ops/config/monitoring/datadog/datadog-config.json`
- Grafana config: `ops/config/monitoring/grafana/grafana-config.json`
- Prometheus config: `ops/config/monitoring/prometheus/prometheus-config.json`
- Alert check: `ops/scripts/monitoring/alert-check.sh`
- Alert template: `ops/templates/monitoring/prometheus-alerts-template.yml`
- Dashboard template: `ops/templates/monitoring/grafana-dashboard-template.json`
- Runbook: `ops/runbooks/monitoring/monitoring-setup.json`

## Check Active Alerts
```bash
ops/scripts/monitoring/alert-check.sh datadog
ops/scripts/monitoring/alert-check.sh grafana
ops/scripts/monitoring/alert-check.sh prometheus
ops/scripts/monitoring/alert-check.sh alertmanager
ops/scripts/monitoring/alert-check.sh all
```

## GitHub Actions Workflow
```
Workflow: ops-monitor-alerts.yml
Trigger: workflow_dispatch + schedule (every 6 hours)
Inputs: platform, workspace_id
```

## Environment Variables

| Variable | Platform | Purpose |
|----------|----------|---------|
| `DD_API_KEY` | Datadog | API key (secret) |
| `DD_APP_KEY` | Datadog | Application key (secret) |
| `DD_SITE` | Datadog | Site (datadoghq.com) |
| `GRAFANA_URL` | Grafana | Instance URL |
| `GRAFANA_TOKEN` | Grafana | Service Account token (secret) |
| `PROMETHEUS_URL` | Prometheus | Instance URL |
| `ALERTMANAGER_URL` | Alertmanager | Instance URL |

## What's Pending
- [ ] Datadog account and API keys
- [ ] Grafana instance URL and token
- [ ] Prometheus/Alertmanager endpoints
- [ ] Notification channels (Slack, email)
- [ ] Dashboard deployment
- [ ] Alert rules deployment
