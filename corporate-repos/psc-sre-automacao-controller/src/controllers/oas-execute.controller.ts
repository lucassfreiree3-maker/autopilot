import type { Request, Response } from "express";
import crypto from "node:crypto";
import { initExecution } from "./agents-execute-logs.controller";
import { timestampSP } from "../util/time";
import { resolveTrustedRegisteredAgentExecuteUrl } from "../util/trusted-agent";

type AgentForwardBody = {
  execId: string;
  cluster: string;
  namespace: string;
  function: string;
};

type AutomationMetadata = {
  name: string;
  description: string;
  parameters: Array<{
    name: string;
    type: string;
    required: boolean;
    description?: string;
  }>;
};

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
const DEFAULT_AGENT_CALL_TIMEOUT_MS = 30_000;

function sanitizeForOutput(value: unknown): string {
  return String(value ?? "")
    .replace(/[<>"'&]/g, "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, 256);
}

function parseSafeIdentifier(value: unknown): string {
  if (typeof value !== "string") return "";

  const trimmed = value.trim();
  if (!trimmed || !SAFE_IDENTIFIER_PATTERN.test(trimmed)) return "";

  return encodeURIComponent(trimmed);
}

function safeString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function readAgentCallTimeoutMs(): number {
  const raw = Number(process.env.AGENT_CALL_TIMEOUT_MS || "");
  if (!Number.isFinite(raw) || raw < 1) {
    return DEFAULT_AGENT_CALL_TIMEOUT_MS;
  }

  return Math.floor(raw);
}

type OasExecutionRequestBody = {
  cluster?: unknown;
  namespace?: unknown;
};

function extractOasExecutionRequestBody(body: unknown): OasExecutionRequestBody {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};

  const source = body as Record<string, unknown>;
  return {
    cluster: source.cluster,
    namespace: source.namespace,
  };
}

function safeLogValue(value: unknown): string {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, 256);
}

function getIncomingAuthorization(req: Request): string | undefined {
  const auth = String(req.headers.authorization || "").trim();
  return auth || undefined;
}

function getAvailableAutomations(): AutomationMetadata[] {
  return [
    {
      name: "get_pods",
      description: "Lista pods do namespace especificado",
      parameters: [
        {
          name: "cluster",
          type: "string",
          required: true,
          description: "Identificador do cluster Kubernetes",
        },
        {
          name: "namespace",
          type: "string",
          required: true,
          description: "Namespace a ser consultado",
        },
      ],
    },
    {
      name: "get_all_resources",
      description: "Lista todos os recursos do namespace",
      parameters: [
        {
          name: "cluster",
          type: "string",
          required: true,
          description: "Identificador do cluster Kubernetes",
        },
        {
          name: "namespace",
          type: "string",
          required: true,
          description: "Namespace a ser consultado",
        },
      ],
    },
  ];
}

export async function listOasAutomations(
  _req: Request,
  res: Response,
): Promise<void> {
  const automations = getAvailableAutomations();

  console.log(
    "[oas] GET /oas/automations - returning %d automations",
    automations.length,
  );

  res.status(200).json({
    ok: true,
    count: automations.length,
    automations,
  });
}

function normalizeAutomationName(name: string): string {
  return name.replace(/-/g, "_");
}

export async function getOasAutomation(
  req: Request,
  res: Response,
): Promise<void> {
  const rawAutomationName = safeString(req.params.automation);
  const automationName = normalizeAutomationName(
    parseSafeIdentifier(rawAutomationName),
  );

  if (!automationName) {
    res.status(400).json({
      ok: false,
      error: "Missing automation name in URL",
    });
    return;
  }

  const automations = getAvailableAutomations();
  const automation = automations.find((a) => a.name === automationName);

  if (!automation) {
    res.status(404).json({
      ok: false,
      error: "Automation not found",
      automation: automationName,
      available: automations.map((a) => a.name),
    });
    return;
  }

  console.log("[oas] GET /oas/automations/%s - found", automationName);

  res.status(200).json({
    ok: true,
    automation,
  });
}

