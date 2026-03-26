import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import {
  initExecution,
  getExecutionSnapshot,
  pushAgentExecutionLogs,
  type AnyLogEntry,
} from "./agents-execute-logs.controller";
import { timestampSP } from "../util/time";

// ── Types ──────────────────────────────────────────────────────

type JsonRecord = Record<string, unknown>;

type CronjobComplianceStatus = "success" | "failed" | "error";

interface CronjobResultBase {
  compliance_status: CronjobComplianceStatus;
  namespace: string;
  cluster_type: string;
  timestamp: string;
  execId: string;
}

interface CronjobResultSuccess extends CronjobResultBase {
  compliance_status: "success";
  captured_data: JsonRecord;
}

interface CronjobResultFailed extends CronjobResultBase {
  compliance_status: "failed";
  failures: JsonRecord[];
}

interface CronjobResultError extends CronjobResultBase {
  compliance_status: "error";
  errors: JsonRecord[];
}

type CronjobResult =
  | CronjobResultSuccess
  | CronjobResultFailed
  | CronjobResultError;

type ValidationResult =
  | { ok: true; result: CronjobResult }
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

const VALID_COMPLIANCE_STATUSES: CronjobComplianceStatus[] = [
  "success",
  "failed",
  "error",
];

// ── Validation ─────────────────────────────────────────────────

function validateCronjobResult(body: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isRecord(body)) {
    return { ok: false, errors: ["Request body must be a JSON object."] };
  }

  const complianceStatus = safeString(body.compliance_status).toLowerCase();
  if (
    !complianceStatus ||
    !VALID_COMPLIANCE_STATUSES.includes(
      complianceStatus as CronjobComplianceStatus,
    )
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
    result: {
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
    } as CronjobResult,
  };
}

// ── Adapter: compliance_status → execution log entries ─────────

function mapComplianceStatusToExecStatus(
  status: CronjobComplianceStatus,
): "DONE" | "ERROR" {
  if (status === "success") return "DONE";
  return "ERROR";
}

function adaptCronjobResultToLogEntries(
  result: CronjobResult,
): AnyLogEntry[] {
  const ts = result.timestamp || timestampSP();
  const execStatus = mapComplianceStatusToExecStatus(result.compliance_status);

  const baseEntry: AnyLogEntry = {
    ts,
    execId: result.execId,
    source: "cronjob-callback",
    from: "agent",
    level: result.compliance_status === "success" ? "INFO" : "ERROR",
    status: execStatus,
    execStatus,
    message: `Cronjob result: compliance_status=${result.compliance_status} namespace=${result.namespace} cluster_type=${result.cluster_type}`,
    data: {
      compliance_status: result.compliance_status,
      namespace: result.namespace,
      cluster_type: result.cluster_type,
    },
  };

  if (result.compliance_status === "success") {
    return [
      {
        ...baseEntry,
        data: {
          ...(baseEntry.data as JsonRecord),
          captured_data: result.captured_data,
        },
      },
    ];
  }

  if (result.compliance_status === "failed") {
    return [
      {
        ...baseEntry,
        data: {
          ...(baseEntry.data as JsonRecord),
          failures: result.failures,
        },
      },
    ];
  }

  // error
  return [
    {
      ...baseEntry,
      data: {
        ...(baseEntry.data as JsonRecord),
        errors: result.errors,
      },
    },
  ];
}

// ── Cronjob result index (namespace + execId) ──────────────────

const cronjobIndex = new Map<string, string>();

function indexKey(namespace: string, execId: string): string {
  return `${namespace}::${execId}`;
}

function indexCronjobResult(namespace: string, execId: string): void {
  cronjobIndex.set(indexKey(namespace, execId), execId);
  cronjobIndex.set(execId, execId);
}

// ── Handlers ───────────────────────────────────────────────────

/**
 * POST /api/cronjob/result
 *
 * Receives the final cronjob execution result from the Agent,
 * adapts the compliance_status payload to the existing execution log
 * format, stores it using the execution snapshot infrastructure,
 * and indexes by namespace + execId.
 */
export async function receiveCronjobResult(
  req: ExpressRequest,
  res: ExpressResponse,
): Promise<void> {
  const validation = validateCronjobResult(req.body);

  if (!validation.ok) {
    res.status(400).json({
      ok: false,
      error: "Invalid cronjob result payload",
      details: validation.errors,
    });
    return;
  }

  const { result } = validation;
  const { execId, namespace } = result;

  try {
    // Ensure execution state exists
    initExecution(execId);

    // Adapt compliance_status → execution log entries
    const entries = adaptCronjobResultToLogEntries(result);

    // Push using existing pushAgentExecutionLogs infrastructure
    // by building a synthetic request
    const syntheticReq = {
      body: {
        execId,
        source: "cronjob-callback",
        from: "agent",
        entries,
      },
      query: {},
      header: () => undefined,
      agentCallbackJwt: {},
    } as unknown as ExpressRequest;

    const captured: { statusCode: number; body: unknown } = {
      statusCode: 202,
      body: null,
    };

    const syntheticRes = {
      status(code: number) {
        captured.statusCode = code;
        return this;
      },
      json(data: unknown) {
        captured.body = data;
        return this;
      },
    } as unknown as ExpressResponse;

    await pushAgentExecutionLogs(syntheticReq, syntheticRes);

    // Index by namespace + execId
    indexCronjobResult(namespace, execId);

    console.info(
      "[cronjob-result] stored execId=%s namespace=%s compliance_status=%s",
      sanitizeForOutput(execId),
      sanitizeForOutput(namespace),
      sanitizeForOutput(result.compliance_status),
    );

    res.status(200).json({
      ok: true,
      execId,
      namespace,
      compliance_status: result.compliance_status,
      indexed: true,
      statusEndpoint: `/api/cronjob/status/${encodeURIComponent(execId)}`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(
      "[cronjob-result] error execId=%s detail=%s",
      sanitizeForOutput(execId),
      sanitizeForOutput(msg),
    );

    res.status(500).json({
      ok: false,
      error: "Failed to store cronjob result",
      detail: sanitizeForOutput(msg),
    });
  }
}

/**
 * GET /api/cronjob/status/:execId
 *
 * Returns the stored cronjob execution result for a given execId.
 * Uses the existing execution snapshot infrastructure.
 */
export async function getCronjobStatus(
  req: ExpressRequest,
  res: ExpressResponse,
): Promise<void> {
  const execId = safeString(req.params.execId);

  if (!execId) {
    res.status(400).json({
      ok: false,
      error: "Parameter 'execId' is required.",
    });
    return;
  }

  try {
    const snapshot = await getExecutionSnapshot(execId);

    res.status(200).json({
      ok: true,
      execId: snapshot.execId,
      status: snapshot.status,
      statusLabel: snapshot.statusLabel,
      finished: snapshot.finished,
      lastUpdate: snapshot.lastUpdate,
      count: snapshot.count,
      entries: snapshot.entries,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(
      "[cronjob-status] error execId=%s detail=%s",
      sanitizeForOutput(execId),
      sanitizeForOutput(msg),
    );

    res.status(500).json({
      ok: false,
      error: "Failed to retrieve cronjob status",
      detail: sanitizeForOutput(msg),
    });
  }
}
