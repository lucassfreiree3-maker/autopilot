import type { NextFunction, Request, Response } from "express";
import { SCOPES } from "../auth/scopes";
import { requireJwt } from "./jwt";
import { requireScopes } from "./scopes";

export type OasOriginAuthDecision = {
  mode: "internal-origin" | "jwt";
  trustedInternalOrigin: boolean;
  namespace: string;
  serviceAccount: string;
  namespaceHeaderName: string;
  serviceAccountHeaderName: string;
};

type Locals = {
  requestId?: string;
  oasAuthDecision?: OasOriginAuthDecision;
};

type HeaderReadResult = {
  value: string;
  headerName: string;
};

function splitCandidates(raw: string): string[] {
  return raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function uniqueValues(values: string[]): string[] {
  const seen = new Set<string>();
  values.forEach((value) => {
    const normalizedValue = value.trim().toLowerCase();
    if (normalizedValue) seen.add(normalizedValue);
  });
  return Array.from(seen.values());
}

function requireEnv(name: string): string {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(
      `[oas-auth] Missing required environment variable: ${name}. ` +
        "This value must be provided via Kubernetes Secret.",
    );
  }
  return value;
}

function resolveHeaderCandidates(envName: string): string[] {
  const fromEnv = splitCandidates(requireEnv(envName));
  return uniqueValues(fromEnv);
}

function readBodyHeaders(req: Request): Record<string, string> {
  const body = req.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== "object") return {};
  const raw = body.headers;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const entries = Object.entries(raw as Record<string, unknown>);
  return entries.reduce<Record<string, string>>((acc, pair) => {
    const key = pair[0];
    const val = pair[1];
    if (typeof val === "string" && val.trim()) {
      acc[key.toLowerCase()] = val.trim();
    }
    return acc;
  }, {});
}

function firstHeaderValue(
  req: Request,
  candidates: string[],
): HeaderReadResult | null {
  const found = candidates
    .map((candidate) => ({
      value: String(req.header(candidate) || "").trim(),
      headerName: candidate,
    }))
    .find((item) => item.value !== "");

  if (found) return found;

  const bodyHeaders = readBodyHeaders(req);
  const fromBody = candidates
    .map((candidate) => ({
      value: bodyHeaders[candidate.toLowerCase()] || "",
      headerName: candidate,
    }))
    .find((item) => item.value !== "");

  return fromBody || null;
}

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

function trustedNamespace(): string {
  return requireEnv("OAS_TRUSTED_NAMESPACE");
}

function trustedServiceAccount(): string {
  return requireEnv("OAS_TRUSTED_SERVICE_ACCOUNT");
}

export function evaluateOasOriginAuth(req: Request): OasOriginAuthDecision {
  const namespaceHeaders = resolveHeaderCandidates(
    "OAS_ORIGIN_NAMESPACE_HEADERS",
  );
  const serviceAccountHeaders = resolveHeaderCandidates(
    "OAS_ORIGIN_SERVICE_ACCOUNT_HEADERS",
  );

  const namespaceRead = firstHeaderValue(req, namespaceHeaders);
  const serviceAccountRead = firstHeaderValue(req, serviceAccountHeaders);

  const namespace = namespaceRead?.value || "";
  const serviceAccount = serviceAccountRead?.value || "";

  const trusted =
    normalized(namespace) === normalized(trustedNamespace()) &&
    normalized(serviceAccount) === normalized(trustedServiceAccount());

  return {
    mode: trusted ? "internal-origin" : "jwt",
    trustedInternalOrigin: trusted,
    namespace,
    serviceAccount,
    namespaceHeaderName: namespaceRead?.headerName || "",
    serviceAccountHeaderName: serviceAccountRead?.headerName || "",
  };
}

export function requireOasOriginOrJwt(
  requiredScopes: string[] = [SCOPES.EXECUTE],
) {
  const scopeMiddleware = requireScopes(requiredScopes);

  return (req: Request, res: Response, next: NextFunction) => {
    const decision = evaluateOasOriginAuth(req);

    const locals = res.locals as Locals;
    locals.oasAuthDecision = decision;

    console.info(
      "[oas-auth] mode=%s trusted=%s namespace=%s serviceAccount=%s reqId=%s path=%s",
      decision.mode,
      String(decision.trustedInternalOrigin),
      decision.namespace || "-",
      decision.serviceAccount || "-",
      locals.requestId || "-",
      req.originalUrl || req.path,
    );

    if (decision.trustedInternalOrigin) {
      next();
      return;
    }

    requireJwt(req, res, () => {
      scopeMiddleware(req, res, next);
    });
  };
}
