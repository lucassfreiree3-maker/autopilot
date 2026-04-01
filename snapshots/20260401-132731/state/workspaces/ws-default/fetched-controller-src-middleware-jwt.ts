import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

type RequestWithJwt = Request & { jwt?: jwt.JwtPayload | string };

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
  const issuer = String(process.env.JWT_ISSUER || "").trim() || undefined;
  const audience = String(process.env.JWT_AUDIENCE || "").trim() || undefined;

  const algRaw = String(process.env.JWT_ALGORITHMS || "HS256").trim();
  const algorithms = algRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as jwt.Algorithm[];

  return {
    issuer,
    audience,
    algorithms: algorithms.length ? algorithms : undefined,
  };
}

function getJwtKey(): string {
  const publicKey = String(process.env.JWT_PUBLIC_KEY || "").trim();
  if (publicKey) return publicKey;
  const secret = String(process.env.JWT_SECRET || "").trim();
  if (!secret) throw new Error("Missing JWT_SECRET or JWT_PUBLIC_KEY");
  return secret;
}

function isAgentCallbackToken(decoded: unknown): boolean {
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded))
    return false;
  const rec = decoded as Record<string, unknown>;
  return String(rec.typ || "").trim() === "agent-callback";
}

export function requireJwt(req: Request, res: Response, next: NextFunction) {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "Missing Bearer token" });

  try {
    const key = getJwtKey();
    const options = buildVerifyOptions();
    const decoded = jwt.verify(token, key, options as jwt.VerifyOptions);

    if (isAgentCallbackToken(decoded)) {
      return res.status(401).json({ error: "Invalid token" });
    }

    (req as RequestWithJwt).jwt = decoded;
    return next();
  } catch (_e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

export function getIncomingAuthorization(req: Request): string | undefined {
  const auth = String(req.headers.authorization || "").trim();
  return auth || undefined;
}
