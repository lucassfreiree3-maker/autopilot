# ROBUSTNESS: No set -e, no pipefail. Every command has explicit fallback.
# This script MUST NOT fail — dashboard sync is critical infrastructure.

# ── Helper: safe API fetch with JSON validation ──
safe_api() {
  local result
  result=$(gh api "$1" --jq "$2" 2>/dev/null) || true
  if [ -z "$result" ] || ! echo "$result" | jq empty 2>/dev/null; then
    echo "$3"
  else
    echo "$result"
  fi
}

# ── Helper: safe base64 decode from API content field ──
safe_content() {
  local raw
  raw=$(gh api "$1" --jq '.content' 2>/dev/null) || true
  if [ -n "$raw" ]; then
    local decoded
    decoded=$(echo "$raw" | base64 -d 2>/dev/null) || true
    if [ -n "$decoded" ] && echo "$decoded" | jq empty 2>/dev/null; then
      echo "$decoded"
      return
    fi
  fi
  echo "$2"
}

# ── Helper: safe base64 decode (non-JSON, e.g. YAML) ──
safe_content_raw() {
  local raw
  raw=$(gh api "$1" --jq '.content' 2>/dev/null) || true
  if [ -n "$raw" ]; then
    echo "$raw" | base64 -d 2>/dev/null || echo ""
  else
    echo ""
  fi
}

REPO="$GITHUB_REPOSITORY"

# ── Release states from autopilot-state ──
CTRL_STATE=$(safe_content "repos/$REPO/contents/state/workspaces/ws-default/controller-release-state.json?ref=autopilot-state" '{}')
AGENT_STATE=$(safe_content "repos/$REPO/contents/state/workspaces/ws-default/agent-release-state.json?ref=autopilot-state" '{}')

# ── Local files ──
TRIGGER=$(cat trigger/source-change.json 2>/dev/null || echo '{}')
echo "$TRIGGER" | jq empty 2>/dev/null || TRIGGER='{}'
COPILOT_MEM=$(cat contracts/copilot-session-memory.json 2>/dev/null || echo '{"sessionCount":0,"lessonsLearned":[],"sessionsLog":[]}')
echo "$COPILOT_MEM" | jq empty 2>/dev/null || COPILOT_MEM='{"sessionCount":0,"lessonsLearned":[],"sessionsLog":[]}'
CODEX_MEM=$(cat contracts/codex-session-memory.json 2>/dev/null || echo '{"sessionCount":0,"lessonsLearned":[],"sessionsLog":[]}')
echo "$CODEX_MEM" | jq empty 2>/dev/null || CODEX_MEM='{"sessionCount":0,"lessonsLearned":[],"sessionsLog":[]}'
CLAUDE_STATUS=$(cat contracts/claude-live-status.json 2>/dev/null || echo '{"currentSession":{"status":"idle","task":null},"operationalState":{},"lastUpdatedBy":"unknown"}')
echo "$CLAUDE_STATUS" | jq empty 2>/dev/null || CLAUDE_STATUS='{"currentSession":{"status":"idle","task":null}}'
CLAUDE_MEM=$(cat contracts/claude-session-memory.json 2>/dev/null || echo '{}')
echo "$CLAUDE_MEM" | jq empty 2>/dev/null || CLAUDE_MEM='{}'

# ── Recent workflow runs ──
RECENT_RUNS=$(safe_api "repos/$REPO/actions/runs?per_page=20" '[.workflow_runs[:20] | .[] | {name: .name, status: .status, conclusion: .conclusion, created: .created_at, url: .html_url, run_number: .run_number, head_branch: .head_branch, event: .event}]' '[]')

# ── Open PRs ──
OPEN_PRS=$(safe_api "repos/$REPO/pulls?state=open&per_page=10" '[.[] | {number: .number, title: .title, author: .user.login, branch: .head.ref, draft: .draft, created: .created_at}]' '[]')

