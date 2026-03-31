#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# scan-corporate-vulns.sh — Dynamic vulnerability scanner
# Queries corporate CI (Esteira de Build NPM) via BBVINET_TOKEN
# Parses XRay, Checkmarx, and Motor de Liberacao data from run logs
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

COMPONENT="${COMPONENT:-controller}"
VERSION="${VERSION:-unknown}"
CORP_REPO="${CORP_REPO:-}"
CI_RUN_ID="${CI_RUN_ID:-}"
BBVINET_TOKEN="${BBVINET_TOKEN:-}"
GH_TOKEN_VAL="${GH_TOKEN:-}"
OUTPUT_FILE="${OUTPUT_FILE:-/tmp/vuln-report.json}"

# ── Determine corporate repo ──
if [ -z "$CORP_REPO" ]; then
  if [ "$COMPONENT" = "controller" ]; then
    CORP_REPO="bbvinet/psc-sre-automacao-controller"
  else
    CORP_REPO="bbvinet/psc-sre-automacao-agent"
  fi
fi

echo "::notice ::Scanning $COMPONENT v$VERSION from $CORP_REPO"

# ── Find the latest CI run ──
find_ci_run() {
  if [ -n "$CI_RUN_ID" ]; then
    echo "$CI_RUN_ID"
    return
  fi

  if [ -z "$BBVINET_TOKEN" ]; then
    echo ""
    return
  fi

  # Try to find runs — get latest completed or in_progress
  local RUN_ID
  RUN_ID=$(GH_TOKEN="$BBVINET_TOKEN" gh api "repos/$CORP_REPO/actions/runs?per_page=5" \
    --jq '.workflow_runs | map(select(.conclusion == "success" or .status == "completed")) | .[0].id // ""' 2>/dev/null || echo "")

  if [ -z "$RUN_ID" ]; then
    # Fallback: get any recent run
    RUN_ID=$(GH_TOKEN="$BBVINET_TOKEN" gh api "repos/$CORP_REPO/actions/runs?per_page=3" \
      --jq '.workflow_runs[0].id // ""' 2>/dev/null || echo "")
  fi

  echo "$RUN_ID"
}

# ── Download and parse CI run logs ──
fetch_run_data() {
  local RUN_ID="$1"
  echo "::group::Fetching CI run $RUN_ID data"

  # Get run details
  GH_TOKEN="$BBVINET_TOKEN" gh api "repos/$CORP_REPO/actions/runs/$RUN_ID" \
    --jq '{id: .id, status: .status, conclusion: .conclusion, created_at: .created_at, head_sha: .head_sha, name: .name}' \
    2>/dev/null > /tmp/run-info.json || echo '{}' > /tmp/run-info.json

  cat /tmp/run-info.json
  echo ""

  # Get jobs for this run
  GH_TOKEN="$BBVINET_TOKEN" gh api "repos/$CORP_REPO/actions/runs/$RUN_ID/jobs?per_page=30" \
    2>/dev/null > /tmp/run-jobs.json || echo '{"jobs":[]}' > /tmp/run-jobs.json

  echo "Jobs found:"
  jq -r '.jobs[] | "  \(.name): \(.conclusion // .status)"' /tmp/run-jobs.json 2>/dev/null || true

  # Download logs archive (timeout 60s to avoid hanging)
  echo "Downloading logs archive..."
  timeout 60 bash -c "GH_TOKEN=\"$BBVINET_TOKEN\" gh api \"repos/$CORP_REPO/actions/runs/$RUN_ID/logs\" > /tmp/ci-logs.zip" 2>/dev/null || {
    echo "::warning ::Log download timed out or failed — will use autopilot-state logs"
    rm -f /tmp/ci-logs.zip
  }

  if [ -s /tmp/ci-logs.zip ]; then
    mkdir -p /tmp/ci-logs-extracted
    unzip -o -q /tmp/ci-logs.zip -d /tmp/ci-logs-extracted 2>/dev/null || {
      echo "::warning ::Failed to extract logs (not a valid ZIP or binary content)"
      rm -rf /tmp/ci-logs-extracted
    }
    if [ -d /tmp/ci-logs-extracted ]; then
      echo "Extracted $(find /tmp/ci-logs-extracted -type f | wc -l) log files"
    fi
  fi

  echo "::endgroup::"
}

