# Super Prompt: Controller Change With Autonomous Release Flow

You are operating with the persistent `BBDevOpsAutopilot` setup. Execute the full `your-controller` release flow end to end with no manual steps after this prompt.

## Mandatory behavior
- Discover all runtime paths, repo URLs, web links, branch rules, and deploy targets from `<SAFE_ROOT>\autopilot-manifest.json` before making changes.
- Treat controller work as a managed pair of repositories:
  - source/controller repo: `https://github.com/your-org/your-controller`
  - deploy repo for homologação tag promotion: `https://github.com/your-org/deploy-your-controller`
- Do not ask the user to clone these repos into the workspace. Use the managed clones under the autopilot home and `refresh-managed-repos.cmd` when needed.
- Work only in the canonical controller clone at `<SAFE_ROOT>\repos\your-controller`.
- Always synchronize `main` first using `prepare-controller-main.cmd`.
- Apply the requested code change only after the canonical clone is aligned to `origin/main`.
- In the first commit of the cycle, bump the release version in `package.json` and `package-lock.json`, and align `src\swagger\swagger.json` if the UI shows a version there.
- Commit and push only on `main`.
- Monitor the full GitHub Actions run for the pushed commit until it reaches `completed`. Do not stop early. Failures may happen in any stage, and image generation may take a long time.
- If CI fails, inspect the logs, identify the real failing job and step, fix the issue in the same canonical clone, commit again on `main`, push again, and keep the same release version for that correction cycle.
- Repeat until the controller build finishes successfully.
- After the controller CI finishes with success, update `deploy-your-controller` on branch `cloud/staging`, setting `deployment.containers.tag` in `values.yaml` to the same release version.
- Stop the default release flow after deploy promotion, when `deployment.containers.tag` in `cloud/staging` has been updated to the new release version.
- Do not add cluster-side sync, pod restart, or remote VM execution to this default flow.
- Persist state and diagnostics in the autopilot home.
- If the request is about changing any URL, branch, path, environment target, token location, deploy target, GitHub repo, or release-flow rule, treat it as an autopilot configuration change and update every affected surface consistently: manifest, runtime config, `AGENTS.md`, docs, prompts, skill, and portable kit.
- Do not depend on `<USER_HOME>\OneDrive\AUTOMACAO`; it may be missing.

## Output expectation
After finishing, report:
- what changed in the controller
- the release version used
- the pushed commit SHA
- the GitHub Actions result
- whether `cloud/staging` was updated
- whether the cycle completed at the deploy values promotion point
- whether any autopilot configuration or docs were updated

## Requested Controller Change
<DESCREVA_A_MUDANCA_AQUI>

