import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

type RequestWithAgentCallbackJwt = Request & {
  agentCallbackJwt?: jwt.JwtPayload | string;
};

type JwtVerifyOptions = {
  issuer?: string;
  audience?: string;
  algorithms?: jwt.Algorithm[];
};

function getBearerToken(req: Request): string | null {
  const auth = String(req.headers.authorization || "");
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  return token || null;
}

function buildVerifyOptions(): JwtVerifyOptions {
  const issuer =
    String(process.env.JWT_CALLBACK_ISSUER || "").trim() ||
    "psc-sre-automacao-agent";
  const audience =
    String(process.env.JWT_CALLBACK_AUDIENCE || "").trim() ||
    "psc-sre-automacao-controller";

  const algRaw = String(process.env.JWT_ALGORITHMS || "HS256").trim();
  const algorithms = algRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as jwt.Algorithm[];

  return {
    issuer,
    audience,
    algorithms,
  };
}

function getJwtKey(): string {
  const publicKey = String(process.env.JWT_PUBLIC_KEY || "").trim();
  if (publicKey) return publicKey;
  const secret = String(process.env.JWT_SECRET || "").trim();
  if (!secret) throw new Error("Missing JWT_SECRET or JWT_PUBLIC_KEY");
  return secret;
}

function isObjectPayload(decoded: unknown): decoded is jwt.JwtPayload {
  return (
    typeof decoded === "object" && decoded !== null && !Array.isArray(decoded)
  );
}

function getMaxCallbackTtlSeconds(): number {
  const raw = String(process.env.JWT_CALLBACK_MAX_TTL_SECONDS || "300").trim();
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 300;
}

function readBodyExecId(req: Request): string {
  const body = req.body as unknown;
  if (!body || typeof body !== "object" || Array.isArray(body)) return "";
  const rec = body as Record<string, unknown>;
  return String(rec.execId || "").trim();
}

function readBodyAgentId(req: Request): string {
  const header = String(req.header("x-agent-id") || "").trim();
  if (header) return header;

  const body = req.body as unknown;
  if (!body || typeof body !== "object" || Array.isArray(body)) return "";
  const rec = body as Record<string, unknown>;
  return String(rec.agentId || "").trim();
}

export function requireAgentCallbackJwt(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const key = getJwtKey();
    const options = buildVerifyOptions();
    const decoded = jwt.verify(token, key, options as jwt.VerifyOptions);

    if (!isObjectPayload(decoded)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const typ = String(decoded.typ || "").trim();
    if (typ !== "agent-callback") {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const execId = String(
      (decoded as Record<string, unknown>).execId || "",
    ).trim();
    if (!execId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const iat = typeof decoded.iat === "number" ? decoded.iat : NaN;
    const exp = typeof decoded.exp === "number" ? decoded.exp : NaN;
    if (!Number.isFinite(iat) || !Number.isFinite(exp)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const ttlSeconds = exp - iat;
    if (ttlSeconds > getMaxCallbackTtlSeconds()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const bodyExecId = readBodyExecId(req);
    if (bodyExecId && bodyExecId !== execId) {
      return res.status(403).json({ error: "Token execId mismatch" });
    }

    const tokenAgentId = String(
      (decoded as Record<string, unknown>).agentId || "",
    ).trim();
    const bodyAgentId = readBodyAgentId(req);
    if (tokenAgentId && bodyAgentId && tokenAgentId !== bodyAgentId) {
      return res.status(403).json({ error: "Token agentId mismatch" });
    }

    (req as RequestWithAgentCallbackJwt).agentCallbackJwt = decoded;
    return next();
  } catch (_e) {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

export function requireAgentRegisterCallbackJwt(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const key = getJwtKey();
    const options = buildVerifyOptions();
    const decoded = jwt.verify(token, key, options as jwt.VerifyOptions);

    if (!isObjectPayload(decoded)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const typ = String(decoded.typ || "").trim();
    if (typ !== "agent-callback") {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const iat = typeof decoded.iat === "number" ? decoded.iat : NaN;
    const exp = typeof decoded.exp === "number" ? decoded.exp : NaN;
    if (!Number.isFinite(iat) || !Number.isFinite(exp)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const ttlSeconds = exp - iat;
    if (ttlSeconds > getMaxCallbackTtlSeconds()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const tokenAgentId = String(
      (decoded as Record<string, unknown>).agentId || "",
    ).trim();
    const bodyAgentId = readBodyAgentId(req);
    if (tokenAgentId && bodyAgentId && tokenAgentId !== bodyAgentId) {
      return res.status(403).json({ error: "Token agentId mismatch" });
    }

    (req as RequestWithAgentCallbackJwt).agentCallbackJwt = decoded;
    return next();
  } catch (_e) {
    return res.status(401).json({ error: "Unauthorized" });
  }
}
