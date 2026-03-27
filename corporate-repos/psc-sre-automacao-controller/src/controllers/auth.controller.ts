import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { validateRequestedScopes, type Scope } from "../auth/scopes";
import { getApiKey, resolveApiKeyAccess } from "../auth/api-key";
import {
  loadApiKeyScopesMap,
} from "../auth/apiKeyScopes";

type TokenRequestBody = {
  subject?: string;
  scope?: string | string[];
  scopes?: string | string[];
  expiresIn?: string;
};

const REQUIRED_SCOPES_HINT =
  "Use GET /auth/required-scopes with x-api-key to discover the current scope values for this environment.";

function getJwtSecretOrPrivateKey(): string {
  const privateKey = String(process.env.JWT_PRIVATE_KEY || "").trim();
  if (privateKey) return privateKey;

  const secret = String(process.env.JWT_SECRET || "").trim();
  if (!secret) throw new Error("Missing JWT_SECRET or JWT_PRIVATE_KEY");

  return secret;
}

function normalizeScope(scope?: unknown): string[] | undefined {
  if (scope === undefined || scope === null) return undefined;

  if (Array.isArray(scope)) {
    const cleaned = scope.map((s) => String(s).trim()).filter(Boolean);
    return cleaned.length ? cleaned : undefined;
  }

  const raw = String(scope).trim();
  if (!raw) return undefined;

  const parts = raw
    .split(/[ ,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return parts.length ? parts : undefined;
}

function getRequestedScopesFromBody(
  body: TokenRequestBody,
): { ok: true; scopes: string[] } | { ok: false; error: string } {
  const hasScope = Object.prototype.hasOwnProperty.call(body, "scope");
  const hasScopes = Object.prototype.hasOwnProperty.call(body, "scopes");

  if (hasScope && hasScopes) {
    return { ok: false, error: "Send only one: 'scope' or 'scopes'" };
  }

  let raw: unknown;

  if (hasScope) {
    raw = body.scope;
  } else if (hasScopes) {
    raw = body.scopes;
  } else {
    raw = undefined;
  }

  const normalized = normalizeScope(raw);

  if (!normalized || normalized.length === 0) {
    return { ok: false, error: "Missing or invalid scope(s)" };
  }

  return { ok: true, scopes: normalized };
}

function parseExpiresIn(raw: string): jwt.SignOptions["expiresIn"] {
  const value = raw.trim();
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value);
  return value as jwt.SignOptions["expiresIn"];
}

function buildSignOptions(body?: TokenRequestBody): jwt.SignOptions {
  const issuer = String(process.env.JWT_ISSUER || "").trim() || undefined;
  const audience = String(process.env.JWT_AUDIENCE || "").trim() || undefined;

  const expiresRaw =
    String(body?.expiresIn || "").trim() ||
    String(process.env.JWT_EXPIRES_IN || "5m").trim();

  const expiresIn = parseExpiresIn(expiresRaw);

  const alg = String(
    process.env.JWT_SIGN_ALG || "HS256",
  ).trim() as jwt.Algorithm;

  return {
    issuer,
    audience,
    expiresIn,
    algorithm: alg,
  };
}

function isSubsetOfAllowed(requested: Scope[], allowed: Scope[]): boolean {
  const allowedSet = new Set<string>(allowed);
  return requested.every((s) => allowedSet.has(s));
}

export function issueToken(req: Request, res: Response): void {
  const map = loadApiKeyScopesMap();
  const access = resolveApiKeyAccess(getApiKey(req), map);

  if (!access.ok) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  const allowedScopes = access.allowedScopes;

  const body =
    req.body && typeof req.body === "object"
      ? (req.body as TokenRequestBody)
      : ({} as TokenRequestBody);

  const subject = String(
    body.subject || process.env.JWT_DEFAULT_SUBJECT || "helmfire-ritmo-client",
  ).trim();

  const requested = getRequestedScopesFromBody(body);
  if (!requested.ok) {
    res.status(400).json({ error: requested.error });
    return;
  }

  const validation = validateRequestedScopes(requested.scopes);
  if (!validation.ok) {
    res.status(400).json({
      error: "Invalid scopes",
      hint: REQUIRED_SCOPES_HINT,
    });
    return;
  }

  if (!isSubsetOfAllowed(validation.scopes, allowedScopes)) {
    res.status(403).json({
      error: "Scopes not allowed for API key",
      hint: REQUIRED_SCOPES_HINT,
    });
    return;
  }

  const claims: Record<string, unknown> = {
    sub: subject,
    typ: "client",
    scope: validation.scopes,
  };

  try {
    const key = getJwtSecretOrPrivateKey();
    const options = buildSignOptions(body);
    const token = jwt.sign(claims, key, options);

    res.status(200).json({
      token,
      tokenType: "Bearer",
      expiresIn: String(options.expiresIn || "5m"),
      howToUse: "Authorization: Bearer <token>",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: "Unable to issue token", detail: msg });
  }
}
