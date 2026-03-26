#!/usr/bin/env bash
set -euo pipefail

# Preflight validation for autopilot repo before pushing to CI/pipeline.

echo "[INFO] preflight: validating shell scripts"
bash -n scripts/codex/auto-pr-merge.sh
[[ -f scripts/codex/sync-autopilot-product.sh ]] && bash -n scripts/codex/sync-autopilot-product.sh
[[ -f scripts/codex/monitor-commit-builds.sh ]] && bash -n scripts/codex/monitor-commit-builds.sh

echo "[INFO] preflight: validating key JSON contracts"
python -m json.tool contracts/codex-agent-contract.json >/dev/null
[[ -f contracts/claude-session-memory.json ]] && python -m json.tool contracts/claude-session-memory.json >/dev/null

echo "[INFO] preflight: validating workflow YAML files"
ruby -e 'require "yaml"; Dir.glob(".github/workflows/*.yml").sort.each { |f| YAML.load_file(f) }; puts "YAML OK"'

echo "[DONE] preflight checks passed."
