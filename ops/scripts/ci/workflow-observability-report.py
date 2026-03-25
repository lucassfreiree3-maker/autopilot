#!/usr/bin/env python3
"""Generate a workflow topology/observability report for GitHub Actions workflows.

Safe-by-design: read-only analysis of `.github/workflows/*.yml`.
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[3]
WORKFLOW_DIR = ROOT / ".github" / "workflows"
OUT_DIR = ROOT / "ops" / "inventory"
MD_FILE = OUT_DIR / "workflow-topology.md"
JSON_FILE = OUT_DIR / "workflow-topology.json"

KEYWORDS = {
    "github": ["gh ", "actions/checkout", "github"],
    "kubernetes": ["kubectl", "kustomize", "helm", "k8s"],
    "terraform": ["terraform", "terragrunt", "tf-"],
    "cloud-aws": ["aws ", "configure-aws-credentials"],
    "cloud-azure": ["azure", "az "],
    "cloud-gcp": ["gcloud", "google-github-actions"],
    "containers": ["docker", "buildx", "podman"],
    "python": ["python", "pip", "pytest"],
    "node": ["node", "npm", "yarn", "pnpm"],
    "ci-platforms": ["gitlab", "jenkins"],
}


def text_blob(job: dict) -> str:
    parts: list[str] = []
    if isinstance(job, dict):
        if "uses" in job and isinstance(job["uses"], str):
            parts.append(job["uses"])
        for step in job.get("steps", []):
            if isinstance(step, dict):
                parts.append(str(step.get("uses", "")))
                parts.append(str(step.get("run", "")))
                parts.append(str(step.get("name", "")))
    return "\n".join(parts).lower()


def detect_tools(jobs: dict) -> list[str]:
    blob = "\n".join(text_blob(job) for job in jobs.values() if isinstance(job, dict))
    detected = [tool for tool, patterns in KEYWORDS.items() if any(p in blob for p in patterns)]
    return sorted(detected)


def classify(name: str) -> str:
    if name.startswith("[") and "]" in name:
        return name.split("]", 1)[0] + "]"
    if name.startswith("Ops:"):
        return "Ops"
    return "Other"


def parse_workflow(path: Path) -> dict:
    data = yaml.safe_load(path.read_text()) or {}
    name = str(data.get("name", path.name))
    on_value = data.get("on", data.get(True, {}))
    if isinstance(on_value, dict):
        triggers = sorted(on_value.keys())
    elif isinstance(on_value, list):
        triggers = sorted(str(x) for x in on_value)
    else:
        triggers = [str(on_value)]

    dispatch_inputs = {}
    if isinstance(on_value, dict):
        dispatch_inputs = (
            on_value.get("workflow_dispatch", {}).get("inputs", {})
            if isinstance(on_value.get("workflow_dispatch"), dict)
            else {}
        )

    jobs = data.get("jobs", {}) if isinstance(data.get("jobs", {}), dict) else {}
    job_names = []
    for job_id, job in jobs.items():
        if isinstance(job, dict):
            job_names.append(str(job.get("name", job_id)))
        else:
            job_names.append(str(job_id))

    return {
        "file": str(path.relative_to(ROOT)),
        "name": name,
        "category": classify(name),
        "triggers": triggers,
        "workspace_aware": "workspace_id" in dispatch_inputs,
        "jobs_total": len(jobs),
        "job_names": job_names,
        "tools": detect_tools(jobs),
    }


def build_markdown(items: list[dict]) -> str:
    category_counts = Counter(item["category"] for item in items)
    workspace_aware_count = sum(1 for item in items if item["workspace_aware"])

    lines = [
        "# Workflow Topology & Observability Report",
        "",
        f"- Total workflows: **{len(items)}**",
        f"- Workspace-aware (`workflow_dispatch.inputs.workspace_id`): **{workspace_aware_count}**",
        "",
        "## Workflows by Category",
        "",
        "| Category | Count |",
        "|---|---:|",
    ]

    for category, count in sorted(category_counts.items()):
        lines.append(f"| {category} | {count} |")

    lines += [
        "",
        "## Workflow Inventory",
        "",
        "| Workflow | File | Triggers | Jobs | Workspace | Tools/Integrations |",
        "|---|---|---|---:|---|---|",
    ]

    for item in sorted(items, key=lambda x: x["name"].lower()):
        triggers = ", ".join(item["triggers"]) if item["triggers"] else "-"
        tools = ", ".join(item["tools"]) if item["tools"] else "-"
        workspace = "yes" if item["workspace_aware"] else "no"
        lines.append(
            f"| {item['name']} | `{item['file']}` | {triggers} | {item['jobs_total']} | {workspace} | {tools} |"
        )

    lines += [
        "",
        "## Notes",
        "",
        "- This report is read-only and does not alter any workflow behavior.",
        "- Use this inventory to spot low-visibility flows, missing workspace context, and integration concentration.",
    ]

    return "\n".join(lines) + "\n"


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    workflow_files = sorted(WORKFLOW_DIR.glob("*.yml"))
    items = [parse_workflow(path) for path in workflow_files]

    MD_FILE.write_text(build_markdown(items))
    JSON_FILE.write_text(json.dumps(items, indent=2) + "\n")

    print(f"Generated: {MD_FILE}")
    print(f"Generated: {JSON_FILE}")


if __name__ == "__main__":
    main()