export async function postOasAutomation(
  req: Request,
  res: Response,
): Promise<void> {
  const rawAutomationName = safeString(req.params.automation);
  const sanitizedAutomationName = parseSafeIdentifier(rawAutomationName);
  const normalizedName = normalizeAutomationName(sanitizedAutomationName);

  if (!sanitizedAutomationName) {
    res.status(400).json({
      ok: false,
      error: "Missing automation name in URL",
    });
    return;
  }

  const automations = getAvailableAutomations();
  const automation = automations.find((item) => item.name === normalizedName);

  if (!automation) {
    res.status(404).json({
      ok: false,
      error: "Automation not found",
      automation: normalizedName,
      available: automations.map((item) => item.name),
    });
    return;
  }

  const body = extractOasExecutionRequestBody(req.body);
  const cluster = parseSafeIdentifier(body.cluster);
  const namespace = parseSafeIdentifier(body.namespace);

  if (!cluster || !namespace) {
    res.status(400).json({
      ok: false,
      error: "Missing or invalid required fields: cluster, namespace",
    });
    return;
  }

  const execId = crypto.randomUUID();
  initExecution(execId);

  const reqId = safeString(req.header("x-request-id")) || execId;

  console.log(
    "[oas] POST /oas/automations/%s execId=%s cluster=%s namespace=%s",
    safeLogValue(sanitizedAutomationName),
    safeLogValue(execId),
    safeLogValue(cluster),
    safeLogValue(namespace),
  );

  try {
    const trustedAgentUrl = resolveTrustedRegisteredAgentExecuteUrl({
      cluster,
      namespace,
    });
    if (!trustedAgentUrl) {
      res.status(404).json({
        ok: false,
        error: "Agent not registered for given cluster/namespace",
      });
      return;
    }

    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-request-id": reqId,
      "x-exec-id": execId,
    };

    const incomingAuth = getIncomingAuthorization(req);
    if (incomingAuth) headers.authorization = incomingAuth;

    const forwardBody: AgentForwardBody = {
      execId,
      cluster,
      namespace,
      function: normalizedName,
    };

    console.log(
      "[oas] Calling Agent at %s for automation=%s execId=%s",
      safeLogValue(trustedAgentUrl),
      safeLogValue(normalizedName),
      safeLogValue(execId),
    );

    const timeoutMs = readAgentCallTimeoutMs();
    const abort = new AbortController();
    const timeoutId = setTimeout(() => abort.abort(), timeoutMs);
    let resp: Awaited<ReturnType<typeof fetch>>;
    try {
      resp = await fetch(trustedAgentUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(forwardBody),
        signal: abort.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!resp.ok) {
      console.error(
        "[oas] Agent returned error status=%d execId=%s",
        resp.status,
        safeLogValue(execId),
      );

      res.status(502).json({
        ok: false,
        error: "Failed to call Agent",
        execId,
        agentStatus: resp.status,
      });
      return;
    }

    console.log(
      "[oas] Agent accepted execution execId=%s automation=%s",
      safeLogValue(execId),
      safeLogValue(sanitizedAutomationName),
    );

    res.status(202).json({
      ok: true,
      execId,
      status: "RUNNING",
      automation: automation.name,
      timestamp: timestampSP(),
      cluster,
      namespace,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isAbort = err instanceof Error && err.name === "AbortError";

    if (isAbort) {
      const timeoutMs = readAgentCallTimeoutMs();
      console.error(
        "[oas] Agent timeout execId=%s timeoutMs=%d",
        safeLogValue(execId),
        timeoutMs,
      );

      res.status(504).json({
        ok: false,
        error: "Timed out while waiting for Agent response",
        detail: `No response from Agent after ${timeoutMs}ms`,
        execId,
      });
      return;
    }

    console.error(
      "[oas] Error dispatching execution execId=%s: %s",
      safeLogValue(execId),
      safeLogValue(msg),
    );

    res.status(500).json({
      ok: false,
      error: "Internal error while dispatching execution",
      detail: sanitizeForOutput(msg),
      execId,
    });
  }
}
