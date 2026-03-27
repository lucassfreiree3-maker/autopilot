import {
  CONTROLLER_CALLBACK_DEFAULTS,
  resolveAgentRegisterScope,
  resolveControllerRegisterUrl,
} from "./controller-callback";

export const AUTO_REGISTER_SCOPE =
  CONTROLLER_CALLBACK_DEFAULTS.registerScope;
export const AUTO_REGISTER_INITIAL_DELAY_MS = 2_000;
export const AUTO_REGISTER_INTERVAL_MS = 2 * 60 * 1000;
export const DEFAULT_AUTO_REGISTER_TIMEOUT_MS = 10_000;
const DEFAULT_CLUSTER_NAME = "k8shmlbb111b";
const DEFAULT_NAMESPACE = "psc-agent";
const DEFAULT_ENVIRONMENT = "hml";
const DEFAULT_CALLBACK_ISSUER = "psc-sre-automacao-agent";
const DEFAULT_CALLBACK_AUDIENCE = "psc-sre-automacao-controller";
const MAX_LOG_VALUE_LENGTH = 512;
const MAX_RESPONSE_DETAIL_LENGTH = 700;

export type AutoRegisterSettings = {
  controllerUrl: string;
  cluster: string;
  namespace: string;
  environment: string;
  agentId: string;
  callbackIssuer: string;
  callbackAudience: string;
  scope: string;
  initialDelayMs: number;
  intervalMs: number;
  timeoutMs: number;
};

type UnknownError = Error & {
  code?: string;
  cause?: {
    code?: string;
    message?: string;
  };
};

function readEnv(value: string | undefined, fallback: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || fallback;
}

