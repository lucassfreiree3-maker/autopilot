# Persistent Layout

## Source of truth
- Home: `<SAFE_ROOT>`
- Manifest: `<SAFE_ROOT>\autopilot-manifest.json`
- Global AGENTS: `<USER_HOME>\.ops\AGENTS.md`

## Canonical repositories
- Controller: `repos\your-controller`
- Deploy cache: `cache\deploy-your-controller`

## Commands
- Prepare `main`: `prepare-controller-main.cmd`
- Run release cycle: `controller-release-autopilot.cmd`
- Save GitHub token: `set-workspace-github-token.cmd`
- Validate setup: `validate-autopilot.cmd`
- Repair discovery/config: `repair-autopilot.cmd`

## Release policy
- Always operate on `main`.
- First commit of a cycle bumps version.
- Same-cycle fixes keep the same version.
- Promotion target is fixed to `cloud/staging`.
- The full GitHub Actions run must be monitored until `completed`.
