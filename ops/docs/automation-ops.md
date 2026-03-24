# Automation Scripts — Python, Shell, Node.js

## Shell Scripts (Primary)
Located in `ops/scripts/<domain>/`. Used for quick diagnostics and operational tasks.

### Conventions
- Shebang: `#!/usr/bin/env bash`
- Safety: `set -euo pipefail`
- Colors: Use RED/GREEN/YELLOW/BLUE variables
- Logging: `log()`, `warn()`, `error()`, `ok()` functions
- Usage: Always provide `usage()` function
- Arguments: Positional with defaults where sensible
- Output: Both console (colored) and file (tee to log)

### Available Scripts
| Script | Domain | Usage |
|--------|--------|-------|
| `diagnose.sh` | troubleshooting | `./diagnose.sh <target> [args]` |
| `analyze-pipeline.sh` | ci | `./analyze-pipeline.sh <platform> [args]` |
| `cluster-health.sh` | k8s | `./cluster-health.sh [namespace]` |
| `tf-ops.sh` | terraform | `./tf-ops.sh <action> [path]` |
| `cloud-check.sh` | cloud | `./cloud-check.sh <provider> [action]` |
| `alert-check.sh` | monitoring | `./alert-check.sh <platform>` |
| `ops-logger.sh` | utils | `source ops-logger.sh && ops_log ...` |

## Python Scripts
Located in `ops/scripts/python/`.

### Setup
```bash
cd ops/scripts/python
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Shared Utilities: `ops_utils.py`
```python
from ops_utils import OpsLogger, run_command, api_request, load_config

logger = OpsLogger(workspace="ws-cit")
logger.success("deploy", "Deployed v1.0.0 to staging")

result = run_command("kubectl get pods -n default")
config = load_config("aws")
response = api_request("https://api.example.com/health")
```

## Node.js Scripts
Located in `ops/scripts/node/`.

### Setup
```bash
cd ops/scripts/node
npm install
```

### Shared Utilities: `ops-utils.js`
```javascript
import { OpsLogger, apiRequest, loadConfig, runCommand } from './ops-utils.js';

const logger = new OpsLogger('ws-cit');
logger.success('deploy', 'Deployed v1.0.0');

const config = loadConfig('aws');
const response = await apiRequest('https://api.example.com/health');
```

## Logging Convention
All scripts write to `ops/logs/ops-log.jsonl` (gitignored).
Format: JSON Lines — one JSON object per line.
Fields: `timestamp`, `workspace`, `agent`, `action`, `description`, `result`, `details`.
