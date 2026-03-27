import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { initExecution } from "./agents-execute-logs.controller";
import { timestampSP } from "../util/time";
import { resolveTrustedRegisteredAgentExecuteUrl } from "../util/trusted-agent";

type AgentForwardBody = {
  execId: string;
  cluster: string;
  namespace: string;
  function: string;
};

type FetchJsonResult =
  | { ok: true; status: number; json: unknown }
  | { ok: false; status: number; json: unknown }
  | { ok: false; status: number; text: string };

type LocalsExec = {
  execId: string;
  startedAt: number;
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

function normalizeMode(req: Request): "sync" | "async" {
  const raw =
    typeof req.query.mode === "string"
      ? req.query.mode.trim().toLowerCase()
      : "";
  return raw === "sync" ? "sync" : "async";
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

type ExecuteRequestBody = {
  cluster?: unknown;
  namespace?: unknown;
  function?: unknown;
};

function extractExecuteRequestBody(body: unknown): ExecuteRequestBody {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};

  const source = body as Record<string, unknown>;
  return {
    cluster: source.cluster,
    namespace: source.namespace,
    function: source.function,
  };
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<FetchJsonResult> {
  const timeoutMs = readAgentCallTimeoutMs();
  const abort = new AbortController();
  const timeoutId = setTimeout(() => abort.abort(), timeoutMs);
  let resp: globalThis.Response;

  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: abort.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  const ct = String(resp.headers.get("content-type") || "");
  if (ct.includes("application/json")) {
    const json = await resp.json().catch(() => null);
    if (resp.ok) return { ok: true, status: resp.status, json };
    return { ok: false, status: resp.status, json };
  }

  const text = await resp.text().catch(() => "");
  return { ok: false, status: resp.status, text };
}

function getIncomingAuthorization(req: Request): string | undefined {
  const auth = String(req.headers.authorization || "").trim();
  return auth || undefined;
}

function setLocals(res: Response, locals: LocalsExec): void {
  const obj = res.locals as unknown;
  if (typeof obj !== "object" || obj === null) {
    res.locals = locals as unknown as typeof res.locals;
    return;
  }
  const rec = obj as Record<string, unknown>;
  rec.execId = locals.execId;
  rec.startedAt = locals.startedAt;
}

export async function executeAgent(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const mode = normalizeMode(req);
    const body = extractExecuteRequestBody(req.body);
    const cluster = parseSafeIdentifier(body.cluster);
    const namespace = parseSafeIdentifier(body.namespace);
    const fn = parseSafeIdentifier(body.function);

    if (!cluster || !namespace || !fn) {
      res.status(400).json({
        ok: false,
        error:
          "Missing or invalid required fields: cluster, namespace, function",
      });
      return;
    }

    const execId = randomUUID();
    setLocals(res, { execId, startedAt: Date.now() });
    initExecution(execId);

    const reqId = safeString(req.header("x-request-id")) || execId;
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
      "x-request-id": reqId,
      "x-exec-id": execId,
    };

    const incomingAuth = getIncomingAuthorization(req);
    if (incomingAuth) headers.authorization = incomingAuth;

    const forwardBody: AgentForwardBody = {
      execId,
      cluster,
      namespace,
      function: fn,
    };

    const resp = await postJson(trustedAgentUrl, headers, forwardBody);

    if (!resp.ok) {
      res.status(502).json({
        ok: false,
        error: "Failed to call Agent",
        execId,
        agentStatus: resp.status,
      });
      return;
    }

    if (mode === "async") {
      res.status(202).json({
        ok: true,
        execId,
        mode: "async",
        status: "RUNNING",
        timestamp: timestampSP(),
        message:
          "Request accepted. The Agent will process this execution asynchronously.",
      });
      return;
    }

    next();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const isAbort = e instanceof Error && e.name === "AbortError";
    const execId = ((res.locals as Record<string, unknown>).execId as string) || undefined;
    if (isAbort) {
      const timeoutMs = readAgentCallTimeoutMs();
      res.status(504).json({
        ok: false,
        error: "Timed out while waiting for Agent response",
        detail: `No response from Agent after ${timeoutMs}ms`,
        execId,
      });
      return;
    }

    res.status(500).json({
      ok: false,
      error: "Internal error while dispatching execution",
      detail: sanitizeForOutput(msg),
      execId,
    });
  }
}
