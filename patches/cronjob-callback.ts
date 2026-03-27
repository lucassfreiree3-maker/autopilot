import { Router, type Request, type Response } from "express";
import { JWTService } from "../util/jwt";

// ── Types ──────────────────────────────────────────────────────

type JsonRecord = Record<string, unknown>;
type CronjobComplianceStatus = "success" | "failed" | "error";

interface CronjobCallbackPayload {
  compliance_status: CronjobComplianceStatus;
  namespace: string;
  cluster_type: string;
  timestamp: string;
  execId: string;
  captured_data?: JsonRecord;
  failures?: JsonRecord[];
  errors?: JsonRecord[];
}

type ValidationResult =
  | { ok: true; payload: CronjobCallbackPayload }
  | { ok: false; errors: string[] };

// ── Helpers ────────────────────────────────────────────────────

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function safeString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function sanitizeForOutput(value: unknown): string {
  return String(value ?? "")
    .replace(/[<>"'&]/g, "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, 256);
}

const VALID_STATUSES: CronjobComplianceStatus[] = [
  "success",
  "failed",
  "error",
];

// ── Validation ─────────────────────────────────────────────────

function validateCronjobCallback(body: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isRecord(body)) {
    return { ok: false, errors: ["Request body must be a JSON object."] };
  }

  const complianceStatus = safeString(body.compliance_status).toLowerCase();
  if (
    !complianceStatus ||
    !VALID_STATUSES.includes(complianceStatus as CronjobComplianceStatus)
  ) {
    errors.push(
      "Field 'compliance_status' is required. Allowed values: success, failed, error.",
    );
  }

  const namespace = safeString(body.namespace);
  if (!namespace) {
    errors.push("Field 'namespace' is required (non-empty string).");
  }

  const clusterType = safeString(body.cluster_type);
  if (!clusterType) {
    errors.push("Field 'cluster_type' is required (non-empty string).");
  }

  const timestamp = safeString(body.timestamp);
  if (!timestamp) {
    errors.push("Field 'timestamp' is required (ISO 8601 string).");
  }

  const execId = safeString(body.execId);
  if (!execId) {
    errors.push("Field 'execId' is required (non-empty string).");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const status = complianceStatus as CronjobComplianceStatus;

  if (status === "success") {
    if (!isRecord(body.captured_data)) {
      errors.push(
        "Field 'captured_data' is required when compliance_status is 'success' (must be a JSON object).",
      );
    }
  } else if (status === "failed") {
    if (!Array.isArray(body.failures) || body.failures.length < 1) {
      errors.push(
        "Field 'failures' is required when compliance_status is 'failed' (non-empty array).",
      );
    }
  } else if (status === "error") {
    if (!Array.isArray(body.errors) || body.errors.length < 1) {
      errors.push(
        "Field 'errors' is required when compliance_status is 'error' (non-empty array).",
      );
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    payload: {
      compliance_status: status,
      namespace,
      cluster_type: clusterType,
      timestamp,
      execId,
      ...(status === "success" && {
        captured_data: body.captured_data as JsonRecord,
      }),
      ...(status === "failed" && {
        failures: body.failures as JsonRecord[],
      }),
      ...(status === "error" && {
        errors: body.errors as JsonRecord[],
      }),
    },
  };
}

// ── Controller URL resolution ──────────────────────────────────

function resolveControllerCronjobResultUrl(): string {
  const baseUrl = safeString(process.env.CONTROLLER_BASE_URL);
  if (baseUrl) {
    return `${baseUrl.replace(/\/+$/, "")}/api/cronjob/result`;
  }

  const template = safeString(process.env.AGENT_BASE_URL_TEMPLATE);
  const cluster = safeString(process.env.CLUSTER_NAME);
  if (template && cluster) {
    const controllerBase = template
      .replace("{cluster}", cluster)
      .replace("sre-aut-agent", "sre-aut-controller");
    return `${controllerBase.replace(/\/+$/, "")}/api/cronjob/result`;
  }

  return "http://localhost:3000/api/cronjob/result";
}

const DEFAULT_FORWARD_TIMEOUT_MS = 30_000;

function readForwardTimeoutMs(): number {
  const raw = Number(process.env.CRONJOB_FORWARD_TIMEOUT_MS || "");
  if (!Number.isFinite(raw) || raw < 1) {
    return DEFAULT_FORWARD_TIMEOUT_MS;
  }
  return Math.floor(raw);
}

// ── Forward to Controller ──────────────────────────────────────

async function forwardToController(
  payload: CronjobCallbackPayload,
): Promise<{ ok: boolean; status: number; detail?: string }> {
  const url = resolveControllerCronjobResultUrl();
  const timeoutMs = readForwardTimeoutMs();
  const abort = new AbortController();
  const timeoutId = setTimeout(() => abort.abort(), timeoutMs);

  const token = JWTService.generateCallbackToken({
    execId: payload.execId,
    scope: ["send_logs"],
  });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: abort.signal,
    });

    if (response.ok) {
      return { ok: true, status: response.status };
    }

    const text = await response.text().catch(() => "");
    return {
      ok: false,
      status: response.status,
      detail: text.slice(0, 512),
    };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    let detail: string;
    if (isAbort) {
      detail = `Controller timeout after ${timeoutMs}ms`;
    } else if (error instanceof Error) {
      detail = error.message;
    } else {
      detail = String(error);
    }
    return { ok: false, status: 0, detail };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Route Class (Agent pattern) ────────────────────────────────

export default class CronjobCallbackAPI {
  constructor(router: Router, ..._args: unknown[]) {
    /**
     * POST /api/cronjob/callback
     *
     * Receives the final cronjob execution result, validates it,
     * and forwards to the Controller for storage and indexing.
     */
    router.post(
      "/api/cronjob/callback",
      async (req: Request, res: Response) => {
        const validation = validateCronjobCallback(req.body);

        if (!validation.ok) {
          res.status(400).json({
            ok: false,
            error: "Invalid cronjob callback payload",
            details: validation.errors,
          });
          return;
        }

        const { payload } = validation;

        console.info(
          "[cronjob-callback] received execId=%s namespace=%s compliance_status=%s",
          sanitizeForOutput(payload.execId),
          sanitizeForOutput(payload.namespace),
          sanitizeForOutput(payload.compliance_status),
        );

        try {
          const result = await forwardToController(payload);

          if (result.ok) {
            console.info(
              "[cronjob-callback] forwarded execId=%s status=%d",
              sanitizeForOutput(payload.execId),
              result.status,
            );

            res.status(200).json({
              ok: true,
              execId: payload.execId,
              namespace: payload.namespace,
              compliance_status: payload.compliance_status,
              forwarded: true,
              controllerStatus: result.status,
            });
            return;
          }

          console.error(
            "[cronjob-callback] forward failed execId=%s controllerStatus=%d detail=%s",
            sanitizeForOutput(payload.execId),
            result.status,
            sanitizeForOutput(result.detail),
          );

          res.status(502).json({
            ok: false,
            error: "Failed to forward cronjob result to Controller",
            execId: payload.execId,
            controllerStatus: result.status,
            detail: sanitizeForOutput(result.detail),
          });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error(
            "[cronjob-callback] error execId=%s detail=%s",
            sanitizeForOutput(payload.execId),
            sanitizeForOutput(msg),
          );

          res.status(500).json({
            ok: false,
            error: "Internal error processing cronjob callback",
            detail: sanitizeForOutput(msg),
          });
        }
      },
    );
  }
}
