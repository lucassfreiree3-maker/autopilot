import type { Request, Response } from "express";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import {
  initExecution,
  type ExecutionSnapshot,
  waitForFinalExecution,
} from "./agents-execute-logs.controller";
import type { OasOriginAuthDecision } from "../middleware/oas-origin-auth";
import { timestampSP } from "../util/time";
import { resolveTrustedRegisteredAgentExecuteUrlByCluster } from "../util/trusted-agent";
import { readSyncTimeoutMs } from "../util/sync-timeout";

type JsonRecord = Record<string, unknown>;

type Locals = {
  requestId?: string;
  oasAuthDecision?: OasOriginAuthDecision;
};

type DispatchPlan = {
  cluster: string;
};

type ResolvedDispatchPlan = DispatchPlan & {
  agentUrl: string;
};

type ValidationResult =
  | {
      ok: true;
      image: string;
      envs: JsonRecord;
      clustersNames: string[];
    }
  | {
      ok: false;
      errors: string[];
    };

type AgentCallResult = {
  cluster: string;
  status: number;
  ok: boolean;
};

type SyncResponseContext = {
  execId: string;
  image: string;
  clustersNames: string[];
  authMode: string;
  dispatches: AgentCallResult[];
  snapshot: ExecutionSnapshot;
};

type AllowedImage = {
  key: string;
  aliases: string[];
  functionName: string;
};

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
const DEFAULT_AGENT_CALL_TIMEOUT_MS = 30_000;

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeLogValue(value: unknown): string {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, 256);
}

function readAgentCallTimeoutMs(): number {
  const raw = Number(process.env.AGENT_CALL_TIMEOUT_MS || "");
  if (!Number.isFinite(raw) || raw < 1) {
    return DEFAULT_AGENT_CALL_TIMEOUT_MS;
  }

  return Math.floor(raw);
}

function parseSafeIdentifier(value: unknown): string {
  const normalized = safeString(value);
  if (!normalized || !SAFE_IDENTIFIER_PATTERN.test(normalized)) return "";
  return encodeURIComponent(normalized);
}

function normalizeMode(req: Request): "sync" | "async" {
  const raw =
    typeof req.query.mode === "string"
      ? req.query.mode.trim().toLowerCase()
      : "";
  return raw === "sync" ? "sync" : "async";
}

function normalizeImageKey(imageName: string): string {
  const withoutDigest = imageName.split("@")[0].trim();
  const lastPath = withoutDigest.split("/").pop() || withoutDigest;
  const withoutTag = lastPath.split(":")[0];
  return withoutTag.trim().toLowerCase();
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(
    new Set(values.map((item) => item.trim()).filter(Boolean)),
  );
}

function allowedImages(): AllowedImage[] {
  const defaultImageKey = "psc-sre-ns-migration-preflight";

  const configuredImageKey =
    safeString(process.env.OAS_PREFLIGHT_IMAGE_KEY) || defaultImageKey;
  const configuredImageAliases = String(
    process.env.OAS_PREFLIGHT_IMAGE_ALIASES || "",
  )
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return [
    {
      key: normalizeImageKey(configuredImageKey),
      aliases: uniqueStrings([configuredImageKey, ...configuredImageAliases]),
      functionName:
        safeString(process.env.OAS_PREFLIGHT_FUNCTION) ||
        safeString(process.env.OAS_PREFLIGHT_FUNCTION_ORIGEM) ||
        "sre_execute",
    },
  ];
}

function resolveAllowedImage(rawImageName: string): AllowedImage | null {
  const key = normalizeImageKey(rawImageName);
  return (
    allowedImages().find((image) => {
      if (image.key === key) return true;
      return image.aliases.some((alias) => normalizeImageKey(alias) === key);
    }) ?? null
  );
}

