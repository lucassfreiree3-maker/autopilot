# Portability Guide

## Purpose
Make the autopilot easy to understand and rehydrate on another machine, another VS Code installation, or another AI session.

## Portable kit contents
- `portable-kit\manifest\autopilot-manifest.json`
- `portable-kit\docs\`
- `portable-kit\prompts\`
- `portable-kit\skill\`
- `portable-kit\scripts\`

## Portable install flow
1. Copy the full `portable-kit\` directory to the target machine.
2. Run `install-from-portable.ps1` from `portable-kit\scripts\` as the target user.
3. Save a valid GitHub token using `set-workspace-github-token.cmd` after the install.
4. Prefer the default `LocalMachine` protection scope so the local automation runtime can decrypt the token without an interactive login session.
5. Use `push-github-with-token.ps1` or the repo wrapper commands for non-interactive pushes.
6. Run `refresh-managed-repos.cmd` on the target machine.
7. Confirm the setup with `validate-autopilot.cmd`.

## Important limitations
- The token is intentionally not exported in the portable kit. It must be created again on the target machine.
- The encrypted token file is still machine-local. Recreate it after restore or migration instead of copying it between machines.
- The portable kit only covers the managed controller release flow through the deploy `values.yaml` tag update. Cluster credentials and remote execution tooling are intentionally outside the exported runtime.
