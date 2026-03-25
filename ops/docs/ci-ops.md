# CI/CD Operations — GitLab CI & Jenkins

## Overview
Primary CI: GitHub Actions (active). GitLab CI and Jenkins: prepared for corporate pipelines.

## Key Files
- GitLab config: `ops/config/ci/gitlab/gitlab-config.json`
- Jenkins config: `ops/config/ci/jenkins/jenkins-config.json`
- Pipeline analyzer: `ops/scripts/ci/analyze-pipeline.sh`
- Runbook: `ops/runbooks/pipelines/pipeline-troubleshooting.json`
- Templates: `ops/templates/ci/`

## Pipeline Analysis
```bash
# GitHub Actions
ops/scripts/ci/analyze-pipeline.sh github owner/repo workflow.yml
ops/scripts/ci/analyze-pipeline.sh github owner/repo workflow.yml RUN_ID

# GitLab CI
ops/scripts/ci/analyze-pipeline.sh gitlab PROJECT_ID
ops/scripts/ci/analyze-pipeline.sh gitlab PROJECT_ID PIPELINE_ID

# Jenkins
ops/scripts/ci/analyze-pipeline.sh jenkins JOB_URL BUILD_NUMBER
```

## GitHub Actions Workflow
```
Workflow: ops-pipeline-diagnose.yml
Trigger: workflow_dispatch
Inputs: platform (github|gitlab|jenkins), target, identifier, run_id
```

## Cross-Platform Equivalence

| Concept | GitHub Actions | GitLab CI | Jenkins |
|---------|---------------|-----------|---------|
| Config file | `.github/workflows/*.yml` | `.gitlab-ci.yml` | `Jenkinsfile` |
| Secrets | Settings > Secrets | Settings > CI/CD > Variables | Manage Credentials |
| Runners | GitHub-hosted or self-hosted | Shared or specific runners | Agents/nodes |
| Stages | `jobs:` | `stages:` | `stages {}` |
| Artifacts | `actions/upload-artifact` | `artifacts:` | `archiveArtifacts` |
| Cache | `actions/cache` | `cache:` | Workspace-based |
| Manual gate | `environment:` with reviewers | `when: manual` | `input {}` |
| Concurrency | `concurrency:` group | Resource group | `disableConcurrentBuilds()` |

## What's Pending
- [ ] GitLab instance URL and tokens
- [ ] Jenkins instance URL and credentials
- [ ] Runner configuration details
- [ ] Pipeline project/job mappings