# ── Recent deploys from audit ──
DEPLOY_HISTORY=$(safe_api "repos/$REPO/git/trees/autopilot-state?recursive=1" '[.tree[] | select(.path | test("audit/source-change")) | .path] | sort | reverse | .[:20]' '[]')

# ── Session lock status ──
SESSION_LOCK=$(safe_content "repos/$REPO/contents/state/workspaces/ws-default/locks/session-lock.json?ref=autopilot-state" '{"agentId":"none"}')

# ── Health state ──
HEALTH=$(safe_content "repos/$REPO/contents/state/workspaces/ws-default/health.json?ref=autopilot-state" '{}')

# ── CI Monitor state ──
CI_MONITOR=$(safe_content "repos/$REPO/contents/state/workspaces/ws-default/ci-monitor-controller.json?ref=autopilot-state" '{}')

# ── Deploy Pipeline Monitor state ──
PIPELINE_STATUS=$(safe_content "repos/$REPO/contents/state/workspaces/ws-default/pipeline-status.json?ref=autopilot-state" '{}')

# ══════════════════════════════════════════════════════════
# ── REAL CORPORATE VERSIONS (source of truth from repos) ──
# ══════════════════════════════════════════════════════════

CTRL_REAL_VER="?"
AGENT_REAL_VER="?"
CTRL_CAP_TAG="?"
AGENT_CAP_TAG="?"
CTRL_LATEST_COMMITS="[]"
AGENT_LATEST_COMMITS="[]"

if [ -n "$BBVINET_TOKEN" ]; then
  # Controller source version
  CTRL_PKG_RAW=$(GH_TOKEN="$BBVINET_TOKEN" safe_content_raw "repos/bbvinet/psc-sre-automacao-controller/contents/package.json")
  if [ -n "$CTRL_PKG_RAW" ]; then
    CTRL_REAL_VER=$(echo "$CTRL_PKG_RAW" | jq -r '.version // "?"' 2>/dev/null || echo "?")
  fi

  # Agent source version
  AGENT_PKG_RAW=$(GH_TOKEN="$BBVINET_TOKEN" safe_content_raw "repos/bbvinet/psc-sre-automacao-agent/contents/package.json")
  if [ -n "$AGENT_PKG_RAW" ]; then
    AGENT_REAL_VER=$(echo "$AGENT_PKG_RAW" | jq -r '.version // "?"' 2>/dev/null || echo "?")
  fi

  # Controller CAP tag
  CTRL_CAP_RAW=$(GH_TOKEN="$BBVINET_TOKEN" safe_content_raw "repos/bbvinet/psc_releases_cap_sre-aut-controller/contents/releases/openshift/hml/deploy/values.yaml")
  if [ -n "$CTRL_CAP_RAW" ]; then
    CTRL_CAP_TAG=$(echo "$CTRL_CAP_RAW" | grep -oP 'psc-sre-automacao-controller:\K[0-9]+\.[0-9]+\.[0-9]+' 2>/dev/null || echo "?")
  fi

  # Agent CAP tag
  AGENT_CAP_RAW=$(GH_TOKEN="$BBVINET_TOKEN" safe_content_raw "repos/bbvinet/psc_releases_cap_sre-aut-agent/contents/releases/openshift/hml/deploy/values.yaml")
  if [ -n "$AGENT_CAP_RAW" ]; then
    AGENT_CAP_TAG=$(echo "$AGENT_CAP_RAW" | grep -oP 'psc-sre-automacao-agent:\K[0-9]+\.[0-9]+\.[0-9]+' 2>/dev/null || echo "?")
  fi

  # Recent commits
  CTRL_LATEST_COMMITS=$(GH_TOKEN="$BBVINET_TOKEN" safe_api "repos/bbvinet/psc-sre-automacao-controller/commits?per_page=5" '[.[:5] | .[] | {sha: .sha[:8], message: .commit.message[:80], author: .commit.author.name, date: .commit.author.date}]' '[]')
  AGENT_LATEST_COMMITS=$(GH_TOKEN="$BBVINET_TOKEN" safe_api "repos/bbvinet/psc-sre-automacao-agent/commits?per_page=5" '[.[:5] | .[] | {sha: .sha[:8], message: .commit.message[:80], author: .commit.author.name, date: .commit.author.date}]' '[]')
