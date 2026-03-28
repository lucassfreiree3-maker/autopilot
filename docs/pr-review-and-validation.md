# Intelligent PR Review & Validation System

## Overview
A comprehensive autonomous PR review and validation workflow that provides intelligent validation, conflict resolution, code quality checks, security scanning, and auto-approval for agent-created PRs.

## Purpose
Eliminates manual PR approval steps while maintaining code quality and security standards through automated intelligent review.

## Features

### 1. **Automatic Conflict Detection & Resolution**
- ✅ Detects merge conflicts automatically
- ✅ Attempts to resolve simple conflicts by updating branch with base
- ✅ Adds explanatory comments when manual resolution is required

### 2. **Code Quality Validation**
- ✅ JSON syntax validation for all `.json` files
- ✅ YAML syntax validation for all `.yml`/`.yaml` files
- ✅ ESLint checks for JavaScript/TypeScript files (when configured)
- ✅ TypeScript compiler checks (when `tsconfig.json` exists)
- ✅ Analyzes file changes and categorizes by type

### 3. **Security Scanning**
- ✅ Scans for exposed secrets (passwords, API keys, tokens, private keys)
- ✅ Checks for dependency vulnerabilities using `npm audit`
- ✅ Validates against common security patterns

### 4. **AI-Powered Change Analysis**
- ✅ Calculates complexity score (low/medium/high)
- ✅ Determines risk level based on files changed
- ✅ Identifies high-risk changes (patches, workflows, triggers)
- ✅ Generates detailed analysis reports

### 5. **Intelligent Auto-Approval**
Decision matrix for auto-approval:

| Condition | Auto-Approve? |
|-----------|:-------------:|
| No conflicts | ✅ |
| No secrets detected | ✅ |
| Low/medium risk level | ✅ |
| High-risk changes | ❌ (requires manual review) |
| Patch file modifications | ❌ (requires manual review) |
| Security vulnerabilities | ❌ (requires manual review) |

### 6. **Comprehensive Reporting**
- ✅ GitHub Step Summary with validation results
- ✅ PR review comments with approval/rejection reasons
- ✅ Detailed change analysis breakdown
- ✅ Next steps guidance

## Workflow Triggers

### Automatic Triggers
```yaml
pull_request_target:
  types: [opened, synchronize, reopened, ready_for_review]
```
Triggers automatically on:
- New PR creation
- PR updates (new commits)
- PR reopened
- Draft PR marked as ready for review

### Manual Trigger
```yaml
workflow_dispatch:
  inputs:
    pr_number: [PR number to review]
```

## Eligibility Criteria

The workflow only acts on PRs that meet ALL of these conditions:
1. **Agent Branch**: Branch must start with `copilot/`, `claude/`, or `codex/`
2. **Target Branch**: PR must target `main`
3. **Same Repository**: PR must be from the same repo (not a fork)
4. **Not Draft**: PR must not be in draft state

## Validation Stages

### Stage 1: Conflict Detection & Resolution
```
1. Check PR mergeable status
2. If conflicts detected:
   a. Attempt automatic resolution via branch update
   b. Add explanatory comment
3. If resolution fails:
   a. Mark as requiring manual intervention
   b. Provide conflict details
```

### Stage 2: Code Quality Validation
```
1. Checkout PR code
2. Analyze changed files
3. Run syntax validators:
   - JSON files → jq validation
   - YAML files → js-yaml validation
4. Run code quality tools (if applicable):
   - ESLint for JS/TS files
   - TypeScript compiler check
5. Generate file change analysis
```

### Stage 3: Security Scanning
```
1. Scan for secret patterns:
   - password/api_key/secret/token patterns
   - Private keys (RSA, etc.)
2. Check for dependency vulnerabilities:
   - npm audit (high severity+)
3. Flag security issues for review
```

### Stage 4: AI-Powered Change Analysis
```
1. Calculate complexity score:
   - Low: <10 files, <200 lines changed
   - Medium: 10-20 files, 200-500 lines
   - High: >20 files, >500 lines

2. Determine risk level:
   - Low: Documentation, config changes
   - Medium: Workflow changes, trigger files
   - High: Patch files, security-critical files

3. Assess manual review requirement
```

### Stage 5: Auto-Approval Decision
```
Decision Logic:
  IF has_conflicts → Reject
  IF secrets_found → Reject
  IF risk_level == high → Require manual review
  IF requires_manual_review → Reject
  ELSE → Approve
```

### Stage 6: Summary Report
```
1. Generate workflow summary
2. Add review comment to PR
3. Update PR status
4. Prepare for autonomous merge
```

## Integration with Merge Workflows

This workflow is designed to work seamlessly with existing merge automation:

```
┌─────────────────────────────────────────┐
│ pr-review-and-validation.yml            │
│ • Conflict resolution                   │
│ • Code quality checks                   │
│ • Security scanning                     │
│ • Auto-approval                         │
└──────────────┬──────────────────────────┘
               │ (approval granted)
               ↓
┌─────────────────────────────────────────┐
│ autonomous-merge-direct.yml              │
│ • Wait for checks to pass               │
│ • Direct squash merge                   │
│ • Branch cleanup                        │
└──────────────┬──────────────────────────┘
               │ (if direct merge fails)
               ↓
┌─────────────────────────────────────────┐
│ auto-merge-sweeper.yml                   │
│ • Runs every minute                     │
│ • Backup merge mechanism                │
│ • Sweeps all eligible PRs               │
└─────────────────────────────────────────┘
```

## Example Validation Report

```markdown
## 🤖 Intelligent PR Review & Validation

- **PR**: #123 — `copilot/fix-dashboard` → `main`
- **Eligible for review**: ✅ Yes

### Validation Results
- **Conflicts**: ✅ No
- **Auto-approval decision**: ✅ Approved

### 📊 Change Analysis
- **Complexity**: medium
- **Risk Level**: low
- **Files Changed**: 8
- **Lines Added**: +145
- **Lines Deleted**: -32

#### Change Categories
- Patch files: ❌
- Workflow files: ❌
- Trigger files: ✅

### ✅ Validation Results
✅ All validation checks passed
✅ No conflicts detected
✅ No security issues found
✅ Risk level acceptable

### Next Steps
- ✅ PR will be automatically merged by `autonomous-merge-direct.yml` when checks pass
- ✅ Backup: `auto-merge-sweeper.yml` runs every minute as fallback
```

## Configuration

### Permissions Required
```yaml
permissions:
  contents: write        # For conflict resolution
  pull-requests: write   # For approval and comments
  checks: write          # For status checks
  issues: write          # For creating issues if needed
```

### Secrets Required
- `GITHUB_TOKEN` (automatic) - For most operations
- `RELEASE_TOKEN` (optional) - For conflict resolution when branch protection is enabled

## Customization

### Adjusting Risk Thresholds
Edit the complexity calculation in the "Analyze code changes" step:

```javascript
// Current thresholds
if (totalChanges > 20 || additions + deletions > 500) {
  complexity = 'high';
} else if (totalChanges > 10 || additions + deletions > 200) {
  complexity = 'medium';
}
```

### Adding Custom Validators
Add new validation steps between Stage 2 and Stage 3:

```yaml
- name: Custom validation
  if: steps.checkout.conclusion == 'success'
  run: |
    # Your custom validation logic
```

### Modifying Auto-Approval Criteria
Edit the "Determine approval status" step to adjust approval logic.

## Monitoring & Debugging

### View Workflow Runs
```bash
gh run list --workflow=pr-review-and-validation.yml
```

### View Specific Run Details
```bash
gh run view <run_id> --log
```

### Manual Re-trigger
```bash
gh workflow run pr-review-and-validation.yml -f pr_number=<PR_NUMBER>
```

## Best Practices

1. **Monitor First Runs**: Watch the first few automated reviews to ensure criteria align with expectations
2. **Adjust Thresholds**: Customize complexity and risk thresholds based on your workflow
3. **Review High-Risk PRs**: Always manually review PRs flagged as high-risk
4. **Keep Validators Updated**: Regularly update ESLint, TypeScript, and other tools
5. **Security First**: Never auto-approve PRs with security concerns

## Troubleshooting

### Issue: Workflow not triggering
**Solution**: Check that:
- PR is from agent branch (`copilot/*`, `claude/*`, `codex/*`)
- PR targets `main` branch
- PR is not from a fork
- PR is not in draft state

### Issue: Conflict resolution failing
**Solution**:
- Ensure `RELEASE_TOKEN` is configured if branch protection is enabled
- Check that conflicts are not too complex for automatic resolution
- Review conflict details in PR comments

### Issue: False positive security alerts
**Solution**:
- Review the secret scanning patterns
- Add exclusions for known false positives
- Update pattern matching logic

## Future Enhancements

- [ ] Integration with external code review services (CodeClimate, SonarQube)
- [ ] Machine learning-based risk assessment
- [ ] Customizable approval rules per repository
- [ ] Integration with Slack/Teams for notifications
- [ ] Historical analysis of approval patterns

## Related Workflows

- `autonomous-merge-direct.yml` - Direct merge after approval
- `auto-merge-sweeper.yml` - Backup merger (runs every minute)
- `auto-pr-codex.yml` - Auto-creates PRs for Codex branches
- `ci-failure-analysis.yml` - Analyzes CI failures
- `continuous-improvement.yml` - Weekly self-analysis

## Support

For issues or questions:
1. Check workflow run logs: `gh run view <run_id> --log`
2. Review PR comments for detailed feedback
3. Create an issue in the repository with `[pr-review]` prefix
