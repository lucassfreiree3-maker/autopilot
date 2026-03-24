"""
ops_utils.py — Shared operational utilities for Python automation scripts.

Usage:
    from ops_utils import OpsLogger, run_command, api_request, load_config

This module provides:
- Structured JSON logging (compatible with ops-log.jsonl)
- Shell command execution with output capture
- HTTP API requests with retry logic
- Configuration loading from ops/config/
"""

import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# Resolve paths relative to repo root
REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
OPS_DIR = REPO_ROOT / "ops"
CONFIG_DIR = OPS_DIR / "config"
LOG_DIR = OPS_DIR / "logs"
LOG_FILE = LOG_DIR / "ops-log.jsonl"


class OpsLogger:
    """Structured operational logger — writes to ops/logs/ops-log.jsonl."""

    def __init__(self, workspace: str = "ws-cit", agent: str = "claude-code"):
        self.workspace = workspace
        self.agent = agent
        LOG_DIR.mkdir(parents=True, exist_ok=True)

    def log(self, action: str, description: str, result: str = "info", details: str = "") -> dict:
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "workspace": self.workspace,
            "agent": self.agent,
            "action": action,
            "description": description,
            "result": result,
            "details": details,
        }
        with open(LOG_FILE, "a") as f:
            f.write(json.dumps(entry) + "\n")
        return entry

    def success(self, action: str, description: str, details: str = ""):
        return self.log(action, description, "success", details)

    def error(self, action: str, description: str, details: str = ""):
        return self.log(action, description, "error", details)

    def warn(self, action: str, description: str, details: str = ""):
        return self.log(action, description, "warning", details)


def run_command(cmd: str, timeout: int = 120, capture: bool = True) -> dict:
    """Execute a shell command and return structured result."""
    try:
        result = subprocess.run(
            cmd, shell=True, capture_output=capture, text=True, timeout=timeout
        )
        return {
            "success": result.returncode == 0,
            "exit_code": result.returncode,
            "stdout": result.stdout.strip() if capture else "",
            "stderr": result.stderr.strip() if capture else "",
        }
    except subprocess.TimeoutExpired:
        return {"success": False, "exit_code": -1, "stdout": "", "stderr": f"Timeout after {timeout}s"}
    except Exception as e:
        return {"success": False, "exit_code": -1, "stdout": "", "stderr": str(e)}


def api_request(
    url: str,
    method: str = "GET",
    headers: Optional[dict] = None,
    data: Optional[dict] = None,
    retries: int = 3,
    backoff: float = 2.0,
) -> dict:
    """HTTP request with exponential backoff retry."""
    try:
        import requests
    except ImportError:
        return {"success": False, "error": "requests library not installed. Run: pip install requests"}

    for attempt in range(retries):
        try:
            resp = requests.request(method, url, headers=headers, json=data, timeout=30)
            if resp.status_code in (429, 500, 502, 503, 504) and attempt < retries - 1:
                time.sleep(backoff ** (attempt + 1))
                continue
            return {
                "success": 200 <= resp.status_code < 300,
                "status_code": resp.status_code,
                "body": resp.json() if resp.headers.get("content-type", "").startswith("application/json") else resp.text,
            }
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(backoff ** (attempt + 1))
            else:
                return {"success": False, "error": str(e)}

    return {"success": False, "error": "Max retries exceeded"}


def load_config(tool: str) -> dict:
    """Load a tool configuration from ops/config/."""
    config_map = {
        "aws": "cloud/aws/aws-config.json",
        "azure": "cloud/azure/azure-config.json",
        "gcp": "cloud/gcp/gcp-config.json",
        "k8s": "k8s/k8s-config.json",
        "terraform": "terraform/terraform-config.json",
        "datadog": "monitoring/datadog/datadog-config.json",
        "grafana": "monitoring/grafana/grafana-config.json",
        "prometheus": "monitoring/prometheus/prometheus-config.json",
        "github": "ci/github/github-config.json",
        "gitlab": "ci/gitlab/gitlab-config.json",
        "jenkins": "ci/jenkins/jenkins-config.json",
    }
    path = CONFIG_DIR / config_map.get(tool, f"{tool}/{tool}-config.json")
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return {"error": f"Config not found for tool: {tool}", "path": str(path)}


if __name__ == "__main__":
    # Self-test
    logger = OpsLogger()
    logger.log("self_test", "ops_utils.py loaded and tested", "success")
    print(f"Repo root: {REPO_ROOT}")
    print(f"Config dir: {CONFIG_DIR}")
    print(f"Log file: {LOG_FILE}")
    print("Available configs:", list(load_config.__code__.co_consts))
