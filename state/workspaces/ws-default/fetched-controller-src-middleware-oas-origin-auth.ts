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

const DEFAULT_TRUSTED_NAMESPACE = "sgh-oaas-playbook-jobs";
const DEFAULT_TRUSTED_SERVICE_ACCOUNT = "default";

const DEFAULT_NAMESPACE_HEADER_CANDIDATES = [
  "x-techbb-namespace",
  "x-k8s-namespace",
  "x-origin-namespace",
  "x-namespace",
];

const DEFAULT_SERVICE_ACCOUNT_HEADER_CANDIDATES = [
  "x-techbb-service-account",
  "x-k8s-service-account",
  "x-origin-service-account",
  "x-service-account",
  "x-service-account-name",
];

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

function resolveHeaderCandidates(
  envName: string,
  defaults: string[],
): string[] {
  const fromEnv = splitCandidates(String(process.env[envName] || ""));
  return uniqueValues([...fromEnv, ...defaults]);
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

  if (!found) return null;

  return found;
}

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

function trustedNamespace(): string {
  const fromEnv = String(
    process.env.OAS_TRUSTED_NAMESPACE || process.env.TECHBB_TRUSTED_NAMESPACE,
  ).trim();
  return fromEnv || DEFAULT_TRUSTED_NAMESPACE;
}

function trustedServiceAccount(): string {
  const fromEnv = String(
    process.env.OAS_TRUSTED_SERVICE_ACCOUNT ||
      process.env.TECHBB_TRUSTED_SERVICE_ACCOUNT,
  ).trim();
  return fromEnv || DEFAULT_TRUSTED_SERVICE_ACCOUNT;
}

export function evaluateOasOriginAuth(req: Request): OasOriginAuthDecision {
  const namespaceHeaders = resolveHeaderCandidates(
    "OAS_ORIGIN_NAMESPACE_HEADERS",
    DEFAULT_NAMESPACE_HEADER_CANDIDATES,
  );
  const serviceAccountHeaders = resolveHeaderCandidates(
    "OAS_ORIGIN_SERVICE_ACCOUNT_HEADERS",
    DEFAULT_SERVICE_ACCOUNT_HEADER_CANDIDATES,
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
