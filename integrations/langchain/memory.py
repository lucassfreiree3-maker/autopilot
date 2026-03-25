"""
RAG memory backed by autopilot-state branch.
Provides context from past releases, audit entries, and improvement reports.
Zero cost — reads directly from GitHub API.
"""

import json
import subprocess
from datetime import datetime, timezone
from typing import Optional

REPO = "lucassfreiree/autopilot"
STATE_BRANCH = "autopilot-state"


def _gh_list(path: str) -> list[str]:
    """List files in a state directory."""
    result = subprocess.run(
        ["gh", "api", f"repos/{REPO}/contents/{path}?ref={STATE_BRANCH}",
         "--jq", ".[].name"],
        capture_output=True, text=True, timeout=30
    )
    if result.returncode != 0:
        return []
    return [line.strip() for line in result.stdout.strip().split("\n") if line.strip()]


def _gh_read(path: str) -> Optional[dict]:
    """Read a JSON file from state branch."""
    result = subprocess.run(
        ["gh", "api", f"repos/{REPO}/contents/{path}?ref={STATE_BRANCH}",
         "--jq", ".content"],
        capture_output=True, text=True, timeout=30
    )
    if result.returncode != 0:
        return None
    import base64
    try:
        decoded = base64.b64decode(result.stdout.strip()).decode("utf-8")
        return json.loads(decoded)
    except Exception:
        return None


def get_recent_audit_entries(workspace_id: str = "ws-default", limit: int = 10) -> list[dict]:
    """Fetch the most recent audit entries (sorted by timestamp desc)."""
    path = f"state/workspaces/{workspace_id}/audit"
    files = _gh_list(path)
    # Audit files are named like: operation-TIMESTAMP.json, sort desc
    files.sort(reverse=True)
    entries = []
    for f in files[:limit]:
        entry = _gh_read(f"{path}/{f}")
        if entry:
            entries.append(entry)
    return entries


def get_release_history(workspace_id: str = "ws-default") -> dict:
    """Get current release state for both components."""
    agent = _gh_read(f"state/workspaces/{workspace_id}/agent-release-state.json")
    controller = _gh_read(f"state/workspaces/{workspace_id}/controller-release-state.json")
    return {"agent": agent, "controller": controller}


def get_improvement_trend(workspace_id: str = "ws-default") -> Optional[dict]:
    """Get the latest improvement report with trend data."""
    return _gh_read(f"state/workspaces/{workspace_id}/improvements/latest-report.json")


def get_active_handoffs(workspace_id: str = "ws-default") -> list[dict]:
    """Get pending handoffs that need attention."""
    path = f"state/workspaces/{workspace_id}/handoffs"
    files = _gh_list(path)
    handoffs = []
    for f in files:
        h = _gh_read(f"{path}/{f}")
        if h and h.get("status") in ("pending", "in-progress"):
            handoffs.append(h)
    return handoffs


def build_context_summary(workspace_id: str = "ws-default") -> str:
    """Build a text summary of current project state for the LLM context."""
    lines = [f"=== Autopilot Context for {workspace_id} ===", ""]

    # Release state
    releases = get_release_history(workspace_id)
    for comp in ("agent", "controller"):
        r = releases.get(comp)
        if r:
            lines.append(f"[{comp}] version={r.get('lastVersion', '?')} "
                         f"status={r.get('status', '?')} "
                         f"sha={r.get('lastReleasedSha', '?')[:8]} "
                         f"updated={r.get('updatedAt', '?')}")

    # Improvement
    report = get_improvement_trend(workspace_id)
    if report:
        lines.append(f"\n[Health] score={report.get('healthScore', '?')}/100 "
                     f"trend={report.get('trend', {}).get('direction', '?')} "
                     f"issues={report.get('totalIssues', '?')}")

    # Pending handoffs
    handoffs = get_active_handoffs(workspace_id)
    if handoffs:
        lines.append(f"\n[Handoffs] {len(handoffs)} pending:")
        for h in handoffs[:3]:
            lines.append(f"  - from={h.get('fromAgent')} to={h.get('toAgent')} "
                         f"priority={h.get('priority')} summary={h.get('context', {}).get('summary', '?')[:60]}")

    # Recent audit
    audits = get_recent_audit_entries(workspace_id, limit=5)
    if audits:
        lines.append(f"\n[Recent operations]:")
        for a in audits:
            lines.append(f"  - {a.get('operation', '?')} status={a.get('status', '?')} "
                         f"at={a.get('timestamp', '?')}")

    return "\n".join(lines)
