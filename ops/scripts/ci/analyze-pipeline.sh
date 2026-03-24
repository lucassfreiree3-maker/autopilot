#!/usr/bin/env bash
# =============================================================================
# analyze-pipeline.sh — CI/CD pipeline failure analyzer
# Supports: GitHub Actions, GitLab CI, Jenkins
# Usage: ./analyze-pipeline.sh <platform> <args>
# =============================================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()    { echo -e "${BLUE}[INFO]${NC} $*"; }
warn()   { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()  { echo -e "${RED}[ERROR]${NC} $*"; }
ok()     { echo -e "${GREEN}[OK]${NC} $*"; }

usage() {
  cat <<EOF
Usage: $(basename "$0") <platform> [args]

Platforms:
  github <owner/repo> [workflow] [run_id]    Analyze GitHub Actions
  gitlab <project_id> [pipeline_id]          Analyze GitLab CI
  jenkins <job_url> [build_number]           Analyze Jenkins

Examples:
  $(basename "$0") github myorg/myrepo deploy.yml
  $(basename "$0") github myorg/myrepo deploy.yml 12345
  $(basename "$0") gitlab 42 98765
  $(basename "$0") jenkins https://jenkins.example.com/job/deploy 42
EOF
}

analyze_github() {
  local repo="$1"
  local workflow="${2:-}"
  local run_id="${3:-}"

  log "Analyzing GitHub Actions for $repo..."

  if [ -n "$run_id" ]; then
    log "Fetching run #$run_id..."
    local run_data
    run_data=$(curl -sS "https://api.github.com/repos/$repo/actions/runs/$run_id" \
      -H "Accept: application/vnd.github.v3+json" \
      ${GITHUB_TOKEN:+-H "Authorization: Bearer $GITHUB_TOKEN"})

    echo "$run_data" | jq -r '{
      id: .id,
      status: .status,
      conclusion: .conclusion,
      workflow: .name,
      branch: .head_branch,
      created: .created_at,
      updated: .updated_at,
      url: .html_url
    }' 2>/dev/null

    log "Fetching jobs..."
    local jobs_data
    jobs_data=$(curl -sS "https://api.github.com/repos/$repo/actions/runs/$run_id/jobs" \
      -H "Accept: application/vnd.github.v3+json" \
      ${GITHUB_TOKEN:+-H "Authorization: Bearer $GITHUB_TOKEN"})

    echo "$jobs_data" | jq -r '.jobs[] | {
      name: .name,
      status: .status,
      conclusion: .conclusion,
      failed_steps: [.steps[] | select(.conclusion == "failure") | .name]
    }' 2>/dev/null

  elif [ -n "$workflow" ]; then
    log "Fetching recent runs for workflow: $workflow..."
    curl -sS "https://api.github.com/repos/$repo/actions/workflows/$workflow/runs?per_page=5" \
      -H "Accept: application/vnd.github.v3+json" \
      ${GITHUB_TOKEN:+-H "Authorization: Bearer $GITHUB_TOKEN"} | \
      jq -r '.workflow_runs[] | "\(.id) | \(.status)/\(.conclusion // "pending") | \(.created_at) | \(.head_branch)"' 2>/dev/null

  else
    log "Fetching recent runs for all workflows..."
    curl -sS "https://api.github.com/repos/$repo/actions/runs?per_page=10" \
      -H "Accept: application/vnd.github.v3+json" \
      ${GITHUB_TOKEN:+-H "Authorization: Bearer $GITHUB_TOKEN"} | \
      jq -r '.workflow_runs[] | "\(.id) | \(.name) | \(.status)/\(.conclusion // "pending") | \(.created_at)"' 2>/dev/null
  fi
}

analyze_gitlab() {
  local project_id="$1"
  local pipeline_id="${2:-}"

  if [ -z "${GITLAB_TOKEN:-}" ]; then
    error "GITLAB_TOKEN not set"
    return 1
  fi

  local base_url="${GITLAB_URL:-https://gitlab.com}"

  if [ -n "$pipeline_id" ]; then
    log "Fetching pipeline #$pipeline_id for project $project_id..."
    curl -sS "$base_url/api/v4/projects/$project_id/pipelines/$pipeline_id" \
      -H "PRIVATE-TOKEN: $GITLAB_TOKEN" | jq '.' 2>/dev/null

    log "Fetching jobs..."
    curl -sS "$base_url/api/v4/projects/$project_id/pipelines/$pipeline_id/jobs" \
      -H "PRIVATE-TOKEN: $GITLAB_TOKEN" | \
      jq -r '.[] | "\(.id) | \(.name) | \(.stage) | \(.status) | \(.duration)s"' 2>/dev/null

    log "Failed jobs:"
    curl -sS "$base_url/api/v4/projects/$project_id/pipelines/$pipeline_id/jobs" \
      -H "PRIVATE-TOKEN: $GITLAB_TOKEN" | \
      jq -r '.[] | select(.status == "failed") | {name: .name, stage: .stage, failure_reason: .failure_reason, web_url: .web_url}' 2>/dev/null
  else
    log "Fetching recent pipelines..."
    curl -sS "$base_url/api/v4/projects/$project_id/pipelines?per_page=10" \
      -H "PRIVATE-TOKEN: $GITLAB_TOKEN" | \
      jq -r '.[] | "\(.id) | \(.status) | \(.ref) | \(.created_at)"' 2>/dev/null
  fi
}

analyze_jenkins() {
  local job_url="$1"
  local build="${2:-lastBuild}"

  if [ -z "${JENKINS_USER:-}" ] || [ -z "${JENKINS_TOKEN:-}" ]; then
    error "JENKINS_USER and JENKINS_TOKEN must be set"
    return 1
  fi

  log "Fetching build $build..."
  curl -sS "$job_url/$build/api/json" \
    -u "$JENKINS_USER:$JENKINS_TOKEN" | \
    jq '{
      number: .number,
      result: .result,
      duration_ms: .duration,
      timestamp: .timestamp,
      url: .url,
      building: .building
    }' 2>/dev/null

  log "Console output (last 100 lines)..."
  curl -sS "$job_url/$build/consoleText" \
    -u "$JENKINS_USER:$JENKINS_TOKEN" | tail -100
}

# Main
if [ $# -lt 1 ]; then usage; exit 1; fi

PLATFORM="$1"
shift

case "$PLATFORM" in
  github)  analyze_github "$@" ;;
  gitlab)  analyze_gitlab "$@" ;;
  jenkins) analyze_jenkins "$@" ;;
  *)       error "Unknown platform: $PLATFORM"; usage; exit 1 ;;
esac