# ── Parse XRay vulnerabilities from logs ──
parse_xray_vulns() {
  echo "::group::Parsing XRay vulnerability data"
  local VULNS="[]"

  # Search for CVE patterns in all log files
  local CVE_LINES=""
  if [ -d /tmp/ci-logs-extracted ]; then
    CVE_LINES=$(grep -rihE "CVE-[0-9]{4}-[0-9]+" /tmp/ci-logs-extracted/ 2>/dev/null || true)
  fi

  # Also check autopilot-state ci-logs
  local LATEST_LOG=""
  LATEST_LOG=$(gh api "repos/lucassfreiree/autopilot/contents/state/workspaces/ws-default?ref=autopilot-state" \
    --jq "[.[] | select(.name | test(\"ci-logs-${COMPONENT}-\"))] | sort_by(.name) | reverse | .[0].name // \"\"" 2>/dev/null || echo "")

  if [ -n "$LATEST_LOG" ]; then
    echo "Latest autopilot CI log: $LATEST_LOG"
    gh api "repos/lucassfreiree/autopilot/contents/state/workspaces/ws-default/$LATEST_LOG?ref=autopilot-state" \
      --jq '.content' 2>/dev/null | base64 -d 2>/dev/null > /tmp/autopilot-ci-log.txt || true

    if [ -s /tmp/autopilot-ci-log.txt ]; then
      local EXTRA_CVES
      EXTRA_CVES=$(grep -oE "CVE-[0-9]{4}-[0-9]+" /tmp/autopilot-ci-log.txt 2>/dev/null | sort -u || true)
      if [ -n "$EXTRA_CVES" ]; then
        CVE_LINES="$CVE_LINES
$EXTRA_CVES"
      fi
    fi
  fi

  # Extract unique CVE IDs
  local UNIQUE_CVES
  UNIQUE_CVES=$(echo "$CVE_LINES" | grep -oE "CVE-[0-9]{4}-[0-9]+" 2>/dev/null | sort -u || true)
  local CVE_COUNT
  CVE_COUNT=$(echo "$UNIQUE_CVES" | grep -c "CVE" 2>/dev/null || echo "0")
  echo "Found $CVE_COUNT unique CVEs in CI logs"

  # Parse npm package + version associations from logs (batch with jq, no loop)
  local NPM_VULNS="[]"
  if [ -d /tmp/ci-logs-extracted ]; then
    local NPM_RAW
    NPM_RAW=$(grep -rohE "npm://[a-zA-Z0-9@._-]+:[0-9.]+" /tmp/ci-logs-extracted/ 2>/dev/null | sort -u || true)
    if [ -n "$NPM_RAW" ]; then
      NPM_VULNS=$(echo "$NPM_RAW" | sed -E 's|npm://([^:]+):(.*)|{"package":"\1","version":"\2"}|' | jq -s 'unique_by(.package, .version)')
    fi
  fi

  # Parse rpm package + version associations (batch with jq, no loop)
  local RPM_VULNS="[]"
  if [ -d /tmp/ci-logs-extracted ]; then
    local RPM_RAW
    RPM_RAW=$(grep -rohE "rpm://[0-9]+:[a-zA-Z0-9._-]+:[0-9.]+" /tmp/ci-logs-extracted/ 2>/dev/null | sort -u || true)
    if [ -n "$RPM_RAW" ]; then
      RPM_VULNS=$(echo "$RPM_RAW" | sed -E 's|rpm://[0-9]+:([^:]+):([^+]+).*|{"package":"\1","version":"\2","type":"rpm"}|' | jq -s 'unique_by(.package, .version)')
    fi
  fi

  # ── Query GitHub Advisory DB for each CVE (max 20 to avoid timeouts) ──
  echo "::group::Querying GitHub Advisory Database"
  local ALL_VULNS="[]"

  # Limit to first 20 CVEs to avoid API rate limits / timeouts
  local CVES_TO_CHECK
  CVES_TO_CHECK=$(echo "$UNIQUE_CVES" | head -20)
  local CHECKED=0

  while IFS= read -r CVE; do
    [ -z "$CVE" ] && continue
    CHECKED=$((CHECKED + 1))
    echo "[$CHECKED] Checking $CVE..."

    local GHSA_ID="" SEVERITY="unknown" SUMMARY="" FIXED_VER="" AFFECTED_PKG=""

    # Try GitHub Advisory search by CVE (timeout 10s per query)
    local SEARCH_RESULT
    SEARCH_RESULT=$(timeout 10 gh api "advisories?cve_id=$CVE" 2>/dev/null || echo "[]")

    if [ "$SEARCH_RESULT" != "[]" ] && [ -n "$SEARCH_RESULT" ]; then
      GHSA_ID=$(echo "$SEARCH_RESULT" | jq -r '.[0].ghsa_id // ""' 2>/dev/null || echo "")
      SEVERITY=$(echo "$SEARCH_RESULT" | jq -r '.[0].severity // "unknown"' 2>/dev/null || echo "unknown")
      SUMMARY=$(echo "$SEARCH_RESULT" | jq -r '.[0].summary // ""' 2>/dev/null | head -c 200 || echo "")
      FIXED_VER=$(echo "$SEARCH_RESULT" | jq -r '.[0].vulnerabilities[0].patched_versions // ""' 2>/dev/null | head -c 50 || echo "")
      AFFECTED_PKG=$(echo "$SEARCH_RESULT" | jq -r '.[0].vulnerabilities[0].package.name // ""' 2>/dev/null || echo "")
    fi

    echo "  => $SEVERITY ${GHSA_ID:-(no GHSA)} ${SUMMARY:-(no summary)}"

    ALL_VULNS=$(echo "$ALL_VULNS" | jq \
      --arg cve "$CVE" \
      --arg ghsa "$GHSA_ID" \
      --arg sev "$SEVERITY" \
      --arg sum "$SUMMARY" \
      --arg fix "$FIXED_VER" \
      --arg pkg "$AFFECTED_PKG" \
      '. + [{"cve": $cve, "ghsa": $ghsa, "severity": $sev, "summary": $sum, "fixVersion": $fix, "package": $pkg}]')
  done <<< "$CVES_TO_CHECK"
  echo "::endgroup::"

  # ── Classify vulnerabilities ──
  local CRITICAL HIGH MEDIUM LOW
  CRITICAL=$(echo "$ALL_VULNS" | jq '[.[] | select(.severity == "critical")] | length')
  HIGH=$(echo "$ALL_VULNS" | jq '[.[] | select(.severity == "high")] | length')
  MEDIUM=$(echo "$ALL_VULNS" | jq '[.[] | select(.severity == "medium")] | length')
  LOW=$(echo "$ALL_VULNS" | jq '[.[] | select(.severity == "low" or .severity == "unknown")] | length')

  # ── Identify npm-fixable vulnerabilities ──
  local NPM_FIXABLE="[]"
  # Check corporate package.json for fixable deps
  if [ -f /tmp/corp-package.json ]; then
    NPM_FIXABLE=$(echo "$ALL_VULNS" | jq -c '[.[] | select(.fixVersion != "" and .fixVersion != null and .package != "")]')
  fi

  # Build the final report
  jq -n \
    --arg comp "$COMPONENT" \
    --arg ver "$VERSION" \
    --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg run_id "${CI_RUN_ID:-auto}" \
    --argjson vulns "$ALL_VULNS" \
    --argjson npm_vulns "$NPM_VULNS" \
    --argjson rpm_vulns "$RPM_VULNS" \
    --argjson fixable "$NPM_FIXABLE" \
    --argjson critical "$CRITICAL" \
    --argjson high "$HIGH" \
    --argjson medium "$MEDIUM" \
    --argjson low "$LOW" \
    --argjson total "$CVE_COUNT" \
    '{
      component: $comp,
      version: $ver,
      scannedAt: $ts,
      ciRunId: $run_id,
      summary: {total: $total, critical: $critical, high: $high, medium: $medium, low: $low, npmFixable: ($fixable | length)},
      vulnerabilities: $vulns,
      npmPackages: $npm_vulns,
      rpmPackages: $rpm_vulns,
      npmFixable: $fixable
    }' > "$OUTPUT_FILE"

  echo ""
  echo "=== VULNERABILITY REPORT ==="
  jq '.summary' "$OUTPUT_FILE"
  echo ""
  echo "Critical/High vulnerabilities:"
  jq -r '.vulnerabilities[] | select(.severity == "critical" or .severity == "high") | "  \(.severity | ascii_upcase): \(.cve) — \(.package) — \(.summary[:80])"' "$OUTPUT_FILE" 2>/dev/null || true
  echo "::endgroup::"

  # Output for GitHub Actions
  echo "has_critical=$([ "$CRITICAL" -gt 0 ] && echo true || echo false)" >> "${GITHUB_OUTPUT:-/dev/null}"
  echo "has_high=$([ "$HIGH" -gt 0 ] && echo true || echo false)" >> "${GITHUB_OUTPUT:-/dev/null}"
  echo "npm_fixable=$(echo "$NPM_FIXABLE" | jq 'length')" >> "${GITHUB_OUTPUT:-/dev/null}"
  echo "total_cves=$CVE_COUNT" >> "${GITHUB_OUTPUT:-/dev/null}"
}