function parseClustersNames(
  value: unknown,
  errors: string[],
): string[] {
  let rawValues: unknown[] = [];

  if (Array.isArray(value)) {
    rawValues = value;
  } else {
    const asText = safeString(value);
    if (!asText) {
      errors.push(
        "Field 'CLUSTERS_NAMES' is required and must be an array of cluster names.",
      );
      return [];
    }

    if (asText.startsWith("[")) {
      try {
        const parsed = JSON.parse(asText) as unknown;
        if (Array.isArray(parsed)) {
          rawValues = parsed;
        } else {
          errors.push("Field 'CLUSTERS_NAMES' must be a JSON array.");
          return [];
        }
      } catch {
        errors.push("Field 'CLUSTERS_NAMES' must be a valid JSON array.");
        return [];
      }
    } else {
      rawValues = asText.split(",").map((item) => item.trim());
    }
  }

  const clusters = rawValues
    .map((item) => parseSafeIdentifier(item))
    .filter(Boolean);

  if (clusters.length < 1) {
    errors.push(
      "Field 'CLUSTERS_NAMES' must include at least one valid cluster name.",
    );
    return [];
  }

  if (clusters.length !== rawValues.length) {
    errors.push(
      "Field 'CLUSTERS_NAMES' contains invalid values. Allowed pattern: A-Z, a-z, 0-9, dot, underscore, hyphen.",
    );
    return [];
  }

  return uniqueStrings(clusters);
}

function cloneEnvs(value: unknown): JsonRecord | null {
  const record = asRecord(value);
  if (!record) return null;
  try {
    return JSON.parse(JSON.stringify(record)) as JsonRecord;
  } catch {
    return null;
  }
}

function validateSreControllerPayload(body: unknown): ValidationResult {
  const errors: string[] = [];

  const source = asRecord(body);
  if (!source) {
    return { ok: false, errors: ["Request body must be a JSON object."] };
  }

  // image
  const imageRaw = safeString(source["image"] ?? source["IMAGE"]);
  if (!imageRaw) {
    errors.push("Field 'image' is required.");
    return { ok: false, errors };
  }

  const allowedImage = resolveAllowedImage(imageRaw);
  if (!allowedImage) {
    const allowed = allowedImages().map((img) => img.key);
    errors.push(
      `Image '${imageRaw}' is not allowed. Allowed images: ${allowed.join(", ")}.`,
    );
    return { ok: false, errors };
  }

  // envs — required object, passed as-is to the agent
  const envsRaw =
    source["envs"] ??
    source["ENVS"] ??
    source["variables"] ??
    source["vars"];
  const envs = cloneEnvs(envsRaw);
  if (!envs) {
    errors.push(
      "Field 'envs' is required and must be a JSON object with the environment variables for the image.",
    );
    return { ok: false, errors };
  }

  // CLUSTERS_NAMES
  const clustersNamesRaw =
    source["CLUSTERS_NAMES"] ??
    source["clusters_names"] ??
    source["clustersNames"];
  const clustersNames = parseClustersNames(clustersNamesRaw, errors);
  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    image: imageRaw,
    envs,
    clustersNames,
  };
}

function getIncomingAuthorization(req: Request): string | undefined {
  const auth = safeString(req.headers.authorization);
  return auth || undefined;
}

function parseExpiresIn(raw: string): jwt.SignOptions["expiresIn"] {
  const value = raw.trim();
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value);
  return value as jwt.SignOptions["expiresIn"];
}

function mintInternalOriginJwt(execId: string): string | undefined {
  const secret = safeString(process.env.JWT_SECRET);
  if (!secret) return undefined;

  const issuer =
    safeString(process.env.JWT_ISSUER) || "psc-sre-automacao-controller";
  const audience =
    safeString(process.env.JWT_AUDIENCE) || "psc-sre-automacao-agent";
  const expiresIn = parseExpiresIn(
    safeString(process.env.JWT_EXPIRES_IN) || "5m",
  );
  const algorithm = (safeString(process.env.JWT_SIGN_ALG) ||
    "HS256") as jwt.Algorithm;
  const subject =
    safeString(process.env.JWT_DEFAULT_SUBJECT) || "oas-internal-origin";
  const executeScope =
    safeString(process.env.SCOPE_EXECUTE_AUTOMATION) || "execute:automation";

  const token = jwt.sign(
    {
      execId,
      scope: [executeScope],
      origin: "internal-origin",
    },
    secret,
    {
      issuer,
      audience,
      subject,
      expiresIn,
      algorithm,
    },
  );

  return `Bearer ${token}`;
}