fi

echo "::notice ::Real versions — Controller: $CTRL_REAL_VER (CAP: $CTRL_CAP_TAG), Agent: $AGENT_REAL_VER (CAP: $AGENT_CAP_TAG)"

# ══════════════════════════════════════════════════════════
# ── BUILD STATUS per commit ──
# ══════════════════════════════════════════════════════════
CTRL_BUILDS="[]"
AGENT_BUILDS="[]"

if [ -n "$BBVINET_TOKEN" ]; then
  # Controller builds — safe iteration
  CTRL_SHAS=$(GH_TOKEN="$BBVINET_TOKEN" gh api "repos/bbvinet/psc-sre-automacao-controller/commits?per_page=3" --jq '.[].sha' 2>/dev/null || echo "")
  for SHA in $CTRL_SHAS; do
    BUILD=$(GH_TOKEN="$BBVINET_TOKEN" gh api "repos/bbvinet/psc-sre-automacao-controller/commits/$SHA/check-runs" --jq '{sha: "'${SHA:0:8}'", total: .total_count, checks: [.check_runs[:5][] | {name: .name, status: .status, conclusion: .conclusion}]}' 2>/dev/null || echo '{}')
    if echo "$BUILD" | jq empty 2>/dev/null && [ "$BUILD" != "{}" ]; then
      CTRL_BUILDS=$(echo "$CTRL_BUILDS" | jq --argjson b "$BUILD" '. + [$b]' 2>/dev/null || echo "$CTRL_BUILDS")
    fi
  done

  # Agent builds — safe iteration
  AGENT_SHAS=$(GH_TOKEN="$BBVINET_TOKEN" gh api "repos/bbvinet/psc-sre-automacao-agent/commits?per_page=3" --jq '.[].sha' 2>/dev/null || echo "")
  for SHA in $AGENT_SHAS; do
    BUILD=$(GH_TOKEN="$BBVINET_TOKEN" gh api "repos/bbvinet/psc-sre-automacao-agent/commits/$SHA/check-runs" --jq '{sha: "'${SHA:0:8}'", total: .total_count, checks: [.check_runs[:5][] | {name: .name, status: .status, conclusion: .conclusion}]}' 2>/dev/null || echo '{}')
    if echo "$BUILD" | jq empty 2>/dev/null && [ "$BUILD" != "{}" ]; then
      AGENT_BUILDS=$(echo "$AGENT_BUILDS" | jq --argjson b "$BUILD" '. + [$b]' 2>/dev/null || echo "$AGENT_BUILDS")
    fi
  done
fi

# ══════════════════════════════════════════════════════════
# ── BRANCH & ACTIVITY INTELLIGENCE                       ──
# ══════════════════════════════════════════════════════════
CTRL_BRANCHES="[]"
AGENT_BRANCHES="[]"
CTRL_PRS="[]"
AGENT_PRS="[]"

