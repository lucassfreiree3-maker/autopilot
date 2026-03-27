import type { NextFunction, Request, Response } from "express";
import type { JwtPayload } from "jsonwebtoken";
import { hasAllScopes, normalizeTokenScopes } from "../auth/scopes";

type RequestWithJwt = Request & { jwt?: JwtPayload | string };
type RequestWithAgentCallbackJwt = Request & {
  agentCallbackJwt?: JwtPayload | string;
};

type Locals = {
  requestId?: string;
};

function readScopeClaim(payload?: JwtPayload | string): string[] {
  if (!payload || typeof payload === "string") return [];
  return normalizeTokenScopes(payload.scope);
}

function readSub(payload?: JwtPayload | string): string {
  if (!payload || typeof payload === "string") return "";
  return String(payload.sub || "").trim();
}

function readRequestId(res: Response): string {
  const locals = res.locals as unknown;
  if (!locals || typeof locals !== "object" || Array.isArray(locals)) return "";
  return String((locals as Locals).requestId || "").trim();
}

function safeLogValue(value: unknown): string {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, 256);
}

function safeLogList(values: string[]): string[] {
  return values.map((item) => safeLogValue(item)).filter(Boolean);
}

function auditForbidden(params: {
  kind: "client" | "agent-callback";
  sub: string;
  scopes: string[];
  required: string[];
  method: string;
  path: string;
  requestId: string;
}) {
  const payload = {
    event: "authz_forbidden",
    kind: params.kind,
    sub: safeLogValue(params.sub),
    scopes: safeLogList(params.scopes),
    required: safeLogList(params.required),
    method: safeLogValue(params.method),
    path: safeLogValue(params.path),
    requestId: safeLogValue(params.requestId),
  };

  console.warn(JSON.stringify(payload));
}

export function requireScopes(required: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const payload = (req as RequestWithJwt).jwt;
    const scopes = readScopeClaim(payload);

    if (!hasAllScopes(scopes, required)) {
      auditForbidden({
        kind: "client",
        sub: readSub(payload),
        scopes,
        required,
        method: req.method,
        path: req.originalUrl || req.path,
        requestId: readRequestId(res),
      });

      res.status(403).json({ error: "Insufficient scope" });
      return;
    }

    next();
  };
}

export function requireAgentCallbackScopes(required: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const payload = (req as RequestWithAgentCallbackJwt).agentCallbackJwt;
    const scopes = readScopeClaim(payload);

    if (!hasAllScopes(scopes, required)) {
      auditForbidden({
        kind: "agent-callback",
        sub: readSub(payload),
        scopes,
        required,
        method: req.method,
        path: req.originalUrl || req.path,
        requestId: readRequestId(res),
      });

      res.status(403).json({ error: "Insufficient scope" });
      return;
    }

    next();
  };
}
