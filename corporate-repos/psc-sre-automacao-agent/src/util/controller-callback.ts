const DEFAULT_CONTROLLER_HOST = "sre-automacao-controller.psc.hm.bb.com.br";
const DEFAULT_REGISTER_SCOPE = "REGISTER_AGENT";
const DEFAULT_SEND_LOGS_SCOPE = "SEND_LOGS";

function readEnv(
  env: NodeJS.ProcessEnv,
  ...names: string[]
): string {
  return (
    names
      .map((name) => String(env[name] || "").trim())
      .find((value) => Boolean(value)) || ""
  );
}

function normalizeBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, "");
  if (!normalized) return "";

  if (normalized.endsWith("/agent/register")) {
    return normalized.slice(0, -"/agent/register".length);
  }

  if (normalized.endsWith("/agent/execute/logs")) {
    return normalized.slice(0, -"/agent/execute/logs".length);
  }

  return normalized;
}

export function resolveControllerRegisterUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (
    readEnv(env, "CONTROLLER_REGISTER_URL", "CONTROLLER_REGISTER") ||
    `http://${DEFAULT_CONTROLLER_HOST}/agent/register`
  );
}

export function resolveControllerExecuteLogsUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const explicit = readEnv(
    env,
    "CONTROLLER_EXECUTE_LOGS_URL",
    "CONTROLLER_LOGS",
  );
  if (explicit) return explicit;

  const baseUrl = normalizeBaseUrl(
    readEnv(env, "CONTROLLER_REGISTER_URL", "CONTROLLER_REGISTER"),
  );
  if (baseUrl) {
    return `${baseUrl}/agent/execute/logs`;
  }

  return `http://${DEFAULT_CONTROLLER_HOST}/agent/execute/logs`;
}

export function resolveAgentRegisterScope(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (
    readEnv(env, "CONTROLLER_SCOPE_REGISTER_AGENT") || DEFAULT_REGISTER_SCOPE
  );
}

export function resolveAgentSendLogsScope(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return readEnv(env, "CONTROLLER_SCOPE_SEND_LOGS") || DEFAULT_SEND_LOGS_SCOPE;
}

export const CONTROLLER_CALLBACK_DEFAULTS = Object.freeze({
  registerScope: DEFAULT_REGISTER_SCOPE,
  sendLogsScope: DEFAULT_SEND_LOGS_SCOPE,
});