function getAgentAuthorization(
  req: Request,
  res: Response,
  execId: string,
): string | undefined {
  const incoming = getIncomingAuthorization(req);
  if (incoming) return incoming;

  const authDecision = readAuthDecision(res);
  if (authDecision?.trustedInternalOrigin) {
    const minted = mintInternalOriginJwt(execId);
    if (minted) {
      console.info(
        "[oas-sre-controller] minted JWT for internal-origin request execId=%s",
        safeLogValue(execId),
      );
      return minted;
    }
  }

  const fromEnv = safeString(process.env.AGENT_EXECUTE_AUTHORIZATION);
  return fromEnv || undefined;
}

async function callAgent(
  url: string,
  headers: Record<string, string>,
  payload: unknown,
): Promise<{ status: number; ok: boolean }> {
  const timeoutMs = readAgentCallTimeoutMs();
  const abort = new AbortController();
  const timeoutId = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: abort.signal,
    });

    return {
      status: resp.status,
      ok: resp.ok,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function readAuthDecision(res: Response): OasOriginAuthDecision | undefined {
  const locals = res.locals as Locals;
  return locals.oasAuthDecision;
}

function summarizeDispatches(dispatches: AgentCallResult[]) {
  return dispatches.map((item) => ({
    cluster: item.cluster,
    agentStatus: item.status,
  }));
}

function buildSyncResponsePayload(context: SyncResponseContext) {
  return {
    mode: "sync" as const,
    execId: context.execId,
    image: context.image,
    clustersNames: context.clustersNames,
    authMode: context.authMode,
    dispatches: summarizeDispatches(context.dispatches),
    statusEndpoint: `/agent/execute?uuid=${encodeURIComponent(context.execId)}`,
    status: context.snapshot.status,
    statusLabel: context.snapshot.statusLabel,
    finished: context.snapshot.finished,
    lastUpdate: context.snapshot.lastUpdate,
    count: context.snapshot.count,
    entries: context.snapshot.entries,
  };
}

export async function postOasSreController(
  req: Request,
  res: Response,
): Promise<void> {
  const mode = normalizeMode(req);
  const validation = validateSreControllerPayload(req.body);

  if (!validation.ok) {
    res.status(400).json({
      ok: false,
      error: "Invalid payload for /oas/sre-controller",
      details: validation.errors,
    });
    return;
  }

  const execId = crypto.randomUUID();
  initExecution(execId);

  const requestId = safeString(req.header("x-request-id")) || execId;
  const authDecision = readAuthDecision(res);
  const outboundAuthorization = getAgentAuthorization(req, res, execId);

  console.info(
    "[oas-sre-controller] start execId=%s image=%s clusters=%d authMode=%s",
    safeLogValue(execId),
    safeLogValue(validation.image),
    validation.clustersNames.length,
    safeLogValue(authDecision?.mode || "jwt"),
  );

  let dispatches: AgentCallResult[] = [];

  try {
    const resolvedPlans: Array<ResolvedDispatchPlan | null> =
      validation.clustersNames.map((cluster) => {
        const agentUrl =
          resolveTrustedRegisteredAgentExecuteUrlByCluster(cluster);
        return agentUrl ? { cluster, agentUrl } : null;
      });

    const missingTargets = validation.clustersNames.filter(
      (_, i) => resolvedPlans[i] === null,
    );

    if (missingTargets.length > 0) {
      res.status(404).json({
        ok: false,
        error: "Agent not registered for one or more cluster targets",
        missingTargets,
      });
      return;
    }

    const plans = resolvedPlans.filter(
      (p): p is ResolvedDispatchPlan => p !== null,
    );

    dispatches = await Promise.all(
      plans.map(async (plan) => {
        const headers: Record<string, string> = {
          "content-type": "application/json",
          "x-request-id": requestId,
          "x-exec-id": execId,
        };

        if (outboundAuthorization) {
          headers.authorization = outboundAuthorization;
        }

        const forwardBody = {
          execId,
          cluster: plan.cluster,
          image: validation.image,
          envs: validation.envs,
        };

        console.info(
          "[oas-sre-controller] dispatch execId=%s cluster=%s url=%s",
          safeLogValue(execId),
          safeLogValue(plan.cluster),
          safeLogValue(plan.agentUrl),
        );

        const agentResponse = await callAgent(
          plan.agentUrl,
          headers,
          forwardBody,
        );
        return {
          ...agentResponse,
          cluster: plan.cluster,
        };
      }),
    );

    const failedDispatch = dispatches.find((dispatch) => !dispatch.ok);
    if (failedDispatch) {
      console.error(
        "[oas-sre-controller] agent-error execId=%s cluster=%s status=%d",
        safeLogValue(execId),
        safeLogValue(failedDispatch.cluster),
        failedDispatch.status,
      );

      res.status(502).json({
        ok: false,
        error: "Failed to call Agent",
        execId,
        cluster: failedDispatch.cluster,
        agentStatus: failedDispatch.status,
        dispatches: dispatches.map((item) => ({
          cluster: item.cluster,
          agentStatus: item.status,
        })),
      });
      return;
    }

    console.info(
      "[oas-sre-controller] accepted execId=%s clusters=%d",
      safeLogValue(execId),
      dispatches.length,
    );

    if (mode === "sync") {
      const timeoutMs = readSyncTimeoutMs(process.env);
      const { timedOut, snapshot } = await waitForFinalExecution(
        execId,
        timeoutMs,
      );
      const syncPayload = buildSyncResponsePayload({
        execId,
        image: validation.image,
        clustersNames: validation.clustersNames,
        authMode: authDecision?.mode || "jwt",
        dispatches,
        snapshot,
      });

      if (timedOut) {
        res.status(504).json({
          ok: false,
          error: "TIMEOUT",
          message:
            "Timed out while waiting for execution to reach a final state (DONE or ERROR).",
          timeoutMs,
          ...syncPayload,
        });
        return;
      }

      if (snapshot.status === "ERROR") {
        res.status(502).json({
          ok: false,
          error: "EXECUTION_ERROR",
          message:
            "Execution finished with ERROR status reported by the Agent callback.",
          ...syncPayload,
        });
        return;
      }

      res.status(200).json({
        ok: true,
        ...syncPayload,
      });
      return;
    }

    res.status(202).json({
      ok: true,
      mode: "async",
      execId,
      status: "RUNNING",
      startedAt: timestampSP(),
      image: validation.image,
      clustersNames: validation.clustersNames,
      authMode: authDecision?.mode || "jwt",
      dispatches: summarizeDispatches(dispatches),
      statusEndpoint: `/agent/execute?uuid=${encodeURIComponent(execId)}`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const isAbort = error instanceof Error && error.name === "AbortError";

    if (isAbort) {
      const timeoutMs = readAgentCallTimeoutMs();
      console.error(
        "[oas-sre-controller] timeout execId=%s timeoutMs=%d",
        safeLogValue(execId),
        timeoutMs,
      );

      res.status(504).json({
        ok: false,
        error: "Timed out while waiting for Agent response",
        detail: `No response from Agent after ${timeoutMs}ms`,
        execId,
        dispatches: summarizeDispatches(dispatches),
      });
      return;
    }

    console.error(
      "[oas-sre-controller] exception execId=%s detail=%s",
      safeLogValue(execId),
      safeLogValue(msg),
    );

    res.status(500).json({
      ok: false,
      error: "Internal error while dispatching OAS automation",
      detail: msg,
      execId,
      dispatches,
    });
  }
}