if [ -n "$BBVINET_TOKEN" ]; then
  CTRL_BRANCHES=$(GH_TOKEN="$BBVINET_TOKEN" safe_api "repos/bbvinet/psc-sre-automacao-controller/branches?per_page=20" '[.[] | {name: .name, sha: .commit.sha[:8], protected: .protected}]' '[]')
  AGENT_BRANCHES=$(GH_TOKEN="$BBVINET_TOKEN" safe_api "repos/bbvinet/psc-sre-automacao-agent/branches?per_page=20" '[.[] | {name: .name, sha: .commit.sha[:8], protected: .protected}]' '[]')
  CTRL_PRS=$(GH_TOKEN="$BBVINET_TOKEN" safe_api "repos/bbvinet/psc-sre-automacao-controller/pulls?state=open&per_page=10" '[.[] | {number: .number, title: .title, author: .user.login, branch: .head.ref, created: .created_at, draft: .draft}]' '[]')
  AGENT_PRS=$(GH_TOKEN="$BBVINET_TOKEN" safe_api "repos/bbvinet/psc-sre-automacao-agent/pulls?state=open&per_page=10" '[.[] | {number: .number, title: .title, author: .user.login, branch: .head.ref, created: .created_at, draft: .draft}]' '[]')
fi

CTRL_EXTERNAL_COMMITS=$(echo "$CTRL_LATEST_COMMITS" | jq '[.[] | select(.author != "github-actions[bot]" and .author != "github-actions")]' 2>/dev/null || echo '[]')
AGENT_EXTERNAL_COMMITS=$(echo "$AGENT_LATEST_COMMITS" | jq '[.[] | select(.author != "github-actions[bot]" and .author != "github-actions")]' 2>/dev/null || echo '[]')

echo "::notice ::Versions — Ctrl: $CTRL_REAL_VER (CAP: $CTRL_CAP_TAG), Agent: $AGENT_REAL_VER (CAP: $AGENT_CAP_TAG)"

# ── Pre-validate improvements (inline command substitution is fragile) ──
IMPROVEMENTS=$(cat contracts/improvement-history.json 2>/dev/null | jq -c '{summary:.summary,count:(.improvements|length),latest:(.improvements[:3]|map({id,date,type,title,"impact":.impact}))}' 2>/dev/null || echo 'null')
echo "$IMPROVEMENTS" | jq empty 2>/dev/null || IMPROVEMENTS='null'