# ── Fetch corporate package.json for dependency analysis ──
fetch_dependencies() {
  echo "::group::Fetching corporate dependencies"
  if [ -n "$BBVINET_TOKEN" ]; then
    GH_TOKEN="$BBVINET_TOKEN" gh api "repos/$CORP_REPO/contents/package.json" \
      --jq '.content' 2>/dev/null | base64 -d 2>/dev/null > /tmp/corp-package.json || true
    GH_TOKEN="$BBVINET_TOKEN" gh api "repos/$CORP_REPO/contents/package-lock.json" \
      --jq '.content' 2>/dev/null | base64 -d 2>/dev/null > /tmp/corp-package-lock.json || true

    if [ -f /tmp/corp-package.json ]; then
      echo "package.json fetched ($(wc -c < /tmp/corp-package.json) bytes)"
    fi
  fi
  echo "::endgroup::"
}

# ── Main execution ──
main() {
  if [ -z "$BBVINET_TOKEN" ]; then
    echo "::error ::BBVINET_TOKEN not available — cannot scan corporate CI"
    jq -n --arg comp "$COMPONENT" --arg ver "$VERSION" \
      '{component: $comp, version: $ver, error: "BBVINET_TOKEN not available", summary: {total: 0, critical: 0, high: 0}}' > "$OUTPUT_FILE"
    exit 0
  fi

  # Step 1: Find CI run
  local RUN_ID
  RUN_ID=$(find_ci_run)
  if [ -z "$RUN_ID" ]; then
    echo "::warning ::No CI run found — using autopilot-state logs only"
  else
    echo "::notice ::Using CI run: $RUN_ID"
    CI_RUN_ID="$RUN_ID"
    # Step 2: Fetch run data and logs
    fetch_run_data "$RUN_ID"
  fi

  # Step 3: Fetch dependencies
  fetch_dependencies

  # Step 4: Parse and analyze
  parse_xray_vulns

  echo ""
  echo "Report saved to: $OUTPUT_FILE"
  cat "$OUTPUT_FILE" | jq .
}

main "$@"