function squeezeWhitespace(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

export function readAutoRegisterTimeoutMs(env: NodeJS.ProcessEnv): number {
  const raw = Number(env.AUTO_REGISTER_TIMEOUT_MS || "");
  if (!Number.isFinite(raw) || raw < 1) {
    return DEFAULT_AUTO_REGISTER_TIMEOUT_MS;
  }

  return Math.floor(raw);
}

export function sanitizeAutoRegisterLogValue(
  value: unknown,
  maxLength = MAX_LOG_VALUE_LENGTH,
): string {
  const normalized = squeezeWhitespace(String(value ?? ""));
  if (!normalized) return "-";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(1, maxLength - 3))}...`;
}

export function buildAutoRegisterSettings(
  env: NodeJS.ProcessEnv,
  options?: {
    initialDelayMs?: number;
    intervalMs?: number;
  },
): AutoRegisterSettings {
  return {
    controllerUrl: resolveControllerRegisterUrl(env),
    cluster: readEnv(env.CLUSTER_NAME, DEFAULT_CLUSTER_NAME),
    namespace: readEnv(env.NAMESPACE, DEFAULT_NAMESPACE),
    environment: readEnv(env.ENVIRONMENT, DEFAULT_ENVIRONMENT),
    agentId: readEnv(env.AGENT_ID, "-"),
    callbackIssuer: readEnv(
      env.JWT_CALLBACK_ISSUER,
      DEFAULT_CALLBACK_ISSUER,
    ),
    callbackAudience: readEnv(
      env.JWT_CALLBACK_AUDIENCE,
      DEFAULT_CALLBACK_AUDIENCE,
    ),
    scope: resolveAgentRegisterScope(env),
    initialDelayMs:
      options?.initialDelayMs ?? AUTO_REGISTER_INITIAL_DELAY_MS,
    intervalMs: options?.intervalMs ?? AUTO_REGISTER_INTERVAL_MS,
    timeoutMs: readAutoRegisterTimeoutMs(env),
  };
}

export function formatAutoRegisterTarget(
  settings: Pick<
    AutoRegisterSettings,
    "controllerUrl" | "cluster" | "namespace" | "environment" | "agentId"
  >,
): string {
  return [
    `controllerUrl=${sanitizeAutoRegisterLogValue(settings.controllerUrl, 240)}`,
    `cluster=${sanitizeAutoRegisterLogValue(settings.cluster, 128)}`,
    `namespace=${sanitizeAutoRegisterLogValue(settings.namespace, 128)}`,
    `environment=${sanitizeAutoRegisterLogValue(settings.environment, 64)}`,
    `agentId=${sanitizeAutoRegisterLogValue(settings.agentId, 128)}`,
  ].join(" ");
}

export function formatAutoRegisterSettings(
  settings: AutoRegisterSettings,
): string {
  return [
    formatAutoRegisterTarget(settings),
    `callbackIssuer=${sanitizeAutoRegisterLogValue(settings.callbackIssuer, 128)}`,
    `callbackAudience=${sanitizeAutoRegisterLogValue(settings.callbackAudience, 128)}`,
    `scope=${sanitizeAutoRegisterLogValue(settings.scope, 64)}`,
    `initialDelayMs=${settings.initialDelayMs}`,
    `intervalMs=${settings.intervalMs}`,
    `timeoutMs=${settings.timeoutMs}`,
  ].join(" ");
}

export async function readAutoRegisterResponseDetail(
  response: Response,
): Promise<string> {
  const contentType = sanitizeAutoRegisterLogValue(
    response.headers.get("content-type") || "",
    64,
  );

  let detail = "";

  if (contentType.includes("application/json")) {
    const parsed = await response.json().catch(() => null);
    if (parsed && typeof parsed === "object") {
      detail = JSON.stringify(parsed);
    }
  }

  if (!detail) {
    detail = await response.text().catch(() => "");
  }

  return sanitizeAutoRegisterLogValue(detail || "-", MAX_RESPONSE_DETAIL_LENGTH);
}

export function buildAutoRegisterHttpHint(status: number): string {
  switch (status) {
    case 400:
      return "payload-invalid";
    case 401:
      return "jwt-secret-issuer-audience-mismatch";
    case 403:
      return "scope-or-agentid-mismatch";
    case 404:
      return "controller-url-or-route-not-found";
    case 408:
      return "controller-timeout";
    case 429:
      return "controller-rate-limit";
    case 500:
      return "controller-internal-error";
    case 502:
    case 503:
    case 504:
      return "controller-ingress-or-upstream-unavailable";
    default:
      return "check-controller-response";
  }
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (
    error &&
    typeof error === "object" &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return String(error ?? "");
}

function readErrorCode(error: unknown): string {
  const typed = error as UnknownError | undefined;
  if (error instanceof Error && error.name === "AbortError") {
    return "ABORT_ERR";
  }

  const directCode = sanitizeAutoRegisterLogValue(typed?.code || "", 64);
  if (directCode !== "-") return directCode;

  const causeCode = sanitizeAutoRegisterLogValue(typed?.cause?.code || "", 64);
  if (causeCode !== "-") return causeCode;

  const message = readErrorMessage(error).toLowerCase();
  if (message.includes("aborted")) return "ABORT_ERR";
  if (message.includes("certificate")) return "TLS_ERROR";
  if (message.includes("fetch failed")) return "FETCH_FAILED";
  return "UNKNOWN";
}

function buildNetworkHint(code: string, message: string): string {
  const normalizedCode = code.toUpperCase();
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedCode === "ENOTFOUND" ||
    normalizedCode === "EAI_AGAIN" ||
    normalizedMessage.includes("enotfound")
  ) {
    return "controller-dns-or-host-unreachable";
  }

  if (
    normalizedCode === "ECONNREFUSED" ||
    normalizedMessage.includes("connection refused")
  ) {
    return "controller-connection-refused";
  }

  if (
    normalizedCode === "ETIMEDOUT" ||
    normalizedCode === "ABORT_ERR" ||
    normalizedCode === "UND_ERR_CONNECT_TIMEOUT" ||
    normalizedCode === "UND_ERR_HEADERS_TIMEOUT" ||
    normalizedMessage.includes("timed out") ||
    normalizedMessage.includes("aborted")
  ) {
    return "controller-timeout";
  }

  if (
    normalizedCode.includes("TLS") ||
    normalizedCode.includes("CERT") ||
    normalizedMessage.includes("certificate")
  ) {
    return "tls-validation-failure";
  }

  return "check-controller-connectivity";
}

export function describeAutoRegisterError(error: unknown): {
  code: string;
  message: string;
  hint: string;
} {
  const code = readErrorCode(error);
  const message = sanitizeAutoRegisterLogValue(
    readErrorMessage(error) ||
      (error as UnknownError | undefined)?.cause?.message ||
      "Unknown error",
    MAX_RESPONSE_DETAIL_LENGTH,
  );

  return {
    code,
    message,
    hint: buildNetworkHint(code, message),
  };
}

export function buildAutoRegisterFingerprint(input: {
  kind: "success" | "already-registered" | "http-error" | "network-error";
  status?: number;
  code?: string;
  detail?: string;
}): string {
  return [
    input.kind,
    String(input.status ?? "-"),
    sanitizeAutoRegisterLogValue(input.code || "-", 64),
    sanitizeAutoRegisterLogValue(input.detail || "-", 160),
  ].join("|");
}