# ── Build comprehensive state.json ──
# All --argjson vars have been pre-validated as valid JSON above.
jq -n \
  --argjson ctrl "$CTRL_STATE" \
  --argjson agent "$AGENT_STATE" \
  --argjson trigger "$TRIGGER" \
  --argjson copilot "$COPILOT_MEM" \
  --argjson codex "$CODEX_MEM" \
  --argjson claude "$CLAUDE_STATUS" \
  --argjson claude_mem "$CLAUDE_MEM" \
  --argjson runs "$RECENT_RUNS" \
  --argjson prs "$OPEN_PRS" \
  --argjson deploys "$DEPLOY_HISTORY" \
  --argjson lock "$SESSION_LOCK" \
  --argjson health "$HEALTH" \
  --argjson ci_monitor "$CI_MONITOR" \
  --arg ctrl_real "$CTRL_REAL_VER" \
  --arg agent_real "$AGENT_REAL_VER" \
  --arg ctrl_cap "$CTRL_CAP_TAG" \
  --arg agent_cap "$AGENT_CAP_TAG" \
  --argjson ctrl_commits "$CTRL_LATEST_COMMITS" \
  --argjson agent_commits "$AGENT_LATEST_COMMITS" \
  --argjson ctrl_builds "$CTRL_BUILDS" \
  --argjson agent_builds "$AGENT_BUILDS" \
  --argjson ctrl_branches "$CTRL_BRANCHES" \
  --argjson agent_branches "$AGENT_BRANCHES" \
  --argjson ctrl_prs "$CTRL_PRS" \
  --argjson agent_prs "$AGENT_PRS" \
  --argjson ctrl_ext "$CTRL_EXTERNAL_COMMITS" \
  --argjson agent_ext "$AGENT_EXTERNAL_COMMITS" \
  --argjson improvements "$IMPROVEMENTS" \
  --argjson pipeline_status "$PIPELINE_STATUS" \
  '{
    lastSync: now | strftime("%Y-%m-%dT%H:%M:%SZ"),
    syncSource: "autopilot/spark-sync-state.yml",

    controller: {
      version: (if $ctrl_cap != "?" then $ctrl_cap else ($ctrl.lastTag // $trigger.version // "?") end),
      status: ($ctrl.status // "unknown"),
      ciResult: ($ctrl.ciResult // "unknown"),
      promoted: ($ctrl.promoted // false),
      lastSha: ($ctrl.lastReleasedSha // "?"),
      updatedAt: ($ctrl.updatedAt // null),
      repo: "bbvinet/psc-sre-automacao-controller",
      capRepo: "bbvinet/psc_releases_cap_sre-aut-controller",
      stack: "Node 22, TypeScript, Express, Jest, SQLite, S3"
    },

    agent: {
      version: (if $agent_cap != "?" then $agent_cap else ($agent.lastTag // "?") end),
      status: ($agent.status // "unknown"),
      ciResult: ($agent.ciResult // "unknown"),
      promoted: ($agent.promoted // false),
      lastSha: ($agent.lastReleasedSha // "?"),
      updatedAt: ($agent.updatedAt // null),
      repo: "bbvinet/psc-sre-automacao-agent",
      capRepo: "bbvinet/psc_releases_cap_sre-aut-agent",
      stack: "Node 22, TypeScript, Express, Jest, K8s client"
    },

    pipeline: {
      status: ($copilot.currentState.pipelineStatus // "idle"),
      lastRun: ($trigger.run // 0),
      component: ($trigger.component // "?"),
      version: ($trigger.version // "?"),
      promote: ($trigger.promote // false),
      workspace: ($trigger._context // "?"),
      changeType: ($trigger.change_type // "?"),
      commitMessage: ($trigger.commit_message // "?"),
      changesCount: ($trigger.changes | length // 0)
    },

    agents: {
      claude: {
        status: ($claude.currentSession.status // "idle"),
        task: ($claude.currentSession.task // null),
        phase: ($claude.currentSession.phase // null),
        lastUpdated: ($claude.lastUpdated // null),
        lastAction: ($claude.lastCompletedAction.action // null)
      },
      copilot: {
        sessionCount: ($copilot.sessionCount // 0),
        lastSession: ($copilot.sessionsLog[-1].summary // "none"),
        lessonsCount: ($copilot.lessonsLearned | length),
        lastUpdated: ($copilot.lastUpdated // null),
        sessions: [($copilot.sessionsLog // [])[] | {date, summary, actions: (.actions | length)}] | .[-5:]
      },
      codex: {
        sessionCount: ($codex.sessionCount // 0),
        lastSession: ($codex.sessionsLog[-1].summary // "none"),
        lessonsCount: ($codex.lessonsLearned | length),
        lastUpdated: ($codex.lastUpdated // null),
        sessions: [($codex.sessionsLog // [])[] | {date, summary, actions: (.actions | length)}] | .[-5:]
      }
    },

    sessionLock: {
      agentId: ($lock.agentId // "none"),
      expiresAt: ($lock.expiresAt // null),
      acquiredAt: ($lock.acquiredAt // null),
      operation: ($lock.operation // null)
    },

    health: $health,
    ciMonitor: $ci_monitor,
    pipelineStatus: $pipeline_status,

    workspaces: [
      {
        id: "ws-default",
        company: "Getronics",
        status: "active",
        stack: "Node/TypeScript (NestJS, Jest, ESLint)",
        token: "BBVINET_TOKEN",
        controllerVersion: (if $ctrl_cap != "?" then $ctrl_cap else ($ctrl.lastTag // $trigger.version // "?") end),
        agentVersion: (if $agent_cap != "?" then $agent_cap else ($agent.lastTag // "?") end),
        pipelineStatus: ($copilot.currentState.pipelineStatus // "idle"),
        repos: ["psc-sre-automacao-controller", "psc-sre-automacao-agent", "psc_releases_cap_sre-aut-controller", "psc_releases_cap_sre-aut-agent"]
      },
      {
        id: "ws-cit",
        company: "CIT",
        status: "setup",
        stack: "DevOps (K8s, Docker, Terraform, Helm, ArgoCD)",
        token: "CIT_TOKEN",
        controllerVersion: null,
        agentVersion: null,
        pipelineStatus: "not-configured",
        repos: []
      },
    ],

    recentWorkflows: $runs,
    openPRs: $prs,
    deployHistory: $deploys,

    lessonsLearned: {
      total: (($copilot.lessonsLearned | length) + ($codex.lessonsLearned | length)),
      copilot: ($copilot.lessonsLearned | length),
      codex: ($codex.lessonsLearned | length),
      copilotLessons: [($copilot.lessonsLearned // [])[] | {lesson, fix, source}] | .[-30:],
      codexLessons: [($codex.lessonsLearned // [])[] | {lesson, fix, source}] | .[-30:]
    },

    versionRules: {
      currentController: ($claude_mem.versioningRules.currentVersion // $ctrl.lastTag // "?"),
      currentAgent: ($claude_mem.currentState.agentVersion // $agent.lastTag // "?"),
      pattern: "After X.Y.9 next is X.(Y+1).0 — NEVER X.Y.10",
      lastTriggerRun: ($claude_mem.deployFlow.lastTriggerRun // $trigger.run // 0),
      lastSuccessfulRun: ($claude_mem.deployFlow.lastSuccessfulRun // 0)
    },

    executionHistory: ($claude_mem.executionHistory.sessions // []) | [.[] | {id, date, summary}] | .[-10:],

    knownErrors: [
      {code: "403_push", desc: "Branch nao comeca com claude/copilot/codex/", fix: "Renomear branch"},
      {code: "trigger_not_firing", desc: "Campo run nao incrementado", fix: "Incrementar run +1"},
      {code: "duplicate_tag", desc: "Versao ja existe no registry", fix: "Incrementar patch"},
      {code: "eslint_no_use_before_define", desc: "Funcao usada antes de definir", fix: "Mover funcao para cima"},
      {code: "eslint_no_nested_ternary", desc: "Ternario aninhado", fix: "Usar if/else"},
      {code: "ts2769_jwt_sign", desc: "expiresIn tipo errado", fix: "parseExpiresIn() com cast"},
      {code: "swagger_garbled", desc: "Acentos no swagger", fix: "ASCII puro"},
      {code: "jwt_scope_plural", desc: "scopes (plural) no JWT", fix: "Usar scope (singular)"},
      {code: "search_replace_newlines", desc: "sed nao interpreta newlines", fix: "Usar replace-file"},
      {code: "ci_gate_broken", desc: "CI Gate pre-existing detection falso", fix: "Ler ci-logs-*.txt"},
      {code: "mock_tests_broken", desc: "validateTrustedUrl em fetch/postJson", fix: "Remover do fetch"},
      {code: "pr_dirty", desc: "Conflito com main", fix: "git pull --rebase origin main"}
    ],

    pipelineStages: [
      {name: "Setup", desc: "Read workspace config, resolve inputs"},
      {name: "Session Guard", desc: "Acquire multi-agent lock"},
      {name: "Apply & Push", desc: "Clone repo, apply patches, push"},
      {name: "CI Gate", desc: "Wait corporate CI (Esteira Build NPM)"},
      {name: "Promote", desc: "Update CAP values.yaml image tag"},
      {name: "Save State", desc: "Record on autopilot-state"},
      {name: "Audit", desc: "Audit trail + release lock"}
    ],

    corporateReal: {
      description: "REAL versions from corporate repos — source of truth. Other people may deploy independently.",
      controller: {
        sourceVersion: $ctrl_real,
        capTag: $ctrl_cap,
        recentCommits: $ctrl_commits,
        builds: $ctrl_builds,
        drift: (if $ctrl_real != "?" and ($ctrl.lastTag // "?") != "?" and $ctrl_real != ($ctrl.lastTag // "?") then true else false end),
        driftDetail: (if $ctrl_real != "?" and ($ctrl.lastTag // "?") != "?" and $ctrl_real != ($ctrl.lastTag // "?") then ("autopilot=" + ($ctrl.lastTag // "?") + " real=" + $ctrl_real) else null end)
      },
      agent: {
        sourceVersion: $agent_real,
        capTag: $agent_cap,
        recentCommits: $agent_commits,
        builds: $agent_builds,
        drift: (if $agent_real != "?" and ($agent.lastTag // "?") != "?" and $agent_real != ($agent.lastTag // "?") then true else false end),
        driftDetail: (if $agent_real != "?" and ($agent.lastTag // "?") != "?" and $agent_real != ($agent.lastTag // "?") then ("autopilot=" + ($agent.lastTag // "?") + " real=" + $agent_real) else null end)
      },
      lastChecked: now | strftime("%Y-%m-%dT%H:%M:%SZ")
    },

    corporateActivity: {
      description: "Real-time activity from corporate repos — branches, PRs, external commits by other devs",
      controller: {
        branches: $ctrl_branches,
        branchCount: ($ctrl_branches | length),
        featureBranches: [($ctrl_branches // [])[] | select(.name != "main" and .name != "master")],
        openPRs: $ctrl_prs,
        openPRCount: ($ctrl_prs | length),
        externalCommits: $ctrl_ext,
        externalCommitCount: ($ctrl_ext | length),
        hasExternalActivity: (($ctrl_ext | length) > 0 or ($ctrl_prs | length) > 0)
      },
      agent: {
        branches: $agent_branches,
        branchCount: ($agent_branches | length),
        featureBranches: [($agent_branches // [])[] | select(.name != "main" and .name != "master")],
        openPRs: $agent_prs,
        openPRCount: ($agent_prs | length),
        externalCommits: $agent_ext,
        externalCommitCount: ($agent_ext | length),
        hasExternalActivity: (($agent_ext | length) > 0 or ($agent_prs | length) > 0)
      }
    },

    improvements: ($improvements // {}),

    metadata: {
      autopilotRepo: "lucassfreiree/autopilot",
      sparkRepo: "lucassfreiree/spark-dashboard",
      totalAgents: 1,
      totalWorkspaces: 2,
      syncInterval: "5min business hours (8-17 BRT Mon-Fri) / 15min off-hours",
      stateVersion: 5
    }
  }' > /tmp/state.json 2>/dev/null

# Validate the generated JSON — if jq assembly failed, create minimal state
if ! jq empty /tmp/state.json 2>/dev/null; then
  echo "::warning ::Full state assembly failed — producing minimal state"
  jq -n '{
    lastSync: now | strftime("%Y-%m-%dT%H:%M:%SZ"),
    syncSource: "autopilot/spark-sync-state.yml",
    error: "State assembly failed — data collection issue",
    controller: {version: "?", status: "unknown"},
    agent: {version: "?", status: "unknown"},
    metadata: {stateVersion: 5, degraded: true}
  }' > /tmp/state.json
fi

jq -r '.lastSync' /tmp/state.json 2>/dev/null || echo "unknown"
STATE_B64=$(base64 -w0 /tmp/state.json)
echo "state_b64=$STATE_B64" >> "$GITHUB_OUTPUT"
echo "state_ready=true" >> "$GITHUB_OUTPUT"

# ── panel/dashboard/state.json update REMOVED ──
# Branch protection blocks gh api PUT to main (403).
# Dashboard now fetches state.json directly from spark-dashboard repo
# (lucassfreiree/spark-dashboard/public/state.json) which IS updated
# successfully by the "Push state to Spark repo" step above.
echo "::notice ::Panel reads state from spark-dashboard repo (no local update needed)"
