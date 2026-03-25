"""
Custom LangChain tools for Autopilot operations.
All tools use GitHub CLI (gh) — zero infrastructure cost.
"""

import json
import subprocess
from typing import Optional

from langchain_core.tools import tool

REPO = "lucassfreiree/autopilot"
STATE_BRANCH = "autopilot-state"


def _gh_api(endpoint: str) -> dict:
    """Call GitHub API via gh CLI."""
    result = subprocess.run(
        ["gh", "api", endpoint, "--jq", ".content"],
        capture_output=True, text=True, timeout=30
    )
    if result.returncode != 0:
        return {"error": result.stderr.strip()}
    import base64
    try:
        decoded = base64.b64decode(result.stdout.strip()).decode("utf-8")
        return json.loads(decoded)
    except Exception as e:
        return {"error": str(e), "raw": result.stdout[:200]}


def _dispatch_workflow(workflow: str, inputs: dict) -> str:
    """Dispatch a GitHub Actions workflow."""
    cmd = [
        "gh", "api",
        f"repos/{REPO}/actions/workflows/{workflow}/dispatches",
        "--method", "POST",
        "-f", "ref=main",
    ]
    for key, value in inputs.items():
        cmd.extend(["-f", f"inputs[{key}]={value}"])
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        return f"ERROR: {result.stderr.strip()}"
    return "OK: workflow dispatched"


@tool
def read_workspace_config(workspace_id: str = "ws-default") -> dict:
    """Read workspace configuration from autopilot-state branch.
    Returns repo names, branches, paths, and settings for the workspace."""
    return _gh_api(
        f"repos/{REPO}/contents/state/workspaces/{workspace_id}/workspace.json?ref={STATE_BRANCH}"
    )


@tool
def read_release_state(workspace_id: str = "ws-default", component: str = "agent") -> dict:
    """Read current release state for a component (agent or controller).
    Returns last SHA, tag, version, status, and promotion history."""
    return _gh_api(
        f"repos/{REPO}/contents/state/workspaces/{workspace_id}/{component}-release-state.json?ref={STATE_BRANCH}"
    )


@tool
def read_health(workspace_id: str = "ws-default") -> dict:
    """Read health check results for a workspace.
    Returns overall status and individual check results."""
    return _gh_api(
        f"repos/{REPO}/contents/state/workspaces/{workspace_id}/health.json?ref={STATE_BRANCH}"
    )


@tool
def read_session_lock(workspace_id: str = "ws-default") -> dict:
    """Read the current session lock to check if another agent is active.
    ALWAYS check this before any state-changing operation."""
    return _gh_api(
        f"repos/{REPO}/contents/state/workspaces/{workspace_id}/locks/session-lock.json?ref={STATE_BRANCH}"
    )


@tool
def read_improvement_report(workspace_id: str = "ws-default") -> dict:
    """Read the latest continuous improvement report.
    Returns health score, issues found, trend direction."""
    return _gh_api(
        f"repos/{REPO}/contents/state/workspaces/{workspace_id}/improvements/latest-report.json?ref={STATE_BRANCH}"
    )


@tool
def trigger_source_change(
    workspace_id: str,
    component: str,
    change_type: str,
    target_path: str,
    file_content: str,
    commit_message: str,
    promote: bool = True,
) -> str:
    """Trigger the apply-source-change pipeline to modify corporate repo code.
    This is the primary way to make code changes."""
    return _dispatch_workflow("apply-source-change.yml", {
        "workspace_id": workspace_id,
        "component": component,
        "change_type": change_type,
        "target_path": target_path,
        "file_content": file_content,
        "commit_message": commit_message,
        "promote": str(promote).lower(),
    })


@tool
def trigger_health_check(workspace_id: str = "ws-default") -> str:
    """Run a health check on the workspace."""
    return _dispatch_workflow("health-check.yml", {
        "workspace_id": workspace_id,
    })


@tool
def trigger_fix_ci(workspace_id: str = "ws-default") -> str:
    """Trigger the CI fix workflow to auto-fix lint errors."""
    return _dispatch_workflow("fix-corporate-ci.yml", {
        "workspace_id": workspace_id,
    })


@tool
def create_agent_handoff(
    from_agent: str,
    to_agent: str,
    summary: str,
    component: str = "agent",
    priority: str = "normal",
    workspace_id: str = "ws-default",
) -> str:
    """Create a handoff from one agent to another.
    Use when the current agent can't complete a task and needs delegation."""
    return _dispatch_workflow("enqueue-agent-handoff.yml", {
        "workspace_id": workspace_id,
        "from_agent": from_agent,
        "to_agent": to_agent,
        "component": component,
        "summary": summary,
        "priority": priority,
    })


@tool
def trigger_backup(workspace_id: str = "ws-default") -> str:
    """Create a backup snapshot of the current state."""
    return _dispatch_workflow("backup-state.yml", {
        "workspace_id": workspace_id,
    })


@tool
def trigger_improvement_scan(workspace_id: str = "ws-default", auto_fix: str = "true") -> str:
    """Run the continuous improvement pipeline to scan for issues and auto-fix."""
    return _dispatch_workflow("continuous-improvement.yml", {
        "workspace_id": workspace_id,
        "auto_fix": auto_fix,
    })


# All tools exported for the orchestrator
ALL_TOOLS = [
    read_workspace_config,
    read_release_state,
    read_health,
    read_session_lock,
    read_improvement_report,
    trigger_source_change,
    trigger_health_check,
    trigger_fix_ci,
    create_agent_handoff,
    trigger_backup,
    trigger_improvement_scan,
]
