"""
Autopilot LangChain Orchestrator
================================
Intelligent agent that replaces rigid shell-script decision trees
with context-aware AI reasoning.

Zero cost: uses Claude API (via ANTHROPIC_API_KEY) inside GitHub Actions.

Usage:
    python orchestrator.py --task "analyze-ci-failure" \
        --workspace "ws-default" \
        --context "npm test failed with exit code 1 in agent repo"
"""

import argparse
import json
import os
import sys

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

from memory import build_context_summary
from tools import ALL_TOOLS


SYSTEM_PROMPT = """You are the Autopilot Orchestrator — an AI agent managing CI/CD releases
for corporate repositories via GitHub Actions.

## YOUR CAPABILITIES
You have tools to:
- Read workspace config, release state, health, session locks, improvement reports
- Trigger workflows: source changes, CI fixes, health checks, backups, improvement scans
- Create handoffs to other agents (Claude Code, Codex, ChatGPT)

## RULES (non-negotiable)
1. ALWAYS check session lock before any state-changing operation
2. If another agent holds the lock, create a handoff — NEVER force
3. Never expose secrets, tokens, or internal URLs in your output
4. Use workspace_id from context — never hardcode
5. Prefer the simplest action that solves the problem
6. When uncertain, create a handoff to Claude Code for complex decisions

## TASK TYPES

### analyze-ci-failure
1. Read release state → check last CI result
2. Read health → check for pre-existing issues
3. Decide: is this a new failure or pre-existing?
4. If new: trigger fix-ci workflow
5. If pre-existing: log and skip

### smart-release
1. Check session lock
2. Read release state for the component
3. Read health — abort if critical
4. Check improvement report — abort if score < 50
5. Trigger the release if safe

### triage-handoff
1. Read pending handoffs
2. Analyze each one's priority and context
3. Decide which agent is best suited
4. Create new handoffs if needed

### health-response
1. Read health check results
2. Identify failed checks
3. For each failure, decide the remediation action
4. Execute fixes or create handoffs

## OUTPUT
Always respond with a JSON object:
{
  "task": "<task name>",
  "decision": "<what you decided to do and why>",
  "actions_taken": ["<list of actions executed>"],
  "next_steps": ["<recommendations for follow-up>"],
  "status": "success|partial|blocked"
}
"""


def run_orchestrator(task: str, workspace_id: str, context: str) -> dict:
    """Run the LangChain orchestrator agent."""
    # Build memory context from state branch
    state_context = build_context_summary(workspace_id)

    # Initialize Claude model
    model = ChatAnthropic(
        model="claude-sonnet-4-20250514",
        max_tokens=4096,
        temperature=0,
    )

    # Bind tools
    model_with_tools = model.bind_tools(ALL_TOOLS)

    # Build the prompt
    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=f"""## Current State
{state_context}

## Task
Type: {task}
Workspace: {workspace_id}
Context: {context}

Execute this task using your tools. Check the session lock first if needed.
Respond with the JSON output format specified in your instructions."""),
    ]

    # Agent loop — execute tool calls until done
    max_iterations = 10
    for i in range(max_iterations):
        response = model_with_tools.invoke(messages)
        messages.append(response)

        # If no tool calls, we're done
        if not response.tool_calls:
            break

        # Execute each tool call
        from langchain_core.messages import ToolMessage
        for tool_call in response.tool_calls:
            # Find the matching tool
            tool_fn = None
            for t in ALL_TOOLS:
                if t.name == tool_call["name"]:
                    tool_fn = t
                    break

            if tool_fn is None:
                tool_result = json.dumps({"error": f"Unknown tool: {tool_call['name']}"})
            else:
                try:
                    result = tool_fn.invoke(tool_call["args"])
                    tool_result = json.dumps(result) if isinstance(result, dict) else str(result)
                except Exception as e:
                    tool_result = json.dumps({"error": str(e)})

            messages.append(ToolMessage(
                content=tool_result,
                tool_call_id=tool_call["id"],
            ))

    # Extract final response
    final_text = response.content
    if isinstance(final_text, list):
        final_text = " ".join(
            block.get("text", "") for block in final_text
            if isinstance(block, dict) and block.get("type") == "text"
        )

    try:
        return json.loads(final_text)
    except (json.JSONDecodeError, TypeError):
        return {
            "task": task,
            "decision": final_text,
            "actions_taken": [],
            "next_steps": [],
            "status": "partial",
        }


def main():
    parser = argparse.ArgumentParser(description="Autopilot LangChain Orchestrator")
    parser.add_argument("--task", required=True, help="Task type to execute")
    parser.add_argument("--workspace", default="ws-default", help="Workspace ID")
    parser.add_argument("--context", default="", help="Additional context for the task")
    args = parser.parse_args()

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ERROR: ANTHROPIC_API_KEY not set", file=sys.stderr)
        sys.exit(1)

    result = run_orchestrator(args.task, args.workspace, args.context)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
